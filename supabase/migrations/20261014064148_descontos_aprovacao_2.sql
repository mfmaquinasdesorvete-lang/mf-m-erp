-- Descontos por tipo de venda (parte 2): aprovar com a senha do administrador. Senha errada não dá exceção (a
-- tentativa fica registrada): volta ok false e o erro. Pedido: grava a aprovação no orçamento. PDV: a aprovação vale
-- para a próxima venda de quem pediu, por 30 minutos.
create or replace function public.aprovar_desconto(p_aprovador uuid, p_senha text, p_percentual numeric, p_contexto text,
  p_pedido uuid default null, p_canal text default null, p_forma text default null, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_hash text; v_nome text; v_erros int; v_ped pedidos; v_id uuid; v_max numeric; v_canal text; v_forma text;
begin
  if not public.is_erp_user() then raise exception 'sem permissão'; end if;
  if p_contexto is null or p_contexto not in ('pdv', 'pedido') then raise exception 'contexto inválido'; end if;
  if p_percentual is null or p_percentual <= 0 or p_percentual > 100 then raise exception 'percentual de desconto inválido'; end if;
  select u.nome, s.hash into v_nome, v_hash
    from usuarios_erp u join senhas_aprovacao s on s.user_id = u.user_id
   where u.user_id = p_aprovador and u.ativo and u.papel = 'admin';
  if v_hash is null then return jsonb_build_object('ok', false, 'erro', 'este administrador ainda não criou a senha de aprovação'); end if;
  select count(*) into v_erros from aprovacao_tentativas t
   where t.aprovador = p_aprovador and not t.ok and t.criado_em > now() - interval '15 minutes'
     and t.criado_em > coalesce((select max(x.criado_em) from aprovacao_tentativas x where x.aprovador = p_aprovador and x.ok), '-infinity'::timestamptz);
  if v_erros >= 5 then return jsonb_build_object('ok', false, 'erro', 'muitas tentativas erradas: espere 15 minutos'); end if;
  if v_hash <> extensions.crypt(coalesce(p_senha, ''), v_hash) then
    insert into aprovacao_tentativas (aprovador, solicitado_por, ok) values (p_aprovador, auth.uid(), false);
    return jsonb_build_object('ok', false, 'erro', 'senha de aprovação incorreta', 'restantes', greatest(0, 4 - v_erros));
  end if;
  insert into aprovacao_tentativas (aprovador, solicitado_por, ok) values (p_aprovador, auth.uid(), true);

  if p_contexto = 'pedido' then
    select * into v_ped from pedidos where id = p_pedido for update;
    if not found then raise exception 'pedido não encontrado'; end if;
    if v_ped.status <> 'orcamento' then raise exception 'o desconto se aprova no orçamento, antes de aprovar a venda'; end if;
    v_canal := v_ped.origem; v_forma := v_ped.forma_pagamento;
    update pedidos set desconto_aprovado_pct = round(p_percentual, 2), desconto_aprovado_por = p_aprovador, desconto_aprovado_em = now()
     where id = p_pedido;
  else
    v_canal := coalesce(p_canal, 'balcao'); v_forma := p_forma;
  end if;
  v_max := public.desconto_maximo(v_canal, v_forma);
  insert into aprovacoes_desconto (contexto, pedido_id, percentual, maximo_percentual, canal, forma_pagamento, aprovado_por, aprovado_por_nome,
                                   solicitado_por, solicitado_por_nome, motivo, usado_em)
  values (p_contexto, case when p_contexto = 'pedido' then p_pedido end, round(p_percentual, 2), v_max, v_canal, v_forma, p_aprovador, v_nome,
          auth.uid(), (select nome from usuarios_erp where user_id = auth.uid()), nullif(left(btrim(coalesce(p_motivo, '')), 300), ''),
          case when p_contexto = 'pedido' then now() end)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'percentual', round(p_percentual, 2), 'aprovado_por', v_nome);
end $$;
revoke execute on function public.aprovar_desconto(uuid, text, numeric, text, uuid, text, text, text) from public, anon;
grant execute on function public.aprovar_desconto(uuid, text, numeric, text, uuid, text, text, text) to authenticated;

-- PDV: usa a aprovação pedida na tela por quem está vendendo (a mais recente, ainda não usada, de até 30 minutos)
create or replace function public.consumir_aprovacao_pdv(p_pedido uuid, p_pct numeric)
returns table (aprovado_por uuid, percentual numeric, criado_em timestamptz) language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select a.id into v_id from aprovacoes_desconto a
   where a.contexto = 'pdv' and a.usado_em is null and a.solicitado_por = auth.uid() and a.criado_em > now() - interval '30 minutes'
     and a.percentual + 0.005 >= p_pct
   order by a.criado_em desc limit 1 for update;
  if v_id is null then return; end if;
  return query update aprovacoes_desconto a set usado_em = now(), pedido_id = p_pedido where a.id = v_id
    returning a.aprovado_por, a.percentual, a.criado_em;
end $$;
revoke execute on function public.consumir_aprovacao_pdv(uuid, numeric) from public, anon, authenticated;
