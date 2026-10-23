-- Necessidade das OPs:
-- 1) serviço da ficha (mão de obra, rateio, carga de gás) não é peça: não tem estoque e travava o "Concluir produção"
--    (a conclusão no banco já ignora serviço) e virava OC de "Mão de obra";
-- 2) só as OPs abertas (planejada / em produção): antes calculava a estrutura de todas as OPs, até as concluídas e
--    canceladas, e a tela ficava mais lenta a cada OP nova.
create or replace view public.necessidade_producao with (security_invoker = true) as
select op.id as ordem_id,
  c.componente_id,
  p.descricao,
  p.unidade,
  p.fornecedor_padrao_id,
  p.preco_custo,
  c.quantidade as necessario,
  estoque_na_unidade(c.componente_id, op.unidade_id)::numeric(12,3) as estoque_atual,
  coalesce((select sum(c2.quantidade)
      from ordens_producao op2
        cross join lateral estrutura_consumo(op2.produto_id, op2.quantidade) c2(componente_id, quantidade)
      where c2.componente_id = c.componente_id and op2.status = any (array['planejada', 'em_producao'])
        and op2.id <> op.id and op2.created_at < op.created_at and op2.unidade_id = op.unidade_id), 0::numeric) as reservado_outras_op,
  coalesce((select sum(i.quantidade - i.quantidade_recebida)
      from pedido_compra_itens i join pedidos_compra pc on pc.id = i.pedido_compra_id
      where i.produto_id = c.componente_id and pc.status = any (array['cotacao', 'enviado', 'parcial']) and pc.unidade_id = op.unidade_id), 0::numeric)
  + coalesce((select sum(op3.quantidade) from ordens_producao op3
      where op3.produto_id = c.componente_id and op3.status = any (array['planejada', 'em_producao']) and op3.unidade_id = op.unidade_id), 0::numeric) as a_caminho,
  p.subconjunto_estocado and (exists (select 1 from produto_componentes x where x.produto_id = c.componente_id)) as subconjunto
from ordens_producao op
  cross join lateral estrutura_consumo(op.produto_id, op.quantidade) c(componente_id, quantidade)
  join produtos p on p.id = c.componente_id
where op.status = any (array['planejada', 'em_producao'])
  and coalesce(p.tipo, '') <> 'servico';
