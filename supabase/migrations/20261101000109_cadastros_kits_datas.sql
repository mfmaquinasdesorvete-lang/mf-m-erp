-- Cadastros, parte 2:
--  * Produto unificado: a escolha de componentes guardada nos itens de pedido (kit_escolha) passa para o principal,
--    senão o orçamento aprovado depois baixava o estoque a menos (o componente arquivado saía da conta).
--  * Importar kits do Tiny: componente arquivado (unificado) vira o principal; kit arquivado fica de fora.
--  * Passar fornecedor para Clientes: sem CNPJ só aproveita cliente com o mesmo nome que também não tem documento
--    (e da mesma cidade, quando os dois têm cidade); antes casava com qualquer homônimo.
--  * Datas do dia em Brasília (o banco está em UTC): preço/compra do fornecedor e prazos dos pedidos de compra.

create or replace function public.trg_produto_unificado_kit_escolha()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update pedido_itens set kit_escolha = (
      select jsonb_agg(case when e->>'componente_id' = old.id::text then jsonb_set(e, '{componente_id}', to_jsonb(new.unificado_em::text)) else e end order by k)
        from jsonb_array_elements(kit_escolha) with ordinality t(e, k))
   where jsonb_typeof(kit_escolha) = 'array'
     and kit_escolha @> jsonb_build_array(jsonb_build_object('componente_id', old.id::text));
  return null;
end $$;
drop trigger if exists trg_produto_unificado_kit_escolha on public.produtos;
create trigger trg_produto_unificado_kit_escolha after update of unificado_em on public.produtos
  for each row when (old.unificado_em is null and new.unificado_em is not null)
  execute function public.trg_produto_unificado_kit_escolha();

create or replace function public.importar_kits_tiny(p_kits jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_k jsonb; v_i jsonb; v_kit produtos; v_comp uuid; v_q numeric; v_ok boolean;
  n_kits int := 0; n_comp int := 0; n_ign int := 0; v_ja text[] := '{}';
begin
  perform public.exigir_papel('financeiro');
  if jsonb_typeof(p_kits) is distinct from 'array' or jsonb_array_length(p_kits) not between 1 and 300 then
    raise exception 'envie de 1 a 300 kits';
  end if;
  for v_k in select * from jsonb_array_elements(p_kits) loop
    select * into v_kit from produtos where id = nullif(v_k->>'kit_id', '')::uuid;
    -- kit arquivado (unificado em outro) fica de fora
    if not found or not v_kit.kit or v_kit.unificado_em is not null then n_ign := n_ign + 1; continue; end if;
    if exists (select 1 from kit_componentes where kit_id = v_kit.id) then v_ja := v_ja || v_kit.descricao; continue; end if;
    v_ok := false;
    for v_i in select * from jsonb_array_elements(case when jsonb_typeof(v_k->'itens') = 'array' then v_k->'itens' else '[]'::jsonb end) loop
      -- componente unificado: usa o principal
      select coalesce(p.unificado_em, p.id) into v_comp from produtos p where p.id = nullif(v_i->>'componente_id', '')::uuid;
      v_q := round(coalesce(nullif(v_i->>'quantidade', '')::numeric, 0), 3);
      if v_comp is null or v_comp = v_kit.id or v_q <= 0 then
        n_ign := n_ign + 1; continue;
      end if;
      insert into kit_componentes (kit_id, componente_id, quantidade) values (v_kit.id, v_comp, v_q)
        on conflict (kit_id, componente_id) do update set quantidade = kit_componentes.quantidade + excluded.quantidade;
      n_comp := n_comp + 1; v_ok := true;
    end loop;
    if v_ok then n_kits := n_kits + 1; end if;
  end loop;
  return jsonb_build_object('kits', n_kits, 'componentes', n_comp, 'ja_tinham', to_jsonb(v_ja), 'ignorados', n_ign);
end $$;

create or replace function public.fornecedores_virar_cliente(p_ids uuid[], p_manter_fornecedor boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r record; v_cli uuid; v_doc text; k int;
  n_novo int default 0; n_volta int default 0; n_anexos int default 0; n_mantidos int default 0; v_ultimo uuid;
begin
  perform public.exigir_papel('vendas', 'financeiro');
  perform set_config('erp.acao_usuario', 'on', true);
  for r in select f.* from fornecedores f where f.id = any (coalesce(p_ids, '{}')) order by f.nome for update loop
    v_doc = nullif(regexp_replace(coalesce(r.cnpj, ''), '\D', '', 'g'), '');
    v_cli = null;
    if v_doc is not null then
      select c.id into v_cli from clientes c
       where regexp_replace(coalesce(c.cpf_cnpj, c.dados_arquivados->>'cpf_cnpj', ''), '\D', '', 'g') = v_doc
       order by (c.arquivado_em is null) desc, c.created_at limit 1;
    else
      -- sem documento: só o homônimo que também não tem documento e (quando os dois têm) da mesma cidade
      select c.id into v_cli from clientes c
       where lower(btrim(c.nome)) = lower(btrim(r.nome))
         and nullif(regexp_replace(coalesce(c.cpf_cnpj, ''), '\D', '', 'g'), '') is null
         and (nullif(btrim(c.municipio), '') is null or nullif(btrim(r.municipio), '') is null
              or lower(btrim(c.municipio)) = lower(btrim(r.municipio)))
       order by (c.arquivado_em is null) desc, c.created_at limit 1;
    end if;

    if v_cli is not null then
      update clientes c set arquivado_em = null, arquivado_motivo = null,
        cpf_cnpj = coalesce(nullif(c.cpf_cnpj, ''), v_doc),
        email = coalesce(nullif(c.email, ''), r.email), telefone = coalesce(nullif(c.telefone, ''), r.telefone),
        whatsapp = coalesce(nullif(c.whatsapp, ''), r.whatsapp), municipio = coalesce(nullif(c.municipio, ''), r.municipio),
        uf = coalesce(nullif(c.uf, ''), r.uf), cep = coalesce(nullif(c.cep, ''), r.cep),
        logradouro = coalesce(nullif(c.logradouro, ''), r.logradouro), numero = coalesce(nullif(c.numero, ''), r.numero),
        bairro = coalesce(nullif(c.bairro, ''), r.bairro)
       where c.id = v_cli;
      n_volta = n_volta + 1;
    else
      insert into clientes (nome, nome_fantasia, cpf_cnpj, inscricao_estadual, email, telefone, whatsapp, cep, logradouro, numero, complemento,
                            bairro, municipio, uf, observacoes)
      values (r.nome, r.nome_fantasia, v_doc, r.inscricao_estadual, r.email, r.telefone, r.whatsapp, r.cep, r.logradouro, r.numero, r.complemento,
              r.bairro, r.municipio, r.uf, r.observacoes)
      returning id into v_cli;
      n_novo = n_novo + 1;
    end if;

    if p_manter_fornecedor then
      n_mantidos = n_mantidos + 1;
    else
      update documentos set entidade = 'cliente', entidade_id = v_cli where entidade = 'fornecedor' and entidade_id = r.id;
      get diagnostics k = row_count;
      n_anexos = n_anexos + k;
      update fornecedores set ativo = false,
        tags = array(select distinct t from unnest(coalesce(tags, '{}') || array['virou_cliente']) t order by t)
       where id = r.id;
    end if;
    v_ultimo = v_cli;
  end loop;
  return jsonb_build_object('criados', n_novo, 'voltaram', n_volta, 'mantidos', n_mantidos, 'anexos', n_anexos, 'cliente_id', v_ultimo);
end $$;

-- "hoje" no horário de Brasília (current_date nestas funções passa a ser o dia de Brasília)
alter function public.fornecimento_registrar(uuid, uuid, numeric, date, text, text, integer, boolean) set timezone to 'America/Sao_Paulo';
alter function public.trg_pedido_compra_fornecimentos() set timezone to 'America/Sao_Paulo';
alter function public.cotacao_gerar_pedidos(uuid, jsonb) set timezone to 'America/Sao_Paulo';
