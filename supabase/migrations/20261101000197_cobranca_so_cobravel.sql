-- Cobrança automática errada ao cliente (29/10, pelo ELO): o aviso diário "3 dias antes / 1 dia depois" do vencimento
-- (gerar_avisos_diarios) não passava pela regra de conta cobrável que a régua usa, e mandou "Seu pagamento está em
-- aberto" para a parcela do pedido #628 paga pelo cliente direto a fornecedores, para contas já pagas sem baixa, de
-- pedidos cancelados e de cartão (10 e-mails desde 10/10). Agora os dois caminhos usam a mesma regra, mais rígida:
-- - cartão não é cobrado (o dinheiro vem da maquininha);
-- - só contas do ERP novo (desde a virada do Tiny, 28/09/2026); antigas e importadas do Tiny não são cobradas sozinhas;
-- - paga a terceiros ou fornecedores, acordo, permuta, "a identificar" ou "não cobrado" (na descrição ou no marcador):
--   não é cobrança ao cliente;
-- - entrada no extrato com o mesmo valor desde a semana do vencimento, ainda sem conciliar: pode já estar paga;
-- - OS cancelada e pedido cancelado ou sem NF de venda autorizada: não cobra.
-- O tipo de aviso cli_cobranca_vencida e o passo "5 dias depois" da régua seguem pausados até o ok da usuária.

create or replace function public.conta_receber_cobravel(c contas_receber)
returns boolean language sql stable set search_path = public as $$
  select coalesce(c.forma_pagamento, '') <> 'cartao'
     and c.id_externo is null and c.created_at >= '2026-09-28'
     and coalesce(c.descricao, '') !~* '(terceir|fornecedor|a identificar|acordo|permuta|n[aã]o cobr)'
     and not exists (select 1 from public.marcadores m where m.id = any (coalesce(c.marcadores, '{}')) and m.nome ~* 'n[aã]o cobr')
     and not exists (select 1 from public.extrato_lancamentos e
                      where e.status = 'pendente' and e.valor = c.valor and e.data >= c.vencimento - 7)
     and (c.os_id is null or exists (select 1 from public.ordens_servico o where o.id = c.os_id and o.status <> 'cancelada'))
     and (c.pedido_id is null
          or exists (
            select 1 from public.pedidos p
             where p.id = c.pedido_id and p.status <> 'cancelado' and p.excluida_em is null
               and exists (
                 select 1 from public.notas_fiscais n, jsonb_array_elements(coalesce(n.payload->'items', '[]'::jsonb)) i
                  where n.pedido_id = p.id and n.status = 'autorizada' and n.excluida_em is null
                    and regexp_replace(coalesce(i->>'cfop', ''), '\D', '', 'g') ~ '^[567](10[0-9]|11[0-9]|12[0-5]|40[1-5])$')))
$$;

-- o aviso diário (3 dias antes e 1 dia depois) passa pela mesma regra
do $$
declare d text; antes text := 'and vencimento in (current_date + 3, current_date - 1) loop';
  depois text := 'and vencimento in (current_date + 3, current_date - 1)
            and public.conta_receber_cobravel(contas_receber) loop';
begin
  d := pg_get_functiondef('public.gerar_avisos_diarios()'::regprocedure);
  if position('conta_receber_cobravel' in d) = 0 then
    if position(antes in d) = 0 then raise exception 'gerar_avisos_diarios mudou: confira o laço das contas a receber'; end if;
    execute replace(d, antes, depois);
  end if;
end $$;
