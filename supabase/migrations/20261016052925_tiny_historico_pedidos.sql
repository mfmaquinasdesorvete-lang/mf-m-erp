-- =====================================================================
-- Histórico do Tiny pela API (função tiny-historico): todos os pedidos de venda, com itens, entram como pedidos do
-- ERP e ficam ligados às NF-e do Tiny já importadas (assim a venda não conta duas vezes nos relatórios).
--   * tiny_documentos guarda o JSON que veio do Tiny: dá para refazer a conversão sem consultar o Tiny de novo
--   * pedidos.id_externo = 'tiny:<id do pedido no Tiny>' (importar de novo não duplica)
--   * o histórico não mexe em estoque, contas, comissão, expedição nem avisa cliente: entra direto na situação final
-- Só acrescenta (colunas, tabelas, funções e dois produtos genéricos para item sem cadastro).
-- =====================================================================

alter table public.pedidos add column if not exists id_externo text unique;
alter table public.pedidos add column if not exists numero_externo text;
alter table public.pedidos add column if not exists situacao_origem text;
comment on column public.pedidos.id_externo is 'Origem fora do ERP: tiny:<id do pedido no Tiny>';
comment on column public.pedidos.numero_externo is 'Número do pedido no sistema de origem (Tiny)';
comment on column public.pedidos.situacao_origem is 'Situação do pedido no Tiny na última importação';

create table if not exists public.tiny_documentos (
  tipo          text not null check (tipo in ('pedido', 'nota')),
  tiny_id       text not null,
  dados         jsonb not null,
  situacao      text,
  erro          text,
  importado_em  timestamptz,
  atualizado_em timestamptz not null default now(),
  primary key (tipo, tiny_id)
);
alter table public.tiny_documentos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'tiny_documentos' and policyname = 'tiny_documentos_ler') then
    create policy tiny_documentos_ler on public.tiny_documentos for select to authenticated using (public.is_erp_admin());
  end if;
end $$;

create table if not exists public.importacao_tiny_historico (
  id            int primary key default 1 check (id = 1),
  etapa         text not null default 'notas',
  pagina        int not null default 1,
  indice        int not null default 0,
  unidade_id    uuid references public.unidades(id),
  totais        jsonb not null default '{}'::jsonb,
  erros         jsonb not null default '[]'::jsonb,
  iniciado_por  uuid,
  iniciado_em   timestamptz,
  atualizado_em timestamptz,
  concluido_em  timestamptz
);
alter table public.importacao_tiny_historico enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'importacao_tiny_historico' and policyname = 'importacao_tiny_historico_ler') then
    create policy importacao_tiny_historico_ler on public.importacao_tiny_historico for select to authenticated using (public.is_erp_admin());
  end if;
end $$;

-- item do Tiny sem produto no cadastro: entra com a descrição original num destes (fora de venda e inativos)
insert into public.produtos (sku, descricao, tipo, categoria, unidade, origem, preco_custo, preco_venda, ativo, vendavel, motivo_alteracao)
select v.sku, v.descricao, v.tipo, 'Histórico do Tiny', 'UN', 0, 0, 0, false, false,
       'Item de pedido antigo do Tiny sem produto no cadastro (a descrição original fica no item do pedido).'
  from (values ('TINY-ITEM', 'Item do Tiny sem cadastro', 'peca'),
               ('TINY-MAQUINA', 'Máquina do Tiny sem cadastro', 'maquina')) v(sku, descricao, tipo)
 where not exists (select 1 from public.produtos p where p.sku = v.sku);

/** "31/12/2025" ou "2025-12-31" -> data; outro texto -> null */
create or replace function public.tiny_data(v text) returns date language sql immutable as $$
  select case
    when btrim(coalesce(v, '')) ~ '^\d{1,2}/\d{1,2}/\d{4}' then to_date(substring(btrim(v) from '^\d{1,2}/\d{1,2}/\d{4}'), 'DD/MM/YYYY')
    when btrim(coalesce(v, '')) ~ '^\d{4}-\d{2}-\d{2}' then left(btrim(v), 10)::date
  end $$;

/** "1.234,56", "1234.56" ou 1234.56 -> número; vazio ou texto -> 0 */
create or replace function public.tiny_num(v text) returns numeric language sql immutable as $$
  select case
    when btrim(coalesce(v, '')) ~ '^-?\d{1,3}(\.\d{3})*,\d+$' then replace(replace(btrim(v), '.', ''), ',', '.')::numeric
    when btrim(coalesce(v, '')) ~ '^-?\d+,\d+$' then replace(btrim(v), ',', '.')::numeric
    when btrim(coalesce(v, '')) ~ '^-?\d+(\.\d+)?$' then btrim(v)::numeric
    else 0 end $$;

-- ---------------------------------------------------------------------
-- Pedidos de venda do Tiny (já gravados em tiny_documentos pela função) -> pedidos e pedido_itens
-- ---------------------------------------------------------------------
create or replace function public.importar_pedidos_tiny(p_unidade uuid, p_ids text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d record; p jsonb; c jsonb; it jsonb; parc jsonb;
  v_ped uuid; v_cli uuid; v_doc text; v_nome text; v_sit text; v_status text; v_data date; v_quando timestamptz;
  v_prod uuid; v_qtd numeric; v_vu numeric; v_cod text; v_descr text; v_itens int;
  v_desc numeric; v_frete numeric; v_outras numeric; v_tprod numeric; v_total_tiny numeric; v_total_erp numeric;
  v_forma_txt text; v_forma text; v_parcelas int; v_venc date; v_venc2 date; v_interv int;
  v_vend uuid; v_vend_nome text; v_transp uuid; v_transp_nome text; v_mod int; v_origem text; v_obs text;
  v_generico uuid; v_maquina uuid;
  v_novos int := 0; v_existentes int := 0; v_clientes_novos int := 0; v_itens_sem_cadastro int := 0; v_divergentes int := 0;
  v_erros jsonb := '[]'::jsonb;
begin
  if not public.is_erp_admin() then raise exception 'só o administrador importa o histórico do Tiny'; end if;
  if not exists (select 1 from unidades where id = p_unidade) then raise exception 'escolha a unidade dos pedidos'; end if;
  if p_ids is null or cardinality(p_ids) not between 1 and 200 then raise exception 'envie de 1 a 200 pedidos por vez'; end if;
  select id into v_generico from produtos where sku = 'TINY-ITEM' limit 1;
  select id into v_maquina from produtos where sku = 'TINY-MAQUINA' limit 1;

  for d in select t.tiny_id, t.dados from tiny_documentos t where t.tipo = 'pedido' and t.tiny_id = any(p_ids) loop
    begin
      p := d.dados;
      v_sit := nullif(left(btrim(coalesce(p->>'situacao', '')), 60), '');

      -- já importado: só atualiza a situação do Tiny (a do ERP não muda; mudar dispararia estoque, comissão e avisos)
      select id into v_ped from pedidos where id_externo = 'tiny:' || d.tiny_id;
      if v_ped is not null then
        update pedidos set situacao_origem = v_sit where id = v_ped and situacao_origem is distinct from v_sit;
        update tiny_documentos set importado_em = now(), erro = null where tipo = 'pedido' and tiny_id = d.tiny_id;
        v_existentes := v_existentes + 1;
        continue;
      end if;

      v_status := case
        when v_sit ~* '^cancel' then 'cancelado'
        when v_sit ~* '^entregue' then 'entregue'
        when v_sit ~* 'fatur|atendid|enviado|n[aã]o entregue' then 'faturado'
        when v_sit ~* 'aprovad|preparando|pronto|produ' then 'aprovado'
        else 'orcamento' end;
      v_data := coalesce(public.tiny_data(p->>'data_pedido'), public.tiny_data(p->>'data_faturamento'), current_date);
      v_quando := (v_data + time '12:00') at time zone 'America/Sao_Paulo';

      -- cliente: pelo ID do contato no Tiny, depois CPF/CNPJ, depois o nome (só se houver um com esse nome); senão cadastra
      c := coalesce(p->'cliente', '{}'::jsonb);
      v_doc := nullif(regexp_replace(coalesce(c->>'cpf_cnpj', ''), '\D', '', 'g'), '');
      if v_doc is not null and length(v_doc) not in (11, 14) then v_doc := null; end if;
      v_nome := nullif(left(btrim(coalesce(c->>'nome', p->>'nome', '')), 200), '');
      v_cli := null;
      if nullif(btrim(coalesce(c->>'id', '')), '') is not null then
        select coalesce(unificado_em, id) into v_cli from clientes where id_externo = btrim(c->>'id') limit 1;
      end if;
      if v_cli is null and v_doc is not null then
        select coalesce(unificado_em, id) into v_cli from clientes where cpf_cnpj = v_doc order by arquivado_em nulls first limit 1;
      end if;
      if v_cli is null and v_nome is not null then
        select min(coalesce(unificado_em, id)::text)::uuid into v_cli from clientes where lower(btrim(nome)) = lower(v_nome)
        having count(distinct coalesce(unificado_em, id)) = 1;
      end if;
      if v_cli is null then
        if v_nome is null then raise exception 'pedido sem cliente'; end if;
        insert into clientes (tipo_pessoa, nome, cpf_cnpj, inscricao_estadual, email, telefone, cep, logradouro, numero,
                              complemento, bairro, municipio, uf)
        values (case when length(v_doc) = 11 or (v_doc is null and upper(coalesce(c->>'tipo_pessoa', '')) = 'F') then 'PF' else 'PJ' end,
                v_nome, v_doc,
                nullif(left(btrim(coalesce(c->>'ie', '')), 30), ''),
                nullif(left(btrim(coalesce(c->>'email', '')), 200), ''),
                nullif(left(btrim(coalesce(c->>'fone', '')), 40), ''),
                nullif(left(regexp_replace(coalesce(c->>'cep', ''), '\D', '', 'g'), 8), ''),
                nullif(left(btrim(coalesce(c->>'endereco', '')), 200), ''),
                nullif(left(btrim(coalesce(c->>'numero', '')), 20), ''),
                nullif(left(btrim(coalesce(c->>'complemento', '')), 100), ''),
                nullif(left(btrim(coalesce(c->>'bairro', '')), 100), ''),
                nullif(left(btrim(coalesce(c->>'cidade', '')), 100), ''),
                nullif(upper(left(btrim(coalesce(c->>'uf', '')), 2)), ''))
        returning id into v_cli;
        v_clientes_novos := v_clientes_novos + 1;
      end if;

      -- vendedor e transportadora pelo nome
      v_vend_nome := nullif(left(btrim(coalesce(p->>'nome_vendedor', '')), 100), '');
      v_vend := null;
      if v_vend_nome is not null then select id into v_vend from vendedores where lower(btrim(nome)) = lower(v_vend_nome) limit 1; end if;
      v_transp_nome := nullif(btrim(coalesce(p->>'nome_transportador', '')), '');
      v_transp := null;
      if v_transp_nome is not null then
        select coalesce(unificado_em, id) into v_transp from transportadoras
         where lower(btrim(nome)) = lower(v_transp_nome) or lower(btrim(coalesce(nome_fantasia, ''))) = lower(v_transp_nome) limit 1;
      end if;

      -- pagamento: forma e parcelas
      v_forma_txt := concat_ws(' ', p->>'meio_pagamento', p->>'forma_pagamento',
        (select string_agg(concat_ws(' ', coalesce(x->'parcela', x)->>'forma_pagamento', coalesce(x->'parcela', x)->>'meio_pagamento'), ' ')
           from jsonb_array_elements(case when jsonb_typeof(p->'parcelas') = 'array' then p->'parcelas' else '[]'::jsonb end) x));
      v_forma := case
        when v_forma_txt ~* 'pix' then 'pix'
        when v_forma_txt ~* 'boleto' then 'boleto'
        when v_forma_txt ~* 'cart|cr[eé]dito|d[eé]bito' then 'cartao'
        when v_forma_txt ~* 'dinheiro' then 'dinheiro'
        when v_forma_txt ~* 'dep[oó]sito|transf|ted\M|doc\M' then 'transferencia'
        else 'boleto' end;
      v_parcelas := greatest(1, least(24, coalesce(case when jsonb_typeof(p->'parcelas') = 'array' then jsonb_array_length(p->'parcelas') end, 1)));
      v_venc := null; v_venc2 := null;
      if jsonb_typeof(p->'parcelas') = 'array' and jsonb_array_length(p->'parcelas') > 0 then
        v_venc := public.tiny_data(coalesce(p->'parcelas'->0->'parcela', p->'parcelas'->0)->>'data');
        if jsonb_array_length(p->'parcelas') > 1 then
          v_venc2 := public.tiny_data(coalesce(p->'parcelas'->1->'parcela', p->'parcelas'->1)->>'data');
        end if;
      end if;
      v_interv := greatest(0, least(365, coalesce(v_venc2 - v_venc, 30)));
      v_mod := case upper(left(btrim(coalesce(p->>'frete_por_conta', '')), 1))
        when 'R' then 0 when 'D' then 1 when 'T' then 2 when '3' then 3 when '4' then 4 else 9 end;

      -- valores: o desconto pode vir em % ("10%"); outras despesas entram no frete para o total bater com o do Tiny
      v_tprod := public.tiny_num(p->>'total_produtos');
      v_desc := case when coalesce(p->>'valor_desconto', '') like '%\%%'
                     then round(v_tprod * public.tiny_num(replace(p->>'valor_desconto', '%', '')) / 100, 2)
                     else public.tiny_num(p->>'valor_desconto') end;
      v_outras := public.tiny_num(p->>'outras_despesas');
      v_frete := public.tiny_num(p->>'valor_frete') + v_outras;
      v_total_tiny := public.tiny_num(p->>'total_pedido');

      v_origem := case when nullif(btrim(coalesce(p->'ecommerce'->>'nomeEcommerce', p->'ecommerce'->>'nome', p->>'numero_ecommerce', '')), '') is not null
                       then 'marketplace' else 'tiny' end;
      v_obs := concat_ws(E'\n',
        nullif(btrim(coalesce(p->>'obs', '')), ''),
        case when nullif(btrim(coalesce(p->>'obs_interna', '')), '') is not null then 'Obs. interna no Tiny: ' || btrim(p->>'obs_interna') end,
        case when v_outras <> 0 then 'Outras despesas do Tiny somadas ao frete: ' || to_char(v_outras, 'FM999G999G990D00') end,
        'Importado do Tiny: pedido nº ' || coalesce(nullif(p->>'numero', ''), d.tiny_id) || coalesce(' (' || v_sit || ')', '')
          || coalesce(' · ' || nullif(btrim(coalesce(p->'ecommerce'->>'nomeEcommerce', '')), ''), '')
          || coalesce(' · pedido no marketplace ' || nullif(btrim(coalesce(p->>'numero_ecommerce', '')), ''), '')
          || coalesce(' · forma de pagamento: ' || nullif(btrim(coalesce(p->>'forma_pagamento', '')), ''), ''));

      insert into pedidos (cliente_id, origem, status, vendedor, vendedor_id, forma_pagamento, parcelas, primeiro_vencimento,
                           intervalo_dias, modalidade_frete, desconto, frete, observacoes, aprovado_em, estoque_baixado, created_at,
                           created_by, unidade_id, transportadora_id, codigo_rastreio, enviado_em,
                           id_externo, numero_externo, situacao_origem)
      values (v_cli, v_origem, v_status, coalesce((select nome from vendedores where id = v_vend), v_vend_nome), v_vend, v_forma, v_parcelas, v_venc,
              v_interv, v_mod, greatest(v_desc, 0), greatest(v_frete, 0), left(v_obs, 4000),
              case when v_status <> 'orcamento' then v_quando end,
              v_status in ('faturado', 'entregue'), v_quando, null, p_unidade, v_transp,
              nullif(left(btrim(coalesce(p->>'codigo_rastreamento', '')), 80), ''),
              case when public.tiny_data(p->>'data_envio') is not null
                   then (public.tiny_data(p->>'data_envio') + time '12:00') at time zone 'America/Sao_Paulo' end,
              'tiny:' || d.tiny_id, nullif(left(btrim(coalesce(p->>'numero', '')), 30), ''), v_sit)
      returning id into v_ped;

      -- itens: produto pelo ID do Tiny, código (SKU ou do fabricante) ou descrição igual; senão o genérico
      v_itens := 0;
      for it in select coalesce(x->'item', x) from jsonb_array_elements(case when jsonb_typeof(p->'itens') = 'array' then p->'itens' else '[]'::jsonb end) x loop
        v_qtd := public.tiny_num(it->>'quantidade');
        continue when v_qtd <= 0;
        v_vu := public.tiny_num(it->>'valor_unitario');
        v_cod := nullif(btrim(coalesce(it->>'codigo', '')), '');
        v_descr := coalesce(nullif(btrim(coalesce(it->>'descricao', '')), ''), v_cod, 'Item do pedido');
        v_prod := null;
        if nullif(btrim(coalesce(it->>'id_produto', '')), '') is not null then
          select coalesce(unificado_em, id) into v_prod from produtos where id_externo = btrim(it->>'id_produto') limit 1;
        end if;
        if v_prod is null and v_cod is not null then
          select coalesce(unificado_em, id) into v_prod from produtos where lower(btrim(sku)) = lower(v_cod) order by unificado_em nulls first, ativo desc limit 1;
        end if;
        if v_prod is null and v_cod is not null then
          select coalesce(unificado_em, id) into v_prod from produtos where lower(btrim(codigo_fabricante)) = lower(v_cod) order by unificado_em nulls first, ativo desc limit 1;
        end if;
        if v_prod is null then
          select coalesce(unificado_em, id) into v_prod from produtos where lower(btrim(descricao)) = lower(v_descr) order by unificado_em nulls first, ativo desc limit 1;
        end if;
        if v_prod is null then
          v_itens_sem_cadastro := v_itens_sem_cadastro + 1;
          v_prod := case when v_descr ~* '^(m[aá]quina|my ?frost (a|top|slim|queen|prime|sb))' then v_maquina else v_generico end;
        end if;
        insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, valor_unitario)
        values (v_ped, v_prod, left(case when v_cod is not null and v_prod in (v_generico, v_maquina) then v_cod || ' · ' || v_descr else v_descr end, 300),
                v_qtd, round(v_vu, 4));
        v_itens := v_itens + 1;
      end loop;
      -- pedido sem item com quantidade: um item com o valor dos produtos, para o total não sumir
      if v_itens = 0 and v_tprod > 0 then
        insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, valor_unitario)
        values (v_ped, v_generico, 'Itens do pedido do Tiny (sem detalhe)', 1, v_tprod);
      end if;

      select valor_total into v_total_erp from pedidos where id = v_ped;
      if v_total_tiny > 0 and abs(coalesce(v_total_erp, 0) - v_total_tiny) > 0.05 then v_divergentes := v_divergentes + 1; end if;
      update tiny_documentos set importado_em = now(), erro = null where tipo = 'pedido' and tiny_id = d.tiny_id;
      v_novos := v_novos + 1;
    exception when others then
      update tiny_documentos set erro = left(sqlerrm, 300) where tipo = 'pedido' and tiny_id = d.tiny_id;
      v_erros := v_erros || jsonb_build_object('pedido', coalesce(d.dados->>'numero', d.tiny_id), 'erro', left(sqlerrm, 200));
    end;
  end loop;

  return jsonb_build_object('novos', v_novos, 'existentes', v_existentes, 'clientes_novos', v_clientes_novos,
                            'itens_sem_cadastro', v_itens_sem_cadastro, 'total_diferente', v_divergentes, 'erros', v_erros);
end $$;
revoke all on function public.importar_pedidos_tiny(uuid, text[]) from public, anon;
grant execute on function public.importar_pedidos_tiny(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- Liga as NF-e importadas do Tiny aos pedidos importados (a venda passa a contar pelo pedido, uma vez só)
--   1) pela nota do pedido no Tiny (chave de acesso; ou número e série)
--   2) sem a nota no Tiny: mesma unidade, mesmo cliente, mesmo valor, emitida até 30 dias depois do pedido, e só
--      quando há um único par possível
-- ---------------------------------------------------------------------
create or replace function public.ligar_notas_tiny(p_unidade uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pela_nota int := 0; v_pelo_valor int := 0;
begin
  if not public.is_erp_admin() then raise exception 'só o administrador liga as notas do Tiny'; end if;

  with pt as (
    select pe.id pedido_id, btrim(d.dados->>'id_nota_fiscal') nota_tiny
      from pedidos pe join tiny_documentos d on d.tipo = 'pedido' and pe.id_externo = 'tiny:' || d.tiny_id
     where pe.unidade_id = p_unidade and coalesce(btrim(d.dados->>'id_nota_fiscal'), '') not in ('', '0')
  ), alvo as (
    select distinct on (nf.id) nf.id nota_id, pt.pedido_id
      from pt join tiny_documentos n on n.tipo = 'nota' and n.tiny_id = pt.nota_tiny
      join notas_fiscais nf on nf.unidade_id = p_unidade and nf.pedido_id is null and nf.excluida_em is null
       and ((nullif(btrim(n.dados->>'chave_acesso'), '') is not null and nf.chave = btrim(n.dados->>'chave_acesso'))
         or (nullif(ltrim(btrim(n.dados->>'numero'), '0'), '') is not null
             and ltrim(btrim(nf.numero), '0') = ltrim(btrim(n.dados->>'numero'), '0')
             and coalesce(nullif(ltrim(btrim(nf.serie), '0'), ''), '0') = coalesce(nullif(ltrim(btrim(n.dados->>'serie'), '0'), ''), '0')))
     order by nf.id, (nf.chave = btrim(n.dados->>'chave_acesso')) desc
  ), feito as (
    update notas_fiscais nf set pedido_id = alvo.pedido_id from alvo where nf.id = alvo.nota_id returning nf.id
  )
  select count(*) into v_pela_nota from feito;

  with ped as (
    select pe.id, pe.cliente_id, pe.valor_total, (pe.created_at at time zone 'America/Sao_Paulo')::date dia
      from pedidos pe
     where pe.unidade_id = p_unidade and pe.id_externo like 'tiny:%' and pe.status in ('faturado', 'entregue')
       and not exists (select 1 from notas_fiscais n where n.pedido_id = pe.id)
  ), nf as (
    select n.id, n.cliente_id, n.valor_total, (n.created_at at time zone 'America/Sao_Paulo')::date dia
      from notas_fiscais n
     where n.unidade_id = p_unidade and n.pedido_id is null and n.excluida_em is null and n.origem = 'importada'
       and n.status = 'autorizada' and coalesce(n.tipo_operacao, 'saida') = 'saida'
  ), par as (
    select ped.id pedido_id, nf.id nota_id,
           count(*) over (partition by ped.id) por_pedido, count(*) over (partition by nf.id) por_nota
      from ped join nf on nf.cliente_id = ped.cliente_id and abs(nf.valor_total - ped.valor_total) <= 0.05
                      and nf.dia between ped.dia and ped.dia + 30
  ), feito as (
    update notas_fiscais n set pedido_id = par.pedido_id from par
     where n.id = par.nota_id and par.por_pedido = 1 and par.por_nota = 1 returning n.id
  )
  select count(*) into v_pelo_valor from feito;

  return jsonb_build_object('pela_nota', v_pela_nota, 'pelo_valor', v_pelo_valor);
end $$;
revoke all on function public.ligar_notas_tiny(uuid) from public, anon;
grant execute on function public.ligar_notas_tiny(uuid) to authenticated;
