-- =====================================================================
-- Recibos: numeração própria e histórico (reimprimir, cancelar com motivo). Dois tipos:
--   recebimento: a MF recebeu de um cliente (quem assina é a MF)
--   pagamento:   a MF pagou alguém, ex.: o advogado (quem assina é quem recebeu)
-- Guarda os nomes e documentos do jeito que saíram no recibo.
-- =====================================================================
create table if not exists public.recibos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  tipo text not null default 'recebimento' check (tipo in ('recebimento', 'pagamento')),
  unidade_id uuid references public.unidades(id),
  conta_receber_id uuid references public.contas_receber(id),
  conta_pagar_id uuid references public.contas_pagar(id),
  pagador_nome text not null check (length(btrim(pagador_nome)) >= 2),
  pagador_doc text,
  recebedor_nome text not null check (length(btrim(recebedor_nome)) >= 2),
  recebedor_doc text,
  valor numeric(12,2) not null check (valor > 0),
  referente text not null check (length(btrim(referente)) >= 3),
  forma_pagamento text,
  data_pagamento date not null default current_date,
  cidade text,
  observacoes text,
  cancelado_em timestamptz,
  cancelado_motivo text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (cancelado_em is null or length(btrim(coalesce(cancelado_motivo, ''))) >= 3)
);
create index if not exists recibos_conta_receber on public.recibos (conta_receber_id);
create index if not exists recibos_conta_pagar on public.recibos (conta_pagar_id);

alter table public.recibos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recibos' and policyname = 'erp_select') then
    create policy "erp_select" on public.recibos for select to authenticated using (public.is_erp_user());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recibos' and policyname = 'erp_insert') then
    create policy "erp_insert" on public.recibos for insert to authenticated with check (public.tem_papel('vendas', 'financeiro'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recibos' and policyname = 'erp_update') then
    create policy "erp_update" on public.recibos for update to authenticated using (public.tem_papel('vendas', 'financeiro')) with check (public.tem_papel('vendas', 'financeiro'));
  end if;
end $$;
grant select, insert, update on public.recibos to authenticated;

-- Recibo emitido não muda: só pode ser cancelado (com motivo). Para corrigir, cancela e emite outro.
create or replace function public.trg_recibo_imutavel()
returns trigger language plpgsql as $$
begin
  if old.cancelado_em is not null then raise exception 'recibo nº % já está cancelado', old.numero; end if;
  if (new.tipo, new.pagador_nome, coalesce(new.pagador_doc, ''), new.recebedor_nome, coalesce(new.recebedor_doc, ''), new.valor, new.referente,
      coalesce(new.forma_pagamento, ''), new.data_pagamento, coalesce(new.cidade, ''))
     is distinct from
     (old.tipo, old.pagador_nome, coalesce(old.pagador_doc, ''), old.recebedor_nome, coalesce(old.recebedor_doc, ''), old.valor, old.referente,
      coalesce(old.forma_pagamento, ''), old.data_pagamento, coalesce(old.cidade, '')) then
    raise exception 'recibo emitido não pode ser alterado: cancele (informando o motivo) e emita outro';
  end if;
  return new;
end $$;
create or replace trigger trg_recibo_imutavel
before update on public.recibos
for each row execute function public.trg_recibo_imutavel();
