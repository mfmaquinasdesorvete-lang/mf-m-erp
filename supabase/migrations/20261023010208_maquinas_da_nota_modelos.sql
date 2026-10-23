-- =====================================================================
-- Máquina vendida com NF-e vai para a ficha do cliente também quando a descrição do item
-- é só o modelo ("My Frost TOP 300", "My Frost TOP 300 c/ Cilindros independentes",
-- "My Frost Prime 4.0-7 Sabores NOVA"), sem as palavras "máquina de sorvete/açaí".
-- Antes essas notas ficavam de fora (revisão das notas do Tiny, 23/10). Inclui o A 100.
-- =====================================================================
create or replace function public.registrar_maquinas_da_nota(p_nota uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  nf record; v_xml text; v_cfg public.configuracoes; v_ns text[]; v_k int := 0; v_n int := 0;
  it record; v_serie text; v_prod uuid; v_meses int; v_eq uuid; v_emissao date;
begin
  select * into nf from public.notas_fiscais where id = p_nota;
  if nf.id is null or nf.status <> 'autorizada' or coalesce(nf.ambiente, 'producao') <> 'producao'
     or nf.excluida_em is not null or nf.cliente_id is null then return 0; end if;
  select xml into v_xml from public.notas_fiscais_xml where nota_id = p_nota;
  select * into v_cfg from public.configuracoes where id = 1;
  v_emissao := coalesce(substring(v_xml from '<dhEmi>([0-9-]{10})')::date, (nf.payload->>'data_emissao')::date, nf.created_at::date);
  -- números de série escritos nas informações complementares (nota importada)
  v_ns := array(select upper(t) from regexp_split_to_table(coalesce(
            substring(coalesce(v_xml, nf.payload->>'informacoes_adicionais_contribuinte', '') from '(?i)s[eé]rie d[oe]s? equipamentos?:?\s*([0-9A-Za-z ,/;e-]{3,120})'), ''),
            '[^0-9A-Za-z]+') t where t ~ '^[0-9]{6,}$');

  for it in
    with itens as (
      select d.ord, substring(d.det[1] from '<xProd>([^<]*)') descricao, substring(d.det[1] from '<cProd>([^<]*)') codigo,
             substring(d.det[1] from '<CFOP>([^<]*)') cfop, substring(d.det[1] from '<qCom>([^<]*)')::numeric qtd
        from regexp_matches(coalesce(v_xml, ''), '<det [^>]*>(.*?)</det>', 'g') with ordinality d(det, ord)
      union all
      select i.ord, i.j->>'descricao', i.j->>'codigo_produto', i.j->>'cfop', (i.j->>'quantidade_comercial')::numeric
        from jsonb_array_elements(case when v_xml is null and jsonb_typeof(nf.payload->'items') = 'array' then nf.payload->'items' else '[]' end)
             with ordinality i(j, ord))
    select * from itens
     where cfop ~ '^[56]10[12]$'
       and (descricao ~* 'm[aá]quina (de sorvete|de a[cç]a[ií]|a[cç]a[ií]|para)'
            or descricao ~* '^\s*my frost (top ?[23]00|queen|prime|slim|a ?[12]00|p ?765)')
       and descricao !~* '(veda|alavanca|manipulo|p[aá] batedora|pist[aã]o|o-?ring|kit |pe[cç]a|clp)'
     order by ord
  loop
    v_prod := (select p.id from public.produtos p where p.tipo = 'maquina'
                and (p.sku = it.codigo or p.descricao ~* coalesce(substring(it.descricao from '(?i)(prime|queen|slim|top ?[23]00|a ?[12]00|p ?765)'), '###'))
                order by (p.sku = it.codigo) desc, p.ativo desc nulls last limit 1);
    select garantia_meses into v_meses from public.produtos where id = v_prod;
    for u in 1..greatest(coalesce(it.qtd, 1)::int, 1) loop
      v_k := v_k + 1;
      -- nº de série: o do item (nota do ERP) ou o das informações complementares, na ordem
      v_serie := upper(nullif(trim(split_part(regexp_replace(coalesce(substring(it.descricao from '(?i)n[ºo°]?\.?\s*s[ée]rie:?\s*([0-9A-Za-z ,/;]+)'), ''), '\s*[,/;]\s*', '|', 'g'), '|', u)), ''));
      if v_serie is null then v_serie := v_ns[v_k]; end if;
      if exists (select 1 from public.equipamentos where origem_ref = 'nfe-mf:' || nf.numero || ':' || v_k) then continue; end if;
      if v_serie is not null and exists (select 1 from public.equipamentos where upper(numero_serie) = v_serie) then continue; end if;
      -- pedido que já criou as máquinas na aprovação: completa o nº de série que faltava
      if nf.pedido_id is not null and exists (select 1 from public.equipamentos where pedido_id = nf.pedido_id) then
        if v_serie is not null then
          select id into v_eq from public.equipamentos
           where pedido_id = nf.pedido_id and numero_serie is null order by created_at, id limit 1;
          if v_eq is not null then
            update public.equipamentos set numero_serie = v_serie where id = v_eq;
            v_n := v_n + 1;
          end if;
        end if;
        continue;
      end if;
      insert into public.equipamentos (cliente_id, produto_id, descricao, numero_serie, pedido_id, data_venda, unidade_id,
                                       garantia_ate, proxima_preventiva, origem_ref, observacoes)
      values (nf.cliente_id, v_prod, left(btrim(regexp_replace(regexp_replace(regexp_replace(it.descricao, '(?i)\s*-?\s*n[ºo°]?\.?\s*s[ée]rie.*$', ''), '&#x[0-9A-F]+;', ' ', 'g'), '\s+', ' ', 'g')), 120),
              v_serie, nf.pedido_id, v_emissao, nf.unidade_id,
              v_emissao + make_interval(months => coalesce(v_meses, v_cfg.garantia_meses_padrao, 12)),
              v_emissao + make_interval(months => coalesce(v_cfg.preventiva_meses, 6)),
              'nfe-mf:' || nf.numero || ':' || v_k,
              'Vendida pela MF (NF-e nº ' || nf.numero || ')' || case when v_serie is null then '; a nota não traz o nº de série.' else '.' end);
      v_n := v_n + 1;
    end loop;
  end loop;
  return v_n;
end $$;
revoke all on function public.registrar_maquinas_da_nota(uuid) from public, anon, authenticated;
