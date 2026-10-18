set lock_timeout = '8s';

-- Contas a pagar renegociadas: a negociação (com o fornecedor), as contas que entraram nela e o histórico (notas,
-- áudios, prints e arquivos, com data). "original" = a conta que foi trocada pelo acordo (fica cancelada, com o motivo);
-- "acordo" = a conta que vale (as parcelas novas, ou as mesmas contas quando só se registra a negociação).
create table if not exists public.pagar_negociacoes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(btrim(titulo)) >= 3),
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  unidade_id uuid references public.unidades(id) on delete set null,
  valor_original numeric(14,2) not null default 0 check (valor_original >= 0),
  valor_acordo numeric(14,2) check (valor_acordo is null or valor_acordo > 0),
  parcelas int check (parcelas is null or parcelas between 1 and 120),
  situacao text not null default 'negociando' check (situacao in ('negociando', 'acordo', 'quitada', 'cancelada')),
  observacoes text check (observacoes is null or length(observacoes) <= 4000),
  criado_por uuid default auth.uid(),
  criado_nome text,
  created_at timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table public.pagar_negociacoes is 'Renegociação de contas a pagar com o fornecedor (Financeiro → Contas a pagar → Renegociadas).';
alter table public.pagar_negociacoes enable row level security;
revoke all on public.pagar_negociacoes from anon, public;
grant select, insert, update, delete on public.pagar_negociacoes to authenticated;
