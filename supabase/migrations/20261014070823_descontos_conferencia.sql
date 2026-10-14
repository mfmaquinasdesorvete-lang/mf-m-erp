-- Descontos por tipo de venda (parte 3): os campos da aprovação no pedido só mudam pelas funções do banco; ao aprovar
-- a venda (PDV ou pedido), desconto acima do máximo precisa da aprovação. Sem regra cadastrada, nada muda.
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
  raise exception 'desconto de % acima do máximo de % para esta venda: falta a aprovação do administrador',
    public.percentual_br(v_pct), public.percentual_br(v_max);
end $$;

create or replace trigger trg_pedido_desconto before insert or update on public.pedidos
  for each row execute function public.trg_pedido_desconto();
