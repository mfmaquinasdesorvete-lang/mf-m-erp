-- OC - Ordem de Compra com os campos do Tiny (parte 1: colunas): data, nº no fornecedor, categoria, desconto, outras despesas, IPI e
-- ICMS ST por item, forma de pagamento com parcelas, transportadora e frete por conta, observações internas e
-- informações do item. Somente acréscimos: as OC que já existem ficam com o mesmo total (os campos novos começam zerados).
alter table public.pedidos_compra
  add column if not exists data date,
  add column if not exists numero_fornecedor text,
  add column if not exists categoria text,
  add column if not exists desconto numeric not null default 0,
  add column if not exists outras_despesas numeric not null default 0,
  add column if not exists forma_pagamento_id uuid references public.formas_pagamento(id) on delete set null,
  add column if not exists parcelas jsonb,
  add column if not exists transportadora_id uuid references public.transportadoras(id) on delete set null,
  add column if not exists frete_por_conta text,
  add column if not exists observacoes_internas text;
-- a data da OC nova é o dia de hoje; as antigas ficam sem (a tela mostra o dia em que foram criadas)
alter table public.pedidos_compra alter column data set default current_date;
alter table public.pedidos_compra drop constraint if exists pedidos_compra_frete_por_conta_check;
alter table public.pedidos_compra add constraint pedidos_compra_frete_por_conta_check
  check (frete_por_conta is null or frete_por_conta in ('remetente', 'destinatario', 'terceiros', 'proprio_remetente', 'proprio_destinatario', 'sem_frete'));
alter table public.pedidos_compra drop constraint if exists pedidos_compra_valores_check;
alter table public.pedidos_compra add constraint pedidos_compra_valores_check check (desconto >= 0 and outras_despesas >= 0);
alter table public.pedidos_compra drop constraint if exists pedidos_compra_parcelas_check;
alter table public.pedidos_compra add constraint pedidos_compra_parcelas_check
  check (parcelas is null or (jsonb_typeof(parcelas) = 'array' and jsonb_array_length(parcelas) <= 48));
comment on column public.pedidos_compra.numero_fornecedor is 'Nº do pedido ou do orçamento no fornecedor (como no Tiny)';
comment on column public.pedidos_compra.parcelas is 'Parcelas combinadas: [{"vencimento":"AAAA-MM-DD","valor":0,"observacao":""}]; viram as contas a pagar ao receber a mercadoria';
comment on column public.pedidos_compra.frete_por_conta is 'Modalidade do frete (como na NF-e): remetente (CIF), destinatario (FOB), terceiros, próprio do remetente, próprio do destinatário ou sem frete';

alter table public.pedido_compra_itens
  add column if not exists ipi_aliquota numeric not null default 0,
  add column if not exists icms_st_valor numeric not null default 0,
  add column if not exists informacoes text;
alter table public.pedido_compra_itens drop constraint if exists pedido_compra_itens_impostos_check;
alter table public.pedido_compra_itens add constraint pedido_compra_itens_impostos_check
  check (ipi_aliquota >= 0 and ipi_aliquota <= 100 and icms_st_valor >= 0);
