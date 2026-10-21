-- =====================================================================
-- Conta master (a dona) acima dos administradores
--   * o papel continua "admin" (tudo o que o admin faz continua igual);
--     "master" é uma marca a mais, que só se dá pelo banco (SQL)
--   * só a master cria, promove ou mexe em administradores e nas
--     permissões dos usuários; ninguém se dá a marca master pela tela
--   * fica sempre pelo menos uma master ativa
--   * o registro de acessos (quem entrou, quando saiu) só a master vê
--     de todos; cada um continua vendo o seu
-- A tela mostra a Retaguarda (carteira pessoal, My Frost Sorveterias,
-- usuários, configurações) só para a master.
-- =====================================================================
alter table public.usuarios_erp add column if not exists master boolean not null default false;
comment on column public.usuarios_erp.master is 'Conta master (dona): acima dos administradores; só se marca pelo banco';

create or replace function public.is_erp_master()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios_erp where user_id = auth.uid() and ativo and papel = 'admin' and master);
$$;
revoke execute on function public.is_erp_master() from public, anon;
grant execute on function public.is_erp_master() to authenticated;

create or replace function public.trg_usuarios_master()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_master boolean := public.is_erp_master();
begin
  -- sempre uma master ativa
  if tg_op in ('UPDATE', 'DELETE') and old.master and old.ativo and old.papel = 'admin'
     and (tg_op = 'DELETE' or not new.master or not new.ativo or new.papel <> 'admin')
     and not exists (select 1 from usuarios_erp u where u.user_id <> old.user_id and u.master and u.ativo and u.papel = 'admin') then
    raise exception 'o ERP precisa de pelo menos uma conta master ativa';
  end if;

  -- pela tela (usuário logado) só a master mexe em permissões; o servidor (funções) confere por conta própria
  if auth.uid() is not null and not v_master then
    if tg_op = 'INSERT' then
      if new.master or new.papel = 'admin' then raise exception 'só a conta master cria administradores'; end if;
    elsif tg_op = 'UPDATE' then
      if new.master is distinct from old.master then raise exception 'só pelo banco se marca a conta master'; end if;
      if (old.papel = 'admin' or new.papel = 'admin') and old.user_id <> auth.uid()
         and (new.papel, new.papeis_extras, new.ativo) is distinct from (old.papel, old.papeis_extras, old.ativo) then
        raise exception 'só a conta master altera administradores';
      end if;
      if old.user_id = auth.uid() and (new.papel, new.papeis_extras, new.ativo) is distinct from (old.papel, old.papeis_extras, old.ativo) then
        raise exception 'você não pode mudar as próprias permissões';
      end if;
    elsif tg_op = 'DELETE' then
      if old.papel = 'admin' or old.master then raise exception 'só a conta master remove administradores'; end if;
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists trg_usuarios_master on public.usuarios_erp;
create trigger trg_usuarios_master before insert or update or delete on public.usuarios_erp
  for each row execute function public.trg_usuarios_master();

-- registro de acessos: a master vê o de todos; cada um, o seu
alter policy acessos_usuarios_ler on public.acessos_usuarios
  using (public.is_erp_user() and (public.is_erp_master() or user_id = auth.uid()));

-- A conta master é marcada à parte, pelo SQL Editor:
--   update public.usuarios_erp set master = true where user_id = '<id da dona>';
