-- Cadastros: unificar e importar sem perder dado.
--  * Unificar produtos: soma os marcadores (regra da casa: marcador nunca some), completa mais campos vazios do principal,
--    não trava quando os dois estão na mesma tabela de preço / mesmo teste do giga / com sugestão de preço pendente,
--    e quem já tinha sido unificado no repetido passa a apontar para o principal (unificação em cadeia).
--  * Unificar fornecedores: o bloqueio de golpe, a homologação, o "crítico" e as tags passam para o principal; o CNPJ do
--    arquivado é liberado antes (o principal sem CNPJ recebia o mesmo número e a unificação falhava); anexos e cadeia.
--  * Importar produtos (planilha do Tiny): produto unificado vai para o principal (não reativa o arquivado); em produto
--    que já existe não troca descrição, tipo, ativo e "pode vender" (o que foi arrumado no ERP fica); preço em branco
--    (zero) não zera o preço; fornecedor só entre os não unificados.

create or replace function public.unificar_produtos(p_principal uuid, p_outros uuid[], p_motivo text default null)
returns integer language plpgsql security definer set search_path to 'public' as $$
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

    -- sugestões: passam para o principal, menos a que ele já tem igual (fica no repetido arquivado, como histórico)
    update produto_sugestoes x set produto_id = p_principal
     where x.produto_id = v_outro
       and not exists (select 1 from produto_sugestoes y where y.produto_id = p_principal and y.campo = x.campo
                         and coalesce(y.valor, '') = coalesce(x.valor, ''));
    -- uma linha por produto: passa a do repetido só quando o principal não tem (a dele fica no arquivado)
    update tabela_preco_itens x set produto_id = p_principal
     where x.produto_id = v_outro and not exists (select 1 from tabela_preco_itens y where y.produto_id = p_principal and y.tabela_id = x.tabela_id);
    update teste_giga_parametros x set produto_id = p_principal
     where x.produto_id = v_outro and not exists (select 1 from teste_giga_parametros y where y.produto_id = p_principal);
    update preco_sugestoes x set produto_id = p_principal
     where x.produto_id = v_outro and (x.status <> 'pendente' or not exists (select 1 from preco_sugestoes y where y.produto_id = p_principal and y.status = 'pendente'));

    -- tudo que aponta para o repetido passa para o principal
    for r in
      select c.conrelid::regclass as tabela, a.attname as coluna
        from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.contype = 'f' and c.confrelid = 'public.produtos'::regclass
         and c.conrelid::regclass::text not in ('estoque_movimentos', 'estoque_unidade', 'contagem_itens', 'produtos', 'produto_sugestoes',
                                                'tabela_preco_itens', 'teste_giga_parametros', 'preco_sugestoes')
    loop
      begin
        execute format('update %s set %I = $1 where %I = $2', r.tabela, r.coluna, r.coluna) using p_principal, v_outro;
      exception when unique_violation then
        raise exception '"%" e "%" estão juntos em % (o mesmo kit ou a mesma ficha técnica): ajuste lá e unifique de novo', m.descricao, o.descricao, r.tabela;
      end;
    end loop;
    -- unificação em cadeia: quem já tinha sido unificado no repetido passa a apontar para o principal
    update produtos set unificado_em = p_principal where unificado_em = v_outro;
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
             'Unificado em "' || m.descricao || '"' || coalesce(' (' || m.sku || ')', '') || ' em '
             || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || ': ' || v_motivo
             || coalesce('. SKU era ' || o.sku, '')), 4000),
           motivo_alteracao = v_motivo
     where id = v_outro;

    update produtos set
      sku = coalesce(m.sku, o.sku),
      codigo_barras = coalesce(nullif(btrim(m.codigo_barras), ''), o.codigo_barras),
      ncm = coalesce(m.ncm, o.ncm),
      cest = coalesce(nullif(btrim(m.cest), ''), o.cest),
      cfop = coalesce(nullif(btrim(m.cfop), ''), o.cfop),
      icms_situacao = coalesce(nullif(btrim(m.icms_situacao), ''), o.icms_situacao),
      ipi_aliquota = coalesce(m.ipi_aliquota, o.ipi_aliquota),
      marca = coalesce(m.marca, o.marca),
      modelo = coalesce(m.modelo, o.modelo),
      categoria = coalesce(m.categoria, o.categoria),
      linha_id = coalesce(m.linha_id, o.linha_id),
      codigo_fabricante = coalesce(nullif(btrim(m.codigo_fabricante), ''), o.codigo_fabricante),
      foto_caminho = coalesce(m.foto_caminho, o.foto_caminho),
      video_url = coalesce(nullif(btrim(m.video_url), ''), o.video_url),
      descricao_catalogo = coalesce(nullif(btrim(m.descricao_catalogo), ''), o.descricao_catalogo),
      descricao_anuncio = coalesce(nullif(btrim(m.descricao_anuncio), ''), o.descricao_anuncio),
      titulo_anuncio = coalesce(m.titulo_anuncio, o.titulo_anuncio),
      meta_descricao = coalesce(m.meta_descricao, o.meta_descricao),
      palavras_chave = case when cardinality(m.palavras_chave) > 0 then m.palavras_chave else o.palavras_chave end,
      dicas_manutencao = coalesce(nullif(btrim(m.dicas_manutencao), ''), o.dicas_manutencao),
      especificacoes = case when m.especificacoes is null or m.especificacoes in ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb) then o.especificacoes else m.especificacoes end,
      etapas_producao = case when m.etapas_producao is null or m.etapas_producao in ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb) then o.etapas_producao else m.etapas_producao end,
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
      margem_desejada = coalesce(m.margem_desejada, o.margem_desejada),
      estoque_minimo = greatest(coalesce(m.estoque_minimo, 0), coalesce(o.estoque_minimo, 0)),
      prazo_reposicao_dias = coalesce(m.prazo_reposicao_dias, o.prazo_reposicao_dias),
      compra_minima = coalesce(m.compra_minima, o.compra_minima),
      no_catalogo = m.no_catalogo or coalesce(o.no_catalogo, false),
      -- marcadores da usuária: só somam, nunca saem
      marcadores = array(select distinct x from unnest(coalesce(m.marcadores, '{}') || coalesce(o.marcadores, '{}')) x),
      codigos_alternativos = nullif(array_to_string(v_alt, ', '), ''),
      motivo_alteracao = v_motivo
    where id = p_principal
    returning * into m;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.unificar_fornecedores(p_principal uuid, p_outros uuid[], p_motivo text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  r record; u record; v_outro uuid; m fornecedores; o fornecedores; n int := 0; v_motivo text; v_destino uuid; v_cond text;
begin
  if session_user not in ('postgres', 'supabase_admin') then perform public.exigir_papel('financeiro'); end if;
  perform set_config('erp.acao_usuario', 'on', true);
  v_motivo := coalesce(nullif(btrim(p_motivo), ''), 'Cadastro repetido de fornecedor');
  select * into m from fornecedores where id = p_principal for update;
  if m.id is null then raise exception 'fornecedor principal não encontrado'; end if;
  if m.unificado_em is not null then raise exception 'o principal "%" já foi unificado em outro: escolha outro', m.nome; end if;
  v_destino := coalesce(m.matriz_id, m.id);

  foreach v_outro in array coalesce(p_outros, '{}'::uuid[]) loop
    continue when v_outro = p_principal;
    select * into o from fornecedores where id = v_outro for update;
    continue when o.id is null or o.unificado_em is not null;

    for r in
      select c.conrelid::regclass as tabela, c.conrelid as rel, a.attname as coluna, a.attnum
        from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.contype = 'f' and c.confrelid = 'public.fornecedores'::regclass
         and c.conrelid::regclass::text <> 'fornecedores'
    loop
      -- chave única que inclui a coluna (ex.: fornecedor + código): não duplica no principal
      v_cond := '';
      for u in
        select array(select att.attname from pg_attribute att where att.attrelid = r.rel and att.attnum = any (k.conkey) and att.attnum <> r.attnum) as outras
          from pg_constraint k where k.conrelid = r.rel and k.contype in ('u', 'p') and r.attnum = any (k.conkey) and cardinality(k.conkey) > 1
      loop
        v_cond := v_cond || format(' and not exists (select 1 from %s x where x.%I = $1%s)', r.tabela, r.coluna,
          (select coalesce(string_agg(format(' and x.%I is not distinct from t.%I', c, c), ''), '') from unnest(u.outras) c));
      end loop;
      execute format('update %s t set %I = $1 where t.%I = $2%s', r.tabela, r.coluna, r.coluna, v_cond) using p_principal, v_outro;
    end loop;
    update fornecedores set matriz_id = v_destino where matriz_id = v_outro and id <> v_destino;
    -- unificação em cadeia e anexos (contratos, homologação)
    update fornecedores set unificado_em = p_principal where unificado_em = v_outro;
    update documentos set entidade_id = p_principal where entidade = 'fornecedor' and entidade_id = v_outro;

    -- o arquivado libera o CNPJ (fica escrito nas observações) para o principal poder recebê-lo
    update fornecedores set matriz_id = null, unificado_em = p_principal, unificado_quando = now(), cnpj = null,
           observacoes = left(concat_ws(E'\n', nullif(btrim(observacoes), ''),
             'Unificado em "' || coalesce(nullif(btrim(m.nome_fantasia), ''), m.nome) || '" em '
             || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || ': ' || v_motivo
             || coalesce('. CNPJ era ' || nullif(btrim(o.cnpj), ''), '')), 4000)
     where id = v_outro;

    update fornecedores set
      cnpj = coalesce(nullif(btrim(m.cnpj), ''), o.cnpj),
      inscricao_estadual = coalesce(nullif(btrim(m.inscricao_estadual), ''), o.inscricao_estadual),
      nome_fantasia = coalesce(nullif(btrim(m.nome_fantasia), ''), o.nome_fantasia),
      whatsapp = coalesce(nullif(btrim(m.whatsapp), ''), o.whatsapp),
      telefone = coalesce(nullif(btrim(m.telefone), ''), o.telefone),
      email = coalesce(nullif(btrim(m.email), ''), o.email),
      chave_pix = coalesce(nullif(btrim(m.chave_pix), ''), o.chave_pix),
      cep = coalesce(nullif(btrim(m.cep), ''), o.cep),
      logradouro = coalesce(nullif(btrim(m.logradouro), ''), o.logradouro),
      numero = coalesce(nullif(btrim(m.numero), ''), o.numero),
      complemento = coalesce(nullif(btrim(m.complemento), ''), o.complemento),
      bairro = coalesce(nullif(btrim(m.bairro), ''), o.bairro),
      municipio = coalesce(nullif(btrim(m.municipio), ''), o.municipio),
      uf = coalesce(nullif(btrim(m.uf), ''), o.uf),
      site = coalesce(m.site, o.site),
      -- golpe: se um dos dois estava bloqueado, o principal fica bloqueado (as contas vão para "não pagar")
      bloqueado = coalesce(m.bloqueado, false) or coalesce(o.bloqueado, false),
      bloqueio_motivo = case when coalesce(m.bloqueado, false) then m.bloqueio_motivo
                             when coalesce(o.bloqueado, false) then o.bloqueio_motivo end,
      bloqueado_por_nome = case when coalesce(m.bloqueado, false) then m.bloqueado_por_nome
                                when coalesce(o.bloqueado, false) then o.bloqueado_por_nome end,
      homologado = coalesce(m.homologado, false) or coalesce(o.homologado, false),
      homologado_em = case when coalesce(m.homologado, false) then m.homologado_em else coalesce(m.homologado_em, o.homologado_em) end,
      homologado_obs = coalesce(nullif(btrim(m.homologado_obs), ''), o.homologado_obs),
      critico = coalesce(m.critico, false) or coalesce(o.critico, false),
      tags = (select array(select distinct x from unnest(coalesce(m.tags, '{}') || coalesce(o.tags, '{}')) x)),
      marcadores = (select array(select distinct x from unnest(coalesce(m.marcadores, '{}') || coalesce(o.marcadores, '{}')) x)),
      observacoes = case when nullif(btrim(o.observacoes), '') is not null and coalesce(m.observacoes, '') not like '%' || btrim(o.observacoes) || '%'
                         then left(concat_ws(E'\n', nullif(btrim(m.observacoes), ''), btrim(o.observacoes)), 4000) else m.observacoes end
    where id = p_principal
    returning * into m;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.unificar_fornecedores(uuid, uuid[], text) from public, anon;
grant execute on function public.unificar_fornecedores(uuid, uuid[], text) to authenticated;

create or replace function public.importar_produtos(p_itens jsonb, p_unidade uuid, p_lancar_estoque boolean default true)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
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

    -- fornecedor pelo nome (cria se não existir); unificado vai para o principal
    v_forn := null;
    if coalesce(trim(v_it->>'fornecedor'), '') <> '' then
      select coalesce(unificado_em, id) into v_forn from fornecedores
       where lower(trim(nome)) = lower(trim(v_it->>'fornecedor')) order by unificado_em nulls first limit 1;
      if v_forn is null then
        insert into fornecedores (nome) values (trim(v_it->>'fornecedor')) returning id into v_forn;
        v_forn_criados := v_forn_criados + 1;
      end if;
    end if;

    -- produto pelo código do Tiny ou SKU; o unificado vai para o principal (não reativa o arquivado)
    select coalesce(unificado_em, id) into v_id from produtos
     where (nullif(v_it->>'id_externo', '') is not null and id_externo = v_it->>'id_externo')
        or (nullif(trim(v_it->>'sku'), '') is not null and sku = trim(v_it->>'sku'))
     order by (id_externo = v_it->>'id_externo') desc nulls last, unificado_em nulls first
     limit 1;
    if v_id is null and nullif(v_it->>'id_externo', '') is not null then
      select id into v_id from produtos where unificado_em is null
         and ('Tiny ' || (v_it->>'id_externo')) = any (string_to_array(replace(coalesce(codigos_alternativos, ''), ', ', ','), ','))
       limit 1;
    end if;
    v_novo := v_id is null;

    if v_novo then
      insert into produtos (descricao, tipo, id_externo) values (trim(v_it->>'descricao'), 'peca', nullif(v_it->>'id_externo', '')) returning id into v_id;
      v_criados := v_criados + 1;
    else
      v_atualizados := v_atualizados + 1;
    end if;

    -- produto que já existe: completa o que está vazio; descrição, tipo, ativo e "pode vender" arrumados no ERP ficam
    update produtos set
      -- liga o código do Tiny quando o produto ainda não tem e nenhum outro cadastro usa esse código
      id_externo        = coalesce(id_externo, case when not exists (select 1 from produtos p2 where p2.id_externo = v_it->>'id_externo')
                                                     then nullif(v_it->>'id_externo', '') end),
      descricao         = case when v_novo then trim(v_it->>'descricao') else descricao end,
      sku               = coalesce(sku, nullif(trim(v_it->>'sku'), '')),
      tipo              = case when v_novo and v_it->>'tipo' in ('maquina','peca','acessorio','insumo') then v_it->>'tipo' else tipo end,
      unidade           = coalesce(nullif(trim(v_it->>'unidade'), ''), unidade),
      ncm               = coalesce(nullif(regexp_replace(v_it->>'ncm', '\D', '', 'g'), ''), ncm),
      cest              = coalesce(nullif(regexp_replace(v_it->>'cest', '\D', '', 'g'), ''), cest),
      origem            = coalesce((v_it->>'origem')::int, origem),
      preco_venda       = coalesce(nullif((v_it->>'preco_venda')::numeric, 0), preco_venda),
      preco_custo       = coalesce(nullif((v_it->>'preco_custo')::numeric, 0), preco_custo),
      estoque_minimo    = coalesce(nullif((v_it->>'estoque_minimo')::numeric, 0), estoque_minimo),
      estoque_maximo    = coalesce(nullif((v_it->>'estoque_maximo')::numeric, 0), estoque_maximo),
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
      vendavel          = case when v_novo then coalesce((v_it->>'vendavel')::boolean, vendavel) else vendavel end,
      kit               = coalesce((v_it->>'kit')::boolean, kit),
      ativo             = case when v_novo then coalesce((v_it->>'ativo')::boolean, ativo) else ativo end,
      foto_caminho      = coalesce(foto_caminho, nullif(v_it->>'foto', '')),
      fornecedor_padrao_id = coalesce(v_forn, fornecedor_padrao_id),
      motivo_alteracao  = 'Importação da planilha de produtos'
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
