-- Rodízios na ficha técnica (pedido de 19/10): as máquinas de chão levam 2 rodízios com freio (CP-EST-017) e
-- 2 sem freio (CP-EST-018): P 765, Top 200, Top 300, Prime e Queen. As de bancada (SB, Slim, A 100, A 200) não levam.
-- A retirada dos rodízios da ficha da SB é feita pela tela (Máquinas → SB → Ficha técnica).
select set_config('erp.acao_usuario', 'on', true);

update produto_componentes pc set quantidade = 2
  from produtos m, produtos c
 where m.id = pc.produto_id and c.id = pc.componente_id
   and m.sku in ('MQ-P765', 'MQ-TOP200', 'MQ-TOP300', 'MQ-PRIME', 'MQ-QUEEN')
   and c.sku in ('CP-EST-017', 'CP-EST-018');

insert into produto_componentes (produto_id, componente_id, quantidade, grupo, ordem)
select m.id, c.id, 2, s.grupo, s.ordem
  from produtos m
  join produtos c on c.sku = 'CP-EST-017'
  join produtos sf on sf.sku = 'CP-EST-018'
  join produto_componentes s on s.produto_id = m.id and s.componente_id = sf.id
 where m.sku in ('MQ-P765', 'MQ-TOP200', 'MQ-TOP300', 'MQ-PRIME', 'MQ-QUEEN')
   and not exists (select 1 from produto_componentes x where x.produto_id = m.id and x.componente_id = c.id);
