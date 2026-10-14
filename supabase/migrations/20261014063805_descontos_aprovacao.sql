-- Descontos por tipo de venda: o máximo por canal (balcão/PDV, WhatsApp, telefone…) e forma de pagamento.
-- Acima do máximo, a venda só é aprovada com a senha de aprovação de um administrador (conferida no banco, com
-- bloqueio de 15 minutos depois de 5 erros). Vale no PDV, no pedido e no envio da proposta.
-- Parte 1, aditiva: tabelas novas, 3 colunas em pedidos e as funções da regra e da senha de aprovação.
-- Sem regra cadastrada, nada muda (sem limite).

create table if not exists public.regras_desconto (
  id uuid primary key default gen_random_uuid(),
  canal text not null default 'todos'
    check (canal in ('todos', 'balcao', 'whatsapp', 'telefone', 'presencial', 'representante', 'loja', 'marketplace')),
  forma_pagamento text not null default 'qualquer'
    check (forma_pagamento in ('qualquer', 'pix', 'dinheiro', 'cartao', 'boleto', 'transferencia')),
  maximo_percentual numeric(5, 2) not null check (maximo_percentual between 0 and 100),
  ativo boolean not null default true,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canal, forma_pagamento)
);
alter table public.regras_desconto enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'regras_desconto' and policyname = 'regras_desconto_ler') then
    create policy regras_desconto_ler on public.regras_desconto for select to authenticated using (public.is_erp_user());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'regras_desconto' and policyname = 'regras_desconto_admin') then
    create policy regras_desconto_admin on public.regras_desconto for all to authenticated using (public.is_erp_admin()) with check (public.is_erp_admin());
  end if;
end $$;
grant select, insert, update, delete on public.regras_desconto to authenticated;

-- senha de aprovação de cada administrador (só o hash; ninguém lê pela API)
create table if not exists public.senhas_aprovacao (
  user_id uuid primary key,
  hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.senhas_aprovacao enable row level security;
revoke all on public.senhas_aprovacao from anon, authenticated;

create table if not exists public.aprovacao_tentativas (
  id bigint generated always as identity primary key,
  aprovador uuid,
  solicitado_por uuid,
  ok boolean not null,
  criado_em timestamptz not null default now()
);
alter table public.aprovacao_tentativas enable row level security;
revoke all on public.aprovacao_tentativas from anon, authenticated;

-- histórico das aprovações (quem pediu, quem aprovou, quanto e em qual venda)
create table if not exists public.aprovacoes_desconto (
  id uuid primary key default gen_random_uuid(),
  contexto text not null check (contexto in ('pdv', 'pedido')),
  pedido_id uuid references public.pedidos(id) on delete set null,
  percentual numeric(5, 2) not null,
  maximo_percentual numeric(5, 2),
  canal text,
  forma_pagamento text,
  aprovado_por uuid not null,
  aprovado_por_nome text,
  solicitado_por uuid,
  solicitado_por_nome text,
  motivo text,
  criado_em timestamptz not null default now(),
  usado_em timestamptz
);
create index if not exists aprovacoes_desconto_criado_idx on public.aprovacoes_desconto (criado_em desc);
alter table public.aprovacoes_desconto enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'aprovacoes_desconto' and policyname = 'aprovacoes_desconto_ler') then
    create policy aprovacoes_desconto_ler on public.aprovacoes_desconto for select to authenticated using (public.is_erp_user());
  end if;
end $$;
revoke insert, update, delete on public.aprovacoes_desconto from anon, authenticated;
grant select on public.aprovacoes_desconto to authenticated;

alter table public.pedidos add column if not exists desconto_aprovado_pct numeric(5, 2);
alter table public.pedidos add column if not exists desconto_aprovado_por uuid;
alter table public.pedidos add column if not exists desconto_aprovado_em timestamptz;

-- o máximo que vale para a venda: canal + forma > canal > forma > geral; sem regra = sem limite (null)
create or replace function public.desconto_maximo(p_canal text, p_forma text)
returns numeric language sql stable security definer set search_path = public as $$
  select r.maximo_percentual from regras_desconto r
   where r.ativo and r.canal in (coalesce(p_canal, 'todos'), 'todos') and r.forma_pagamento in (coalesce(p_forma, 'qualquer'), 'qualquer')
   order by (r.canal <> 'todos') desc, (r.forma_pagamento <> 'qualquer') desc
   limit 1
$$;
revoke execute on function public.desconto_maximo(text, text) from public, anon;
grant execute on function public.desconto_maximo(text, text) to authenticated;

create or replace function public.percentual_br(p numeric)
returns text language sql immutable as $$ select replace(trim_scale(round(p, 2))::text, '.', ',') || '%' $$;

-- o administrador cria ou troca a própria senha de aprovação (mínimo 6 caracteres; diferente da senha de entrar)
create or replace function public.definir_senha_aprovacao(p_senha text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_erp_admin() then raise exception 'só administrador tem senha de aprovação'; end if;
  if length(coalesce(p_senha, '')) < 6 then raise exception 'a senha de aprovação precisa de pelo menos 6 caracteres'; end if;
  insert into senhas_aprovacao (user_id, hash, updated_at)
  values (auth.uid(), extensions.crypt(p_senha, extensions.gen_salt('bf', 8)), now())
  on conflict (user_id) do update set hash = excluded.hash, updated_at = now();
end $$;
revoke execute on function public.definir_senha_aprovacao(text) from public, anon;
grant execute on function public.definir_senha_aprovacao(text) to authenticated;

create or replace function public.tem_senha_aprovacao()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from senhas_aprovacao where user_id = auth.uid())
$$;
revoke execute on function public.tem_senha_aprovacao() from public, anon;
grant execute on function public.tem_senha_aprovacao() to authenticated;

-- quem pode aprovar: administradores ativos que já criaram a senha de aprovação
create or replace function public.aprovadores_desconto()
returns table (user_id uuid, nome text) language sql stable security definer set search_path = public as $$
  select u.user_id, u.nome from usuarios_erp u join senhas_aprovacao s on s.user_id = u.user_id
   where public.is_erp_user() and u.ativo and u.papel = 'admin'
   order by u.nome
$$;
revoke execute on function public.aprovadores_desconto() from public, anon;
grant execute on function public.aprovadores_desconto() to authenticated;
