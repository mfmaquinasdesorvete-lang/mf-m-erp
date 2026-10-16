-- Backup do Tiny (planilhas exportadas + XML) -> ERP, de uma vez e sem duplicar.
-- Recebe os dados já lidos da planilha (jsonb) e grava, nesta ordem:
--   contatos que ainda não estão no ERP (pelo ID do Tiny, CPF/CNPJ ou, sem documento, pelo nome) com um marcador;
--   produtos que faltam; pedidos de venda (pela importar_pedidos_tiny: sem estoque, comissão nem mensagem) ligados às
--   NF-e já importadas; ordens de compra; contas a receber (e a tarifa do recebimento); contas a pagar; cartas de correção.
-- Contas em aberto entram para aprovação (Financeiro -> Aprovações); as já pagas ou recebidas entram como histórico.
-- Só o administrador. Rodar de novo não duplica nada.
create or replace function public.importar_backup_tiny(p_unidade uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_mk uuid; v_marcador text; v_conta uuid; v_admin uuid := auth.uid();
  v_ids text[]; v_lote text[]; v_r jsonb; i int;
  v_contatos jsonb; v_produtos int := 0; v_ocs int := 0; v_oc_itens int := 0; v_cr int := 0; v_tarifas int := 0;
  v_cp int := 0; v_cp_aprovar int := 0; v_forn int := 0; v_cce int := 0;
  v_ped jsonb := jsonb_build_object('novos', 0, 'existentes', 0, 'clientes_novos', 0, 'itens_sem_cadastro', 0, 'total_diferente', 0, 'erros', '[]'::jsonb);
  v_lig jsonb;
begin
  if not public.is_erp_admin() then raise exception 'só o administrador importa o backup do Tiny'; end if;
  if not exists (select 1 from unidades where id = p_unidade) then raise exception 'escolha a unidade do backup'; end if;
  if jsonb_typeof(p_dados) is distinct from 'object' then raise exception 'dados do backup inválidos'; end if;

  v_marcador := left(coalesce(nullif(btrim(p_dados->>'marcador'), ''), 'Backup Tiny'), 40);
  select id into v_mk from marcadores where nome = v_marcador limit 1;
  if v_mk is null then
    insert into marcadores (nome, cor, ordem) values (v_marcador, 'sky', (select coalesce(max(ordem), 0) + 1 from marcadores))
    returning id into v_mk;
  end if;
  select id into v_conta from contas_bancarias where id = nullif(p_dados->>'conta_bancaria_id', '')::uuid;

  -- 1) contatos: só os que não existem em nenhum cadastro (clientes, fornecedores, transportadoras)
  with c as (
    select x.* from jsonb_to_recordset(coalesce(p_dados->'contatos', '[]')) x(
      id text, nome text, fantasia text, pessoa text, doc text, ie text, contribuinte int, email text, fone text, celular text,
      cep text, endereco text, numero text, complemento text, bairro text, cidade text, uf text, obs text, compra date,
      destino text, tecnico boolean)
     where nullif(btrim(x.nome), '') is not null
  ), docs as materialized (
    select regexp_replace(cpf_cnpj, '\D', '', 'g') doc from clientes where cpf_cnpj ~ '\d'
    union select regexp_replace(cnpj, '\D', '', 'g') from fornecedores where cnpj ~ '\d'
    union select regexp_replace(cnpj, '\D', '', 'g') from transportadoras where cnpj ~ '\d'
  ), ids as materialized (
    select id_externo from clientes where id_externo is not null
    union select id_externo from fornecedores where id_externo is not null
    union select id_externo from transportadoras where id_externo is not null
  ), nomes as materialized (
    select lower(btrim(nome)) nome from clientes
    union select lower(btrim(nome)) from fornecedores
    union select lower(btrim(nome)) from transportadoras
  ), novos as (
    select distinct on (coalesce(nullif(c.doc, ''), 'nome:' || lower(btrim(c.nome)))) c.*
      from c
     where not exists (select 1 from ids where ids.id_externo = c.id)
       and (nullif(c.doc, '') is null or not exists (select 1 from docs where docs.doc = c.doc))
       and (nullif(c.doc, '') is not null or not exists (select 1 from nomes where nomes.nome = lower(btrim(c.nome))))
     order by coalesce(nullif(c.doc, ''), 'nome:' || lower(btrim(c.nome))), c.id
  ), cli as (
    insert into clientes (nome, nome_fantasia, tipo_pessoa, cpf_cnpj, inscricao_estadual, contribuinte_icms, email, telefone,
                          whatsapp, cep, logradouro, numero, complemento, bairro, municipio, uf, observacoes, id_externo,
                          marcadores, tags, compra_maquina_em)
    select left(btrim(n.nome), 200), nullif(btrim(n.fantasia), ''),
           case when length(n.doc) = 11 then 'PF' when length(n.doc) = 14 then 'PJ' when n.pessoa = 'F' then 'PF' else 'PJ' end,
           nullif(n.doc, ''), nullif(n.ie, ''), coalesce(n.contribuinte, 9), nullif(n.email, ''), nullif(n.fone, ''), nullif(n.celular, ''),
           nullif(n.cep, ''), nullif(n.endereco, ''), nullif(n.numero, ''), nullif(n.complemento, ''), nullif(n.bairro, ''),
           nullif(n.cidade, ''), nullif(n.uf, ''), nullif(n.obs, ''), nullif(n.id, ''), array[v_mk],
           case when coalesce(n.tecnico, false) then array['parceiro'] else '{}'::text[] end, n.compra
      from novos n where coalesce(n.destino, 'cliente') = 'cliente'
    on conflict do nothing
    returning 1
  ), forn as (
    insert into fornecedores (nome, nome_fantasia, cnpj, inscricao_estadual, email, telefone, whatsapp, cep, logradouro, numero,
                              complemento, bairro, municipio, uf, observacoes, id_externo, marcadores)
    select left(btrim(n.nome), 200), nullif(btrim(n.fantasia), ''), nullif(n.doc, ''), nullif(n.ie, ''), nullif(n.email, ''),
           nullif(n.fone, ''), nullif(n.celular, ''), nullif(n.cep, ''), nullif(n.endereco, ''), nullif(n.numero, ''),
           nullif(n.complemento, ''), nullif(n.bairro, ''), nullif(n.cidade, ''), nullif(n.uf, ''), nullif(n.obs, ''),
           nullif(n.id, ''), array[v_mk]
      from novos n where n.destino = 'fornecedor'
    on conflict do nothing
    returning 1
  ), transp as (
    insert into transportadoras (nome, nome_fantasia, cnpj, inscricao_estadual, email, telefone, whatsapp, cep, logradouro, numero,
                                 complemento, bairro, municipio, uf, observacoes, id_externo, marcadores)
    select left(btrim(n.nome), 200), nullif(btrim(n.fantasia), ''), nullif(n.doc, ''), nullif(n.ie, ''), nullif(n.email, ''),
           nullif(n.fone, ''), nullif(n.celular, ''), nullif(n.cep, ''), nullif(n.endereco, ''), nullif(n.numero, ''),
           nullif(n.complemento, ''), nullif(n.bairro, ''), nullif(n.cidade, ''), nullif(n.uf, ''), nullif(n.obs, ''),
           nullif(n.id, ''), array[v_mk]
      from novos n where n.destino = 'transportadora'
    on conflict do nothing
    returning 1
  )
  select jsonb_build_object('no_backup', (select count(*) from c), 'clientes_novos', (select count(*) from cli),
                            'fornecedores_novos', (select count(*) from forn), 'transportadoras_novas', (select count(*) from transp))
    into v_contatos;

  -- 2) produtos que faltam (sem estoque: a quantidade do Tiny fica nas observações para a contagem)
  with ins as (
    insert into produtos (descricao, sku, unidade, ncm, cest, origem, preco_venda, preco_custo, peso_kg, codigo_barras, tipo,
                          ativo, vendavel, id_externo, observacoes, marcadores)
    select left(btrim(x.descricao), 300), nullif(btrim(x.sku), ''), coalesce(nullif(btrim(x.unidade), ''), 'UN'),
           nullif(x.ncm, ''), nullif(x.cest, ''), coalesce(x.origem, 0), coalesce(x.preco, 0), coalesce(x.custo, 0), x.peso,
           nullif(x.gtin, ''), coalesce(nullif(x.tipo, ''), 'peca'), coalesce(x.ativo, true), coalesce(x.vendavel, true),
           x.id, nullif(x.obs, ''), array[v_mk]
      from jsonb_to_recordset(coalesce(p_dados->'produtos', '[]')) x(id text, descricao text, sku text, unidade text, ncm text,
           cest text, origem int, preco numeric, custo numeric, peso numeric, gtin text, tipo text, ativo boolean, vendavel boolean, obs text)
     where nullif(btrim(x.descricao), '') is not null
       and not exists (select 1 from produtos p where p.id_externo = x.id)
       and (nullif(btrim(x.sku), '') is null or not exists (select 1 from produtos p where upper(btrim(p.sku)) = upper(btrim(x.sku))))
    on conflict do nothing
    returning 1
  ) select count(*) into v_produtos from ins;

  -- 3) pedidos de venda: guardados como documento do Tiny e importados pela mesma função da API
  insert into tiny_documentos (tipo, tiny_id, dados, situacao)
  select 'pedido', x->>'id', x, x->>'situacao'
    from jsonb_array_elements(coalesce(p_dados->'pedidos', '[]')) x
   where nullif(x->>'id', '') is not null
  on conflict (tipo, tiny_id) do nothing;
  select array_agg(x->>'id' order by x->>'id') into v_ids
    from jsonb_array_elements(coalesce(p_dados->'pedidos', '[]')) x where nullif(x->>'id', '') is not null;
  if v_ids is not null then
    for i in 0 .. (cardinality(v_ids) - 1) / 200 loop
      v_lote := v_ids[i * 200 + 1 : i * 200 + 200];
      v_r := public.importar_pedidos_tiny(p_unidade, v_lote);
      v_ped := jsonb_build_object(
        'novos', (v_ped->>'novos')::int + (v_r->>'novos')::int,
        'existentes', (v_ped->>'existentes')::int + (v_r->>'existentes')::int,
        'clientes_novos', (v_ped->>'clientes_novos')::int + (v_r->>'clientes_novos')::int,
        'itens_sem_cadastro', (v_ped->>'itens_sem_cadastro')::int + (v_r->>'itens_sem_cadastro')::int,
        'total_diferente', (v_ped->>'total_diferente')::int + (v_r->>'total_diferente')::int,
        'erros', (v_ped->'erros') || coalesce(v_r->'erros', '[]'::jsonb));
    end loop;
    v_lig := public.ligar_notas_tiny(p_unidade);
  end if;

  -- 4) fornecedores das ordens de compra e das contas a pagar que ainda não existem
  with x as (
    select f.nome, f.doc, f.contato_id
      from jsonb_to_recordset(coalesce(p_dados->'pagar', '[]')) f(id text, nome text, doc text, contato_id text, folha boolean)
     where not coalesce(f.folha, false)
       and not exists (select 1 from contas_pagar c where c.id_externo = 'tiny:cp:' || f.id)
    union all
    select o.fornecedor_nome, o.fornecedor_doc, o.fornecedor_id
      from jsonb_to_recordset(coalesce(p_dados->'compras', '[]')) o(id text, fornecedor_nome text, fornecedor_doc text, fornecedor_id text)
     where not exists (select 1 from pedidos_compra p where p.observacoes like '%(Tiny ' || o.id || ')%')
  ), ins as (
    insert into fornecedores (nome, cnpj, id_externo, marcadores, observacoes)
    select distinct on (lower(btrim(x.nome))) left(btrim(x.nome), 200), nullif(x.doc, ''), nullif(x.contato_id, ''), array[v_mk],
           'Cadastrado pela importação do backup do Tiny (ordem de compra ou conta a pagar).'
      from x
     where nullif(btrim(x.nome), '') is not null
       and not exists (select 1 from fornecedores f
                        where (nullif(x.contato_id, '') is not null and f.id_externo = x.contato_id)
                           or (nullif(x.doc, '') is not null and regexp_replace(coalesce(f.cnpj, ''), '\D', '', 'g') = x.doc)
                           or lower(btrim(f.nome)) = lower(btrim(x.nome)))
     order by lower(btrim(x.nome)), (nullif(x.doc, '') is null)
    on conflict do nothing
    returning 1
  ) select count(*) into v_forn from ins;

  -- 5) ordens de compra (a identificação do Tiny fica nas observações: "(Tiny <id>)")
  with o as (
    select x.*
      from jsonb_to_recordset(coalesce(p_dados->'compras', '[]')) x(id text, data date, status text, obs text, fornecedor_nome text,
           fornecedor_doc text, fornecedor_id text, itens jsonb)
     where not exists (select 1 from pedidos_compra p where p.observacoes like '%(Tiny ' || x.id || ')%')
  ), ins as (
    insert into pedidos_compra (fornecedor_id, status, observacoes, created_at, enviado_em, unidade_id, marcadores)
    select (select coalesce(f.unificado_em, f.id) from fornecedores f
             where (nullif(o.fornecedor_id, '') is not null and f.id_externo = o.fornecedor_id)
                or (nullif(o.fornecedor_doc, '') is not null and regexp_replace(coalesce(f.cnpj, ''), '\D', '', 'g') = o.fornecedor_doc)
                or lower(btrim(f.nome)) = lower(btrim(o.fornecedor_nome))
             order by (f.id_externo = o.fornecedor_id) desc nulls last limit 1),
           coalesce(nullif(o.status, ''), 'enviado'), o.obs, (o.data + time '12:00') at time zone 'America/Sao_Paulo',
           case when coalesce(nullif(o.status, ''), 'enviado') <> 'cotacao' then (o.data + time '12:00') at time zone 'America/Sao_Paulo' end,
           p_unidade, array[v_mk]
      from o
    returning id, observacoes
  ), itens as (
    insert into pedido_compra_itens (pedido_compra_id, produto_id, descricao, quantidade, custo_unitario)
    select ins.id, pr.id, left(coalesce(nullif(btrim(it.descricao), ''), 'Item da ordem de compra'), 300), it.quantidade, coalesce(it.custo, 0)
      from ins
      join o on ins.observacoes like '%(Tiny ' || o.id || ')%'
      cross join lateral jsonb_to_recordset(coalesce(o.itens, '[]')) it(id_produto text, sku text, descricao text, quantidade numeric, custo numeric)
      join lateral (select coalesce(p.unificado_em, p.id) id from produtos p
                     where (nullif(it.id_produto, '') is not null and p.id_externo = it.id_produto)
                        or (nullif(btrim(it.sku), '') is not null and upper(btrim(p.sku)) = upper(btrim(it.sku)))
                     order by (p.id_externo = it.id_produto) desc nulls last limit 1) pr on true
     where it.quantidade > 0
    returning 1
  ) select (select count(*) from ins), (select count(*) from itens) into v_ocs, v_oc_itens;

  -- 6) contas a receber (ligadas ao pedido importado) e a tarifa que o meio de pagamento descontou
  with r as (
    select x.* from jsonb_to_recordset(coalesce(p_dados->'receber', '[]')) x(id text, pedido_id text, pedido_numero text, cliente text,
           descricao text, emissao date, vencimento date, pagamento date, valor numeric, taxa numeric, pago boolean, forma text)
     where x.valor > 0 and not exists (select 1 from contas_receber c where c.id_externo = 'tiny:cr:' || x.id)
  ), ins as (
    insert into contas_receber (descricao, cliente_id, pedido_id, valor, vencimento, status, forma_pagamento, data_pagamento,
                                valor_pago, unidade_id, conta_bancaria_id, id_externo, categoria, competencia, marcadores, nota_fiscal_id)
    select left(r.descricao || coalesce(' · pedido #' || pe.numero, ''), 300),
           coalesce(pe.cliente_id, (select coalesce(c.unificado_em, c.id) from clientes c where lower(btrim(c.nome)) = lower(btrim(r.cliente)) limit 1)),
           pe.id, r.valor, r.vencimento, case when r.pago then 'pago' else 'aberto' end, coalesce(nullif(r.forma, ''), 'pix'),
           case when r.pago then coalesce(r.pagamento, r.vencimento) end, case when r.pago then r.valor end, p_unidade,
           case when r.pago then v_conta end, 'tiny:cr:' || r.id, 'vendas', date_trunc('month', coalesce(r.emissao, r.vencimento))::date,
           array[v_mk], (select n.id from notas_fiscais n where pe.id is not null and n.pedido_id = pe.id order by n.created_at limit 1)
      from r left join pedidos pe on pe.id_externo = 'tiny:' || r.pedido_id
    returning 1
  ), tarifa as (
    insert into contas_pagar (descricao, categoria, valor, vencimento, status, data_pagamento, valor_pago, conta_bancaria_id,
                              unidade_id, id_externo, competencia, observacoes, marcadores)
    select left('Tarifa do recebimento · ' || r.descricao, 300), 'tarifas bancárias', r.taxa, coalesce(r.pagamento, r.vencimento), 'pago',
           coalesce(r.pagamento, r.vencimento), r.taxa, v_conta, p_unidade, 'tiny:taxa-cr:' || r.id,
           date_trunc('month', coalesce(r.pagamento, r.vencimento))::date,
           'Tarifa descontada no recebimento da conta a receber do Tiny ' || r.id || '.', array[v_mk]
      from r
     where r.pago and coalesce(r.taxa, 0) > 0 and not exists (select 1 from contas_pagar c where c.id_externo = 'tiny:taxa-cr:' || r.id)
    returning 1
  ) select (select count(*) from ins), (select count(*) from tarifa) into v_cr, v_tarifas;

  -- 7) contas a pagar: pagas entram como histórico; em aberto vão para a aprovação
  with p as (
    select x.* from jsonb_to_recordset(coalesce(p_dados->'pagar', '[]')) x(id text, nome text, doc text, contato_id text, folha boolean,
           descricao text, categoria text, emissao date, vencimento date, pagamento date, valor numeric, pago boolean,
           linha_digitavel text, obs text)
     where x.valor > 0 and not exists (select 1 from contas_pagar c where c.id_externo = 'tiny:cp:' || x.id)
  ), ins as (
    insert into contas_pagar (descricao, fornecedor_id, categoria, valor, vencimento, status, data_pagamento, valor_pago,
                              conta_bancaria_id, unidade_id, id_externo, competencia, observacoes, linha_digitavel, marcadores)
    select left(p.descricao, 300),
           case when not coalesce(p.folha, false) then
             (select coalesce(f.unificado_em, f.id) from fornecedores f
               where (nullif(p.contato_id, '') is not null and f.id_externo = p.contato_id)
                  or (nullif(p.doc, '') is not null and regexp_replace(coalesce(f.cnpj, ''), '\D', '', 'g') = p.doc)
                  or lower(btrim(f.nome)) = lower(btrim(p.nome))
               order by (f.id_externo = p.contato_id) desc nulls last limit 1) end,
           coalesce(nullif(p.categoria, ''), 'fornecedores'), p.valor, p.vencimento, case when p.pago then 'pago' else 'aberto' end,
           case when p.pago then coalesce(p.pagamento, p.vencimento) end, case when p.pago then p.valor end,
           case when p.pago then v_conta end, p_unidade, 'tiny:cp:' || p.id,
           date_trunc('month', coalesce(p.emissao, p.vencimento))::date, nullif(p.obs, ''),
           case when p.linha_digitavel ~ '^([0-9]{47}|8[0-9]{47})$' then p.linha_digitavel end, array[v_mk]
      from p
    returning id, status
  ) select count(*), count(*) filter (where status = 'aberto'), coalesce(array_agg(id::text) filter (where status = 'aberto'), '{}')
      into v_cp, v_cp_aprovar, v_ids from ins;
  -- a importação marca tudo como histórico; as em aberto passam pela aprovação antes de pagar
  if cardinality(v_ids) > 0 then
    perform set_config('erp.revisao', 'on', true);
    update contas_pagar set revisao = 'em_revisao' where id::text = any(v_ids) and revisao = 'historico';
    perform set_config('erp.revisao', 'off', true);
  end if;

  -- 8) cartas de correção já autorizadas na SEFAZ (vindas do XML do evento)
  with ins as (
    insert into nfe_cartas_correcao (nota_id, sequencia, correcao, status, mensagem, resposta, created_by, created_at)
    select n.id, x.sequencia, left(btrim(x.correcao), 1000), 'autorizada', coalesce(nullif(x.motivo, ''), 'Evento registrado'),
           jsonb_build_object('protocolo', x.protocolo, 'origem', 'backup do Tiny'), v_admin, coalesce(x.data, now())
      from jsonb_to_recordset(coalesce(p_dados->'cartas_correcao', '[]')) x(chave text, sequencia int, correcao text, motivo text,
           protocolo text, data timestamptz)
      join notas_fiscais n on n.chave = x.chave
     where length(btrim(coalesce(x.correcao, ''))) between 15 and 1000
       and not exists (select 1 from nfe_cartas_correcao c where c.nota_id = n.id and c.sequencia = x.sequencia)
    returning 1
  ) select count(*) into v_cce from ins;

  return jsonb_build_object('marcador', v_marcador, 'contatos', v_contatos, 'produtos_novos', v_produtos, 'pedidos', v_ped,
    'notas_ligadas', v_lig, 'fornecedores_das_contas', v_forn, 'ordens_compra', v_ocs, 'itens_oc', v_oc_itens,
    'contas_receber', v_cr, 'tarifas', v_tarifas, 'contas_pagar', v_cp, 'contas_pagar_para_aprovar', v_cp_aprovar,
    'cartas_correcao', v_cce);
end $$;
revoke all on function public.importar_backup_tiny(uuid, jsonb) from public, anon;
grant execute on function public.importar_backup_tiny(uuid, jsonb) to authenticated;
