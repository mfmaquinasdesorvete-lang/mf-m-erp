-- =====================================================================
-- Devolução de produtos direto do pedido (venda sem NF-e do ERP)
--   * parcial: escolhe item e quantidade (não passa do que foi vendido
--     menos o que já voltou)
--   * o estoque volta (kit: volta pelos componentes, como saiu)
--   * fica registrada no pedido e nas ocorrências
-- Venda com NF-e autorizada usa a NF de devolução (nfe-emitir), que já
-- devolve o estoque sozinha.
-- =====================================================================
create table if not exists public.pedido_devolucoes (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  itens jsonb not null,
  valor numeric(12,2) not null default 0,
  motivo text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
comment on table public.pedido_devolucoes is 'Devoluções de produtos de um pedido sem NF-e (o estoque volta); itens = [{item_id, produto_id, descricao, quantidade, valor_unitario}]';
create index if not exists pedido_devolucoes_pedido_idx on public.pedido_devolucoes (pedido_id, created_at desc);

alter table public.pedido_devolucoes enable row level security;
revoke all on public.pedido_devolucoes from anon;
grant select on public.pedido_devolucoes to authenticated;
create policy pedido_devolucoes_ler on public.pedido_devolucoes for select to authenticated
  using (public.tem_papel('vendas', 'financeiro', 'expedicao', 'contador'));

create or replace function public.devolver_itens_pedido(p_pedido uuid, p_itens jsonb, p_motivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ped pedidos;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_req jsonb;
  v_item record;
  v_comp record;
  v_q numeric;
  v_ja numeric;
  v_itens jsonb := '[]'::jsonb;
  v_valor numeric := 0;
  v_texto text := '';
  v_id uuid;
begin
  perform public.exigir_papel('vendas');
  if length(v_motivo) < 5 then raise exception 'informe o motivo da devolução (mínimo 5 letras)'; end if;
  select * into v_ped from pedidos where id = p_pedido for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if v_ped.status not in ('aprovado', 'faturado', 'entregue') then
    raise exception 'só pedidos aprovados, faturados ou entregues têm devolução';
  end if;
  if exists (select 1 from notas_fiscais where pedido_id = p_pedido and coalesce(ambiente, 'producao') <> 'homologacao'
               and status in ('autorizada', 'processando', 'contingencia')) then
    raise exception 'o pedido tem NF-e: use a NF de devolução (ela devolve o estoque sozinha)';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'escolha ao menos um item'; end if;

  perform set_config('erp.acao_usuario', 'on', true);
  for v_req in select * from jsonb_array_elements(p_itens) loop
    v_q := coalesce(nullif(v_req->>'quantidade', '')::numeric, 0);
    if v_q <= 0 then continue; end if;
    select i.*, p.kit into v_item from pedido_itens i left join produtos p on p.id = i.produto_id
     where i.id = (v_req->>'item_id')::uuid and i.pedido_id = p_pedido;
    if not found then raise exception 'item não pertence ao pedido'; end if;
    select coalesce(sum((x->>'quantidade')::numeric), 0) into v_ja
      from pedido_devolucoes d cross join lateral jsonb_array_elements(d.itens) x
     where d.pedido_id = p_pedido and x->>'item_id' = v_item.id::text;
    if v_q > v_item.quantidade - v_ja + 1e-9 then
      raise exception '%: só dá para devolver % (vendido %, já devolvido %)', v_item.descricao,
        trim_scale(v_item.quantidade - v_ja), trim_scale(v_item.quantidade), trim_scale(v_ja);
    end if;

    if v_ped.estoque_baixado and v_item.produto_id is not null then
      if coalesce(v_item.kit, false) then
        for v_comp in select * from kit_composicao(v_item.produto_id, v_item.kit_escolha) loop
          insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id)
          values (v_comp.componente_id, 'entrada', v_comp.quantidade * v_q,
                  'Devolução do pedido #' || v_ped.numero || ' (kit ' || v_item.descricao || '): ' || v_motivo, 'pedido', p_pedido);
        end loop;
      else
        insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie)
        values (v_item.produto_id, 'entrada', v_q, 'Devolução do pedido #' || v_ped.numero || ': ' || v_motivo, 'pedido', p_pedido, v_item.numero_serie);
      end if;
    end if;

    v_itens := v_itens || jsonb_build_object('item_id', v_item.id, 'produto_id', v_item.produto_id, 'descricao', v_item.descricao,
                                             'quantidade', v_q, 'valor_unitario', v_item.valor_unitario);
    v_valor := v_valor + v_q * v_item.valor_unitario;
    v_texto := v_texto || case when v_texto = '' then '' else ', ' end || trim_scale(v_q) || ' × ' || v_item.descricao;
  end loop;
  if jsonb_array_length(v_itens) = 0 then raise exception 'escolha ao menos um item com quantidade'; end if;

  insert into pedido_devolucoes (pedido_id, itens, valor, motivo) values (p_pedido, v_itens, round(v_valor, 2), v_motivo)
  returning id into v_id;
  insert into pedido_ocorrencias (pedido_id, texto)
  values (p_pedido, left('Devolução sem NF: ' || v_texto || ' (R$ ' || replace(round(v_valor, 2)::text, '.', ',') || '). Motivo: ' || v_motivo, 2000));
  return v_id;
end $$;
revoke execute on function public.devolver_itens_pedido(uuid, jsonb, text) from public, anon;
grant execute on function public.devolver_itens_pedido(uuid, jsonb, text) to authenticated;
