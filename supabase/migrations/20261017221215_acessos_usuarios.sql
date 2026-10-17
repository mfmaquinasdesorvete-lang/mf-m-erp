-- =====================================================================
-- Registro dos acessos ao ERP (Usuários → topo da tela): cada entrada de cada pessoa, com data e hora de entrada, o
-- último sinal enquanto a tela está aberta (a cada 5 minutos), o aparelho, o navegador e o endereço de internet.
-- Uma entrada nova quando a pessoa volta depois de 30 minutos sem sinal. O administrador vê todos; cada pessoa vê os
-- seus. Nada é apagado. Somente acréscimos.
-- =====================================================================

set local lock_timeout = '10s';

create table if not exists public.acessos_usuarios (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  nome text,
  entrou_em timestamptz not null default now(),
  ultimo_sinal_em timestamptz not null default now(),
  dispositivo text,
  navegador text,
  ip text
);
comment on table public.acessos_usuarios is 'Acessos ao ERP: entrada, último sinal, aparelho, navegador e endereço de internet';
create index if not exists acessos_usuarios_pessoa on public.acessos_usuarios (user_id, entrou_em desc);
create index if not exists acessos_usuarios_data on public.acessos_usuarios (entrou_em desc);

alter table public.acessos_usuarios enable row level security;
revoke all on public.acessos_usuarios from anon, authenticated;
grant select on public.acessos_usuarios to authenticated;
do $$ begin
  create policy acessos_usuarios_ler on public.acessos_usuarios for select to authenticated
    using (public.is_erp_user() and (public.is_erp_admin() or user_id = auth.uid()));
exception when duplicate_object then null; end $$;

/** Marca o acesso de quem está com o ERP aberto: continua a entrada dos últimos 30 minutos ou abre uma nova. */
create or replace function public.registrar_acesso(p_dispositivo text default null, p_navegador text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint; v_cab jsonb; v_ip text; v_nome text;
begin
  if not public.is_erp_user() then return null; end if;
  select id into v_id from acessos_usuarios
   where user_id = auth.uid() and ultimo_sinal_em > now() - interval '30 minutes'
   order by ultimo_sinal_em desc limit 1;
  if v_id is not null then
    update acessos_usuarios set ultimo_sinal_em = now() where id = v_id;
    return v_id;
  end if;
  begin v_cab := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then v_cab := null; end;
  v_ip := nullif(trim(split_part(coalesce(v_cab->>'cf-connecting-ip', v_cab->>'x-real-ip', v_cab->>'x-forwarded-for', ''), ',', 1)), '');
  select nome into v_nome from usuarios_erp where user_id = auth.uid();
  insert into acessos_usuarios (user_id, nome, dispositivo, navegador, ip)
  values (auth.uid(), v_nome, left(nullif(trim(p_dispositivo), ''), 80), left(nullif(trim(p_navegador), ''), 80), left(v_ip, 64))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.registrar_acesso(text, text) from public, anon;
grant execute on function public.registrar_acesso(text, text) to authenticated;
