-- Códigos EAN (GTIN) dos produtos:
--   * configuracoes.gs1_prefixo: a faixa da empresa na GS1 Brasil (789/790 + número da empresa). Com ela o ERP gera
--     os códigos dos produtos próprios em sequência, com o dígito verificador certo, sem repetir.
--   * eans_das_notas(): os EANs que os fornecedores mandam nas NF-e (cEAN do XML), ligados ao produto pelo código do
--     fornecedor (produto_fornecedor / fornecimentos). Serve de sugestão do código certo no cadastro.
--     Notas emitidas pela própria empresa (transferência entre unidades) ficam de fora.
-- Só acrescenta: coluna nova, restrição e função de leitura (security invoker: respeita quem pode ver as notas).

alter table public.configuracoes add column if not exists gs1_prefixo text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'configuracoes_gs1_prefixo_check') then
    alter table public.configuracoes add constraint configuracoes_gs1_prefixo_check
      check (gs1_prefixo is null or gs1_prefixo ~ '^(789|790)[0-9]{4,7}$');
  end if;
end $$;

create or replace function public.eans_das_notas()
returns table (produto_id uuid, ean text, fornecedor text, codigo_fornecedor text, descricao_nota text, ultima_nota timestamptz, notas bigint)
language sql stable security invoker set search_path to 'public' as $function$
  with proprias as (
    select regexp_replace(cnpj, '\D', '', 'g') cnpj from unidades where cnpj is not null
  ), itens as (
    select r.id, coalesce(r.fornecedor_id, f.id) fornecedor_id, r.emitente_nome, r.data_emissao, m[1] cprod, m[2] cean, m[3] xprod
    from nfe_recebidas r
    left join fornecedores f on r.fornecedor_id is null and f.cnpj is not null
      and regexp_replace(f.cnpj, '\D', '', 'g') = regexp_replace(coalesce(r.emitente_cnpj, ''), '\D', '', 'g')
    cross join lateral regexp_matches(coalesce(r.xml, ''), '<cProd>([^<]*)</cProd>\s*<cEAN>([0-9]{8,14})</cEAN>\s*<xProd>([^<]*)</xProd>', 'g') m
    where r.excluida_em is null
      and regexp_replace(coalesce(r.emitente_cnpj, ''), '\D', '', 'g') not in (select cnpj from proprias)
  ), vinculos as (
    select pf.produto_id, pf.fornecedor_id, btrim(pf.codigo_fornecedor) codigo from produto_fornecedor pf where pf.codigo_fornecedor is not null
    union
    select fo.produto_id, fo.fornecedor_id, btrim(fo.codigo_fornecedor) from fornecimentos fo where fo.ativo and fo.codigo_fornecedor is not null
  )
  select v.produto_id, i.cean, max(i.emitente_nome), i.cprod, max(i.xprod), max(i.data_emissao), count(distinct i.id)
  from itens i
  join vinculos v on v.fornecedor_id = i.fornecedor_id and v.codigo = btrim(i.cprod)
  group by v.produto_id, i.cean, i.cprod
$function$;

revoke all on function public.eans_das_notas() from public, anon;
grant execute on function public.eans_das_notas() to authenticated;
