-- DIFAL por estado: a base e o ICMS do item vêm só do grupo <ICMS> (antes pegava o primeiro <vBC> do item, que na
-- nota do Simples é a base do PIS) e item do Simples Nacional (ICMSSN, CSOSN) não tem DIFAL estimado: empresa do
-- Simples não paga DIFAL na venda a não contribuinte (STF, ADI 5464). Teste de 29/10: as NF 9 e 13 de 2024 (SP)
-- somavam R$ 16.020,00 a mais no "desde o início". Só muda o difal_estimado das notas do Simples.
create or replace function public.difal_vendas_interestaduais()
returns table (nota_id uuid, numero text, emissao date, unidade_id uuid, uf text, grupo text,
               valor numeric, difal_destacado numeric, difal_estimado numeric)
language sql stable security definer set search_path = public as $$
  with n as (
    select n.id, n.numero, n.unidade_id, f.xml
      from notas_fiscais n join notas_fiscais_xml f on f.nota_id = n.id
     where (public.is_erp_user() or public.e_contador())
       and n.status = 'autorizada' and n.excluida_em is null and coalesce(n.ambiente, 'producao') = 'producao'
  ),
  x as (
    select n.*,
           substring(xml from '<emit>.*?<UF>([A-Z]{2})</UF>') uf_emit,
           substring(xml from '<dest>.*?<UF>([A-Z]{2})</UF>') uf_dest,
           substring(xml from '<dest>.*?<indIEDest>([0-9])</indIEDest>') ind,
           substring(xml from '<dest>.*?<CNPJ>([0-9]+?)</CNPJ>') cnpj,
           substring(xml from '<tpNF>([01])</tpNF>') tpnf,
           substring(xml from '<dhEmi>([0-9-]{10})')::date emis,
           coalesce(substring(xml from '<ICMSTot>.*?<vNF>([0-9.]+)</vNF>')::numeric, 0) vnf,
           coalesce(substring(xml from '<ICMSTot>.*?<vICMSUFDest>([0-9.]+)</vICMSUFDest>')::numeric, 0)
             + coalesce(substring(xml from '<ICMSTot>.*?<vFCPUFDest>([0-9.]+)</vFCPUFDest>')::numeric, 0) destacado
      from n
  ),
  y as (
    select x.*,
           case when ind = '9' then 'sem_ie' when ind = '2' then 'isento'
                when ind = '1' and exists (select 1 from clientes c where c.cpf_cnpj = x.cnpj and c.contribuinte_icms = 9) then 'ie_baixada' end grupo
      from x
     where tpnf = '1' and uf_dest is not null and uf_dest <> uf_emit
       and xml ~ '<CFOP>6(10[1-9]|11[0-9]|12[0-4]|40[1-5])</CFOP>'
  )
  select y.id, y.numero, y.emis, y.unidade_id, y.uf_dest, y.grupo, round(y.vnf, 2), round(y.destacado, 2),
         round(coalesce((
           select sum(case when i.g ~ '<ICMSSN' then 0
                           else greatest(coalesce(substring(i.g from '<vBC>([0-9.]+)</vBC>')::numeric, 0) * (u.aliquota_interna + u.fcp) / 100
                                         - coalesce(substring(i.g from '<vICMS>([0-9.]+)</vICMS>')::numeric, 0), 0) end)
             from regexp_matches(y.xml, '<det nItem="[0-9]+?">(.*?)</det>', 'g') d,
                  lateral (select coalesce(substring(d[1] from '<ICMS>(.*?)</ICMS>'), '') g) i
            where substring(d[1] from '<CFOP>([0-9]+)') ~ '^6(10[1-9]|11[0-9]|12[0-4]|40[1-5])$'), 0), 2)
    from y join icms_uf u on u.uf = y.uf_dest
   where y.grupo is not null;
$$;
revoke all on function public.difal_vendas_interestaduais() from public, anon;
grant execute on function public.difal_vendas_interestaduais() to authenticated;
