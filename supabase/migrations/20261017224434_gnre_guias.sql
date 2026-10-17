create table if not exists public.gnre_guias (
  id uuid primary key default gen_random_uuid(),
  nota_fiscal_id uuid not null unique,
  unidade_id uuid,
  uf text not null,
  nf_numero text,
  valor_difal numeric(14,2) not null default 0,
  valor_fcp numeric(14,2) not null default 0,
  valor_st numeric(14,2) not null default 0,
  valor_total numeric(14,2) not null default 0,
  vencimento date not null,
  conta_pagar_id uuid,
  situacao text not null default 'a_gerar',
  codigo_barras text,
  observacao text,
  created_at timestamptz not null default now(),
  atualizado_em timestamptz,
  atualizado_por uuid
);
