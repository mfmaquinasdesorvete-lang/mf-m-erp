-- Vigia de segurança (pedido de 23/10): todo dia o banco confere sozinho os itens de segurança e avisa o
-- administrador (sino, com ciência) quando aparece algo novo ou errado. Resultado em Sobre → Segurança.
--
-- Como funciona: seguranca_estado() lê a situação de agora (tabelas sem regra de acesso, o que o visitante sem login
-- alcança, funções com poder total sem conferir quem chama, arquivos públicos, administradores...). A "base" é a
-- situação já auditada e aceita; o vigia avisa só o que apareceu de novo em relação a ela. Quando a mudança está
-- certa, o administrador aceita (seguranca_aceitar) e a base passa a ser a de agora.
-- Além da base, conferências de quantidade: muitas contas novas da Loja num dia, administrador ou financeiro sem o
-- rosto depois da data e gente da equipe sem entrar há 60 dias.

create table if not exists public.seguranca_vigia_base (
  chave text primary key,
  itens text[] not null default '{}',
  aceito_em timestamptz not null default now(),
  aceito_por uuid
);

create table if not exists public.seguranca_vigia (
  id bigint generated always as identity primary key,
  conferido_em timestamptz not null default now(),
  achados jsonb not null default '[]',
  problemas int not null default 0,
  origem text not null default 'agendamento' check (origem in ('agendamento', 'manual'))
);
create index if not exists seguranca_vigia_em on public.seguranca_vigia (conferido_em desc);

alter table public.seguranca_vigia_base enable row level security;
alter table public.seguranca_vigia enable row level security;
revoke all on public.seguranca_vigia_base from anon, public;
revoke all on public.seguranca_vigia from anon, public;
grant select on public.seguranca_vigia_base, public.seguranca_vigia to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'seguranca_vigia_base' and policyname = 'seguranca_vigia_base_ler') then
    create policy seguranca_vigia_base_ler on public.seguranca_vigia_base for select to authenticated using (public.is_erp_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'seguranca_vigia' and policyname = 'seguranca_vigia_ler') then
    create policy seguranca_vigia_ler on public.seguranca_vigia for select to authenticated using (public.is_erp_admin());
  end if;
end $$;

/** A situação de agora, em listas comparáveis com a base. */
create or replace function public.seguranca_estado()
returns jsonb language sql stable security definer set search_path = public as $$
  with fn as (
    select p.oid, p.proname, p.prosecdef, p.proconfig, p.prosrc, p.prorettype = 'trigger'::regtype as gatilho
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  ), rel as (
    select c.oid, c.relname, c.relkind, c.relrowsecurity, c.reloptions
      from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
  )
  select jsonb_build_object(
    'tabelas_sem_rls', coalesce((select jsonb_agg(relname order by relname) from rel where relkind in ('r', 'p') and not relrowsecurity), '[]'),
    'visitante_tabelas', coalesce((select jsonb_agg(relname order by relname) from rel
        where has_table_privilege('anon', oid, 'select, insert, update, delete')), '[]'),
    'regras_abertas', coalesce((select jsonb_agg(tablename || '.' || policyname order by tablename, policyname) from pg_policies
        where schemaname = 'public' and permissive = 'PERMISSIVE' and cmd in ('SELECT', 'ALL')
          and (roles && array['authenticated', 'public', 'anon']::name[]) and btrim(coalesce(qual, '')) = 'true'), '[]'),
    'visitante_funcoes', coalesce((select jsonb_agg(distinct proname) from fn
        where prosecdef and not gatilho and has_function_privilege('anon', oid, 'execute')), '[]'),
    'funcoes_sem_conferir', coalesce((select jsonb_agg(distinct proname) from fn
        where prosecdef and not gatilho and has_function_privilege('authenticated', oid, 'execute')
          and prosrc !~* '(exigir_papel|tem_papel|tem_algum_papel|is_erp_|e_contador|pode_[a-z_]+\(|auth\.uid\(\)|auth\.role\(\)|portal_meu_vendedor|portal_vendedor_exigido|projeto_pode|metas_meus)'), '[]'),
    'funcoes_sem_caminho', coalesce((select jsonb_agg(distinct proname) from fn
        where prosecdef and not exists (select 1 from unnest(coalesce(proconfig, '{}')) x where x like 'search_path=%')), '[]'),
    'visoes_sem_invoker', coalesce((select jsonb_agg(relname order by relname) from rel
        where relkind in ('v', 'm') and not coalesce(reloptions && array['security_invoker=true', 'security_invoker=on'], false)), '[]'),
    'arquivos_publicos', coalesce((select jsonb_agg(id order by id) from storage.buckets where public), '[]'),
    'administradores', coalesce((select jsonb_agg(user_id::text order by user_id) from usuarios_erp where ativo and papel = 'admin'), '[]')
  );
$$;

/** Nome para o aviso. */
create or replace function public.seguranca_rotulo(p_chave text)
returns text language sql immutable set search_path = public as $$
  select case p_chave
    when 'tabelas_sem_rls' then 'Tabela sem regra de acesso (qualquer um poderia ler)'
    when 'visitante_tabelas' then 'Tabela aberta para quem não fez login'
    when 'regras_abertas' then 'Regra que libera a tabela para qualquer conta logada (inclusive cliente da Loja)'
    when 'visitante_funcoes' then 'Função com poder total aberta para quem não fez login'
    when 'funcoes_sem_conferir' then 'Função com poder total que não confere quem chama'
    when 'funcoes_sem_caminho' then 'Função com poder total sem o caminho de busca fixo'
    when 'visoes_sem_invoker' then 'Visão que passa por cima das regras de acesso'
    when 'arquivos_publicos' then 'Pasta de arquivos pública'
    when 'administradores' then 'Administrador novo no ERP'
    else p_chave end;
$$;

/** Confere tudo, guarda o resultado e avisa o administrador do que é novo ou está errado. */
create or replace function public.vigiar_seguranca(p_manual boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_estado jsonb := public.seguranca_estado();
  v_achados jsonb := '[]';
  v_chave text; v_novos text[]; v_base text[];
  v_qtd int; v_nomes text; v_titulo text; v_texto text; r record;
begin
  -- o agendamento roda sem usuário; quem está logado só se for administrador
  if auth.uid() is not null and not public.is_erp_admin() then raise exception 'Só o administrador confere a segurança'; end if;

  -- 1) o que apareceu de novo em relação à base aceita
  for v_chave in select jsonb_object_keys(v_estado) loop
    select itens into v_base from seguranca_vigia_base where chave = v_chave;
    if v_base is null then
      -- primeira vez: a situação de agora vira a base (já auditada)
      insert into seguranca_vigia_base (chave, itens) values (v_chave, array(select jsonb_array_elements_text(v_estado -> v_chave)))
        on conflict (chave) do nothing;
      continue;
    end if;
    v_novos := array(select x from jsonb_array_elements_text(v_estado -> v_chave) x where x <> all (v_base));
    if cardinality(v_novos) > 0 then
      if v_chave = 'administradores' then
        select string_agg(nome, ', ') into v_nomes from usuarios_erp where user_id::text = any (v_novos);
        v_novos := array[coalesce(v_nomes, 'conta nova')];
      end if;
      v_achados := v_achados || jsonb_build_object('chave', v_chave, 'gravidade',
        case when v_chave in ('tabelas_sem_rls', 'visitante_tabelas', 'visitante_funcoes', 'arquivos_publicos', 'administradores') then 'risco' else 'atencao' end,
        'titulo', public.seguranca_rotulo(v_chave), 'itens', to_jsonb(v_novos));
    end if;
  end loop;

  -- 2) muitas contas novas fora da equipe num dia (o normal é algum cliente da Loja de vez em quando)
  select count(*) into v_qtd from auth.users u
   where u.created_at > now() - interval '24 hours' and not exists (select 1 from usuarios_erp e where e.user_id = u.id);
  if v_qtd > 10 then
    v_achados := v_achados || jsonb_build_object('chave', 'contas_novas', 'gravidade', 'atencao',
      'titulo', v_qtd || ' contas de login criadas fora da equipe nas últimas 24 horas', 'itens', '[]'::jsonb);
  end if;

  -- 3) administrador ou financeiro sem o rosto depois da data
  if public.rosto_vigente() then
    select string_agg(e.nome, ', ' order by e.nome) into v_nomes from usuarios_erp e
     where e.ativo and (e.papel in ('admin', 'financeiro') or 'financeiro' = any(coalesce(e.papeis_extras, '{}')))
       and not exists (select 1 from auth.mfa_factors f where f.user_id = e.user_id and f.factor_type = 'webauthn' and f.status = 'verified');
    if v_nomes is not null then
      v_achados := v_achados || jsonb_build_object('chave', 'sem_rosto', 'gravidade', 'atencao',
        'titulo', 'Administrador ou financeiro sem o rosto cadastrado (não consegue entrar)', 'itens', to_jsonb(string_to_array(v_nomes, ', ')));
    end if;
  end if;

  -- 4) gente da equipe com acesso que não entra há 60 dias (ou nunca entrou, criada há mais de 30)
  select string_agg(e.nome, ', ' order by e.nome) into v_nomes from usuarios_erp e join auth.users u on u.id = e.user_id
   where e.ativo and (u.last_sign_in_at < now() - interval '60 days' or (u.last_sign_in_at is null and u.created_at < now() - interval '30 days'));
  if v_nomes is not null then
    v_achados := v_achados || jsonb_build_object('chave', 'sem_entrar', 'gravidade', 'atencao',
      'titulo', 'Acesso ativo de quem não entra há 60 dias: conferir se ainda precisa', 'itens', to_jsonb(string_to_array(v_nomes, ', ')));
  end if;

  insert into seguranca_vigia (achados, problemas, origem)
  values (v_achados, jsonb_array_length(v_achados), case when p_manual then 'manual' else 'agendamento' end);

  -- aviso no sino do administrador (o mesmo título não se repete em 20 horas)
  for r in select * from jsonb_array_elements(v_achados) a(x) loop
    v_titulo := 'Segurança: ' || (r.x ->> 'titulo');
    v_texto := coalesce(nullif(array_to_string(array(select jsonb_array_elements_text(r.x -> 'itens')), ', '), ''), '')
      || ' Veja Sobre → Segurança.';
    if not exists (select 1 from notificacoes where titulo = v_titulo and created_at > now() - interval '20 hours') then
      insert into notificacoes (tipo, titulo, texto, link, papeis, urgencia, exige_ciencia)
      values ('outro', left(v_titulo, 200), left(btrim(v_texto), 1000), '/sobre?aba=seguranca', '{admin}',
              case when r.x ->> 'gravidade' = 'risco' then 'urgente' else 'importante' end, r.x ->> 'gravidade' = 'risco');
    end if;
  end loop;
  return jsonb_array_length(v_achados);
end $$;

/** O administrador confere a mudança e aceita: a situação de agora vira a base. */
create or replace function public.seguranca_aceitar(p_chave text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado jsonb := public.seguranca_estado();
begin
  if not public.is_erp_admin() then raise exception 'Só o administrador aceita uma mudança de segurança'; end if;
  if not v_estado ? p_chave then raise exception 'item desconhecido'; end if;
  insert into seguranca_vigia_base (chave, itens, aceito_em, aceito_por)
  values (p_chave, array(select jsonb_array_elements_text(v_estado -> p_chave)), now(), auth.uid())
  on conflict (chave) do update set itens = excluded.itens, aceito_em = now(), aceito_por = auth.uid();
end $$;

revoke execute on function public.seguranca_estado() from public, anon, authenticated;
revoke execute on function public.seguranca_rotulo(text) from public, anon;
revoke execute on function public.vigiar_seguranca(boolean) from public, anon;
revoke execute on function public.seguranca_aceitar(text) from public, anon;
grant execute on function public.vigiar_seguranca(boolean) to authenticated;
grant execute on function public.seguranca_aceitar(text) to authenticated;

-- todo dia às 9h41 (Brasília)
select cron.schedule('erp-vigiar-seguranca', '41 12 * * *', $$ select public.vigiar_seguranca() $$);
