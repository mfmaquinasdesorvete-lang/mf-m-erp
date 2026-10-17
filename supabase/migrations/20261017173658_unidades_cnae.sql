-- CNAE de cada unidade (Configurações → Unidades), junto do CNPJ, da IE e do endereço: a atividade principal e as
-- secundárias como no cartão CNPJ. A tela busca na Receita pelo CNPJ e a pessoa confere antes de salvar.
alter table public.unidades
  add column if not exists cnae_principal text,
  add column if not exists cnae_principal_descricao text,
  add column if not exists cnaes_secundarios jsonb not null default '[]'::jsonb;
comment on column public.unidades.cnae_principal is 'CNAE principal com a máscara da Receita (ex.: 2829-1/99)';
comment on column public.unidades.cnaes_secundarios is 'Atividades secundárias [{codigo, descricao}], como no cartão CNPJ';
