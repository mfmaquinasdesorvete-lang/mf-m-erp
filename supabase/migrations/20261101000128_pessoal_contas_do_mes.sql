-- Painel pessoal: contas que voltam todo mês (ex.: o DAS de um MEI, vence no dia 20 e se refere ao mês anterior).
-- pessoal_mensais guarda a conta (nome, dia do vencimento, valor de sempre, quantos dias antes avisar);
-- pessoal_mensais_pagos guarda cada mês pago, com o comprovante e o lançamento na conta, se saiu de uma conta do painel.
-- Como o resto do painel: cada linha é de quem a criou e só essa pessoa lê; nada se apaga (a conta é desligada).
create table if not exists public.pessoal_mensais (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users(id),
  nome text not null check (length(btrim(nome)) between 2 and 120),
  dia_vencimento int not null check (dia_vencimento between 1 and 31),
  mes_anterior boolean not null default false,
  valor numeric(14, 2) check (valor is null or valor > 0),
  conta_id uuid references public.pessoal_contas(id),
  avisar_dias int not null default 5 check (avisar_dias between 0 and 30),
  observacao text check (observacao is null or length(observacao) <= 300),
  desde text check (desde is null or desde ~ '^[0-9]{4}-[0-9]{2}$'),
  ativa boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);
create table if not exists public.pessoal_mensais_pagos (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users(id),
  mensal_id uuid not null references public.pessoal_mensais(id),
  mes text not null check (mes ~ '^[0-9]{4}-[0-9]{2}$'),
  pago_em date not null,
  valor numeric(14, 2) check (valor is null or valor > 0),
  comprovante text check (comprovante is null or length(comprovante) <= 300),
  lancamento_id uuid references public.pessoal_lancamentos(id),
  anulado boolean not null default false,
  criado_em timestamptz not null default now()
);
create unique index if not exists pessoal_mensais_pagos_mes on public.pessoal_mensais_pagos (mensal_id, mes) where not anulado;

alter table public.pessoal_mensais enable row level security;
alter table public.pessoal_mensais_pagos enable row level security;
revoke all on public.pessoal_mensais, public.pessoal_mensais_pagos from anon, public;
grant select, insert, update on public.pessoal_mensais, public.pessoal_mensais_pagos to authenticated;

create policy pessoal_mensais_ler on public.pessoal_mensais for select to authenticated using (dono = auth.uid());
create policy pessoal_mensais_criar on public.pessoal_mensais for insert to authenticated with check (dono = auth.uid());
create policy pessoal_mensais_mudar on public.pessoal_mensais for update to authenticated using (dono = auth.uid()) with check (dono = auth.uid());
create policy pessoal_mensais_pagos_ler on public.pessoal_mensais_pagos for select to authenticated using (dono = auth.uid());
create policy pessoal_mensais_pagos_criar on public.pessoal_mensais_pagos for insert to authenticated with check (dono = auth.uid());
create policy pessoal_mensais_pagos_mudar on public.pessoal_mensais_pagos for update to authenticated using (dono = auth.uid()) with check (dono = auth.uid());
