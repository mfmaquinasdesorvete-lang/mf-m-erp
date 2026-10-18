-- Painel pessoal, parte 2 (tudo só do dono, como pessoal_contas e pessoal_lancamentos: o contador e os outros usuários
-- não enxergam nada):
--  · pessoal_regras: "o que tiver este texto no extrato vai para este card" (com nome próprio, observação e meta, ex.:
--    empréstimo de 3 x R$ 7 mil). Os nomes de pessoas e empresas ficam aqui, nunca no código.
--  · pessoal_conexoes: as contas do Meu Pluggy (Open Finance pessoal, gratuito) ligadas às contas do painel; a função
--    pessoal-pluggy busca os lançamentos novos uma vez por dia, sem repetir o que já entrou pelo OFX ou PDF.
--  · pessoal_enderecos: os endereços onde a pessoa morou, com as lembranças.
--  · pessoal_empresas: as empresas (CNPJ) em que é ou já foi sócia, com os dados públicos da Receita.

create table if not exists public.pessoal_regras (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users(id),
  texto text not null check (length(btrim(texto)) between 2 and 300),
  card text not null check (length(btrim(card)) between 2 and 60),
  rotulo text check (rotulo is null or length(rotulo) <= 60),
  sentido text not null default 'ambos' check (sentido in ('saida', 'entrada', 'ambos')),
  da_empresa boolean not null default false,
  observacao text check (observacao is null or length(observacao) <= 300),
  meta_total numeric(14, 2) check (meta_total is null or meta_total > 0),
  parcelas int check (parcelas is null or parcelas between 1 and 360),
  ativa boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

create table if not exists public.pessoal_conexoes (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users(id),
  item_id text not null check (item_id ~ '^[0-9a-f-]{36}$'),
  conta_externa_id text not null check (conta_externa_id ~ '^[0-9a-f-]{36}$'),
  conta_id uuid not null references public.pessoal_contas(id),
  instituicao text check (instituicao is null or length(instituicao) <= 80),
  nome_externo text check (nome_externo is null or length(nome_externo) <= 120),
  desde date not null,
  ativa boolean not null default true,
  sincronizado_em timestamptz,
  ultimas_novas int,
  saldo_banco numeric(14, 2),
  erro text,
  criado_em timestamptz not null default now(),
  unique (dono, conta_externa_id)
);

create table if not exists public.pessoal_enderecos (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users(id),
  endereco text not null check (length(btrim(endereco)) between 5 and 300),
  lembranca text check (lembranca is null or length(lembranca) <= 1000),
  periodo text check (periodo is null or length(periodo) <= 40),
  atual boolean not null default false,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

create table if not exists public.pessoal_empresas (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users(id),
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  razao_social text check (razao_social is null or length(razao_social) <= 200),
  nome_fantasia text check (nome_fantasia is null or length(nome_fantasia) <= 200),
  situacao text check (situacao is null or length(situacao) <= 40),
  data_situacao date,
  abertura date,
  natureza text check (natureza is null or length(natureza) <= 120),
  porte text check (porte is null or length(porte) <= 60),
  cnae text check (cnae is null or length(cnae) <= 200),
  municipio text check (municipio is null or length(municipio) <= 80),
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  capital_social numeric(16, 2),
  qualificacao text check (qualificacao is null or length(qualificacao) <= 80),
  entrada date,
  saida date,
  lembranca text check (lembranca is null or length(lembranca) <= 1000),
  fonte text check (fonte is null or length(fonte) <= 300),
  conferido_em timestamptz,
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  unique (dono, cnpj)
);

alter table public.pessoal_regras enable row level security;
alter table public.pessoal_conexoes enable row level security;
alter table public.pessoal_enderecos enable row level security;
alter table public.pessoal_empresas enable row level security;
revoke all on public.pessoal_regras, public.pessoal_conexoes, public.pessoal_enderecos, public.pessoal_empresas from anon, public;
grant select, insert, update, delete on public.pessoal_regras, public.pessoal_enderecos, public.pessoal_empresas to authenticated;
-- a conexão é criada e atualizada pela função (que confere o dono); a tela só lê e liga/desliga
grant select on public.pessoal_conexoes to authenticated;
grant update (ativa) on public.pessoal_conexoes to authenticated;

create policy pessoal_regras_ler on public.pessoal_regras for select to authenticated using (dono = auth.uid());
create policy pessoal_regras_criar on public.pessoal_regras for insert to authenticated with check (dono = auth.uid());
create policy pessoal_regras_mudar on public.pessoal_regras for update to authenticated using (dono = auth.uid()) with check (dono = auth.uid());
create policy pessoal_regras_tirar on public.pessoal_regras for delete to authenticated using (dono = auth.uid());

create policy pessoal_conexoes_ler on public.pessoal_conexoes for select to authenticated using (dono = auth.uid());
create policy pessoal_conexoes_mudar on public.pessoal_conexoes for update to authenticated using (dono = auth.uid()) with check (dono = auth.uid());

create policy pessoal_enderecos_ler on public.pessoal_enderecos for select to authenticated using (dono = auth.uid());
create policy pessoal_enderecos_criar on public.pessoal_enderecos for insert to authenticated with check (dono = auth.uid());
create policy pessoal_enderecos_mudar on public.pessoal_enderecos for update to authenticated using (dono = auth.uid()) with check (dono = auth.uid());
create policy pessoal_enderecos_tirar on public.pessoal_enderecos for delete to authenticated using (dono = auth.uid());

create policy pessoal_empresas_ler on public.pessoal_empresas for select to authenticated using (dono = auth.uid());
create policy pessoal_empresas_criar on public.pessoal_empresas for insert to authenticated with check (dono = auth.uid());
create policy pessoal_empresas_mudar on public.pessoal_empresas for update to authenticated using (dono = auth.uid()) with check (dono = auth.uid());
create policy pessoal_empresas_tirar on public.pessoal_empresas for delete to authenticated using (dono = auth.uid());

-- uma vez por dia (o Meu Pluggy atualiza os bancos a cada 24 horas): 7h23 de Brasília
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'erp-pessoal-pluggy') then
    perform cron.schedule('erp-pessoal-pluggy', '23 10 * * *', $c$ select public.chamar_funcao('pessoal-pluggy', '{"acao":"sincronizar"}'::jsonb, 120000)
      where exists (select 1 from public.pessoal_conexoes where ativa) $c$);
  end if;
end $$;
