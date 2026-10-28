-- Data de abertura de cada unidade (CNPJ): o Dossiê da empresa mostra o histórico a partir dela.
alter table public.unidades add column if not exists aberta_em date;
comment on column public.unidades.aberta_em is 'Data de abertura do estabelecimento (cartão CNPJ); início do Dossiê da empresa.';
