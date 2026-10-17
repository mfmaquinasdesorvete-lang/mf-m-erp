-- CT-e automáticos pela SEFAZ (Focus NFe): a cada 15 minutos a função nfe-processar busca os CT-e em que a MF aparece
-- (tomadora, remetente ou destinatária) em SC e em SP, grava o básico da lista e depois o XML. Com o XML o banco sabe
-- quem paga o frete (o tomador), liga a transportadora pela raiz do CNPJ (e cadastra a que ainda não existe) e a nota
-- transportada pela chave (compra em nfe_recebidas, venda/transferência em notas_fiscais). O CT-e que já veio pela
-- planilha da transportadora é o mesmo (raiz + número, ou nota + valor, com emissão até 5 dias de diferença): só ganha
-- a chave e os dados da SEFAZ, sem duplicar. CT-e cancelado fica na lista mas sai das contas e não entra em fatura.
-- Só aditivo: colunas novas, funções novas, criar_fatura_cte refeita só com a trava do cancelado e importar_ctes refeita
-- para a planilha não duplicar o CT-e que já veio da SEFAZ.

alter table public.ctes add column if not exists emitente_cnpj text;
alter table public.ctes add column if not exists emitente_nome text;
alter table public.ctes add column if not exists tomador text check (tomador is null or tomador in ('remetente', 'expedidor', 'recebedor', 'destinatario', 'outros'));
alter table public.ctes add column if not exists tomador_cnpj text;
alter table public.ctes add column if not exists tomador_nome text;
alter table public.ctes add column if not exists situacao text not null default 'autorizado' check (situacao in ('autorizado', 'cancelado', 'denegado'));
alter table public.ctes add column if not exists modelo text;
alter table public.ctes add column if not exists cfop text;
alter table public.ctes add column if not exists uf_inicio text;
alter table public.ctes add column if not exists municipio_inicio text;
alter table public.ctes add column if not exists uf_fim text;
alter table public.ctes add column if not exists municipio_fim text;
alter table public.ctes add column if not exists icms numeric(14,2);
alter table public.ctes add column if not exists produto text;
alter table public.ctes add column if not exists nfe_chaves text[] not null default '{}';
alter table public.ctes add column if not exists cobranca jsonb;
alter table public.ctes add column if not exists xml text;
alter table public.ctes add column if not exists xml_tentativas int not null default 0;
alter table public.ctes add column if not exists focus_versao bigint;
alter table public.ctes add column if not exists sefaz_em timestamptz;
create index if not exists ctes_xml_pendente on public.ctes (emissao desc) where chave is not null and xml is null;

comment on column public.ctes.tomador is 'quem paga o frete pelo CT-e da SEFAZ (remetente = CIF, destinatario = FOB)';
comment on column public.ctes.nfe_chaves is 'chaves das NF-e transportadas (do XML do CT-e)';
comment on column public.ctes.cobranca is 'fatura e duplicatas quando a transportadora informa no próprio CT-e';

/**
 * Grava um CT-e da SEFAZ (chamado só pelas funções do servidor). p_dados: o lido do XML (completo = true) ou só o
 * básico da lista da Focus (chave, emissao, valor, emitente_cnpj, emitente_nome, situacao, versao). p_unidade: a
 * unidade cujo CNPJ trouxe o CT-e. Devolve {id, novo, ligado_planilha}.
 */
create or replace function public.salvar_cte_sefaz(p_dados jsonb, p_unidade uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_chave text := public.so_digitos(p_dados->>'chave');
  v_completo boolean := coalesce((p_dados->>'completo')::boolean, false);
  v_emit text := public.so_digitos(p_dados->>'emitente_cnpj');
  v_raiz text; v_numero text; v_serie text; v_modelo text; v_emissao date; v_valor numeric; v_situacao text;
  v_rem text; v_dest text; v_toma text; v_unid_rem uuid; v_unid_dest uuid; v_unid_toma uuid; v_sentido text; v_paga boolean; v_unid uuid;
  v_frete text; v_transp uuid; v_chaves text[]; v_nf text; v_nf_serie text; v_nfe uuid; v_nota uuid; v_id uuid; v_fatura uuid; v_planilha boolean := false; v_novo boolean := false;
begin
  if v_chave is null or v_chave !~ '^\d{44}$' then raise exception 'CT-e sem chave válida'; end if;
  v_emit := coalesce(v_emit, substr(v_chave, 7, 14));
  v_raiz := left(v_emit, 8);
  v_modelo := coalesce(nullif(p_dados->>'modelo', ''), substr(v_chave, 21, 2));
  v_serie := coalesce(nullif(btrim(p_dados->>'serie'), ''), nullif(ltrim(substr(v_chave, 23, 3), '0'), ''), '0');
  v_numero := coalesce(nullif(btrim(p_dados->>'numero'), ''), nullif(ltrim(substr(v_chave, 26, 9), '0'), ''), '0');
  v_emissao := coalesce(nullif(left(p_dados->>'emissao', 10), '')::date, current_date);
  v_valor := coalesce((p_dados->>'valor')::numeric, 0);
  v_situacao := case when p_dados->>'situacao' in ('autorizado', 'cancelado', 'denegado') then p_dados->>'situacao' else 'autorizado' end;

  -- transportadora: o CNPJ exato, senão a matriz da mesma raiz; se não existir, cadastra (nome do CT-e)
  select id into v_transp from transportadoras
   where left(public.so_digitos(cnpj), 8) = v_raiz and unificado_em is null
   order by (public.so_digitos(cnpj) = v_emit) desc, (matriz_id is null) desc, created_at limit 1;
  if v_transp is null and length(v_emit) = 14 then
    insert into transportadoras (nome, cnpj, observacoes)
    values (coalesce(nullif(btrim(p_dados->>'emitente_nome'), ''), 'Transportadora ' || v_emit), v_emit, 'Cadastrada sozinha pelo CT-e da SEFAZ')
    returning id into v_transp;
  end if;

  select id, fatura_id into v_id, v_fatura from ctes where chave = v_chave;

  if v_completo then
    v_rem := public.so_digitos(p_dados->>'remetente_cnpj');
    v_dest := public.so_digitos(p_dados->>'destinatario_cnpj');
    v_toma := public.so_digitos(p_dados->>'tomador_cnpj');
    select id into v_unid_rem from unidades where public.so_digitos(cnpj) = v_rem;
    select id into v_unid_dest from unidades where public.so_digitos(cnpj) = v_dest;
    select id into v_unid_toma from unidades where public.so_digitos(cnpj) = v_toma;
    v_sentido := case when v_unid_rem is not null and v_unid_dest is not null then 'transferencia'
                      when v_unid_dest is not null then 'entrada' when v_unid_rem is not null then 'saida' else 'outro' end;
    v_paga := v_unid_toma is not null;
    v_unid := coalesce(v_unid_toma, v_unid_dest, v_unid_rem, p_unidade);
    -- CIF ("pago"): paga quem envia; FOB ("à pagar"): paga quem recebe
    v_frete := case p_dados->>'tomador' when 'remetente' then 'pago' when 'destinatario' then 'a_pagar' end;
    v_chaves := coalesce(array(select jsonb_array_elements_text(p_dados->'nfe_chaves')), '{}');
    if cardinality(v_chaves) > 0 then
      v_nf := nullif(ltrim(substr(v_chaves[1], 26, 9), '0'), '');
      v_nf_serie := nullif(ltrim(substr(v_chaves[1], 23, 3), '0'), '');
      select id into v_nfe from nfe_recebidas where chave = any(v_chaves) order by data_emissao desc nulls last limit 1;
      select id into v_nota from notas_fiscais where chave = any(v_chaves) and status = 'autorizada' order by created_at desc limit 1;
    else
      v_nf := nullif(btrim(p_dados#>>'{nf_numeros,0}'), '');
    end if;
  end if;

  -- o mesmo CT-e que veio pela planilha da transportadora (ainda sem chave): não duplica
  if v_id is null then
    select id, fatura_id into v_id, v_fatura from ctes
     where chave is null and transportadora_raiz = v_raiz and abs(emissao - v_emissao) <= 5
       and (ltrim(numero, '0') = v_numero or (v_nf is not null and ltrim(nf_numero, '0') = v_nf and abs(valor - v_valor) < 0.01))
     order by (ltrim(numero, '0') = v_numero) desc, abs(emissao - v_emissao) limit 1;
    v_planilha := v_id is not null;
  end if;

  if v_id is null then
    insert into ctes (transportadora_id, transportadora_raiz, numero, serie, chave, tipo, modelo, emissao, valor, sentido, mf_paga, unidade_id,
                      origem, emitente_cnpj, emitente_nome, situacao, focus_versao, sefaz_em, criado_por)
    values (v_transp, v_raiz, v_numero, v_serie, v_chave, case when v_modelo = '67' then 'CT-e OS' else 'CT-e' end, v_modelo, v_emissao, v_valor,
            'outro', false, p_unidade, 'sefaz', v_emit, nullif(btrim(p_dados->>'emitente_nome'), ''), v_situacao,
            (p_dados->>'versao')::bigint, now(), null)
    returning id into v_id;
    v_novo := true;
  else
    update ctes set chave = v_chave, serie = coalesce(serie, v_serie), modelo = coalesce(modelo, v_modelo),
           emitente_cnpj = v_emit, emitente_nome = coalesce(nullif(btrim(p_dados->>'emitente_nome'), ''), emitente_nome),
           transportadora_id = coalesce(transportadora_id, v_transp), transportadora_raiz = coalesce(transportadora_raiz, v_raiz),
           situacao = v_situacao, focus_versao = coalesce((p_dados->>'versao')::bigint, focus_versao), sefaz_em = coalesce(sefaz_em, now())
     where id = v_id;
  end if;

  if v_completo then
    update ctes set
      tipo = coalesce(nullif(p_dados->>'tipo', ''), tipo), emissao = v_emissao, cfop = p_dados->>'cfop',
      uf_inicio = p_dados->>'uf_inicio', municipio_inicio = p_dados->>'municipio_inicio', uf_fim = p_dados->>'uf_fim', municipio_fim = p_dados->>'municipio_fim',
      remetente_cnpj = coalesce(v_rem, remetente_cnpj), remetente_nome = coalesce(nullif(btrim(p_dados->>'remetente_nome'), ''), remetente_nome),
      destinatario_cnpj = coalesce(v_dest, destinatario_cnpj), destinatario_nome = coalesce(nullif(btrim(p_dados->>'destinatario_nome'), ''), destinatario_nome),
      tomador = p_dados->>'tomador', tomador_cnpj = v_toma, tomador_nome = nullif(btrim(p_dados->>'tomador_nome'), ''),
      frete = coalesce(v_frete, frete), sentido = v_sentido, mf_paga = v_paga, unidade_id = v_unid,
      -- o valor de CT-e que já está numa fatura não muda (a fatura foi conferida com ele)
      valor = case when v_fatura is null then v_valor else valor end,
      nf_numero = coalesce(v_nf, nf_numero), nf_serie = coalesce(v_nf_serie, nf_serie), nf_valor = coalesce((p_dados->>'valor_carga')::numeric, nf_valor),
      nfe_chaves = v_chaves, nfe_recebida_id = coalesce(nfe_recebida_id, v_nfe), nota_fiscal_id = coalesce(nota_fiscal_id, v_nota),
      produto = nullif(btrim(p_dados->>'produto'), ''), peso = coalesce((p_dados->>'peso_kg')::numeric, peso), peso_tipo = case when p_dados->>'peso_kg' is not null then 'KG' else peso_tipo end,
      volumes = coalesce((p_dados->>'volumes')::int, volumes), icms = (p_dados->>'icms')::numeric,
      prev_entrega = coalesce(prev_entrega, nullif(p_dados->>'prev_entrega', '')::date), cobranca = p_dados->'cobranca',
      xml = p_dados->>'xml', xml_tentativas = 0
     where id = v_id;
  end if;
  return jsonb_build_object('id', v_id, 'novo', v_novo, 'ligado_planilha', v_planilha);
end $$;
revoke execute on function public.salvar_cte_sefaz(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.salvar_cte_sefaz(jsonb, uuid) to service_role;

/** Como foi a última busca automática de CT-e (para a tela): quando, quantos e o erro, se houve. */
create or replace function public.ctes_sefaz_situacao()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.tem_papel('financeiro', 'compras', 'expedicao', 'contador') then return null; end if;
  select valor::jsonb into v from sync_estado where chave = 'ctes_recebidas_situacao';
  return coalesce(v, '{}'::jsonb) || jsonb_build_object(
    'pendentes_xml', (select count(*) from ctes where chave is not null and xml is null and xml_tentativas < 30),
    'da_sefaz', (select count(*) from ctes where chave is not null));
end $$;
revoke execute on function public.ctes_sefaz_situacao() from public, anon;
grant execute on function public.ctes_sefaz_situacao() to authenticated;

/** Igual à anterior, com mais uma trava: CT-e cancelado ou denegado não entra em fatura. */
create or replace function public.criar_fatura_cte(p_ctes uuid[], p_numero text, p_vencimento date, p_valor numeric default null,
                                                   p_emissao date default null, p_lancar boolean default true)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_raiz text; v_transp uuid; v_soma numeric; v_qtd int; v_raizes int; v_unid uuid; v_forn uuid; v_nome text; v_fat uuid; v_conta uuid; v_valor numeric;
begin
  perform public.exigir_papel('financeiro');
  if coalesce(btrim(p_numero), '') = '' then raise exception 'informe o número da fatura'; end if;
  if p_vencimento is null then raise exception 'informe o vencimento'; end if;
  if coalesce(array_length(p_ctes, 1), 0) = 0 then raise exception 'escolha os CT-e da fatura'; end if;
  if exists (select 1 from ctes where id = any(p_ctes) and situacao <> 'autorizado') then raise exception 'CT-e cancelado ou denegado não entra em fatura'; end if;
  select count(*), sum(valor), min(transportadora_raiz), (array_agg(transportadora_id))[1], count(distinct coalesce(transportadora_raiz, ''))
    into v_qtd, v_soma, v_raiz, v_transp, v_raizes
    from ctes where id = any(p_ctes) and mf_paga and fatura_id is null;
  if v_qtd <> array_length(p_ctes, 1) then raise exception 'só entram CT-e pagos pela MF e ainda sem fatura'; end if;
  if v_raizes > 1 then raise exception 'os CT-e são de transportadoras diferentes'; end if;
  v_valor := coalesce(p_valor, v_soma);
  select unidade_id into v_unid from ctes where id = any(p_ctes) group by unidade_id order by count(*) desc limit 1;
  select nome into v_nome from transportadoras where id = v_transp;
  insert into cte_faturas (transportadora_id, transportadora_raiz, numero, emissao, vencimento, valor, unidade_id, origem)
  values (v_transp, v_raiz, btrim(p_numero), p_emissao, p_vencimento, v_valor, v_unid, 'manual') returning id into v_fat;
  update ctes set fatura_id = v_fat where id = any(p_ctes);
  if p_lancar then
    select id into v_forn from fornecedores where left(public.so_digitos(cnpj), 8) = v_raiz order by (right(public.so_digitos(cnpj), 6) like '0001%') desc limit 1;
    insert into contas_pagar (descricao, categoria, fornecedor_id, valor, vencimento, status, unidade_id, observacoes)
    values (format('Fatura de frete nº %s · %s (%s CT-e)', btrim(p_numero), coalesce(v_nome, 'transportadora'), v_qtd), 'frete', v_forn, v_valor,
            p_vencimento, 'aberto', v_unid, 'Lançada pela fatura de CT-e (Logística → Fretes e envios → Faturas)')
    returning id into v_conta;
    update cte_faturas set conta_pagar_id = v_conta where id = v_fat;
  end if;
  return v_fat;
end $$;
revoke execute on function public.criar_fatura_cte(uuid[], text, date, numeric, date, boolean) from public, anon;
grant execute on function public.criar_fatura_cte(uuid[], text, date, numeric, date, boolean) to authenticated;

/**
 * (Refeita: o CT-e que já veio da SEFAZ não duplica.) Importa CT-e da planilha da transportadora (linhas já lidas pela tela). Chave: raiz do CNPJ da transportadora +
 * agência de origem + número. CT-e que já existe só atualiza ocorrência, entrega e ligações (a fatura fica).
 * Devolve {novos, atualizados, ignorados}.
 */
create or replace function public.importar_ctes(p_transportadora uuid, p_linhas jsonb, p_arquivo text default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_raiz text; l jsonb; v_rem text; v_dest text; v_unid_rem uuid; v_unid_dest uuid; v_sentido text; v_paga boolean; v_unid uuid;
  v_frete text; v_nfe uuid; v_nota uuid; v_novo boolean; v_novos int := 0; v_atual int := 0; v_ign int := 0;
begin
  perform public.exigir_papel('financeiro', 'compras', 'expedicao');
  select left(public.so_digitos(cnpj), 8) into v_raiz from transportadoras where id = p_transportadora;
  if jsonb_typeof(p_linhas) <> 'array' then raise exception 'linhas inválidas'; end if;
  if jsonb_array_length(p_linhas) > 2000 then raise exception 'no máximo 2000 CT-e por vez'; end if;

  for l in select * from jsonb_array_elements(p_linhas) loop
    if coalesce(btrim(l->>'numero'), '') = '' or (l->>'emissao') is null then v_ign := v_ign + 1; continue; end if;
    v_rem := public.so_digitos(l->>'remetente_cnpj');
    v_dest := public.so_digitos(l->>'destinatario_cnpj');
    select id into v_unid_rem from unidades where public.so_digitos(cnpj) = v_rem;
    select id into v_unid_dest from unidades where public.so_digitos(cnpj) = v_dest;
    v_sentido := case when v_unid_rem is not null and v_unid_dest is not null then 'transferencia'
                      when v_unid_dest is not null then 'entrada' when v_unid_rem is not null then 'saida' else 'outro' end;
    v_frete := case when l->>'frete' in ('pago', 'a_pagar') then l->>'frete' end;
    -- CIF ("pago"): paga quem envia; FOB ("à pagar"): paga quem recebe
    v_paga := (v_frete = 'pago' and v_unid_rem is not null) or (v_frete = 'a_pagar' and v_unid_dest is not null);
    v_unid := case when v_frete = 'pago' then coalesce(v_unid_rem, v_unid_dest) when v_frete = 'a_pagar' then coalesce(v_unid_dest, v_unid_rem)
                   else coalesce(v_unid_dest, v_unid_rem) end;
    v_nfe := null; v_nota := null;
    if v_unid_dest is not null and v_rem is not null and coalesce(l->>'nf_numero', '') <> '' then
      select id into v_nfe from nfe_recebidas
       where public.so_digitos(emitente_cnpj) = v_rem and ltrim(substr(chave, 26, 9), '0') = ltrim(l->>'nf_numero', '0')
       order by data_emissao desc nulls last limit 1;
    end if;
    if v_unid_rem is not null and coalesce(l->>'nf_numero', '') <> '' then
      select id into v_nota from notas_fiscais
       where unidade_id = v_unid_rem and ltrim(numero, '0') = ltrim(l->>'nf_numero', '0') and status = 'autorizada'
       order by created_at desc limit 1;
    end if;

    -- o mesmo CT-e já veio da SEFAZ (com chave, sem agência): recebe a agência e cai no "já existe" abaixo, sem duplicar
    update ctes set ag_origem = nullif(btrim(l->>'ag_origem'), ''), ag_destino = coalesce(ag_destino, nullif(btrim(l->>'ag_destino'), ''))
     where chave is not null and ag_origem is null and transportadora_raiz = v_raiz and numero = btrim(l->>'numero')
       and abs(emissao - (l->>'emissao')::date) <= 5 and nullif(btrim(l->>'ag_origem'), '') is not null;

    insert into ctes (transportadora_id, transportadora_raiz, numero, tipo, emissao, ag_origem, ag_destino, remetente_cnpj, remetente_nome,
                      destinatario_cnpj, destinatario_nome, nf_numero, nf_serie, nf_valor, frete, peso_tipo, peso, volumes, valor,
                      prev_entrega, ocorrencia, ocorrencia_em, sentido, mf_paga, unidade_id, nfe_recebida_id, nota_fiscal_id, origem, arquivo)
    values (p_transportadora, v_raiz, btrim(l->>'numero'), coalesce(nullif(btrim(l->>'tipo'), ''), 'CT-e'), (l->>'emissao')::date,
            nullif(btrim(l->>'ag_origem'), ''), nullif(btrim(l->>'ag_destino'), ''), v_rem, nullif(btrim(l->>'remetente_nome'), ''),
            v_dest, nullif(btrim(l->>'destinatario_nome'), ''), nullif(btrim(l->>'nf_numero'), ''), nullif(btrim(l->>'nf_serie'), ''),
            (l->>'nf_valor')::numeric, v_frete, nullif(btrim(l->>'peso_tipo'), ''), (l->>'peso')::numeric, (l->>'volumes')::int,
            coalesce((l->>'valor')::numeric, 0), (l->>'prev_entrega')::date, nullif(btrim(l->>'ocorrencia'), ''), (l->>'ocorrencia_em')::timestamptz,
            v_sentido, v_paga, v_unid, v_nfe, v_nota, 'planilha', p_arquivo)
    on conflict (coalesce(transportadora_raiz, ''), coalesce(ag_origem, ''), numero) do update
       set ocorrencia = excluded.ocorrencia, ocorrencia_em = excluded.ocorrencia_em, prev_entrega = excluded.prev_entrega,
           nfe_recebida_id = coalesce(ctes.nfe_recebida_id, excluded.nfe_recebida_id), nota_fiscal_id = coalesce(ctes.nota_fiscal_id, excluded.nota_fiscal_id),
           transportadora_id = coalesce(ctes.transportadora_id, excluded.transportadora_id)
    returning (xmax = 0) into v_novo;
    if v_novo then v_novos := v_novos + 1; else v_atual := v_atual + 1; end if;
  end loop;
  return jsonb_build_object('novos', v_novos, 'atualizados', v_atual, 'ignorados', v_ign);
end $$;
revoke execute on function public.importar_ctes(uuid, jsonb, text) from public, anon;
grant execute on function public.importar_ctes(uuid, jsonb, text) to authenticated;
