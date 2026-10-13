-- =====================================================================
-- Sorveteria: cardápio online e pedidos de delivery/retirada (/cardapio/<loja>)
--   * O PDV (/sorveteria) publica um retrato do cardápio em sorv_lojas (sorv_publicar).
--   * O cliente abre o link sem login: sorv_cardapio lê o retrato; sorv_pedir recalcula TODOS os preços no
--     banco a partir dele (o navegador do cliente nunca define preço) e grava em sorv_pedidos_online.
--   * O caixa vê os pedidos (sorv_online_listar), aceita ou recusa (sorv_online_status); o cliente
--     acompanha pelo código (sorv_acompanhar).
-- As tabelas não têm política para anon/authenticated: tudo passa pelas funções abaixo.
-- Somente acréscimos: tabelas e funções novas.
-- =====================================================================

create table if not exists public.sorv_lojas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  nome text not null,
  whatsapp text,
  aberta boolean not null default true,
  pedido_minimo numeric(12,2) not null default 0,
  cardapio jsonb not null default '{}'::jsonb,
  /** cupons ativos: ficam só no servidor (sorv_cardapio não devolve), para o código não vazar */
  cupons jsonb not null default '[]'::jsonb,
  publicado_em timestamptz not null default now()
);

create table if not exists public.sorv_pedidos_online (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.sorv_lojas(id),
  codigo text not null,
  canal text not null check (canal in ('delivery','retirada')),
  cliente jsonb not null,
  itens jsonb not null,
  subtotal numeric(12,2) not null,
  taxa_entrega numeric(12,2) not null default 0,
  cupom text,
  desconto numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  pagamento text not null check (pagamento in ('dinheiro','pix','credito','debito','vale')),
  troco_para numeric(12,2),
  observacoes text,
  status text not null default 'novo' check (status in ('novo','aceito','recusado')),
  motivo text,
  created_at timestamptz not null default now(),
  unique (loja_id, codigo)
);
create index if not exists sorv_pedidos_online_loja_idx on public.sorv_pedidos_online (loja_id, created_at desc);

alter table public.sorv_lojas enable row level security;
alter table public.sorv_pedidos_online enable row level security;

-- ---------------------------------------------------------------------
-- Equipe: publicar o cardápio, ver e responder pedidos
-- ---------------------------------------------------------------------
create or replace function public.sorv_publicar(p_slug text, p_nome text, p_whatsapp text, p_aberta boolean, p_minimo numeric, p_cardapio jsonb, p_cupons jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_papel('vendas');
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{2,39}$' then
    raise exception 'Endereço inválido: use de 3 a 40 letras minúsculas, números e hífen';
  end if;
  if jsonb_typeof(p_cardapio->'produtos') is distinct from 'array' then raise exception 'Cardápio inválido'; end if;
  insert into sorv_lojas (slug, nome, whatsapp, aberta, pedido_minimo, cardapio, cupons, publicado_em)
  values (p_slug, coalesce(nullif(trim(p_nome), ''), 'Sorveteria'), nullif(trim(p_whatsapp), ''), coalesce(p_aberta, true), greatest(coalesce(p_minimo, 0), 0), p_cardapio,
          case when jsonb_typeof(p_cupons) = 'array' then p_cupons else '[]'::jsonb end, now())
  on conflict (slug) do update set nome = excluded.nome, whatsapp = excluded.whatsapp, aberta = excluded.aberta,
    pedido_minimo = excluded.pedido_minimo, cardapio = excluded.cardapio, cupons = excluded.cupons, publicado_em = now();
end $$;

create or replace function public.sorv_online_listar(p_slug text)
returns setof public.sorv_pedidos_online language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_papel('vendas');
  return query
    select o.* from sorv_pedidos_online o join sorv_lojas l on l.id = o.loja_id
    where l.slug = p_slug and o.created_at > now() - interval '2 days'
    order by o.created_at desc limit 200;
end $$;

create or replace function public.sorv_online_status(p_id uuid, p_status text, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_papel('vendas');
  if p_status not in ('aceito','recusado') then raise exception 'Situação inválida'; end if;
  if p_status = 'recusado' and nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo da recusa'; end if;
  update sorv_pedidos_online set status = p_status, motivo = nullif(trim(p_motivo), '')
   where id = p_id and status = 'novo';
  if not found then raise exception 'Pedido não está mais aguardando resposta'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Cliente (sem login)
-- ---------------------------------------------------------------------
create or replace function public.sorv_cardapio(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l sorv_lojas%rowtype;
begin
  select * into l from sorv_lojas where slug = lower(coalesce(p_slug, ''));
  if not found then return null; end if;
  return jsonb_build_object('nome', l.nome, 'whatsapp', l.whatsapp, 'aberta', l.aberta, 'pedido_minimo', l.pedido_minimo,
    'cardapio', l.cardapio);
end $$;

create or replace function public.sorv_pedir(p_slug text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l sorv_lojas%rowtype; c jsonb;
  v_canal text := p->>'canal'; v_cli jsonb := coalesce(p->'cliente', '{}'::jsonb);
  v_tel text := regexp_replace(coalesce(v_cli->>'telefone', ''), '\D', '', 'g');
  v_pag text := p->>'pagamento';
  it jsonb; prod jsonb; g jsonb; gi jsonb; s jsonb; sid text;
  v_qtd int; v_unit numeric; v_nsab int; v_n int; v_itens jsonb := '[]'::jsonb; v_sub numeric := 0; v_taxa numeric := 0;
  v_sabs jsonb; v_comps jsonb; v_sel text[]; v_achados int; v_total_itens int := 0; v_codigo text; v_id uuid; v_bairros jsonb;
  v_cupom text := upper(nullif(trim(coalesce(p->>'cupom', '')), '')); cp jsonb; v_desc numeric := 0;
begin
  select * into l from sorv_lojas where slug = lower(coalesce(p_slug, ''));
  if not found then raise exception 'Loja não encontrada'; end if;
  if not l.aberta then raise exception 'A loja está fechada no momento'; end if;
  c := l.cardapio;

  if v_canal not in ('delivery','retirada') then raise exception 'Escolha entrega ou retirada'; end if;
  if v_pag not in ('dinheiro','pix','credito','debito','vale') then raise exception 'Escolha a forma de pagamento'; end if;
  if length(trim(coalesce(v_cli->>'nome', ''))) < 2 then raise exception 'Informe seu nome'; end if;
  if length(v_tel) < 10 or length(v_tel) > 13 then raise exception 'Informe um telefone com DDD'; end if;
  if v_canal = 'delivery' and length(trim(coalesce(v_cli->>'endereco', ''))) < 5 then raise exception 'Informe o endereço de entrega'; end if;
  if jsonb_typeof(p->'itens') is distinct from 'array' or jsonb_array_length(p->'itens') = 0 then raise exception 'O carrinho está vazio'; end if;
  if jsonb_array_length(p->'itens') > 30 then raise exception 'Itens demais no mesmo pedido'; end if;
  if (select count(*) from sorv_pedidos_online where loja_id = l.id and created_at > now() - interval '10 minutes'
        and regexp_replace(cliente->>'telefone', '\D', '', 'g') = v_tel) >= 3 then
    raise exception 'Muitos pedidos seguidos. Fale com a loja pelo WhatsApp.';
  end if;

  for it in select * from jsonb_array_elements(p->'itens') loop
    v_qtd := coalesce((it->>'qtd')::int, 1);
    if v_qtd < 1 or v_qtd > 20 then raise exception 'Quantidade inválida'; end if;
    select x into prod from jsonb_array_elements(c->'produtos') x
     where x->>'id' = it->>'produto_id' and coalesce((x->>'ativo')::boolean, false) and x->>'tipo' = 'unidade' limit 1;
    if prod is null then raise exception 'Um dos produtos não está mais no cardápio'; end if;
    if coalesce((prod->>'esgotado')::boolean, false) then raise exception '% está em falta', prod->>'nome'; end if;
    v_unit := (prod->>'preco')::numeric;

    -- sabores: exatamente a quantidade do produto, nenhum em falta
    v_sabs := '[]'::jsonb; v_nsab := coalesce((prod->>'sabores')::int, 0);
    if coalesce(jsonb_array_length(it->'sabores'), 0) <> v_nsab then raise exception 'Escolha % sabor(es) em %', v_nsab, prod->>'nome'; end if;
    if v_nsab > 0 then
      for sid in select jsonb_array_elements_text(it->'sabores') loop
        select x into s from jsonb_array_elements(c->'sabores') x where x->>'id' = sid limit 1;
        if s is null then raise exception 'Sabor inválido'; end if;
        if coalesce((s->>'esgotado')::boolean, false) then raise exception 'O sabor % está em falta', s->>'nome'; end if;
        v_unit := v_unit + coalesce((s->>'acrescimo')::numeric, 0);
        v_sabs := v_sabs || to_jsonb(s->>'nome');
      end loop;
    end if;

    -- complementos: só dos grupos do produto, respeitando mínimo e máximo
    v_comps := '[]'::jsonb; v_achados := 0;
    select coalesce(array_agg(distinct v), '{}') into v_sel from jsonb_array_elements_text(coalesce(it->'complementos', '[]'::jsonb)) v;
    for g in select x from jsonb_array_elements(c->'grupos') x
              where (x->>'id') in (select jsonb_array_elements_text(prod->'grupos')) loop
      v_n := 0;
      for gi in select * from jsonb_array_elements(g->'itens') loop
        if (gi->>'id') = any (v_sel) then
          if coalesce((gi->>'esgotado')::boolean, false) then raise exception '% está em falta', gi->>'nome'; end if;
          v_n := v_n + 1; v_achados := v_achados + 1;
          v_unit := v_unit + coalesce((gi->>'preco')::numeric, 0);
          v_comps := v_comps || jsonb_build_object('nome', gi->>'nome', 'preco', coalesce((gi->>'preco')::numeric, 0));
        end if;
      end loop;
      if v_n < (g->>'min')::int then raise exception 'Escolha pelo menos % em "%"', g->>'min', g->>'nome'; end if;
      if v_n > (g->>'max')::int then raise exception 'No máximo % em "%"', g->>'max', g->>'nome'; end if;
    end loop;
    if v_achados <> coalesce(array_length(v_sel, 1), 0) then raise exception 'Complemento inválido'; end if;

    v_unit := round(v_unit, 2);
    v_sub := v_sub + v_unit * v_qtd; v_total_itens := v_total_itens + v_qtd;
    v_itens := v_itens || jsonb_build_object('id', gen_random_uuid()::text, 'produto_id', prod->>'id', 'nome', prod->>'nome', 'qtd', v_qtd,
      'unit', v_unit, 'sabores', v_sabs, 'complementos', v_comps, 'obs', nullif(left(trim(coalesce(it->>'obs', '')), 80), ''));
  end loop;
  v_sub := round(v_sub, 2);

  if v_canal = 'delivery' then
    v_bairros := coalesce(c->'loja'->'bairros', '[]'::jsonb);
    if jsonb_array_length(v_bairros) > 0 then
      select (b->>'taxa')::numeric into v_taxa from jsonb_array_elements(v_bairros) b where b->>'nome' = v_cli->>'bairro' limit 1;
      if v_taxa is null then raise exception 'Escolha o bairro da entrega'; end if;
    end if;
  end if;
  if v_sub < l.pedido_minimo then raise exception 'Pedido mínimo: R$ %', to_char(l.pedido_minimo, 'FM999G990D00'); end if;

  -- cupom: conferido aqui (o código não está no cardápio público)
  if v_cupom is not null then
    select x into cp from jsonb_array_elements(l.cupons) x where upper(x->>'cod') = v_cupom and coalesce((x->>'ativo')::boolean, true) limit 1;
    if cp is null then raise exception 'Cupom inválido'; end if;
    if nullif(cp->>'validade', '') is not null and (cp->>'validade')::date < current_date then raise exception 'Cupom vencido'; end if;
    if coalesce((cp->>'min')::numeric, 0) > v_sub then raise exception 'Cupom vale para pedidos a partir de R$ %', to_char((cp->>'min')::numeric, 'FM999G990D00'); end if;
    if coalesce((cp->>'limite')::int, 0) > 0 and (select count(*) from sorv_pedidos_online where loja_id = l.id and cupom = v_cupom and status <> 'recusado') >= (cp->>'limite')::int then
      raise exception 'Cupom esgotado';
    end if;
    v_desc := round(least(v_sub, case when cp->>'tipo' = '%' then v_sub * (cp->>'valor')::numeric / 100 else (cp->>'valor')::numeric end), 2);
  end if;

  loop
    v_codigo := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
    exit when not exists (select 1 from sorv_pedidos_online where loja_id = l.id and codigo = v_codigo);
  end loop;
  insert into sorv_pedidos_online (loja_id, codigo, canal, cliente, itens, subtotal, taxa_entrega, cupom, desconto, total, pagamento, troco_para, observacoes)
  values (l.id, v_codigo, v_canal,
    jsonb_build_object('nome', left(trim(v_cli->>'nome'), 80), 'telefone', v_tel, 'endereco', left(trim(coalesce(v_cli->>'endereco', '')), 160),
      'bairro', left(coalesce(v_cli->>'bairro', ''), 60), 'referencia', left(coalesce(v_cli->>'referencia', ''), 80)),
    v_itens, v_sub, v_taxa, v_cupom, v_desc, v_sub - v_desc + v_taxa, v_pag,
    case when v_pag = 'dinheiro' then nullif(p->>'troco_para', '')::numeric end, nullif(left(trim(coalesce(p->>'observacoes', '')), 200), ''))
  returning id into v_id;
  return jsonb_build_object('codigo', v_codigo, 'total', v_sub - v_desc + v_taxa, 'desconto', v_desc, 'status', 'novo');
end $$;

create or replace function public.sorv_acompanhar(p_slug text, p_codigo text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('status', o.status, 'motivo', o.motivo, 'total', o.total, 'canal', o.canal)
    from sorv_pedidos_online o join sorv_lojas l on l.id = o.loja_id
   where l.slug = lower(coalesce(p_slug, '')) and o.codigo = upper(coalesce(p_codigo, ''));
$$;

revoke execute on function public.sorv_publicar(text, text, text, boolean, numeric, jsonb, jsonb) from public;
revoke execute on function public.sorv_online_listar(text) from public;
revoke execute on function public.sorv_online_status(uuid, text, text) from public;
revoke execute on function public.sorv_cardapio(text) from public;
revoke execute on function public.sorv_pedir(text, jsonb) from public;
revoke execute on function public.sorv_acompanhar(text, text) from public;
grant execute on function public.sorv_publicar(text, text, text, boolean, numeric, jsonb, jsonb) to authenticated;
grant execute on function public.sorv_online_listar(text) to authenticated;
grant execute on function public.sorv_online_status(uuid, text, text) to authenticated;
grant execute on function public.sorv_cardapio(text) to anon, authenticated;
grant execute on function public.sorv_pedir(text, jsonb) to anon, authenticated;
grant execute on function public.sorv_acompanhar(text, text) to anon, authenticated;
