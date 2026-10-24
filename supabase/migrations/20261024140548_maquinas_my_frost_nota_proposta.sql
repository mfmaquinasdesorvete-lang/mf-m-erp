-- Máquina da My Frost (empresa anterior) ligada à proposta e à nota que a venderam, para a Ficha 360 mostrar o valor
-- negociado, o valor na nota e a chave (pedido da usuária, 24/10). Sem o backup dos XML, a ligação foi feita pelo nome do
-- cliente, o modelo da máquina e a data (proposta do mesmo modelo e nota de venda até 150 dias depois); ligacao_venda diz
-- como cada uma foi ligada. Gravado uma vez direto no banco (460 de 1.152 máquinas), com o ok dela.
alter table public.equipamentos add column if not exists proposta_tiny_id uuid references public.propostas_tiny(id) on delete set null;
alter table public.equipamentos add column if not exists nota_legado_id uuid references public.notas_legado(id) on delete set null;
alter table public.equipamentos add column if not exists valor_negociado numeric(12,2) check (valor_negociado is null or valor_negociado >= 0);
alter table public.equipamentos add column if not exists ligacao_venda text;
create index if not exists equipamentos_nota_legado on public.equipamentos (nota_legado_id) where nota_legado_id is not null;
create index if not exists equipamentos_proposta_tiny on public.equipamentos (proposta_tiny_id) where proposta_tiny_id is not null;
