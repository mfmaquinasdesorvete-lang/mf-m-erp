-- =====================================================================
-- IA analisa as contas a pagar antes da aprovação (pedido de 23/10): a função ia-titulos confere cada conta em revisão
-- (valor fora do normal para o fornecedor, possível repetida, nota ligada, documento, vencimento, fornecedor bloqueado)
-- e deixa o parecer aqui para quem aprova ver em Aprovações. Só sugere: quem aprova decide.
-- Somente acréscimos. Quem grava é a função (service role); a equipe do financeiro só lê.
-- =====================================================================

set local lock_timeout = '10s';

create table if not exists public.ia_pareceres_pagar (
  conta_id uuid primary key references public.contas_pagar(id) on delete cascade,
  sinal text not null check (sinal in ('ok', 'atencao', 'conferir')),
  motivo text not null,
  valor numeric(14,2) not null,          -- valor da conta na análise: se mudar, o parecer fica velho
  vencimento date,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  modelo text
);
comment on table public.ia_pareceres_pagar is 'Parecer da IA para cada conta a pagar em revisão (ok, atenção, conferir), visto em Aprovações';

alter table public.ia_pareceres_pagar enable row level security;
revoke all on public.ia_pareceres_pagar from anon, authenticated;
grant select on public.ia_pareceres_pagar to authenticated;
do $$ begin
  create policy ia_pareceres_pagar_ler on public.ia_pareceres_pagar for select to authenticated
    using (public.is_erp_admin() or public.tem_papel('financeiro'));
exception when duplicate_object then null; end $$;
