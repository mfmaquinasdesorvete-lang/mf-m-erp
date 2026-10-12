-- Estrutura de produto em vários níveis (ficha técnica multinível).
--  * um item da ficha que tem a própria ficha é um subconjunto (ex.: painel elétrico, cilindro montado);
--  * subconjunto "montado junto" (padrão): a OP da máquina usa as peças dele, em todos os níveis;
--    subconjunto "com estoque próprio" (produtos.subconjunto_estocado): tem OP própria e a máquina consome o
--    subconjunto pronto do estoque (o que falta vira sugestão de OP, não de compra);
--  * estrutura_consumo(): o que uma OP consome de fato (explode a árvore até as peças compradas e os
--    subconjuntos com estoque próprio); usada na necessidade de peças, na conclusão da OP e no custo;
--  * custo_estrutura(): custo da máquina somando as peças de todos os níveis;
--  * a ficha não aceita ciclo (A usa B que usa A).

alter table public.produtos add column if not exists subconjunto_estocado boolean not null default false;

-- O que a produção de p_qtd unidades consome (peças compradas e subconjuntos com estoque próprio)
create or replace function public.estrutura_consumo(p_produto uuid, p_qtd numeric)
returns table (componente_id uuid, quantidade numeric) language sql stable set search_path = public as $$
  with recursive arvore(componente_id, qtd, nivel, caminho) as (
    select c.componente_id, c.quantidade * p_qtd, 1, array[p_produto, c.componente_id]
      from produto_componentes c where c.produto_id = p_produto
    union all
    select c.componente_id, a.qtd * c.quantidade, a.nivel + 1, a.caminho || c.componente_id
      from arvore a
      join produtos sp on sp.id = a.componente_id and not sp.subconjunto_estocado
      join produto_componentes c on c.produto_id = a.componente_id
     where a.nivel < 15 and not c.componente_id = any(a.caminho)
  )
  select a.componente_id, sum(a.qtd)::numeric
    from arvore a join produtos p on p.id = a.componente_id
   where p.subconjunto_estocado or not exists (select 1 from produto_componentes x where x.produto_id = a.componente_id)
   group by a.componente_id
$$;

-- Custo de uma unidade somando as peças de todos os níveis (subconjunto entra pelo custo das peças dele)
create or replace function public.custo_estrutura(p_produto uuid)
returns numeric language sql stable set search_path = public as $$
  with recursive arvore(componente_id, qtd, nivel, caminho) as (
    select c.componente_id, c.quantidade::numeric, 1, array[p_produto, c.componente_id]
      from produto_componentes c where c.produto_id = p_produto
    union all
    select c.componente_id, a.qtd * c.quantidade, a.nivel + 1, a.caminho || c.componente_id
      from arvore a join produto_componentes c on c.produto_id = a.componente_id
     where a.nivel < 15 and not c.componente_id = any(a.caminho)
  )
  select coalesce(sum(a.qtd * coalesce(p.preco_custo, 0)), 0)
    from arvore a join produtos p on p.id = a.componente_id
   where not exists (select 1 from produto_componentes x where x.produto_id = a.componente_id)
$$;

-- A ficha não pode dar volta (A usa B que usa A)
create or replace function public.trg_produto_componentes_ciclo()
returns trigger language plpgsql set search_path = public as $$
declare v_nome text;
begin
  if new.componente_id = new.produto_id then raise exception 'um item não pode fazer parte da própria ficha técnica'; end if;
  if exists (
    with recursive abaixo(id, nivel) as (
      select c.componente_id, 1 from produto_componentes c where c.produto_id = new.componente_id
      union
      select c.componente_id, a.nivel + 1 from abaixo a join produto_componentes c on c.produto_id = a.id where a.nivel < 20
    ) select 1 from abaixo where id = new.produto_id) then
    select descricao into v_nome from produtos where id = new.componente_id;
    raise exception 'a ficha daria volta: % já usa este item (direta ou indiretamente)', coalesce(v_nome, 'o componente');
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_produto_componentes_ciclo' and tgrelid = 'public.produto_componentes'::regclass) then
    create trigger trg_produto_componentes_ciclo before insert or update of produto_id, componente_id on public.produto_componentes
      for each row execute function public.trg_produto_componentes_ciclo();
  end if;
end $$;

-- Necessidade de peças de cada OP em todos os níveis: o que a estrutura consome x estoque da unidade
-- (descontando o que outras OPs em aberto já reservaram e somando o que está a caminho: compras e OPs de subconjunto).
create or replace view public.necessidade_producao
with (security_invoker = true) as
select
  op.id as ordem_id,
  c.componente_id,
  p.descricao,
  p.unidade,
  p.fornecedor_padrao_id,
  p.preco_custo,
  c.quantidade as necessario,
  public.estoque_na_unidade(c.componente_id, op.unidade_id)::numeric(12,3) as estoque_atual,
  coalesce((
    select sum(c2.quantidade)
      from public.ordens_producao op2
      cross join lateral public.estrutura_consumo(op2.produto_id, op2.quantidade) c2
     where c2.componente_id = c.componente_id and op2.status in ('planejada', 'em_producao')
       and op2.id <> op.id and op2.created_at < op.created_at and op2.unidade_id = op.unidade_id
  ), 0) as reservado_outras_op,
  coalesce((
    select sum(i.quantidade - i.quantidade_recebida)
      from public.pedido_compra_itens i
      join public.pedidos_compra pc on pc.id = i.pedido_compra_id
     where i.produto_id = c.componente_id and pc.status in ('cotacao', 'enviado', 'parcial') and pc.unidade_id = op.unidade_id
  ), 0) + coalesce((
    select sum(op3.quantidade)
      from public.ordens_producao op3
     where op3.produto_id = c.componente_id and op3.status in ('planejada', 'em_producao') and op3.unidade_id = op.unidade_id
  ), 0) as a_caminho,
  (p.subconjunto_estocado and exists (select 1 from public.produto_componentes x where x.produto_id = c.componente_id)) as subconjunto
from public.ordens_producao op
cross join lateral public.estrutura_consumo(op.produto_id, op.quantidade) c
join public.produtos p on p.id = c.componente_id;

-- Conclui a OP: confere e baixa o que a estrutura consome (todos os níveis) e dá entrada no que foi montado.
create or replace function public.concluir_producao(p_ordem uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_op public.ordens_producao;
  v_c record;
  v_faltas text;
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
   where public.estoque_na_unidade(p.id, v_op.unidade_id) < c.quantidade;
  if v_faltas is not null then raise exception 'peças insuficientes no estoque desta unidade: %', v_faltas; end if;

  for v_c in select * from public.estrutura_consumo(v_op.produto_id, v_op.quantidade) loop
    insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, unidade_id)
    values (v_c.componente_id, 'saida', v_c.quantidade, 'Produção OP #' || v_op.numero, 'producao', p_ordem, v_op.unidade_id);
  end loop;
  insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie, unidade_id)
  values (v_op.produto_id, 'entrada', v_op.quantidade, 'Produção OP #' || v_op.numero, 'producao', p_ordem, v_op.numeros_serie, v_op.unidade_id);

  update public.produtos set preco_custo = public.custo_estrutura(v_op.produto_id) where id = v_op.produto_id;
  update public.ordens_producao set status = 'concluida', concluida_em = now() where id = p_ordem;
end $$;
