-- NF-e de entrada emitida pela MF (máquina usada de pessoa física, conserto, retorno de comodato/demonstração…).
--  * estoque_nota_direta: na nota de entrada (tipo_operacao = 'entrada') o lançamento dá ENTRADA no estoque e o
--    estorno tira; nas saídas continua igual (baixa e devolve).
--  * lancar_contas_nota: nota de entrada não gera conta a receber.
-- Aditiva: só troca o corpo das duas funções; não apaga nem altera dados.

create or replace function public.estoque_nota_direta(p_nota uuid, p_estornar boolean default false)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare n notas_fiscais; i jsonb; p produtos; c record; v_tipo text; v_q numeric; k int := 0; v_entrada boolean; v_rotulo text;
begin
  perform public.exigir_papel('vendas', 'financeiro');
  select * into n from notas_fiscais where id = p_nota for update;
  if not found then raise exception 'nota não encontrada'; end if;
  if n.pedido_id is not null or n.itens is null then raise exception 'só para nota direta (a do pedido baixa o estoque pelo pedido)'; end if;
  if n.ambiente = 'homologacao' then raise exception 'nota de teste (homologação) não mexe no estoque'; end if;
  if not p_estornar and n.status <> 'autorizada' then raise exception 'só depois que a nota for autorizada'; end if;
  v_entrada := coalesce(n.tipo_operacao, 'saida') = 'entrada';
  if coalesce(n.estoque_lancado, false) = (not p_estornar) then
    raise exception '%', case when p_estornar then 'o estoque desta nota não foi lançado' else 'o estoque desta nota já foi lançado' end;
  end if;
  -- saída: lançar = saída, estornar = entrada; entrada: o contrário
  v_tipo := case when p_estornar <> v_entrada then 'entrada' else 'saida' end;
  v_rotulo := case when v_entrada then 'NF-e de entrada ' else 'NF-e ' end || coalesce(n.numero, '');
  for i in select * from jsonb_array_elements(n.itens) loop
    v_q := coalesce(nullif(i->>'quantidade', '')::numeric, 0);
    if nullif(i->>'produto_id', '') is null or v_q <= 0 then continue; end if;
    select * into p from produtos where id = (i->>'produto_id')::uuid;
    if not found then continue; end if;
    if coalesce(p.kit, false) then
      for c in select componente_id, quantidade from public.kit_composicao(p.id, null) loop
        insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, unidade_id)
        values (c.componente_id, v_tipo, v_q * c.quantidade,
                case when p_estornar then 'Estorno da ' else '' end || v_rotulo || ' (nota direta, kit ' || p.descricao || ')',
                'nfe_direta', n.id, n.unidade_id);
        k := k + 1;
      end loop;
    else
      insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, unidade_id)
      values (p.id, v_tipo, v_q, case when p_estornar then 'Estorno da ' else '' end || v_rotulo || ' (nota direta)',
              'nfe_direta', n.id, n.unidade_id);
      k := k + 1;
    end if;
  end loop;
  update notas_fiscais set estoque_lancado = not p_estornar where id = p_nota;
  return k;
end $function$;

create or replace function public.lancar_contas_nota(p_nota uuid, p_parcelas integer default 1, p_primeiro date default null::date, p_intervalo integer default 30, p_forma text default 'boleto'::text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare n notas_fiscais; v_parc numeric; v_soma numeric := 0; k int;
begin
  perform public.exigir_papel('vendas', 'financeiro');
  select * into n from notas_fiscais where id = p_nota;
  if not found then raise exception 'nota não encontrada'; end if;
  if n.pedido_id is not null then raise exception 'esta nota é de um pedido: as contas saem do pedido'; end if;
  if coalesce(n.tipo_operacao, 'saida') = 'entrada' then raise exception 'nota de entrada não gera conta a receber (o pagamento de uma compra vai em Contas a pagar)'; end if;
  if n.status <> 'autorizada' then raise exception 'só depois que a nota for autorizada'; end if;
  if n.cliente_id is null then raise exception 'nota sem cliente'; end if;
  if exists (select 1 from contas_receber where nota_fiscal_id = p_nota and status <> 'cancelado') then
    raise exception 'as contas desta nota já foram lançadas';
  end if;
  if coalesce(n.valor_total, 0) <= 0 then raise exception 'nota sem valor'; end if;
  p_parcelas := greatest(1, least(coalesce(p_parcelas, 1), 24));
  v_parc := round(n.valor_total / p_parcelas, 2);
  for k in 1..p_parcelas loop
    insert into contas_receber (descricao, cliente_id, valor, vencimento, forma_pagamento, unidade_id, categoria, parcela, total_parcelas, nota_fiscal_id)
    values ('NF-e ' || coalesce(n.numero, '') || case when p_parcelas > 1 then ' - parcela ' || k || '/' || p_parcelas else '' end,
            n.cliente_id,
            case when k = p_parcelas then n.valor_total - v_soma else v_parc end,
            coalesce(p_primeiro, current_date) + (k - 1) * coalesce(p_intervalo, 30),
            coalesce(nullif(p_forma, ''), 'boleto'), n.unidade_id, 'vendas', k, p_parcelas, n.id);
    v_soma := v_soma + v_parc;
  end loop;
  return p_parcelas;
end $function$;
