-- Pedidos do Tiny: o vendedor é achado pelo nome sem acento e sem diferença de maiúsculas
-- (no Tiny "Evellem Olmêdo", no ERP "Évellem Olmedo"). O resto da função não muda.
create or replace function public.importar_pedidos_tiny(p_unidade uuid, p_ids text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d record; p jsonb; c jsonb; it jsonb; parc jsonb;
  v_ped uuid; v_cli uuid; v_doc text; v_nome text; v_sit text; v_status text; v_data date; v_quando timestamptz;
  v_prod uuid; v_qtd numeric; v_vu numeric; v_cod text; v_descr text; v_itens int;
  v_desc numeric; v_frete numeric; v_outras numeric; v_tprod numeric; v_total_tiny numeric; v_total_erp numeric;
  v_forma_txt text; v_forma text; v_parcelas int; v_venc date; v_venc2 date; v_interv int;
  v_vend uuid; v_vend_nome text; v_transp uuid; v_transp_nome text; v_mod int; v_origem text; v_obs text;
  v_generico uuid; v_maquina uuid;
  v_novos int := 0; v_existentes int := 0; v_clientes_novos int := 0; v_itens_sem_cadastro int := 0; v_divergentes int := 0;
  v_erros jsonb := '[]'::jsonb;
begin
  if not public.is_erp_admin() then raise exception 'só o administrador importa o histórico do Tiny'; end if;
  if not exists (select 1 from unidades where id = p_unidade) then raise exception 'escolha a unidade dos pedidos'; end if;
  if p_ids is null or cardinality(p_ids) not between 1 and 200 then raise exception 'envie de 1 a 200 pedidos por vez'; end if;
  select id into v_generico from produtos where sku = 'TINY-ITEM' limit 1;
  select id into v_maquina from produtos where sku = 'TINY-MAQUINA' limit 1;

  for d in select t.tiny_id, t.dados from tiny_documentos t where t.tipo = 'pedido' and t.tiny_id = any(p_ids) loop
    begin
      p := d.dados;
      v_sit := nullif(left(btrim(coalesce(p->>'situacao', '')), 60), '');

      -- já importado: só atualiza a situação do Tiny (a do ERP não muda; mudar dispararia estoque, comissão e avisos)
      select id into v_ped from pedidos where id_externo = 'tiny:' || d.tiny_id;
      if v_ped is not null then
        update pedidos set situacao_origem = v_sit where id = v_ped and situacao_origem is distinct from v_sit;
        update tiny_documentos set importado_em = now(), erro = null where tipo = 'pedido' and tiny_id = d.tiny_id;
        v_existentes := v_existentes + 1;
        continue;
      end if;

      v_status := case
        when v_sit ~* '^cancel' then 'cancelado'
        when v_sit ~* '^entregue' then 'entregue'
        when v_sit ~* 'fatur|atendid|enviado|n[aã]o entregue' then 'faturado'
        when v_sit ~* 'aprovad|preparando|pronto|produ' then 'aprovado'
        else 'orcamento' end;
      v_data := coalesce(public.tiny_data(p->>'data_pedido'), public.tiny_data(p->>'data_faturamento'), current_date);
      v_quando := (v_data + time '12:00') at time zone 'America/Sao_Paulo';

      -- cliente: pelo ID do contato no Tiny, depois CPF/CNPJ, depois o nome (só se houver um com esse nome); senão cadastra
      c := coalesce(p->'cliente', '{}'::jsonb);
      v_doc := nullif(regexp_replace(coalesce(c->>'cpf_cnpj', ''), '\D', '', 'g'), '');
      if v_doc is not null and length(v_doc) not in (11, 14) then v_doc := null; end if;
      v_nome := nullif(left(btrim(coalesce(c->>'nome', p->>'nome', '')), 200), '');
      v_cli := null;
      if nullif(btrim(coalesce(c->>'id', '')), '') is not null then
        select coalesce(unificado_em, id) into v_cli from clientes where id_externo = btrim(c->>'id') limit 1;
      end if;
      if v_cli is null and v_doc is not null then
        select coalesce(unificado_em, id) into v_cli from clientes where cpf_cnpj = v_doc order by arquivado_em nulls first limit 1;
      end if;
      if v_cli is null and v_nome is not null then
        select min(coalesce(unificado_em, id)::text)::uuid into v_cli from clientes where lower(btrim(nome)) = lower(v_nome)
        having count(distinct coalesce(unificado_em, id)) = 1;
      end if;
      if v_cli is null then
        if v_nome is null then raise exception 'pedido sem cliente'; end if;
        insert into clientes (tipo_pessoa, nome, cpf_cnpj, inscricao_estadual, email, telefone, cep, logradouro, numero,
                              complemento, bairro, municipio, uf)
        values (case when length(v_doc) = 11 or (v_doc is null and upper(coalesce(c->>'tipo_pessoa', '')) = 'F') then 'PF' else 'PJ' end,
                v_nome, v_doc,
                nullif(left(btrim(coalesce(c->>'ie', '')), 30), ''),
                nullif(left(btrim(coalesce(c->>'email', '')), 200), ''),
                nullif(left(btrim(coalesce(c->>'fone', '')), 40), ''),
                nullif(left(regexp_replace(coalesce(c->>'cep', ''), '\D', '', 'g'), 8), ''),
                nullif(left(btrim(coalesce(c->>'endereco', '')), 200), ''),
                nullif(left(btrim(coalesce(c->>'numero', '')), 20), ''),
                nullif(left(btrim(coalesce(c->>'complemento', '')), 100), ''),
                nullif(left(btrim(coalesce(c->>'bairro', '')), 100), ''),
                nullif(left(btrim(coalesce(c->>'cidade', '')), 100), ''),
                nullif(upper(left(btrim(coalesce(c->>'uf', '')), 2)), ''))
        returning id into v_cli;
        v_clientes_novos := v_clientes_novos + 1;
      end if;

      -- vendedor e transportadora pelo nome
      v_vend_nome := nullif(left(btrim(coalesce(p->>'nome_vendedor', '')), 100), '');
      v_vend := null;
      if v_vend_nome is not null then
        -- sem acento e sem diferença de maiúsculas: "Evellem Olmêdo" do Tiny = "Évellem Olmedo" do ERP
        select id into v_vend from vendedores
         where translate(lower(btrim(nome)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
             = translate(lower(v_vend_nome), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
         order by (lower(btrim(nome)) = lower(v_vend_nome)) desc limit 1;
      end if;
      v_transp_nome := nullif(btrim(coalesce(p->>'nome_transportador', '')), '');
      v_transp := null;
      if v_transp_nome is not null then
        select coalesce(unificado_em, id) into v_transp from transportadoras
         where lower(btrim(nome)) = lower(v_transp_nome) or lower(btrim(coalesce(nome_fantasia, ''))) = lower(v_transp_nome) limit 1;
      end if;

      -- pagamento: forma e parcelas
      v_forma_txt := concat_ws(' ', p->>'meio_pagamento', p->>'forma_pagamento',
        (select string_agg(concat_ws(' ', coalesce(x->'parcela', x)->>'forma_pagamento', coalesce(x->'parcela', x)->>'meio_pagamento'), ' ')
           from jsonb_array_elements(case when jsonb_typeof(p->'parcelas') = 'array' then p->'parcelas' else '[]'::jsonb end) x));
      v_forma := case
        when v_forma_txt ~* 'pix' then 'pix'
        when v_forma_txt ~* 'boleto' then 'boleto'
        when v_forma_txt ~* 'cart|cr[eé]dito|d[eé]bito' then 'cartao'
        when v_forma_txt ~* 'dinheiro' then 'dinheiro'
        when v_forma_txt ~* 'dep[oó]sito|transf|ted\M|doc\M' then 'transferencia'
        else 'boleto' end;
      v_parcelas := greatest(1, least(24, coalesce(case when jsonb_typeof(p->'parcelas') = 'array' then jsonb_array_length(p->'parcelas') end, 1)));
      v_venc := null; v_venc2 := null;
      if jsonb_typeof(p->'parcelas') = 'array' and jsonb_array_length(p->'parcelas') > 0 then
        v_venc := public.tiny_data(coalesce(p->'parcelas'->0->'parcela', p->'parcelas'->0)->>'data');
        if jsonb_array_length(p->'parcelas') > 1 then
          v_venc2 := public.tiny_data(coalesce(p->'parcelas'->1->'parcela', p->'parcelas'->1)->>'data');
        end if;
      end if;
      v_interv := greatest(0, least(365, coalesce(v_venc2 - v_venc, 30)));
      v_mod := case upper(left(btrim(coalesce(p->>'frete_por_conta', '')), 1))
        when 'R' then 0 when 'D' then 1 when 'T' then 2 when '3' then 3 when '4' then 4 else 9 end;

      -- valores: o desconto pode vir em % ("10%"); outras despesas entram no frete para o total bater com o do Tiny
      v_tprod := public.tiny_num(p->>'total_produtos');
      v_desc := case when coalesce(p->>'valor_desconto', '') like '%\%%'
                     then round(v_tprod * public.tiny_num(replace(p->>'valor_desconto', '%', '')) / 100, 2)
                     else public.tiny_num(p->>'valor_desconto') end;
      v_outras := public.tiny_num(p->>'outras_despesas');
      v_frete := public.tiny_num(p->>'valor_frete') + v_outras;
      v_total_tiny := public.tiny_num(p->>'total_pedido');

      v_origem := case when nullif(btrim(coalesce(p->'ecommerce'->>'nomeEcommerce', p->'ecommerce'->>'nome', p->>'numero_ecommerce', '')), '') is not null
                       then 'marketplace' else 'tiny' end;
      v_obs := concat_ws(E'\n',
        nullif(btrim(coalesce(p->>'obs', '')), ''),
        case when nullif(btrim(coalesce(p->>'obs_interna', '')), '') is not null then 'Obs. interna no Tiny: ' || btrim(p->>'obs_interna') end,
        case when v_outras <> 0 then 'Outras despesas do Tiny somadas ao frete: ' || to_char(v_outras, 'FM999G999G990D00') end,
        'Importado do Tiny: pedido nº ' || coalesce(nullif(p->>'numero', ''), d.tiny_id) || coalesce(' (' || v_sit || ')', '')
          || coalesce(' · ' || nullif(btrim(coalesce(p->'ecommerce'->>'nomeEcommerce', '')), ''), '')
          || coalesce(' · pedido no marketplace ' || nullif(btrim(coalesce(p->>'numero_ecommerce', '')), ''), '')
          || coalesce(' · forma de pagamento: ' || nullif(btrim(coalesce(p->>'forma_pagamento', '')), ''), ''));

      insert into pedidos (cliente_id, origem, status, vendedor, vendedor_id, forma_pagamento, parcelas, primeiro_vencimento,
                           intervalo_dias, modalidade_frete, desconto, frete, observacoes, aprovado_em, estoque_baixado, created_at,
                           created_by, unidade_id, transportadora_id, codigo_rastreio, enviado_em,
                           id_externo, numero_externo, situacao_origem)
      values (v_cli, v_origem, v_status, coalesce((select nome from vendedores where id = v_vend), v_vend_nome), v_vend, v_forma, v_parcelas, v_venc,
              v_interv, v_mod, greatest(v_desc, 0), greatest(v_frete, 0), left(v_obs, 4000),
              case when v_status <> 'orcamento' then v_quando end,
              v_status in ('faturado', 'entregue'), v_quando, null, p_unidade, v_transp,
              nullif(left(btrim(coalesce(p->>'codigo_rastreamento', '')), 80), ''),
              case when public.tiny_data(p->>'data_envio') is not null
                   then (public.tiny_data(p->>'data_envio') + time '12:00') at time zone 'America/Sao_Paulo' end,
              'tiny:' || d.tiny_id, nullif(left(btrim(coalesce(p->>'numero', '')), 30), ''), v_sit)
      returning id into v_ped;

      -- itens: produto pelo ID do Tiny, código (SKU ou do fabricante) ou descrição igual; senão o genérico
      v_itens := 0;
      for it in select coalesce(x->'item', x) from jsonb_array_elements(case when jsonb_typeof(p->'itens') = 'array' then p->'itens' else '[]'::jsonb end) x loop
        v_qtd := public.tiny_num(it->>'quantidade');
        continue when v_qtd <= 0;
        v_vu := public.tiny_num(it->>'valor_unitario');
        v_cod := nullif(btrim(coalesce(it->>'codigo', '')), '');
        v_descr := coalesce(nullif(btrim(coalesce(it->>'descricao', '')), ''), v_cod, 'Item do pedido');
        v_prod := null;
        if nullif(btrim(coalesce(it->>'id_produto', '')), '') is not null then
          select coalesce(unificado_em, id) into v_prod from produtos where id_externo = btrim(it->>'id_produto') limit 1;
        end if;
        if v_prod is null and v_cod is not null then
          select coalesce(unificado_em, id) into v_prod from produtos where lower(btrim(sku)) = lower(v_cod) order by unificado_em nulls first, ativo desc limit 1;
        end if;
        if v_prod is null and v_cod is not null then
          select coalesce(unificado_em, id) into v_prod from produtos where lower(btrim(codigo_fabricante)) = lower(v_cod) order by unificado_em nulls first, ativo desc limit 1;
        end if;
        if v_prod is null then
          select coalesce(unificado_em, id) into v_prod from produtos where lower(btrim(descricao)) = lower(v_descr) order by unificado_em nulls first, ativo desc limit 1;
        end if;
        if v_prod is null then
          v_itens_sem_cadastro := v_itens_sem_cadastro + 1;
          v_prod := case when v_descr ~* '^(m[aá]quina|my ?frost (a|top|slim|queen|prime|sb))' then v_maquina else v_generico end;
        end if;
        insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, valor_unitario)
        values (v_ped, v_prod, left(case when v_cod is not null and v_prod in (v_generico, v_maquina) then v_cod || ' · ' || v_descr else v_descr end, 300),
                v_qtd, round(v_vu, 4));
        v_itens := v_itens + 1;
      end loop;
      -- pedido sem item com quantidade: um item com o valor dos produtos, para o total não sumir
      if v_itens = 0 and v_tprod > 0 then
        insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, valor_unitario)
        values (v_ped, v_generico, 'Itens do pedido do Tiny (sem detalhe)', 1, v_tprod);
      end if;

      select valor_total into v_total_erp from pedidos where id = v_ped;
      if v_total_tiny > 0 and abs(coalesce(v_total_erp, 0) - v_total_tiny) > 0.05 then v_divergentes := v_divergentes + 1; end if;
      update tiny_documentos set importado_em = now(), erro = null where tipo = 'pedido' and tiny_id = d.tiny_id;
      v_novos := v_novos + 1;
    exception when others then
      update tiny_documentos set erro = left(sqlerrm, 300) where tipo = 'pedido' and tiny_id = d.tiny_id;
      v_erros := v_erros || jsonb_build_object('pedido', coalesce(d.dados->>'numero', d.tiny_id), 'erro', left(sqlerrm, 200));
    end;
  end loop;

  return jsonb_build_object('novos', v_novos, 'existentes', v_existentes, 'clientes_novos', v_clientes_novos,
                            'itens_sem_cadastro', v_itens_sem_cadastro, 'total_diferente', v_divergentes, 'erros', v_erros);
end $$;
revoke all on function public.importar_pedidos_tiny(uuid, text[]) from public, anon;
grant execute on function public.importar_pedidos_tiny(uuid, text[]) to authenticated;
