-- Tabelas de frete negociadas (Fretes → Tabelas de frete): para cotar nas transportadoras sem API (São Miguel e
-- outras) pela tabela que cada uma manda, na cotação rápida e no "Calcule o frete" da loja (functions/frete-cotar).
--  * frete_tabelas: uma tabela por transportadora e origem, com vigência e o que vale para todos os destinos
--    (cubagem, % da nota (frete-valor e GRIS), pedágio, taxa por CT-e, frete mínimo, ICMS por fora ou incluso);
--  * frete_tabela_destinos: por destino (faixa de CEP, cidade ou estado): faixas de peso, R$/kg acima da última
--    faixa (ou R$/kg direto), frete mínimo, % da nota e taxa da cidade (TDA/TRT) quando forem diferentes, e o prazo.
-- O cálculo fica em _shared/frete-tabela.ts (testado no Vitest). Só acrescenta. Aplicada em 24/10/2026 (as políticas
-- comando a comando, com o mesmo conteúdo deste arquivo).
create table if not exists public.frete_tabelas (
  id uuid primary key default gen_random_uuid(),
  transportadora_id uuid not null references public.transportadoras(id),
  nome text not null,
  unidade_id uuid references public.unidades(id),
  vigencia_inicio date,
  vigencia_fim date,
  ativo boolean not null default true,
  fator_cubagem numeric(8,2) not null default 300,
  ad_valorem_pct numeric(8,4) not null default 0,
  gris_pct numeric(8,4) not null default 0,
  gris_minimo numeric(12,2) not null default 0,
  pedagio_valor numeric(12,2) not null default 0,
  pedagio_fracao_kg numeric(10,2) not null default 100,
  taxa_despacho numeric(12,2) not null default 0,
  frete_minimo numeric(12,2) not null default 0,
  icms_por_fora boolean not null default false,
  icms_interno_pct numeric(6,2) not null default 17,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.frete_tabelas is 'Tabelas de frete negociadas com as transportadoras (cotação sem API)';
create index if not exists frete_tabelas_transp on public.frete_tabelas (transportadora_id);

create table if not exists public.frete_tabela_destinos (
  id uuid primary key default gen_random_uuid(),
  tabela_id uuid not null references public.frete_tabelas(id) on delete cascade,
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  cidade text,
  cep_inicio text check (cep_inicio is null or cep_inicio ~ '^[0-9]{8}$'),
  cep_fim text check (cep_fim is null or cep_fim ~ '^[0-9]{8}$'),
  prazo_dias integer,
  faixas jsonb not null default '[]'::jsonb,
  excedente_kg numeric(12,4),
  frete_kg numeric(12,4),
  frete_minimo numeric(12,2),
  ad_valorem_pct numeric(8,4),
  taxa_extra numeric(12,2)
);
comment on table public.frete_tabela_destinos is 'Destinos de uma tabela de frete: faixas de peso [{ate_kg, valor}], R$/kg, mínimo, prazo';
create index if not exists frete_tabela_destinos_tabela on public.frete_tabela_destinos (tabela_id, uf);

alter table public.frete_tabelas enable row level security;
alter table public.frete_tabela_destinos enable row level security;
drop policy if exists frete_tabelas_select on public.frete_tabelas;
create policy frete_tabelas_select on public.frete_tabelas for select to authenticated
  using ((select public.tem_papel(variadic array['vendas', 'financeiro', 'expedicao'])));
drop policy if exists frete_tabelas_gravar on public.frete_tabelas;
create policy frete_tabelas_gravar on public.frete_tabelas for all to authenticated
  using ((select public.tem_papel(variadic array['financeiro', 'expedicao'])))
  with check ((select public.tem_papel(variadic array['financeiro', 'expedicao'])));
drop policy if exists frete_tabela_destinos_select on public.frete_tabela_destinos;
create policy frete_tabela_destinos_select on public.frete_tabela_destinos for select to authenticated
  using ((select public.tem_papel(variadic array['vendas', 'financeiro', 'expedicao'])));
drop policy if exists frete_tabela_destinos_gravar on public.frete_tabela_destinos;
create policy frete_tabela_destinos_gravar on public.frete_tabela_destinos for all to authenticated
  using ((select public.tem_papel(variadic array['financeiro', 'expedicao'])))
  with check ((select public.tem_papel(variadic array['financeiro', 'expedicao'])));
