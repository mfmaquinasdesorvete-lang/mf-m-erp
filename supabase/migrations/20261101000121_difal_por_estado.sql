-- =====================================================================
-- DIFAL por estado (Analista fiscal → DIFAL por estado): as vendas da MF para outro estado a quem não é
-- contribuinte de ICMS, lidas do XML das NF-e autorizadas. Para cada nota: o estado, o grupo do destinatário
-- (sem IE, isento de IE, ou saiu como contribuinte mas o cliente hoje está com a IE baixada), o valor, o DIFAL
-- destacado na nota (vICMSUFDest + vFCPUFDest) e o DIFAL estimado item a item:
--   base do ICMS × (alíquota interna + FCP do destino, tabela icms_uf) − ICMS destacado.
-- É estimativa (alíquota atual do ERP, não a de cada época); a conta oficial é do contador. Só leitura.
-- =====================================================================
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
           select sum(greatest(coalesce(substring(d[1] from '<vBC>([0-9.]+)</vBC>')::numeric, 0) * (u.aliquota_interna + u.fcp) / 100
                               - coalesce(substring(d[1] from '<vICMS>([0-9.]+)</vICMS>')::numeric, 0), 0))
             from regexp_matches(y.xml, '<det nItem="[0-9]+?">(.*?)</det>', 'g') d
            where substring(d[1] from '<CFOP>([0-9]+)') ~ '^6(10[1-9]|11[0-9]|12[0-4]|40[1-5])$'), 0), 2)
    from y join icms_uf u on u.uf = y.uf_dest
   where y.grupo is not null;
$$;
revoke all on function public.difal_vendas_interestaduais() from public, anon;
grant execute on function public.difal_vendas_interestaduais() to authenticated;
