-- Acessos (Usuários → topo): quando a pessoa saiu (botão Sair) e quanto tempo ficou parada com o ERP aberto.
-- Parado = sinal sem mexer no mouse/teclado/tela nos últimos 5 minutos, ou tela escondida (outra aba, celular bloqueado).
set local lock_timeout = '10s';

alter table public.acessos_usuarios
  add column if not exists saiu_em timestamptz,
  add column if not exists minutos_inativo integer not null default 0;

-- versão nova ao lado da antiga (2 argumentos), que segue atendendo as telas abertas antes da troca
create or replace function public.registrar_acesso(p_dispositivo text, p_navegador text, p_ativo boolean)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint; v_ultimo timestamptz; v_gap numeric; v_cab jsonb; v_ip text; v_nome text;
begin
  if not public.is_erp_user() then return null; end if;
  select id, ultimo_sinal_em into v_id, v_ultimo from acessos_usuarios
   where user_id = auth.uid() and saiu_em is null and ultimo_sinal_em > now() - interval '30 minutes'
   order by ultimo_sinal_em desc limit 1;
  if v_id is not null then
    v_gap := extract(epoch from now() - v_ultimo) / 60;
    update acessos_usuarios
       set ultimo_sinal_em = now(),
           minutos_inativo = minutos_inativo + round(case when not coalesce(p_ativo, true) then v_gap when v_gap > 6 then v_gap - 5 else 0 end)::int
     where id = v_id;
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
revoke all on function public.registrar_acesso(text, text, boolean) from public, anon;
grant execute on function public.registrar_acesso(text, text, boolean) to authenticated;

/** Botão Sair: fecha a entrada aberta com a hora da saída. */
create or replace function public.registrar_saida()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update acessos_usuarios set saiu_em = now(), ultimo_sinal_em = now()
   where id = (select id from acessos_usuarios where user_id = auth.uid() and saiu_em is null
                order by ultimo_sinal_em desc limit 1);
end $$;
revoke all on function public.registrar_saida() from public, anon;
grant execute on function public.registrar_saida() to authenticated;
