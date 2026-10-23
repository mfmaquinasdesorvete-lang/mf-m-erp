-- Mercado Livre: anúncios novos para os produtos da loja que ainda não estão lá. A função mercadolivre (ação
-- "preparar_anuncios") monta uma proposta por produto: categoria, título, atributos, fotos, estoque e o preço que deixa
-- o mesmo valor da loja depois da tarifa e do frete grátis; o Mercado Livre confere (items/validate) e o que faltar
-- aparece. Nada vai ao ar sem aprovação: "publicar_anuncios" só publica as propostas escolhidas na tela.

create table if not exists public.ml_propostas (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null unique references public.produtos(id) on delete cascade,
  categoria_id text,
  categoria_nome text,
  tipo_anuncio text not null default 'gold_special',
  titulo text,
  preco_loja numeric(12,2),
  custo numeric(12,2),
  preco_sugerido numeric(12,2),
  preco numeric(12,2),
  tarifa_pct numeric(6,2),
  tarifa_fixa numeric(12,2),
  frete_gratis numeric(12,2),
  estoque integer,
  corpo jsonb,
  faltando jsonb not null default '[]'::jsonb,
  avisos jsonb not null default '[]'::jsonb,
  situacao text not null default 'proposta' check (situacao in ('proposta', 'publicando', 'publicada', 'erro')),
  erro text,
  ml_item_id text,
  preparado_em timestamptz not null default now(),
  publicado_em timestamptz,
  publicado_por uuid,
  atualizado_em timestamptz not null default now()
);

alter table public.ml_propostas enable row level security;
do $$ begin
  create policy ml_propostas_select on public.ml_propostas for select to authenticated
    using (public.tem_algum_papel(array['vendas', 'financeiro', 'marketplace']));
exception when duplicate_object then null; end $$;
grant select on public.ml_propostas to authenticated;

/** Tarifa fixa do Mercado Livre por unidade abaixo de R$ 79 (a tabela do Mercado Livre; a função usa o valor da API). */
create or replace function public.ml_tarifa_fixa(p_preco numeric)
returns numeric language sql immutable as $$
  select case when p_preco >= 79 then 0
              when p_preco < 12.5 then round(p_preco * 0.5, 2)
              when p_preco < 29 then 6.25
              when p_preco < 50 then 6.50
              else 6.75 end;
$$;

/** Quanto sobra para a MF com um preço: preço − tarifa (% e fixa) − frete grátis (a partir de R$ 79). */
create or replace function public.ml_liquido(p_preco numeric, p_pct numeric, p_frete numeric)
returns numeric language sql immutable as $$
  select round(p_preco - p_preco * coalesce(p_pct, 0) / 100 - public.ml_tarifa_fixa(p_preco)
               - case when p_preco >= 79 then coalesce(p_frete, 0) else 0 end, 2);
$$;

/** Muda o preço de uma proposta antes de publicar (financeiro ou marketplaces). */
create or replace function public.ml_proposta_preco(p_id uuid, p_preco numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r ml_propostas%rowtype;
begin
  if not public.tem_algum_papel(array['financeiro', 'marketplace']) then raise exception 'acesso negado'; end if;
  if p_preco is null or p_preco < 1 or p_preco > 1000000 then raise exception 'preço inválido'; end if;
  update ml_propostas set preco = round(p_preco, 2), atualizado_em = now()
   where id = p_id and situacao in ('proposta', 'erro') returning * into r;
  if not found then raise exception 'proposta não encontrada ou já publicada'; end if;
  return jsonb_build_object('preco', r.preco, 'liquido', public.ml_liquido(r.preco, r.tarifa_pct, r.frete_gratis));
end $$;
revoke execute on function public.ml_proposta_preco(uuid, numeric) from public, anon;
grant execute on function public.ml_proposta_preco(uuid, numeric) to authenticated;
