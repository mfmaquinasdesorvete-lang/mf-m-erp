-- Comissões (pedido da usuária, 30/10):
-- 1) o administrador edita qualquer comissão que ainda não foi paga (vendedor, base, %, valor, descrição) ou tira só ela,
--    sempre com o motivo; a que foi tirada à mão não volta sozinha (nem quando a parcela é paga de novo);
-- 2) venda no cartão entra uma vez só: a primeira parcela do cartão paga lança uma comissão com todas as parcelas do
--    cartão do pedido (cartao_parcelas), e as outras parcelas não lançam de novo.

alter table public.comissoes add column if not exists cartao_parcelas uuid[];
alter table public.comissoes add column if not exists editada_em timestamptz;
alter table public.comissoes add column if not exists editada_por uuid;
alter table public.comissoes add column if not exists motivo_edicao text check (motivo_edicao is null or length(motivo_edicao) <= 500);

-- parcela já tem comissão (a dela, a do cartão que a cobre ou uma tirada à mão)
create or replace function public.comissao_cobre_parcela(p_pedido uuid, p_conta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.comissoes c
                  where c.pedido_id = p_pedido and (c.conta_receber_id = p_conta or p_conta = any (c.cartao_parcelas))
                    and (c.status <> 'cancelada' or c.motivo_edicao is not null));
$$;
revoke execute on function public.comissao_cobre_parcela(uuid, uuid) from public, anon, authenticated;

create or replace function public.lancar_comissao(p_pedido uuid, p_valor numeric, p_conta uuid, p_descricao text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_vend vendedores; v_base numeric; v_pct numeric; v_parte numeric := 1; v_desc text := p_descricao;
  v_cartao uuid[]; v_n int;
begin
  select * into v_ped from pedidos where id = p_pedido;
  if v_ped.vendedor_id is null then return; end if;
  select * into v_vend from vendedores where id = v_ped.vendedor_id;
  v_pct := coalesce(v_ped.comissao_percentual, public.comissao_percentual_pedido(p_pedido), v_vend.percentual);
  if v_pct <= 0 or v_ped.valor_total <= 0 then return; end if;
  -- cartão: uma comissão só, com todas as parcelas do cartão do pedido que ainda não têm comissão
  if p_conta is not null and (select forma_pagamento from contas_receber where id = p_conta) in ('cartao', 'cartao_credito') then
    if public.comissao_cobre_parcela(p_pedido, p_conta) then return; end if;
    select array_agg(r.id order by r.vencimento, r.descricao), sum(coalesce(r.valor_pago, r.valor)), count(*)
      into v_cartao, p_valor, v_n
      from contas_receber r
     where r.pedido_id = p_pedido and r.forma_pagamento in ('cartao', 'cartao_credito') and r.status <> 'cancelado'
       and (r.id = p_conta or not public.comissao_cobre_parcela(p_pedido, r.id));
    v_desc := 'Pedido #' || v_ped.numero || ' · cartão' || case when v_n > 1 then ' em ' || v_n || ' parcelas (entra uma vez só)' else '' end;
  end if;
  -- vendedor por recebimento com parte liberada no faturamento: a aprovação lança essa parte e cada parcela paga o resto
  if v_vend.base = 'recebimento' and coalesce(v_vend.liberacao_faturamento_pct, 0) > 0 then
    if p_conta is null then
      v_parte := v_vend.liberacao_faturamento_pct / 100;
      v_desc := v_desc || ' · ' || trim_scale(v_vend.liberacao_faturamento_pct) || '% no faturamento';
    else
      v_parte := (100 - v_vend.liberacao_faturamento_pct) / 100;
      v_desc := v_desc || ' · ' || trim_scale(100 - v_vend.liberacao_faturamento_pct) || '% no recebimento';
    end if;
    if v_parte <= 0 then return; end if;
  end if;
  v_base := round(p_valor * v_parte * case when v_vend.descontar_frete then greatest(v_ped.valor_total - v_ped.frete, 0) / v_ped.valor_total else 1 end, 2);
  insert into comissoes (vendedor_id, pedido_id, conta_receber_id, descricao, base, percentual, valor, cartao_parcelas)
  values (v_vend.id, p_pedido, p_conta, v_desc, v_base, round(v_pct, 2), round(v_base * v_pct / 100, 2), v_cartao)
  on conflict (conta_receber_id) do update set descricao = excluded.descricao, base = excluded.base, percentual = excluded.percentual,
    valor = excluded.valor, vendedor_id = excluded.vendedor_id, cartao_parcelas = excluded.cartao_parcelas, status = 'a_pagar', pago_em = null
  where comissoes.status = 'cancelada' and comissoes.conta_pagar_id is null and comissoes.motivo_edicao is null;
end $$;

-- parcela que volta a ficar em aberto: a comissão dela sai; a do cartão só sai quando nenhuma parcela do cartão está paga
create or replace function public.trg_comissao_recebimento()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ids uuid[];
begin
  if new.pedido_id is null then return new; end if;
  if new.status = 'pago' and old.status is distinct from 'pago'
     and (select v.base from pedidos p join vendedores v on v.id = p.vendedor_id where p.id = new.pedido_id) = 'recebimento' then
    perform public.lancar_comissao(new.pedido_id, coalesce(new.valor_pago, new.valor), new.id, coalesce(new.descricao, 'Parcela'));
  elsif old.status = 'pago' and new.status <> 'pago' then
    select array_agg(c.id) into v_ids from comissoes c
     where c.status = 'a_pagar'
       and ((c.cartao_parcelas is null and c.conta_receber_id = new.id)
         or (new.id = any (c.cartao_parcelas)
             and not exists (select 1 from contas_receber r where r.id = any (c.cartao_parcelas) and r.id <> new.id and r.status = 'pago')));
    if v_ids is not null then perform public.cancelar_comissoes(v_ids, 'recebimento estornado'); end if;
  end if;
  return new;
end $$;

-- vendedor ou % do pedido mudou: refaz do zero as que não foram pagas (também solta as tiradas à mão)
create or replace function public.recalcular_comissoes_pedido(p_pedido uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_vend vendedores; v_c record;
begin
  select * into v_ped from pedidos where id = p_pedido;
  update comissoes set status = 'cancelada', conta_receber_id = null, cartao_parcelas = null
   where pedido_id = p_pedido and status = 'a_pagar' and conta_pagar_id is null;
  update comissoes set conta_receber_id = null, cartao_parcelas = null
   where pedido_id = p_pedido and status = 'cancelada' and conta_pagar_id is null;
  if v_ped.vendedor_id is null or v_ped.status not in ('aprovado', 'faturado', 'entregue') then return; end if;
  select * into v_vend from vendedores where id = v_ped.vendedor_id;
  if v_vend.base = 'faturamento' or coalesce(v_vend.liberacao_faturamento_pct, 0) > 0 then
    if not exists (select 1 from comissoes where pedido_id = p_pedido and conta_receber_id is null and status <> 'cancelada') then
      perform public.lancar_comissao(p_pedido, v_ped.valor_total, null, 'Pedido #' || v_ped.numero);
    end if;
  end if;
  if v_vend.base = 'recebimento' then
    for v_c in select id, coalesce(valor_pago, valor) as v, descricao from contas_receber
                where pedido_id = p_pedido and status = 'pago' order by vencimento, descricao loop
      if not public.comissao_cobre_parcela(p_pedido, v_c.id) then
        perform public.lancar_comissao(p_pedido, v_c.v, v_c.id, coalesce(v_c.descricao, 'Parcela'));
      end if;
    end loop;
  end if;
end $$;
revoke execute on function public.recalcular_comissoes_pedido(uuid) from public, anon, authenticated;

-- editar uma comissão (só o administrador). p_dados: { vendedor_id?, base?, percentual?, valor?, descricao?, tirar? }
create or replace function public.editar_comissao(p_id uuid, p_dados jsonb, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare c comissoes; v_vend uuid; v_base numeric; v_pct numeric; v_valor numeric; v_conta contas_pagar;
begin
  if not public.is_erp_admin() then raise exception 'só o administrador edita comissões'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'escreva o motivo (mínimo 5 letras)'; end if;
  select * into c from comissoes where id = p_id for update;
  if not found then raise exception 'comissão não encontrada'; end if;
  if c.status = 'paga' then raise exception 'comissão já paga em %: não dá para mudar', to_char(c.pago_em, 'DD/MM/YYYY'); end if;
  if c.conta_pagar_id is not null then
    select * into v_conta from contas_pagar where id = c.conta_pagar_id;
    if v_conta.status = 'pago' then raise exception 'a conta a pagar desta comissão já foi paga'; end if;
  end if;

  if coalesce((p_dados->>'tirar')::boolean, false) then
    if c.status = 'cancelada' then raise exception 'esta comissão já foi tirada'; end if;
    perform public.cancelar_comissoes(array[p_id], btrim(p_motivo));
    update comissoes set editada_em = now(), editada_por = auth.uid(), motivo_edicao = btrim(p_motivo) where id = p_id;
    return;
  end if;
  if c.status = 'cancelada' then raise exception 'comissão tirada: para voltar, troque o vendedor no pedido (refaz as comissões)'; end if;

  v_vend := coalesce(nullif(p_dados->>'vendedor_id', '')::uuid, c.vendedor_id);
  v_base := coalesce((p_dados->>'base')::numeric, c.base);
  v_pct := coalesce((p_dados->>'percentual')::numeric, c.percentual);
  v_valor := coalesce((p_dados->>'valor')::numeric, round(v_base * v_pct / 100, 2));
  if not exists (select 1 from vendedores where id = v_vend) then raise exception 'vendedor não encontrado'; end if;
  if v_vend <> c.vendedor_id and c.conta_pagar_id is not null then
    raise exception 'esta comissão já está numa conta a pagar do vendedor: cancele aquela conta antes de trocar o vendedor';
  end if;
  if v_base < 0 or v_valor < 0 or v_pct < 0 or v_pct > 100 then raise exception 'valores inválidos (base e comissão não podem ser negativas; %% de 0 a 100)'; end if;

  update comissoes set vendedor_id = v_vend, base = round(v_base, 2), percentual = round(v_pct, 2), valor = round(v_valor, 2),
         descricao = coalesce(nullif(btrim(p_dados->>'descricao'), ''), descricao),
         editada_em = now(), editada_por = auth.uid(), motivo_edicao = btrim(p_motivo)
   where id = p_id;
  -- já estava num pagamento em aberto: o valor da conta acompanha
  if c.conta_pagar_id is not null and v_conta.status = 'aberto' then
    update contas_pagar set valor = (select sum(valor) from comissoes where conta_pagar_id = c.conta_pagar_id and status = 'a_pagar'),
           motivo_alteracao = 'Comissão editada: ' || btrim(p_motivo)
     where id = c.conta_pagar_id;
  end if;
end $$;
revoke execute on function public.editar_comissao(uuid, jsonb, text) from public, anon;
grant execute on function public.editar_comissao(uuid, jsonb, text) to authenticated;

-- comissões previstas no portal do vendedor: parcela coberta pela comissão do cartão não aparece de novo
do $$
declare d text;
begin
  d := pg_get_functiondef('public.portal_comissoes_linhas(uuid)'::regprocedure);
  if position('cartao_parcelas' in d) = 0 then
    if position('where c.conta_receber_id = r.id and c.status <> ''cancelada''' in d) = 0 then
      raise exception 'portal_comissoes_linhas mudou: confira as previstas';
    end if;
    execute replace(d, 'where c.conta_receber_id = r.id and c.status <> ''cancelada''',
                       'where (c.conta_receber_id = r.id or r.id = any (c.cartao_parcelas)) and c.status <> ''cancelada''');
  end if;
end $$;

-- as vendas no cartão que já entraram uma vez por parcela (não pagas e fora do contas a pagar) viram uma comissão só
do $$
declare p record; r record;
begin
  for p in
    select c.pedido_id from comissoes c join contas_receber cr on cr.id = c.conta_receber_id
     where cr.forma_pagamento in ('cartao', 'cartao_credito') and c.status = 'a_pagar' and c.conta_pagar_id is null and c.motivo_edicao is null
     group by c.pedido_id
    having count(*) > 1
       and not exists (select 1 from comissoes x join contas_receber xr on xr.id = x.conta_receber_id
                        where x.pedido_id = c.pedido_id and xr.forma_pagamento in ('cartao', 'cartao_credito')
                          and (x.status = 'paga' or x.conta_pagar_id is not null))
  loop
    delete from comissoes c using contas_receber cr
     where cr.id = c.conta_receber_id and c.pedido_id = p.pedido_id and cr.forma_pagamento in ('cartao', 'cartao_credito')
       and c.status = 'a_pagar' and c.conta_pagar_id is null;
    select id, coalesce(valor_pago, valor) v, descricao into r from contas_receber
     where pedido_id = p.pedido_id and forma_pagamento in ('cartao', 'cartao_credito') and status = 'pago'
     order by vencimento, descricao limit 1;
    perform public.lancar_comissao(p.pedido_id, r.v, r.id, coalesce(r.descricao, 'Parcela'));
  end loop;
end $$;
