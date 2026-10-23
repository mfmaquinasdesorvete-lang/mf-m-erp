-- Avisos da equipe também pelo WhatsApp: cada pessoa escolhe por onde recebe (Telegram, WhatsApp ou os dois).
-- O WhatsApp sai pelo número oficial da empresa (API da Meta), com o modelo mf_aviso_equipe aprovado. Enquanto o
-- número não estiver ligado ou o modelo não estiver aprovado, quem escolheu WhatsApp continua recebendo pelo Telegram.

alter table public.usuarios_erp
  add column if not exists avisos_canal text not null default 'telegram',
  add column if not exists avisos_whatsapp text;
do $$ begin
  alter table public.usuarios_erp add constraint usuarios_erp_avisos_canal_check check (avisos_canal in ('telegram', 'whatsapp', 'ambos'));
exception when duplicate_object then null; end $$;

-- situação do modelo na Meta (PENDING, APPROVED, REJECTED…); preenchida pela função whatsapp (acao "modelos")
alter table public.configuracoes add column if not exists whatsapp_modelo_equipe text;

alter table public.avisos drop constraint if exists avisos_canal_check;
alter table public.avisos add constraint avisos_canal_check check (canal in ('telegram', 'email', 'whatsapp'));

create or replace function public.avisar_equipe(p_tipo text, p_chave text, p_dados jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n int; m int; wa boolean;
begin
  select coalesce(c.whatsapp_numero_id, '') <> '' and c.whatsapp_modelo_equipe = 'APPROVED' into wa
    from public.configuracoes c where c.id = 1;
  wa := coalesce(wa, false);

  -- Telegram: quem escolheu Telegram ou os dois, e quem escolheu WhatsApp enquanto ele não funciona
  insert into public.avisos (tipo, canal, destino, usuario_id, dados, chave)
  select p_tipo, 'telegram', u.telegram_chat_id::text, u.user_id, p_dados, p_chave
    from public.usuarios_erp u
    join public.avisos_tipos t on t.tipo = p_tipo and t.ativo
   where u.ativo and u.telegram_chat_id is not null
     and (u.papel = 'admin' or u.papel = any(t.papeis))
     and coalesce((u.avisos ->> p_tipo)::boolean, true)
     and (u.avisos_canal in ('telegram', 'ambos') or not wa or u.avisos_whatsapp is null)
  on conflict (chave, canal, destino) do nothing;
  get diagnostics n = row_count;

  if wa then
    insert into public.avisos (tipo, canal, destino, usuario_id, dados, chave)
    select p_tipo, 'whatsapp', u.avisos_whatsapp, u.user_id, p_dados, p_chave
      from public.usuarios_erp u
      join public.avisos_tipos t on t.tipo = p_tipo and t.ativo
     where u.ativo and u.avisos_whatsapp is not null
       and (u.papel = 'admin' or u.papel = any(t.papeis))
       and coalesce((u.avisos ->> p_tipo)::boolean, true)
       and u.avisos_canal in ('whatsapp', 'ambos')
    on conflict (chave, canal, destino) do nothing;
    get diagnostics m = row_count;
    n := n + m;
  end if;
  return n;
end $$;

-- cada pessoa escolhe o próprio canal e número (Meus avisos)
create or replace function public.salvar_meu_canal_avisos(p_canal text, p_whatsapp text)
returns text language plpgsql security definer set search_path = public as $$
declare d text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
begin
  if p_canal not in ('telegram', 'whatsapp', 'ambos') then raise exception 'Escolha Telegram, WhatsApp ou os dois.'; end if;
  if d ~ '^\d{10,11}$' then d := '55' || d; end if;
  if d = '' then d := null;
  elsif d !~ '^55\d{10,11}$' then raise exception 'WhatsApp inválido: use DDD + número (ex.: 47 99999-9999).';
  end if;
  if p_canal <> 'telegram' and d is null then raise exception 'Informe o número do WhatsApp.'; end if;
  update public.usuarios_erp set avisos_canal = p_canal, avisos_whatsapp = d where user_id = auth.uid();
  return d;
end $$;
revoke all on function public.salvar_meu_canal_avisos(text, text) from public, anon;
grant execute on function public.salvar_meu_canal_avisos(text, text) to authenticated;
