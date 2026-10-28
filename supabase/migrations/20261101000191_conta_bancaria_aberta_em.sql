-- Data de abertura de cada conta bancária: mostra desde quando deve haver extrato (dossiê da empresa).
-- aberta_em_so_ano: só se sabe o ano (a data guarda 1º de janeiro e a tela mostra só o ano).
alter table public.contas_bancarias
  add column if not exists aberta_em date,
  add column if not exists aberta_em_so_ano boolean not null default false;
