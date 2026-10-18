set lock_timeout = '8s';
-- As máquinas de cada unidade (com a data da compra) e o que custou montar a unidade. Como as lojas e os pagamentos:
-- cada linha é de quem a criou e só essa pessoa lê; nada entra na MF (DRE, conciliação, contador).
create table if not exists public.licenciados_maquinas (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users(id),
  loja_id uuid not null references public.licenciados_lojas(id),
  descricao text not null check (length(btrim(descricao)) between 2 and 160),
  numero_serie text check (numero_serie is null or length(numero_serie) <= 60),
  data_compra date,
  valor numeric(14, 2) check (valor is null or valor >= 0),
  situacao text not null default 'na_loja' check (situacao in ('na_loja', 'manutencao', 'devolvida', 'baixada')),
  observacao text check (observacao is null or length(observacao) <= 500),
  criado_em timestamptz not null default now()
);
comment on table public.licenciados_maquinas is 'My Frost Sorveterias: máquinas de cada unidade licenciada, com a data da compra (só o dono lê)';
create index if not exists licenciados_maquinas_loja_idx on public.licenciados_maquinas (loja_id);

create table if not exists public.licenciados_custos (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users(id),
  loja_id uuid not null references public.licenciados_lojas(id),
  data date not null default current_date,
  categoria text not null default 'outros' check (categoria in ('maquinas', 'insumos', 'pdv', 'moveis', 'montagem', 'suporte', 'uniformes', 'comunicacao', 'inauguracao', 'frete', 'viagem', 'outros')),
  descricao text check (descricao is null or length(descricao) <= 300),
  valor numeric(14, 2) not null check (valor > 0),
  observacao text check (observacao is null or length(observacao) <= 500),
  anulado boolean not null default false,
  criado_em timestamptz not null default now()
);
comment on table public.licenciados_custos is 'My Frost Sorveterias: o que custou montar cada unidade (máquinas, quiosque, insumos, PDV, montagem…), só o dono lê';
create index if not exists licenciados_custos_loja_idx on public.licenciados_custos (loja_id, data);

create table if not exists public.licenciados_arquivos (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users(id),
  loja_id uuid not null references public.licenciados_lojas(id),
  tipo text not null default 'contrato' check (tipo in ('contrato', 'ficha', 'documento', 'foto', 'outro')),
  nome text not null check (length(nome) between 1 and 200),
  caminho text not null check (caminho like 'licenciado/%'),
  tamanho bigint,
  mime text,
  criado_em timestamptz not null default now()
);
comment on table public.licenciados_arquivos is 'My Frost Sorveterias: contratos e documentos de cada unidade (bucket documentos, pasta licenciado/<dono>/…), só o dono lê';
create index if not exists licenciados_arquivos_loja_idx on public.licenciados_arquivos (loja_id);

alter table public.licenciados_maquinas enable row level security;
alter table public.licenciados_custos enable row level security;
alter table public.licenciados_arquivos enable row level security;
revoke all on public.licenciados_maquinas, public.licenciados_custos, public.licenciados_arquivos from anon, public;
-- sem apagar máquina nem custo (máquina sai como baixada/devolvida; custo errado é anulado); arquivo errado pode ser apagado
grant select, insert, update on public.licenciados_maquinas, public.licenciados_custos to authenticated;
grant select, insert, delete on public.licenciados_arquivos to authenticated;
