set lock_timeout = '8s';
create trigger trg_gnre_nota after insert or update of status on public.notas_fiscais
  for each row execute function public.trg_gnre_nota();

-- origem 'gnre' nas contas a pagar (mesmas colunas, na mesma ordem)
create or replace view public.contas_pagar_origem with (security_invoker = true) as
select c.id,
  case
    when c.nfe_recebida_id is not null or n2.id is not null then 'nf'
    when f.id is not null then 'cte'
    when e.id is not null then 'frete'
    when s.id is not null then 'st'
    when g.id is not null then 'gnre'
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
  coalesce(nullif(ltrim(substring(coalesce(n.chave, n2.chave) from 26 for 9), '0'), ''), s.numero, g.nf_numero) as nf_numero,
  coalesce(substring(c.documento from '^PC ([0-9]+)'), substring(c.descricao from '^Pedido de compra #([0-9]+)')) as oc_numero,
  e.numero::text as envio_numero,
  f.numero::text as fatura_numero,
  coalesce(c.emissao, n.data_emissao::date, n2.data_emissao::date, s.data_emissao, c.created_at::date) as emissao_efetiva
from public.contas_pagar c
left join public.nfe_recebidas n on n.id = c.nfe_recebida_id
left join lateral (select x.id, x.chave, x.data_emissao from public.nfe_recebidas x where x.conta_pagar_id = c.id and c.nfe_recebida_id is null limit 1) n2 on true
left join lateral (select x.id, x.numero from public.cte_faturas x where x.conta_pagar_id = c.id limit 1) f on true
left join lateral (select x.id, x.numero from public.envios x where x.conta_pagar_id = c.id limit 1) e on true
left join lateral (select x.id, x.numero, x.data_emissao from public.nfse_importadas x where x.conta_pagar_id = c.id limit 1) s on true
left join lateral (select x.id, x.nf_numero from public.gnre_guias x where x.conta_pagar_id = c.id limit 1) g on true;

comment on view public.contas_pagar_origem is 'De onde veio cada conta a pagar, os números para a busca e a data de emissão que vale';
