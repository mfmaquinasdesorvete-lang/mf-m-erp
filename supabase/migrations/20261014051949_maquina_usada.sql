-- =====================================================================
-- Máquinas usadas e cadastro de quem compra máquina usada
--  * equipamentos.usada: a máquina vendida era usada/seminova (marcada à mão em Garantias, pela importação da base
--    da My Frost ou sozinha quando o produto vendido tem "usada", "seminova" ou "recondicionada" no nome);
--  * categoria de cadastro "Compra máquina usada" (compra_usada): o cliente ganha a etiqueta sozinho quando uma
--    máquina usada é registrada para ele; também pode ser marcada à mão no cadastro (quem procura usada);
--  * importar_legado_myfrost aceita o cliente do ERP já achado na tela (mesma pessoa/empresa pela lógica de unificar)
--    e a marcação de usada.
-- Somente acréscimos.
-- =====================================================================

alter table public.equipamentos add column if not exists usada boolean not null default false;

insert into public.tipos_contato (chave, nome, cor, ordem, sistema)
values ('compra_usada', 'Compra máquina usada', 'emerald', 4, true)
on conflict (chave) do nothing;

-- máquina usada registrada -> o cliente entra no cadastro de quem compra usada
create or replace function public.trg_equipamento_usada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.usada and (tg_op = 'INSERT' or not coalesce(old.usada, false)) then
    update clientes set tags = array(select distinct t from unnest(coalesce(tags, '{}') || array['compra_usada']) t order by t)
     where id = new.cliente_id and not ('compra_usada' = any (coalesce(tags, '{}')));
  end if;
  return null;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_equipamento_usada' and tgrelid = 'public.equipamentos'::regclass) then
    create trigger trg_equipamento_usada after insert or update of usada on public.equipamentos
      for each row execute function public.trg_equipamento_usada();
  end if;
end $$;

-- Ao aprovar um pedido, cada máquina vendida vira um equipamento com garantia e preventiva (agora marcando as usadas).
create or replace function public.registrar_equipamentos_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cfg public.configuracoes;
  v_item record;
  v_hoje date := current_date;
begin
  if new.status = 'aprovado' and old.status = 'orcamento' then
    select * into v_cfg from public.configuracoes where id = 1;
    for v_item in
      select i.*, p.garantia_meses,
             (coalesce(p.descricao, '') || ' ' || coalesce(i.descricao, '')) ~* '(usad[ao]|semi\s*-?\s*nov[ao]|seminov[ao]|recondicionad[ao])' as usada
        from public.pedido_itens i join public.produtos p on p.id = i.produto_id
       where i.pedido_id = new.id and p.tipo = 'maquina'
    loop
      -- uma linha por unidade vendida; o nº de série pode vir separado por "/" ou ","
      for n in 1..greatest(v_item.quantidade::int, 1) loop
        insert into public.equipamentos (cliente_id, produto_id, descricao, numero_serie, pedido_id, data_venda, garantia_ate, proxima_preventiva, usada)
        values (new.cliente_id, v_item.produto_id, v_item.descricao,
                nullif(trim(split_part(regexp_replace(coalesce(v_item.numero_serie, ''), '\s*[,/;]\s*', '|', 'g'), '|', n)), ''),
                new.id, v_hoje,
                v_hoje + make_interval(months => coalesce(v_item.garantia_meses, v_cfg.garantia_meses_padrao)),
                v_hoje + make_interval(months => v_cfg.preventiva_meses),
                v_item.usada);
      end loop;
    end loop;
  end if;
  return new;
end $$;

-- Importação da base da My Frost: + cliente_id (o mesmo cliente do ERP, achado na tela) e + usada nas máquinas
create or replace function public.importar_legado_myfrost(p_clientes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c jsonb; m jsonb; x jsonb; v_id uuid; v_doc text; v_tipo text; v_prod uuid; v_modelo text; v_arquivado boolean; v_novo boolean; v_rows int;
  l_maq int; l_comp int;
  n_novos int := 0; n_exist int := 0; n_arq int := 0; n_maq int := 0; n_comp int := 0; v_erros jsonb := '[]';
begin
  if not public.is_erp_admin() then raise exception 'só o administrador importa a base da My Frost'; end if;
  if jsonb_typeof(p_clientes) is distinct from 'array' or jsonb_array_length(p_clientes) > 500 then
    raise exception 'envie de 1 a 500 clientes por vez';
  end if;
  perform set_config('erp.acao_usuario', 'on', true);
  for c in select * from jsonb_array_elements(p_clientes) loop
    begin
      v_doc := nullif(regexp_replace(coalesce(c->>'cpf_cnpj', ''), '\D', '', 'g'), '');
      if v_doc is not null and length(v_doc) not in (11, 14) then v_doc := null; end if;
      v_tipo := case when c->>'tipo_pessoa' in ('PF', 'PJ') then c->>'tipo_pessoa' when length(v_doc) = 11 then 'PF' else 'PJ' end;
      v_id := null; v_arquivado := false; v_novo := false;
      -- o cliente do ERP achado na tela (mesmo nome com o mesmo telefone/e-mail…); unificado: vale o que ficou
      if coalesce(c->>'cliente_id', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        select coalesce(unificado_em, id) into v_id from clientes where id = (c->>'cliente_id')::uuid;
        if v_id is not null then select arquivado_em is not null into v_arquivado from clientes where id = v_id; end if;
      end if;
      if v_id is null then
        select id, arquivado_em is not null into v_id, v_arquivado from clientes where id_externo = 'myfrost:' || (c->>'ref') limit 1;
      end if;
      if v_id is null and v_doc is not null then
        select id, arquivado_em is not null into v_id, v_arquivado from clientes where cpf_cnpj = v_doc limit 1;
      end if;
      if v_id is null then
        if nullif(btrim(coalesce(c->>'nome', '')), '') is null then raise exception 'sem nome'; end if;
        insert into clientes (tipo_pessoa, nome, nome_fantasia, cpf_cnpj, inscricao_estadual, contribuinte_icms, email, telefone, whatsapp,
                              cep, logradouro, numero, complemento, bairro, municipio, uf, observacoes, tags, id_externo)
        values (v_tipo, left(btrim(c->>'nome'), 200), nullif(left(btrim(coalesce(c->>'fantasia', '')), 200), ''), v_doc,
                nullif(left(btrim(coalesce(c->>'ie', '')), 30), ''),
                case when v_tipo = 'PJ' and c->>'contribuinte' in ('1', '2') then (c->>'contribuinte')::int else 9 end,
                nullif(left(btrim(coalesce(c->>'email', '')), 200), ''), nullif(left(btrim(coalesce(c->>'telefone', '')), 40), ''),
                nullif(left(btrim(coalesce(c->>'celular', '')), 40), ''),
                nullif(left(regexp_replace(coalesce(c->>'cep', ''), '\D', '', 'g'), 8), ''),
                nullif(left(btrim(coalesce(c->>'logradouro', '')), 200), ''), nullif(left(btrim(coalesce(c->>'numero', '')), 20), ''),
                nullif(left(btrim(coalesce(c->>'complemento', '')), 100), ''), nullif(left(btrim(coalesce(c->>'bairro', '')), 100), ''),
                nullif(left(btrim(coalesce(c->>'municipio', '')), 100), ''), nullif(upper(left(btrim(coalesce(c->>'uf', '')), 2)), ''),
                nullif(left(coalesce(c->>'obs', ''), 2000), ''),
                array(select distinct t from jsonb_array_elements_text(coalesce(c->'tags', '[]')) t where btrim(t) <> '' order by t),
                'myfrost:' || (c->>'ref'))
        returning id into v_id;
        v_novo := true;
      else
        update clientes set tags = array(select distinct t from unnest(coalesce(tags, '{}') ||
                 array(select jsonb_array_elements_text(coalesce(c->'tags', '[]')))) t where btrim(t) <> '' order by t)
         where id = v_id;
      end if;

      l_maq := 0;
      for m in select * from jsonb_array_elements(coalesce(c->'maquinas', '[]')) loop
        v_modelo := regexp_replace(coalesce(m->>'modelo', ''), '[^A-Za-z0-9 ]', '', 'g');
        v_prod := null;
        if v_modelo <> '' then
          select id into v_prod from produtos
           where tipo = 'maquina' and descricao ~* ('^\s*my\s*frost\s+' || regexp_replace(btrim(v_modelo), '\s+', '\\s*', 'g') || '\M')
           order by ativo desc, created_at limit 1;
        end if;
        insert into equipamentos (cliente_id, produto_id, descricao, data_venda, observacoes, origem, origem_ref, usada)
        values (v_id, v_prod, left(coalesce(nullif(btrim(m->>'descricao'), ''), 'Máquina My Frost'), 200), (m->>'data')::date,
                left(m->>'obs', 1000), 'My Frost', m->>'ref', coalesce((m->>'usada')::boolean, false))
        on conflict (origem, origem_ref) where origem_ref is not null do nothing;
        get diagnostics v_rows = row_count;
        l_maq := l_maq + v_rows;
      end loop;

      l_comp := 0;
      for x in select * from jsonb_array_elements(coalesce(c->'compras', '[]')) loop
        insert into compras_legado (cliente_id, origem, ref, data, documento, descricao, quantidade)
        values (v_id, 'My Frost', x->>'ref', (x->>'data')::date, left(x->>'documento', 60), left(coalesce(x->>'descricao', ''), 300),
                coalesce((x->>'quantidade')::numeric, 1))
        on conflict (origem, ref) do nothing;
        get diagnostics v_rows = row_count;
        l_comp := l_comp + v_rows;
      end loop;

      -- os contadores só andam quando o cliente inteiro entrou
      if v_arquivado then n_arq := n_arq + 1; end if;
      if v_novo then n_novos := n_novos + 1; else n_exist := n_exist + 1; end if;
      n_maq := n_maq + l_maq;
      n_comp := n_comp + l_comp;
    exception when others then
      v_erros := v_erros || jsonb_build_object('cliente', left(coalesce(c->>'nome', c->>'ref'), 120), 'erro', left(sqlerrm, 200));
    end;
  end loop;
  return jsonb_build_object('novos', n_novos, 'existentes', n_exist, 'arquivados', n_arq, 'maquinas', n_maq, 'compras', n_comp, 'erros', v_erros);
end $$;
revoke execute on function public.importar_legado_myfrost(jsonb) from public, anon;
grant execute on function public.importar_legado_myfrost(jsonb) to authenticated;
