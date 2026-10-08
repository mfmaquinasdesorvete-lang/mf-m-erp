-- =====================================================================
-- Focus NFe: entrada de estoque pelo XML das NF-e de fornecedores
-- =====================================================================

-- Itens lidos do XML da nota e controle de entrada no estoque
alter table public.nfe_recebidas
  add column itens jsonb,
  add column estoque_lancado boolean not null default false,
  add column estoque_lancado_em timestamptz;

-- "De-para": código do produto no fornecedor -> produto da MF Máquinas.
-- Fica salvo na primeira entrada; nas próximas notas o item já vem vinculado.
create table public.produto_fornecedor (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  codigo_fornecedor text not null,
  descricao_fornecedor text,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  -- quantas unidades nossas vêm em 1 unidade do fornecedor (ex.: caixa com 10 = 10)
  fator_conversao numeric(12,4) not null default 1 check (fator_conversao > 0),
  created_at timestamptz not null default now(),
  unique (fornecedor_id, codigo_fornecedor)
);

alter table public.produto_fornecedor enable row level security;
create policy "erp_select" on public.produto_fornecedor for select to authenticated using (public.is_erp_user());
create policy "erp_insert" on public.produto_fornecedor for insert to authenticated with check (public.is_erp_user());
create policy "erp_update" on public.produto_fornecedor for update to authenticated using (public.is_erp_user()) with check (public.is_erp_user());
create policy "erp_delete" on public.produto_fornecedor for delete to authenticated using (public.is_erp_admin());

-- Dá entrada no estoque dos itens de uma NF-e recebida.
-- p_itens: [{ codigo, descricao, produto_id, quantidade, valor_unitario, fator, atualizar_custo }]
--   quantidade/valor_unitario são os da nota (unidade do fornecedor);
--   itens com produto_id nulo são ignorados (ex.: material de consumo).
create or replace function public.lancar_estoque_nfe(p_nfe uuid, p_itens jsonb)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_nfe public.nfe_recebidas;
  v_item jsonb;
  v_fator numeric;
  v_qtd numeric;
  v_custo numeric;
  v_total int := 0;
begin
  if not public.is_erp_user() then raise exception 'acesso negado'; end if;

  select * into v_nfe from public.nfe_recebidas where id = p_nfe for update;
  if not found then raise exception 'nota não encontrada'; end if;
  if v_nfe.estoque_lancado then raise exception 'estoque desta nota já foi lançado'; end if;
  if v_nfe.situacao = 'cancelada' then raise exception 'nota cancelada'; end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    if nullif(v_item->>'produto_id', '') is null then continue; end if;

    v_fator := coalesce(nullif(v_item->>'fator', '')::numeric, 1);
    if v_fator <= 0 then raise exception 'fator de conversão inválido no item %', v_item->>'descricao'; end if;
    v_qtd := (v_item->>'quantidade')::numeric * v_fator;
    v_custo := round((v_item->>'valor_unitario')::numeric / v_fator, 2);

    insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id)
    values ((v_item->>'produto_id')::uuid, 'entrada', v_qtd,
            'NF ' || ltrim(substr(v_nfe.chave, 26, 9), '0') || ' - ' || coalesce(v_nfe.emitente_nome, ''),
            'nfe_recebida', p_nfe);

    if coalesce((v_item->>'atualizar_custo')::boolean, true) then
      update public.produtos set preco_custo = v_custo where id = (v_item->>'produto_id')::uuid;
    end if;

    if v_nfe.fornecedor_id is not null and nullif(v_item->>'codigo', '') is not null then
      insert into public.produto_fornecedor (fornecedor_id, codigo_fornecedor, descricao_fornecedor, produto_id, fator_conversao)
      values (v_nfe.fornecedor_id, v_item->>'codigo', v_item->>'descricao', (v_item->>'produto_id')::uuid, v_fator)
      on conflict (fornecedor_id, codigo_fornecedor) do update
        set produto_id = excluded.produto_id,
            fator_conversao = excluded.fator_conversao,
            descricao_fornecedor = excluded.descricao_fornecedor;
    end if;

    v_total := v_total + 1;
  end loop;

  if v_total = 0 then raise exception 'nenhum item vinculado a produto'; end if;

  update public.nfe_recebidas set estoque_lancado = true, estoque_lancado_em = now() where id = p_nfe;
  return v_total;
end $$;

revoke execute on function public.lancar_estoque_nfe(uuid, jsonb) from public, anon;
grant execute on function public.lancar_estoque_nfe(uuid, jsonb) to authenticated;
