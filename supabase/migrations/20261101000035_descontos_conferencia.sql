-- Descontos por tipo de venda (parte 3, AINDA NÃO APLICADA): a conferência no banco ao aprovar a venda (PDV e
-- pedido) e no envio da proposta. Os campos da aprovação no pedido só mudam pelas funções do banco.
-- Aditiva: gatilho novo em pedidos e marcar_proposta_enviada com a mesma conferência.

-- Pedido: os campos da aprovação só mudam pelas funções do banco; ao aprovar a venda, desconto acima do máximo
-- precisa da aprovação. Cliente aprovando a proposta pelo link (sem login do ERP) já passou pela conferência no envio.
create or replace function public.trg_pedido_desconto()
returns trigger language plpgsql set search_path = public as $$
declare v_pct numeric; v_max numeric; v_apor uuid; v_apct numeric; v_aem timestamptz;
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.desconto_aprovado_pct := null; new.desconto_aprovado_por := null; new.desconto_aprovado_em := null;
    else
      new.desconto_aprovado_pct := old.desconto_aprovado_pct; new.desconto_aprovado_por := old.desconto_aprovado_por;
      new.desconto_aprovado_em := old.desconto_aprovado_em;
    end if;
  end if;
  if new.status not in ('aprovado', 'faturado', 'entregue') then return new; end if;
  if tg_op = 'UPDATE' and old.status <> 'orcamento' then return new; end if;
  if auth.uid() is null or not public.is_erp_user() then return new; end if;
  v_pct := case when coalesce(new.valor_produtos, 0) > 0 then round(coalesce(new.desconto, 0) / new.valor_produtos * 100, 2) else 0 end;
  if v_pct <= 0 then return new; end if;
  v_max := public.desconto_maximo(new.origem, new.forma_pagamento);
  if v_max is null or v_pct <= v_max + 0.005 then return new; end if;
  if coalesce(new.desconto_aprovado_pct, 0) + 0.005 >= v_pct then return new; end if;
  if new.origem = 'balcao' then
    select a.aprovado_por, a.percentual, a.criado_em into v_apor, v_apct, v_aem from public.consumir_aprovacao_pdv(new.id, v_pct) a;
    if v_apor is not null then
      new.desconto_aprovado_pct := v_apct; new.desconto_aprovado_por := v_apor; new.desconto_aprovado_em := v_aem;
      return new;
    end if;
  end if;
  raise exception 'desconto de % passa do máximo de % para esta venda: peça a aprovação de um administrador (senha de aprovação)',
    public.percentual_br(v_pct), public.percentual_br(v_max);
end $$;

drop trigger if exists trg_pedido_desconto on public.pedidos;
create trigger trg_pedido_desconto before insert or update on public.pedidos
  for each row execute function public.trg_pedido_desconto();

-- proposta: a mesma conferência antes de mandar para o cliente (ele aprova pelo link, sem a senha)
create or replace function public.marcar_proposta_enviada(p_pedido uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_pct numeric; v_max numeric;
begin
  perform public.exigir_papel('vendas');
  select * into v_ped from pedidos where id = p_pedido for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if v_ped.status <> 'orcamento' then raise exception 'só orçamentos viram proposta'; end if;
  if v_ped.valor_total <= 0 then raise exception 'adicione os itens antes de enviar'; end if;
  v_pct := case when coalesce(v_ped.valor_produtos, 0) > 0 then round(coalesce(v_ped.desconto, 0) / v_ped.valor_produtos * 100, 2) else 0 end;
  v_max := public.desconto_maximo(v_ped.origem, v_ped.forma_pagamento);
  if v_pct > 0 and v_max is not null and v_pct > v_max + 0.005 and coalesce(v_ped.desconto_aprovado_pct, 0) + 0.005 < v_pct then
    raise exception 'desconto de % passa do máximo de % para esta venda: peça a aprovação de um administrador antes de enviar a proposta',
      public.percentual_br(v_pct), public.percentual_br(v_max);
  end if;
  update pedidos set proposta_status = 'enviada', proposta_enviada_em = now(),
    proposta_validade = case when proposta_validade >= current_date and proposta_status in ('enviada', 'visualizada') then proposta_validade
                             else current_date + (select validade_orcamento_dias from configuracoes where id = 1) end,
    proposta_visualizada_em = null, proposta_respondida_em = null, motivo_rejeicao = null, motivo_rejeicao_texto = null
  where id = p_pedido;
  return v_ped.proposta_token;
end $$;
