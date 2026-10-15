-- Avisos entre usuários: urgência (normal, importante, urgente), para todos, para um perfil ou para pessoas escolhidas,
-- e o "ciente" de quem leu (quem mandou vê quem já confirmou). Somente acréscimos.
alter table public.notificacoes add column if not exists urgencia text not null default 'normal';
alter table public.notificacoes add column if not exists destinatarios uuid[] not null default '{}';
alter table public.notificacoes add column if not exists remetente_id uuid;
alter table public.notificacoes add column if not exists remetente_nome text;
alter table public.notificacoes add column if not exists exige_ciencia boolean not null default false;
do $$ begin
  alter table public.notificacoes add constraint notificacoes_urgencia_valida check (urgencia in ('normal', 'importante', 'urgente'));
exception when duplicate_object then null; end $$;

-- aviso para pessoas: elas e quem mandou veem (vai com o papel 'mensagem', que ninguém tem, então a regra geral não libera)
do $$ begin
  create policy notificacoes_destinatario on public.notificacoes for select to authenticated
    using (public.is_erp_user() and (auth.uid() = any(destinatarios) or remetente_id = auth.uid()));
exception when duplicate_object then null; end $$;

create table if not exists public.notificacoes_ciencia (
  notificacao_id bigint not null,
  user_id uuid not null default auth.uid(),
  ciente_em timestamptz not null default now(),
  primary key (notificacao_id, user_id)
);
alter table public.notificacoes_ciencia enable row level security;
revoke all on public.notificacoes_ciencia from anon, authenticated;
grant select on public.notificacoes_ciencia to authenticated;
do $$ begin
  create policy notificacoes_ciencia_ler on public.notificacoes_ciencia for select to authenticated
    using (public.is_erp_user() and (user_id = auth.uid() or public.is_erp_admin()
      or exists (select 1 from public.notificacoes n where n.id = notificacao_id and n.remetente_id = auth.uid())));
exception when duplicate_object then null; end $$;

create or replace function public.enviar_aviso(
  p_titulo text, p_texto text default null, p_urgencia text default 'normal',
  p_para uuid[] default '{}', p_papeis text[] default '{}', p_link text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_nome text; v_pessoas boolean := coalesce(array_length(p_para, 1), 0) > 0;
begin
  if not public.is_erp_user() then raise exception 'sem permissão para esta ação'; end if;
  if coalesce(trim(p_titulo), '') = '' then raise exception 'Escreva o aviso'; end if;
  if coalesce(p_urgencia, '') not in ('normal', 'importante', 'urgente') then raise exception 'Urgência inválida'; end if;
  select nome into v_nome from usuarios_erp where user_id = auth.uid();
  insert into notificacoes (tipo, titulo, texto, link, papeis, urgencia, destinatarios, remetente_id, remetente_nome, exige_ciencia)
  values ('outro', left(trim(p_titulo), 140), nullif(left(trim(coalesce(p_texto, '')), 2000), ''), nullif(trim(coalesce(p_link, '')), ''),
          case when v_pessoas then '{mensagem}'::text[] else coalesce(p_papeis, '{}') end,
          p_urgencia, case when v_pessoas then p_para else '{}'::uuid[] end, auth.uid(), v_nome, p_urgencia <> 'normal')
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.ciente_aviso(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_erp_user() then raise exception 'sem permissão para esta ação'; end if;
  insert into notificacoes_ciencia (notificacao_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
end $$;

-- quem pode receber aviso (nome e perfil; a lista de usuários em si continua só para o administrador)
create or replace function public.usuarios_para_aviso()
returns table (user_id uuid, nome text, papel text) language sql stable security definer set search_path = public as $$
  select u.user_id, u.nome, u.papel from usuarios_erp u where public.is_erp_user() and u.ativo order by u.nome
$$;

revoke all on function public.enviar_aviso(text, text, text, uuid[], text[], text) from public, anon;
revoke all on function public.ciente_aviso(bigint) from public, anon;
revoke all on function public.usuarios_para_aviso() from public, anon;
grant execute on function public.enviar_aviso(text, text, text, uuid[], text[], text) to authenticated;
grant execute on function public.ciente_aviso(bigint) to authenticated;
grant execute on function public.usuarios_para_aviso() to authenticated;
