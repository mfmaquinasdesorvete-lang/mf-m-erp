-- =====================================================================
-- Cadastro de produtos mais completo e importação do sistema anterior
-- (planilha de produtos do Tiny / Olist ERP).
--   * marca, categoria, observações, estoque máximo, sob encomenda e
--     "pode vender" (matéria-prima não aparece no pedido de venda)
--   * id_externo guarda o ID do Tiny: importar de novo atualiza, não duplica
--   * foto pode ser um link (http...) enquanto não é copiada para o ERP
-- =====================================================================

alter table public.produtos
  add column id_externo text unique,
  add column marca text,
  add column categoria text,
  add column observacoes text,
  add column estoque_maximo numeric(12,3) not null default 0,
  add column sob_encomenda boolean not null default false,
  add column vendavel boolean not null default true;

create index produtos_categoria_idx on public.produtos (categoria) where categoria is not null;

-- Sob encomenda conta como "disponível para pedido" no catálogo
create or replace function public.disponibilidade_catalogo(p public.produtos)
returns text language sql immutable as $$
  select case when p.estoque_atual > 0 then 'in stock'
              when p.tipo = 'maquina' or p.sob_encomenda then 'available for order'
              else 'out of stock' end;
$$;

-- Vitrine: a marca do produto vai para o catálogo da Meta
create or replace function public.loja_dados()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'empresa', (select jsonb_build_object('nome', coalesce(nome_fantasia, razao_social), 'whatsapp', whatsapp,
                  'telefone', telefone, 'email', email, 'endereco', endereco, 'municipio', municipio, 'uf', uf, 'texto', catalogo_texto)
                  from configuracoes where id = 1),
    'produtos', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', p.id, 'sku', p.sku, 'nome', p.descricao, 'descricao', p.descricao_catalogo, 'tipo', p.tipo,
                  'marca', p.marca, 'preco', p.preco_venda, 'foto', p.foto_caminho, 'disponibilidade', public.disponibilidade_catalogo(p),
                  'garantia_meses', coalesce(p.garantia_meses, (select garantia_meses_padrao from configuracoes where id = 1)))
                  order by case p.tipo when 'maquina' then 0 when 'acessorio' then 1 when 'peca' then 2 else 3 end, p.descricao)
                  from produtos p where p.ativo and p.no_catalogo and p.foto_caminho is not null and p.preco_venda > 0), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- Importação. p_itens = lista já lida da planilha:
--   { id_externo, sku, descricao, tipo, unidade, ncm, cest, origem, preco_venda, preco_custo,
--     estoque, estoque_minimo, estoque_maximo, localizacao, codigo_barras, marca, categoria,
--     observacoes, descricao_catalogo, garantia_meses, peso_kg, altura_cm, largura_cm,
--     profundidade_cm, sob_encomenda, vendavel, ativo, foto, fornecedor, codigo_fornecedor }
-- Produto que já existe (mesmo ID do Tiny ou mesmo SKU) tem o cadastro atualizado;
-- o estoque só é lançado para produto novo (saldo inicial), e só se positivo.
-- ---------------------------------------------------------------------
create or replace function public.importar_produtos(p_itens jsonb, p_unidade uuid, p_lancar_estoque boolean default true)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_it jsonb;
  v_id uuid;
  v_forn uuid;
  v_novo boolean;
  v_qtd numeric;
  v_criados int := 0; v_atualizados int := 0; v_forn_criados int := 0; v_com_estoque int := 0; v_negativos int := 0;
begin
  if not public.tem_papel('financeiro') then raise exception 'sem permissão para importar produtos'; end if;
  if p_unidade is null or not exists (select 1 from unidades where id = p_unidade) then raise exception 'escolha a unidade do estoque'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 5000 then raise exception 'lista inválida'; end if;

  for v_it in select * from jsonb_array_elements(p_itens) loop
    if coalesce(trim(v_it->>'descricao'), '') = '' then continue; end if;

    -- fornecedor pelo nome (cria se não existir)
    v_forn := null;
    if coalesce(trim(v_it->>'fornecedor'), '') <> '' then
      select id into v_forn from fornecedores where lower(trim(nome)) = lower(trim(v_it->>'fornecedor')) limit 1;
      if v_forn is null then
        insert into fornecedores (nome) values (trim(v_it->>'fornecedor')) returning id into v_forn;
        v_forn_criados := v_forn_criados + 1;
      end if;
    end if;

    select id into v_id from produtos
     where (nullif(v_it->>'id_externo', '') is not null and id_externo = v_it->>'id_externo')
        or (nullif(trim(v_it->>'sku'), '') is not null and sku = trim(v_it->>'sku'))
     order by (id_externo = v_it->>'id_externo') desc nulls last
     limit 1;
    v_novo := v_id is null;

    if v_novo then
      insert into produtos (descricao, tipo) values (trim(v_it->>'descricao'), 'peca') returning id into v_id;
      v_criados := v_criados + 1;
    else
      v_atualizados := v_atualizados + 1;
    end if;

    update produtos set
      id_externo        = coalesce(nullif(v_it->>'id_externo', ''), id_externo),
      descricao         = trim(v_it->>'descricao'),
      sku               = coalesce(nullif(trim(v_it->>'sku'), ''), sku),
      tipo              = case when v_it->>'tipo' in ('maquina','peca','acessorio','insumo') then v_it->>'tipo' else tipo end,
      unidade           = coalesce(nullif(trim(v_it->>'unidade'), ''), unidade),
      ncm               = coalesce(nullif(regexp_replace(v_it->>'ncm', '\D', '', 'g'), ''), ncm),
      cest              = coalesce(nullif(regexp_replace(v_it->>'cest', '\D', '', 'g'), ''), cest),
      origem            = coalesce((v_it->>'origem')::int, origem),
      preco_venda       = coalesce((v_it->>'preco_venda')::numeric, preco_venda),
      preco_custo       = coalesce(nullif((v_it->>'preco_custo')::numeric, 0), preco_custo),
      estoque_minimo    = coalesce((v_it->>'estoque_minimo')::numeric, estoque_minimo),
      estoque_maximo    = coalesce((v_it->>'estoque_maximo')::numeric, estoque_maximo),
      localizacao       = coalesce(nullif(trim(v_it->>'localizacao'), ''), localizacao),
      codigo_barras     = coalesce(nullif(regexp_replace(v_it->>'codigo_barras', '\D', '', 'g'), ''), codigo_barras),
      marca             = coalesce(nullif(trim(v_it->>'marca'), ''), marca),
      categoria         = coalesce(nullif(trim(v_it->>'categoria'), ''), categoria),
      observacoes       = coalesce(nullif(trim(v_it->>'observacoes'), ''), observacoes),
      descricao_catalogo = coalesce(descricao_catalogo, nullif(trim(v_it->>'descricao_catalogo'), '')),
      garantia_meses    = coalesce((v_it->>'garantia_meses')::int, garantia_meses),
      peso_kg           = coalesce(nullif((v_it->>'peso_kg')::numeric, 0), peso_kg),
      altura_cm         = coalesce(nullif((v_it->>'altura_cm')::numeric, 0), altura_cm),
      largura_cm        = coalesce(nullif((v_it->>'largura_cm')::numeric, 0), largura_cm),
      profundidade_cm   = coalesce(nullif((v_it->>'profundidade_cm')::numeric, 0), profundidade_cm),
      sob_encomenda     = coalesce((v_it->>'sob_encomenda')::boolean, sob_encomenda),
      vendavel          = coalesce((v_it->>'vendavel')::boolean, vendavel),
      kit               = coalesce((v_it->>'kit')::boolean, kit),           -- coluna criada em 20261019 (comercial)
      ativo             = coalesce((v_it->>'ativo')::boolean, ativo),
      foto_caminho      = coalesce(foto_caminho, nullif(v_it->>'foto', '')),
      fornecedor_padrao_id = coalesce(v_forn, fornecedor_padrao_id)
    where id = v_id;

    -- vínculo código do fornecedor -> produto (as NF-e de compra já entram ligadas)
    if v_forn is not null and coalesce(trim(v_it->>'codigo_fornecedor'), '') <> '' then
      insert into produto_fornecedor (fornecedor_id, codigo_fornecedor, descricao_fornecedor, produto_id)
      values (v_forn, trim(v_it->>'codigo_fornecedor'), trim(v_it->>'descricao'), v_id)
      on conflict (fornecedor_id, codigo_fornecedor) do nothing;
    end if;

    v_qtd := coalesce((v_it->>'estoque')::numeric, 0);
    if v_qtd < 0 then v_negativos := v_negativos + 1; end if;
    if v_novo and p_lancar_estoque and v_qtd > 0 then
      insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, unidade_id)
      values (v_id, 'entrada', v_qtd, 'Saldo inicial (importação)', 'manual', p_unidade);
      v_com_estoque := v_com_estoque + 1;
    end if;
  end loop;

  return jsonb_build_object('criados', v_criados, 'atualizados', v_atualizados, 'fornecedores_criados', v_forn_criados,
                            'com_estoque', v_com_estoque, 'negativos', v_negativos);
end $$;
revoke execute on function public.importar_produtos(jsonb, uuid, boolean) from public, anon;
grant execute on function public.importar_produtos(jsonb, uuid, boolean) to authenticated;
