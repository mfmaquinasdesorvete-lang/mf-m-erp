-- Primeiro acesso: enquanto não existir nenhum usuário no ERP, quem entrar
-- primeiro vira administrador (dispensa rodar SQL na instalação).
-- Depois disso a função não faz mais nada.

create or replace function public.erp_sem_usuarios()
returns boolean
language sql stable security definer set search_path = public
as $$ select not exists (select 1 from public.usuarios_erp); $$;

create or replace function public.reivindicar_primeiro_admin(p_nome text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return false; end if;
  -- trava para dois cadastros simultâneos não virarem admin ao mesmo tempo
  lock table public.usuarios_erp in exclusive mode;
  if exists (select 1 from public.usuarios_erp) then return false; end if;
  insert into public.usuarios_erp (user_id, nome, papel)
  values (auth.uid(), coalesce(nullif(trim(p_nome), ''), 'Administrador'), 'admin');
  return true;
end $$;

revoke execute on function public.erp_sem_usuarios() from public;
revoke execute on function public.reivindicar_primeiro_admin(text) from public, anon;
grant execute on function public.erp_sem_usuarios() to anon, authenticated;
grant execute on function public.reivindicar_primeiro_admin(text) to authenticated;
