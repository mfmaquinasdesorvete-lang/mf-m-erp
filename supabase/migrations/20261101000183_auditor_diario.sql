-- Auditor financeiro (AUD): rodada diária sozinha, por volta das 07:00 de Brasília (pedido da usuária, 28/10).
-- Só leitura dos dados da empresa: a função auditor-diario lê contas, extratos e pedidos e grava apenas aqui.
--  - auditor_rodadas: cada rodada (quando, quantos achados, quantos novos, o mais importante) — o FAZ lê a última
--    para o aviso único da manhã;
--  - auditor_achados: cada achado pela chave (a mesma das Exceções da Auditoria financeira), para não repetir o que já
--    apareceu. A situação (Novo → Em análise → Resolvido ou Descartado) continua na tratativa (auditoria_excecoes).

create table if not exists public.auditor_rodadas (
  id uuid primary key default gen_random_uuid(),
  iniciada_em timestamptz not null default now(),
  terminada_em timestamptz,
  origem text not null default 'agendamento',          -- agendamento | manual
  total int,
  novos int,
  novos_alta int, novos_media int, novos_baixa int,
  principal text,                                       -- título do achado novo mais grave
  erro text
);
create index if not exists auditor_rodadas_quando on public.auditor_rodadas (iniciada_em desc);

create table if not exists public.auditor_achados (
  chave text primary key,
  tipo text not null,
  gravidade text not null,
  titulo text not null,
  detalhe text,
  valor numeric(14,2),
  data date,
  link text,
  primeira_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  primeira_rodada uuid references public.auditor_rodadas(id) on delete set null,
  ultima_rodada uuid references public.auditor_rodadas(id) on delete set null,
  ativo boolean not null default true                   -- false: não apareceu na última rodada (o problema sumiu)
);
create index if not exists auditor_achados_rodada on public.auditor_achados (primeira_rodada);

alter table public.auditor_rodadas enable row level security;
alter table public.auditor_achados enable row level security;
-- só leitura para quem vê a auditoria; quem grava é a função (chave de serviço)
create policy "ar_select" on public.auditor_rodadas for select to authenticated using (public.tem_papel('financeiro') or public.e_contador());
create policy "aa_select" on public.auditor_achados for select to authenticated using (public.tem_papel('financeiro') or public.e_contador());

-- 07:03 de Brasília (10:03 UTC), todo dia
select cron.schedule('erp-auditor-diario', '3 10 * * *', $c$ select public.chamar_funcao('auditor-diario', '{}'::jsonb, 120000) $c$);
