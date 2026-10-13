-- =====================================================================
-- Segurança do acesso
--   1. Login em duas etapas (código do app autenticador, TOTP do Supabase Auth):
--      * quem cadastrou o código só acessa os dados depois de digitá-lo (sessão "aal2");
--      * os papéis de configuracoes.mfa_papeis são obrigados a cadastrar (até lá não acessam nada);
--      * vale no banco inteiro: entra nas funções usadas por todas as políticas e pelas funções do servidor.
--   2. Dados sigilosos dos funcionários (CPF, RG, PIS, CTPS, CNH, banco, agência, conta e Pix):
--      * ficam numa tabela sem acesso direto; a lista mostra só parte deles;
--      * ver por inteiro ou alterar passa por funções que conferem o papel e registram quem fez e quando;
--      * eventos_seguranca: quem viu, quem alterou e quem zerou o login em duas etapas (só o administrador lê).
--   3. Saída automática do ERP depois de configuracoes.sessao_minutos sem uso (0 = nunca).
-- Somente acréscimos: colunas e tabelas novas, funções (create or replace), gatilho novo.
-- mfa_papeis começa vazio: ninguém fica preso até a tela de cadastro do código estar publicada.
-- =====================================================================

alter table public.configuracoes add column if not exists mfa_papeis text[] not null default '{}';
alter table public.configuracoes add column if not exists sessao_minutos integer not null default 30;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'configuracoes_mfa_papeis_validos') then
    alter table public.configuracoes add constraint configuracoes_mfa_papeis_validos
      check (mfa_papeis <@ array['admin', 'vendas', 'financeiro', 'tecnico', 'contador']::text[]);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'configuracoes_sessao_minutos_faixa') then
    alter table public.configuracoes add constraint configuracoes_sessao_minutos_faixa
      check (sessao_minutos between 0 and 720);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Login em duas etapas
-- ---------------------------------------------------------------------

-- A sessão está confirmada quando entrou com o código (aal2) ou quando a pessoa não cadastrou
-- código e o papel dela não é obrigado a ter. Chamada de dentro das funções abaixo (que rodam
-- como dono do banco); não fica aberta para a API.
create or replace function public.sessao_confirmada(p_papel text, p_extras text[])
returns boolean language sql stable set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or (
      not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
      and not exists (select 1 from public.configuracoes c
                      where c.id = 1 and (p_papel = any(c.mfa_papeis) or coalesce(p_extras, '{}') && c.mfa_papeis))
    );
$$;
revoke execute on function public.sessao_confirmada(text, text[]) from public, anon, authenticated;

-- Papel principal ou adicional (admin sempre passa). Usada em todas as políticas do banco.
create or replace function public.tem_papel(variadic p_papeis text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios_erp u
    where u.user_id = auth.uid() and u.ativo
      and (u.papel = 'admin' or u.papel = any(p_papeis) or u.papeis_extras && p_papeis)
      and public.sessao_confirmada(u.papel, u.papeis_extras)
  );
$$;

-- O contador não é "usuário do ERP" para as regras gerais (cadastros, vendas, estoque, RPCs).
create or replace function public.is_erp_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios_erp u
    where u.user_id = auth.uid() and u.ativo and u.papel <> 'contador'
      and public.sessao_confirmada(u.papel, u.papeis_extras)
  );
$$;

create or replace function public.is_erp_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios_erp u
    where u.user_id = auth.uid() and u.ativo and u.papel = 'admin'
      and public.sessao_confirmada(u.papel, u.papeis_extras)
  );
$$;

create or replace function public.e_contador()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios_erp u
    where u.user_id = auth.uid() and u.ativo and u.papel = 'contador'
      and public.sessao_confirmada(u.papel, u.papeis_extras)
  );
$$;

create or replace function public.pode_ver_email(p_conta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.email_contas c join public.usuarios_erp u on u.user_id = auth.uid() and u.ativo
    where c.id = p_conta and (u.papel = 'admin' or u.papel = any(c.papeis))
      and public.sessao_confirmada(u.papel, u.papeis_extras)
  );
$$;

-- Para a tela de entrada: o papel desta pessoa obriga a cadastrar o código?
-- (responde mesmo antes do código, por isso não usa as funções acima)
create or replace function public.mfa_exigido()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios_erp u join public.configuracoes c on c.id = 1
    where u.user_id = auth.uid() and u.ativo and (u.papel = any(c.mfa_papeis) or u.papeis_extras && c.mfa_papeis)
  );
$$;
revoke execute on function public.mfa_exigido() from public, anon;
grant execute on function public.mfa_exigido() to authenticated;

-- ---------------------------------------------------------------------
-- Registro de segurança (quem viu ou alterou dado sigiloso, quem zerou o login em duas etapas)
-- ---------------------------------------------------------------------
create table if not exists public.eventos_seguranca (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  usuario_nome text,
  acao text not null check (acao in ('ver_sigilo', 'alterar_sigilo', 'zerar_duas_etapas')),
  entidade text not null,
  registro_id uuid,
  registro_nome text,
  campos text[]
);
create index if not exists eventos_seguranca_data on public.eventos_seguranca (created_at desc);
create index if not exists eventos_seguranca_registro on public.eventos_seguranca (entidade, registro_id);
alter table public.eventos_seguranca enable row level security;
revoke insert, update, delete, truncate on public.eventos_seguranca from anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'eventos_seguranca' and policyname = 'admin_ler') then
    create policy "admin_ler" on public.eventos_seguranca for select to authenticated using (public.is_erp_admin());
  end if;
end $$;

create or replace function public.registrar_evento_seguranca(p_acao text, p_entidade text, p_registro uuid, p_registro_nome text, p_campos text[])
returns void language sql security definer set search_path = public as $$
  insert into public.eventos_seguranca (user_id, usuario_nome, acao, entidade, registro_id, registro_nome, campos)
  values (auth.uid(), (select nome from public.usuarios_erp where user_id = auth.uid()), p_acao, p_entidade, p_registro, p_registro_nome, p_campos);
$$;
revoke execute on function public.registrar_evento_seguranca(text, text, uuid, text, text[]) from public, anon, authenticated;

-- Administrador: quem tem o código cadastrado
create or replace function public.usuarios_mfa()
returns table (user_id uuid, fatores integer, desde timestamptz)
language sql stable security definer set search_path = public as $$
  select u.user_id, count(f.id)::integer, min(f.created_at)
  from public.usuarios_erp u
  left join auth.mfa_factors f on f.user_id = u.user_id and f.status = 'verified'
  where public.is_erp_admin()
  group by u.user_id;
$$;
revoke execute on function public.usuarios_mfa() from public, anon;
grant execute on function public.usuarios_mfa() to authenticated;

-- Administrador: zera o código de quem perdeu ou trocou o celular (no próximo acesso cadastra de novo)
create or replace function public.zerar_mfa(p_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_erp_admin() then raise exception 'só o administrador zera o login em duas etapas'; end if;
  if not exists (select 1 from public.usuarios_erp where user_id = p_user) then raise exception 'usuário não encontrado'; end if;
  delete from auth.mfa_factors where user_id = p_user;
  get diagnostics n = row_count;
  perform public.registrar_evento_seguranca('zerar_duas_etapas', 'usuario', p_user,
    (select nome from public.usuarios_erp where user_id = p_user), null);
  return n;
end $$;
revoke execute on function public.zerar_mfa(uuid) from public, anon;
grant execute on function public.zerar_mfa(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Dados sigilosos dos funcionários
-- ---------------------------------------------------------------------
create table if not exists public.funcionarios_sigilo (
  funcionario_id uuid primary key references public.funcionarios(id) on delete cascade deferrable initially deferred,
  cpf text, rg text, pis text, ctps text, cnh text,
  banco text, agencia text, conta text, pix text,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
-- sem políticas: ninguém lê nem grava direto; só pelas funções abaixo
alter table public.funcionarios_sigilo enable row level security;
revoke all on public.funcionarios_sigilo from anon, authenticated;

-- Mostra só uma parte: CPF ***.456.789-**, e-mail f***@dominio, chave aleatória 3f2a…6666, o resto só o final
create or replace function public.mascarar(p_valor text, p_tipo text)
returns text language plpgsql immutable set search_path = public as $$
declare
  v text := nullif(btrim(coalesce(p_valor, '')), '');
  d text := regexp_replace(coalesce(p_valor, ''), '\D', '', 'g');
begin
  if v is null then return null; end if;
  if p_tipo = 'cpf' and length(d) = 11 then
    return '***.' || substr(d, 4, 3) || '.' || substr(d, 7, 3) || '-**';
  end if;
  if p_tipo = 'pix' and v ~ '@' then
    return left(v, 1) || '***@' || split_part(v, '@', 2);
  end if;
  if p_tipo = 'pix' and length(v) >= 32 then
    return left(v, 4) || '…' || right(v, 4);
  end if;
  if p_tipo = 'pix' then
    return '•••••' || right(v, 4);
  end if;
  return repeat('•', greatest(length(v) - 3, 3)) || right(v, case when length(v) > 4 then 3 else 1 end);
end $$;

-- grava (só as chaves enviadas; texto vazio apaga) e registra os campos alterados — uso interno
create or replace function public.sigilo_gravar(p_funcionario uuid, p_nome text, p_dados jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  campos constant text[] := array['cpf', 'rg', 'pis', 'ctps', 'cnh', 'banco', 'agencia', 'conta', 'pix'];
  antes jsonb;
  depois jsonb;
  mudou text[];
  cpf text;
begin
  if p_dados ? 'cpf' then
    cpf := nullif(regexp_replace(coalesce(p_dados ->> 'cpf', ''), '\D', '', 'g'), '');
    if cpf is not null and length(cpf) <> 11 then raise exception 'o CPF tem 11 números'; end if;
  end if;
  select to_jsonb(s) into antes from public.funcionarios_sigilo s where s.funcionario_id = p_funcionario;
  insert into public.funcionarios_sigilo (funcionario_id) values (p_funcionario) on conflict (funcionario_id) do nothing;
  update public.funcionarios_sigilo s set
    cpf     = case when p_dados ? 'cpf'     then cpf else s.cpf end,
    rg      = case when p_dados ? 'rg'      then nullif(btrim(coalesce(p_dados ->> 'rg', '')), '')      else s.rg end,
    pis     = case when p_dados ? 'pis'     then nullif(btrim(coalesce(p_dados ->> 'pis', '')), '')     else s.pis end,
    ctps    = case when p_dados ? 'ctps'    then nullif(btrim(coalesce(p_dados ->> 'ctps', '')), '')    else s.ctps end,
    cnh     = case when p_dados ? 'cnh'     then nullif(btrim(coalesce(p_dados ->> 'cnh', '')), '')     else s.cnh end,
    banco   = case when p_dados ? 'banco'   then nullif(btrim(coalesce(p_dados ->> 'banco', '')), '')   else s.banco end,
    agencia = case when p_dados ? 'agencia' then nullif(btrim(coalesce(p_dados ->> 'agencia', '')), '') else s.agencia end,
    conta   = case when p_dados ? 'conta'   then nullif(btrim(coalesce(p_dados ->> 'conta', '')), '')   else s.conta end,
    pix     = case when p_dados ? 'pix'     then nullif(btrim(coalesce(p_dados ->> 'pix', '')), '')     else s.pix end,
    updated_at = now(), updated_by = auth.uid()
  where s.funcionario_id = p_funcionario
  returning to_jsonb(s) into depois;
  mudou := array(select c from unnest(campos) c where (antes ->> c) is distinct from (depois ->> c));
  if cardinality(mudou) > 0 then
    perform public.registrar_evento_seguranca('alterar_sigilo', 'funcionario', p_funcionario, p_nome, mudou);
  end if;
end $$;
revoke execute on function public.sigilo_gravar(uuid, text, jsonb) from public, anon, authenticated;

-- Lista: só uma parte de cada dado (sem registrar: nada sigiloso aparece por inteiro)
create or replace function public.funcionarios_sigilo_resumo()
returns table (funcionario_id uuid, cpf text, rg text, pis text, ctps text, cnh text,
               banco text, agencia text, conta text, pix text, preenchidos integer)
language sql stable security definer set search_path = public as $$
  select s.funcionario_id, public.mascarar(s.cpf, 'cpf'), public.mascarar(s.rg, 'doc'), public.mascarar(s.pis, 'doc'),
         public.mascarar(s.ctps, 'doc'), public.mascarar(s.cnh, 'doc'), s.banco, s.agencia,
         public.mascarar(s.conta, 'doc'), public.mascarar(s.pix, 'pix'),
         num_nonnulls(s.cpf, s.rg, s.pis, s.ctps, s.cnh, s.banco, s.agencia, s.conta, s.pix)::integer
  from public.funcionarios_sigilo s
  where public.tem_papel('financeiro');
$$;
revoke execute on function public.funcionarios_sigilo_resumo() from public, anon;
grant execute on function public.funcionarios_sigilo_resumo() to authenticated;

-- Mostrar por inteiro: confere o papel e registra quem viu
create or replace function public.funcionario_sigilo_ver(p_funcionario uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.funcionarios_sigilo;
  nome text;
begin
  if not public.tem_papel('financeiro') then raise exception 'sem permissão para ver estes dados'; end if;
  select f.nome into nome from public.funcionarios f where f.id = p_funcionario;
  if nome is null then raise exception 'funcionário não encontrado'; end if;
  select * into r from public.funcionarios_sigilo s where s.funcionario_id = p_funcionario;
  perform public.registrar_evento_seguranca('ver_sigilo', 'funcionario', p_funcionario, nome, null);
  return jsonb_build_object('cpf', r.cpf, 'rg', r.rg, 'pis', r.pis, 'ctps', r.ctps, 'cnh', r.cnh,
                            'banco', r.banco, 'agencia', r.agencia, 'conta', r.conta, 'pix', r.pix);
end $$;
revoke execute on function public.funcionario_sigilo_ver(uuid) from public, anon;
grant execute on function public.funcionario_sigilo_ver(uuid) to authenticated;

-- Alterar: confere o papel; o registro guarda quais campos mudaram (nunca os valores)
create or replace function public.funcionario_sigilo_salvar(p_funcionario uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare nome text;
begin
  if not public.tem_papel('financeiro') then raise exception 'sem permissão para alterar estes dados'; end if;
  select f.nome into nome from public.funcionarios f where f.id = p_funcionario;
  if nome is null then raise exception 'funcionário não encontrado'; end if;
  perform public.sigilo_gravar(p_funcionario, nome, coalesce(p_dados, '{}'::jsonb));
end $$;
revoke execute on function public.funcionario_sigilo_salvar(uuid, jsonb) from public, anon;
grant execute on function public.funcionario_sigilo_salvar(uuid, jsonb) to authenticated;

-- Rede de segurança: se algum dado sigiloso chegar nas colunas antigas de funcionarios
-- (tela antiga ainda aberta, importação), vai para a tabela protegida antes do histórico gravar.
-- O nome "aa_" faz este gatilho rodar antes de trg_funcionarios_atualizado e zz_auditoria.
create or replace function public.trg_funcionarios_sigilo()
returns trigger language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  d := jsonb_strip_nulls(jsonb_build_object(
    'cpf', nullif(btrim(new.cpf), ''), 'rg', nullif(btrim(new.rg), ''), 'pis', nullif(btrim(new.pis), ''),
    'ctps', nullif(btrim(new.ctps), ''), 'cnh', nullif(btrim(new.cnh), ''), 'banco', nullif(btrim(new.banco), ''),
    'agencia', nullif(btrim(new.agencia), ''), 'conta', nullif(btrim(new.conta), ''), 'pix', nullif(btrim(new.pix), '')));
  if d <> '{}'::jsonb then
    perform public.sigilo_gravar(new.id, new.nome, d);
  end if;
  new.cpf := null; new.rg := null; new.pis := null; new.ctps := null; new.cnh := null;
  new.banco := null; new.agencia := null; new.conta := null; new.pix := null;
  return new;
end $$;
revoke execute on function public.trg_funcionarios_sigilo() from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'aa_sigilo' and tgrelid = 'public.funcionarios'::regclass) then
    create trigger aa_sigilo before insert or update on public.funcionarios
      for each row execute function public.trg_funcionarios_sigilo();
  end if;
end $$;
