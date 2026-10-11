-- Cadastro de clientes completo (como no Tiny) + assinatura eletrônica da ficha cadastral.
-- Só acrescenta: colunas novas no cliente, pessoas de contato e o registro das assinaturas.

create extension if not exists pgcrypto with schema extensions;  -- já vem no Supabase (código de verificação SHA-256)

-- ---------------------------------------------------------------------
-- 1. Campos novos do cliente
-- ---------------------------------------------------------------------
alter table public.clientes add column if not exists telefone_adicional text;
alter table public.clientes add column if not exists website text;
alter table public.clientes add column if not exists email_nfe text;              -- recebe o XML e o DANFE (vazio = e-mail principal)
alter table public.clientes add column if not exists contato_observacoes text;
alter table public.clientes add column if not exists inscricao_municipal text;
alter table public.clientes add column if not exists inscricao_suframa text;
alter table public.clientes add column if not exists regime_tributario smallint;  -- CRT: 1 Simples, 2 Simples (excesso), 3 Normal, 4 MEI
alter table public.clientes add column if not exists data_nascimento date;
alter table public.clientes add column if not exists status_crm text;             -- lead, negociacao, cliente, inativo
alter table public.clientes add column if not exists vendedor_id uuid references public.vendedores(id) on delete set null;
alter table public.clientes add column if not exists forma_pagamento_id uuid references public.formas_pagamento(id) on delete set null;
alter table public.clientes add column if not exists condicao_pagamento text;     -- como no Tiny: "30 60", "3x", "15 +2x"
alter table public.clientes add column if not exists desconto_padrao numeric(5,2);
alter table public.clientes add column if not exists limite_credito numeric(14,2);
alter table public.clientes add column if not exists cobranca_diferente boolean not null default false;
alter table public.clientes add column if not exists cobranca_cep text;
alter table public.clientes add column if not exists cobranca_logradouro text;
alter table public.clientes add column if not exists cobranca_numero text;
alter table public.clientes add column if not exists cobranca_complemento text;
alter table public.clientes add column if not exists cobranca_bairro text;
alter table public.clientes add column if not exists cobranca_municipio text;
alter table public.clientes add column if not exists cobranca_uf text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_status_crm_check') then
    alter table public.clientes add constraint clientes_status_crm_check
      check (status_crm is null or status_crm in ('lead', 'negociacao', 'cliente', 'inativo'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clientes_regime_tributario_check') then
    alter table public.clientes add constraint clientes_regime_tributario_check
      check (regime_tributario is null or regime_tributario between 1 and 4);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clientes_valores_check') then
    alter table public.clientes add constraint clientes_valores_check
      check ((desconto_padrao is null or desconto_padrao between 0 and 100) and (limite_credito is null or limite_credito >= 0));
  end if;
end $$;

create index if not exists clientes_vendedor_idx on public.clientes (vendedor_id) where vendedor_id is not null;

-- ---------------------------------------------------------------------
-- 2. Pessoas de contato (compras, financeiro, técnico…). Excluir = inativar.
-- ---------------------------------------------------------------------
create table if not exists public.clientes_pessoas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  nome text not null check (btrim(nome) <> ''),
  setor text,
  email text,
  telefone text,
  ramal text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists clientes_pessoas_cliente_idx on public.clientes_pessoas (cliente_id);
alter table public.clientes_pessoas enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'clientes_pessoas' and policyname = 'erp_select') then
    create policy "erp_select" on public.clientes_pessoas for select to authenticated using (public.is_erp_user());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'clientes_pessoas' and policyname = 'contador_select') then
    create policy "contador_select" on public.clientes_pessoas for select to authenticated using (public.e_contador());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'clientes_pessoas' and policyname = 'erp_insert') then
    create policy "erp_insert" on public.clientes_pessoas for insert to authenticated
      with check (public.tem_papel('vendas', 'financeiro', 'tecnico'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'clientes_pessoas' and policyname = 'erp_update') then
    create policy "erp_update" on public.clientes_pessoas for update to authenticated
      using (public.tem_papel('vendas', 'financeiro', 'tecnico')) with check (public.tem_papel('vendas', 'financeiro', 'tecnico'));
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'zz_auditoria' and tgrelid = 'public.clientes_pessoas'::regclass) then
    create trigger zz_auditoria before insert or update or delete on public.clientes_pessoas for each row execute function public.trg_auditoria();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Assinatura eletrônica da ficha cadastral
--    Presencial (no tablet/celular do vendedor) ou por link (o cliente confere, corrige e assina).
--    Guarda o termo, a ficha como estava, quem assinou (nome + CPF), o desenho, IP, navegador, data/hora
--    e um código SHA-256 que prova que nada foi alterado depois.
-- ---------------------------------------------------------------------
create table if not exists public.clientes_assinaturas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  token uuid not null unique default gen_random_uuid(),
  canal text not null default 'link' check (canal in ('link', 'presencial')),
  status text not null default 'pendente' check (status in ('pendente', 'assinado', 'cancelado')),
  termo text not null,
  dados jsonb,                 -- ficha cadastral no momento da assinatura
  alteracoes jsonb,            -- o que o cliente corrigiu pelo link (antes → depois)
  hash text,
  nome text,
  cpf text,
  assinatura_png text,
  ip text,
  user_agent text,
  enviado_por uuid default auth.uid(),
  visualizado_em timestamptz,
  assinado_em timestamptz,
  expira_em timestamptz not null default now() + interval '15 days',
  cancelado_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists clientes_assinaturas_cliente_idx on public.clientes_assinaturas (cliente_id, created_at desc);
alter table public.clientes_assinaturas enable row level security;
-- leitura pela equipe; gravação só pelas funções abaixo (garantem data, IP e código de verificação)
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'clientes_assinaturas' and policyname = 'erp_select') then
    create policy "erp_select" on public.clientes_assinaturas for select to authenticated using (public.is_erp_user());
  end if;
end $$;

create or replace function public.termo_ficha_cadastral()
returns text language sql stable security definer set search_path = public as $$
  select 'Declaro que as informações desta ficha cadastral são verdadeiras e me comprometo a avisar a '
      || coalesce((select coalesce(nullif(btrim(nome_fantasia), ''), razao_social) from configuracoes where id = 1), 'empresa')
      || ' sobre qualquer alteração. Autorizo o uso destes dados para emissão de notas fiscais, entregas, cobranças, garantia, '
      || 'assistência técnica e contato comercial, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). '
      || 'Reconheço como válida esta assinatura eletrônica, registrada com data, hora, endereço IP e código de verificação '
      || '(Medida Provisória nº 2.200-2/2001, art. 10, § 2º).';
$$;

-- Ficha como o cliente vê e assina (sem tokens nem dados internos)
create or replace function public.cliente_ficha(p_cliente uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'codigo', c.codigo, 'tipo_pessoa', c.tipo_pessoa, 'nome', c.nome, 'nome_fantasia', c.nome_fantasia, 'cpf_cnpj', c.cpf_cnpj,
    'inscricao_estadual', c.inscricao_estadual, 'inscricao_municipal', c.inscricao_municipal, 'data_nascimento', c.data_nascimento,
    'email', c.email, 'email_nfe', c.email_nfe, 'telefone', c.telefone, 'telefone_adicional', c.telefone_adicional,
    'whatsapp', c.whatsapp, 'website', c.website,
    'cep', c.cep, 'logradouro', c.logradouro, 'numero', c.numero, 'complemento', c.complemento, 'bairro', c.bairro,
    'municipio', c.municipio, 'uf', c.uf,
    'cobranca_diferente', c.cobranca_diferente, 'cobranca_cep', c.cobranca_cep, 'cobranca_logradouro', c.cobranca_logradouro,
    'cobranca_numero', c.cobranca_numero, 'cobranca_complemento', c.cobranca_complemento, 'cobranca_bairro', c.cobranca_bairro,
    'cobranca_municipio', c.cobranca_municipio, 'cobranca_uf', c.cobranca_uf,
    'pessoas', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('nome', p.nome, 'setor', p.setor, 'email', p.email, 'telefone', p.telefone, 'ramal', p.ramal))
                                 order by p.created_at)
                  from clientes_pessoas p where p.cliente_id = c.id and p.ativo)))
    from clientes c where c.id = p_cliente;
$$;

-- Código de verificação: SHA-256 de tudo o que foi assinado (data em UTC para dar sempre o mesmo resultado)
create or replace function public.assinatura_ficha_hash(a public.clientes_assinaturas)
returns text language sql immutable set search_path = public as $$
  select encode(extensions.digest(convert_to(concat_ws('|',
    a.id::text, a.cliente_id::text, a.canal, a.termo, coalesce(a.dados::text, ''), coalesce(a.nome, ''), coalesce(a.cpf, ''),
    coalesce(a.assinatura_png, ''), coalesce(a.ip, ''), coalesce(a.user_agent, ''),
    coalesce(to_char(a.assinado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), '')), 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function public.ip_requisicao()
returns text language sql stable as $$
  select nullif(btrim(split_part(coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'cf-connecting-ip',
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for',
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-real-ip', ''), ',', 1)), '');
$$;

-- Confere nome, CPF e desenho antes de gravar
create or replace function public.validar_assinante(p_nome text, p_cpf text, p_png text)
returns void language plpgsql immutable as $$
begin
  if length(btrim(coalesce(p_nome, ''))) < 5 or btrim(p_nome) !~ '\s' then raise exception 'informe o nome completo de quem assina'; end if;
  if length(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')) <> 11 then raise exception 'informe o CPF de quem assina (11 números)'; end if;
  if coalesce(p_png, '') not like 'data:image/png;base64,%' then raise exception 'faça a assinatura no quadro'; end if;
  if length(p_png) > 600000 then raise exception 'assinatura muito grande: limpe e assine de novo'; end if;
end $$;

-- Equipe: cria (ou reaproveita) o link para o cliente assinar
create or replace function public.ficha_cadastral_link(p_cliente uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a clientes_assinaturas;
begin
  perform public.exigir_papel('vendas', 'financeiro', 'tecnico');
  if not exists (select 1 from clientes where id = p_cliente and arquivado_em is null) then raise exception 'cliente não encontrado'; end if;
  select * into a from clientes_assinaturas
   where cliente_id = p_cliente and canal = 'link' and status = 'pendente' and expira_em > now() + interval '2 days'
   order by created_at desc limit 1;
  if a.id is null then
    insert into clientes_assinaturas (cliente_id, canal, termo) values (p_cliente, 'link', public.termo_ficha_cadastral()) returning * into a;
  end if;
  return jsonb_build_object('id', a.id, 'token', a.token, 'expira_em', a.expira_em);
end $$;

-- Equipe: assinatura presencial (o cliente assina no aparelho do vendedor)
create or replace function public.ficha_cadastral_assinar_presencial(p_cliente uuid, p_nome text, p_cpf text, p_png text, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a clientes_assinaturas;
begin
  perform public.exigir_papel('vendas', 'financeiro', 'tecnico');
  if not exists (select 1 from clientes where id = p_cliente and arquivado_em is null) then raise exception 'cliente não encontrado'; end if;
  perform public.validar_assinante(p_nome, p_cpf, p_png);
  insert into clientes_assinaturas (cliente_id, canal, status, termo, dados, nome, cpf, assinatura_png, ip, user_agent, assinado_em, expira_em)
  values (p_cliente, 'presencial', 'assinado', public.termo_ficha_cadastral(), public.cliente_ficha(p_cliente), left(btrim(p_nome), 120),
          regexp_replace(p_cpf, '\D', '', 'g'), p_png, public.ip_requisicao(), left(p_user_agent, 300), now(), now())
  returning * into a;
  update clientes_assinaturas set hash = public.assinatura_ficha_hash(a) where id = a.id returning * into a;
  -- quem assina a ficha já é cliente
  update clientes set status_crm = 'cliente' where id = p_cliente and coalesce(status_crm, 'lead') in ('lead', 'negociacao');
  return jsonb_build_object('id', a.id, 'hash', a.hash, 'assinado_em', a.assinado_em);
end $$;

-- Equipe: cancela um link que ainda não foi assinado
create or replace function public.ficha_cadastral_cancelar(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_papel('vendas', 'financeiro', 'tecnico');
  update clientes_assinaturas set status = 'cancelado', cancelado_em = now() where id = p_id and status = 'pendente';
  if not found then raise exception 'só dá para cancelar um link que ainda não foi assinado'; end if;
end $$;

-- Equipe: confere se a assinatura continua íntegra (o código bate com o que está gravado)
create or replace function public.ficha_cadastral_conferir(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case when public.is_erp_user() then (select a.hash is not null and a.hash = public.assinatura_ficha_hash(a) from clientes_assinaturas a where a.id = p_id) end;
$$;

-- Cliente (sem login, pelo link): vê a ficha e o termo
create or replace function public.ficha_cadastral_publica(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a clientes_assinaturas; v_cfg configuracoes; v_status text;
begin
  select * into a from clientes_assinaturas where token = p_token and canal = 'link';
  if a.id is null then return null; end if;
  v_status := case when a.status = 'pendente' and a.expira_em < now() then 'vencido' else a.status end;
  if v_status = 'pendente' and a.visualizado_em is null then
    update clientes_assinaturas set visualizado_em = now() where id = a.id;
  end if;
  select * into v_cfg from configuracoes where id = 1;
  return jsonb_build_object(
    'status', v_status,
    'termo', a.termo,
    'dados', case v_status when 'pendente' then public.cliente_ficha(a.cliente_id) when 'assinado' then a.dados end,
    'nome', a.nome, 'assinado_em', a.assinado_em, 'hash', a.hash, 'expira_em', a.expira_em,
    'empresa', jsonb_build_object('nome', coalesce(nullif(btrim(v_cfg.nome_fantasia), ''), v_cfg.razao_social), 'razao_social', v_cfg.razao_social,
                                  'cnpj', v_cfg.cnpj, 'whatsapp', v_cfg.whatsapp, 'telefone', v_cfg.telefone, 'email', v_cfg.email));
end $$;

-- Cliente (sem login, pelo link): corrige contato/endereço e assina
create or replace function public.ficha_cadastral_assinar(p_token uuid, p_nome text, p_cpf text, p_png text, p_dados jsonb default '{}'::jsonb, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a clientes_assinaturas; c clientes; k text; v_val text; v_atual text; v_alt jsonb := '{}'::jsonb;
  v_campos text[] := array['email', 'email_nfe', 'telefone', 'whatsapp', 'data_nascimento', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'municipio', 'uf'];
begin
  select * into a from clientes_assinaturas where token = p_token and canal = 'link' for update;
  if a.id is null then raise exception 'link não encontrado'; end if;
  if a.status = 'assinado' then raise exception 'esta ficha já foi assinada'; end if;
  if a.status <> 'pendente' then raise exception 'este link foi cancelado: peça um novo'; end if;
  if a.expira_em < now() then raise exception 'link vencido: peça um novo'; end if;
  perform public.validar_assinante(p_nome, p_cpf, p_png);

  select * into c from clientes where id = a.cliente_id for update;
  if c.id is null or c.arquivado_em is not null then raise exception 'cadastro não encontrado'; end if;
  -- correções do próprio cliente: só contato e endereço (o resto continua com a equipe)
  if jsonb_typeof(p_dados) = 'object' then
    foreach k in array v_campos loop
      continue when not (p_dados ? k);
      v_val := nullif(left(btrim(coalesce(p_dados ->> k, '')), 200), '');
      if k in ('telefone', 'whatsapp', 'cep') then v_val := nullif(regexp_replace(coalesce(v_val, ''), '\D', '', 'g'), ''); end if;
      if k in ('email', 'email_nfe') then v_val := lower(v_val); end if;
      if k = 'uf' then v_val := upper(left(v_val, 2)); end if;
      if k = 'data_nascimento' and v_val is not null and v_val !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'data de nascimento inválida'; end if;
      if k in ('email', 'email_nfe') and v_val is not null and v_val !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'e-mail inválido: %', v_val; end if;
      v_atual := to_jsonb(c) ->> k;
      if v_val is distinct from v_atual then
        v_alt := v_alt || jsonb_build_object(k, jsonb_build_object('antes', v_atual, 'depois', v_val));
      end if;
    end loop;
  end if;
  if v_alt <> '{}'::jsonb then
    c := jsonb_populate_record(c, (select jsonb_object_agg(x, v_alt -> x -> 'depois') from jsonb_object_keys(v_alt) x));
    update clientes set email = c.email, email_nfe = c.email_nfe, telefone = c.telefone, whatsapp = c.whatsapp, data_nascimento = c.data_nascimento,
           cep = c.cep, logradouro = c.logradouro, numero = c.numero, complemento = c.complemento, bairro = c.bairro, municipio = c.municipio, uf = c.uf
     where id = c.id;
  end if;

  update clientes_assinaturas set status = 'assinado', nome = left(btrim(p_nome), 120), cpf = regexp_replace(p_cpf, '\D', '', 'g'),
         assinatura_png = p_png, ip = public.ip_requisicao(), user_agent = left(p_user_agent, 300), assinado_em = now(),
         dados = public.cliente_ficha(a.cliente_id), alteracoes = nullif(v_alt, '{}'::jsonb)
   where id = a.id returning * into a;
  update clientes_assinaturas set hash = public.assinatura_ficha_hash(a) where id = a.id returning * into a;
  update clientes set status_crm = 'cliente' where id = a.cliente_id and coalesce(status_crm, 'lead') in ('lead', 'negociacao');

  perform public.notificar('outro', 'Ficha cadastral assinada',
    coalesce(nullif(btrim(c.nome_fantasia), ''), c.nome)
      || coalesce(' · atualizou ' || (select string_agg(x, ', ' order by x) from jsonb_object_keys(v_alt) x), ''),
    '/clientes', '{vendas,financeiro}', null);
  return jsonb_build_object('hash', a.hash, 'assinado_em', a.assinado_em, 'ip', a.ip, 'dados', a.dados);
end $$;

revoke execute on function public.termo_ficha_cadastral() from public, anon;
revoke execute on function public.cliente_ficha(uuid) from public, anon, authenticated;
revoke execute on function public.assinatura_ficha_hash(public.clientes_assinaturas) from public, anon, authenticated;
revoke execute on function public.ip_requisicao() from public, anon, authenticated;
revoke execute on function public.validar_assinante(text, text, text) from public, anon, authenticated;
revoke execute on function public.ficha_cadastral_link(uuid) from public, anon;
revoke execute on function public.ficha_cadastral_assinar_presencial(uuid, text, text, text, text) from public, anon;
revoke execute on function public.ficha_cadastral_cancelar(uuid) from public, anon;
revoke execute on function public.ficha_cadastral_conferir(uuid) from public, anon;
revoke execute on function public.ficha_cadastral_publica(uuid) from public;
revoke execute on function public.ficha_cadastral_assinar(uuid, text, text, text, jsonb, text) from public;
grant execute on function public.termo_ficha_cadastral() to authenticated;
grant execute on function public.ficha_cadastral_link(uuid) to authenticated;
grant execute on function public.ficha_cadastral_assinar_presencial(uuid, text, text, text, text) to authenticated;
grant execute on function public.ficha_cadastral_cancelar(uuid) to authenticated;
grant execute on function public.ficha_cadastral_conferir(uuid) to authenticated;
grant execute on function public.ficha_cadastral_publica(uuid) to anon, authenticated;
grant execute on function public.ficha_cadastral_assinar(uuid, text, text, text, jsonb, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Unificar cadastros: os campos novos também passam do repetido para o principal
--    (pessoas de contato e assinaturas já vão pela chave estrangeira)
-- ---------------------------------------------------------------------
create or replace function public.unificar_clientes(p_manter uuid, p_outros uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_outro uuid; m clientes; o clientes; n int := 0;
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
    update clientes set
      nome_fantasia = coalesce(nullif(btrim(m.nome_fantasia), ''), o.nome_fantasia),
      cpf_cnpj = coalesce(nullif(btrim(m.cpf_cnpj), ''), o.cpf_cnpj),
      tipo_pessoa = case when nullif(btrim(m.cpf_cnpj), '') is null and nullif(btrim(o.cpf_cnpj), '') is not null then o.tipo_pessoa else m.tipo_pessoa end,
      inscricao_estadual = coalesce(nullif(btrim(m.inscricao_estadual), ''), o.inscricao_estadual),
      email = coalesce(nullif(btrim(m.email), ''), o.email),
      telefone = coalesce(nullif(btrim(m.telefone), ''), o.telefone),
      whatsapp = coalesce(nullif(btrim(m.whatsapp), ''), o.whatsapp),
      cep = coalesce(nullif(btrim(m.cep), ''), o.cep),
      logradouro = coalesce(nullif(btrim(m.logradouro), ''), o.logradouro),
      numero = coalesce(nullif(btrim(m.numero), ''), o.numero),
      complemento = coalesce(nullif(btrim(m.complemento), ''), o.complemento),
      bairro = coalesce(nullif(btrim(m.bairro), ''), o.bairro),
      municipio = coalesce(nullif(btrim(m.municipio), ''), o.municipio),
      uf = coalesce(nullif(btrim(m.uf), ''), o.uf),
      id_externo = coalesce(m.id_externo, o.id_externo),
      observacoes = case when nullif(btrim(o.observacoes), '') is null or coalesce(m.observacoes, '') like '%' || o.observacoes || '%' then m.observacoes
                         else concat_ws(E'\n', nullif(btrim(m.observacoes), ''), o.observacoes) end,
      preferencias = case when nullif(btrim(o.preferencias), '') is null or coalesce(m.preferencias, '') like '%' || o.preferencias || '%' then m.preferencias
                          else concat_ws(E'\n', nullif(btrim(m.preferencias), ''), o.preferencias) end,
      tags = array(select distinct t from unnest(m.tags || o.tags) t order by t),
      telefone_adicional = coalesce(nullif(btrim(m.telefone_adicional), ''), o.telefone_adicional),
      website = coalesce(nullif(btrim(m.website), ''), o.website),
      email_nfe = coalesce(nullif(btrim(m.email_nfe), ''), o.email_nfe),
      contato_observacoes = coalesce(nullif(btrim(m.contato_observacoes), ''), o.contato_observacoes),
      inscricao_municipal = coalesce(nullif(btrim(m.inscricao_municipal), ''), o.inscricao_municipal),
      inscricao_suframa = coalesce(nullif(btrim(m.inscricao_suframa), ''), o.inscricao_suframa),
      regime_tributario = coalesce(m.regime_tributario, o.regime_tributario),
      data_nascimento = coalesce(m.data_nascimento, o.data_nascimento),
      status_crm = coalesce(m.status_crm, o.status_crm),
      vendedor_id = coalesce(m.vendedor_id, o.vendedor_id),
      forma_pagamento_id = coalesce(m.forma_pagamento_id, o.forma_pagamento_id),
      condicao_pagamento = coalesce(nullif(btrim(m.condicao_pagamento), ''), o.condicao_pagamento),
      desconto_padrao = coalesce(m.desconto_padrao, o.desconto_padrao),
      limite_credito = coalesce(m.limite_credito, o.limite_credito),
      cobranca_diferente = m.cobranca_diferente or o.cobranca_diferente,
      cobranca_cep = case when m.cobranca_diferente then m.cobranca_cep else coalesce(m.cobranca_cep, o.cobranca_cep) end,
      cobranca_logradouro = case when m.cobranca_diferente then m.cobranca_logradouro else coalesce(m.cobranca_logradouro, o.cobranca_logradouro) end,
      cobranca_numero = case when m.cobranca_diferente then m.cobranca_numero else coalesce(m.cobranca_numero, o.cobranca_numero) end,
      cobranca_complemento = case when m.cobranca_diferente then m.cobranca_complemento else coalesce(m.cobranca_complemento, o.cobranca_complemento) end,
      cobranca_bairro = case when m.cobranca_diferente then m.cobranca_bairro else coalesce(m.cobranca_bairro, o.cobranca_bairro) end,
      cobranca_municipio = case when m.cobranca_diferente then m.cobranca_municipio else coalesce(m.cobranca_municipio, o.cobranca_municipio) end,
      cobranca_uf = case when m.cobranca_diferente then m.cobranca_uf else coalesce(m.cobranca_uf, o.cobranca_uf) end
    where id = p_manter
    returning * into m;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.unificar_clientes(uuid, uuid[]) from public, anon;
grant execute on function public.unificar_clientes(uuid, uuid[]) to authenticated;
