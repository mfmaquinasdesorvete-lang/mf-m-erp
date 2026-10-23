-- Certidões da MF (Painel do contador → Certidões): federal (RFB/PGFN) e trabalhista (CNDT) valem para o CNPJ todo;
-- estadual, municipal e FGTS (CRF) são de cada unidade. Guarda a validade para avisar antes de vencer; o PDF vai em
-- documentos (entidade 'geral', entidade_id = id da certidão), junto dos documentos da empresa.
-- Só a MF: as certidões das outras empresas do grupo ficam no painel pessoal.
create table if not exists public.certidoes (
  id uuid primary key default gen_random_uuid(),
  -- vazio = do CNPJ todo (federal, trabalhista); preenchido = da unidade (estadual, municipal, FGTS)
  unidade_id uuid references public.unidades(id),
  tipo text not null check (tipo in ('federal', 'estadual', 'municipal', 'fgts', 'trabalhista', 'outra')),
  situacao text not null default 'negativa' check (situacao in ('negativa', 'positiva_efeito_negativa', 'positiva')),
  emitida_em date not null,
  validade date not null,
  codigo text check (codigo is null or length(codigo) <= 120),
  observacao text check (observacao is null or length(observacao) <= 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  excluida_em timestamptz,
  check (validade >= emitida_em)
);
create index if not exists certidoes_tipo_idx on public.certidoes (tipo, unidade_id, validade desc) where excluida_em is null;
alter table public.certidoes enable row level security;
create policy certidoes_select on public.certidoes for select to authenticated
  using ((select public.tem_papel('financeiro')) or (select public.e_contador()));
create policy certidoes_insert on public.certidoes for insert to authenticated
  with check (((select public.tem_papel('financeiro')) or (select public.e_contador())) and created_by = (select auth.uid()));
create policy certidoes_update on public.certidoes for update to authenticated
  using ((select public.tem_papel('financeiro')) or (select public.e_contador()))
  with check ((select public.tem_papel('financeiro')) or (select public.e_contador()));
create trigger zz_auditoria before insert or update on public.certidoes
  for each row execute function public.trg_auditoria();
