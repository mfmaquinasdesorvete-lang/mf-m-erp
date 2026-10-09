-- =====================================================================
-- Notas de compra importadas (XML) que ficaram só como histórico: as duplicatas que ainda vão vencer viram contas a
-- pagar (uma por parcela, sem repetir). Usado pelo botão em Notas fiscais → NF-e recebidas.
-- =====================================================================
create or replace function public.lancar_duplicatas_a_vencer(p_desde date default current_date)
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; ns text[] := array[array['nfe', 'http://www.portalfiscal.inf.br/nfe']];
begin
  if current_user in ('authenticated', 'anon') then perform public.exigir_papel('financeiro'); end if;
  perform set_config('erp.acao_usuario', 'on', true);
  with notas as (
    select r.id, r.fornecedor_id, r.unidade_id, r.emitente_nome, xmlparse(document regexp_replace(r.xml, '^\s*<\?xml[^>]*\?>', '')) as x
      from nfe_recebidas r
     where r.excluida_em is null and r.xml is not null and coalesce(r.situacao, 'autorizada') <> 'cancelada'
  ), dups as (
    select n.id, n.fornecedor_id, n.unidade_id, n.emitente_nome,
           (xpath('//nfe:ide/nfe:nNF/text()', n.x, ns))[1]::text as nnf,
           d.dup, d.ord, count(*) over (partition by n.id) as total
      from notas n, unnest(xpath('//nfe:cobr/nfe:dup', n.x, ns)) with ordinality as d(dup, ord)
  ), parcelas as (
    select dups.*, (xpath('/nfe:dup/nfe:nDup/text()', dup, ns))[1]::text as ndup,
           (xpath('/nfe:dup/nfe:dVenc/text()', dup, ns))[1]::text::date as venc,
           (xpath('/nfe:dup/nfe:vDup/text()', dup, ns))[1]::text::numeric as valor
      from dups
  ), novas as (
    insert into contas_pagar (descricao, fornecedor_id, categoria, documento, valor, vencimento, status, nfe_recebida_id, unidade_id, observacoes)
    select 'NF ' || p.nnf || ' - ' || coalesce(p.emitente_nome, 'fornecedor') || ' (' || p.ord || '/' || p.total || ')',
           p.fornecedor_id, 'fornecedores', 'NF ' || p.nnf || ' dup ' || coalesce(p.ndup, p.ord::text), p.valor, p.venc, 'aberto', p.id,
           coalesce(p.unidade_id, public.unidade_matriz()), 'Lançada das duplicatas da nota importada'
      from parcelas p
     where p.venc >= p_desde and p.valor > 0
       and not exists (select 1 from contas_pagar c where c.nfe_recebida_id = p.id
                         and (c.documento = 'NF ' || p.nnf || ' dup ' || coalesce(p.ndup, p.ord::text) or (c.vencimento = p.venc and c.valor = p.valor)))
    returning 1
  )
  select count(*) into n from novas;
  return n;
end $$;
revoke execute on function public.lancar_duplicatas_a_vencer(date) from public, anon;
grant execute on function public.lancar_duplicatas_a_vencer(date) to authenticated;
