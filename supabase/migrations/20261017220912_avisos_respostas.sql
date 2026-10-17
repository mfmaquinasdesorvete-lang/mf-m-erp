-- =====================================================================
-- Avisos entre usuários com resposta (conversa): quem recebeu um aviso — pelo nome, pelo perfil ou "todos" — e quem
-- mandou podem responder. A resposta vai para quem participa (quem mandou e as pessoas escolhidas, menos quem
-- responde; aviso para um perfil ou para todos responde só para quem mandou), com a mesma urgência dos avisos
-- (importante e urgente pedem "Ciente"). notificacoes.conversa_id junta a conversa (o id do primeiro aviso) e
-- resposta_de aponta a mensagem respondida. Somente acréscimos.
-- =====================================================================

set local lock_timeout = '10s';

alter table public.notificacoes
  add column if not exists conversa_id bigint,
  add column if not exists resposta_de bigint;
comment on column public.notificacoes.conversa_id is 'Conversa a que a resposta pertence (id do primeiro aviso)';
comment on column public.notificacoes.resposta_de is 'Mensagem que esta respondeu';
create index if not exists notificacoes_conversa on public.notificacoes (conversa_id) where conversa_id is not null;

create or replace function public.responder_aviso(p_id bigint, p_texto text, p_urgencia text default 'normal')
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare o record; v_eu uuid := auth.uid(); v_para uuid[]; v_nome text; v_id bigint;
begin
  if not public.is_erp_user() then raise exception 'sem permissão para esta ação'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'Escreva a resposta'; end if;
  if coalesce(p_urgencia, '') not in ('normal', 'importante', 'urgente') then raise exception 'Urgência inválida'; end if;
  select * into o from notificacoes where id = p_id and remetente_id is not null;
  if not found then raise exception 'aviso não encontrado'; end if;
  -- responde quem participa: quem mandou, quem recebeu pelo nome ou pelo perfil (ou "todos")
  if not (o.remetente_id = v_eu or v_eu = any(o.destinatarios)
          or (coalesce(cardinality(o.destinatarios), 0) = 0
              and (coalesce(cardinality(o.papeis), 0) = 0 or public.tem_papel(variadic o.papeis)))) then
    raise exception 'sem permissão para responder este aviso';
  end if;
  v_para := array(select distinct x from unnest(array_append(o.destinatarios, o.remetente_id)) x where x is not null and x <> v_eu);
  if coalesce(cardinality(v_para), 0) = 0 then raise exception 'não há para quem responder'; end if;
  select nome into v_nome from usuarios_erp where user_id = v_eu;
  insert into notificacoes (tipo, titulo, texto, link, papeis, urgencia, destinatarios, remetente_id, remetente_nome, exige_ciencia,
                            conversa_id, resposta_de)
  values ('outro', left('Re: ' || regexp_replace(o.titulo, '^(Re: )+', ''), 140), left(trim(p_texto), 2000), o.link, '{mensagem}',
          p_urgencia, v_para, v_eu, v_nome, p_urgencia <> 'normal', coalesce(o.conversa_id, o.id), o.id)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.responder_aviso(bigint, text, text) from public, anon;
grant execute on function public.responder_aviso(bigint, text, text) to authenticated;
