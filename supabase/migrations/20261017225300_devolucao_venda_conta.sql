-- Origem DV (devolução de venda): a NF-e de entrada de devolução emitida pela MF fica ligada à conta a pagar do
-- reembolso ao cliente; e o plano de contas ganha "devoluções de vendas" (dedução da receita bruta no DRE).
set lock_timeout = '8s';
alter table public.notas_fiscais add column if not exists conta_pagar_id uuid;
alter table public.notas_fiscais add constraint notas_fiscais_conta_pagar_fk foreign key (conta_pagar_id) references public.contas_pagar(id);
create index if not exists notas_fiscais_conta_pagar_idx on public.notas_fiscais (conta_pagar_id) where conta_pagar_id is not null;
comment on column public.notas_fiscais.conta_pagar_id is 'Devolução de venda: conta a pagar do reembolso ao cliente';
insert into public.categorias_financeiras (nome, tipo, grupo, ordem)
select 'devoluções de vendas', 'despesa', 'deducao', 15
 where not exists (select 1 from public.categorias_financeiras where lower(nome) = 'devoluções de vendas');
