-- Painel pessoal: contas pessoais do dono (banco, cartão, investimento), separadas da empresa.
-- Cada linha é de quem a criou (dono = auth.uid()) e só essa pessoa lê e grava: o contador, os outros usuários e as
-- telas da empresa (DRE, conciliação, painéis, pacote do contador) não enxergam nada. Sem auditoria geral de propósito
-- (o histórico da auditoria é lido por outros papéis). Nada é apagado: lançamento errado fica anulado.

create table if not exists public.pessoal_contas (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users(id),
  nome text not null check (length(btrim(nome)) between 2 and 60),
  tipo text not null default 'corrente' check (tipo in ('corrente', 'poupanca', 'cartao', 'investimento', 'dinheiro', 'outra')),
  banco text check (banco is null or length(banco) <= 60),
  cor text not null default 'sky' check (cor ~ '^[a-z]{3,10}$'),
  saldo_inicial numeric(14, 2) not null default 0,
  saldo_inicial_em date not null default current_date,
  limite numeric(14, 2) check (limite is null or limite >= 0),
  ativa boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

create table if not exists public.pessoal_lancamentos (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users(id),
  conta_id uuid not null references public.pessoal_contas(id),
  data date not null,
  descricao text not null check (length(btrim(descricao)) between 1 and 200),
  valor numeric(14, 2) not null check (valor <> 0),
  categoria text check (categoria is null or length(categoria) <= 40),
  situacao text not null default 'realizado' check (situacao in ('realizado', 'previsto')),
  identificador text check (identificador is null or length(identificador) <= 200),
  anulado boolean not null default false,
  criado_em timestamptz not null default now()
);
-- o mesmo lançamento do extrato não entra duas vezes na mesma conta
create unique index if not exists pessoal_lancamentos_ident on public.pessoal_lancamentos (conta_id, identificador);
create index if not exists pessoal_lancamentos_conta_data on public.pessoal_lancamentos (conta_id, data);

alter table public.pessoal_contas enable row level security;
alter table public.pessoal_lancamentos enable row level security;
revoke all on public.pessoal_contas, public.pessoal_lancamentos from anon, public;
grant select, insert, update on public.pessoal_contas, public.pessoal_lancamentos to authenticated;

create policy pessoal_contas_ler on public.pessoal_contas for select to authenticated using (dono = auth.uid());
create policy pessoal_contas_criar on public.pessoal_contas for insert to authenticated with check (dono = auth.uid());
create policy pessoal_contas_mudar on public.pessoal_contas for update to authenticated using (dono = auth.uid()) with check (dono = auth.uid());

create policy pessoal_lanc_ler on public.pessoal_lancamentos for select to authenticated using (dono = auth.uid());
create policy pessoal_lanc_criar on public.pessoal_lancamentos for insert to authenticated
  with check (dono = auth.uid() and exists (select 1 from public.pessoal_contas c where c.id = conta_id and c.dono = auth.uid()));
create policy pessoal_lanc_mudar on public.pessoal_lancamentos for update to authenticated using (dono = auth.uid())
  with check (dono = auth.uid() and exists (select 1 from public.pessoal_contas c where c.id = conta_id and c.dono = auth.uid()));
