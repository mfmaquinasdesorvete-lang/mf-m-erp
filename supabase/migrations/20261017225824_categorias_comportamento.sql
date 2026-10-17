-- Plano de contas: cada categoria de despesa pode ser marcada como fixa ou variável (margem de contribuição e ponto
-- de equilíbrio no DRE). Vazio = o ERP sugere pelo grupo e pelo nome (impostos, custos, comissões e fretes: variável).
set lock_timeout = '8s';
alter table public.categorias_financeiras add column if not exists comportamento text;
alter table public.categorias_financeiras add constraint categorias_financeiras_comportamento_check check (comportamento in ('fixa', 'variavel'));
comment on column public.categorias_financeiras.comportamento is 'fixa ou variavel (margem de contribuição e ponto de equilíbrio); vazio = sugestão do ERP';
