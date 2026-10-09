-- =====================================================================
-- Financeiro: plano de contas (categorias com a linha do DRE), centros de custo
-- (com divisão de um lançamento entre eles) e contas fixas que se lançam sozinhas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Plano de contas: cada categoria diz em que linha do DRE ela entra
-- (o nome é o que fica gravado em contas_pagar.categoria / contas_receber.categoria)
-- ---------------------------------------------------------------------
create table if not exists public.categorias_financeiras (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 2 and 60),
  tipo text not null check (tipo in ('receita', 'despesa')),
  grupo text not null check (grupo in ('receita', 'deducao', 'custo', 'despesa_operacional', 'receita_financeira',
                                       'despesa_financeira', 'outros', 'investimento', 'retirada', 'transferencia')),
  ativo boolean not null default true,
  ordem int not null default 100,
  created_at timestamptz not null default now()
);
create unique index if not exists categorias_financeiras_nome on public.categorias_financeiras (tipo, lower(btrim(nome)));
alter table public.categorias_financeiras enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categorias_financeiras' and policyname = 'cf_select') then
    create policy "cf_select" on public.categorias_financeiras for select to authenticated using (public.is_erp_user());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categorias_financeiras' and policyname = 'cf_insert') then
    create policy "cf_insert" on public.categorias_financeiras for insert to authenticated with check (public.tem_papel('financeiro'));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categorias_financeiras' and policyname = 'cf_update') then
    create policy "cf_update" on public.categorias_financeiras for update to authenticated using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));
  end if;
end $$;
create or replace trigger zz_auditoria before insert or update or delete on public.categorias_financeiras for each row execute function public.trg_auditoria();

insert into public.categorias_financeiras (nome, tipo, grupo, ordem) values
  ('vendas', 'receita', 'receita', 10),
  ('assistência técnica', 'receita', 'receita', 20),
  ('receitas financeiras', 'receita', 'receita_financeira', 80),
  ('outras receitas', 'receita', 'outros', 90),
  ('impostos', 'despesa', 'deducao', 10),
  ('fornecedores', 'despesa', 'custo', 20),
  ('frete', 'despesa', 'custo', 30),
  ('comissoes', 'despesa', 'despesa_operacional', 40),
  ('folha', 'despesa', 'despesa_operacional', 41),
  ('pró-labore', 'despesa', 'despesa_operacional', 42),
  ('aluguel', 'despesa', 'despesa_operacional', 43),
  ('energia/água/internet', 'despesa', 'despesa_operacional', 44),
  ('marketing', 'despesa', 'despesa_operacional', 45),
  ('manutenção', 'despesa', 'despesa_operacional', 46),
  ('sistemas e assinaturas', 'despesa', 'despesa_operacional', 47),
  ('tarifas bancárias', 'despesa', 'despesa_financeira', 60),
  ('juros e multas', 'despesa', 'despesa_financeira', 61),
  ('outros', 'despesa', 'outros', 90),
  ('investimentos', 'despesa', 'investimento', 95),
  ('distribuição de lucros', 'despesa', 'retirada', 96)
on conflict do nothing;
-- categorias já usadas que não estão na lista entram como despesa operacional
insert into public.categorias_financeiras (nome, tipo, grupo)
select distinct btrim(categoria), 'despesa', 'despesa_operacional' from public.contas_pagar
 where coalesce(btrim(categoria), '') <> ''
on conflict do nothing;

alter table public.contas_receber add column if not exists categoria text not null default 'vendas';
update public.contas_receber set categoria = 'assistência técnica' where os_id is not null and categoria = 'vendas';

-- ---------------------------------------------------------------------
-- Centros de custo e rateio: [{ "centro_custo_id": "...", "percentual": 60 }, ...] somando 100
-- ---------------------------------------------------------------------
create table if not exists public.centros_custo (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 2 and 60),
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists centros_custo_nome on public.centros_custo (lower(btrim(nome)));
alter table public.centros_custo enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'centros_custo' and policyname = 'cc_select') then
    create policy "cc_select" on public.centros_custo for select to authenticated using (public.is_erp_user());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'centros_custo' and policyname = 'cc_insert') then
    create policy "cc_insert" on public.centros_custo for insert to authenticated with check (public.tem_papel('financeiro'));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'centros_custo' and policyname = 'cc_update') then
    create policy "cc_update" on public.centros_custo for update to authenticated using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));
  end if;
end $$;
create or replace trigger zz_auditoria before insert or update or delete on public.centros_custo for each row execute function public.trg_auditoria();

alter table public.contas_pagar add column if not exists rateio jsonb not null default '[]'::jsonb;
alter table public.contas_receber add column if not exists rateio jsonb not null default '[]'::jsonb;

create or replace function public.rateio_valido(p jsonb)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_soma numeric := 0; e jsonb; v_ids uuid[] := '{}';
begin
  if p is null or p = '[]'::jsonb then return true; end if;
  if jsonb_typeof(p) <> 'array' then return false; end if;
  for e in select * from jsonb_array_elements(p) loop
    if (e->>'centro_custo_id') is null or coalesce((e->>'percentual')::numeric, 0) <= 0 then return false; end if;
    if not exists (select 1 from centros_custo where id = (e->>'centro_custo_id')::uuid) then return false; end if;
    if (e->>'centro_custo_id')::uuid = any(v_ids) then return false; end if;
    v_ids := v_ids || (e->>'centro_custo_id')::uuid;
    v_soma := v_soma + (e->>'percentual')::numeric;
  end loop;
  return round(v_soma, 2) = 100;
exception when others then
  return false;
end $$;

create or replace function public.trg_rateio()
returns trigger language plpgsql as $$
begin
  if not public.rateio_valido(new.rateio) then
    raise exception 'divisão entre centros de custo inválida: cada centro uma vez e os percentuais somando 100%%';
  end if;
  return new;
end $$;
create or replace trigger trg_rateio before insert or update of rateio on public.contas_pagar for each row execute function public.trg_rateio();
create or replace trigger trg_rateio before insert or update of rateio on public.contas_receber for each row execute function public.trg_rateio();

-- ---------------------------------------------------------------------
-- Contas fixas (aluguel, salários, mensalidades, contratos): geram as contas sozinhas,
-- com antecedência, para entrarem no fluxo de caixa previsto
-- ---------------------------------------------------------------------
create table if not exists public.contas_recorrentes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('pagar', 'receber')),
  descricao text not null check (length(btrim(descricao)) >= 3),
  fornecedor_id uuid references public.fornecedores(id),
  cliente_id uuid references public.clientes(id),
  categoria text,
  rateio jsonb not null default '[]'::jsonb,
  valor numeric(14,2) not null check (valor > 0),
  dia_vencimento int not null check (dia_vencimento between 1 and 31),
  frequencia text not null default 'mensal' check (frequencia in ('mensal', 'bimestral', 'trimestral', 'semestral', 'anual')),
  inicio date not null default current_date,
  fim date,
  antecedencia_dias int not null default 45 check (antecedencia_dias between 0 and 120),
  unidade_id uuid references public.unidades(id),
  forma_pagamento text,
  observacoes text,
  ativo boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (fim is null or fim >= inicio)
);
alter table public.contas_recorrentes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contas_recorrentes' and policyname = 'cr_select') then
    create policy "cr_select" on public.contas_recorrentes for select to authenticated using (public.tem_papel('financeiro') or public.e_contador());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contas_recorrentes' and policyname = 'cr_insert') then
    create policy "cr_insert" on public.contas_recorrentes for insert to authenticated with check (public.tem_papel('financeiro'));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contas_recorrentes' and policyname = 'cr_update') then
    create policy "cr_update" on public.contas_recorrentes for update to authenticated using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));
  end if;
end $$;
create or replace trigger zz_auditoria before insert or update or delete on public.contas_recorrentes for each row execute function public.trg_auditoria();
create or replace trigger trg_rateio before insert or update of rateio on public.contas_recorrentes for each row execute function public.trg_rateio();

alter table public.contas_pagar add column if not exists recorrente_id uuid references public.contas_recorrentes(id);
alter table public.contas_pagar add column if not exists competencia date;
alter table public.contas_receber add column if not exists recorrente_id uuid references public.contas_recorrentes(id);
alter table public.contas_receber add column if not exists competencia date;
create unique index if not exists contas_pagar_recorrente_comp on public.contas_pagar (recorrente_id, competencia) where recorrente_id is not null;
create unique index if not exists contas_receber_recorrente_comp on public.contas_receber (recorrente_id, competencia) where recorrente_id is not null;

-- Lança as ocorrências que faltam até "hoje + antecedência" (nunca com vencimento antes do dia em que a conta fixa foi criada)
create or replace function public.gerar_recorrentes_interno(p_id uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_passo int; v_mes date; v_venc date; v_limite date; v_n int := 0; v_ok int;
begin
  for r in select * from contas_recorrentes where ativo and (p_id is null or id = p_id) loop
    v_passo := case r.frequencia when 'mensal' then 1 when 'bimestral' then 2 when 'trimestral' then 3 when 'semestral' then 6 else 12 end;
    v_limite := least(coalesce(r.fim, 'infinity'::date), current_date + r.antecedencia_dias);
    v_mes := date_trunc('month', r.inicio)::date;
    while v_mes <= v_limite loop
      v_venc := least(v_mes + (r.dia_vencimento - 1), (v_mes + interval '1 month' - interval '1 day')::date);
      if v_venc >= greatest(r.inicio, r.created_at::date) and v_venc <= v_limite then
        if r.tipo = 'pagar' then
          insert into contas_pagar (descricao, fornecedor_id, categoria, rateio, valor, vencimento, unidade_id, observacoes, recorrente_id, competencia)
          values (r.descricao || ' · ' || to_char(v_mes, 'MM/YYYY'), r.fornecedor_id, coalesce(r.categoria, 'outros'), r.rateio, r.valor, v_venc,
                  r.unidade_id, 'Conta fixa lançada pelo ERP', r.id, v_mes)
          on conflict (recorrente_id, competencia) where recorrente_id is not null do nothing;
        else
          insert into contas_receber (descricao, cliente_id, categoria, rateio, valor, vencimento, forma_pagamento, unidade_id, recorrente_id, competencia, parcela, total_parcelas)
          values (r.descricao || ' · ' || to_char(v_mes, 'MM/YYYY'), r.cliente_id, coalesce(r.categoria, 'outras receitas'), r.rateio, r.valor, v_venc,
                  coalesce(r.forma_pagamento, 'boleto'), r.unidade_id, r.id, v_mes, 1, 1)
          on conflict (recorrente_id, competencia) where recorrente_id is not null do nothing;
        end if;
        get diagnostics v_ok = row_count;
        v_n := v_n + v_ok;
      end if;
      v_mes := (v_mes + make_interval(months => v_passo))::date;
    end loop;
  end loop;
  return v_n;
end $$;
revoke execute on function public.gerar_recorrentes_interno(uuid) from public, anon, authenticated;

create or replace function public.gerar_recorrentes()
returns int language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_papel('financeiro');
  return public.gerar_recorrentes_interno(null);
end $$;
revoke execute on function public.gerar_recorrentes() from public, anon;
grant execute on function public.gerar_recorrentes() to authenticated;

-- Criou ou mudou a conta fixa: lança o que falta, atualiza as próximas em aberto e cancela as que passaram do fim
create or replace function public.trg_conta_recorrente()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tab text;
begin
  v_tab := case new.tipo when 'pagar' then 'contas_pagar' else 'contas_receber' end;
  if tg_op = 'UPDATE' then
    if new.valor <> old.valor or new.categoria is distinct from old.categoria or new.rateio <> old.rateio or new.dia_vencimento <> old.dia_vencimento then
      execute format($f$update %I set valor = $2, categoria = coalesce($3, categoria), rateio = $4,
          vencimento = least(competencia + ($5 - 1), (competencia + interval '1 month' - interval '1 day')::date),
          motivo_alteracao = 'Conta fixa alterada'
        where recorrente_id = $1 and status = 'aberto' and vencimento >= current_date$f$, v_tab)
        using new.id, new.valor, new.categoria, new.rateio, new.dia_vencimento;
    end if;
    if not new.ativo or new.fim is not null then
      execute format($f$update %I set status = 'cancelado', motivo_alteracao = $2
        where recorrente_id = $1 and status = 'aberto' and vencimento >= current_date and ($3 or vencimento > $4)$f$, v_tab)
        using new.id, case when not new.ativo then 'Conta fixa desativada' else 'Conta fixa encerrada em ' || to_char(new.fim, 'DD/MM/YYYY') end,
              not new.ativo, coalesce(new.fim, 'infinity'::date);
    end if;
  end if;
  if new.ativo then perform public.gerar_recorrentes_interno(new.id); end if;
  return new;
end $$;
create or replace trigger trg_conta_recorrente after insert or update on public.contas_recorrentes for each row execute function public.trg_conta_recorrente();

-- Lançar a partir do extrato: a entrada também recebe a categoria (receita) escolhida
create or replace function public.lancar_do_extrato(p_lanc uuid, p_categoria text, p_descricao text, p_fornecedor uuid default null, p_cliente uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare l extrato_lancamentos; v_unid uuid; v_id uuid;
begin
  perform public.exigir_papel('financeiro');
  select * into l from extrato_lancamentos where id = p_lanc for update;
  if l.status <> 'pendente' then raise exception 'esta linha do extrato já foi tratada'; end if;
  select unidade_id into v_unid from contas_bancarias where id = l.conta_bancaria_id;
  if l.valor < 0 then
    insert into contas_pagar (descricao, categoria, fornecedor_id, valor, vencimento, status, data_pagamento, valor_pago, unidade_id, conta_bancaria_id, observacoes)
    values (coalesce(nullif(btrim(p_descricao), ''), l.descricao), coalesce(nullif(btrim(p_categoria), ''), 'outros'), p_fornecedor, -l.valor, l.data, 'pago', l.data, -l.valor,
            v_unid, l.conta_bancaria_id, 'Lançado a partir do extrato bancário')
    returning id into v_id;
    update extrato_lancamentos set status = 'conciliado', conta_pagar_id = v_id, baixou_conta = false, conciliado_por = auth.uid(), conciliado_em = now() where id = p_lanc;
  else
    insert into contas_receber (descricao, cliente_id, categoria, valor, vencimento, status, data_pagamento, valor_pago, forma_pagamento, unidade_id, conta_bancaria_id)
    values (coalesce(nullif(btrim(p_descricao), ''), l.descricao), p_cliente, coalesce(nullif(btrim(p_categoria), ''), 'outras receitas'), l.valor, l.data, 'pago', l.data, l.valor,
            'transferencia', v_unid, l.conta_bancaria_id)
    returning id into v_id;
    update extrato_lancamentos set status = 'conciliado', conta_receber_id = v_id, baixou_conta = false, conciliado_por = auth.uid(), conciliado_em = now() where id = p_lanc;
  end if;
  return v_id;
end $$;
