-- Login com o rosto (pedido #103, 23/10): administrador e financeiro confirmam a entrada com o rosto ou a digital do
-- celular ou do computador (segunda etapa WebAuthn do Supabase, que deixa a sessão em "aal2"). Até a data de
-- configuracoes.rosto_obrigatorio_em o ERP só convida a cadastrar; a partir dela, sem o rosto, as funções que dizem
-- quem é da equipe e qual o papel respondem "não" para administrador e financeiro, e o banco não libera nada para eles.
-- Sem data (null) nada é exigido: a data só é marcada depois de a dona cadastrar o rosto dela.

alter table public.configuracoes add column if not exists rosto_obrigatorio_em timestamptz;

-- a partir de quando o rosto vale para administrador e financeiro
create or replace function public.rosto_vigente()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rosto_obrigatorio_em <= now() from public.configuracoes where id = 1), false);
$$;

-- este papel precisa do rosto? (administrador ou financeiro, principal ou adicional)
create or replace function public.rosto_ok(p_papel text, p_extras text[])
returns boolean language sql stable set search_path = public as $$
  select not (p_papel in ('admin', 'financeiro') or 'financeiro' = any(coalesce(p_extras, '{}')))
      or coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not public.rosto_vigente();
$$;

create or replace function public.is_erp_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios_erp
                  where user_id = auth.uid() and ativo and papel not in ('contador', 'representante')
                    and public.rosto_ok(papel, papeis_extras));
$$;

create or replace function public.tem_papel(variadic p_papeis text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios_erp
    where user_id = auth.uid() and ativo
      and (papel = 'admin' or papel = any(p_papeis) or papeis_extras && p_papeis)
      and public.rosto_ok(papel, papeis_extras)
  );
$$;

create or replace function public.is_erp_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios_erp
    where user_id = auth.uid() and ativo and papel = 'admin' and public.rosto_ok(papel, papeis_extras)
  );
$$;

create or replace function public.is_erp_master()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios_erp
                  where user_id = auth.uid() and ativo and papel = 'admin' and master and public.rosto_ok(papel, papeis_extras));
$$;

-- para a tela: se este usuário usa o rosto e desde quando é obrigatório
create or replace function public.meu_rosto()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'exige', exists (select 1 from public.usuarios_erp u where u.user_id = auth.uid() and u.ativo
                      and (u.papel in ('admin', 'financeiro') or 'financeiro' = any(coalesce(u.papeis_extras, '{}')))),
    'obrigatorio_em', (select rosto_obrigatorio_em from public.configuracoes where id = 1));
$$;

revoke execute on function public.rosto_vigente() from public, anon;
revoke execute on function public.rosto_ok(text, text[]) from public, anon;
revoke execute on function public.meu_rosto() from public, anon;
grant execute on function public.rosto_vigente() to authenticated;
grant execute on function public.rosto_ok(text, text[]) to authenticated;
grant execute on function public.meu_rosto() to authenticated;
