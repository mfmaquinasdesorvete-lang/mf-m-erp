-- Validador de NF-e (Notas fiscais → Validar): guarda o resultado da última validação de cada chave,
-- para mostrar o selo (verde / amarelo / vermelho) na lista de notas emitidas e recebidas.
create table if not exists public.nfe_validacoes (
  chave text primary key check (chave ~ '^\d{44}$'),
  nivel text not null check (nivel in ('ok', 'alerta', 'erro')),
  achados jsonb not null default '[]'::jsonb,
  validado_em timestamptz not null default now(),
  validado_por uuid default auth.uid()
);
alter table public.nfe_validacoes enable row level security;

drop policy if exists nfe_validacoes_ler on public.nfe_validacoes;
create policy nfe_validacoes_ler on public.nfe_validacoes for select to authenticated
  using (public.tem_papel(variadic array['vendas', 'financeiro', 'compras']) or public.e_contador());
drop policy if exists nfe_validacoes_gravar on public.nfe_validacoes;
create policy nfe_validacoes_gravar on public.nfe_validacoes for insert to authenticated
  with check (public.tem_papel(variadic array['vendas', 'financeiro', 'compras']));
drop policy if exists nfe_validacoes_atualizar on public.nfe_validacoes;
create policy nfe_validacoes_atualizar on public.nfe_validacoes for update to authenticated
  using (public.tem_papel(variadic array['vendas', 'financeiro', 'compras']))
  with check (public.tem_papel(variadic array['vendas', 'financeiro', 'compras']));
grant select, insert, update on public.nfe_validacoes to authenticated;
