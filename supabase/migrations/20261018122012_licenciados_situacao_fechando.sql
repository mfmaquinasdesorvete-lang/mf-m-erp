set lock_timeout = '8s';
-- "vai fechar": a unidade ainda funciona, mas já avisou que vai encerrar
alter table public.licenciados_lojas drop constraint if exists licenciados_lojas_situacao_check;
alter table public.licenciados_lojas add constraint licenciados_lojas_situacao_check
  check (situacao in ('negociando', 'implantacao', 'ativa', 'fechando', 'pausada', 'encerrada'));
