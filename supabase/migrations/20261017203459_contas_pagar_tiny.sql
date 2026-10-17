-- =====================================================================
-- Contas a pagar como no Tiny (e melhor)
--  * contas_pagar ganha a data de emissão (emissao), a forma de pagamento (forma_pagamento_id, do cadastro de formas
--    de pagamento) e a chave Pix de quem recebe (chave_pix, que a tela traz do fornecedor);
--  * visão contas_pagar_origem (com as regras de linha de quem consulta): de onde veio cada conta — nota de
--    fornecedor (NF), ordem de compra (OC), fatura de CT-e, frete de envio, conta fixa, comissão, extrato do banco,
--    InfinitePay, Olist, Tiny ou lançamento manual —, os números para a busca (NF, OC, envio, fatura) e a data de
--    emissão que vale (a digitada, a da nota de fornecedor ou o dia do lançamento).
-- Somente acréscimos; nenhum dado muda.
-- =====================================================================

set local lock_timeout = '10s';

alter table public.contas_pagar
  add column if not exists emissao date,
  add column if not exists forma_pagamento_id uuid references public.formas_pagamento(id) on delete set null,
  add column if not exists chave_pix text;

comment on column public.contas_pagar.emissao is 'Data de emissão do documento (boleto, nota, recibo); vazia: vale a da nota de fornecedor ou o dia do lançamento';
comment on column public.contas_pagar.forma_pagamento_id is 'Como a conta vai ser paga (cadastro de formas de pagamento)';
comment on column public.contas_pagar.chave_pix is 'Chave Pix de quem recebe (vem do cadastro do fornecedor e pode ser trocada na conta)';

create index if not exists contas_pagar_forma_idx on public.contas_pagar (forma_pagamento_id) where forma_pagamento_id is not null;

create or replace view public.contas_pagar_origem with (security_invoker = true) as
select c.id,
  case
    when c.nfe_recebida_id is not null or n2.id is not null then 'nf'
    when f.id is not null then 'cte'
    when e.id is not null then 'frete'
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
  nullif(ltrim(substring(coalesce(n.chave, n2.chave) from 26 for 9), '0'), '') as nf_numero,
  coalesce(substring(c.documento from '^PC ([0-9]+)'), substring(c.descricao from '^Pedido de compra #([0-9]+)')) as oc_numero,
  e.numero::text as envio_numero,
  f.numero::text as fatura_numero,
  coalesce(c.emissao, n.data_emissao::date, n2.data_emissao::date, c.created_at::date) as emissao_efetiva
from public.contas_pagar c
left join public.nfe_recebidas n on n.id = c.nfe_recebida_id
left join lateral (select x.id, x.chave, x.data_emissao from public.nfe_recebidas x where x.conta_pagar_id = c.id and c.nfe_recebida_id is null limit 1) n2 on true
left join lateral (select x.id, x.numero from public.cte_faturas x where x.conta_pagar_id = c.id limit 1) f on true
left join lateral (select x.id, x.numero from public.envios x where x.conta_pagar_id = c.id limit 1) e on true;

comment on view public.contas_pagar_origem is 'De onde veio cada conta a pagar, os números para a busca e a data de emissão que vale';

revoke all on public.contas_pagar_origem from anon;
grant select on public.contas_pagar_origem to authenticated, service_role;
