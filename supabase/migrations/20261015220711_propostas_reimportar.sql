-- Propostas do Tiny: importar de novo a mesma planilha (ou o backup da My Frost) não apaga o próximo contato e a
-- situação que a equipe já mudou no ERP; a planilha só preenche o que está vazio. O resto continua igual.
-- Só troca o corpo da função; não apaga nem altera dados.

create or replace function public.importar_propostas_tiny(p_empresa text, p_propostas jsonb, p_unidade uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p jsonb; it jsonb; v_mf boolean; v_cli uuid; v_doc text; v_ext text; v_itens jsonb; v_prod uuid; v_sub numeric;
  v_desc numeric; v_frete numeric; v_ins boolean; v_unid uuid;
  v_novas int := 0; v_atualizadas int := 0; v_clientes_novos int := 0; v_sem_cliente int := 0; v_erros jsonb := '[]'::jsonb;
begin
  if not public.is_erp_admin() then raise exception 'só o administrador importa as propostas do Tiny'; end if;
  if p_empresa is null or p_empresa not in ('mf', 'my_frost') then raise exception 'empresa deve ser mf ou my_frost'; end if;
  if jsonb_typeof(p_propostas) is distinct from 'array' or jsonb_array_length(p_propostas) not between 1 and 500 then
    raise exception 'envie de 1 a 500 propostas por vez';
  end if;
  v_mf := p_empresa = 'mf';
  if v_mf and p_unidade is not null then select id into v_unid from unidades where id = p_unidade; end if;

  for p in select * from jsonb_array_elements(p_propostas) loop
    begin
      if nullif(btrim(coalesce(p->>'tiny_id', '')), '') is null then raise exception 'proposta sem ID do Tiny'; end if;
      v_doc := nullif(regexp_replace(coalesce(p->>'cpf_cnpj', ''), '\D', '', 'g'), '');
      if v_doc is not null and length(v_doc) not in (11, 14) then v_doc := null; end if;
      v_ext := nullif(btrim(coalesce(p->>'contato_id', '')), '');
      if v_ext is not null and not v_mf then v_ext := 'myfrost:' || v_ext; end if;

      -- o cliente: pelo código do Tiny, depois pelo CPF/CNPJ; unificado vale o que ficou
      v_cli := null;
      if v_ext is not null then
        select coalesce(unificado_em, id) into v_cli from clientes where id_externo = v_ext order by arquivado_em nulls first limit 1;
      end if;
      if v_cli is null and v_doc is not null then
        select coalesce(unificado_em, id) into v_cli from clientes where cpf_cnpj = v_doc order by arquivado_em nulls first limit 1;
      end if;

      if v_cli is null and not v_mf then
        -- My Frost: só de quem já é cliente (a base da My Frost entra pela importação própria)
        v_sem_cliente := v_sem_cliente + 1;
        continue;
      end if;
      if v_cli is null then
        if nullif(btrim(coalesce(p->>'nome', '')), '') is null then raise exception 'proposta sem cliente'; end if;
        insert into clientes (tipo_pessoa, nome, cpf_cnpj, inscricao_estadual, email, telefone, whatsapp, cep, logradouro, numero,
                              complemento, bairro, municipio, uf, id_externo)
        values (case when length(v_doc) = 11 or (v_doc is null and p->>'tipo_pessoa' = 'F') then 'PF' else 'PJ' end,
                left(btrim(p->>'nome'), 200), v_doc,
                nullif(left(btrim(coalesce(p->>'ie', '')), 30), ''),
                nullif(left(btrim(coalesce(p->>'email', '')), 200), ''),
                nullif(left(btrim(coalesce(p->>'fone', '')), 40), ''),
                nullif(left(btrim(coalesce(p->>'celular', '')), 40), ''),
                nullif(left(regexp_replace(coalesce(p->>'cep', ''), '\D', '', 'g'), 8), ''),
                nullif(left(btrim(coalesce(p->>'endereco', '')), 200), ''),
                nullif(left(btrim(coalesce(p->>'numero_end', '')), 20), ''),
                nullif(left(btrim(coalesce(p->>'complemento', '')), 100), ''),
                nullif(left(btrim(coalesce(p->>'bairro', '')), 100), ''),
                nullif(left(btrim(coalesce(p->>'municipio', '')), 100), ''),
                nullif(upper(left(btrim(coalesce(p->>'uf', '')), 2)), ''),
                v_ext)
        returning id into v_cli;
        v_clientes_novos := v_clientes_novos + 1;
      end if;

      -- itens: na MF com valor e o produto do ERP (pelo código do Tiny); na My Frost só descrição e quantidade
      v_itens := '[]'::jsonb; v_sub := 0;
      for it in select * from jsonb_array_elements(coalesce(p->'itens', '[]'::jsonb)) loop
        continue when nullif(btrim(coalesce(it->>'descricao', '')), '') is null;
        if v_mf then
          v_prod := null;
          if nullif(btrim(coalesce(it->>'tiny_produto_id', '')), '') is not null then
            select id into v_prod from produtos where id_externo = btrim(it->>'tiny_produto_id') limit 1;
          end if;
          v_itens := v_itens || jsonb_build_object(
            'descricao', left(btrim(it->>'descricao'), 300),
            'quantidade', coalesce((it->>'quantidade')::numeric, 1),
            'valor_unitario', round(coalesce((it->>'valor_unitario')::numeric, 0), 2),
            'produto_id', v_prod);
          v_sub := v_sub + coalesce((it->>'quantidade')::numeric, 1) * coalesce((it->>'valor_unitario')::numeric, 0);
        else
          v_itens := v_itens || jsonb_build_object(
            'descricao', left(btrim(it->>'descricao'), 300),
            'quantidade', coalesce((it->>'quantidade')::numeric, 1));
        end if;
      end loop;
      v_desc := case when v_mf then round(coalesce((p->>'desconto')::numeric, 0), 2) end;
      v_frete := case when v_mf then round(coalesce((p->>'frete')::numeric, 0), 2) end;

      insert into propostas_tiny as t (empresa, tiny_id, numero, data, proximo_contato, situacao, vendedor, cliente_id, contato_nome,
                                       aos_cuidados, unidade_id, validade_dias, prazo_entrega, observacoes, desconto, frete, total, itens)
      values (p_empresa, btrim(p->>'tiny_id'),
              case when coalesce(p->>'numero', '') ~ '^\d{1,9}$' then (p->>'numero')::int end,
              case when coalesce(p->>'data', '') ~ '^\d{4}-\d{2}-\d{2}$' then (p->>'data')::date end,
              case when coalesce(p->>'proximo_contato', '') ~ '^\d{4}-\d{2}-\d{2}$' then (p->>'proximo_contato')::date end,
              nullif(left(btrim(coalesce(p->>'situacao', '')), 40), ''),
              nullif(left(btrim(coalesce(p->>'vendedor', '')), 100), ''),
              v_cli,
              nullif(left(btrim(coalesce(p->>'nome', '')), 200), ''),
              nullif(left(btrim(coalesce(p->>'aos_cuidados', '')), 120), ''),
              v_unid,
              case when coalesce(p->>'validade', '') ~ '^\d{1,4}$' then (p->>'validade')::int end,
              case when v_mf then nullif(left(btrim(coalesce(p->>'prazo_entrega', '')), 300), '') end,
              case when v_mf then nullif(left(btrim(coalesce(p->>'observacoes', '')), 4000), '') end,
              v_desc, v_frete,
              case when v_mf then greatest(round(v_sub - v_desc + v_frete, 2), 0) end,
              v_itens)
      on conflict (empresa, tiny_id) do update set
        numero = excluded.numero, data = excluded.data,
        -- próximo contato e situação mudados no ERP ficam (a planilha só preenche o que está vazio)
        proximo_contato = coalesce(t.proximo_contato, excluded.proximo_contato), situacao = coalesce(t.situacao, excluded.situacao),
        vendedor = excluded.vendedor, cliente_id = excluded.cliente_id, contato_nome = excluded.contato_nome,
        aos_cuidados = excluded.aos_cuidados, unidade_id = coalesce(excluded.unidade_id, t.unidade_id),
        validade_dias = excluded.validade_dias, prazo_entrega = excluded.prazo_entrega, observacoes = excluded.observacoes,
        desconto = excluded.desconto, frete = excluded.frete, total = excluded.total, itens = excluded.itens, updated_at = now()
      returning (xmax = 0) into v_ins;
      if v_ins then v_novas := v_novas + 1; else v_atualizadas := v_atualizadas + 1; end if;
    exception when others then
      v_erros := v_erros || jsonb_build_object('proposta', left(coalesce(p->>'numero', p->>'tiny_id', '?'), 20), 'erro', left(sqlerrm, 200));
    end;
  end loop;

  return jsonb_build_object('novas', v_novas, 'atualizadas', v_atualizadas, 'clientes_novos', v_clientes_novos,
                            'sem_cliente', v_sem_cliente, 'erros', v_erros);
end $$;

