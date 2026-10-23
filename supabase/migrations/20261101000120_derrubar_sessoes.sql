-- Derrubar sessões (pedido de 23/10, requisito da pesquisa da Lynn): o administrador encerra na hora as entradas no
-- ERP de uma pessoa (celular roubado, saiu da empresa) ou de todo mundo (suspeita de invasão). Cada entrada tem um
-- número de sessão no login (auth.sessions); as funções que dizem quem é da equipe e qual o papel passam a conferir
-- se a sessão de quem chama ainda existe. Apagada a sessão, o banco deixa de liberar os dados no mesmo instante
-- (sem esperar o login vencer) e o login não se renova mais.

-- a sessão de quem chama ainda existe? (login sem número de sessão, como o do agendamento, não é barrado aqui)
create or replace function public.sessao_viva()
returns boolean language sql stable security definer set search_path = public as $$
  select case when nullif(auth.jwt() ->> 'session_id', '') is null then true
              else exists (select 1 from auth.sessions s where s.id = (auth.jwt() ->> 'session_id')::uuid) end;
$$;

create or replace function public.is_erp_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios_erp
                  where user_id = auth.uid() and ativo and papel not in ('contador', 'representante')
                    and public.rosto_ok(papel, papeis_extras))
     and public.sessao_viva();
$$;

create or replace function public.tem_papel(variadic p_papeis text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios_erp
    where user_id = auth.uid() and ativo
      and (papel = 'admin' or papel = any(p_papeis) or papeis_extras && p_papeis)
      and public.rosto_ok(papel, papeis_extras)
  ) and public.sessao_viva();
$$;

create or replace function public.is_erp_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios_erp
    where user_id = auth.uid() and ativo and papel = 'admin' and public.rosto_ok(papel, papeis_extras)
  ) and public.sessao_viva();
$$;

create or replace function public.is_erp_master()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios_erp
                  where user_id = auth.uid() and ativo and papel = 'admin' and master and public.rosto_ok(papel, papeis_extras))
     and public.sessao_viva();
$$;

create or replace function public.e_contador()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios_erp where user_id = auth.uid() and ativo and papel = 'contador')
     and public.sessao_viva();
$$;

/** Para a tela: a minha entrada ainda vale? (se o administrador derrubou, o ERP sai sozinho) */
create or replace function public.minha_sessao_viva()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.sessao_viva();
$$;

/**
 * O administrador derruba as sessões de uma pessoa (p_usuario) ou de todo mundo (p_usuario nulo). A sessão de
 * quem está derrubando fica, para não se trancar fora. Devolve quantas sessões caíram; fica no Histórico.
 */
create or replace function public.derrubar_sessoes(p_usuario uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_minha uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_qtd int;
begin
  if not public.is_erp_admin() then raise exception 'Só o administrador derruba sessões'; end if;
  delete from auth.sessions s
   where (p_usuario is null or s.user_id = p_usuario)
     and (v_minha is null or s.id <> v_minha);
  get diagnostics v_qtd = row_count;
  insert into public.auditoria (tabela, registro_id, acao, usuario, usuario_nome, campos, antes, depois, motivo, origem)
  values ('usuarios_erp', coalesce(p_usuario::text, 'todos'), 'update', auth.uid(),
          (select nome from public.usuarios_erp where user_id = auth.uid()), array['sessoes'],
          jsonb_build_object('sessoes', v_qtd), jsonb_build_object('sessoes', 0),
          case when p_usuario is null then 'derrubou as sessões de todo mundo' else 'derrubou as sessões desta pessoa' end, 'usuario');
  return v_qtd;
end $$;

revoke execute on function public.sessao_viva() from public, anon;
revoke execute on function public.minha_sessao_viva() from public, anon;
revoke execute on function public.derrubar_sessoes(uuid) from public, anon;
grant execute on function public.sessao_viva() to authenticated;
grant execute on function public.minha_sessao_viva() to authenticated;
grant execute on function public.derrubar_sessoes(uuid) to authenticated;
