set lock_timeout = '8s';

-- Liga a conta a pagar à renegociação
alter table public.contas_pagar add column if not exists negociacao_id uuid references public.pagar_negociacoes(id) on delete set null;
alter table public.contas_pagar add column if not exists negociacao_papel text;
alter table public.contas_pagar drop constraint if exists contas_pagar_negociacao_papel;
alter table public.contas_pagar add constraint contas_pagar_negociacao_papel
  check (negociacao_papel is null or (negociacao_id is not null and negociacao_papel in ('original', 'acordo')));
create index if not exists contas_pagar_negociacao on public.contas_pagar (negociacao_id) where negociacao_id is not null;
comment on column public.contas_pagar.negociacao_papel is 'original = trocada pelo acordo (cancelada); acordo = a conta que vale na renegociação.';
