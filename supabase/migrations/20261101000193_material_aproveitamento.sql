-- Material comprado inteiro (barra, tubo, chapa) e cortado em peças: as medidas do inteiro ficam no cadastro do
-- material e o jeito de medir cada peça (mm, tamanho na chapa, peças por chapa) fica na linha da receita.
alter table public.produtos
  add column if not exists material_formato text check (material_formato in ('barra', 'tubo', 'chapa')),
  add column if not exists material_comprimento_mm numeric check (material_comprimento_mm > 0),
  add column if not exists material_largura_mm numeric check (material_largura_mm > 0),
  add column if not exists material_espessura_mm numeric check (material_espessura_mm > 0);
comment on column public.produtos.material_formato is 'Material cortado em peças: barra, tubo ou chapa (vazio = não é)';
comment on column public.produtos.material_comprimento_mm is 'Comprimento da barra, do tubo ou da chapa inteira (mm)';
comment on column public.produtos.material_largura_mm is 'Largura da chapa inteira (mm)';
comment on column public.produtos.material_espessura_mm is 'Espessura da chapa ou diâmetro da barra (mm); usado quando é comprado por kg';
alter table public.produto_componentes add column if not exists uso jsonb;
comment on column public.produto_componentes.uso is 'Como a peça usa o material: {modo:comprimento,mm} | {modo:peca,comprimento,largura} | {modo:pecas,n}';
