-- Cobrança (decisão da usuária, 30/10, pelo ELO): venda no Pix que vence no mesmo dia em que foi aprovada ganha 1 dia a
-- mais: o aviso de cobrança vencida (cli_cobranca_vencida) sai 2 dias depois do vencimento, e não 1. O resto fica igual
-- (lembrete 3 dias antes, régua, regra de conta cobrável).

-- conta do Pix de uma venda que venceu no dia da aprovação (dia de Brasília)
create or replace function public.conta_receber_pix_do_dia(c public.contas_receber)
returns boolean language sql stable security definer set search_path = public as $$
  select c.forma_pagamento = 'pix' and c.pedido_id is not null
     and exists (select 1 from public.pedidos p where p.id = c.pedido_id and p.aprovado_em is not null
                  and (p.aprovado_em at time zone 'America/Sao_Paulo')::date = c.vencimento);
$$;
revoke execute on function public.conta_receber_pix_do_dia(public.contas_receber) from public, anon;

do $$
declare d text;
begin
  d := pg_get_functiondef('public.gerar_avisos_diarios()'::regprocedure);
  if position('conta_receber_pix_do_dia' in d) = 0 then
    if position('and vencimento in (current_date + 3, current_date - 1)' in d) = 0 then
      raise exception 'gerar_avisos_diarios mudou: confira a seleção das contas a receber';
    end if;
    execute replace(d, 'and vencimento in (current_date + 3, current_date - 1)',
      'and (vencimento = current_date + 3 or vencimento = current_date - case when public.conta_receber_pix_do_dia(contas_receber) then 2 else 1 end)');
  end if;
end $$;
