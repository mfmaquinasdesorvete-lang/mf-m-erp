-- Vendas → marcar → Conciliar (como no Tiny): procura no extrato do banco o Pix ou depósito de cada venda marcada.
-- Par certo: mesmo valor, conta bancária da mesma unidade, data perto, a venda com uma linha só e a linha do extrato
-- servindo só para ela. Sem p_aplicar é só a prévia (não grava nada). Ao aplicar (só os pares escolhidos na prévia), a
-- venda sem conta a receber ganha a conta já recebida na data do extrato (histórico: sem comissão, sem aviso e sem
-- aprovação, como "Lançar contas → já recebidas") e a linha fica conciliada com ela; a conta que já existia é só ligada
-- (a aberta é baixada pela conciliação).

-- Uma linha por (o que procurar × linha do extrato que serve); sem linha que sirva, lanc vem vazio.
-- O que procurar: cada conta da venda ainda sem linha conciliada; a venda inteira quando ela não tem conta.
create or replace function public.conciliar_vendas_candidatos(p_ids uuid[])
returns table (item uuid, pedido_id uuid, numero bigint, unidade_id uuid, cliente_id uuid, forma_pagamento text, vencimento date,
               conta_id uuid, tipo text, valor numeric, ja boolean, lanc uuid, data_extrato date, conta_extrato uuid, descricao text,
               n_item bigint, n_lanc bigint)
language sql stable security definer set search_path = public as $$
  with conc as (
    select conta_receber_id as id from extrato_lancamentos where status = 'conciliado' and conta_receber_id is not null
  ), vendas as (
    select p.id, p.numero, p.valor_total, p.unidade_id, p.cliente_id, p.forma_pagamento, p.primeiro_vencimento,
           (coalesce(p.aprovado_em, p.created_at) at time zone 'America/Sao_Paulo')::date as dia
      from pedidos p
     where p.id = any (p_ids) and p.excluida_em is null and p.status in ('aprovado', 'faturado', 'entregue') and p.valor_total > 0
  ), contas as (
    -- contas da venda: pelo pedido ou pela NF do pedido
    select v.id as pedido_id, c.id, c.status, c.valor, c.valor_pago, c.vencimento, c.data_pagamento, c.conta_bancaria_id
      from vendas v join contas_receber c on c.pedido_id = v.id and c.status <> 'cancelado'
    union
    select v.id, c.id, c.status, c.valor, c.valor_pago, c.vencimento, c.data_pagamento, c.conta_bancaria_id
      from vendas v join notas_fiscais n on n.pedido_id = v.id join contas_receber c on c.nota_fiscal_id = n.id and c.status <> 'cancelado'
  ), outras as (
    -- contas a receber ainda sem linha do extrato (a conciliação de sempre procura por elas)
    select c.id, c.pedido_id, c.unidade_id, c.status, c.valor, c.valor_pago, c.vencimento, c.data_pagamento
      from contas_receber c where c.status <> 'cancelado' and c.id not in (select id from conc)
  ), itens as (
    select coalesce(c.id, v.id) as item, v.id as pedido_id, v.numero, v.unidade_id, v.cliente_id, v.forma_pagamento,
           coalesce(v.primeiro_vencimento, v.dia) as vencimento, c.id as conta_id,
           case when c.id is null then 'nova' else 'conta' end as tipo,
           case when c.id is null then v.valor_total when c.status = 'pago' then coalesce(c.valor_pago, c.valor) else c.valor end as valor,
           case when c.id is null then v.dia - 10 when c.status = 'pago' then c.data_pagamento - 5 else c.vencimento - 10 end as de,
           case when c.id is null then v.dia + 60 when c.status = 'pago' then c.data_pagamento + 5 else c.vencimento + 30 end as ate,
           case when c.status = 'pago' then c.conta_bancaria_id end as so_conta,
           c.id is not null and c.id in (select id from conc) as ja
      from vendas v left join contas c on c.pedido_id = v.id
  ), cand as (
    -- entradas ainda pendentes, mesmo valor, contas bancárias da unidade, dentro do prazo
    select i.item, l.id as lanc, l.data, l.conta_bancaria_id, l.descricao
      from itens i
      join extrato_lancamentos l on l.status = 'pendente' and l.valor > 0 and l.valor = i.valor and l.data between i.de and i.ate
      join contas_bancarias b on b.id = l.conta_bancaria_id and b.unidade_id = i.unidade_id
     where not i.ja and (i.so_conta is null or l.conta_bancaria_id = i.so_conta)
       -- venda sem conta: a linha que também serve para outra conta a receber fica para a conciliação de sempre
       and not (i.tipo = 'nova' and exists (
              select 1 from outras c
               where c.unidade_id = i.unidade_id and c.pedido_id is distinct from i.pedido_id
                 and ((c.status = 'aberto' and c.valor = l.valor and c.vencimento between l.data - 10 and l.data + 10)
                   or (c.status = 'pago' and coalesce(c.valor_pago, c.valor) = l.valor and c.data_pagamento between l.data - 3 and l.data + 3))))
  )
  select i.item, i.pedido_id, i.numero, i.unidade_id, i.cliente_id, i.forma_pagamento, i.vencimento, i.conta_id, i.tipo, i.valor, i.ja,
         c.lanc, c.data, c.conta_bancaria_id, c.descricao,
         count(c.lanc) over (partition by i.item),
         case when c.lanc is not null then count(*) over (partition by c.lanc) end
    from itens i left join cand c on c.item = i.item;
$$;
revoke execute on function public.conciliar_vendas_candidatos(uuid[]) from public, anon, authenticated;

-- Alguma palavra do nome do cliente (nome ou fantasia, 4 letras ou mais, sem as genéricas) aparece na descrição do extrato
create or replace function public.nome_no_extrato(p_nome text, p_fantasia text, p_descricao text)
returns boolean language sql immutable set search_path = public as $$
  select exists (
    select 1 from regexp_split_to_table(translate(upper(coalesce(p_nome, '') || ' ' || coalesce(p_fantasia, '')),
                    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC'), '[^A-Z]+') t
     where length(t) >= 4
       and t not in ('LTDA', 'EIRELI', 'COMERCIO', 'ALIMENTOS', 'INDUSTRIA', 'SORVETES', 'SORVETERIA', 'ACAI', 'ACAITERIA',
                     'LANCHES', 'SERVICOS', 'DISTRIBUIDORA', 'COMERCIAL', 'BRASIL', 'GELADOS', 'FROZEN')
       and position(t in translate(upper(coalesce(p_descricao, '')), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')) > 0);
$$;

create or replace function public.conciliar_vendas(p_ids uuid[], p_aplicar boolean default false, p_escolhidos uuid[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; v_conta uuid; v_feitas int := 0; v_criadas int := 0; v_erros jsonb := '[]'::jsonb; v_res jsonb;
begin
  perform public.exigir_papel('financeiro');
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'marque ao menos uma venda'; end if;
  if cardinality(p_ids) > 500 then raise exception 'no máximo 500 vendas por vez'; end if;
  if p_aplicar and coalesce(cardinality(p_escolhidos), 0) = 0 then raise exception 'escolha ao menos um par para conciliar'; end if;

  with base as (select * from public.conciliar_vendas_candidatos(p_ids)),
  -- par certo: o item tem uma linha só e a linha só serve para ele
  pares as (select * from base where n_item = 1 and n_lanc = 1)
  select jsonb_build_object(
    'vendas', (select count(distinct pedido_id) from base),
    'ja', (select count(distinct item) from base where ja),
    'pares', (select coalesce(jsonb_agg(jsonb_build_object('lanc', p.lanc, 'numero', p.numero, 'cliente', cl.nome, 'valor', p.valor,
                'data', p.data_extrato, 'banco', b.nome, 'descricao', left(p.descricao, 90), 'tipo', p.tipo,
                'nome_confere', public.nome_no_extrato(cl.nome, cl.nome_fantasia, p.descricao),
                'centavos', p.valor <> trunc(p.valor)) order by p.numero), '[]'::jsonb)
                from pares p left join clientes cl on cl.id = p.cliente_id left join contas_bancarias b on b.id = p.conta_extrato),
    -- mais de uma linha possível (ou a linha serve para mais de uma venda): conferir na tela Conciliação
    'duvida', (select coalesce(jsonb_agg(distinct x.numero), '[]'::jsonb) from base x
                where not x.ja and x.n_item > 0 and not exists (select 1 from pares p where p.item = x.item)),
    'sem_par', (select coalesce(jsonb_agg(distinct x.numero), '[]'::jsonb) from base x where not x.ja and x.n_item = 0),
    'pulados', (select coalesce(jsonb_agg(jsonb_build_object('numero', p.numero,
                  'motivo', case when p.excluida_em is not null then 'excluída' when p.status = 'orcamento' then 'orçamento: aprove a venda antes'
                                 when p.status = 'cancelado' then 'venda cancelada' else 'venda sem valor' end) order by p.numero), '[]'::jsonb)
                  from pedidos p where p.id = any (p_ids) and not exists (select 1 from base x where x.pedido_id = p.id)))
  into v_res;

  if p_aplicar then
    for r in select * from public.conciliar_vendas_candidatos(p_ids)
              where n_item = 1 and n_lanc = 1 and lanc = any (p_escolhidos) order by numero loop
      begin
        if r.tipo = 'nova' then
          -- outra conta pode ter entrado desde a prévia: não duplica
          if exists (select 1 from contas_receber c where c.pedido_id = r.pedido_id and c.status <> 'cancelado') then
            raise exception 'a venda já tem conta a receber';
          end if;
          insert into contas_receber (descricao, cliente_id, pedido_id, parcela, total_parcelas, valor, vencimento, forma_pagamento,
                                      unidade_id, status, data_pagamento, valor_pago, conta_bancaria_id, id_externo)
          values ('Pedido #' || r.numero || ' - parcela 1/1', r.cliente_id, r.pedido_id, 1, 1, r.valor, least(r.vencimento, r.data_extrato),
                  r.forma_pagamento, r.unidade_id, 'pago', r.data_extrato, r.valor, r.conta_extrato, 'pedido-concilia:' || r.pedido_id)
          returning id into v_conta;
          v_criadas := v_criadas + 1;
        else
          v_conta := r.conta_id;
        end if;
        perform public.vincular_lancamento(r.lanc, 'receber', v_conta);
        v_feitas := v_feitas + 1;
      exception when others then
        v_erros := v_erros || jsonb_build_object('numero', r.numero, 'erro', sqlerrm);
      end;
    end loop;
  end if;

  return v_res || jsonb_build_object('aplicado', p_aplicar, 'conciliadas', v_feitas, 'contas_criadas', v_criadas, 'erros', v_erros);
end $$;

revoke execute on function public.conciliar_vendas(uuid[], boolean, uuid[]) from public, anon;
grant execute on function public.conciliar_vendas(uuid[], boolean, uuid[]) to authenticated;
