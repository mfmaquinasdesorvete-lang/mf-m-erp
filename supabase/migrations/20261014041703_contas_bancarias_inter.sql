-- =====================================================================
-- Contas bancárias: a lista de bancos aceitos passa a ter o Banco Inter ('inter'), usado pela integração com a
-- API do Inter (extrato e saldo automáticos). Somente acréscimo: os bancos que já existiam continuam aceitos.
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contas_bancarias_banco_check'
                   and conrelid = 'public.contas_bancarias'::regclass and pg_get_constraintdef(oid) like '%''inter''%') then
    alter table public.contas_bancarias drop constraint if exists contas_bancarias_banco_check,
      add constraint contas_bancarias_banco_check check (banco in ('unicred', 'nubank', 'infinitepay', 'outro', 'caixa', 'inter'));
  end if;
end $$;
