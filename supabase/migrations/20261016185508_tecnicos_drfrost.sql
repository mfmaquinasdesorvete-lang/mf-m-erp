-- =====================================================================
-- Técnicos parceiros do site Dr. Frost (técnicos convidados, com anúncio no site de cadastro de técnicos).
-- Os outros técnicos do ERP são contatos (já atenderam alguma vez ou foram achados na internet).
--  * drfrost: parceiro convidado do site; drfrost_id/drfrost_url/drfrost_desde/drfrost_status: o anúncio.
--  * Cadastro completo do anúncio: nome no site, endereço e coordenadas, Instagram, Facebook, site, YouTube,
--    serviços (máquinas que atende), diferenciais (deslocamento, técnico autorizado…), área de atuação,
--    apresentação, verificado e destaque.
-- Somente acréscimos: colunas novas com padrão e um índice único parcial.
-- =====================================================================
alter table public.tecnicos
  add column if not exists drfrost boolean not null default false,
  add column if not exists drfrost_id text,
  add column if not exists drfrost_url text,
  add column if not exists drfrost_desde date,
  add column if not exists drfrost_status text,
  add column if not exists nome_fantasia text,
  add column if not exists verificado boolean not null default false,
  add column if not exists destaque boolean not null default false,
  add column if not exists instagram text,
  add column if not exists facebook text,
  add column if not exists site text,
  add column if not exists youtube text,
  add column if not exists endereco text,
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6),
  add column if not exists servicos text[] not null default '{}',
  add column if not exists diferenciais text[] not null default '{}',
  add column if not exists area_atuacao text,
  add column if not exists apresentacao text;

comment on column public.tecnicos.drfrost is 'Parceiro convidado do site Dr. Frost (os demais são contatos: já atenderam ou vieram da internet).';
comment on column public.tecnicos.drfrost_id is 'Número do anúncio no site Dr. Frost.';

create unique index if not exists tecnicos_drfrost_id on public.tecnicos (drfrost_id) where drfrost_id is not null;
create index if not exists tecnicos_drfrost on public.tecnicos (drfrost) where drfrost;
