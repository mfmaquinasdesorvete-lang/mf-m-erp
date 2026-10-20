-- Eventos da NF-e depois da autorização (Notas fiscais → ícone de postos fiscais): passagem por posto fiscal,
-- MDF-e/CT-e da carga, ciência/confirmação do destinatário, CC-e e cancelamento. Vêm da Focus (consulta completa)
-- ou de XML de evento importado na tela.
create table if not exists public.nfe_eventos (
  id uuid primary key default gen_random_uuid(),
  chave text not null check (chave ~ '^[0-9]{44}$'),
  tp_evento text not null,
  n_seq int not null default 1,
  descricao text not null,
  dh_evento timestamptz,
  orgao text,
  detalhe text,
  protocolo text,
  origem text not null default 'focus' check (origem in ('focus', 'xml')),
  created_at timestamptz not null default now(),
  unique (chave, tp_evento, n_seq)
);
create index if not exists nfe_eventos_chave_idx on public.nfe_eventos (chave);
alter table public.nfe_eventos enable row level security;

drop policy if exists nfe_eventos_ler on public.nfe_eventos;
create policy nfe_eventos_ler on public.nfe_eventos for select to authenticated
  using (public.tem_papel(variadic array['vendas', 'financeiro', 'compras', 'expedicao']) or public.e_contador());
drop policy if exists nfe_eventos_gravar on public.nfe_eventos;
create policy nfe_eventos_gravar on public.nfe_eventos for insert to authenticated
  with check (public.tem_papel(variadic array['vendas', 'financeiro', 'compras']));
drop policy if exists nfe_eventos_atualizar on public.nfe_eventos;
create policy nfe_eventos_atualizar on public.nfe_eventos for update to authenticated
  using (public.tem_papel(variadic array['vendas', 'financeiro', 'compras']))
  with check (public.tem_papel(variadic array['vendas', 'financeiro', 'compras']));
grant select, insert, update on public.nfe_eventos to authenticated;
