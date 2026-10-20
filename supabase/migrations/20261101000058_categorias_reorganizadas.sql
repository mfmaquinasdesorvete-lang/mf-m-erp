-- Categorias de produtos reorganizadas (pedido de 19/10, aprovado em 20/10): Peças de Reposição com subcategorias,
-- Acessórios para Sorveteria, Serviços e Produção (uso interno). Os 55 produtos sem categoria ganham uma. As categorias
-- antigas são renomeadas (mantêm margem e id); as vazias são desativadas. Nenhum produto é apagado.
select set_config('erp.acao_usuario', 'on', true);

create temp table _cat_mapa (antigo text primary key, novo text not null, principal boolean not null default true);
insert into _cat_mapa values
  ('Peças Elétricas - My Frost',              'Peças de Reposição > Elétricas', true),
  ('Componentes máquina > Elétrica',          'Peças de Reposição > Elétricas', false),
  ('Inversores My Frost',                     'Peças de Reposição > Inversores', true),
  ('Peças Refrigeração - My Frost',           'Peças de Reposição > Refrigeração', true),
  ('Compressores - My Frost',                 'Peças de Reposição > Refrigeração > Compressores', true),
  ('Compressores - My Frost > Embraco',       'Peças de Reposição > Refrigeração > Compressores', false),
  ('Peças Mecânicas - My Frost',              'Peças de Reposição > Mecânicas', true),
  ('Vedações e O-rings - My Frost',           'Peças de Reposição > Vedações e O-rings', true),
  ('Chave Extratora - Portelo',               'Peças de Reposição > Chave Extratora', true),
  ('& Produtos Fabricação Própia',            'Peças de Reposição > Pás e Batedores', true),
  ('Batedor de Milk',                         'Acessórios para Sorveteria', true),
  ('As Estruturas das Máquinas',              'Produção > Estruturas das Máquinas', true),
  ('As Estruturas das Máquinas > Cilindros',  'Produção > Estruturas das Máquinas > Cilindros', true),
  ('As Estruturas das Máquinas > Carcaça',    'Produção > Estruturas das Máquinas > Carcaça', true),
  ('Consumíveis de Produção',                 'Produção > Consumíveis', true),
  ('Custos de Fabricação',                    'Produção > Custos de Fabricação', true),
  ('Cálculo Interno (não vende)',             'Produção > Cálculo Interno', true);

-- 1) a categoria antiga vira a nova (a principal de cada destino é renomeada e leva a margem; as outras ficam inativas)
update categorias_produto c set nome = m.novo
  from _cat_mapa m
 where c.nome = m.antigo and m.principal
   and not exists (select 1 from categorias_produto x where x.nome = m.novo);
update categorias_produto c set ativo = false from _cat_mapa m where c.nome = m.antigo;

-- 2) as que ainda não existem
insert into categorias_produto (nome, ativo)
select n, true from unnest(array[
  'Máquinas My Frost', 'Peças de Reposição', 'Acessórios para Sorveteria', 'Serviços', 'Produção',
  'Peças de Reposição > Refrigeração > Compressores']) n
 where not exists (select 1 from categorias_produto c where c.nome = n);
update categorias_produto set ativo = true where nome in (select novo from _cat_mapa)
   or nome in ('Máquinas My Frost', 'Peças de Reposição', 'Acessórios para Sorveteria', 'Serviços', 'Produção');

-- 3) produtos (ativos e arquivados) seguem a categoria nova
update produtos p set categoria = m.novo, motivo_alteracao = 'Categorias reorganizadas (pedido 19/10)'
  from _cat_mapa m where p.categoria = m.antigo;

-- 4) os sem categoria
update produtos set motivo_alteracao = 'Categorias reorganizadas (pedido 19/10)', categoria = case
    when tipo = 'servico' then 'Serviços'
    when descricao ~* '^compressor' then 'Peças de Reposição > Refrigeração > Compressores'
    when descricao ~* '^(conector industrial|h[ée]rcules motores|painel de comando|sensor de temperatura|terminal|inje[cç][aã]o de ar|bombinha de ar|bomba submersa)' then 'Peças de Reposição > Elétricas'
    when descricao ~* '^(rodinhas|p[ée] para m[aá]quinas|alavanca|conj\. bandeja|conex[aã]o|rfl06|tubo espiral|mangueira)' then 'Peças de Reposição > Mecânicas'
    when descricao ~* '^kit reparo' then 'Peças de Reposição > Vedações e O-rings'
    when descricao ~* '^tina inox' then 'Produção > Estruturas das Máquinas'
    when descricao ~* '^m[aá]quina para pasta' then 'Máquinas My Frost'
    when descricao ~* '^(copo|pote|colher|luvinhas|testeira|plaquinhas|cuba gn)' then 'Acessórios para Sorveteria'
  end
 where ativo and nullif(btrim(categoria), '') is null;

-- 5) os dois que estavam no lugar errado e o lubrificante solto em "Peças de Reposição"
update produtos set categoria = 'Peças de Reposição > Mecânicas', motivo_alteracao = 'Categorias reorganizadas (pedido 19/10)'
 where ativo and categoria = 'Peças de Reposição > Vedações e O-rings' and descricao ~* '^mangueira';
update produtos set categoria = 'Peças de Reposição > Vedações e O-rings', motivo_alteracao = 'Categorias reorganizadas (pedido 19/10)'
 where ativo and categoria = 'Peças de Reposição > Mecânicas' and descricao ~* '^retentor';
update produtos set categoria = 'Acessórios para Sorveteria', motivo_alteracao = 'Categorias reorganizadas (pedido 19/10)'
 where ativo and categoria = 'Peças de Reposição' and descricao ~* '^lubrificante';

-- 6) vazias saem da lista (continuam guardadas)
update categorias_produto c set ativo = false
 where c.ativo and c.nome not in ('Máquinas My Frost', 'Peças de Reposição', 'Acessórios para Sorveteria', 'Serviços', 'Produção')
   and c.nome not like 'Produção > %' and c.nome not like 'Peças de Reposição > %'
   and not exists (select 1 from produtos p where p.ativo and p.categoria = c.nome);
