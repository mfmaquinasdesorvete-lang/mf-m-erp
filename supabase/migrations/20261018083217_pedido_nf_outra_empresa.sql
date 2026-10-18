-- Pedido faturado com a NF de outra empresa (ex.: a empresa ligada emitiu a nota porque a unidade não tinha como emitir
-- naquela hora): o pedido guarda quem emitiu, o nº, a data, a chave e o valor da nota, sai de "falta a nota" e fica
-- faturado ou entregue sem a MF emitir NF-e. A receita é de quem emitiu a nota: confirmar com o contador.
alter table public.pedidos
  add column if not exists nf_outra_empresa text check (nf_outra_empresa is null or length(btrim(nf_outra_empresa)) between 2 and 120),
  add column if not exists nf_outra_cnpj text check (nf_outra_cnpj is null or nf_outra_cnpj ~ '^[0-9]{14}$'),
  add column if not exists nf_outra_numero text check (nf_outra_numero is null or length(btrim(nf_outra_numero)) between 1 and 20),
  add column if not exists nf_outra_data date,
  add column if not exists nf_outra_chave text check (nf_outra_chave is null or nf_outra_chave ~ '^[0-9]{44}$'),
  add column if not exists nf_outra_valor numeric(14, 2) check (nf_outra_valor is null or nf_outra_valor >= 0),
  add column if not exists nf_outra_motivo text check (nf_outra_motivo is null or length(nf_outra_motivo) <= 300);
alter table public.pedidos drop constraint if exists pedidos_nf_outra_check;
alter table public.pedidos add constraint pedidos_nf_outra_check
  check (nf_outra_numero is null or (nf_outra_empresa is not null and nf_outra_data is not null));
comment on column public.pedidos.nf_outra_numero is 'NF da venda emitida por outra empresa (ex.: empresa ligada), com nf_outra_empresa, _cnpj, _data, _chave, _valor e _motivo; gravada por registrar_nf_outra_empresa';

/**
 * Registra no pedido a NF emitida por outra empresa (vendas ou financeiro). O pedido aprovado passa a faturado, ou a
 * entregue quando já chegou ao cliente; as máquinas do pedido entram na ficha do cliente com a garantia contada da data
 * da nota (se ainda não estavam lá); o registro fica nas ocorrências do pedido. Sem o nº da nota, tira o registro.
 */
create or replace function public.registrar_nf_outra_empresa(p_pedido uuid, p_dados jsonb, p_entregue boolean default true)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_p public.pedidos;
  v_cfg public.configuracoes;
  v_item record;
  v_num text := nullif(btrim(coalesce(p_dados->>'numero', '')), '');
  v_emp text := nullif(btrim(coalesce(p_dados->>'empresa', '')), '');
  v_cnpj text := nullif(regexp_replace(coalesce(p_dados->>'cnpj', ''), '\D', '', 'g'), '');
  v_chave text := nullif(regexp_replace(coalesce(p_dados->>'chave', ''), '\D', '', 'g'), '');
  v_data date := public.data_ou_nula(p_dados->>'data');
  v_valor numeric := nullif(btrim(coalesce(p_dados->>'valor', '')), '')::numeric;
  v_motivo text := nullif(btrim(coalesce(p_dados->>'motivo', '')), '');
  v_status text;
begin
  perform public.exigir_papel('vendas', 'financeiro');
  select * into v_p from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if v_p.status not in ('aprovado', 'faturado', 'entregue') then raise exception 'só dá para registrar a nota em pedido aprovado, faturado ou entregue'; end if;
  if exists (select 1 from public.notas_fiscais n where n.pedido_id = p_pedido and n.status = 'autorizada' and coalesce(n.ambiente, 'producao') <> 'homologacao') then
    raise exception 'o pedido já tem NF-e autorizada emitida pelo ERP';
  end if;

  if v_num is null then
    update public.pedidos set nf_outra_empresa = null, nf_outra_cnpj = null, nf_outra_numero = null, nf_outra_data = null,
           nf_outra_chave = null, nf_outra_valor = null, nf_outra_motivo = null
     where id = p_pedido;
    insert into public.pedido_ocorrencias (pedido_id, texto)
    values (p_pedido, 'NF de outra empresa retirada do pedido' || coalesce(': ' || v_motivo, ''));
    return v_p.status;
  end if;

  if v_emp is null or v_data is null then raise exception 'informe a empresa que emitiu e a data da nota'; end if;
  if v_cnpj is not null and length(v_cnpj) <> 14 then raise exception 'o CNPJ tem 14 números'; end if;
  if v_chave is not null and length(v_chave) <> 44 then raise exception 'a chave de acesso tem 44 números'; end if;
  if v_data > current_date then raise exception 'a data da nota não pode ser depois de hoje'; end if;
  if v_valor is not null and v_valor < 0 then raise exception 'valor da nota inválido'; end if;

  v_status := case when p_entregue then 'entregue' when v_p.status = 'aprovado' then 'faturado' else v_p.status end;
  update public.pedidos
     set nf_outra_empresa = v_emp, nf_outra_cnpj = v_cnpj, nf_outra_numero = v_num, nf_outra_data = v_data,
         nf_outra_chave = v_chave, nf_outra_valor = v_valor, nf_outra_motivo = v_motivo, status = v_status
   where id = p_pedido;

  -- as máquinas do pedido na ficha do cliente, com a garantia e a preventiva contadas da data da nota
  if not exists (select 1 from public.equipamentos where pedido_id = p_pedido) then
    select * into v_cfg from public.configuracoes where id = 1;
    for v_item in
      select i.*, pr.garantia_meses from public.pedido_itens i join public.produtos pr on pr.id = i.produto_id
       where i.pedido_id = p_pedido and pr.tipo = 'maquina'
    loop
      for n in 1..greatest(v_item.quantidade::int, 1) loop
        insert into public.equipamentos (cliente_id, produto_id, descricao, numero_serie, pedido_id, data_venda, garantia_ate, proxima_preventiva, unidade_id)
        values (v_p.cliente_id, v_item.produto_id, v_item.descricao,
                nullif(trim(split_part(regexp_replace(coalesce(v_item.numero_serie, ''), '\s*[,/;]\s*', '|', 'g'), '|', n)), ''),
                p_pedido, v_data,
                v_data + make_interval(months => coalesce(v_item.garantia_meses, v_cfg.garantia_meses_padrao)),
                v_data + make_interval(months => v_cfg.preventiva_meses), v_p.unidade_id);
      end loop;
    end loop;
  end if;

  insert into public.pedido_ocorrencias (pedido_id, texto)
  values (p_pedido, format('NF nº %s emitida por %s em %s registrada no pedido%s', v_num, v_emp, to_char(v_data, 'DD/MM/YYYY'),
                           coalesce(' — ' || v_motivo, '')));
  return v_status;
end $$;
revoke execute on function public.registrar_nf_outra_empresa(uuid, jsonb, boolean) from public, anon;
grant execute on function public.registrar_nf_outra_empresa(uuid, jsonb, boolean) to authenticated, service_role;
