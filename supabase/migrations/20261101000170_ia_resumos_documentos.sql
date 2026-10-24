-- =====================================================================
-- Resumo de documentos com IA (pedido de 23/10): a função ia-resumo lê o PDF ou a foto anexada (contrato, chamado,
-- proposta, boleto) e guarda o resumo aqui, para a próxima pessoa não pagar a IA de novo. Só quem vê o documento vê o
-- resumo (a regra da tabela documentos vale dentro do exists). Documentos de funcionários e pessoais não vão para a IA.
-- Somente acréscimos. Quem grava é a função (service role).
-- =====================================================================

set local lock_timeout = '10s';

create table if not exists public.ia_resumos_documentos (
  documento_id uuid primary key references public.documentos(id) on delete cascade,
  resumo jsonb not null,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  modelo text
);
comment on table public.ia_resumos_documentos is 'Resumo feito pela IA de cada documento anexado (o que é, pontos, datas, valores, o que fazer)';

alter table public.ia_resumos_documentos enable row level security;
revoke all on public.ia_resumos_documentos from anon, authenticated;
grant select on public.ia_resumos_documentos to authenticated;
do $$ begin
  create policy ia_resumos_documentos_ler on public.ia_resumos_documentos for select to authenticated
    using (exists (select 1 from public.documentos d where d.id = documento_id));
exception when duplicate_object then null; end $$;
