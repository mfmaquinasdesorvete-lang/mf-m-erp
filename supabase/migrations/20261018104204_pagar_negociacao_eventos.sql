set lock_timeout = '8s';

-- Histórico da renegociação (nota, áudio, print, arquivo ou o acordo, com a data)
create table if not exists public.pagar_negociacao_eventos (
  id uuid primary key default gen_random_uuid(),
  negociacao_id uuid not null references public.pagar_negociacoes(id) on delete cascade,
  tipo text not null default 'nota' check (tipo in ('nota', 'audio', 'print', 'acordo', 'arquivo')),
  quando date not null default current_date,
  texto text check (texto is null or length(texto) <= 4000),
  arquivo_caminho text check (arquivo_caminho is null or arquivo_caminho like 'conta_pagar/negociacao-%'),
  arquivo_nome text,
  arquivo_tipo text,
  criado_por uuid not null default auth.uid(),
  criado_nome text,
  created_at timestamptz not null default now(),
  check (length(btrim(coalesce(texto, ''))) > 0 or arquivo_caminho is not null)
);
comment on table public.pagar_negociacao_eventos is 'Histórico da renegociação: nota, áudio, print, arquivo ou o acordo, com a data. O arquivo fica no bucket documentos (conta_pagar/negociacao-<id>/…).';
create index if not exists pagar_negociacao_eventos_neg on public.pagar_negociacao_eventos (negociacao_id, quando);
alter table public.pagar_negociacao_eventos enable row level security;
revoke all on public.pagar_negociacao_eventos from anon, public;
grant select, insert, delete on public.pagar_negociacao_eventos to authenticated;
