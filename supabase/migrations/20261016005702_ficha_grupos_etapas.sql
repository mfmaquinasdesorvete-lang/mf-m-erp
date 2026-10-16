-- Ficha técnica por grupo e etapas de produção. Somente acréscimos.
--  * produto_componentes.grupo: em que parte da máquina a peça entra (estrutura, refrigeração, elétrica, mecânica,
--    cilindro e pás, acabamento, outros); vazio = o ERP sugere pelo nome e pela categoria da peça;
--  * produtos.origem_producao: como o item chega: comprado pronto, fabricado aqui ou fabricado com etapa em terceiro
--    (ex.: pá — o eixo é preparado aqui, vai para a injeção e volta para o acabamento);
--  * produtos.etapas: etapas com o detalhe [{nome, externa, quem, dias}]; etapas_producao (só os nomes) continua sendo
--    a lista de conferência de cada OP.
alter table public.produto_componentes add column if not exists grupo text;
alter table public.produtos add column if not exists origem_producao text;
alter table public.produtos add column if not exists etapas jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'produto_componentes_grupo_valido') then
    alter table public.produto_componentes add constraint produto_componentes_grupo_valido
      check (grupo is null or grupo in ('estrutura', 'refrigeracao', 'eletrica', 'mecanica', 'cilindro', 'acabamento', 'outros'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'produtos_origem_producao_valida') then
    alter table public.produtos add constraint produtos_origem_producao_valida
      check (origem_producao is null or origem_producao in ('comprado', 'fabricado', 'terceirizado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'produtos_etapas_valida') then
    alter table public.produtos add constraint produtos_etapas_valida
      check (etapas is null or (jsonb_typeof(etapas) = 'array' and jsonb_array_length(etapas) <= 40));
  end if;
end $$;

comment on column public.produto_componentes.grupo is 'Parte da máquina: estrutura, refrigeracao, eletrica, mecanica, cilindro, acabamento ou outros (vazio = sugerido pelo ERP)';
comment on column public.produtos.origem_producao is 'Como o item chega: comprado (pronto), fabricado (aqui) ou terceirizado (fabricado com etapa em terceiro)';
comment on column public.produtos.etapas is 'Etapas de produção com detalhe: [{nome, externa, quem, dias}]; etapas_producao guarda só os nomes para a OP';
