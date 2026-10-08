-- =====================================================================
-- Fiscal avançado
--   * regras de tributação (ICMS, IPI, PIS, COFINS e CFOP) por operação,
--     destino, tipo de cliente, produto, NCM, origem e CFOP
--   * carta de correção eletrônica (CC-e) e inutilização de numeração
--   * contingência: se a SEFAZ/Focus estiver fora, a nota fica na fila e
--     é reenviada sozinha (a Focus usa a SVC quando a SEFAZ declara contingência)
-- =====================================================================

create table public.regras_tributacao (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  prioridade int not null default 100,          -- menor = vale primeiro
  -- condições (vazio = qualquer)
  unidade_id uuid references public.unidades(id) on delete cascade,
  operacao text check (operacao in ('venda', 'transferencia')),
  destino text check (destino in ('interna', 'interestadual')),
  tipo_cliente text check (tipo_cliente in ('contribuinte', 'nao_contribuinte')),
  tipo_produto text check (tipo_produto in ('maquina', 'peca', 'acessorio', 'insumo')),
  ncm_prefixo text,
  origem_mercadoria text check (origem_mercadoria in ('nacional', 'importada')),
  cfop text,
  -- resultado (vazio = cálculo padrão da unidade)
  cfop_saida text,
  icms_cst text, icms_aliquota numeric(5,2), icms_reducao_base numeric(5,2), difal boolean,
  ipi_cst text, ipi_aliquota numeric(5,2), ipi_enquadramento text,
  pis_cst text, pis_aliquota numeric(5,2), cofins_cst text, cofins_aliquota numeric(5,2),
  observacao_nfe text,                          -- vai nas informações complementares da nota
  created_at timestamptz not null default now()
);
alter table public.regras_tributacao enable row level security;
create policy "erp_select" on public.regras_tributacao for select to authenticated using (public.is_erp_user());
create policy "fiscal_write" on public.regras_tributacao for all to authenticated
  using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));

-- Exemplos desligados, para o contador conferir e ativar
insert into public.regras_tributacao (nome, ativo, prioridade, operacao, destino, tipo_cliente, observacao_nfe) values
  ('Venda interestadual para consumidor final (DIFAL)', false, 50, 'venda', 'interestadual', 'nao_contribuinte',
   'DIFAL recolhido conforme EC 87/2015 e LC 190/2022.'),
  ('Peças importadas (4%)', false, 60, 'venda', 'interestadual', null, 'Mercadoria importada - Resolução do Senado 13/2012.');
update public.regras_tributacao set origem_mercadoria = 'importada', tipo_produto = 'peca', observacao_nfe = null,
  icms_aliquota = 4 where nome = 'Peças importadas (4%)';

-- ---------------------------------------------------------------------
-- Contingência / fila de reenvio
-- ---------------------------------------------------------------------
alter table public.notas_fiscais drop constraint if exists notas_fiscais_status_check;
alter table public.notas_fiscais add constraint notas_fiscais_status_check
  check (status in ('processando', 'autorizada', 'erro', 'cancelada', 'contingencia', 'denegada'));
alter table public.notas_fiscais add column tentativas int not null default 0;

-- ---------------------------------------------------------------------
-- Carta de correção (CC-e): até 20 por nota, só para notas autorizadas
-- ---------------------------------------------------------------------
create table public.nfe_cartas_correcao (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references public.notas_fiscais(id) on delete cascade,
  sequencia int,
  correcao text not null check (length(correcao) between 15 and 1000),
  status text not null default 'processando' check (status in ('processando', 'autorizada', 'erro')),
  mensagem text,
  pdf_url text,
  xml_url text,
  resposta jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.nfe_cartas_correcao enable row level security;
create policy "erp_select" on public.nfe_cartas_correcao for select to authenticated using (public.tem_papel('vendas', 'financeiro'));

-- ---------------------------------------------------------------------
-- Inutilização de numeração (números pulados que nunca viraram nota)
-- ---------------------------------------------------------------------
create table public.nfe_inutilizacoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  serie int not null,
  numero_inicial int not null,
  numero_final int not null check (numero_final >= numero_inicial),
  justificativa text not null check (length(justificativa) between 15 and 255),
  status text not null default 'processando' check (status in ('processando', 'autorizada', 'erro')),
  mensagem text,
  xml_url text,
  resposta jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.nfe_inutilizacoes enable row level security;
create policy "erp_select" on public.nfe_inutilizacoes for select to authenticated using (public.tem_papel('vendas', 'financeiro'));
