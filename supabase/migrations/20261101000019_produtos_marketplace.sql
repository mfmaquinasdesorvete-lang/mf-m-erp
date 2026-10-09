-- =====================================================================
-- Produtos: auditoria (unificar cadastros repetidos) e anúncio para marketplace/SEO.
--   * campos do anúncio: título (até 60 letras no Mercado Livre), endereço da página (slug), descrição para
--     o Google (meta), palavras-chave, texto do anúncio e "sem GTIN" (produto próprio, sem EAN)
--   * unificar_produtos: tudo que era do repetido (pedidos, OS, compras, kits, ficha técnica, fornecedores,
--     códigos, anexos, itens de NF) passa para o principal; o saldo de estoque vai por movimentação (o
--     histórico fica no repetido); o que só o repetido tinha completa o principal; o repetido é arquivado
--     (inativo, com "unificado em"), nunca apagado.
-- =====================================================================
alter table public.produtos add column if not exists titulo_anuncio text;
alter table public.produtos add column if not exists slug text;
alter table public.produtos add column if not exists meta_descricao text;
alter table public.produtos add column if not exists palavras_chave text[] not null default '{}';
alter table public.produtos add column if not exists descricao_anuncio text;
alter table public.produtos add column if not exists gtin_isento boolean not null default false;
alter table public.produtos add column if not exists unificado_em uuid references public.produtos(id);
alter table public.produtos add column if not exists unificado_quando timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'produtos_anuncio_tamanhos') then
    alter table public.produtos add constraint produtos_anuncio_tamanhos check (
      (titulo_anuncio is null or char_length(titulo_anuncio) <= 120)
      and (meta_descricao is null or char_length(meta_descricao) <= 300)
      and (descricao_anuncio is null or char_length(descricao_anuncio) <= 50000)
      and (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'));
  end if;
end $$;
create unique index if not exists produtos_slug_unico on public.produtos (slug) where slug is not null and ativo;

-- ---------------------------------------------------------------------
create or replace function public.unificar_produtos(p_principal uuid, p_outros uuid[], p_motivo text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  r record; s record; v_outro uuid; m produtos; o produtos; n int := 0; v_motivo text;
  v_alt text[];
begin
  -- pela API (tela, app) exige o papel; direto no banco é manutenção do administrador do banco
  if session_user not in ('postgres', 'supabase_admin') then perform public.exigir_papel('financeiro'); end if;
  perform set_config('erp.acao_usuario', 'on', true);
  v_motivo := coalesce(nullif(btrim(p_motivo), ''), 'Cadastro repetido (auditoria de produtos)');
  select * into m from produtos where id = p_principal for update;
  if m.id is null then raise exception 'produto principal não encontrado'; end if;
  if not m.ativo or m.unificado_em is not null then raise exception 'o principal "%" está inativo: escolha um ativo', m.descricao; end if;

  foreach v_outro in array coalesce(p_outros, '{}'::uuid[]) loop
    continue when v_outro = p_principal;
    select * into o from produtos where id = v_outro for update;
    continue when o.id is null or o.unificado_em is not null;
    if coalesce(o.kit, false) <> coalesce(m.kit, false) then
      raise exception '"%" é kit e "%" não é: não dá para unificar', case when o.kit then o.descricao else m.descricao end, case when o.kit then m.descricao else o.descricao end;
    end if;

    -- estoque: o saldo de cada unidade passa para o principal (o histórico de movimentos fica no repetido)
    for s in select unidade_id, quantidade from estoque_unidade where produto_id = v_outro and quantidade <> 0 loop
      insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, unidade_id, referencia_tipo, referencia_id)
      values (v_outro, case when s.quantidade > 0 then 'saida' else 'entrada' end, abs(s.quantidade),
              left('Unificação de cadastro: saldo passou para "' || m.descricao || '"', 300), s.unidade_id, 'unificacao', p_principal),
             (p_principal, case when s.quantidade > 0 then 'entrada' else 'saida' end, abs(s.quantidade),
              left('Unificação de cadastro: saldo veio de "' || o.descricao || '"', 300), s.unidade_id, 'unificacao', v_outro);
    end loop;

    -- tudo que aponta para o repetido passa para o principal
    for r in
      select c.conrelid::regclass as tabela, a.attname as coluna
        from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.contype = 'f' and c.confrelid = 'public.produtos'::regclass
         and c.conrelid::regclass::text not in ('estoque_movimentos', 'estoque_unidade', 'contagem_itens', 'produtos')
    loop
      begin
        execute format('update %s set %I = $1 where %I = $2', r.tabela, r.coluna, r.coluna) using p_principal, v_outro;
      exception when unique_violation then
        raise exception '"%" e "%" estão juntos em % (o mesmo kit ou a mesma ficha técnica): ajuste lá e unifique de novo', m.descricao, o.descricao, r.tabela;
      end;
    end loop;
    update documentos set entidade_id = p_principal where entidade = 'produto' and entidade_id = v_outro;
    -- itens guardados dentro das notas (nota direta e nota de fornecedor)
    update notas_fiscais set itens = (
        select jsonb_agg(case when e->>'produto_id' = v_outro::text then jsonb_set(e, '{produto_id}', to_jsonb(p_principal::text)) else e end order by k)
          from jsonb_array_elements(itens) with ordinality t(e, k))
     where jsonb_typeof(itens) = 'array' and itens @> jsonb_build_array(jsonb_build_object('produto_id', v_outro::text));
    update nfe_recebidas set itens = (
        select jsonb_agg(case when e->>'produto_id' = v_outro::text then jsonb_set(e, '{produto_id}', to_jsonb(p_principal::text)) else e end order by k)
          from jsonb_array_elements(itens) with ordinality t(e, k))
     where jsonb_typeof(itens) = 'array' and itens @> jsonb_build_array(jsonb_build_object('produto_id', v_outro::text));

    -- códigos do repetido viram códigos alternativos do principal (SKU, EAN, Tiny)
    v_alt := array(select distinct x from unnest(
               string_to_array(coalesce(m.codigos_alternativos, ''), ',')
               || array[o.sku, o.codigo_barras, o.codigo_fabricante, case when o.id_externo is not null then 'Tiny ' || o.id_externo end]
               || string_to_array(coalesce(o.codigos_alternativos, ''), ',')) x0(y)
             cross join lateral (select nullif(btrim(y), '') x) z
             where x is not null and x is distinct from coalesce(m.sku, o.sku)
               and x is distinct from coalesce(nullif(btrim(m.codigo_barras), ''), o.codigo_barras));

    -- o repetido é arquivado (fica como estava, com o aviso); o SKU dele fica livre para o principal
    update produtos set ativo = false, no_catalogo = false, unificado_em = p_principal, unificado_quando = now(), sku = null, slug = null,
           observacoes = left(concat_ws(E'\n', nullif(btrim(observacoes), ''),
             'Unificado em "' || m.descricao || '"' || coalesce(' (' || m.sku || ')', '') || ' em ' || to_char(now(), 'DD/MM/YYYY') || ': ' || v_motivo
             || coalesce('. SKU era ' || o.sku, '')), 4000),
           motivo_alteracao = v_motivo
     where id = v_outro;

    update produtos set
      sku = coalesce(m.sku, o.sku),
      codigo_barras = coalesce(nullif(btrim(m.codigo_barras), ''), o.codigo_barras),
      ncm = coalesce(m.ncm, o.ncm),
      cest = coalesce(nullif(btrim(m.cest), ''), o.cest),
      marca = coalesce(m.marca, o.marca),
      modelo = coalesce(m.modelo, o.modelo),
      categoria = coalesce(m.categoria, o.categoria),
      codigo_fabricante = coalesce(nullif(btrim(m.codigo_fabricante), ''), o.codigo_fabricante),
      foto_caminho = coalesce(m.foto_caminho, o.foto_caminho),
      descricao_catalogo = coalesce(nullif(btrim(m.descricao_catalogo), ''), o.descricao_catalogo),
      descricao_anuncio = coalesce(nullif(btrim(m.descricao_anuncio), ''), o.descricao_anuncio),
      titulo_anuncio = coalesce(m.titulo_anuncio, o.titulo_anuncio),
      meta_descricao = coalesce(m.meta_descricao, o.meta_descricao),
      palavras_chave = case when cardinality(m.palavras_chave) > 0 then m.palavras_chave else o.palavras_chave end,
      peso_kg = coalesce(nullif(m.peso_kg, 0), o.peso_kg),
      altura_cm = coalesce(nullif(m.altura_cm, 0), o.altura_cm),
      largura_cm = coalesce(nullif(m.largura_cm, 0), o.largura_cm),
      profundidade_cm = coalesce(nullif(m.profundidade_cm, 0), o.profundidade_cm),
      embalagem_id = coalesce(m.embalagem_id, o.embalagem_id),
      fornecedor_padrao_id = coalesce(m.fornecedor_padrao_id, o.fornecedor_padrao_id),
      garantia_meses = coalesce(m.garantia_meses, o.garantia_meses),
      localizacao = coalesce(nullif(btrim(m.localizacao), ''), o.localizacao),
      preco_custo = case when coalesce(m.preco_custo, 0) = 0 then coalesce(o.preco_custo, 0) else m.preco_custo end,
      preco_venda = case when coalesce(m.preco_venda, 0) = 0 then coalesce(o.preco_venda, 0) else m.preco_venda end,
      estoque_minimo = greatest(coalesce(m.estoque_minimo, 0), coalesce(o.estoque_minimo, 0)),
      no_catalogo = m.no_catalogo or coalesce(o.no_catalogo, false),
      codigos_alternativos = nullif(array_to_string(v_alt, ', '), ''),
      motivo_alteracao = v_motivo
    where id = p_principal
    returning * into m;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.unificar_produtos(uuid, uuid[], text) from public, anon;
grant execute on function public.unificar_produtos(uuid, uuid[], text) to authenticated;
