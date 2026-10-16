-- =====================================================================
-- NF-e de transferência SC ↔ SP e a entrada dela no destino
--  * unidades.transf_cbenef: código de benefício fiscal (cBenef) da transferência. Vai quando o ICMS sai sem
--    destaque (CST 40, 41, 50…); a SEFAZ/SC rejeita esses CST sem o código. No CST 00 não vai.
--  * unidades.transf_ipi_base: base do IPI na transferência do que a unidade fabrica: 'custo' (padrão, como hoje)
--    ou 'preco_venda' (valor tributável mínimo do RIPI, art. 195, I). A escolha é do contador.
--  * nfe_recebidas.transferencia_id / cfop_entrada / icms_credito: a NF-e de transferência entra no livro de
--    entradas do destino ligada pela chave. Se a busca automática da SEFAZ trouxer a mesma nota, ela cai na mesma
--    linha (a chave é única) e o estoque não entra duas vezes.
--  * cfop_entrada_transferencia: CFOP de entrada pelo uso no destino (x152 comercializar, x151 industrializar).
--  * receber_transferencia_nfe: com a NF-e autorizada, dá entrada no estoque do destino e registra a nota no livro de
--    entradas do destino (CFOP de entrada e crédito do ICMS destacado).
--  * transferencia_da_chave: diz se uma chave é de NF-e de transferência do ERP (para a busca automática ligar).
-- Somente acréscimos: não muda a configuração atual das unidades nem a entrada automática das notas de fornecedor.
-- =====================================================================

alter table public.unidades add column if not exists transf_cbenef text;
alter table public.unidades add column if not exists transf_ipi_base text not null default 'custo';
do $$ begin
  alter table public.unidades add constraint unidades_transf_cbenef_valido
    check (transf_cbenef is null or transf_cbenef ~ '^[A-Z0-9]{8,10}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.unidades add constraint unidades_transf_ipi_base_valida
    check (transf_ipi_base in ('custo', 'preco_venda'));
exception when duplicate_object then null; end $$;
comment on column public.unidades.transf_cbenef is 'cBenef da NF-e de transferência (CST sem destaque do ICMS). Confirmar o código com o contador.';
comment on column public.unidades.transf_ipi_base is 'Base do IPI na transferência do que a unidade fabrica: custo ou preco_venda (RIPI, art. 195, I).';

alter table public.nfe_recebidas add column if not exists transferencia_id uuid references public.transferencias(id);
alter table public.nfe_recebidas add column if not exists cfop_entrada text;
alter table public.nfe_recebidas add column if not exists icms_credito numeric(12,2);
create index if not exists nfe_recebidas_transferencia_idx on public.nfe_recebidas (transferencia_id) where transferencia_id is not null;
comment on column public.nfe_recebidas.transferencia_id is 'NF-e de transferência entre as unidades da MF (entrada dada pela tela Transferências).';
comment on column public.nfe_recebidas.cfop_entrada is 'CFOP de entrada usado na escrituração (ex.: 2152 para a filial que revende).';
comment on column public.nfe_recebidas.icms_credito is 'ICMS destacado na nota (crédito do destino), quando a transferência sai com CST 00.';

-- CFOP de entrada da transferência: vale o uso no destino (mesma regra de cfopEntradaTransferencia no código).
create or replace function public.cfop_entrada_transferencia(p_cfop text, p_destino_fabrica boolean, p_tipo text)
returns text language sql immutable set search_path = public as $$
  select case
    when length(c) <> 4 then null
    else (case left(c, 1) when '6' then '2' when '7' then '3' else '1' end) ||
      case
        when right(c, 3) in ('552', '557', '153') then right(c, 3)
        when right(c, 3) in ('408', '409') then case when coalesce(p_destino_fabrica, false) and p_tipo = 'insumo' then '408' else '409' end
        when right(c, 3) in ('151', '152', '155', '156') then case when coalesce(p_destino_fabrica, false) and p_tipo = 'insumo' then '151' else '152' end
        else '949'
      end
  end
  from (select regexp_replace(coalesce(p_cfop, ''), '\D', '', 'g') as c) x;
$$;

-- Transferência dona da chave (ou null). Sem "security definer": vale a permissão de quem chama.
create or replace function public.transferencia_da_chave(p_chave text)
returns uuid language sql stable set search_path = public as $$
  select n.transferencia_id from public.notas_fiscais n
   where n.chave = regexp_replace(coalesce(p_chave, ''), '\D', '', 'g') and n.transferencia_id is not null
   order by (n.status = 'autorizada') desc, n.created_at desc
   limit 1;
$$;

-- Entrada da transferência no destino com a NF-e autorizada:
--  1) estoque: entra no destino uma vez só (se a nota já teve entrada pelas NF-e recebidas, não lança de novo);
--  2) livro de entradas do destino: a nota fica em nfe_recebidas (pela chave), com o CFOP de entrada, o crédito do
--     ICMS destacado e o processamento concluído (a busca automática não lança de novo).
-- Também serve para registrar no livro uma transferência que já foi recebida pelo botão antigo (sem mexer no estoque).
create or replace function public.receber_transferencia_nfe(p_transf uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_t public.transferencias; v_n public.notas_fiscais; v_o public.unidades; v_d public.unidades; v_r public.nfe_recebidas;
  v_existe boolean; v_i record; v_itens jsonb; v_icms numeric(12,2); v_cfops text; v_msg text;
  v_estoque boolean := false; v_aviso text := null;
begin
  perform public.exigir_papel('financeiro', 'tecnico');
  select * into v_t from transferencias where id = p_transf for update;
  if not found then raise exception 'transferência não encontrada'; end if;
  if v_t.status not in ('enviada', 'recebida') then raise exception 'só transferência enviada (em trânsito) ou recebida tem entrada'; end if;

  select * into v_n from notas_fiscais
   where transferencia_id = p_transf and status = 'autorizada' and excluida_em is null
     and coalesce(ambiente, 'producao') = 'producao' and chave is not null
   order by created_at desc limit 1;
  if not found then
    raise exception 'a NF-e desta transferência ainda não está autorizada (em produção): sem ela a entrada não vai para o livro de entradas';
  end if;
  select * into v_o from unidades where id = v_t.origem_id;
  select * into v_d from unidades where id = v_t.destino_id;

  -- itens da nota com o CFOP de entrada e o ICMS destacado (crédito do destino)
  select coalesce(jsonb_agg(jsonb_build_object(
           'numero', x.k, 'codigo', x.i->>'codigo_produto', 'descricao', x.i->>'descricao', 'ncm', x.i->>'codigo_ncm',
           'cfop', x.i->>'cfop', 'cfop_entrada', public.cfop_entrada_transferencia(x.i->>'cfop', v_d.fabrica, p.tipo),
           'unidade', x.i->>'unidade_comercial', 'quantidade', nullif(x.i->>'quantidade_comercial', '')::numeric,
           'valor_unitario', nullif(x.i->>'valor_unitario_comercial', '')::numeric, 'valor_total', nullif(x.i->>'valor_bruto', '')::numeric,
           'icms_cst', x.i->>'icms_situacao_tributaria', 'icms_valor', coalesce(nullif(x.i->>'icms_valor', '')::numeric, 0),
           'ipi_valor', coalesce(nullif(x.i->>'ipi_valor', '')::numeric, 0), 'produto_id', p.id) order by x.k), '[]'::jsonb),
         coalesce(sum(coalesce(nullif(x.i->>'icms_valor', '')::numeric, 0)), 0),
         string_agg(distinct public.cfop_entrada_transferencia(x.i->>'cfop', v_d.fabrica, p.tipo), ', ')
    into v_itens, v_icms, v_cfops
    from jsonb_array_elements(coalesce(v_n.payload->'items', '[]'::jsonb)) with ordinality as x(i, k)
    left join lateral (
      select pr.id, pr.tipo from produtos pr
       where pr.sku = x.i->>'codigo_produto'
          or (length(coalesce(x.i->>'codigo_produto', '')) >= 8 and pr.id::text like lower(x.i->>'codigo_produto') || '%')
       order by (pr.sku is not distinct from x.i->>'codigo_produto') desc
       limit 1) p on true;

  select * into v_r from nfe_recebidas where chave = v_n.chave for update;
  v_existe := found;
  if v_existe and v_r.transferencia_id is not null and v_r.transferencia_id <> p_transf then
    raise exception 'esta NF-e já está ligada a outra transferência';
  end if;

  -- 1) estoque do destino
  if v_t.status = 'enviada' then
    if v_existe and coalesce(v_r.estoque_lancado, false) then
      v_aviso := 'O estoque desta nota já tinha entrado pelas NF-e recebidas: a transferência foi marcada como recebida sem lançar de novo.';
    else
      for v_i in select * from transferencia_itens where transferencia_id = p_transf loop
        insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie, unidade_id)
        values (v_i.produto_id, 'entrada', v_i.quantidade,
                'Transferência #' || v_t.numero || ' (recebimento, NF-e ' || coalesce(v_n.numero, '') || ')',
                'transferencia', p_transf, v_i.numero_serie, v_t.destino_id);
      end loop;
      v_estoque := true;
    end if;
    update transferencias set status = 'recebida', recebida_em = now() where id = p_transf;
  elsif v_existe and coalesce(v_r.estoque_lancado, false) and v_r.transferencia_id is null then
    v_aviso := 'A transferência já tinha sido recebida e a nota também teve entrada pelas NF-e recebidas: confira o estoque de '
               || v_d.nome || ' (pode ter entrado duas vezes).';
  end if;

  -- 2) livro de entradas do destino
  v_msg := 'Transferência #' || v_t.numero || ' de ' || v_o.nome || ': entrada pela tela Transferências (CFOP de entrada '
           || coalesce(v_cfops, '-') || ').';
  if v_existe then
    update nfe_recebidas set
      transferencia_id = p_transf,
      unidade_id = coalesce(unidade_id, v_t.destino_id),
      cfop_entrada = v_cfops,
      icms_credito = v_icms,
      itens = case
        when jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) > 0 then
          (select jsonb_agg(e || jsonb_build_object('cfop_entrada', public.cfop_entrada_transferencia(e->>'cfop', v_d.fabrica, null)) order by o)
             from jsonb_array_elements(itens) with ordinality as y(e, o))
        else v_itens end,
      processamento = 'concluido', processamento_msg = v_msg, processado_em = coalesce(processado_em, now()),
      estoque_lancado = true, estoque_lancado_em = coalesce(estoque_lancado_em, now()),
      observacao_interna = coalesce(observacao_interna, v_msg)
    where id = v_r.id;
  else
    insert into nfe_recebidas (chave, emitente_nome, emitente_cnpj, valor_total, data_emissao, situacao, nfe_completa, unidade_id,
                               processamento, processamento_msg, processado_em, estoque_lancado, estoque_lancado_em, itens,
                               transferencia_id, cfop_entrada, icms_credito, observacao_interna, dados)
    values (v_n.chave, coalesce(v_o.razao_social, v_o.nome), regexp_replace(coalesce(v_o.cnpj, ''), '\D', '', 'g'), v_n.valor_total,
            coalesce(nullif(v_n.payload->>'data_emissao', '')::timestamptz, v_n.created_at), 'autorizada', false, v_t.destino_id,
            'concluido', v_msg, now(), true, now(), v_itens,
            p_transf, v_cfops, v_icms, v_msg,
            jsonb_build_object('origem', 'transferencia', 'nota_id', v_n.id, 'transferencia_numero', v_t.numero))
    returning * into v_r;
  end if;

  return jsonb_build_object('nfe_recebida_id', v_r.id, 'estoque', v_estoque, 'cfop_entrada', v_cfops,
                            'icms_credito', v_icms, 'aviso', v_aviso);
end $$;

revoke execute on function public.receber_transferencia_nfe(uuid) from public, anon;
grant execute on function public.receber_transferencia_nfe(uuid) to authenticated;
revoke execute on function public.transferencia_da_chave(text) from public, anon;
grant execute on function public.transferencia_da_chave(text) to authenticated, service_role;
revoke execute on function public.cfop_entrada_transferencia(text, boolean, text) from public, anon;
grant execute on function public.cfop_entrada_transferencia(text, boolean, text) to authenticated, service_role;
