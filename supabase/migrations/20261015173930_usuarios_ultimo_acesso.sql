-- Último acesso de cada usuário (vem do login, não da tabela de usuários): para a auditoria apontar
-- quem não entra há mais de 90 dias. Só administrador, financeiro e contador. Somente acréscimo.
create or replace function public.usuarios_ultimo_acesso()
returns table (user_id uuid, ultimo_acesso timestamptz) language sql stable security definer set search_path = public as $$
  select u.user_id, a.last_sign_in_at from usuarios_erp u left join auth.users a on a.id = u.user_id
   where public.tem_papel('financeiro', 'contador')
$$;
revoke all on function public.usuarios_ultimo_acesso() from public, anon;
grant execute on function public.usuarios_ultimo_acesso() to authenticated;
