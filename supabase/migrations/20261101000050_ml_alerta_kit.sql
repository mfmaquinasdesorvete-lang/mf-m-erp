-- Mercado Livre mais fácil:
--  1) alerta no sino quando uma venda do ML entra no ERP (normal) ou fica parada sem virar pedido (importante, com som);
--  2) ml_ligar_com_kit: liga o anúncio a um produto e, quando o anúncio vende N unidades juntas ("4 Un", "kit com 3"),
--     cria (ou reaproveita) o kit "N × produto" e liga o anúncio ao kit, para a baixa de estoque sair certa.

create or replace function public.trg_ml_pedido_alerta()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_num bigint; v_txt text;
begin
  if new.situacao in ('pendente', 'erro')
     and (tg_op = 'INSERT' or old.situacao is distinct from new.situacao) then
    insert into notificacoes (tipo, titulo, texto, link, papeis, urgencia)
    values ('outro', 'Venda do Mercado Livre parada: ' || coalesce(public.brl(new.total), ''),
      concat_ws(' · ', new.comprador, coalesce(new.pendencia, 'não virou pedido no ERP')), '/mercado-livre', '{vendas}', 'importante');
  elsif new.situacao = 'importada' and new.pedido_id is not null
     and (tg_op = 'INSERT' or old.pedido_id is null) then
    select numero into v_num from pedidos where id = new.pedido_id;
    v_txt := concat_ws(' · ', new.comprador, case when v_num is not null then 'pedido #' || v_num end);
    insert into notificacoes (tipo, titulo, texto, link, papeis)
    values ('outro', 'Nova venda no Mercado Livre: ' || coalesce(public.brl(new.total), ''), v_txt, '/mercado-livre', '{vendas}');
  end if;
  return null;
end $$;

drop trigger if exists trg_ml_pedido_alerta on public.ml_pedidos;
create trigger trg_ml_pedido_alerta after insert or update of situacao, pedido_id on public.ml_pedidos
for each row execute function public.trg_ml_pedido_alerta();

create or replace function public.ml_ligar_com_kit(p_anuncio uuid, p_produto uuid, p_quantidade int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b produtos%rowtype; v_kit uuid; v_sku text; v_titulo text; v_n int;
begin
  perform public.exigir_papel('vendas');
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 500 then raise exception 'quantidade inválida'; end if;
  select * into b from produtos where id = p_produto and ativo;
  if not found then raise exception 'produto não encontrado'; end if;
  if p_quantidade = 1 then
    return jsonb_build_object('produto_id', p_produto, 'importadas', public.ml_ligar_anuncio(p_anuncio, p_produto), 'kit_criado', false);
  end if;
  select titulo into v_titulo from ml_anuncios where id = p_anuncio;
  if not found then raise exception 'anúncio não encontrado'; end if;

  -- reaproveita um kit que já seja exatamente N × este produto
  select k.kit_id into v_kit from kit_componentes k join produtos p on p.id = k.kit_id and p.ativo and p.kit
   where k.componente_id = p_produto and k.quantidade = p_quantidade
     and not exists (select 1 from kit_componentes o where o.kit_id = k.kit_id and o.componente_id <> p_produto)
   limit 1;
  if v_kit is null then
    v_sku := case when b.sku is not null then b.sku || '-' || p_quantidade end;
    if v_sku is not null and exists (select 1 from produtos where sku = v_sku) then v_sku := null; end if;
    insert into produtos (descricao, sku, kit, tipo, ativo, vendavel, ncm, origem, unidade, marca, categoria, peso_kg, altura_cm,
      largura_cm, profundidade_cm, gtin_isento, preco_custo, preco_venda, garantia_meses, foto_caminho, observacoes)
    values (b.descricao || ' (Kit com ' || p_quantidade || ')', v_sku, true, b.tipo, true, true, b.ncm, b.origem, 'KIT', b.marca,
      b.categoria, round(coalesce(b.peso_kg, 0) * p_quantidade, 3), b.altura_cm, b.largura_cm, b.profundidade_cm, b.gtin_isento,
      round(coalesce(b.preco_custo, 0) * p_quantidade, 2), round(coalesce(b.preco_venda, 0) * p_quantidade, 2), b.garantia_meses,
      b.foto_caminho, 'Kit = ' || p_quantidade || ' × ' || coalesce(b.sku, b.descricao) || '. Criado ao ligar o anúncio do Mercado Livre: ' || coalesce(v_titulo, ''))
    returning id into v_kit;
    insert into kit_componentes (kit_id, componente_id, quantidade) values (v_kit, p_produto, p_quantidade);
  end if;
  v_n := public.ml_ligar_anuncio(p_anuncio, v_kit);
  return jsonb_build_object('produto_id', v_kit, 'importadas', v_n, 'kit_criado', true);
end $$;

revoke execute on function public.ml_ligar_com_kit(uuid, uuid, int) from public, anon;
grant execute on function public.ml_ligar_com_kit(uuid, uuid, int) to authenticated;
revoke execute on function public.trg_ml_pedido_alerta() from public, anon, authenticated;
