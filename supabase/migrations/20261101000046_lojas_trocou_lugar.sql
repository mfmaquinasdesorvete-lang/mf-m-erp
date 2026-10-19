-- Unidades My Frost: nova situação "mudou" (trocou de lugar) para o filtro Ativa · Vai abrir · Vai fechar · Fechada · Trocou de lugar.
alter table public.licenciados_lojas drop constraint if exists licenciados_lojas_situacao_check;
alter table public.licenciados_lojas add constraint licenciados_lojas_situacao_check
  check (situacao = any (array['negociando','implantacao','ativa','fechando','pausada','encerrada','mudou']));
