-- =====================================================================
-- Mercado Livre (fase 1): as vendas pagas entram sozinhas no ERP
--  * ml_contas: a conta do Mercado Livre conectada (uma, em SP), situação e se o ERP já emite a nota (enquanto o
--    Tiny emite, o ERP não emite: nada de nota em dobro);
--  * ml_anuncios: cada anúncio (e variação) ligado a um produto do ERP — pelo SKU, sozinho, ou escolhido na tela;
--  * ml_pedidos: cada venda do Mercado Livre e a venda do ERP que ela virou (tarifa e frete pagos pela MF para a margem);
--  * Client ID / Client Secret do app e os tokens da conta ficam no cofre (Vault), gravados e lidos só pela função
--    mercadolivre (o navegador nunca lê);
--  * ml_importar_pedido: cliente (achado pelo CPF/CNPJ ou criado), itens, aprovação (estoque e contas a receber pelo
--    valor líquido, na data em que o Mercado Pago libera), cancelamento quando a venda é cancelada lá.
-- Somente acréscimos; cancelar_pedido passa a chamar cancelar_pedido_sistema (mesma regra, sem mudar o comportamento) e
-- aprovar_pedido_sistema aceita dispensar a conferência de estoque só para as vendas já feitas no Mercado Livre.
-- =====================================================================

create table if not exists public.ml_contas (
  id uuid primary key default gen_random_uuid(),
  ml_user_id bigint unique,
  apelido text,
  unidade_id uuid references public.unidades(id),
  status text not null default 'ativa',
  erro text,
  token_expira_em timestamptz,
  conectado_em timestamptz not null default now(),
  sincronizado_em timestamptz,
  ultimas_novas int not null default 0,
  emitir_nfe boolean not null default false,
  aprovar_sem_estoque boolean not null default true,
  importar_desde date not null default (current_date - 3),
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ml_contas_status_valido') then
    alter table public.ml_contas add constraint ml_contas_status_valido check (status in ('ativa', 'erro', 'desligada'));
  end if;
end $$;

create table if not exists public.ml_anuncios (
  id uuid primary key default gen_random_uuid(),
  ml_item_id text not null,
  variation_id text not null default '',
  sku text,
  titulo text,
  produto_id uuid references public.produtos(id),
  ligado_por uuid,
  ligado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (ml_item_id, variation_id)
);

create table if not exists public.ml_pedidos (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid references public.ml_contas(id),
  ml_order_id bigint not null unique,
  ml_pack_id bigint,
  pedido_id uuid references public.pedidos(id),
  status_ml text,
  data_venda timestamptz,
  comprador text,
  total numeric(12,2) not null default 0,
  tarifa numeric(12,2) not null default 0,
  frete_vendedor numeric(12,2) not null default 0,
  liberacao date,
  shipment_id bigint,
  logistica text,
  situacao text not null default 'importada',
  pendencia text,
  aviso text,
  dados jsonb,
  atualizado_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ml_pedidos_situacao_valida') then
    alter table public.ml_pedidos add constraint ml_pedidos_situacao_valida check (situacao in ('importada', 'pendente', 'erro', 'cancelada', 'aguardando'));
  end if;
end $$;
create index if not exists ml_pedidos_pedido on public.ml_pedidos (pedido_id);
create index if not exists ml_pedidos_situacao on public.ml_pedidos (situacao) where situacao in ('pendente', 'erro');

-- quem vende e o financeiro veem; gravação só pela função (service role), exceto ligar anúncio a produto
alter table public.ml_contas enable row level security;
alter table public.ml_anuncios enable row level security;
alter table public.ml_pedidos enable row level security;
do $$ begin
  create policy ml_contas_select on public.ml_contas for select to authenticated using (public.tem_algum_papel(array['vendas', 'financeiro']));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ml_anuncios_select on public.ml_anuncios for select to authenticated using (public.tem_algum_papel(array['vendas', 'financeiro']));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ml_pedidos_select on public.ml_pedidos for select to authenticated using (public.tem_algum_papel(array['vendas', 'financeiro']));
exception when duplicate_object then null; end $$;
revoke all on public.ml_contas, public.ml_anuncios, public.ml_pedidos from anon, authenticated;
grant select on public.ml_contas, public.ml_anuncios, public.ml_pedidos to authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'zz_auditoria' and tgrelid = 'public.ml_anuncios'::regclass) then
    create trigger zz_auditoria before insert or update on public.ml_anuncios for each row execute function public.trg_auditoria();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'zz_auditoria' and tgrelid = 'public.ml_contas'::regclass) then
    create trigger zz_auditoria before insert or update on public.ml_contas for each row execute function public.trg_auditoria();
  end if;
end $$;

-- Estado do "Conectar" (OAuth): vale 15 minutos e só para quem pediu
create table if not exists public.ml_oauth_estados (
  estado text primary key,
  criado_por uuid not null,
  created_at timestamptz not null default now()
);
alter table public.ml_oauth_estados enable row level security;
revoke all on public.ml_oauth_estados from anon, authenticated;

-- ---------------------------------------------------------------------
-- Cofre: chaves do app e tokens da conta (só a função mercadolivre)
-- ---------------------------------------------------------------------
create or replace function public.ml_guardar_segredo(p_nome text, p_valor text)
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid;
begin
  if p_nome not in ('ml_client_id', 'ml_client_secret', 'ml_access_token', 'ml_refresh_token') then raise exception 'segredo inválido'; end if;
  select id into v_id from vault.secrets where name = p_nome;
  if v_id is null then perform vault.create_secret(coalesce(btrim(p_valor), ''), p_nome, 'Mercado Livre');
  else perform vault.update_secret(v_id, coalesce(btrim(p_valor), '')); end if;
end $$;
revoke execute on function public.ml_guardar_segredo(text, text) from public, anon, authenticated;
grant execute on function public.ml_guardar_segredo(text, text) to service_role;

create or replace function public.ml_segredos()
returns jsonb language sql stable security definer set search_path = public, vault as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
    from vault.decrypted_secrets where name in ('ml_client_id', 'ml_client_secret', 'ml_access_token', 'ml_refresh_token');
$$;
revoke execute on function public.ml_segredos() from public, anon, authenticated;
grant execute on function public.ml_segredos() to service_role;

-- Para a tela: as chaves do app já foram informadas? (sem mostrar nenhuma)
create or replace function public.ml_situacao()
returns jsonb language plpgsql stable security definer set search_path = public, vault as $$
begin
  if not public.tem_algum_papel(array['vendas', 'financeiro']) then raise exception 'acesso negado'; end if;
  return jsonb_build_object(
    'chaves', exists (select 1 from vault.decrypted_secrets where name = 'ml_client_id' and coalesce(decrypted_secret, '') <> '')
          and exists (select 1 from vault.decrypted_secrets where name = 'ml_client_secret' and coalesce(decrypted_secret, '') <> ''),
    'pendentes', (select count(*) from ml_pedidos where situacao in ('pendente', 'erro')),
    'avisos', (select count(*) from ml_pedidos where situacao = 'importada' and aviso is not null),
    'sem_produto', (select count(*) from ml_anuncios where produto_id is null));
end $$;
revoke execute on function public.ml_situacao() from public, anon;
grant execute on function public.ml_situacao() to authenticated;

-- ---------------------------------------------------------------------
-- Cancelar venda: a regra de sempre, separada da conferência de papel (o Mercado Livre cancela sem usuário logado)
-- ---------------------------------------------------------------------
create or replace function public.cancelar_pedido_sistema(p_pedido uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ped public.pedidos;
  v_mov record;
begin
  select * into v_ped from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if v_ped.status = 'cancelado' then return; end if;
  if exists (select 1 from public.notas_fiscais where pedido_id = p_pedido and status = 'autorizada') then
    raise exception 'pedido possui NF-e autorizada; cancele a nota antes';
  end if;
  if exists (select 1 from public.contas_receber where pedido_id = p_pedido and status = 'pago') then
    raise exception 'pedido possui parcelas pagas; estorne antes de cancelar';
  end if;

  if v_ped.estoque_baixado then
    for v_mov in select produto_id, numero_serie, unidade_id, sum(case when tipo = 'saida' then abs(quantidade) else -abs(quantidade) end) as q
                   from public.estoque_movimentos where referencia_tipo = 'pedido' and referencia_id = p_pedido and tipo in ('saida', 'entrada')
                  group by produto_id, numero_serie, unidade_id loop
      if v_mov.q > 0 then
        insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie, unidade_id)
        values (v_mov.produto_id, 'entrada', v_mov.q, 'Cancelamento pedido #' || v_ped.numero, 'pedido', p_pedido, v_mov.numero_serie, v_mov.unidade_id);
      end if;
    end loop;
  end if;

  update public.contas_receber set status = 'cancelado' where pedido_id = p_pedido and status = 'aberto';
  update public.pedidos set status = 'cancelado', estoque_baixado = false where id = p_pedido;
end $$;
revoke execute on function public.cancelar_pedido_sistema(uuid) from public, anon, authenticated;
grant execute on function public.cancelar_pedido_sistema(uuid) to service_role;

create or replace function public.cancelar_pedido(p_pedido uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_papel('vendas');
  perform public.cancelar_pedido_sistema(p_pedido);
end $$;

-- ---------------------------------------------------------------------
-- Aprovar venda (rotina interna): a regra de sempre; a conferência de estoque pode ser dispensada só por quem já está
-- dentro do banco (o importador do Mercado Livre liga erp.sem_estoque na própria transação; o navegador não alcança)
-- ---------------------------------------------------------------------
create or replace function public.aprovar_pedido_sistema(p_pedido uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ped public.pedidos;
  v_item record;
  v_comp record;
  v_parcela int;
  v_valor_parcela numeric(12,2);
  v_primeiro date;
  v_itens numeric;
  v_faltas text;
begin
  select * into v_ped from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if v_ped.status <> 'orcamento' then raise exception 'só orçamentos podem ser aprovados'; end if;
  select coalesce(sum(quantidade * valor_unitario), 0) into v_itens from public.pedido_itens where pedido_id = p_pedido;
  if v_itens <= 0 then raise exception 'pedido sem itens'; end if;
  if coalesce(v_ped.desconto, 0) < 0 then raise exception 'o desconto não pode ser negativo'; end if;
  if v_ped.valor_total <= 0 then raise exception 'o desconto (R$ %) é maior que o valor dos itens (R$ %)', replace(round(v_ped.desconto, 2)::text, '.', ','), replace(round(v_itens, 2)::text, '.', ','); end if;
  if v_ped.parcelas not between 1 and 24 then raise exception 'número de parcelas deve ser de 1 a 24'; end if;

  -- não deixa o estoque da unidade ficar negativo (exceto produtos sob encomenda, se a empresa liberar ou venda de marketplace já feita)
  if not coalesce((select vender_sem_estoque from public.configuracoes where id = 1), false)
     and coalesce(current_setting('erp.sem_estoque', true), '') <> 'on' then
    select string_agg(format('%s (pedido %s, estoque %s)', pr.descricao, trim_scale(n.qtd), trim_scale(coalesce(eu.quantidade, 0))), '; ' order by pr.descricao)
      into v_faltas
      from (
        select x.produto_id, sum(x.qtd) as qtd from (
          select i.produto_id, i.quantidade as qtd
            from public.pedido_itens i join public.produtos p on p.id = i.produto_id
           where i.pedido_id = p_pedido and not p.kit
          union all
          select c.componente_id, c.quantidade * i.quantidade
            from public.pedido_itens i join public.produtos p on p.id = i.produto_id
            cross join lateral public.kit_composicao(i.produto_id, i.kit_escolha) c
           where i.pedido_id = p_pedido and p.kit
        ) x group by x.produto_id
      ) n
      join public.produtos pr on pr.id = n.produto_id
      left join public.estoque_unidade eu on eu.produto_id = n.produto_id and eu.unidade_id = coalesce(v_ped.unidade_id, public.unidade_matriz())
     where not pr.sob_encomenda and coalesce(eu.quantidade, 0) < n.qtd;
    if v_faltas is not null then
      raise exception 'estoque insuficiente nesta unidade: %. Transfira estoque, marque o produto como sob encomenda ou libere "vender sem estoque" nas configurações', v_faltas;
    end if;
  end if;

  for v_item in select i.*, p.kit from public.pedido_itens i join public.produtos p on p.id = i.produto_id where i.pedido_id = p_pedido loop
    if v_item.kit then
      for v_comp in select * from public.kit_composicao(v_item.produto_id, v_item.kit_escolha) loop
        insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id)
        values (v_comp.componente_id, 'saida', v_comp.quantidade * v_item.quantidade, 'Pedido #' || v_ped.numero || ' (kit ' || v_item.descricao || ')', 'pedido', p_pedido);
      end loop;
    else
      insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie)
      values (v_item.produto_id, 'saida', v_item.quantidade, 'Pedido #' || v_ped.numero, 'pedido', p_pedido, v_item.numero_serie);
    end if;
  end loop;

  v_primeiro := coalesce(v_ped.primeiro_vencimento,
    current_date + (select dias_vencimento_boleto from public.configuracoes where id = 1));

  for v_parcela in 1..v_ped.parcelas loop
    v_valor_parcela := round(v_ped.valor_total / v_ped.parcelas, 2);
    if v_parcela = v_ped.parcelas then
      v_valor_parcela := v_ped.valor_total - round(v_ped.valor_total / v_ped.parcelas, 2) * (v_ped.parcelas - 1);
    end if;
    insert into public.contas_receber (descricao, cliente_id, pedido_id, parcela, total_parcelas, valor, vencimento, forma_pagamento)
    values ('Pedido #' || v_ped.numero || ' - parcela ' || v_parcela || '/' || v_ped.parcelas,
            v_ped.cliente_id, p_pedido, v_parcela, v_ped.parcelas, v_valor_parcela,
            v_primeiro + (v_parcela - 1) * v_ped.intervalo_dias, v_ped.forma_pagamento);
  end loop;

  update public.pedidos set status = 'aprovado', aprovado_em = now(), estoque_baixado = true where id = p_pedido;

  if (select v.base from vendedores v where v.id = v_ped.vendedor_id) = 'faturamento' then
    perform public.lancar_comissao(p_pedido, v_ped.valor_total, null, 'Pedido #' || v_ped.numero);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Importar uma venda do Mercado Livre (só a função mercadolivre chama; também reprocessa as pendentes)
-- p: { conta_id, order_id, pack_id, status, data, total, tarifa, frete_vendedor, liberacao, shipment_id, logistica,
--      comprador: { apelido, nome, doc, email, telefone, cep, logradouro, numero, complemento, bairro, municipio, uf },
--      itens: [{ item_id, variation_id, sku, titulo, quantidade, valor_unitario }] }
-- ---------------------------------------------------------------------
create or replace function public.ml_importar_pedido(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order bigint := (p->>'order_id')::bigint;
  v_conta public.ml_contas;
  v_reg public.ml_pedidos;
  v_status text := coalesce(p->>'status', '');
  v_comp jsonb := coalesce(p->'comprador', '{}'::jsonb);
  v_doc text := regexp_replace(coalesce(v_comp->>'doc', ''), '\D', '', 'g');
  v_cliente uuid;
  v_pedido uuid;
  v_num bigint;
  v_item jsonb;
  v_prod uuid;
  v_faltam text[] := '{}';
  v_total numeric(12,2) := round(coalesce((p->>'total')::numeric, 0), 2);
  v_tarifa numeric(12,2) := round(coalesce((p->>'tarifa')::numeric, 0), 2);
  v_frete numeric(12,2) := round(coalesce((p->>'frete_vendedor')::numeric, 0), 2);
  v_liq numeric(12,2);
  v_lib date := coalesce((p->>'liberacao')::date, current_date + 30);
  v_unid uuid;
  v_pend text;
  v_sit text;
  v_aviso text;
begin
  if v_order is null then raise exception 'venda do Mercado Livre sem número'; end if;
  select * into v_conta from ml_contas where id = (p->>'conta_id')::uuid;
  if v_conta.id is null then raise exception 'conta do Mercado Livre não encontrada'; end if;
  select * into v_reg from ml_pedidos where ml_order_id = v_order for update;

  -- grava/atualiza o registro da venda (os dados ficam para reprocessar)
  insert into ml_pedidos (conta_id, ml_order_id, ml_pack_id, status_ml, data_venda, comprador, total, tarifa, frete_vendedor, liberacao,
                          shipment_id, logistica, dados, situacao)
  values (v_conta.id, v_order, nullif(p->>'pack_id', '')::bigint, v_status, (p->>'data')::timestamptz,
          coalesce(nullif(v_comp->>'nome', ''), v_comp->>'apelido'), v_total, v_tarifa, v_frete, v_lib,
          nullif(p->>'shipment_id', '')::bigint, p->>'logistica', p, 'aguardando')
  on conflict (ml_order_id) do update set status_ml = excluded.status_ml, ml_pack_id = coalesce(excluded.ml_pack_id, ml_pedidos.ml_pack_id),
    total = excluded.total, tarifa = excluded.tarifa, frete_vendedor = excluded.frete_vendedor, liberacao = excluded.liberacao,
    shipment_id = coalesce(excluded.shipment_id, ml_pedidos.shipment_id), logistica = coalesce(excluded.logistica, ml_pedidos.logistica),
    comprador = coalesce(excluded.comprador, ml_pedidos.comprador), dados = excluded.dados, atualizado_em = now()
  returning * into v_reg;

  -- cancelada no Mercado Livre: cancela a venda do ERP (devolve o estoque, cancela as parcelas em aberto)
  if v_status = 'cancelled' then
    v_sit := 'cancelada'; v_pend := null;
    if v_reg.pedido_id is not null then
      begin
        perform public.cancelar_pedido_sistema(v_reg.pedido_id);
      exception when others then
        v_sit := 'pendente'; v_pend := 'Cancelada no Mercado Livre, mas não deu para cancelar no ERP: ' || sqlerrm;
      end;
    end if;
    update ml_pedidos set situacao = v_sit, pendencia = v_pend where id = v_reg.id;
    return jsonb_build_object('situacao', v_sit, 'pedido_id', v_reg.pedido_id, 'pendencia', v_pend);
  end if;

  -- ainda sem pagamento: espera o próximo aviso
  if v_status not in ('paid', 'confirmed') then
    if v_reg.pedido_id is null then update ml_pedidos set situacao = 'aguardando', pendencia = null where id = v_reg.id; end if;
    return jsonb_build_object('situacao', 'aguardando', 'pedido_id', v_reg.pedido_id);
  end if;

  -- já virou venda no ERP: só tenta de novo a aprovação que tinha ficado pendente
  if v_reg.pedido_id is not null then
    v_pedido := v_reg.pedido_id;
  else
    -- anúncios: ligados ao produto (ou pelo SKU igual ao do cadastro)
    for v_item in select * from jsonb_array_elements(coalesce(p->'itens', '[]'::jsonb)) loop
      insert into ml_anuncios (ml_item_id, variation_id, sku, titulo)
      values (v_item->>'item_id', coalesce(v_item->>'variation_id', ''), nullif(btrim(v_item->>'sku'), ''), v_item->>'titulo')
      on conflict (ml_item_id, variation_id) do update set sku = coalesce(excluded.sku, ml_anuncios.sku), titulo = excluded.titulo;
      select produto_id into v_prod from ml_anuncios where ml_item_id = v_item->>'item_id' and variation_id = coalesce(v_item->>'variation_id', '');
      if v_prod is null and coalesce(btrim(v_item->>'sku'), '') <> '' then
        select id into v_prod from produtos where ativo and lower(btrim(sku)) = lower(btrim(v_item->>'sku')) order by created_at limit 1;
        if v_prod is not null then
          update ml_anuncios set produto_id = v_prod, ligado_em = now() where ml_item_id = v_item->>'item_id' and variation_id = coalesce(v_item->>'variation_id', '');
        end if;
      end if;
      if v_prod is null then v_faltam := v_faltam || (v_item->>'titulo'); end if;
    end loop;
    if array_length(v_faltam, 1) > 0 then
      v_pend := 'Ligar o anúncio a um produto do ERP: ' || array_to_string(v_faltam, '; ');
      update ml_pedidos set situacao = 'pendente', pendencia = v_pend where id = v_reg.id;
      return jsonb_build_object('situacao', 'pendente', 'pendencia', v_pend);
    end if;

    -- cliente: pelo CPF/CNPJ; sem cadastro, cria
    if length(v_doc) in (11, 14) then
      select id into v_cliente from clientes where regexp_replace(coalesce(cpf_cnpj, ''), '\D', '', 'g') = v_doc and arquivado_em is null
       order by created_at limit 1;
    end if;
    if v_cliente is null then
      insert into clientes (tipo_pessoa, nome, cpf_cnpj, email, telefone, cep, logradouro, numero, complemento, bairro, municipio, uf, observacoes, status_crm)
      values (case when length(v_doc) = 14 then 'PJ' else 'PF' end,
              coalesce(nullif(btrim(v_comp->>'nome'), ''), nullif(btrim(v_comp->>'apelido'), ''), 'Comprador do Mercado Livre'),
              nullif(v_doc, ''), nullif(btrim(v_comp->>'email'), ''), nullif(btrim(v_comp->>'telefone'), ''),
              nullif(regexp_replace(coalesce(v_comp->>'cep', ''), '\D', '', 'g'), ''), nullif(btrim(v_comp->>'logradouro'), ''),
              nullif(btrim(v_comp->>'numero'), ''), nullif(btrim(v_comp->>'complemento'), ''), nullif(btrim(v_comp->>'bairro'), ''),
              nullif(btrim(v_comp->>'municipio'), ''), nullif(upper(btrim(v_comp->>'uf')), ''),
              'Cliente do Mercado Livre' || coalesce(' (' || nullif(v_comp->>'apelido', '') || ')', ''), 'cliente')
      returning id into v_cliente;
    end if;

    v_unid := coalesce(v_conta.unidade_id, (select id from unidades where upper(codigo) = 'SP' limit 1), public.unidade_matriz());
    insert into pedidos (cliente_id, origem, status, forma_pagamento, parcelas, primeiro_vencimento, unidade_id,
                         valor_produtos, desconto, frete, valor_total, observacoes)
    values (v_cliente, 'marketplace', 'orcamento', 'transferencia', 1, v_lib, v_unid, v_total, 0, 0, v_total,
            'Mercado Livre: venda nº ' || v_order || coalesce(' (pacote ' || nullif(p->>'pack_id', '') || ')', '')
              || coalesce('. Comprador: ' || nullif(v_comp->>'apelido', ''), ''))
    returning id, numero into v_pedido, v_num;

    for v_item in select * from jsonb_array_elements(p->'itens') loop
      select produto_id into v_prod from ml_anuncios where ml_item_id = v_item->>'item_id' and variation_id = coalesce(v_item->>'variation_id', '');
      insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, valor_unitario)
      values (v_pedido, v_prod, left(coalesce(v_item->>'titulo', ''), 300), coalesce((v_item->>'quantidade')::numeric, 1),
              round(coalesce((v_item->>'valor_unitario')::numeric, 0), 2));
    end loop;
    update ml_pedidos set pedido_id = v_pedido where id = v_reg.id;
  end if;

  -- Full: o estoque está no depósito do Mercado Livre (fase 3); a venda fica para conferir
  if coalesce(p->>'logistica', '') = 'fulfillment' then
    v_pend := 'Venda pelo Full: o estoque está no depósito do Mercado Livre (ainda não controlado pelo ERP). Confira antes de aprovar.';
    update ml_pedidos set situacao = 'pendente', pendencia = v_pend where id = v_reg.id;
    return jsonb_build_object('situacao', 'pendente', 'pedido_id', v_pedido, 'pendencia', v_pend);
  end if;

  -- aprova (baixa o estoque de SP e lança a conta a receber); sem estoque etc., fica pendente com o motivo
  if (select status from pedidos where id = v_pedido) = 'orcamento' then
    begin
      -- a venda já aconteceu no Mercado Livre: com a opção ligada, aprova mesmo sem saldo no ERP (o estoque fica
      -- negativo e a venda ganha um aviso para contar ou transferir)
      if v_conta.aprovar_sem_estoque then perform set_config('erp.sem_estoque', 'on', true); end if;
      perform public.aprovar_pedido_sistema(v_pedido);
      perform set_config('erp.sem_estoque', '', true);
    exception when others then
      perform set_config('erp.sem_estoque', '', true);
      v_pend := 'Venda criada (pedido #' || (select numero from pedidos where id = v_pedido) || '), mas não foi aprovada: ' || sqlerrm;
      update ml_pedidos set situacao = 'pendente', pendencia = v_pend where id = v_reg.id;
      return jsonb_build_object('situacao', 'pendente', 'pedido_id', v_pedido, 'pendencia', v_pend);
    end;
    -- a receber: o líquido (venda - tarifa - frete pago pela MF), na data em que o Mercado Pago libera
    v_liq := v_total - v_tarifa - v_frete;
    if v_liq > 0 then
      update contas_receber
         set valor = v_liq, vencimento = v_lib,
             descricao = 'Mercado Livre venda nº ' || v_order || ' (líquido: tarifa R$ ' || replace(to_char(v_tarifa, 'FM999G990D00'), '.', ',')
                         || ', frete R$ ' || replace(to_char(v_frete, 'FM999G990D00'), '.', ',') || ')'
       where pedido_id = v_pedido and status = 'aberto';
    end if;
  end if;
  -- estoque que ficou negativo na unidade da venda (falta contar ou transferir)
  select 'Estoque ficou negativo: ' || string_agg(distinct pr.descricao, '; ') || '. Faça a contagem ou transfira para a unidade.'
    into v_aviso
    from estoque_movimentos m
    join produtos pr on pr.id = m.produto_id
    join estoque_unidade eu on eu.produto_id = m.produto_id and eu.unidade_id = (select unidade_id from pedidos where id = v_pedido)
   where m.referencia_tipo = 'pedido' and m.referencia_id = v_pedido and eu.quantidade < 0;
  update ml_pedidos set situacao = 'importada', pendencia = null, aviso = v_aviso where id = v_reg.id;
  return jsonb_build_object('situacao', 'importada', 'pedido_id', v_pedido, 'aviso', v_aviso);
exception when others then
  -- não perde o aviso: registra o erro para tentar de novo
  insert into ml_pedidos (conta_id, ml_order_id, status_ml, dados, situacao, pendencia)
  values ((p->>'conta_id')::uuid, v_order, v_status, p, 'erro', left(sqlerrm, 500))
  on conflict (ml_order_id) do update set situacao = 'erro', pendencia = left(sqlerrm, 500), dados = excluded.dados, atualizado_em = now();
  return jsonb_build_object('situacao', 'erro', 'pendencia', sqlerrm);
end $$;
revoke execute on function public.ml_importar_pedido(jsonb) from public, anon, authenticated;
grant execute on function public.ml_importar_pedido(jsonb) to service_role;

-- Ligar um anúncio a um produto (tela) e tentar de novo as vendas que esperavam por ele
create or replace function public.ml_ligar_anuncio(p_anuncio uuid, p_produto uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int := 0; r record; v_res jsonb;
begin
  perform public.exigir_papel('vendas');
  if not exists (select 1 from produtos where id = p_produto and ativo) then raise exception 'produto não encontrado'; end if;
  update ml_anuncios set produto_id = p_produto, ligado_por = auth.uid(), ligado_em = now() where id = p_anuncio;
  if not found then raise exception 'anúncio não encontrado'; end if;
  for r in select dados from ml_pedidos where situacao in ('pendente', 'erro') and pedido_id is null and dados is not null loop
    v_res := public.ml_importar_pedido(r.dados);
    if v_res->>'situacao' = 'importada' then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;
revoke execute on function public.ml_ligar_anuncio(uuid, uuid) from public, anon;
grant execute on function public.ml_ligar_anuncio(uuid, uuid) to authenticated;

-- Tentar de novo as vendas pendentes (ex.: depois de transferir estoque para SP)
create or replace function public.ml_reprocessar()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_res jsonb; v_ok int := 0; v_pend int := 0;
begin
  perform public.exigir_papel('vendas');
  for r in select dados from ml_pedidos where situacao in ('pendente', 'erro') and dados is not null order by data_venda loop
    v_res := public.ml_importar_pedido(r.dados);
    if v_res->>'situacao' = 'importada' then v_ok := v_ok + 1; else v_pend := v_pend + 1; end if;
  end loop;
  return jsonb_build_object('importadas', v_ok, 'pendentes', v_pend);
end $$;
revoke execute on function public.ml_reprocessar() from public, anon;
grant execute on function public.ml_reprocessar() to authenticated;

-- Ajustes da conta (admin): emitir a NF-e pelo ERP (quando o Tiny parar), de quando importar e aprovar sem estoque
create or replace function public.ml_configurar(p_conta uuid, p_emitir_nfe boolean default null, p_importar_desde date default null,
                                                p_aprovar_sem_estoque boolean default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_erp_admin() then raise exception 'só o administrador muda a conexão do Mercado Livre'; end if;
  update ml_contas set emitir_nfe = coalesce(p_emitir_nfe, emitir_nfe), importar_desde = coalesce(p_importar_desde, importar_desde),
         aprovar_sem_estoque = coalesce(p_aprovar_sem_estoque, aprovar_sem_estoque)
   where id = p_conta;
  if not found then raise exception 'conta do Mercado Livre não encontrada'; end if;
end $$;
revoke execute on function public.ml_configurar(uuid, boolean, date, boolean) from public, anon;
grant execute on function public.ml_configurar(uuid, boolean, date, boolean) to authenticated;

-- A cada 30 minutos confere vendas que o aviso do Mercado Livre não trouxe
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'erp-mercadolivre') then
    perform cron.schedule('erp-mercadolivre', '11,41 * * * *', $c$ select public.chamar_funcao('mercadolivre', '{"acao":"sincronizar"}'::jsonb, 120000)
      where exists (select 1 from public.ml_contas where status <> 'desligada') $c$);
  end if;
end $$;
