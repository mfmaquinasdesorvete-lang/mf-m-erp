-- Revisão do REV (31/10): a conta_receber_pix_do_dia (migração 204) é só ajudante da gerar_avisos_diarios e não precisa
-- rodar com o dono: volta a ser da pessoa que chama (dentro da gerar_avisos_diarios continua com o dono dela).
-- E os índices que faltavam para as ligações novas (oportunidades e máquinas unificadas).

create or replace function public.conta_receber_pix_do_dia(c public.contas_receber)
returns boolean language sql stable security invoker set search_path = public as $$
  select c.forma_pagamento = 'pix' and c.pedido_id is not null
     and exists (select 1 from public.pedidos p where p.id = c.pedido_id and p.aprovado_em is not null
                  and (p.aprovado_em at time zone 'America/Sao_Paulo')::date = c.vencimento);
$$;
revoke execute on function public.conta_receber_pix_do_dia(public.contas_receber) from public, anon;

create index if not exists oportunidades_unidade on public.oportunidades (unidade_id);
create index if not exists equipamentos_unificados_ficou on public.equipamentos_unificados (ficou_id);
