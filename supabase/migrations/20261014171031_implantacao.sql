-- Implantação do ERP (troca do Tiny pelo ERP Line): etapas com prazo, responsável e situação, e os indicadores
-- de uso calculados no banco (quem entrou, notas emitidas pelo ERP x Tiny, vendas, contas, conferência do banco,
-- estoque contado e cadastros incompletos). Só acrescenta: tabela nova, políticas e duas funções.

create table if not exists public.implantacao_etapas (
  id uuid primary key default gen_random_uuid(),
  fase int not null,
  ordem int not null default 0,
  titulo text not null,
  detalhe text,
  prazo date,
  responsavel text,
  -- indicador automático que mostra o andamento (null = só marcar à mão)
  indicador text,
  feito_em timestamptz,
  feito_por uuid,
  feito_nome text,
  observacao text,
  created_at timestamptz not null default now()
);
alter table public.implantacao_etapas enable row level security;
do $$ begin
  create policy "erp_select" on public.implantacao_etapas for select to authenticated using (public.is_erp_user());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "erp_insert" on public.implantacao_etapas for insert to authenticated with check (public.is_erp_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "erp_update" on public.implantacao_etapas for update to authenticated using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));
exception when duplicate_object then null; end $$;

-- quem marcou como feito (e quando) vem do banco, não da tela
create or replace function public.trg_implantacao_feito()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.feito_em is not null and old.feito_em is null then
    new.feito_em := now();
    new.feito_por := auth.uid();
    new.feito_nome := (select nome from usuarios_erp where user_id = auth.uid());
  elsif new.feito_em is null then
    new.feito_por := null;
    new.feito_nome := null;
  end if;
  return new;
end $$;
revoke execute on function public.trg_implantacao_feito() from public, anon;
do $$ begin
  create trigger trg_implantacao_feito before update on public.implantacao_etapas
    for each row execute function public.trg_implantacao_feito();
exception when duplicate_object then null; end $$;

-- Indicadores de uso do ERP (contagens; nada de dado pessoal além do nome e papel de quem usa o ERP)
create or replace function public.implantacao_indicadores()
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare r jsonb;
begin
  if not public.is_erp_user() then raise exception 'acesso negado'; end if;
  select jsonb_build_object(
    'usuarios', (select coalesce(jsonb_agg(jsonb_build_object('nome', u.nome, 'papel', u.papel, 'ultimo_login', a.last_sign_in_at) order by a.last_sign_in_at desc nulls last), '[]')
                   from usuarios_erp u left join auth.users a on a.id = u.user_id where u.ativo),
    'notas_erp_14d', (select count(*) from notas_fiscais where origem = 'erp' and status = 'autorizada' and coalesce(ambiente, 'producao') = 'producao'
                        and excluida_em is null and created_at > now() - interval '14 days'),
    'notas_tiny_14d', (select count(*) from notas_fiscais where origem = 'importada' and status = 'autorizada'
                         and excluida_em is null and created_at > now() - interval '14 days'),
    'notas_tiny_ultima', (select max(created_at) from notas_fiscais where origem = 'importada'),
    'notas_erp_ultima', (select max(created_at) from notas_fiscais where origem = 'erp' and status = 'autorizada' and coalesce(ambiente, 'producao') = 'producao'),
    'pedidos_7d', (select count(*) from pedidos where created_at > now() - interval '7 days' and status <> 'cancelado'),
    'pedidos_30d', (select count(*) from pedidos where created_at > now() - interval '30 days' and status <> 'cancelado'),
    'contas_7d', (select count(*) from contas_pagar where created_at > now() - interval '7 days')
                 + (select count(*) from contas_receber where created_at > now() - interval '7 days'),
    'extrato_30d', (select count(*) from extrato_lancamentos where data > current_date - 30),
    'extrato_conciliado_30d', (select count(*) from extrato_lancamentos where data > current_date - 30 and status = 'conciliado'),
    'os_30d', (select count(*) from ordens_servico where created_at > now() - interval '30 days'),
    'op_30d', (select count(*) from ordens_producao where created_at > now() - interval '30 days'),
    'estoque_itens', (select count(*) from produtos where ativo and tipo in ('peca', 'insumo', 'acessorio') and not coalesce(kit, false)),
    'estoque_contados_60d', (select count(distinct ci.produto_id) from contagem_itens ci join contagens_estoque c on c.id = ci.contagem_id
                               where c.status = 'concluida' and c.concluida_em > now() - interval '60 days'),
    'pecas_sem_custo', (select count(*) from produtos where ativo and vendavel and tipo = 'peca' and not coalesce(kit, false) and coalesce(preco_custo, 0) = 0),
    'insumos_sem_custo', (select count(*) from produtos where ativo and tipo = 'insumo' and coalesce(preco_custo, 0) = 0),
    'sem_ncm', (select count(*) from produtos where ativo and tipo <> 'servico' and nullif(btrim(ncm), '') is null),
    'clientes_sem_doc', (select count(*) from clientes where nullif(regexp_replace(coalesce(cpf_cnpj, ''), '\D', '', 'g'), '') is null),
    'clientes_sem_telefone', (select count(*) from clientes where coalesce(nullif(btrim(telefone), ''), nullif(btrim(whatsapp), '')) is null),
    'clientes_sem_uf', (select count(*) from clientes where nullif(btrim(uf), '') is null),
    'fornecedores_sem_cnpj', (select count(*) from fornecedores where nullif(btrim(cnpj), '') is null)
  ) into r;
  return r;
end $$;
revoke execute on function public.implantacao_indicadores() from public, anon;
grant execute on function public.implantacao_indicadores() to authenticated;

-- Plano proposto (datas e responsáveis podem ser mudados na tela)
insert into public.implantacao_etapas (fase, ordem, titulo, detalhe, prazo, responsavel, indicador)
select * from (values
  (1, 1, 'Cada pessoa entra no ERP pelo menos uma vez', 'Vendas, assistência, contador e financeiro com o próprio usuário (sem senha emprestada).', date '2026-10-17', 'Administrador', 'usuarios'),
  (1, 2, 'Apagar os dados de teste', 'Vendas, notas e contas criadas só para testar saem do ERP antes do uso de verdade.', date '2026-10-17', 'Administrador', null),
  (1, 3, 'Treino rápido por área (30 minutos cada)', 'Vendas, financeiro, fábrica e assistência: o caminho do dia a dia de cada um.', date '2026-10-23', 'Administrador', null),
  (1, 4, 'Contador valida as regras de imposto', 'Conferir as regras de tributação e uma nota de cada tipo: venda, remessa, devolução e transferência SC↔SP.', date '2026-10-24', 'Contador', null),
  (1, 5, 'Inventário do estoque (SC e SP)', 'Contar as peças e insumos em Estoque → Contagem; o ERP ajusta o saldo com o motivo.', date '2026-10-24', 'Fábrica', 'estoque_contado'),
  (1, 6, 'Custo de todas as peças e insumos', 'Sem custo não há margem certa nem custo das máquinas pela ficha técnica.', date '2026-10-24', 'Financeiro', 'custos'),
  (1, 7, 'NCM em todos os produtos', 'Os insumos sem NCM travam a nota de remessa e de devolução.', date '2026-10-24', 'Financeiro', 'ncm'),
  (1, 8, 'Clientes com CPF/CNPJ, telefone e estado', 'Necessário para a nota, a cobrança e o WhatsApp.', date '2026-10-28', 'Vendas', 'clientes'),
  (1, 9, 'Fornecedores com CNPJ', 'Necessário para lançar a nota de compra e pagar com segurança.', date '2026-10-28', 'Financeiro', 'fornecedores'),
  (2, 1, 'Toda venda nasce no ERP', 'Orçamento → pedido → aprovação no ERP; o Tiny fica só para consulta.', date '2026-10-29', 'Vendas', 'pedidos'),
  (2, 2, 'Notas fiscais só pelo ERP', 'Nenhuma nota nova emitida no Tiny a partir desta data.', date '2026-10-29', 'Financeiro', 'notas_erp'),
  (2, 3, 'Contas a receber e cobrança pelo ERP', 'As parcelas nascem da venda; a régua de cobrança avisa o cliente.', date '2026-10-29', 'Financeiro', 'contas'),
  (2, 4, 'Conferência diária do banco', 'Extrato do Inter (ou OFX) conferido com as contas todo dia.', date '2026-11-03', 'Financeiro', 'extrato'),
  (2, 5, 'Duas semanas com 100% das notas pelo ERP', 'Critério para seguir para a próxima fase.', date '2026-11-11', 'Administrador', 'notas_erp'),
  (3, 1, 'Compras e reposição pelo ERP', 'Pedido de compra, cotação e recebimento com entrada no estoque.', date '2026-11-25', 'Fábrica', null),
  (3, 2, 'Produção com ordem de produção', 'A OP baixa as peças da ficha técnica e coloca a máquina no estoque.', date '2026-11-25', 'Fábrica', 'producao'),
  (3, 3, 'Estoque SC e SP com transferências', 'Toda mercadoria que muda de unidade sai por transferência (com a nota).', date '2026-12-02', 'Fábrica', null),
  (3, 4, 'Assistência com OS e nota de serviço', 'Entrada, laudo, peças, entrega e NFS-e pelo ERP.', date '2026-12-02', 'Assistência', 'os'),
  (4, 1, 'Desligar o Tiny', 'Baixar o histórico final do Tiny e cancelar a assinatura.', date '2026-12-10', 'Administrador', null)
) as v(fase, ordem, titulo, detalhe, prazo, responsavel, indicador)
where not exists (select 1 from public.implantacao_etapas);
