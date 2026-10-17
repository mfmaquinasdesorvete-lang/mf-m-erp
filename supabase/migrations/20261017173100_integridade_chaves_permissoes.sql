-- Integridade do banco (revisão de 17/10): as 24 colunas que apontavam para outra tabela sem chave estrangeira
-- ganham a chave (nenhum registro órfão na data). Itens e vínculos de uma NF ou OC somem junto com ela (cascade);
-- referências a cadastros que podem ser apagados (fornecedor, cliente, produto, transportadora…) ficam vazias.
-- As colunas que apontam para tabelas diferentes conforme o tipo (documentos.entidade_id, estoque_movimentos.referencia_id,
-- revisoes_contas.conta_id, contador_mensagens.conta_id) e as de usuário (auth.users) ficam sem chave de propósito.
-- Permissões: anon e authenticated perdem TRUNCATE, TRIGGER e REFERENCES (não usados pela API) e anon perde
-- INSERT, UPDATE e DELETE nas tabelas (as páginas públicas usam só funções); o mesmo vale para as tabelas novas.

set local lock_timeout = '15s';

alter table public.nfe_recebida_itens add constraint nfe_recebida_itens_nfe_id_fkey foreign key (nfe_id) references public.nfe_recebidas(id) on delete cascade not valid;
alter table public.nfe_recebida_itens validate constraint nfe_recebida_itens_nfe_id_fkey;
create index if not exists nfe_recebida_itens_nfe_id_idx on public.nfe_recebida_itens (nfe_id);
alter table public.nfe_recebida_itens_lidos add constraint nfe_recebida_itens_lidos_nfe_id_fkey foreign key (nfe_id) references public.nfe_recebidas(id) on delete cascade not valid;
alter table public.nfe_recebida_itens_lidos validate constraint nfe_recebida_itens_lidos_nfe_id_fkey;
create index if not exists nfe_recebida_itens_lidos_nfe_id_idx on public.nfe_recebida_itens_lidos (nfe_id);
alter table public.nfe_custos_itens add constraint nfe_custos_itens_nfe_id_fkey foreign key (nfe_id) references public.nfe_recebidas(id) on delete cascade not valid;
alter table public.nfe_custos_itens validate constraint nfe_custos_itens_nfe_id_fkey;
create index if not exists nfe_custos_itens_nfe_id_idx on public.nfe_custos_itens (nfe_id);
alter table public.nfe_oc_vinculos add constraint nfe_oc_vinculos_nfe_id_fkey foreign key (nfe_id) references public.nfe_recebidas(id) on delete cascade not valid;
alter table public.nfe_oc_vinculos validate constraint nfe_oc_vinculos_nfe_id_fkey;
create index if not exists nfe_oc_vinculos_nfe_id_idx on public.nfe_oc_vinculos (nfe_id);
alter table public.nfe_oc_vinculos add constraint nfe_oc_vinculos_pedido_compra_id_fkey foreign key (pedido_compra_id) references public.pedidos_compra(id) on delete cascade not valid;
alter table public.nfe_oc_vinculos validate constraint nfe_oc_vinculos_pedido_compra_id_fkey;
create index if not exists nfe_oc_vinculos_pedido_compra_id_idx on public.nfe_oc_vinculos (pedido_compra_id);
alter table public.nfe_oc_baixas add constraint nfe_oc_baixas_nfe_id_fkey foreign key (nfe_id) references public.nfe_recebidas(id) on delete cascade not valid;
alter table public.nfe_oc_baixas validate constraint nfe_oc_baixas_nfe_id_fkey;
create index if not exists nfe_oc_baixas_nfe_id_idx on public.nfe_oc_baixas (nfe_id);
alter table public.nfe_oc_baixas add constraint nfe_oc_baixas_pedido_compra_id_fkey foreign key (pedido_compra_id) references public.pedidos_compra(id) on delete cascade not valid;
alter table public.nfe_oc_baixas validate constraint nfe_oc_baixas_pedido_compra_id_fkey;
create index if not exists nfe_oc_baixas_pedido_compra_id_idx on public.nfe_oc_baixas (pedido_compra_id);
alter table public.nfe_oc_baixas add constraint nfe_oc_baixas_pedido_compra_item_id_fkey foreign key (pedido_compra_item_id) references public.pedido_compra_itens(id) on delete cascade not valid;
alter table public.nfe_oc_baixas validate constraint nfe_oc_baixas_pedido_compra_item_id_fkey;
create index if not exists nfe_oc_baixas_pedido_compra_item_id_idx on public.nfe_oc_baixas (pedido_compra_item_id);
alter table public.conciliacao_regras add constraint conciliacao_regras_fornecedor_id_fkey foreign key (fornecedor_id) references public.fornecedores(id) on delete set null not valid;
alter table public.conciliacao_regras validate constraint conciliacao_regras_fornecedor_id_fkey;
create index if not exists conciliacao_regras_fornecedor_id_idx on public.conciliacao_regras (fornecedor_id);
alter table public.conciliacao_regras add constraint conciliacao_regras_cliente_id_fkey foreign key (cliente_id) references public.clientes(id) on delete set null not valid;
alter table public.conciliacao_regras validate constraint conciliacao_regras_cliente_id_fkey;
create index if not exists conciliacao_regras_cliente_id_idx on public.conciliacao_regras (cliente_id);
alter table public.preco_sugestoes add constraint preco_sugestoes_nfe_id_fkey foreign key (nfe_id) references public.nfe_recebidas(id) on delete set null not valid;
alter table public.preco_sugestoes validate constraint preco_sugestoes_nfe_id_fkey;
create index if not exists preco_sugestoes_nfe_id_idx on public.preco_sugestoes (nfe_id);
alter table public.vendedores add constraint vendedores_portal_tabela_preco_id_fkey foreign key (portal_tabela_preco_id) references public.tabelas_preco(id) on delete set null not valid;
alter table public.vendedores validate constraint vendedores_portal_tabela_preco_id_fkey;
create index if not exists vendedores_portal_tabela_preco_id_idx on public.vendedores (portal_tabela_preco_id);
alter table public.nfe_custos_itens add constraint nfe_custos_itens_produto_id_fkey foreign key (produto_id) references public.produtos(id) on delete set null not valid;
alter table public.nfe_custos_itens validate constraint nfe_custos_itens_produto_id_fkey;
create index if not exists nfe_custos_itens_produto_id_idx on public.nfe_custos_itens (produto_id);
alter table public.nfe_custos_itens add constraint nfe_custos_itens_preco_sugestao_id_fkey foreign key (preco_sugestao_id) references public.preco_sugestoes(id) on delete set null not valid;
alter table public.nfe_custos_itens validate constraint nfe_custos_itens_preco_sugestao_id_fkey;
create index if not exists nfe_custos_itens_preco_sugestao_id_idx on public.nfe_custos_itens (preco_sugestao_id);
alter table public.nfe_oc_baixas add constraint nfe_oc_baixas_produto_id_fkey foreign key (produto_id) references public.produtos(id) on delete set null not valid;
alter table public.nfe_oc_baixas validate constraint nfe_oc_baixas_produto_id_fkey;
create index if not exists nfe_oc_baixas_produto_id_idx on public.nfe_oc_baixas (produto_id);
alter table public.cte_faturas add constraint cte_faturas_transportadora_id_fkey foreign key (transportadora_id) references public.transportadoras(id) on delete set null not valid;
alter table public.cte_faturas validate constraint cte_faturas_transportadora_id_fkey;
create index if not exists cte_faturas_transportadora_id_idx on public.cte_faturas (transportadora_id);
alter table public.cte_faturas add constraint cte_faturas_conta_pagar_id_fkey foreign key (conta_pagar_id) references public.contas_pagar(id) on delete set null not valid;
alter table public.cte_faturas validate constraint cte_faturas_conta_pagar_id_fkey;
create index if not exists cte_faturas_conta_pagar_id_idx on public.cte_faturas (conta_pagar_id);
alter table public.cte_faturas add constraint cte_faturas_unidade_id_fkey foreign key (unidade_id) references public.unidades(id) on delete set null not valid;
alter table public.cte_faturas validate constraint cte_faturas_unidade_id_fkey;
create index if not exists cte_faturas_unidade_id_idx on public.cte_faturas (unidade_id);
alter table public.ctes add constraint ctes_transportadora_id_fkey foreign key (transportadora_id) references public.transportadoras(id) on delete set null not valid;
alter table public.ctes validate constraint ctes_transportadora_id_fkey;
create index if not exists ctes_transportadora_id_idx on public.ctes (transportadora_id);
alter table public.ctes add constraint ctes_unidade_id_fkey foreign key (unidade_id) references public.unidades(id) on delete set null not valid;
alter table public.ctes validate constraint ctes_unidade_id_fkey;
create index if not exists ctes_unidade_id_idx on public.ctes (unidade_id);
alter table public.ctes add constraint ctes_nfe_recebida_id_fkey foreign key (nfe_recebida_id) references public.nfe_recebidas(id) on delete set null not valid;
alter table public.ctes validate constraint ctes_nfe_recebida_id_fkey;
create index if not exists ctes_nfe_recebida_id_idx on public.ctes (nfe_recebida_id);
alter table public.ctes add constraint ctes_nota_fiscal_id_fkey foreign key (nota_fiscal_id) references public.notas_fiscais(id) on delete set null not valid;
alter table public.ctes validate constraint ctes_nota_fiscal_id_fkey;
create index if not exists ctes_nota_fiscal_id_idx on public.ctes (nota_fiscal_id);
alter table public.baixas_estoque add constraint baixas_estoque_movimento_id_fkey foreign key (movimento_id) references public.estoque_movimentos(id) on delete set null not valid;
alter table public.baixas_estoque validate constraint baixas_estoque_movimento_id_fkey;
create index if not exists baixas_estoque_movimento_id_idx on public.baixas_estoque (movimento_id);
alter table public.extrato_importacoes add constraint extrato_importacoes_email_id_fkey foreign key (email_id) references public.emails(id) on delete set null not valid;
alter table public.extrato_importacoes validate constraint extrato_importacoes_email_id_fkey;
create index if not exists extrato_importacoes_email_id_idx on public.extrato_importacoes (email_id);

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke insert, update, delete on tables from anon;
