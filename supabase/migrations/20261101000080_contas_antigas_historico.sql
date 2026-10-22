-- Aprovações (pedido de 22/10): as contas já pagas ou canceladas com data antes de 01/10/2026 (lançadas dos extratos
-- antigos) viram histórico — 3.861 a pagar e 1 a receber saíram da fila — e as que entrarem assim depois também.
create or replace function public.trg_conta_antiga_historico()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.revisao = 'em_revisao' and new.status in ('pago', 'cancelado')
     and coalesce(new.data_pagamento, new.vencimento) < date '2026-10-01' then
    new.revisao := 'historico';
    new.revisao1_nome := 'Anterior a 01/10/2026: histórico';
    new.revisao1_em := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_zrb_conta_antiga on public.contas_pagar;
create trigger trg_zrb_conta_antiga before insert on public.contas_pagar for each row execute function public.trg_conta_antiga_historico();
drop trigger if exists trg_zrb_conta_antiga on public.contas_receber;
create trigger trg_zrb_conta_antiga before insert on public.contas_receber for each row execute function public.trg_conta_antiga_historico();
