set lock_timeout = '8s';
-- My Frost Sorveterias: a ficha completa de cada unidade (endereço, modelo, contato e contrato)
alter table public.licenciados_lojas
  add column if not exists modelo text check (modelo is null or modelo in ('quiosque', 'loja', 'loja_cafeteria')),
  add column if not exists endereco text check (endereco is null or length(endereco) <= 300),
  add column if not exists cep text check (cep is null or cep ~ '^[0-9]{8}$'),
  add column if not exists email text check (email is null or length(email) <= 120),
  add column if not exists email_institucional text check (email_institucional is null or length(email_institucional) <= 120),
  add column if not exists contrato text not null default 'sem' check (contrato in ('sem', 'negociando', 'assinado', 'rescindido')),
  add column if not exists contrato_assinado_em date,
  add column if not exists contrato_vence_em date,
  add column if not exists contrato_obs text check (contrato_obs is null or length(contrato_obs) <= 1000);
comment on column public.licenciados_lojas.inicio is 'Data de abertura da unidade (início da licença)';
comment on column public.licenciados_lojas.modelo is 'quiosque, loja ou loja com cafeteria';
