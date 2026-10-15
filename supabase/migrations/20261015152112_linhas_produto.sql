-- =====================================================================
-- Linhas de produtos (como no Tiny) e comissão por linha
--  * linhas_produto: nome e comissionamento: "fixa" (um % para a linha), "desconto" (o % cai conforme o desconto dado
--    no item: faixas "desconto até X% -> comissão Y%") ou "herda" (a linha só agrupa; vale a categoria/vendedor);
--  * produtos.linha_id: a linha do produto;
--  * comissão item a item, o mais específico vence:
--      % digitado no pedido -> % do vendedor na categoria -> linha do produto -> % da categoria -> % geral do vendedor.
--    Desconto do item = preço de lista (tabela de preço do pedido ou preço de venda) x preço cobrado, com o desconto
--    do pedido rateado. Comissões já lançadas não mudam.
-- Somente acréscimos (tabela nova, coluna nova, funções create or replace). Linha não se apaga: desativa.
-- =====================================================================

create table if not exists public.linhas_produto (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  comissao_tipo text not null default 'fixa' check (comissao_tipo in ('fixa', 'desconto', 'herda')),
  comissao_percentual numeric(5,2) not null default 0 check (comissao_percentual between 0 and 100),
  comissao_faixas jsonb not null default '[]'::jsonb,
  ativo boolean not null default true,
  marcadores uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.linhas_produto.comissao_faixas is
  'Comissão conforme o desconto: [{"desconto_ate": 5, "percentual": 3}, ...]; acima da última faixa vale a última.';
create unique index if not exists linhas_produto_nome on public.linhas_produto (lower(btrim(nome)));

alter table public.linhas_produto enable row level security;
do $$ begin
  create policy linhas_produto_ler on public.linhas_produto for select to authenticated using (public.is_erp_user());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy linhas_produto_incluir on public.linhas_produto for insert to authenticated with check (public.tem_papel('financeiro'));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy linhas_produto_alterar on public.linhas_produto for update to authenticated
    using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));
exception when duplicate_object then null; end $$;
revoke all on public.linhas_produto from anon, authenticated;
grant select, insert, update on public.linhas_produto to authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'zz_auditoria' and tgrelid = 'public.linhas_produto'::regclass) then
    create trigger zz_auditoria before insert or update on public.linhas_produto for each row execute function public.trg_auditoria();
  end if;
end $$;

alter table public.produtos add column if not exists linha_id uuid references public.linhas_produto(id);
create index if not exists produtos_linha_idx on public.produtos (linha_id);

-- % da linha para um desconto (null = a linha não define comissão: herda)
create or replace function public.comissao_percentual_linha(p_linha uuid, p_desconto numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select case l.comissao_tipo
           when 'fixa' then l.comissao_percentual
           when 'desconto' then coalesce(
             (select (f->>'percentual')::numeric from jsonb_array_elements(l.comissao_faixas) f
               where coalesce(p_desconto, 0) <= (f->>'desconto_ate')::numeric + 0.005
               order by (f->>'desconto_ate')::numeric limit 1),
             (select (f->>'percentual')::numeric from jsonb_array_elements(l.comissao_faixas) f
               order by (f->>'desconto_ate')::numeric desc limit 1),
             l.comissao_percentual)
         end
    from linhas_produto l where l.id = p_linha and l.ativo;
$$;

-- % de um produto para um vendedor: vendedor+categoria -> linha -> categoria -> padrão
create or replace function public.comissao_percentual_produto(p_vendedor uuid, p_produto uuid, p_desconto numeric, p_padrao numeric)
returns numeric language sql stable security definer set search_path = public as $$
  with pr as (select categoria, linha_id from produtos where id = p_produto),
  c as (select lower(btrim(coalesce((select categoria from pr), ''))) as cat,
               lower(btrim(split_part(coalesce((select categoria from pr), ''), ' > ', 1))) as mae)
  select coalesce(
    (select r.percentual from comissao_regras r, c where r.ativo and c.cat <> '' and r.vendedor_id = p_vendedor and lower(btrim(r.categoria)) = c.cat),
    (select r.percentual from comissao_regras r, c where r.ativo and c.mae <> '' and r.vendedor_id = p_vendedor and lower(btrim(r.categoria)) = c.mae),
    public.comissao_percentual_linha((select linha_id from pr), p_desconto),
    (select r.percentual from comissao_regras r, c where r.ativo and c.cat <> '' and r.vendedor_id is null and lower(btrim(r.categoria)) = c.cat),
    (select r.percentual from comissao_regras r, c where r.ativo and c.mae <> '' and r.vendedor_id is null and lower(btrim(r.categoria)) = c.mae),
    p_padrao);
$$;

-- % efetivo do pedido: média dos itens pesada pelo valor (null sem itens)
create or replace function public.comissao_percentual_pedido(p_pedido uuid)
returns numeric language sql stable security definer set search_path = public as $$
  with p as (select * from pedidos where id = p_pedido),
  sub as (select sum(quantidade * valor_unitario) total from pedido_itens where pedido_id = p_pedido),
  it as (
    select i.quantidade * i.valor_unitario as valor, i.produto_id,
           -- desconto do item (%): preço de lista x preço cobrado com o desconto do pedido rateado
           case when coalesce(lista.preco, 0) > 0
                then greatest(0, 100 * (1 - i.valor_unitario * (1 - coalesce((select desconto from p), 0) / nullif((select total from sub), 0)) / lista.preco))
                else coalesce(100 * (select desconto from p) / nullif((select total from sub), 0), 0) end as desconto
      from pedido_itens i
      left join produtos pr on pr.id = i.produto_id
      left join lateral (
        select coalesce(
          (select tpi.preco from tabela_preco_itens tpi where tpi.tabela_id = (select tabela_preco_id from p) and tpi.produto_id = i.produto_id),
          pr.preco_venda * (1 + coalesce((select tp.ajuste_percentual from tabelas_preco tp where tp.id = (select tabela_preco_id from p)), 0) / 100)
        ) as preco
      ) lista on true
     where i.pedido_id = p_pedido
  )
  select case when sum(it.valor) > 0 then
           sum(it.valor * public.comissao_percentual_produto(p.vendedor_id, it.produto_id, it.desconto, v.percentual)) / sum(it.valor) end
    from it, p join vendedores v on v.id = p.vendedor_id;
$$;

revoke execute on function public.comissao_percentual_linha(uuid, numeric) from public, anon, authenticated;
revoke execute on function public.comissao_percentual_produto(uuid, uuid, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.comissao_percentual_pedido(uuid) from public, anon, authenticated;
