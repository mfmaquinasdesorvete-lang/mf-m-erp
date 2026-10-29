-- FAZ (27/10/2026, parte 6 em 29/10): tudo o que falta no banco e só roda pelo SQL Editor do Supabase.
-- Como rodar: Supabase → SQL Editor → New query → colar este arquivo inteiro → Run.
-- Se aparecer o aviso de "operação destrutiva" (por causa dos drop index), confirmar: só apaga 3 índices repetidos.
-- Pode rodar de novo sem problema: cada parte confere se já existe.
-- Cada parte é a cópia de um arquivo de supabase/migrations/ (o arquivo de origem está no título).

-- =====================================================================
-- 1) GER — Prazos e padrões em Configurações (20261101000156_config_ajustes.sql)
-- =====================================================================
-- Ajustes do negócio editáveis em Configurações (pedido de 24/10, .claude/configuravel): prazos e padrões (números) e
-- mensagens ao cliente (textos com variáveis). O catálogo (nome, explicação e valor padrão) fica no código, em
-- supabase/functions/_shared/ajustes.ts; aqui fica só o que a usuária mudou. Sem linha = vale o padrão.
create table if not exists public.config_ajustes (
  chave text primary key check (chave ~ '^[a-z0-9_]+$'),
  valor numeric,
  assunto text,
  texto text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  atualizado_nome text
);
alter table public.config_ajustes enable row level security;
drop policy if exists config_ajustes_ler on public.config_ajustes;
create policy config_ajustes_ler on public.config_ajustes for select to authenticated using ((select public.is_erp_user()));
revoke insert, update, delete on public.config_ajustes from anon, authenticated;

-- Gravar (só o administrador, como o resto de Configurações). Tudo nulo = voltar ao padrão (apaga a linha).
create or replace function public.config_ajuste_salvar(p_chave text, p_valor numeric default null, p_assunto text default null, p_texto text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_erp_admin() then raise exception 'só o administrador muda as configurações'; end if;
  if p_chave is null or p_chave !~ '^[a-z0-9_]+$' then raise exception 'ajuste inválido'; end if;
  if length(coalesce(p_texto, '')) > 4000 or length(coalesce(p_assunto, '')) > 200 then raise exception 'texto grande demais'; end if;
  if p_valor is null and nullif(trim(coalesce(p_assunto, '')), '') is null and nullif(trim(coalesce(p_texto, '')), '') is null then
    delete from public.config_ajustes where chave = p_chave;
    return;
  end if;
  insert into public.config_ajustes (chave, valor, assunto, texto, atualizado_em, atualizado_por, atualizado_nome)
  values (p_chave, p_valor, nullif(trim(p_assunto), ''), nullif(trim(p_texto), ''), now(), auth.uid(),
          (select nome from public.usuarios_erp where user_id = auth.uid()))
  on conflict (chave) do update set valor = excluded.valor, assunto = excluded.assunto, texto = excluded.texto,
    atualizado_em = now(), atualizado_por = excluded.atualizado_por, atualizado_nome = excluded.atualizado_nome;
end $$;
revoke all on function public.config_ajuste_salvar(text, numeric, text, text) from public, anon;
grant execute on function public.config_ajuste_salvar(text, numeric, text, text) to authenticated;

-- Leitura no banco: o número que ela gravou ou o padrão (o MESMO de ajustes.ts; o teste ajustes.test.ts confere).
-- Sem security definer: quem chama lê pela regra da tabela (usuário do ERP); funções do servidor leem como service_role.
create or replace function public.cfg_num(p_chave text, p_padrao numeric)
returns numeric language sql stable set search_path = public as $$
  select coalesce((select valor from public.config_ajustes where chave = p_chave), p_padrao)
$$;
revoke all on function public.cfg_num(text, numeric) from public, anon;
grant execute on function public.cfg_num(text, numeric) to authenticated, service_role;

-- =====================================================================
-- 2) FUN — recibos de funcionário só na área de Funcionários (20261101000170_recibos_de_funcionario.sql)
-- =====================================================================
-- Recibos de funcionário (26/10): ficam só na área de Funcionários e só admin e financeiro leem (como o resto do RH).
-- É de funcionário o recibo de pagamento de conta da folha/pró-labore ou cujo recebedor está no cadastro de funcionários.
alter table public.recibos add column if not exists de_funcionario boolean not null default false;
comment on column public.recibos.de_funcionario is 'Recibo de pagamento a funcionário: aparece em Funcionários → Recibos e só admin e financeiro leem.';

-- gatilho security definer: quem emite o recibo (vendas, por exemplo) não lê funcionarios, mas a marca precisa sair certa
create or replace function public.trg_recibo_de_funcionario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.de_funcionario := new.tipo = 'pagamento' and (
    exists (select 1 from contas_pagar c where c.id = new.conta_pagar_id and c.categoria in ('folha', 'pró-labore'))
    or exists (select 1 from funcionarios f where lower(btrim(f.nome)) = lower(btrim(coalesce(new.recebedor_nome, ''))))
  );
  return new;
end $$;
drop trigger if exists trg_recibo_de_funcionario on public.recibos;
create trigger trg_recibo_de_funcionario before insert or update of tipo, conta_pagar_id, recebedor_nome on public.recibos
  for each row execute function public.trg_recibo_de_funcionario();

-- marca os que já existem
update public.recibos r set de_funcionario = r.tipo = 'pagamento' and (
  exists (select 1 from public.contas_pagar c where c.id = r.conta_pagar_id and c.categoria in ('folha', 'pró-labore'))
  or exists (select 1 from public.funcionarios f where lower(btrim(f.nome)) = lower(btrim(coalesce(r.recebedor_nome, ''))))
);

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recibos' and policyname = 'recibo_funcionario_restrito') then
    create policy "recibo_funcionario_restrito" on public.recibos as restrictive for all to authenticated
      using (not de_funcionario or (select public.tem_papel('financeiro')))
      with check (not de_funcionario or (select public.tem_papel('financeiro')));
  end if;
end $$;

-- =====================================================================
-- 3) ELO — tabela da aba Sobre → Páginas (20261101000173_paginas_claude.sql). As 16 páginas o ELO grava depois.
-- =====================================================================
-- Páginas do Claude (pedido de 27/10): as páginas que os chats fizeram para a usuária (análises, painéis, planos,
-- manuais), com o link para abrir. Aparece em Sobre → Conhecer o ERP → Páginas, só para o administrador. O link só
-- abre para quem a dona compartilhou. Os links ficam aqui no banco e não no código, porque o repositório é público.
create table if not exists public.paginas_claude (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  link text not null unique,
  descricao text,
  assunto text not null default 'Análises',
  feita_em date not null default current_date,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.paginas_claude enable row level security;
drop policy if exists paginas_claude_admin on public.paginas_claude;
create policy paginas_claude_admin on public.paginas_claude for select using (is_erp_admin());
revoke all on public.paginas_claude from anon;
grant select on public.paginas_claude to authenticated;

-- =====================================================================
-- 4) PRD — regra das variações de produto (20261101000140_produto_variacoes.sql)
-- =====================================================================
-- =====================================================================
-- Produtos com variações (parte 3, AINDA NÃO APLICADA): a regra no banco que impede variação de variação e pai que não
-- é pai, e deixa o pai como "não vende". Os campos já estão em 20261025021635 e 20261025021646.
-- Aplicar por migração com calma: criar gatilho em public.produtos pela API costuma travar.
-- =====================================================================
-- o pai é um agrupador e não pode ser variação de outro; a variação não pode ser pai
create or replace function public.trg_produto_variacao() returns trigger language plpgsql set search_path = public as $$
begin
  if new.produto_pai_id is not null then
    if new.produto_pai_id = new.id then raise exception 'o produto não pode ser variação dele mesmo'; end if;
    if new.agrupador then raise exception 'um produto pai não pode ser variação de outro'; end if;
    if not exists (select 1 from produtos where id = new.produto_pai_id and agrupador) then
      raise exception 'escolha como pai um produto marcado "produto pai (tem variações)"';
    end if;
  end if;
  if new.agrupador then new.vendavel := false; end if;
  return new;
end $$;
drop trigger if exists produto_variacao on public.produtos;
create trigger produto_variacao before insert or update of produto_pai_id, agrupador on public.produtos
  for each row execute function public.trg_produto_variacao();

-- =====================================================================
-- 5) REV — banco mais rápido, parte 2: 3 índices repetidos (20261101000081_banco_mais_rapido.sql)
-- =====================================================================
-- 2) Índices repetidos (o mesmo índice duas vezes só pesa na gravação)
drop index if exists public.nfe_custos_itens_produto_idx;
drop index if exists public.nfe_oc_baixas_pedido_idx;
drop index if exists public.notas_fiscais_cliente_idx;

-- =====================================================================
-- 6) IAD — 17 IAs voltam para "fazendo" até o teste com tarefa real; o robô do WhatsApp fica para depois (29/10)
-- =====================================================================
update public.pedidos_checklist set situacao = case when id::text like '725e9c15%' then situacao else 'fazendo' end,
  detalhe = case when id::text like '725e9c15%' then 'Fica para depois da rodada de fechamento: depende de ligar o número fixo na conta oficial da Meta (WhatsApp Business API).'
            else 'No ar; falta o teste com uma tarefa real (rodada de fechamento 27/10). Lista dos testes na MEMORY.md do IAD.' end
where id::text like '725e9c15%' or id in ('f26aeea6-f469-435b-b89f-f32b927cc37e','48893310-6fc7-4dd0-9178-71b3cf661ede','7becaa2f-6203-413c-b7b2-9591bf8b57ec','4f3c317e-093a-43fc-ab8b-67ed049a1049','8b91caad-d2b4-411e-a061-fced7fb18716','ff312363-a635-4419-9b89-ceb01fb8189d','0d403685-f3d7-4ed6-a4b3-4a62eb3bb264','158cf553-b3a1-4b81-9a3e-0cea84dbb55a','9e4b8114-cdec-4519-b149-80d6258691d9','b8f7d330-726c-4619-a217-48870a5b9d3f','e946bef6-d46f-47ba-bac2-5a81292cdf7a','99a4c607-fbd1-463c-b048-11a6fd502c59','e175ef8c-1b82-4f63-ae9b-3faee489eafe','976206dc-3bb4-4a8c-970a-f66fb7a20e47','7d5533f1-587c-4019-ba96-db6996840cde','63e76ee8-0b45-47da-a5a9-4b3b27fd2534','b12b4aba-0c63-4e73-b234-498879f9c577');

-- Conferência (o FAZ confere sozinho depois): as 4 colunas devem dar "true".
select (to_regclass('public.config_ajustes') is not null)::text as config_ajustes_ok,
       (to_regclass('public.paginas_claude') is not null)::text as paginas_ok,
       exists (select 1 from pg_trigger where tgname = 'produto_variacao')::text as variacoes_ok,
       exists (select 1 from information_schema.columns where table_name = 'recibos' and column_name = 'de_funcionario')::text as recibos_ok;
