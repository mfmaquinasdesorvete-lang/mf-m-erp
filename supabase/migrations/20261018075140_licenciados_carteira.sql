-- Carteira My Frost Sorveterias · Licenciados (pelo sorvete no fim do menu, só para o administrador): as lojas
-- licenciadas e o que cada uma pagou — licença, mensalidade, royalties, máquina… —, como o painel pessoal: cada linha é
-- de quem a criou e só essa pessoa lê; o contador e os outros usuários não enxergam nada. MF ≠ My Frost: nada daqui
-- entra no DRE, na conciliação ou nos painéis da MF. Os pagamentos vêm das entradas altas dos extratos pessoais e das
-- vendas altas no cartão das InfinitePay (a pessoa confere e liga cada uma à loja) ou são lançados à mão.
-- Nada é apagado: pagamento errado é anulado; loja encerrada fica como encerrada.

create table if not exists public.licenciados_lojas (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users(id),
  nome text not null check (length(btrim(nome)) between 2 and 120),
  cidade text check (cidade is null or length(cidade) <= 80),
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  responsavel text check (responsavel is null or length(responsavel) <= 120),
  documento text check (documento is null or documento ~ '^[0-9]{11}$|^[0-9]{14}$'),
  telefone text check (telefone is null or length(telefone) <= 30),
  -- como o nome aparece nos extratos (o Itaú corta em 7 letras: "PIX TRANSF FULANO 08/09")
  nomes_extrato text[] not null default '{}' check (cardinality(nomes_extrato) <= 20),
  cliente_id uuid references public.clientes(id) on delete set null,
  situacao text not null default 'ativa' check (situacao in ('negociando', 'implantacao', 'ativa', 'pausada', 'encerrada')),
  inicio date,
  valor_combinado numeric(14, 2) check (valor_combinado is null or valor_combinado >= 0),
  mensalidade numeric(14, 2) check (mensalidade is null or mensalidade >= 0),
  cor text check (cor is null or length(cor) <= 20),
  observacoes text check (observacoes is null or length(observacoes) <= 1000),
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);
comment on table public.licenciados_lojas is 'Carteira My Frost Sorveterias: lojas licenciadas (só o dono lê; fora da MF e do contador)';
comment on column public.licenciados_lojas.nomes_extrato is 'Textos que identificam a loja no extrato (ex.: o nome cortado do Pix no Itaú); a tela sugere a loja por eles';
comment on column public.licenciados_lojas.valor_combinado is 'Total combinado da licença (para mostrar quanto já foi pago e quanto falta)';

create table if not exists public.licenciados_pagamentos (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users(id),
  loja_id uuid references public.licenciados_lojas(id),
  data date not null,
  valor numeric(14, 2) not null check (valor > 0),
  taxa numeric(14, 2) not null default 0 check (taxa >= 0),
  tipo text not null default 'licenca' check (tipo in ('licenca', 'mensalidade', 'royalties', 'maquina', 'insumos', 'marketing', 'outro')),
  forma text not null default 'pix' check (forma in ('pix', 'cartao', 'ted', 'boleto', 'dinheiro', 'outro')),
  -- de onde veio: lançado à mão, do extrato pessoal (pessoal_lancamentos) ou da venda no cartão da InfinitePay (contas_receber)
  origem text not null default 'manual' check (origem in ('manual', 'pessoal', 'infinitepay')),
  origem_id uuid,
  onde text check (onde is null or length(onde) <= 80),
  descricao text check (descricao is null or length(descricao) <= 300),
  observacao text check (observacao is null or length(observacao) <= 500),
  -- "não é de loja": a entrada sai das sugestões sem virar pagamento
  descartado boolean not null default false,
  anulado boolean not null default false,
  criado_em timestamptz not null default now(),
  check (descartado or loja_id is not null),
  check (origem = 'manual' or origem_id is not null)
);
comment on table public.licenciados_pagamentos is 'Carteira My Frost Sorveterias: o que cada loja licenciada pagou (só o dono lê; fora da MF e do contador)';
comment on column public.licenciados_pagamentos.descartado is 'Entrada conferida que não é de loja (sai das sugestões)';
create index if not exists licenciados_pagamentos_loja_idx on public.licenciados_pagamentos (loja_id, data);
create index if not exists licenciados_pagamentos_origem_idx on public.licenciados_pagamentos (origem, origem_id) where origem_id is not null;

alter table public.licenciados_lojas enable row level security;
alter table public.licenciados_pagamentos enable row level security;
revoke all on public.licenciados_lojas, public.licenciados_pagamentos from anon, public;
-- sem apagar: loja encerrada muda a situação; pagamento errado é anulado
grant select, insert, update on public.licenciados_lojas, public.licenciados_pagamentos to authenticated;
create policy licenciados_lojas_ler on public.licenciados_lojas for select to authenticated using (dono = auth.uid());
create policy licenciados_lojas_criar on public.licenciados_lojas for insert to authenticated with check (dono = auth.uid());
create policy licenciados_lojas_mudar on public.licenciados_lojas for update to authenticated using (dono = auth.uid()) with check (dono = auth.uid());
create policy licenciados_pagamentos_ler on public.licenciados_pagamentos for select to authenticated using (dono = auth.uid());
create policy licenciados_pagamentos_criar on public.licenciados_pagamentos for insert to authenticated
  with check (dono = auth.uid() and (loja_id is null or exists (select 1 from public.licenciados_lojas l where l.id = loja_id and l.dono = auth.uid())));
create policy licenciados_pagamentos_mudar on public.licenciados_pagamentos for update to authenticated
  using (dono = auth.uid())
  with check (dono = auth.uid() and (loja_id is null or exists (select 1 from public.licenciados_lojas l where l.id = loja_id and l.dono = auth.uid())));
