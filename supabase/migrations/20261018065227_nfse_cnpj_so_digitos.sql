-- NFS-e importadas: a unidade e o fornecedor são achados pelo CNPJ só com os números, venha o cadastro com ou sem
-- pontos e barra (o CNPJ da filial SP estava gravado com máscara e as NFS-e dela não eram ligadas à unidade).
-- Mesma função de 20261017071215_nfse_importadas.sql, só com as três comparações por public.so_digitos.
create or replace function public.importar_nfse(p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_tipo text; v_unidade uuid; v_prest text; v_toma text; v_numero text; v_rps text; v_chave text; v_id uuid;
  v_cliente uuid; v_fornecedor uuid; v_valor numeric; v_data date; v_situacao text;
  v_novas int := 0; v_atual int := 0; v_ign int := 0; v_motivos jsonb := '[]'::jsonb;
begin
  if not public.tem_papel('financeiro') then raise exception 'sem permissão para importar notas de serviço'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 500 then raise exception 'lista inválida'; end if;

  for v in select * from jsonb_array_elements(p_itens) loop
    v_prest := nullif(regexp_replace(coalesce(v->>'prestador_doc', ''), '\D', '', 'g'), '');
    v_toma := nullif(regexp_replace(coalesce(v->>'tomador_doc', ''), '\D', '', 'g'), '');
    v_numero := nullif(ltrim(trim(coalesce(v->>'numero', '')), '0'), '');
    v_rps := nullif(ltrim(trim(coalesce(v->>'rps', '')), '0'), '');
    v_valor := case when coalesce(v->>'valor_servicos', '') ~ '^\d{1,12}(\.\d{1,2})?$' then (v->>'valor_servicos')::numeric end;
    v_data := public.data_ou_nula(v->>'data_emissao');

    -- de quem é a nota
    v_unidade := null; v_tipo := null;
    if v_prest is not null then
      select id, 'emitida' into v_unidade, v_tipo from unidades where public.so_digitos(cnpj) = v_prest limit 1;
    end if;
    if v_unidade is null and v_toma is not null then
      select id, 'tomada' into v_unidade, v_tipo from unidades where public.so_digitos(cnpj) = v_toma limit 1;
    end if;
    if v_unidade is null and v->>'origem' = 'tiny' and v->>'tipo' = 'emitida' then
      select id, 'emitida' into v_unidade, v_tipo from unidades
       where coalesce(v->>'unidade_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and id = (v->>'unidade_id')::uuid;
    end if;

    if v_unidade is null then
      v_ign := v_ign + 1; v_motivos := v_motivos || to_jsonb(coalesce(v->>'arquivo', 'nota') || ': nem o prestador nem o tomador é uma unidade da MF');
      continue;
    end if;
    if v_valor is null or v_valor <= 0 or v_data is null or (v_numero is null and v_rps is null) then
      v_ign := v_ign + 1; v_motivos := v_motivos || to_jsonb(coalesce(v->>'arquivo', 'nota') || ': sem número, data ou valor');
      continue;
    end if;

    v_chave := v_tipo || ':' || coalesce(case when v_tipo = 'emitida' then v_unidade::text else v_prest end, v_unidade::text)
               || ':' || coalesce('n' || v_numero, 'r' || v_rps);
    v_situacao := case when v->>'situacao' = 'cancelada' then 'cancelada' when v_numero is null then 'sem_numero' else 'normal' end;

    v_cliente := null; v_fornecedor := null;
    if v_tipo = 'emitida' then
      if v_toma is not null then
        select id into v_cliente from clientes where cpf_cnpj = v_toma and arquivado_em is null order by created_at limit 1;
      end if;
      if v_cliente is null and nullif(trim(v->>'tomador_nome'), '') is not null then
        select min(id::text)::uuid into v_cliente from clientes
         where lower(trim(nome)) = lower(trim(v->>'tomador_nome')) and arquivado_em is null
        having count(*) = 1;
      end if;
    elsif v_prest is not null then
      select id into v_fornecedor from fornecedores where public.so_digitos(cnpj) = v_prest order by created_at limit 1;
    end if;

    -- a mesma nota já importada (pela chave, ou o RPS sem número que agora chegou com número)
    v_id := null;
    select id into v_id from nfse_importadas
     where chave = v_chave
        or (v_rps is not null and tipo = v_tipo and unidade_id = v_unidade and rps = v_rps
            and (v_tipo = 'emitida' or prestador_doc = v_prest))
     order by (chave = v_chave) desc limit 1;

    if v_id is null then
      insert into nfse_importadas (tipo, unidade_id, chave, data_emissao, valor_servicos, origem)
      values (v_tipo, v_unidade, v_chave, v_data, v_valor, case when v->>'origem' = 'tiny' then 'tiny' else 'xml' end)
      returning id into v_id;
      v_novas := v_novas + 1;
    else
      v_atual := v_atual + 1;
    end if;

    update nfse_importadas set
      chave = v_chave,
      numero = coalesce(v_numero, numero),
      rps = coalesce(v_rps, rps),
      codigo_verificacao = coalesce(nullif(trim(v->>'codigo_verificacao'), ''), codigo_verificacao),
      chave_acesso = coalesce(nullif(trim(v->>'chave_acesso'), ''), chave_acesso),
      data_emissao = v_data,
      competencia = coalesce(public.data_ou_nula(v->>'competencia'), competencia),
      prestador_doc = coalesce(v_prest, prestador_doc),
      prestador_nome = coalesce(nullif(trim(v->>'prestador_nome'), ''), prestador_nome),
      tomador_doc = coalesce(v_toma, tomador_doc),
      tomador_nome = coalesce(nullif(trim(v->>'tomador_nome'), ''), tomador_nome),
      municipio = coalesce(nullif(trim(v->>'municipio'), ''), municipio),
      cliente_id = coalesce(cliente_id, v_cliente),
      fornecedor_id = coalesce(fornecedor_id, v_fornecedor),
      valor_servicos = v_valor,
      valor_iss = coalesce(nullif(v->>'valor_iss', '')::numeric, valor_iss),
      iss_retido = coalesce((v->>'iss_retido')::boolean, iss_retido),
      valor_ir = coalesce(nullif(v->>'valor_ir', '')::numeric, valor_ir),
      valor_inss = coalesce(nullif(v->>'valor_inss', '')::numeric, valor_inss),
      valor_pis = coalesce(nullif(v->>'valor_pis', '')::numeric, valor_pis),
      valor_cofins = coalesce(nullif(v->>'valor_cofins', '')::numeric, valor_cofins),
      valor_csll = coalesce(nullif(v->>'valor_csll', '')::numeric, valor_csll),
      valor_liquido = coalesce(nullif(v->>'valor_liquido', '')::numeric, valor_liquido),
      discriminacao = coalesce(nullif(left(trim(v->>'discriminacao'), 4000), ''), discriminacao),
      codigo_servico = coalesce(nullif(trim(v->>'codigo_servico'), ''), codigo_servico),
      situacao = case when situacao = 'cancelada' then 'cancelada' else v_situacao end,
      origem = case when v->>'origem' = 'xml' then 'xml' else origem end,
      updated_at = now()
    where id = v_id;
  end loop;

  return jsonb_build_object('novas', v_novas, 'atualizadas', v_atual, 'ignoradas', v_ign, 'motivos', v_motivos);
end $$;
