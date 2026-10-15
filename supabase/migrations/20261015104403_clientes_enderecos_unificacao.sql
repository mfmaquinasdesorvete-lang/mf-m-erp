-- =====================================================================
-- Cadastro de clientes
--  * até 3 endereços: o principal (com etiqueta) e mais 2 em enderecos_extras, cada um com etiqueta
--    (Loja, Residência, Prédio, Vizinho… ou outra digitada);
--  * e-mail: com um só preenchido, ele vale para o e-mail e para o da NF-e (e o da NF-e acompanha a troca do principal
--    enquanto forem iguais); os cadastros que já existiam recebem o mesmo e-mail no da NF-e em seguida (atualização à parte);
--  * unificar não perde nada: o que só o outro tinha completa o principal; o que é diferente fica no principal
--    (endereço vira endereço 2/3, nome, e-mail e telefone viram pessoa de contato) e o cadastro ganha o aviso
--    "Cadastro unificado" com tudo o que veio de cada um. O outro continua guardado (arquivado) como estava.
-- Somente acréscimos: colunas novas, uma regra de e-mail, funções novas e unificar_clientes com o mesmo nome e entrada.
-- =====================================================================

alter table public.clientes
  add column if not exists endereco_etiqueta text,
  add column if not exists enderecos_extras jsonb not null default '[]'::jsonb,
  add column if not exists unificacoes jsonb not null default '[]'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_ate_3_enderecos') then
    alter table public.clientes add constraint clientes_ate_3_enderecos
      check (jsonb_typeof(enderecos_extras) = 'array' and jsonb_array_length(enderecos_extras) <= 2);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- E-mail: um só preenchido vale para os dois campos
-- ---------------------------------------------------------------------
create or replace function public.trg_cliente_emails()
returns trigger language plpgsql set search_path = public as $$
begin
  new.email := nullif(btrim(new.email), '');
  new.email_nfe := nullif(btrim(new.email_nfe), '');
  -- trocou o e-mail principal e o da NF-e era o mesmo (e não foi mexido): acompanha
  if tg_op = 'UPDATE' and new.email is distinct from old.email and new.email_nfe is not distinct from old.email_nfe
     and lower(coalesce(old.email_nfe, '')) = lower(coalesce(old.email, '')) then
    new.email_nfe := new.email;
  end if;
  if new.email_nfe is null then new.email_nfe := new.email; end if;
  if new.email is null then new.email := new.email_nfe; end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_cliente_emails' and tgrelid = 'public.clientes'::regclass) then
    create trigger trg_cliente_emails before insert or update of email, email_nfe on public.clientes
      for each row execute function public.trg_cliente_emails();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Endereço: chave para comparar (CEP + número + começo da rua) e texto para mostrar
-- ---------------------------------------------------------------------
create or replace function public.endereco_chave(e jsonb)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(coalesce(e->>'cep', ''), '\D', '', 'g') || '|' || lower(regexp_replace(coalesce(e->>'numero', ''), '\s', '', 'g'))
         || '|' || left(lower(regexp_replace(coalesce(e->>'logradouro', ''), '[^[:alnum:]]', '', 'g')), 12);
$$;

create or replace function public.endereco_texto(e jsonb)
returns text language sql immutable set search_path = public as $$
  select nullif(concat_ws(' - ',
           nullif(concat_ws(', ', nullif(btrim(e->>'logradouro'), ''), nullif(btrim(e->>'numero'), '')), ''),
           nullif(btrim(e->>'complemento'), ''),
           nullif(btrim(e->>'bairro'), ''),
           nullif(concat_ws('/', nullif(btrim(e->>'municipio'), ''), nullif(btrim(e->>'uf'), '')), '')), '');
$$;

-- ---------------------------------------------------------------------
-- O que é diferente no cadastro que sai fica no principal (endereço extra, pessoa de contato) + aviso
--   o: o cadastro que sai, como estava (to_jsonb da linha ou dados_arquivados)
--   p_completou: campos vazios do principal que o outro preencheu
-- ---------------------------------------------------------------------
create or replace function public.unificacao_registrar(p_manter uuid, o jsonb, p_por text default null, p_completou text[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.clientes;
  v_extras jsonb;
  v_lista jsonb;
  e jsonb;
  v_chave text;
  v_trouxe text[] := '{}';
  v_fora text[] := '{}';
  v_nome text := nullif(btrim(o->>'nome'), '');
  v_email text := lower(nullif(btrim(o->>'email'), ''));
  v_email2 text := lower(nullif(btrim(o->>'email_nfe'), ''));
  v_tel text;
  v_doc text := regexp_replace(coalesce(o->>'cpf_cnpj', ''), '\D', '', 'g');
  v_doc_m text;
  v_meus_tel text[];
  v_entrada jsonb;
  t text;
begin
  select * into m from public.clientes where id = p_manter for update;
  if m.id is null then raise exception 'cliente principal não encontrado'; end if;
  -- já registrado (o mesmo cadastro de origem): não repete
  if exists (select 1 from jsonb_array_elements(m.unificacoes) u where u->>'id' = o->>'id') then return null; end if;
  v_doc_m := regexp_replace(coalesce(m.cpf_cnpj, ''), '\D', '', 'g');

  -- endereços do outro: o principal dele e os extras
  v_extras := coalesce(m.enderecos_extras, '[]'::jsonb);
  v_lista := jsonb_build_array(jsonb_build_object('etiqueta', o->>'endereco_etiqueta', 'cep', o->>'cep', 'logradouro', o->>'logradouro',
               'numero', o->>'numero', 'complemento', o->>'complemento', 'bairro', o->>'bairro', 'municipio', o->>'municipio', 'uf', o->>'uf'))
             || coalesce(o->'enderecos_extras', '[]'::jsonb);
  for e in select * from jsonb_array_elements(v_lista) loop
    continue when coalesce(btrim(e->>'logradouro'), '') = '' and coalesce(btrim(e->>'cep'), '') = '';
    v_chave := public.endereco_chave(e);
    continue when v_chave = public.endereco_chave(to_jsonb(m))
               or exists (select 1 from jsonb_array_elements(v_extras) x where public.endereco_chave(x) = v_chave);
    if jsonb_array_length(v_extras) < 2 then
      v_extras := v_extras || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'etiqueta', nullif(btrim(e->>'etiqueta'), ''), 'cep', regexp_replace(coalesce(e->>'cep', ''), '\D', '', 'g'),
        'logradouro', nullif(btrim(e->>'logradouro'), ''), 'numero', nullif(btrim(e->>'numero'), ''),
        'complemento', nullif(btrim(e->>'complemento'), ''), 'bairro', nullif(btrim(e->>'bairro'), ''),
        'municipio', nullif(btrim(e->>'municipio'), ''), 'uf', upper(nullif(btrim(e->>'uf'), '')),
        'origem', 'cadastro nº ' || coalesce(o->>'codigo', '?'))));
      v_trouxe := v_trouxe || format('endereço %s (agora é o endereço %s)', public.endereco_texto(e), jsonb_array_length(v_extras) + 1);
    else
      v_fora := v_fora || format('endereço %s (não coube: o cadastro já tem 3 endereços)', public.endereco_texto(e));
    end if;
  end loop;

  -- quem era o outro cadastro: nome, e-mail e telefone que o principal não tem viram pessoa de contato
  if v_email is not null and (v_email in (lower(coalesce(m.email, '')), lower(coalesce(m.email_nfe, '')))
      or exists (select 1 from public.clientes_pessoas where cliente_id = p_manter and ativo and lower(email) = v_email)) then
    v_email := null;
  end if;
  if v_email2 is not null and (v_email2 = v_email or v_email2 in (lower(coalesce(m.email, '')), lower(coalesce(m.email_nfe, '')), lower(coalesce(o->>'email', '')))) then
    v_email2 := null;
  end if;
  select array_agg(right(regexp_replace(x, '\D', '', 'g'), 8)) into v_meus_tel
    from unnest(array[m.whatsapp, m.telefone, m.telefone_adicional]
                || coalesce((select array_agg(telefone) from public.clientes_pessoas where cliente_id = p_manter and ativo), '{}')) x
   where length(regexp_replace(coalesce(x, ''), '\D', '', 'g')) >= 8;
  foreach t in array array[o->>'whatsapp', o->>'telefone', o->>'telefone_adicional'] loop
    if length(regexp_replace(coalesce(t, ''), '\D', '', 'g')) >= 8
       and not (right(regexp_replace(t, '\D', '', 'g'), 8) = any (coalesce(v_meus_tel, '{}'))) then
      v_tel := t; exit;
    end if;
  end loop;
  if v_email is not null or v_tel is not null
     or (v_nome is not null and lower(v_nome) not in (lower(coalesce(m.nome, '')), lower(coalesce(m.nome_fantasia, '')))) then
    insert into public.clientes_pessoas (cliente_id, nome, setor, email, telefone)
    values (p_manter, coalesce(v_nome, 'Cadastro unificado'), 'Cadastro unificado nº ' || coalesce(o->>'codigo', '?'), v_email, v_tel);
    v_trouxe := v_trouxe || ('pessoa de contato ' || concat_ws(' · ', coalesce(v_nome, 'sem nome'), v_email, v_tel));
  end if;
  if v_email2 is not null then v_trouxe := v_trouxe || ('e-mail da NF-e ' || v_email2); end if;

  -- documento diferente (pessoa e empresa do mesmo dono): fica anotado
  if length(v_doc) in (11, 14) and v_doc <> v_doc_m then
    v_trouxe := v_trouxe || (case when length(v_doc) = 11 then 'CPF ' else 'CNPJ ' end || v_doc);
  end if;
  if nullif(btrim(o->>'nome_fantasia'), '') is not null and lower(btrim(o->>'nome_fantasia')) not in (lower(coalesce(m.nome, '')), lower(coalesce(m.nome_fantasia, ''))) then
    v_trouxe := v_trouxe || ('nome fantasia ' || btrim(o->>'nome_fantasia'));
  end if;
  if nullif(btrim(o->>'inscricao_estadual'), '') is not null and lower(btrim(o->>'inscricao_estadual')) <> lower(coalesce(m.inscricao_estadual, '')) then
    v_trouxe := v_trouxe || ('inscrição estadual ' || btrim(o->>'inscricao_estadual'));
  end if;

  v_entrada := jsonb_strip_nulls(jsonb_build_object(
    'id', o->>'id', 'codigo', o->'codigo', 'nome', v_nome, 'doc', nullif(v_doc, ''), 'em', now(), 'por', p_por,
    'email', nullif(btrim(o->>'email'), ''), 'whatsapp', nullif(btrim(o->>'whatsapp'), ''), 'telefone', nullif(btrim(o->>'telefone'), ''),
    'endereco', public.endereco_texto(o),
    'completou', case when cardinality(p_completou) > 0 then to_jsonb(p_completou) end,
    'trouxe', case when cardinality(v_trouxe) > 0 then to_jsonb(v_trouxe) end,
    'fora', case when cardinality(v_fora) > 0 then to_jsonb(v_fora) end));
  update public.clientes set enderecos_extras = v_extras, unificacoes = coalesce(unificacoes, '[]'::jsonb) || jsonb_build_array(v_entrada)
   where id = p_manter;
  return v_entrada;
end $$;
revoke execute on function public.unificacao_registrar(uuid, jsonb, text, text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Unificar: tudo dos outros passa para o principal; nada se perde
-- ---------------------------------------------------------------------
create or replace function public.unificar_clientes(p_manter uuid, p_outros uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record; v_outro uuid; m clientes; antes jsonb; depois jsonb; o clientes; n int := 0;
  v_por text := (select nome from usuarios_erp where user_id = auth.uid());
  v_completou text[];
  v_sem_end boolean;
  k text;
  rotulos constant jsonb := '{"cpf_cnpj":"CPF/CNPJ","nome_fantasia":"nome fantasia","inscricao_estadual":"inscrição estadual","email":"e-mail",
    "email_nfe":"e-mail da NF-e","telefone":"telefone","whatsapp":"WhatsApp","telefone_adicional":"telefone adicional","logradouro":"endereço",
    "website":"site","inscricao_municipal":"inscrição municipal","data_nascimento":"data de nascimento","vendedor_id":"vendedor",
    "forma_pagamento_id":"forma de pagamento","condicao_pagamento":"condição de pagamento","limite_credito":"limite de crédito",
    "cobranca_logradouro":"endereço de cobrança","contato_observacoes":"observações do contato"}';
begin
  perform public.exigir_papel('vendas', 'financeiro');
  perform set_config('erp.acao_usuario', 'on', true);
  select * into m from clientes where id = p_manter;
  if m.id is null then raise exception 'cliente principal não encontrado'; end if;
  foreach v_outro in array coalesce(p_outros, '{}'::uuid[]) loop
    continue when v_outro = p_manter;
    select * into o from clientes where id = v_outro;
    continue when o.id is null;
    for r in
      select c.conrelid::regclass as tabela, a.attname as coluna
        from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.contype = 'f' and c.confrelid = 'public.clientes'::regclass
    loop
      execute format('update %s set %I = $1 where %I = $2', r.tabela, r.coluna, r.coluna) using p_manter, v_outro;
    end loop;
    update documentos set entidade_id = p_manter where entidade = 'cliente' and entidade_id = v_outro;
    -- o outro sai das listas (fica guardado como estava); CPF/CNPJ e código do Tiny são únicos: liberados antes de copiar
    update clientes set arquivado_em = now(), arquivado_motivo = 'unificado', unificado_em = p_manter, dados_arquivados = to_jsonb(o),
           cpf_cnpj = null, id_externo = null
     where id = v_outro;
    antes := to_jsonb(m);
    -- endereço é um bloco: o principal sem endereço recebe o do outro inteiro (nunca mistura rua de um com CEP do outro)
    v_sem_end := coalesce(btrim(m.logradouro), '') = '' and coalesce(btrim(m.cep), '') = '';
    update clientes set
      nome_fantasia = coalesce(nullif(btrim(m.nome_fantasia), ''), o.nome_fantasia),
      cpf_cnpj = coalesce(nullif(btrim(m.cpf_cnpj), ''), o.cpf_cnpj),
      tipo_pessoa = case when nullif(btrim(m.cpf_cnpj), '') is null and nullif(btrim(o.cpf_cnpj), '') is not null then o.tipo_pessoa else m.tipo_pessoa end,
      inscricao_estadual = coalesce(nullif(btrim(m.inscricao_estadual), ''), o.inscricao_estadual),
      email = coalesce(nullif(btrim(m.email), ''), o.email),
      telefone = coalesce(nullif(btrim(m.telefone), ''), o.telefone),
      whatsapp = coalesce(nullif(btrim(m.whatsapp), ''), o.whatsapp),
      endereco_etiqueta = case when v_sem_end then o.endereco_etiqueta else m.endereco_etiqueta end,
      cep = case when v_sem_end then o.cep else m.cep end,
      logradouro = case when v_sem_end then o.logradouro else m.logradouro end,
      numero = case when v_sem_end then o.numero else m.numero end,
      complemento = case when v_sem_end then o.complemento else m.complemento end,
      bairro = case when v_sem_end then o.bairro else m.bairro end,
      municipio = case when v_sem_end then o.municipio else coalesce(nullif(btrim(m.municipio), ''), o.municipio) end,
      uf = case when v_sem_end then o.uf else coalesce(nullif(btrim(m.uf), ''), o.uf) end,
      id_externo = coalesce(m.id_externo, o.id_externo),
      observacoes = case when nullif(btrim(o.observacoes), '') is null or coalesce(m.observacoes, '') like '%' || o.observacoes || '%' then m.observacoes
                         else concat_ws(E'\n', nullif(btrim(m.observacoes), ''), o.observacoes) end,
      preferencias = case when nullif(btrim(o.preferencias), '') is null or coalesce(m.preferencias, '') like '%' || o.preferencias || '%' then m.preferencias
                          else concat_ws(E'\n', nullif(btrim(m.preferencias), ''), o.preferencias) end,
      tags = array(select distinct t from unnest(m.tags || o.tags) t order by t),
      marcadores = array(select distinct t from unnest(coalesce(m.marcadores, '{}') || coalesce(o.marcadores, '{}')) t),
      telefone_adicional = coalesce(nullif(btrim(m.telefone_adicional), ''), o.telefone_adicional),
      website = coalesce(nullif(btrim(m.website), ''), o.website),
      email_nfe = coalesce(nullif(btrim(m.email_nfe), ''), o.email_nfe),
      contato_observacoes = case when nullif(btrim(o.contato_observacoes), '') is null or coalesce(m.contato_observacoes, '') like '%' || o.contato_observacoes || '%'
                                 then m.contato_observacoes else concat_ws(E'\n', nullif(btrim(m.contato_observacoes), ''), o.contato_observacoes) end,
      inscricao_municipal = coalesce(nullif(btrim(m.inscricao_municipal), ''), o.inscricao_municipal),
      inscricao_suframa = coalesce(nullif(btrim(m.inscricao_suframa), ''), o.inscricao_suframa),
      regime_tributario = coalesce(m.regime_tributario, o.regime_tributario),
      data_nascimento = coalesce(m.data_nascimento, o.data_nascimento),
      status_crm = coalesce(m.status_crm, o.status_crm),
      vendedor_id = coalesce(m.vendedor_id, o.vendedor_id),
      forma_pagamento_id = coalesce(m.forma_pagamento_id, o.forma_pagamento_id),
      tabela_preco_id = coalesce(m.tabela_preco_id, o.tabela_preco_id),
      condicao_pagamento = coalesce(nullif(btrim(m.condicao_pagamento), ''), o.condicao_pagamento),
      desconto_padrao = coalesce(m.desconto_padrao, o.desconto_padrao),
      limite_credito = coalesce(m.limite_credito, o.limite_credito),
      -- cobrança também é um bloco: fica a do principal; sem ela, a do outro
      cobranca_diferente = m.cobranca_diferente or o.cobranca_diferente,
      cobranca_cep = case when m.cobranca_diferente or not o.cobranca_diferente then m.cobranca_cep else o.cobranca_cep end,
      cobranca_logradouro = case when m.cobranca_diferente or not o.cobranca_diferente then m.cobranca_logradouro else o.cobranca_logradouro end,
      cobranca_numero = case when m.cobranca_diferente or not o.cobranca_diferente then m.cobranca_numero else o.cobranca_numero end,
      cobranca_complemento = case when m.cobranca_diferente or not o.cobranca_diferente then m.cobranca_complemento else o.cobranca_complemento end,
      cobranca_bairro = case when m.cobranca_diferente or not o.cobranca_diferente then m.cobranca_bairro else o.cobranca_bairro end,
      cobranca_municipio = case when m.cobranca_diferente or not o.cobranca_diferente then m.cobranca_municipio else o.cobranca_municipio end,
      cobranca_uf = case when m.cobranca_diferente or not o.cobranca_diferente then m.cobranca_uf else o.cobranca_uf end
    where id = p_manter
    returning * into m;
    depois := to_jsonb(m);
    v_completou := '{}';
    for k in select jsonb_object_keys(rotulos) loop
      if coalesce(antes->>k, '') = '' and coalesce(depois->>k, '') <> '' then v_completou := v_completou || (rotulos->>k); end if;
    end loop;
    perform public.unificacao_registrar(p_manter, to_jsonb(o), v_por, v_completou);
    select * into m from clientes where id = p_manter;
    n := n + 1;
  end loop;
  return n;
end $$;
