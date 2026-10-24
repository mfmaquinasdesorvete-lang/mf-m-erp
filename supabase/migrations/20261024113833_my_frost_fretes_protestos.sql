-- My Frost (empresa anterior), à parte da MF: fretes (CT-e, faturas, coletas e cotações das transportadoras) e
-- protestos (cartas de anuência, quitações e avisos do cartório), achados no e-mail e no Drive dela.
-- Só a conta master lê (Retaguarda → My Frost). A gravação é feita pelo administrador direto no banco, sem tela.
create table if not exists public.my_frost_fretes (
  id uuid primary key default gen_random_uuid(),
  data date,
  transportadora text not null,
  tipo text not null check (tipo in ('cte', 'cte_cancelado', 'fatura', 'coleta', 'cotacao', 'cobranca', 'boleto', 'outro')),
  numero text,
  chave_cte text check (chave_cte is null or chave_cte ~ '^[0-9]{44}$'),
  valor numeric(12, 2) check (valor is null or valor >= 0),
  remetente text,
  destinatario text,
  tomador text,
  nf text,
  origem text not null default 'gmail',
  link text,
  created_at timestamptz not null default now()
);
create unique index if not exists my_frost_fretes_chave on public.my_frost_fretes (chave_cte) where chave_cte is not null;
create unique index if not exists my_frost_fretes_numero on public.my_frost_fretes (transportadora, tipo, numero)
  where chave_cte is null and numero is not null;
create index if not exists my_frost_fretes_data on public.my_frost_fretes (data);

create table if not exists public.my_frost_protestos (
  id uuid primary key default gen_random_uuid(),
  data date,
  tipo text not null check (tipo in ('anuencia', 'quitacao', 'aviso_cartorio', 'outro')),
  credor text,
  titulo text,
  valor numeric(12, 2) check (valor is null or valor >= 0),
  cartorio text,
  observacao text,
  origem text not null default 'gmail',
  link text,
  created_at timestamptz not null default now()
);
create index if not exists my_frost_protestos_data on public.my_frost_protestos (data);

alter table public.my_frost_fretes enable row level security;
alter table public.my_frost_protestos enable row level security;
revoke all on public.my_frost_fretes, public.my_frost_protestos from anon, public, authenticated;
grant select on public.my_frost_fretes, public.my_frost_protestos to authenticated;
create policy my_frost_fretes_master on public.my_frost_fretes for select to authenticated
  using ((select public.is_erp_master()));
create policy my_frost_protestos_master on public.my_frost_protestos for select to authenticated
  using ((select public.is_erp_master()));
