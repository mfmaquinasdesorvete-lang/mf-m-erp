-- Vendas em lote (Venda de Peças e Venda de Máquinas): excluir pedidos e lançar contas a receber de vários pedidos.
--  * Excluir: só orçamento ou venda cancelada (venda aprovada, faturada ou entregue é cancelada antes: o cancelamento
--    devolve o estoque e cancela as contas). Pede motivo; o pedido fica cancelado, some das listas e fica na auditoria,
--    como a OC, a OP e a OS excluídas. Não exclui com NF-e autorizada, conta a receber paga nem comissão paga.
--  * Lançar contas: vendas aprovadas, faturadas ou entregues sem conta a receber (ex.: as que vieram do Tiny), pelo
--    valor da venda (não o da NF) e pelas parcelas da venda. Em aberto: entram na cobrança normal. Já recebidas:
--    entram pagas como histórico (sem aviso ao cliente, sem comissão e sem aprovação), na data escolhida ou no
--    vencimento de cada parcela.
-- Só acrescenta: colunas de exclusão em pedidos, regra que esconde o pedido excluído e duas funções novas.

alter table public.pedidos add column if not exists excluida_em timestamptz;
alter table public.pedidos add column if not exists excluida_por uuid;
alter table public.pedidos add column if not exists excluida_motivo text;
alter table public.pedidos add column if not exists excluida_status text;
comment on column public.pedidos.excluida_em is 'Pedido excluído (orçamento ou venda cancelada): some das listas e fica na auditoria.';

do $$ begin
  create policy nao_excluida on public.pedidos as restrictive for select to authenticated using (excluida_em is null);
exception when duplicate_object then null; end $$;

-- Excluir pedidos escolhidos na lista. Devolve quantos foram excluídos e os que ficaram, com o motivo.
create or replace function public.excluir_pedidos(p_ids uuid[], p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v record;
  v_ok int := 0;
  v_pulados jsonb := '[]'::jsonb;
  v_porque text;
begin
  perform public.exigir_papel('vendas', 'financeiro');
  if length(v_motivo) < 5 then raise exception 'escreva o motivo da exclusão (pelo menos 5 letras)'; end if;
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'escolha ao menos um pedido'; end if;
  if cardinality(p_ids) > 500 then raise exception 'no máximo 500 pedidos por vez'; end if;

  for v in select p.id, p.numero, p.status from public.pedidos p
            where p.id = any (p_ids) and p.excluida_em is null order by p.numero for update loop
    v_porque := case
      when v.status not in ('orcamento', 'cancelado') then 'venda ' || v.status || ': cancele a venda antes de excluir'
      when exists (select 1 from public.notas_fiscais n where n.pedido_id = v.id and n.excluida_em is null
                     and n.status not in ('erro', 'cancelada', 'denegada', 'inutilizada')) then 'tem NF-e autorizada ou em emissão: cancele a nota antes'
      when exists (select 1 from public.contas_receber r where r.pedido_id = v.id and r.status = 'pago') then 'tem conta a receber paga'
      when exists (select 1 from public.comissoes c where c.pedido_id = v.id and c.status = 'paga') then 'tem comissão paga'
    end;
    if v_porque is not null then
      v_pulados := v_pulados || jsonb_build_object('numero', v.numero, 'motivo', v_porque);
      continue;
    end if;
    update public.pedidos
       set excluida_em = now(), excluida_por = auth.uid(), excluida_motivo = v_motivo, excluida_status = status, status = 'cancelado'
     where id = v.id;
    v_ok := v_ok + 1;
  end loop;
  return jsonb_build_object('excluidos', v_ok, 'pulados', v_pulados);
end $$;

-- Lançar as contas a receber das vendas escolhidas que ainda não têm conta (valor e parcelas da venda).
--   p_recebidas false: em aberto, a partir de p_data (primeiro vencimento) ou do prazo da própria venda.
--   p_recebidas true: pagas (histórico), recebidas em p_data ou no vencimento de cada parcela (até hoje).
create or replace function public.lancar_contas_pedidos(p_ids uuid[], p_recebidas boolean, p_data date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.pedidos;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_n int; v_parc int; v_valor numeric(12,2); v_venc date; v_primeiro date;
  v_cont int; v_soma numeric;
  v_ok int := 0; v_contas int := 0; v_total numeric := 0;
  v_pulados jsonb := '[]'::jsonb;
begin
  perform public.exigir_papel('financeiro');
  if p_recebidas is null then raise exception 'escolha: contas em aberto ou já recebidas'; end if;
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'escolha ao menos um pedido'; end if;
  if cardinality(p_ids) > 500 then raise exception 'no máximo 500 pedidos por vez'; end if;
  if p_recebidas and p_data is not null and p_data > v_hoje then raise exception 'a data do recebimento não pode ser depois de hoje'; end if;

  for v in select * from public.pedidos p where p.id = any (p_ids) and p.excluida_em is null order by p.numero loop
    if v.status not in ('aprovado', 'faturado', 'entregue') then
      v_pulados := v_pulados || jsonb_build_object('numero', v.numero,
        'motivo', case v.status when 'orcamento' then 'orçamento: aprove a venda antes' else 'venda cancelada' end);
      continue;
    end if;
    if coalesce(v.valor_total, 0) <= 0 then
      v_pulados := v_pulados || jsonb_build_object('numero', v.numero, 'motivo', 'venda sem valor');
      continue;
    end if;
    if exists (select 1 from public.contas_receber r where r.pedido_id = v.id and r.status <> 'cancelado') then
      v_pulados := v_pulados || jsonb_build_object('numero', v.numero, 'motivo', 'já tem conta a receber');
      continue;
    end if;

    v_n := case when v.parcelas between 1 and 24 then v.parcelas else 1 end;
    v_primeiro := case when not p_recebidas and p_data is not null then p_data
                       else coalesce(v.primeiro_vencimento, (coalesce(v.aprovado_em, v.created_at) at time zone 'America/Sao_Paulo')::date) end;
    v_cont := 0; v_soma := 0;
    begin
      for v_parc in 1..v_n loop
        v_valor := round(v.valor_total / v_n, 2);
        if v_parc = v_n then v_valor := v.valor_total - round(v.valor_total / v_n, 2) * (v_n - 1); end if;
        v_venc := v_primeiro + (v_parc - 1) * coalesce(nullif(v.intervalo_dias, 0), 30);
        insert into public.contas_receber (descricao, cliente_id, pedido_id, parcela, total_parcelas, valor, vencimento, forma_pagamento,
                                          unidade_id, status, data_pagamento, valor_pago, id_externo)
        values ('Pedido #' || v.numero || ' - parcela ' || v_parc || '/' || v_n, v.cliente_id, v.id, v_parc, v_n, v_valor, v_venc,
                v.forma_pagamento, v.unidade_id,
                case when p_recebidas then 'pago' else 'aberto' end,
                case when p_recebidas then coalesce(p_data, least(v_venc, v_hoje)) end,
                case when p_recebidas then v_valor end,
                -- recebida: histórico (sem aprovação), como as contas importadas
                case when p_recebidas then 'pedido-lote:' || v.id || ':' || v_parc end);
        v_cont := v_cont + 1; v_soma := v_soma + v_valor;
      end loop;
      v_ok := v_ok + 1; v_contas := v_contas + v_cont; v_total := v_total + v_soma;
    exception when others then
      v_pulados := v_pulados || jsonb_build_object('numero', v.numero, 'motivo', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('pedidos', v_ok, 'contas', v_contas, 'total', v_total, 'pulados', v_pulados);
end $$;

revoke execute on function public.excluir_pedidos(uuid[], text) from public, anon;
revoke execute on function public.lancar_contas_pedidos(uuid[], boolean, date) from public, anon;
grant execute on function public.excluir_pedidos(uuid[], text) to authenticated;
grant execute on function public.lancar_contas_pedidos(uuid[], boolean, date) to authenticated;
