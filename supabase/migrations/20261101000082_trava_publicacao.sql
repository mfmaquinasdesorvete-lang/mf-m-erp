-- Trava de publicação (pedido de 22/10): com vários chats do Claude trabalhando ao mesmo tempo, só um publica
-- por vez (site na Hostinger ou funções do Supabase). Quem vai publicar chama publicacao_comecar; se outro chat
-- estiver publicando, dá erro e é preciso esperar. Uma publicação parada há mais de 20 min é considerada abandonada.
create table if not exists public.publicacoes (
  id uuid primary key default gen_random_uuid(),
  chat text not null,
  o_que text not null,
  inicio timestamptz not null default now(),
  fim timestamptz,
  situacao text not null default 'publicando' check (situacao in ('publicando', 'feita', 'abandonada'))
);
create unique index if not exists publicacoes_uma_por_vez on public.publicacoes ((true)) where situacao = 'publicando';
alter table public.publicacoes enable row level security;
revoke all on public.publicacoes from anon, authenticated;

create or replace function public.publicacao_comecar(p_chat text, p_o_que text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_outra public.publicacoes; v_id uuid;
begin
  update public.publicacoes set situacao = 'abandonada', fim = now()
   where situacao = 'publicando' and inicio < now() - interval '20 minutes';
  select * into v_outra from public.publicacoes where situacao = 'publicando' limit 1;
  if found then
    raise exception 'Outro chat está publicando: % (%), desde % (horário de Brasília). Espere uns minutos e tente de novo.',
      v_outra.chat, v_outra.o_que, to_char(v_outra.inicio at time zone 'America/Sao_Paulo', 'HH24:MI');
  end if;
  insert into public.publicacoes (chat, o_que) values (p_chat, p_o_que) returning id into v_id;
  return v_id;
end $$;

create or replace function public.publicacao_terminar(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.publicacoes set situacao = 'feita', fim = now() where id = p_id and situacao = 'publicando';
$$;

revoke all on function public.publicacao_comecar(text, text) from public, anon, authenticated;
revoke all on function public.publicacao_terminar(uuid) from public, anon, authenticated;
