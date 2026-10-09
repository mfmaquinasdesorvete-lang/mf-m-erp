-- =====================================================================
-- Cadastro de formas de pagamento (como no Tiny): nome, meio (Pix, boleto, cartão…), condição (parcelas,
-- intervalo, dias até o 1º vencimento) e custo (taxa % e tarifa por parcela). Usado nas vendas e nas contas fixas.
-- O pedido continua guardando o meio em pedidos.forma_pagamento (NF-e, cobrança e margem leem dali).
-- =====================================================================
create table if not exists public.formas_pagamento (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (length(btrim(nome)) between 2 and 60),
  meio text not null default 'boleto'
    check (meio in ('boleto', 'pix', 'cartao', 'dinheiro', 'transferencia', 'debito_automatico', 'cheque', 'outro')),
  uso text not null default 'ambos' check (uso in ('receber', 'pagar', 'ambos')),
  parcelas int not null default 1 check (parcelas between 1 and 24),
  intervalo_dias int not null default 30 check (intervalo_dias between 0 and 365),
  primeiro_em_dias int not null default 0 check (primeiro_em_dias between 0 and 365),
  taxa_percentual numeric(6,3) not null default 0 check (taxa_percentual between 0 and 100),
  tarifa_fixa numeric(12,2) not null default 0 check (tarifa_fixa >= 0),
  conta_bancaria_id uuid references public.contas_bancarias(id),
  ativo boolean not null default true,
  ordem int not null default 100,
  observacoes text,
  created_at timestamptz not null default now()
);
alter table public.formas_pagamento enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'formas_pagamento' and policyname = 'erp_select') then
    create policy "erp_select" on public.formas_pagamento for select to authenticated using (public.is_erp_user());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'formas_pagamento' and policyname = 'erp_insert') then
    create policy "erp_insert" on public.formas_pagamento for insert to authenticated with check (public.tem_papel('financeiro'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'formas_pagamento' and policyname = 'erp_update') then
    create policy "erp_update" on public.formas_pagamento for update to authenticated using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));
  end if;
end $$;
grant select, insert, update on public.formas_pagamento to authenticated;

insert into public.formas_pagamento (nome, meio, uso, parcelas, intervalo_dias, primeiro_em_dias, ordem)
values
  ('Pix à vista', 'pix', 'ambos', 1, 30, 0, 10),
  ('Boleto à vista', 'boleto', 'ambos', 1, 30, 3, 20),
  ('Boleto 30 dias', 'boleto', 'ambos', 1, 30, 30, 21),
  ('Boleto 30/60/90', 'boleto', 'ambos', 3, 30, 30, 22),
  ('Cartão de crédito à vista', 'cartao', 'receber', 1, 30, 30, 30),
  ('Cartão de crédito parcelado (até 12x)', 'cartao', 'receber', 10, 30, 30, 31),
  ('Cartão de débito', 'cartao', 'receber', 1, 30, 1, 32),
  ('Transferência (TED)', 'transferencia', 'ambos', 1, 30, 0, 40),
  ('Dinheiro', 'dinheiro', 'ambos', 1, 30, 0, 50),
  ('Débito automático', 'debito_automatico', 'pagar', 1, 30, 0, 60),
  ('Cheque', 'cheque', 'ambos', 1, 30, 0, 70)
on conflict (nome) do nothing;

alter table public.pedidos add column if not exists forma_pagamento_id uuid references public.formas_pagamento(id);
alter table public.contas_recorrentes add column if not exists forma_pagamento_id uuid references public.formas_pagamento(id);

-- O pedido guarda o meio da forma escolhida (os meios que a venda aceita)
create or replace function public.trg_pedido_forma_pagamento()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_meio text;
begin
  if new.forma_pagamento_id is not null then
    select meio into v_meio from formas_pagamento where id = new.forma_pagamento_id;
    if v_meio in ('boleto', 'pix', 'cartao', 'dinheiro', 'transferencia') then new.forma_pagamento := v_meio; end if;
  end if;
  return new;
end $$;
create or replace trigger trg_pedido_forma_pagamento
before insert or update of forma_pagamento_id on public.pedidos
for each row execute function public.trg_pedido_forma_pagamento();

-- Conta fixa: guarda também o meio (o Pix leva a chave do fornecedor)
create or replace function public.trg_recorrente_forma_pagamento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.forma_pagamento_id is not null then
    select meio into new.forma_pagamento from formas_pagamento where id = new.forma_pagamento_id;
  end if;
  return new;
end $$;
create or replace trigger trg_recorrente_forma_pagamento
before insert or update of forma_pagamento_id on public.contas_recorrentes
for each row execute function public.trg_recorrente_forma_pagamento();

-- Conta lançada: "pagar por <nome da forma>" (ex.: "pagar por Pix à vista"), com a chave Pix do fornecedor
create or replace function public.gerar_recorrentes_interno(p_id uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_passo int; v_mes date; v_venc date; v_limite date; v_n int := 0; v_ok int; v_obs text;
begin
  for r in select * from contas_recorrentes where ativo and (p_id is null or id = p_id) loop
    v_passo := case r.frequencia when 'mensal' then 1 when 'bimestral' then 2 when 'trimestral' then 3 when 'semestral' then 6 else 12 end;
    v_limite := least(coalesce(r.fim, 'infinity'::date), current_date + r.antecedencia_dias);
    v_mes := date_trunc('month', r.inicio)::date;
    v_obs := concat_ws(' · ', 'Conta fixa lançada pelo ERP',
      'pagar por ' || coalesce((select fp.nome from formas_pagamento fp where fp.id = r.forma_pagamento_id), forma_pagamento_rotulo(r.forma_pagamento)),
      (select 'chave Pix: ' || nullif(btrim(f.chave_pix), '') from fornecedores f where f.id = r.fornecedor_id and lower(coalesce(r.forma_pagamento, '')) = 'pix'),
      nullif(btrim(r.observacoes), ''));
    while v_mes <= v_limite loop
      v_venc := least(v_mes + (r.dia_vencimento - 1), (v_mes + interval '1 month' - interval '1 day')::date);
      if v_venc >= greatest(r.inicio, r.created_at::date) and v_venc <= v_limite then
        if r.tipo = 'pagar' then
          insert into contas_pagar (descricao, fornecedor_id, categoria, rateio, valor, vencimento, unidade_id, observacoes, recorrente_id, competencia)
          values (r.descricao || ' · ' || to_char(v_mes, 'MM/YYYY'), r.fornecedor_id, coalesce(r.categoria, 'outros'), r.rateio, r.valor, v_venc,
                  r.unidade_id, v_obs, r.id, v_mes)
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

-- A conta fixa do advogado (cadastrada antes) passa a apontar para "Pix à vista"
update public.contas_recorrentes c set forma_pagamento_id = (select id from public.formas_pagamento where nome = 'Pix à vista')
 where c.forma_pagamento = 'pix' and c.forma_pagamento_id is null;
