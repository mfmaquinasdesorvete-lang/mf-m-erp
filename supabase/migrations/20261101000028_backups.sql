-- Backup diário completo do ERP (banco + arquivos), criptografado.
-- O GitHub gera o backup de madrugada e guarda no bucket privado "backups" (7 dias); a Hostinger baixa a cópia
-- do dia para uma pasta fora do site (30 dias + 1 por mês). Aqui fica o registro de cada backup, para o ERP
-- mostrar a situação e avisar quando atrasar. Só acrescenta.

insert into storage.buckets (id, name, public) values ('backups', 'backups', false) on conflict (id) do nothing;

create table if not exists public.backups_registro (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  status text not null check (status in ('ok', 'erro')),
  pasta text,                    -- backups/<pasta>/parte-000, parte-001…
  partes int,
  tamanho bigint,                -- bytes do arquivo criptografado
  sha256 text,                   -- do arquivo criptografado inteiro (confere a cópia da Hostinger)
  tabelas int,
  linhas bigint,
  arquivos int,
  restauracao_ok boolean,        -- o backup foi restaurado num banco de teste e as contagens bateram
  detalhe text,
  hostinger_em timestamptz,      -- quando a Hostinger baixou a cópia
  created_at timestamptz not null default now()
);
create index if not exists backups_registro_data_idx on public.backups_registro (created_at desc);
alter table public.backups_registro enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'backups_registro' and policyname = 'fin_select') then
    create policy "fin_select" on public.backups_registro for select to authenticated using (public.tem_papel('financeiro'));
  end if;
end $$;

-- Hash do código que a Hostinger usa para baixar o backup (o código em si não fica no banco)
create table if not exists public.backups_config (
  id int primary key default 1 check (id = 1),
  token_hash text,
  atualizado_em timestamptz not null default now()
);
alter table public.backups_config enable row level security;  -- sem políticas: só o serviço lê

-- Backup com erro avisa na hora
create or replace function public.trg_backup_avisar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'erro' then
    perform public.notificar('outro', 'Backup diário falhou', left(coalesce(new.detalhe, 'veja em Configurações → Backups'), 200), '/configuracoes', '{financeiro}', null);
  elsif new.restauracao_ok is false then
    perform public.notificar('outro', 'Backup feito, mas o teste de restauração falhou', left(coalesce(new.detalhe, ''), 200), '/configuracoes', '{financeiro}', null);
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'backup_avisar' and tgrelid = 'public.backups_registro'::regclass) then
    create trigger backup_avisar after insert on public.backups_registro for each row execute function public.trg_backup_avisar();
  end if;
end $$;

-- Conferência diária (pg_cron, ver supabase/agendamento.sql): avisa se o backup ou a cópia da Hostinger atrasou
create or replace function public.conferir_backups()
returns void language plpgsql security definer set search_path = public as $$
declare v_ultimo backups_registro;
begin
  select * into v_ultimo from backups_registro where status = 'ok' order by created_at desc limit 1;
  if v_ultimo.id is null or v_ultimo.created_at < now() - interval '30 hours' then
    perform public.notificar('outro', 'Backup diário atrasado',
      case when v_ultimo.id is null then 'Nenhum backup feito ainda' else 'Último backup em ' || to_char(v_ultimo.created_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') end,
      '/configuracoes', '{financeiro}', null);
  elsif v_ultimo.hostinger_em is null and v_ultimo.created_at < now() - interval '8 hours' then
    perform public.notificar('outro', 'Cópia do backup não chegou na Hostinger',
      'O backup de ' || to_char(v_ultimo.created_at at time zone 'America/Sao_Paulo', 'DD/MM') || ' foi feito, mas a Hostinger não baixou',
      '/configuracoes', '{financeiro}', null);
  end if;
end $$;

revoke execute on function public.trg_backup_avisar() from public, anon, authenticated;
revoke execute on function public.conferir_backups() from public, anon, authenticated;
