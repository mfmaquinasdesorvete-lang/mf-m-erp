-- =====================================================================
-- Importação direta do Tiny / Olist ERP pela API (função tiny-importar):
-- contatos (clientes, fornecedores, transportadoras), produtos com estoque
-- e contas a receber/pagar em aberto.
--   * id_externo guarda o ID do Tiny: importar de novo atualiza, não duplica
--   * importacao_tiny guarda onde a importação parou (o Tiny limita as
--     consultas por minuto; a tela continua de onde parou)
-- Idempotente: pode rodar de novo sem erro.
-- =====================================================================

alter table public.clientes        add column if not exists id_externo text unique;
alter table public.fornecedores    add column if not exists id_externo text unique;
alter table public.transportadoras add column if not exists id_externo text unique;
alter table public.contas_receber  add column if not exists id_externo text unique;
alter table public.contas_pagar    add column if not exists id_externo text unique;

create table if not exists public.importacao_tiny (
  id            int primary key default 1 check (id = 1),
  etapa         text not null default 'contatos',
  pagina        int not null default 1,
  indice        int not null default 0,
  unidade_id    uuid references public.unidades(id),
  totais        jsonb not null default '{}'::jsonb,
  erros         jsonb not null default '[]'::jsonb,
  iniciado_por  uuid,
  iniciado_em   timestamptz,
  atualizado_em timestamptz,
  concluido_em  timestamptz
);
alter table public.importacao_tiny enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'importacao_tiny' and policyname = 'importacao_tiny_ler') then
    create policy importacao_tiny_ler on public.importacao_tiny for select to authenticated using (public.tem_papel('financeiro'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Contatos. p_itens: { id_externo, nome, fantasia, tipo_pessoa (F/J), cpf_cnpj, ie, contribuinte (1/2/9),
--   email, fone, celular, cep, endereco, numero, complemento, bairro, cidade, uf, obs,
--   tipos: ["cliente","fornecedor","transportadora"] }
-- Acha pelo ID do Tiny ou pelo CPF/CNPJ; o que vier preenchido do Tiny substitui.
-- ---------------------------------------------------------------------
create or replace function public.importar_contatos(p_itens jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v jsonb;
  v_ext text; v_nome text; v_doc text; v_tipos jsonb; v_id uuid;
  v_fone text; v_cel text; v_cep text; v_ie text; v_uf text; v_email text; v_pessoa text; v_contrib int;
  v_cli int := 0; v_forn int := 0; v_transp int := 0; v_atual int := 0;
begin
  if not public.tem_papel('financeiro') then raise exception 'sem permissão para importar cadastros'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 1000 then raise exception 'lista inválida'; end if;

  for v in select * from jsonb_array_elements(p_itens) loop
    v_ext := nullif(trim(v->>'id_externo'), '');
    v_nome := nullif(trim(v->>'nome'), '');
    if v_ext is null or v_nome is null then continue; end if;
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

    if v_tipos ? 'cliente' then
      v_id := null;
      select id into v_id from clientes
       where id_externo = v_ext or (v_doc is not null and cpf_cnpj = v_doc)
       order by (id_externo = v_ext) desc nulls last limit 1;
      if v_id is null then
        insert into clientes (nome) values (v_nome) returning id into v_id; v_cli := v_cli + 1;
      else v_atual := v_atual + 1; end if;
      update clientes set
        id_externo = v_ext, nome = v_nome,
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
        observacoes = coalesce(observacoes, nullif(trim(v->>'obs'), ''))
      where id = v_id;
    end if;

    if v_tipos ? 'fornecedor' then
      v_id := null;
      select id into v_id from fornecedores
       where id_externo = v_ext or (v_doc is not null and cnpj = v_doc) or lower(trim(nome)) = lower(v_nome)
       order by (id_externo = v_ext) desc nulls last, (cnpj = v_doc) desc nulls last limit 1;
      if v_id is null then
        insert into fornecedores (nome) values (v_nome) returning id into v_id; v_forn := v_forn + 1;
      else v_atual := v_atual + 1; end if;
      update fornecedores set
        id_externo = v_ext, nome = v_nome,
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

    if v_tipos ? 'transportadora' then
      v_id := null;
      select id into v_id from transportadoras
       where id_externo = v_ext or (v_doc is not null and cnpj = v_doc)
       order by (id_externo = v_ext) desc nulls last limit 1;
      if v_id is null then
        insert into transportadoras (nome) values (v_nome) returning id into v_id; v_transp := v_transp + 1;
      else v_atual := v_atual + 1; end if;
      update transportadoras set
        id_externo = v_ext, nome = v_nome,
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
revoke execute on function public.importar_contatos(jsonb) from public, anon;
grant execute on function public.importar_contatos(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Contas em aberto. p_tipo 'receber' | 'pagar'; p_itens: { id_externo, nome, historico, numero_doc,
--   emissao (aaaa-mm-dd), vencimento (aaaa-mm-dd), valor, saldo }
-- Entra só o que ainda falta pagar (saldo); conta já importada é ignorada.
-- Cliente/fornecedor pelo nome (cria se não existir).
-- ---------------------------------------------------------------------
create or replace function public.importar_contas(p_tipo text, p_itens jsonb, p_unidade uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v jsonb;
  v_ext text; v_nome text; v_doc text; v_valor numeric; v_total numeric; v_venc date; v_pessoa uuid; v_desc text;
  v_criadas int := 0; v_existentes int := 0; v_ignoradas int := 0; v_cadastros int := 0;
begin
  if not public.tem_papel('financeiro') then raise exception 'sem permissão para importar contas'; end if;
  if p_tipo not in ('receber', 'pagar') then raise exception 'tipo inválido'; end if;
  if p_unidade is null or not exists (select 1 from unidades where id = p_unidade) then raise exception 'escolha a unidade'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 1000 then raise exception 'lista inválida'; end if;

  for v in select * from jsonb_array_elements(p_itens) loop
    v_ext := nullif(trim(v->>'id_externo'), '');
    if v_ext is null then continue; end if;
    if (p_tipo = 'receber' and exists (select 1 from contas_receber where id_externo = v_ext))
       or (p_tipo = 'pagar' and exists (select 1 from contas_pagar where id_externo = v_ext)) then
      v_existentes := v_existentes + 1; continue;
    end if;
    v_total := nullif(v->>'valor', '')::numeric;
    v_valor := coalesce(nullif(nullif(v->>'saldo', '')::numeric, 0), v_total);
    v_venc := nullif(v->>'vencimento', '')::date;
    if v_valor is null or v_valor <= 0 or v_venc is null then v_ignoradas := v_ignoradas + 1; continue; end if;

    v_nome := nullif(trim(v->>'nome'), '');
    v_doc := nullif(trim(v->>'numero_doc'), '');
    v_desc := left(coalesce(nullif(trim(v->>'historico'), ''), case when p_tipo = 'receber' then 'Conta a receber' else 'Conta a pagar' end)
              || case when v_doc is not null and p_tipo = 'receber' then ' (doc. ' || v_doc || ')' else '' end, 300);
    v_pessoa := null;

    if p_tipo = 'receber' then
      if v_nome is not null then
        select id into v_pessoa from clientes where lower(trim(nome)) = lower(v_nome) or lower(trim(nome_fantasia)) = lower(v_nome) limit 1;
        if v_pessoa is null then insert into clientes (nome) values (v_nome) returning id into v_pessoa; v_cadastros := v_cadastros + 1; end if;
      end if;
      insert into contas_receber (id_externo, descricao, cliente_id, valor, vencimento, status, unidade_id)
      values (v_ext, v_desc, v_pessoa, v_valor, v_venc, 'aberto', p_unidade);
    else
      if v_nome is not null then
        select id into v_pessoa from fornecedores where lower(trim(nome)) = lower(v_nome) or lower(trim(nome_fantasia)) = lower(v_nome) limit 1;
        if v_pessoa is null then insert into fornecedores (nome) values (v_nome) returning id into v_pessoa; v_cadastros := v_cadastros + 1; end if;
      end if;
      insert into contas_pagar (id_externo, descricao, fornecedor_id, documento, valor, vencimento, status, unidade_id, observacoes)
      values (v_ext, v_desc, v_pessoa, v_doc, v_valor, v_venc, 'aberto', p_unidade,
              'Importada do Tiny' || case when nullif(v->>'emissao', '') is not null then ' (emissão ' || to_char((v->>'emissao')::date, 'DD/MM/YYYY') || ')' else '' end
              || case when v_total is not null and v_total <> v_valor then '. Valor original R$ ' || replace(to_char(v_total, 'FM999999990.00'), '.', ',') || ', falta pagar o saldo' else '' end);
    end if;
    v_criadas := v_criadas + 1;
  end loop;

  return jsonb_build_object('criadas', v_criadas, 'ja_existiam', v_existentes, 'ignoradas', v_ignoradas, 'cadastros_criados', v_cadastros);
end $$;
revoke execute on function public.importar_contas(text, jsonb, uuid) from public, anon;
grant execute on function public.importar_contas(text, jsonb, uuid) to authenticated;
