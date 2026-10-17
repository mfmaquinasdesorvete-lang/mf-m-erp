-- =====================================================================
-- Serviços tomados como no Tiny (Notas fiscais → NFS-e → Recebidas): além do XML da nota, o serviço tomado pode ser
-- lançado pela descrição — com ou sem o número da NFS-e — e vira conta a pagar com um toque.
--  * nfse_importadas.origem aceita 'manual' (lançado na tela, sem o XML); o XML da mesma nota (prestador + número)
--    que chegar depois completa o lançamento, sem duplicar;
--  * nfse_importadas.conta_pagar_id liga o serviço tomado à conta a pagar lançada por ele;
--  * registrar_servico_tomado (financeiro): grava ou corrige o serviço tomado lançado na tela;
--  * lancar_conta_servico_tomado (financeiro): lança a conta a pagar do serviço tomado (valor líquido, já sem as
--    retenções), com o fornecedor, a NFS-e no documento, a emissão e a competência; a conta passa pela aprovação como
--    as outras contas lançadas na tela;
--  * contas_pagar_origem ganha a origem 'st' (serviço tomado) e o número da NFS-e na busca.
-- Somente acréscimos (a regra da origem é trocada por uma que aceita também 'manual'); nenhum dado muda.
-- =====================================================================

set local lock_timeout = '10s';

alter table public.nfse_importadas drop constraint if exists nfse_importadas_origem_check;
alter table public.nfse_importadas add constraint nfse_importadas_origem_check check (origem in ('tiny', 'xml', 'manual'));

alter table public.nfse_importadas
  add column if not exists conta_pagar_id uuid references public.contas_pagar(id) on delete set null;
comment on column public.nfse_importadas.conta_pagar_id is 'Conta a pagar lançada a partir deste serviço tomado';
create index if not exists nfse_importadas_conta_pagar on public.nfse_importadas (conta_pagar_id) where conta_pagar_id is not null;

-- O financeiro só liga a conta e o fornecedor (pela função abaixo); o resto entra por importar_nfse e registrar_servico_tomado.
revoke insert, update, delete on public.nfse_importadas from authenticated;
grant update (conta_pagar_id, fornecedor_id, updated_at) on public.nfse_importadas to authenticated;
create policy "financeiro_liga_conta" on public.nfse_importadas for update to authenticated
  using (tipo = 'tomada' and public.tem_papel('financeiro'))
  with check (tipo = 'tomada' and public.tem_papel('financeiro'));

/**
 * Serviço tomado lançado na tela (sem o XML): fornecedor, unidade, data, valor e a descrição do serviço; o número da
 * NFS-e é opcional (serviço sem nota ou nota que ainda vai chegar). Com p->>'id', corrige um lançamento manual que
 * ainda não tem conta a pagar ativa; com p->>'cancelar' = 'true', marca como cancelado. Devolve o id.
 */
create or replace function public.registrar_servico_tomado(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid; v_unid uuid; v_forn uuid; v_numero text; v_data date; v_comp date; v_valor numeric; v_desc text;
  v_prest text; v_prest_nome text; v_toma text; v_toma_nome text; v_chave text; v_atual record; v_atual_id uuid;
  v_iss numeric; v_ret boolean; v_ir numeric; v_inss numeric; v_pis numeric; v_cofins numeric; v_csll numeric; v_liq numeric;
  num constant text := '^\d{1,12}(\.\d{1,2})?$';
begin
  if not public.tem_papel('financeiro') then raise exception 'sem permissão para lançar serviços tomados'; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'dados inválidos'; end if;

  if coalesce(p->>'id', '') <> '' then
    select * into v_atual from nfse_importadas where id = (p->>'id')::uuid and tipo = 'tomada';
    if not found then raise exception 'serviço tomado não encontrado'; end if;
    v_atual_id := v_atual.id;
    if v_atual.origem <> 'manual' then raise exception 'só dá para corrigir o serviço lançado na tela; a nota do XML vem do arquivo'; end if;
    if v_atual.conta_pagar_id is not null and exists (select 1 from contas_pagar where id = v_atual.conta_pagar_id and status <> 'cancelado') then
      raise exception 'este serviço já tem conta a pagar: cancele a conta antes de corrigir';
    end if;
    if p->>'cancelar' = 'true' then
      update nfse_importadas set situacao = 'cancelada', updated_at = now() where id = v_atual.id;
      return v_atual.id;
    end if;
  end if;

  v_unid := case when coalesce(p->>'unidade_id', '') ~* '^[0-9a-f-]{36}$' then (p->>'unidade_id')::uuid end;
  select cnpj, coalesce(razao_social, nome) into v_toma, v_toma_nome from unidades where id = v_unid and ativo;
  if not found then raise exception 'escolha a unidade da MF que tomou o serviço'; end if;
  v_forn := case when coalesce(p->>'fornecedor_id', '') ~* '^[0-9a-f-]{36}$' then (p->>'fornecedor_id')::uuid end;
  select nullif(public.so_digitos(cnpj), ''), coalesce(nullif(trim(nome), ''), nome_fantasia) into v_prest, v_prest_nome from fornecedores where id = v_forn;
  if not found then raise exception 'escolha o fornecedor (prestador do serviço)'; end if;

  v_numero := nullif(ltrim(trim(coalesce(p->>'numero', '')), '0'), '');
  if v_numero is not null and v_numero !~ '^[0-9A-Za-z./-]{1,30}$' then raise exception 'número da NFS-e inválido'; end if;
  v_data := public.data_ou_nula(p->>'data_emissao');
  if v_data is null or v_data > current_date + 1 then raise exception 'informe a data do serviço (ou da emissão da nota)'; end if;
  v_comp := public.data_ou_nula(p->>'competencia');
  v_valor := case when coalesce(p->>'valor_servicos', '') ~ num then (p->>'valor_servicos')::numeric end;
  if v_valor is null or v_valor <= 0 then raise exception 'informe o valor do serviço'; end if;
  v_desc := nullif(left(trim(coalesce(p->>'discriminacao', '')), 4000), '');
  if v_desc is null or length(v_desc) < 3 then raise exception 'descreva o serviço tomado'; end if;

  v_iss := case when coalesce(p->>'valor_iss', '') ~ num then (p->>'valor_iss')::numeric end;
  v_ret := coalesce((p->>'iss_retido')::boolean, false) and coalesce(v_iss, 0) > 0;
  v_ir := case when coalesce(p->>'valor_ir', '') ~ num then (p->>'valor_ir')::numeric else 0 end;
  v_inss := case when coalesce(p->>'valor_inss', '') ~ num then (p->>'valor_inss')::numeric else 0 end;
  v_pis := case when coalesce(p->>'valor_pis', '') ~ num then (p->>'valor_pis')::numeric else 0 end;
  v_cofins := case when coalesce(p->>'valor_cofins', '') ~ num then (p->>'valor_cofins')::numeric else 0 end;
  v_csll := case when coalesce(p->>'valor_csll', '') ~ num then (p->>'valor_csll')::numeric else 0 end;
  v_liq := v_valor - v_ir - v_inss - v_pis - v_cofins - v_csll - case when v_ret then v_iss else 0 end;
  if v_liq <= 0 then raise exception 'as retenções passam do valor do serviço'; end if;

  -- com número: a mesma chave do XML (prestador + número), para o XML que chegar depois completar sem duplicar
  v_chave := 'tomada:' || coalesce(v_prest, v_forn::text) || ':'
             || coalesce('n' || v_numero, 'm' || coalesce(v_atual_id, gen_random_uuid())::text);
  if exists (select 1 from nfse_importadas where chave = v_chave and id is distinct from v_atual_id) then
    raise exception 'a NFS-e % deste fornecedor já está no ERP', v_numero;
  end if;

  if v_atual_id is null then
    insert into nfse_importadas (tipo, unidade_id, chave, data_emissao, valor_servicos, origem)
    values ('tomada', v_unid, v_chave, v_data, v_valor, 'manual') returning id into v_id;
  else
    v_id := v_atual_id;
  end if;

  update nfse_importadas set
    unidade_id = v_unid, chave = v_chave, numero = v_numero, data_emissao = v_data, competencia = v_comp,
    prestador_doc = v_prest, prestador_nome = v_prest_nome, tomador_doc = v_toma, tomador_nome = v_toma_nome,
    municipio = nullif(trim(coalesce(p->>'municipio', '')), ''), fornecedor_id = v_forn,
    valor_servicos = v_valor, valor_iss = v_iss, iss_retido = v_ret,
    valor_ir = v_ir, valor_inss = v_inss, valor_pis = v_pis, valor_cofins = v_cofins, valor_csll = v_csll, valor_liquido = v_liq,
    discriminacao = v_desc, codigo_servico = nullif(trim(coalesce(p->>'codigo_servico', '')), ''),
    situacao = case when v_numero is null then 'sem_numero' else 'normal' end,
    conta_pagar_id = case when v_atual_id is null then null else conta_pagar_id end,
    updated_at = now()
  where id = v_id;
  return v_id;
end $$;

revoke all on function public.registrar_servico_tomado(jsonb) from public, anon;
grant execute on function public.registrar_servico_tomado(jsonb) to authenticated;

/**
 * Conta a pagar do serviço tomado: valor líquido (o da nota ou o valor do serviço menos as retenções), fornecedor do
 * serviço (ou o escolhido, quando o XML não achou o cadastro pelo CNPJ), "NFS-e nº" no documento, emissão e
 * competência da nota. Roda com as permissões de quem chama (a conta entra como lançada na tela e passa pela
 * aprovação). Devolve o id da conta.
 */
create or replace function public.lancar_conta_servico_tomado(p_nfse uuid, p_vencimento date,
                                                              p_categoria text default 'serviços profissionais',
                                                              p_fornecedor uuid default null, p_forma uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  n record; v_forn uuid; v_pix text; v_nome text; v_valor numeric; v_conta uuid; v_ret numeric; v_obs text;
begin
  perform public.exigir_papel('financeiro');
  if p_vencimento is null then raise exception 'informe o vencimento'; end if;
  select * into n from nfse_importadas where id = p_nfse and tipo = 'tomada';
  if not found then raise exception 'serviço tomado não encontrado'; end if;
  if n.situacao = 'cancelada' then raise exception 'serviço tomado cancelado: não lança conta'; end if;
  if n.conta_pagar_id is not null and exists (select 1 from contas_pagar where id = n.conta_pagar_id and status <> 'cancelado') then
    raise exception 'a conta a pagar deste serviço já foi lançada';
  end if;
  v_forn := coalesce(n.fornecedor_id, p_fornecedor);
  if v_forn is null then raise exception 'escolha o fornecedor do serviço (o CNPJ do prestador não está no cadastro)'; end if;
  select chave_pix, coalesce(nullif(trim(nome_fantasia), ''), nome) into v_pix, v_nome from fornecedores where id = v_forn;
  if not found then raise exception 'fornecedor não encontrado'; end if;

  v_ret := n.valor_ir + n.valor_inss + n.valor_pis + n.valor_cofins + n.valor_csll + case when n.iss_retido then coalesce(n.valor_iss, 0) else 0 end;
  v_valor := coalesce(n.valor_liquido, n.valor_servicos - v_ret);
  if v_valor is null or v_valor <= 0 then raise exception 'valor líquido do serviço zerado'; end if;

  v_obs := 'Lançado a partir do serviço tomado (Notas fiscais → NFS-e → Recebidas)';
  if v_ret > 0 then
    v_obs := v_obs || '. Retenções a recolher pela MF em guia própria: ' || concat_ws(', ',
      case when n.valor_ir > 0 then 'IR ' || replace(to_char(n.valor_ir, 'FM999999990.00'), '.', ',') end,
      case when n.valor_inss > 0 then 'INSS ' || replace(to_char(n.valor_inss, 'FM999999990.00'), '.', ',') end,
      case when n.valor_pis + n.valor_cofins + n.valor_csll > 0 then 'PIS/COFINS/CSLL ' || replace(to_char(n.valor_pis + n.valor_cofins + n.valor_csll, 'FM999999990.00'), '.', ',') end,
      case when n.iss_retido and coalesce(n.valor_iss, 0) > 0 then 'ISS ' || replace(to_char(n.valor_iss, 'FM999999990.00'), '.', ',') end)
      || ' (confirmar com o contador)';
  end if;

  insert into contas_pagar (descricao, categoria, fornecedor_id, valor, vencimento, status, unidade_id, documento,
                            emissao, competencia, observacoes, chave_pix, forma_pagamento_id)
  values (left(concat_ws(' · ', case when n.numero is not null then 'NFS-e ' || n.numero else 'Serviço tomado' end, v_nome,
                         nullif(left(regexp_replace(coalesce(n.discriminacao, ''), '\s+', ' ', 'g'), 80), '')), 200),
          coalesce(nullif(trim(p_categoria), ''), 'serviços profissionais'), v_forn, round(v_valor, 2), p_vencimento, 'aberto',
          n.unidade_id, case when n.numero is not null then 'NFS-e ' || n.numero end, n.data_emissao,
          date_trunc('month', coalesce(n.competencia, n.data_emissao))::date, v_obs, v_pix, p_forma)
  returning id into v_conta;

  update nfse_importadas set conta_pagar_id = v_conta, fornecedor_id = coalesce(fornecedor_id, v_forn), updated_at = now()
   where id = p_nfse;
  return v_conta;
end $$;

revoke all on function public.lancar_conta_servico_tomado(uuid, date, text, uuid, uuid) from public, anon;
grant execute on function public.lancar_conta_servico_tomado(uuid, date, text, uuid, uuid) to authenticated;

-- origem 'st' (serviço tomado) e o número da NFS-e na busca; mesmas colunas, na mesma ordem
create or replace view public.contas_pagar_origem with (security_invoker = true) as
select c.id,
  case
    when c.nfe_recebida_id is not null or n2.id is not null then 'nf'
    when f.id is not null then 'cte'
    when e.id is not null then 'frete'
    when s.id is not null then 'st'
    when c.documento ~ '^PC [0-9]+' or c.descricao ~ '^Pedido de compra #' then 'oc'
    when c.recorrente_id is not null then 'fixa'
    when c.observacoes like 'Gerado pelo ERP a partir das comissões%' then 'comissao'
    when c.observacoes like 'Lançado a partir do extrato bancário%' then 'extrato'
    when c.id_externo like 'infinitepay%' then 'infinitepay'
    when c.id_externo like 'olist%' or c.observacoes ilike '%olist%' then 'olist'
    when c.id_externo like 'tiny%' or c.lancamento = 'importado' then 'tiny'
    when c.lancamento = 'manual' then 'manual'
    else 'outro'
  end as origem,
  coalesce(nullif(ltrim(substring(coalesce(n.chave, n2.chave) from 26 for 9), '0'), ''), s.numero) as nf_numero,
  coalesce(substring(c.documento from '^PC ([0-9]+)'), substring(c.descricao from '^Pedido de compra #([0-9]+)')) as oc_numero,
  e.numero::text as envio_numero,
  f.numero::text as fatura_numero,
  coalesce(c.emissao, n.data_emissao::date, n2.data_emissao::date, s.data_emissao, c.created_at::date) as emissao_efetiva
from public.contas_pagar c
left join public.nfe_recebidas n on n.id = c.nfe_recebida_id
left join lateral (select x.id, x.chave, x.data_emissao from public.nfe_recebidas x where x.conta_pagar_id = c.id and c.nfe_recebida_id is null limit 1) n2 on true
left join lateral (select x.id, x.numero from public.cte_faturas x where x.conta_pagar_id = c.id limit 1) f on true
left join lateral (select x.id, x.numero from public.envios x where x.conta_pagar_id = c.id limit 1) e on true
left join lateral (select x.id, x.numero, x.data_emissao from public.nfse_importadas x where x.conta_pagar_id = c.id limit 1) s on true;

comment on view public.contas_pagar_origem is 'De onde veio cada conta a pagar, os números para a busca e a data de emissão que vale';
revoke all on public.contas_pagar_origem from anon;
grant select on public.contas_pagar_origem to authenticated, service_role;
