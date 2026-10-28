-- Ordem de compra andando sozinha até o estoque (pedido da usuária, 28/10, OCs #244, #247 e #248):
-- 1. A entrada automática da nota (entrada_automatica_nota) agora também dá a baixa nas OCs ligadas, como a entrada
--    pela tela já fazia: por produto, o que a nota trouxe até o que falta receber. Antes a OC ficava "A caminho" para
--    sempre e alguém tinha de apertar "Dar baixa pela nota". OC ligada que já foi recebida sem nota não entra sozinha:
--    a entrada pela tela desconta o que já entrou.
-- 2. Nota ligada a uma OC (sozinha ou à mão) que estava parada em "item sem produto vinculado" volta para a fila: o
--    processamento casa os itens com os da OC (nfe-itens-oc.ts).
-- 3. Aviso todo dia à tarde das compras que já deviam ter chegado e ainda não têm "Chegou" (a transportadora que não
--    está no rastreio não marca a entrega sozinha).

create or replace function public.entrada_automatica_nota(p_nfe uuid, p_itens jsonb, p_custos jsonb default '[]'::jsonb, p_opcoes jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_itens jsonb;
  v_n int;
  v_c jsonb := '{}'::jsonb;
  v_b int := 0;
  v_baixas jsonb := '[]'::jsonb;
  v_sem_nota bigint;
  v_resta numeric;
  v_q numeric;
  r record;
  it record;
begin
  if jsonb_typeof(coalesce(p_itens, '[]'::jsonb)) <> 'array' then raise exception 'lista de itens inválida'; end if;
  select pc.numero into v_sem_nota
    from public.nfe_oc_vinculos l join public.pedidos_compra pc on pc.id = l.pedido_compra_id
   where l.nfe_id = p_nfe and l.ativo and pc.recebido_sem_nota
   limit 1;
  if v_sem_nota is not null then
    raise exception 'a OC #% ligada a esta nota já foi recebida sem nota: dê a entrada pela nota (Itens e custos), que desconta o que já entrou', v_sem_nota;
  end if;
  -- o custo vai pela conta completa (p_custos), não pelo valor unitário da nota
  select coalesce(jsonb_agg(e || jsonb_build_object('atualizar_custo', false)), '[]'::jsonb) into v_itens
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e;
  v_n := public.lancar_estoque_nfe_core(p_nfe, v_itens);
  if jsonb_typeof(p_custos) = 'array' and jsonb_array_length(p_custos) > 0 then
    v_c := public.nf_custos_core(p_nfe, p_custos, coalesce(p_opcoes, '{}'::jsonb) || jsonb_build_object('modo_preco', 'nenhum'));
  end if;

  -- baixa nas OCs ligadas: por produto (em unidades do estoque), item a item da OC mais antiga para a mais nova
  for r in select e->>'produto_id' as produto_id,
                  sum(coalesce(nullif(e->>'quantidade', '')::numeric, 0) * coalesce(nullif(e->>'fator', '')::numeric, 1)) as qtd
             from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e
            where nullif(e->>'produto_id', '') is not null
            group by 1 loop
    v_resta := r.qtd;
    for it in select i.id, i.quantidade - i.quantidade_recebida as pendente
                from public.pedido_compra_itens i
                join public.pedidos_compra pc on pc.id = i.pedido_compra_id
                join public.nfe_oc_vinculos l on l.pedido_compra_id = pc.id and l.nfe_id = p_nfe and l.ativo and l.baixado_em is null
               where i.produto_id::text = r.produto_id and i.quantidade > i.quantidade_recebida
                 and pc.excluida_em is null and pc.status in ('enviado', 'parcial')
                 and not exists (select 1 from public.nfe_oc_baixas b where b.nfe_id = p_nfe and b.pedido_compra_item_id = i.id)
               order by pc.numero, i.id loop
      exit when v_resta <= 0.0005;
      v_q := round(least(v_resta, it.pendente), 3);
      continue when v_q <= 0;
      v_baixas := v_baixas || jsonb_build_array(jsonb_build_object('item_id', it.id, 'quantidade', v_q));
      v_resta := v_resta - v_q;
    end loop;
  end loop;
  if jsonb_array_length(v_baixas) > 0 then
    v_b := public.nf_baixa_oc_core(p_nfe, v_baixas);
  end if;
  return jsonb_build_object('itens', v_n, 'custos', coalesce((v_c->>'custos')::int, 0), 'baixas', v_b);
end $$;
revoke execute on function public.entrada_automatica_nota(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;

-- nota ligada a uma OC: se estava esperando o vínculo dos itens, volta para a fila do processamento automático
create or replace function public.trg_oc_ligada_reprocessa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ativo and (tg_op = 'INSERT' or not old.ativo) then
    update public.nfe_recebidas set processamento = 'pendente', tentativas = 0
     where id = new.nfe_id and processamento = 'aguardando_vinculo' and not estoque_lancado and excluida_em is null;
  end if;
  return null;
end $$;

create trigger trg_oc_ligada_reprocessa after insert or update of ativo on public.nfe_oc_vinculos
for each row execute function public.trg_oc_ligada_reprocessa();

-- compras a caminho que já deviam ter chegado: previsão do CT-e, senão a da OC, senão 7 dias depois da nota
create or replace function public.avisar_compras_para_chegar()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int; v_lista text;
begin
  with a_caminho as (
    select coalesce(f.nome, n.emitente_nome, 'fornecedor') as nome,
           (select string_agg('OC #' || pc.numero, ', ' order by pc.numero)
              from public.nfe_oc_vinculos l join public.pedidos_compra pc on pc.id = l.pedido_compra_id
             where l.nfe_id = n.id and l.ativo) as ocs,
           coalesce((select max(c.prev_entrega)::date from public.ctes c
                      where c.nfe_recebida_id = n.id or n.chave = any(coalesce(c.nfe_chaves, '{}'))),
                    (select max(pc.previsao_entrega) from public.nfe_oc_vinculos l join public.pedidos_compra pc on pc.id = l.pedido_compra_id
                      where l.nfe_id = n.id and l.ativo),
                    (n.data_emissao at time zone 'America/Sao_Paulo')::date + 7) as previsto
      from public.nfe_recebidas n
      left join public.fornecedores f on f.id = n.fornecedor_id
     where n.processamento = 'a_caminho' and n.chegou_em is null and not n.estoque_lancado and n.excluida_em is null
       and n.data_emissao >= now() - interval '90 days')
  select count(*), string_agg(nome || coalesce(' (' || ocs || ')', ''), '; ' order by previsto, nome)
    into v_n, v_lista
    from a_caminho
   where previsto <= (now() at time zone 'America/Sao_Paulo')::date;
  if v_n > 0 then
    perform public.notificar('outro',
      'Chegou? ' || v_n || case when v_n = 1 then ' compra já devia ter chegado' else ' compras já deviam ter chegado' end,
      left(v_lista, 400) || '. Se chegou, abra a OC em Compras e aperte "Chegou": o estoque entra e a OC é baixada.',
      '/compras', '{financeiro,compras}', null);
  end if;
  return v_n;
end $$;
revoke execute on function public.avisar_compras_para_chegar() from public, anon, authenticated;

select cron.schedule('erp-compras-para-chegar', '43 19 * * 1-5', $$ select public.avisar_compras_para_chegar() $$);
