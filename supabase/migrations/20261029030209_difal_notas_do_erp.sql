-- DIFAL por estado também com as NF-e emitidas pelo próprio ERP: o XML delas fica na Focus (notas_fiscais.xml_url) e
-- não em notas_fiscais_xml, então eram deixadas de fora. Sem XML guardado, a nota é lida do que o ERP mandou à Focus
-- (payload: destinatário, indicador da IE, itens com CFOP, base e valor do ICMS e o DIFAL destacado). Revisão de 29/10.
create or replace function public.difal_vendas_interestaduais()
returns table (nota_id uuid, numero text, emissao date, unidade_id uuid, uf text, grupo text,
               valor numeric, difal_destacado numeric, difal_estimado numeric)
language sql stable security definer set search_path = public as $$
  with n as (
    -- importadas (e qualquer nota com o XML guardado): lidas do XML
    select n.id, n.numero, n.unidade_id, n.valor_total, f.xml, null::jsonb payload
      from notas_fiscais n join notas_fiscais_xml f on f.nota_id = n.id
     where (public.is_erp_user() or public.e_contador())
       and n.status = 'autorizada' and n.excluida_em is null and coalesce(n.ambiente, 'producao') = 'producao'
    union all
    -- emitidas pelo ERP: o XML só está na Focus; lidas do payload enviado
    select n.id, n.numero, n.unidade_id, n.valor_total, null, n.payload
      from notas_fiscais n
     where (public.is_erp_user() or public.e_contador())
       and n.status = 'autorizada' and n.excluida_em is null and coalesce(n.ambiente, 'producao') = 'producao'
       and coalesce(n.tipo_operacao, 'saida') = 'saida' and jsonb_typeof(n.payload->'items') = 'array'
       and not exists (select 1 from notas_fiscais_xml f where f.nota_id = n.id)
  ),
  x as (
    select n.*,
           coalesce(substring(xml from '<emit>.*?<UF>([A-Z]{2})</UF>'), (select un.uf from unidades un where un.id = n.unidade_id)) uf_emit,
           coalesce(substring(xml from '<dest>.*?<UF>([A-Z]{2})</UF>'), upper(payload->>'uf_destinatario')) uf_dest,
           coalesce(substring(xml from '<dest>.*?<indIEDest>([0-9])</indIEDest>'), payload->>'indicador_inscricao_estadual_destinatario') ind,
           coalesce(substring(xml from '<dest>.*?<CNPJ>([0-9]+?)</CNPJ>'), nullif(regexp_replace(coalesce(payload->>'cnpj_destinatario', ''), '\D', '', 'g'), '')) cnpj,
           coalesce(substring(xml from '<tpNF>([01])</tpNF>'), case when payload is not null then coalesce(payload->>'tipo_documento', '1') end) tpnf,
           coalesce(substring(xml from '<dhEmi>([0-9-]{10})')::date, left(payload->>'data_emissao', 10)::date) emis,
           case when xml is not null then coalesce(substring(xml from '<ICMSTot>.*?<vNF>([0-9.]+)</vNF>')::numeric, 0) else coalesce(n.valor_total, 0) end vnf,
           case when xml is not null then
             coalesce(substring(xml from '<ICMSTot>.*?<vICMSUFDest>([0-9.]+)</vICMSUFDest>')::numeric, 0)
               + coalesce(substring(xml from '<ICMSTot>.*?<vFCPUFDest>([0-9.]+)</vFCPUFDest>')::numeric, 0)
           else coalesce((select sum(coalesce((it->>'icms_valor_uf_destino')::numeric, 0) + coalesce((it->>'fcp_valor_uf_destino')::numeric, 0))
                            from jsonb_array_elements(payload->'items') it), 0) end destacado,
           case when xml is not null then xml ~ '<CFOP>6(10[1-9]|11[0-9]|12[0-4]|40[1-5])</CFOP>'
                else exists (select 1 from jsonb_array_elements(payload->'items') it where it->>'cfop' ~ '^6(10[1-9]|11[0-9]|12[0-4]|40[1-5])$') end cfop_venda
      from n
  ),
  y as (
    select x.*,
           case when ind = '9' then 'sem_ie' when ind = '2' then 'isento'
                when ind = '1' and exists (select 1 from clientes c where c.cpf_cnpj = x.cnpj and c.contribuinte_icms = 9) then 'ie_baixada' end grupo
      from x
     where tpnf = '1' and uf_dest is not null and uf_dest <> uf_emit and cfop_venda
  )
  select y.id, y.numero, y.emis as emissao, y.unidade_id, y.uf_dest, y.grupo, round(y.vnf, 2) as valor, round(y.destacado, 2) as difal_destacado,
         round(coalesce(case when y.xml is not null then (
           select sum(case when i.g ~ '<ICMSSN' then 0
                           else greatest(coalesce(substring(i.g from '<vBC>([0-9.]+)</vBC>')::numeric, 0) * (u.aliquota_interna + u.fcp) / 100
                                         - coalesce(substring(i.g from '<vICMS>([0-9.]+)</vICMS>')::numeric, 0), 0) end)
             from regexp_matches(y.xml, '<det nItem="[0-9]+?">(.*?)</det>', 'g') d,
                  lateral (select coalesce(substring(d[1] from '<ICMS>(.*?)</ICMS>'), '') g) i
            where substring(d[1] from '<CFOP>([0-9]+)') ~ '^6(10[1-9]|11[0-9]|12[0-4]|40[1-5])$')
         else (
           -- CSOSN (Simples) tem 3 dígitos: sem DIFAL
           select sum(case when coalesce(it->>'icms_situacao_tributaria', '') ~ '^[0-9]{3}$' then 0
                           else greatest(coalesce((it->>'icms_base_calculo')::numeric, 0) * (u.aliquota_interna + u.fcp) / 100
                                         - coalesce((it->>'icms_valor')::numeric, 0), 0) end)
             from jsonb_array_elements(y.payload->'items') it
            where it->>'cfop' ~ '^6(10[1-9]|11[0-9]|12[0-4]|40[1-5])$') end, 0), 2) as difal_estimado
    from y join icms_uf u on u.uf = y.uf_dest
   where y.grupo is not null;
$$;
revoke all on function public.difal_vendas_interestaduais() from public, anon;
grant execute on function public.difal_vendas_interestaduais() to authenticated;
