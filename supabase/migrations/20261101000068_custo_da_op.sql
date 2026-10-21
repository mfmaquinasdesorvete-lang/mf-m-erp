-- Quanto custou montar cada unidade: ao concluir a OP, o ERP guarda o custo de cada peça consumida (pela ficha
-- técnica, todos os níveis, kit pelas peças dele) com o custo do dia. A OP fica com o custo total e o de cada unidade,
-- que não muda depois se o preço das peças mudar.
alter table public.ordens_producao
  add column if not exists custo_total numeric(14,2),
  add column if not exists custo_unitario numeric(14,2);

create table if not exists public.op_custos (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid not null references public.ordens_producao(id) on delete cascade,
  componente_id uuid references public.produtos(id) on delete set null,
  descricao text not null,
  quantidade numeric not null,
  custo_unitario numeric(14,4) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists op_custos_ordem_idx on public.op_custos (ordem_id);

alter table public.op_custos enable row level security;
do $$ begin
  create policy op_custos_select on public.op_custos for select to authenticated using (public.tem_papel('financeiro', 'tecnico'));
exception when duplicate_object then null; end $$;
-- só a conclusão da OP grava (função security definer); ninguém edita à mão
revoke insert, update, delete on public.op_custos from anon, authenticated;

create or replace function public.concluir_producao(p_ordem uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_op public.ordens_producao;
  v_c record;
  v_faltas text;
  v_total numeric;
begin
  perform public.exigir_papel('tecnico', 'financeiro');
  select * into v_op from public.ordens_producao where id = p_ordem for update;
  if not found then raise exception 'ordem de produção não encontrada'; end if;
  if v_op.status in ('concluida', 'cancelada') then raise exception 'ordem já finalizada'; end if;
  if not exists (select 1 from public.produto_componentes where produto_id = v_op.produto_id) then
    raise exception 'cadastre a ficha técnica antes de concluir a produção';
  end if;

  select string_agg(p.descricao || ' (falta ' || trim_scale(c.quantidade - public.estoque_na_unidade(p.id, v_op.unidade_id)) || ')', ', ')
    into v_faltas
    from public.estrutura_consumo(v_op.produto_id, v_op.quantidade) c join public.produtos p on p.id = c.componente_id
   where p.tipo <> 'servico' and public.estoque_na_unidade(p.id, v_op.unidade_id) < c.quantidade;
  if v_faltas is not null then raise exception 'peças insuficientes no estoque desta unidade: %', v_faltas; end if;

  -- custo do dia de cada peça consumida, guardado antes da baixa
  insert into public.op_custos (ordem_id, componente_id, descricao, quantidade, custo_unitario)
  select p_ordem, c.componente_id, p.descricao, c.quantidade, coalesce(p.preco_custo, 0)
    from public.estrutura_consumo(v_op.produto_id, v_op.quantidade) c join public.produtos p on p.id = c.componente_id;
  select coalesce(sum(quantidade * custo_unitario), 0) into v_total from public.op_custos where ordem_id = p_ordem;

  for v_c in select * from public.estrutura_consumo(v_op.produto_id, v_op.quantidade) loop
    insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, unidade_id)
    values (v_c.componente_id, 'saida', v_c.quantidade, 'Produção OP #' || v_op.numero, 'producao', p_ordem, v_op.unidade_id);
  end loop;
  insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie, unidade_id)
  values (v_op.produto_id, 'entrada', v_op.quantidade, 'Produção OP #' || v_op.numero, 'producao', p_ordem, v_op.numeros_serie, v_op.unidade_id);

  update public.produtos set preco_custo = public.custo_estrutura(v_op.produto_id) where id = v_op.produto_id;
  update public.ordens_producao
     set status = 'concluida', concluida_em = now(),
         custo_total = round(v_total, 2), custo_unitario = round(v_total / nullif(v_op.quantidade, 0), 2)
   where id = p_ordem;
end $function$;
revoke execute on function public.concluir_producao(uuid) from public, anon;
