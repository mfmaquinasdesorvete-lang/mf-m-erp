-- Importação de contatos (planilha ou API do Tiny): traz os campos do cadastro do Tiny que antes ficavam de fora.
-- Data de cadastro (vale como "cliente desde"), site, fax/telefone 2, e-mail da NF-e, inscrição municipal, Suframa,
-- regime tributário (CRT), data de nascimento, limite de crédito, pessoas de contato, vendedor e endereço de cobrança.
-- Valor vindo do Tiny preenche o campo; o que foi digitado no ERP e não veio na planilha continua como está.
-- Pessoas de contato, nascimento e vendedor só entram se o campo estiver vazio no ERP.

create or replace function public.importar_contatos(p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_ext text; v_nome text; v_doc text; v_tipos jsonb; v_id uuid;
  v_fone text; v_cel text; v_cep text; v_ie text; v_uf text; v_email text; v_pessoa text; v_contrib int;
  v_fone2 text; v_email_nfe text; v_crt smallint; v_limite numeric; v_vendedor uuid; v_cob_end text; v_cob_cep text; v_cob_uf text;
  v_cli int := 0; v_forn int := 0; v_transp int := 0; v_atual int := 0;
begin
  if not public.tem_papel('financeiro') then raise exception 'sem permissão para importar cadastros'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 1000 then raise exception 'lista inválida'; end if;

  for v in select * from jsonb_array_elements(p_itens) loop
    v_ext := nullif(trim(v->>'id_externo'), '');
    v_nome := nullif(trim(v->>'nome'), '');
    if v_nome is null then continue; end if;
    v_doc   := nullif(regexp_replace(coalesce(v->>'cpf_cnpj', ''), '\D', '', 'g'), '');
    v_fone  := nullif(left(regexp_replace(coalesce(v->>'fone', ''), '\D', '', 'g'), 13), '');
    v_cel   := nullif(left(regexp_replace(coalesce(v->>'celular', ''), '\D', '', 'g'), 13), '');
    v_cep   := nullif(left(regexp_replace(coalesce(v->>'cep', ''), '\D', '', 'g'), 8), '');
    v_uf    := nullif(upper(left(regexp_replace(coalesce(v->>'uf', ''), '[^A-Za-z]', '', 'g'), 2)), '');
    v_email := nullif(lower(trim(v->>'email')), '');
    v_ie    := case when trim(coalesce(v->>'ie', '')) ~* '^i' then 'ISENTO'
                    else nullif(upper(left(regexp_replace(coalesce(v->>'ie', ''), '[^0-9A-Za-z]', '', 'g'), 14)), '') end;
    v_pessoa := case when length(v_doc) = 11 then 'PF' when length(v_doc) = 14 then 'PJ'
                     when v->>'tipo_pessoa' = 'F' then 'PF' when v->>'tipo_pessoa' = 'J' then 'PJ' end;
    v_contrib := case when v->>'contribuinte' in ('1', '2', '9') then (v->>'contribuinte')::int end;
    v_tipos := case when jsonb_typeof(v->'tipos') = 'array' and jsonb_array_length(v->'tipos') > 0 then v->'tipos' else '["cliente"]'::jsonb end;
    -- campos novos (vazios quando a planilha não tem a coluna)
    v_fone2 := nullif(left(regexp_replace(coalesce(v->>'fone2', ''), '\D', '', 'g'), 13), '');
    v_email_nfe := nullif(lower(trim(v->>'email_nfe')), '');
    v_crt := case when v->>'crt' in ('1', '2', '3') then (v->>'crt')::smallint end;
    v_limite := case when coalesce(v->>'limite_credito', '') ~ '^\d{1,12}(\.\d{1,2})?$' and (v->>'limite_credito')::numeric > 0
                     then (v->>'limite_credito')::numeric end;
    v_vendedor := case when nullif(trim(v->>'vendedor'), '') is not null then
                    (select ve.id from vendedores ve where lower(trim(ve.nome)) = lower(trim(v->>'vendedor')) order by ve.ativo desc limit 1) end;
    v_cob_end := nullif(trim(v->>'cob_endereco'), '');
    v_cob_cep := nullif(left(regexp_replace(coalesce(v->>'cob_cep', ''), '\D', '', 'g'), 8), '');
    v_cob_uf  := nullif(upper(left(regexp_replace(coalesce(v->>'cob_uf', ''), '[^A-Za-z]', '', 'g'), 2)), '');

    if v_tipos ? 'cliente' then
      v_id := null;
      select id into v_id from clientes
       where (v_ext is not null and id_externo = v_ext) or (v_doc is not null and cpf_cnpj = v_doc)
          or (v_ext is null and v_doc is null and lower(trim(nome)) = lower(v_nome))
       order by (id_externo = v_ext) desc nulls last limit 1;
      if v_id is null then
        insert into clientes (nome) values (v_nome) returning id into v_id; v_cli := v_cli + 1;
      else v_atual := v_atual + 1; end if;
      update clientes set
        id_externo = coalesce(v_ext, id_externo), nome = v_nome,
        nome_fantasia = coalesce(nullif(trim(v->>'fantasia'), ''), nome_fantasia),
        tipo_pessoa = coalesce(v_pessoa, tipo_pessoa),
        cpf_cnpj = coalesce(v_doc, cpf_cnpj),
        inscricao_estadual = coalesce(v_ie, inscricao_estadual),
        contribuinte_icms = coalesce(v_contrib, contribuinte_icms),
        email = coalesce(v_email, email),
        telefone = coalesce(v_fone, telefone),
        whatsapp = coalesce(v_cel, whatsapp),
        cep = coalesce(v_cep, cep),
        logradouro = coalesce(nullif(trim(v->>'endereco'), ''), logradouro),
        numero = coalesce(nullif(trim(v->>'numero'), ''), numero),
        complemento = coalesce(nullif(trim(v->>'complemento'), ''), complemento),
        bairro = coalesce(nullif(trim(v->>'bairro'), ''), bairro),
        municipio = coalesce(nullif(trim(v->>'cidade'), ''), municipio),
        uf = coalesce(v_uf, uf),
        observacoes = coalesce(observacoes, nullif(trim(v->>'obs'), '')),
        compra_maquina_em = coalesce(compra_maquina_em, public.data_ou_nula(v->>'compra_maquina')),
        cadastro_origem_em = coalesce(public.data_ou_nula(v->>'cadastro_em'), cadastro_origem_em),
        website = coalesce(nullif(trim(v->>'site'), ''), website),
        telefone_adicional = coalesce(v_fone2, telefone_adicional),
        email_nfe = coalesce(v_email_nfe, email_nfe),
        inscricao_municipal = coalesce(nullif(trim(v->>'im'), ''), inscricao_municipal),
        inscricao_suframa = coalesce(nullif(trim(v->>'suframa'), ''), inscricao_suframa),
        regime_tributario = coalesce(v_crt, regime_tributario),
        data_nascimento = coalesce(data_nascimento, public.data_ou_nula(v->>'nascimento')),
        limite_credito = coalesce(v_limite, limite_credito),
        contato_observacoes = coalesce(nullif(trim(contato_observacoes), ''), nullif(trim(v->>'pessoas_contato'), '')),
        vendedor_id = coalesce(vendedor_id, v_vendedor),
        cobranca_diferente = cobranca_diferente or (v_cob_end is not null
          and lower(v_cob_end) <> lower(coalesce(nullif(trim(v->>'endereco'), ''), logradouro, ''))),
        cobranca_cep = coalesce(v_cob_cep, cobranca_cep),
        cobranca_logradouro = coalesce(v_cob_end, cobranca_logradouro),
        cobranca_numero = coalesce(nullif(trim(v->>'cob_numero'), ''), cobranca_numero),
        cobranca_complemento = coalesce(nullif(trim(v->>'cob_complemento'), ''), cobranca_complemento),
        cobranca_bairro = coalesce(nullif(trim(v->>'cob_bairro'), ''), cobranca_bairro),
        cobranca_municipio = coalesce(nullif(trim(v->>'cob_cidade'), ''), cobranca_municipio),
        cobranca_uf = coalesce(v_cob_uf, cobranca_uf)
      where id = v_id;
    end if;

    if v_tipos ? 'fornecedor' then
      v_id := null;
      select id into v_id from fornecedores
       where (v_ext is not null and id_externo = v_ext) or (v_doc is not null and cnpj = v_doc) or lower(trim(nome)) = lower(v_nome)
       order by (id_externo = v_ext) desc nulls last, (cnpj = v_doc) desc nulls last limit 1;
      if v_id is null then
        insert into fornecedores (nome) values (v_nome) returning id into v_id; v_forn := v_forn + 1;
      else v_atual := v_atual + 1; end if;
      update fornecedores set
        id_externo = coalesce(v_ext, id_externo), nome = v_nome,
        nome_fantasia = coalesce(nullif(trim(v->>'fantasia'), ''), nome_fantasia),
        cnpj = coalesce(v_doc, cnpj),
        inscricao_estadual = coalesce(v_ie, inscricao_estadual),
        email = coalesce(v_email, email),
        telefone = coalesce(v_fone, telefone),
        whatsapp = coalesce(v_cel, whatsapp),
        cep = coalesce(v_cep, cep),
        logradouro = coalesce(nullif(trim(v->>'endereco'), ''), logradouro),
        numero = coalesce(nullif(trim(v->>'numero'), ''), numero),
        complemento = coalesce(nullif(trim(v->>'complemento'), ''), complemento),
        bairro = coalesce(nullif(trim(v->>'bairro'), ''), bairro),
        municipio = coalesce(nullif(trim(v->>'cidade'), ''), municipio),
        uf = coalesce(v_uf, uf),
        observacoes = coalesce(observacoes, nullif(trim(v->>'obs'), '')),
        site = coalesce(site, nullif(trim(v->>'site'), ''))
      where id = v_id;
    end if;

    if v_tipos ? 'transportadora' then
      v_id := null;
      select id into v_id from transportadoras
       where (v_ext is not null and id_externo = v_ext) or (v_doc is not null and cnpj = v_doc)
          or (v_ext is null and v_doc is null and lower(trim(nome)) = lower(v_nome))
       order by (id_externo = v_ext) desc nulls last limit 1;
      if v_id is null then
        insert into transportadoras (nome) values (v_nome) returning id into v_id; v_transp := v_transp + 1;
      else v_atual := v_atual + 1; end if;
      update transportadoras set
        id_externo = coalesce(v_ext, id_externo), nome = v_nome,
        nome_fantasia = coalesce(nullif(trim(v->>'fantasia'), ''), nome_fantasia),
        cnpj = coalesce(v_doc, cnpj),
        inscricao_estadual = coalesce(v_ie, inscricao_estadual),
        email = coalesce(v_email, email),
        telefone = coalesce(v_fone, telefone),
        whatsapp = coalesce(v_cel, whatsapp),
        cep = coalesce(v_cep, cep),
        logradouro = coalesce(nullif(trim(v->>'endereco'), ''), logradouro),
        numero = coalesce(nullif(trim(v->>'numero'), ''), numero),
        complemento = coalesce(nullif(trim(v->>'complemento'), ''), complemento),
        bairro = coalesce(nullif(trim(v->>'bairro'), ''), bairro),
        municipio = coalesce(nullif(trim(v->>'cidade'), ''), municipio),
        uf = coalesce(v_uf, uf),
        observacoes = coalesce(observacoes, nullif(trim(v->>'obs'), ''))
      where id = v_id;
    end if;
  end loop;

  return jsonb_build_object('clientes', v_cli, 'fornecedores', v_forn, 'transportadoras', v_transp, 'atualizados', v_atual);
end $$;
