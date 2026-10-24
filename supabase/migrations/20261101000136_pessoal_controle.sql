-- Painel pessoal: valores só para controle, que a dona não vai cobrar (ex.: dinheiro emprestado a alguém da família).
-- Não entram nas entradas e saídas nem no saldo; aparecem num cartão, somados por pessoa. Nada se apaga: o item
-- quitado ou perdoado fica "encerrado".
create table if not exists public.pessoal_controle (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users(id),
  pessoa text not null check (length(btrim(pessoa)) between 2 and 120),
  descricao text not null check (length(btrim(descricao)) between 2 and 300),
  valor numeric(14, 2) not null check (valor > 0),
  data date,
  origem text check (origem is null or length(origem) <= 200),
  encerrado boolean not null default false,
  criado_em timestamptz not null default now()
);
alter table public.pessoal_controle enable row level security;
revoke all on public.pessoal_controle from anon, public;
grant select, insert, update on public.pessoal_controle to authenticated;
create policy pessoal_controle_ler on public.pessoal_controle for select to authenticated using (dono = auth.uid());
create policy pessoal_controle_criar on public.pessoal_controle for insert to authenticated with check (dono = auth.uid());
create policy pessoal_controle_mudar on public.pessoal_controle for update to authenticated using (dono = auth.uid()) with check (dono = auth.uid());
