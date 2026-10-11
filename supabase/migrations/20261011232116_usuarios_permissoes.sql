-- =====================================================================
-- Usuários e permissões
--   * papéis adicionais: a pessoa tem um papel principal e pode somar vendas/financeiro/técnico
--     (ex.: vende e também atende a assistência) sem virar administrador
--   * cadastro mais completo: função (cargo) e telefone/WhatsApp
--   * senha provisória: troca obrigatória no primeiro acesso (e depois de redefinida pelo admin)
--   * nunca fica sem administrador ativo
-- Somente acréscimos: colunas novas, funções (create or replace), gatilho novo.
-- =====================================================================

alter table public.usuarios_erp add column if not exists papeis_extras text[] not null default '{}';
alter table public.usuarios_erp add column if not exists cargo text;
alter table public.usuarios_erp add column if not exists telefone text;
alter table public.usuarios_erp add column if not exists trocar_senha boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'usuarios_erp_papeis_extras_validos') then
    alter table public.usuarios_erp add constraint usuarios_erp_papeis_extras_validos
      check (papeis_extras <@ array['vendas', 'financeiro', 'tecnico']::text[]);
  end if;
end $$;

-- Papel principal ou adicional (admin sempre passa). Usada em todas as políticas do banco.
create or replace function public.tem_papel(variadic p_papeis text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios_erp
    where user_id = auth.uid() and ativo
      and (papel = 'admin' or papel = any(p_papeis) or papeis_extras && p_papeis)
  );
$$;

-- A própria pessoa avisa que já trocou a senha provisória
create or replace function public.marcar_senha_trocada()
returns void language sql security definer set search_path = public as $$
  update public.usuarios_erp set trocar_senha = false where user_id = auth.uid() and trocar_senha;
$$;
revoke execute on function public.marcar_senha_trocada() from public, anon;
grant execute on function public.marcar_senha_trocada() to authenticated;

-- Sempre sobra ao menos um administrador ativo
create or replace function public.trg_usuarios_ultimo_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.papel = 'admin' and old.ativo and (new.papel <> 'admin' or not new.ativo)
     and not exists (select 1 from public.usuarios_erp where user_id <> old.user_id and papel = 'admin' and ativo) then
    raise exception 'é preciso manter ao menos um administrador ativo';
  end if;
  if tg_op = 'DELETE' and old.papel = 'admin' and old.ativo
     and not exists (select 1 from public.usuarios_erp where user_id <> old.user_id and papel = 'admin' and ativo) then
    raise exception 'é preciso manter ao menos um administrador ativo';
  end if;
  -- admin e contador não são papéis adicionais; o principal não se repete nos adicionais
  if tg_op <> 'DELETE' then
    new.papeis_extras := coalesce(array(select distinct x from unnest(new.papeis_extras) x where x <> new.papel order by x), '{}');
    if new.papel in ('admin', 'contador') then new.papeis_extras := '{}'; end if;
    return new;
  end if;
  return old;
end $$;
revoke execute on function public.trg_usuarios_ultimo_admin() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_usuarios_ultimo_admin' and tgrelid = 'public.usuarios_erp'::regclass) then
    create trigger trg_usuarios_ultimo_admin before insert or update or delete on public.usuarios_erp
      for each row execute function public.trg_usuarios_ultimo_admin();
  end if;
end $$;
