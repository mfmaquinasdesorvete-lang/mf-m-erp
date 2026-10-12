-- Link de pagamento do pedido (InfinitePay): um link só para o que falta pagar do pedido, já na aprovação da venda.
--  * cobrancas_link.pedido_id: link do pedido. Com uma parcela em aberto, o link fica ligado também à conta
--    (baixa como antes); com várias, a baixa é feita em todas as parcelas em aberto do pedido;
--  * configuracoes.link_pagamento_ao_aprovar: ao aprovar uma venda por Pix ou cartão, o ERP já cria o link;
--  * a página da proposta mostra "Pagar agora" depois da aprovação (venda por Pix ou cartão) e a área do
--    cliente ganha o botão de pagar com cartão (contas por Pix/cartão ou vencidas). Os links públicos são criados
--    pela função infinitepay, que confere tudo de novo.
--  * pedido reaberto ou cancelado: os links dele em aberto saem da tela (se forem pagos, o ERP registra e avisa).

alter table public.cobrancas_link add column if not exists pedido_id uuid references public.pedidos(id) on delete set null;
create index if not exists cobrancas_link_pedido_idx on public.cobrancas_link (pedido_id);

alter table public.configuracoes add column if not exists link_pagamento_ao_aprovar boolean not null default true;

-- Pagamento aprovado e conferido na InfinitePay: registra no link e dá baixa na conta (ou nas parcelas do pedido).
-- Chamada só pela função infinitepay (service role). Repetir o mesmo aviso não faz nada.
create or replace function public.confirmar_cobranca_link(p_id uuid, p_nsu text, p_slug text, p_metodo text,
  p_parcelas integer, p_valor_pago numeric, p_recibo text, p_aviso jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare l cobrancas_link; c contas_receber; v_banco uuid; v_forma text; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
        v_taxa numeric; v_valor_taxa numeric; v_conta_taxa uuid; v_como text;
        v_unidade uuid; v_base numeric; v_cb uuid; v_qtd int; v_aberto numeric;
begin
  select * into l from cobrancas_link where id = p_id for update;
  if l.id is null then return 'link não encontrado'; end if;
  if l.status = 'pago' then return 'já registrado'; end if;

  update cobrancas_link set status = 'pago', transaction_nsu = p_nsu, slug = p_slug, metodo = p_metodo, parcelas = p_parcelas,
         valor_pago = p_valor_pago, recibo_url = p_recibo, aviso = p_aviso, pago_em = now(), erro = null
   where id = p_id;

  v_forma := case when lower(coalesce(p_metodo, '')) = 'pix' then 'pix' else 'cartao' end;
  v_como := case when v_forma = 'pix' then 'Pix' else 'cartão' || case when coalesce(p_parcelas, 1) > 1 then ' em ' || p_parcelas || 'x' else '' end end;

  if l.conta_receber_id is not null then
    select * into c from contas_receber where id = l.conta_receber_id for update;
    if c.id is null or c.status <> 'aberto' then
      update cobrancas_link set erro = 'A conta não estava mais em aberto: confira se o cliente pagou duas vezes.' where id = p_id;
      perform public.notificar('pagamento', 'Link pago, mas a conta não estava em aberto', concat_ws(' · ', l.descricao, public.brl(p_valor_pago)),
        '/financeiro', '{financeiro}', l.unidade_id);
      return 'conta não estava em aberto';
    end if;
    if round(l.valor, 2) < round(c.valor, 2) then
      update cobrancas_link set erro = 'O link era de ' || public.brl(l.valor) || ' e a conta está em ' || public.brl(c.valor) || ': dê a baixa manual.' where id = p_id;
      perform public.notificar('pagamento', 'Link pago com valor menor que a conta', concat_ws(' · ', l.descricao, public.brl(l.valor)),
        '/financeiro', '{financeiro}', l.unidade_id);
      return 'valor menor que a conta';
    end if;

    select id into v_banco from contas_bancarias where ativo and banco = 'infinitepay' and unidade_id = c.unidade_id order by created_at limit 1;
    v_unidade := c.unidade_id; v_base := c.valor; v_cb := coalesce(c.conta_bancaria_id, v_banco);
    begin
      update contas_receber set status = 'pago', data_pagamento = v_hoje, valor_pago = c.valor, forma_pagamento = v_forma,
             conta_bancaria_id = coalesce(c.conta_bancaria_id, v_banco),
             motivo_alteracao = 'Pago pelo link InfinitePay (' || v_como || ', NSU ' || coalesce(p_nsu, '?') || ')'
       where id = c.id;
      update cobrancas_link set baixa_em = now() where id = p_id;
    exception when others then
      update cobrancas_link set erro = 'Pagamento recebido, mas a baixa não foi feita: ' || sqlerrm where id = p_id;
      perform public.notificar('pagamento', 'Link pago: falta dar baixa', concat_ws(' · ', l.descricao, sqlerrm), '/financeiro', '{financeiro}', l.unidade_id);
      return 'baixa não feita: ' || sqlerrm;
    end;

  elsif l.pedido_id is not null then
    -- link do pedido: baixa todas as parcelas em aberto
    perform 1 from contas_receber where pedido_id = l.pedido_id and status = 'aberto' for update;
    select count(*), coalesce(sum(valor), 0) into v_qtd, v_aberto from contas_receber where pedido_id = l.pedido_id and status = 'aberto';
    if v_qtd = 0 then
      update cobrancas_link set erro = 'O pedido não tinha mais parcela em aberto (pago de outro jeito, reaberto ou cancelado): confira e devolva, se for o caso.' where id = p_id;
      perform public.notificar('pagamento', 'Link do pedido pago, mas não havia parcela em aberto', concat_ws(' · ', l.descricao, public.brl(p_valor_pago)),
        '/financeiro', '{financeiro}', l.unidade_id);
      return 'pedido sem parcela em aberto';
    end if;
    if round(l.valor, 2) < round(v_aberto, 2) then
      update cobrancas_link set erro = 'O link era de ' || public.brl(l.valor) || ' e o pedido tem ' || public.brl(v_aberto) || ' em aberto: dê a baixa manual.' where id = p_id;
      perform public.notificar('pagamento', 'Link do pedido pago com valor menor que o saldo', concat_ws(' · ', l.descricao, public.brl(l.valor)),
        '/financeiro', '{financeiro}', l.unidade_id);
      return 'valor menor que o pedido';
    end if;

    select id into v_banco from contas_bancarias where ativo and banco = 'infinitepay' and unidade_id = l.unidade_id order by created_at limit 1;
    v_unidade := l.unidade_id; v_base := v_aberto; v_cb := v_banco;
    begin
      update contas_receber set status = 'pago', data_pagamento = v_hoje, valor_pago = valor, forma_pagamento = v_forma,
             conta_bancaria_id = coalesce(conta_bancaria_id, v_banco),
             motivo_alteracao = 'Pago pelo link InfinitePay do pedido (' || v_como || ', NSU ' || coalesce(p_nsu, '?') || ')'
       where pedido_id = l.pedido_id and status = 'aberto';
      update cobrancas_link set baixa_em = now(),
             erro = case when round(l.valor, 2) > round(v_aberto, 2)
                         then 'O cliente pagou ' || public.brl(l.valor - v_aberto) || ' a mais que o saldo do pedido: devolva ou deixe como crédito.' end
       where id = p_id;
    exception when others then
      update cobrancas_link set erro = 'Pagamento recebido, mas a baixa não foi feita: ' || sqlerrm where id = p_id;
      perform public.notificar('pagamento', 'Link do pedido pago: falta dar baixa', concat_ws(' · ', l.descricao, sqlerrm), '/financeiro', '{financeiro}', l.unidade_id);
      return 'baixa não feita: ' || sqlerrm;
    end;
    if round(l.valor, 2) > round(v_aberto, 2) then
      perform public.notificar('pagamento', 'Link do pedido pago a mais', concat_ws(' · ', l.descricao, public.brl(l.valor - v_aberto) || ' a mais'),
        '/financeiro', '{financeiro}', l.unidade_id);
    end if;
    v_base := l.valor;

  else
    return 'pago (sem conta ligada)';
  end if;

  -- taxa da InfinitePay (paga pela MF): despesa já paga na mesma conta bancária
  select public.taxa_infinitepay(u.infinitepay_taxas, p_metodo, p_parcelas) into v_taxa from unidades u where u.id = l.unidade_id;
  if v_taxa is null then return 'baixa feita (taxa não cadastrada)'; end if;
  v_valor_taxa := round(v_base * v_taxa / 100, 2);
  update cobrancas_link set taxa_percentual = v_taxa, taxa_valor = v_valor_taxa where id = p_id;
  if v_valor_taxa <= 0 then return 'baixa feita'; end if;
  begin
    insert into contas_pagar (descricao, categoria, valor, vencimento, status, data_pagamento, valor_pago, unidade_id, conta_bancaria_id,
                              id_externo, competencia, observacoes)
    values ('Taxa InfinitePay: ' || l.descricao || ' (' || v_como || ')', 'tarifas bancárias', v_valor_taxa, v_hoje, 'pago', v_hoje,
            v_valor_taxa, v_unidade, v_cb, 'infinitepay-taxa:' || l.id, date_trunc('month', v_hoje)::date,
            v_taxa || '% sobre ' || public.brl(v_base) || ', NSU ' || coalesce(p_nsu, '?') || '. Lançada pelo ERP quando o link foi pago.')
    returning id into v_conta_taxa;
    update cobrancas_link set conta_taxa_id = v_conta_taxa where id = p_id;
  exception when others then
    update cobrancas_link set erro = 'Baixa feita, mas a taxa não foi lançada: ' || sqlerrm where id = p_id;
    perform public.notificar('pagamento', 'Link pago: lance a taxa da InfinitePay', concat_ws(' · ', l.descricao, public.brl(v_valor_taxa), sqlerrm),
      '/financeiro', '{financeiro}', l.unidade_id);
  end;
  return 'baixa feita';
end $$;
revoke execute on function public.confirmar_cobranca_link(uuid, text, text, text, integer, numeric, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirmar_cobranca_link(uuid, text, text, text, integer, numeric, text, jsonb) to service_role;

-- Pedido reaberto (volta a orçamento) ou cancelado: os links dele em aberto saem da tela.
create or replace function public.trg_pedido_links_descartar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('orcamento', 'cancelado') and old.status in ('aprovado', 'faturado', 'entregue') then
    update cobrancas_link set status = 'descartado'
     where status in ('aberto', 'erro')
       and (pedido_id = new.id
            or conta_receber_id in (select id from contas_receber where pedido_id = new.id and status not in ('aberto', 'pago')));
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_pedido_links_descartar' and tgrelid = 'public.pedidos'::regclass) then
    create trigger trg_pedido_links_descartar after update of status on public.pedidos
      for each row execute function public.trg_pedido_links_descartar();
  end if;
end $$;

-- Proposta pública: depois de aprovada, mostra o que falta pagar e se dá para pagar pelo link (venda por Pix ou cartão,
-- com o link ligado nas configurações).
create or replace function public.proposta_publica(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_cfg configuracoes; v_status text;
begin
  select * into v_ped from pedidos where proposta_token = p_token and proposta_status is not null;
  if not found then return null; end if;
  select * into v_cfg from configuracoes where id = 1;
  v_status := v_ped.proposta_status;
  if v_status in ('enviada', 'visualizada') and v_ped.status = 'orcamento' and v_ped.proposta_validade < current_date then
    update pedidos set proposta_status = 'expirada' where id = v_ped.id;
    v_status := 'expirada';
  elsif v_status = 'enviada' then
    update pedidos set proposta_status = 'visualizada', proposta_visualizada_em = now() where id = v_ped.id;
    v_status := 'visualizada';
    perform notificar('proposta', 'Proposta #' || v_ped.numero || ' aberta pelo cliente',
      (select nome from clientes where id = v_ped.cliente_id), '/pedidos', '{vendas}', v_ped.unidade_id);
  end if;
  return jsonb_build_object(
    'numero', v_ped.numero, 'data', v_ped.proposta_enviada_em, 'validade', v_ped.proposta_validade, 'status', v_status,
    'pedido_status', v_ped.status, 'cliente', (select nome from clientes where id = v_ped.cliente_id),
    'vendedor', coalesce((select nome from vendedores where id = v_ped.vendedor_id), v_ped.vendedor),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'descricao', i.descricao, 'quantidade', i.quantidade, 'valor_unitario', i.valor_unitario, 'total', i.quantidade * i.valor_unitario,
        'foto', case when v_cfg.proposta_fotos then p.foto_caminho end, 'texto', p.descricao_catalogo,
        'garantia_meses', case when p.tipo = 'maquina' then coalesce(p.garantia_meses, v_cfg.garantia_meses_padrao) end) order by i.descricao)
      from pedido_itens i left join produtos p on p.id = i.produto_id where i.pedido_id = v_ped.id), '[]'::jsonb),
    'subtotal', v_ped.valor_produtos, 'desconto', v_ped.desconto, 'frete', v_ped.frete, 'total', v_ped.valor_total,
    'forma_pagamento', v_ped.forma_pagamento, 'parcelas', v_ped.parcelas, 'observacoes', v_ped.observacoes,
    'motivo_rejeicao', v_ped.motivo_rejeicao,
    'pagamento', case when v_ped.status in ('aprovado', 'faturado', 'entregue') then jsonb_build_object(
        'em_aberto', (select coalesce(sum(valor), 0) from contas_receber where pedido_id = v_ped.id and status = 'aberto'),
        'pago', (select coalesce(sum(coalesce(valor_pago, valor)), 0) from contas_receber where pedido_id = v_ped.id and status = 'pago'),
        'link', coalesce(v_cfg.link_pagamento_ao_aprovar, true) and v_ped.forma_pagamento in ('pix', 'cartao')
                and exists (select 1 from unidades u where u.id = coalesce(v_ped.unidade_id, public.unidade_matriz()) and u.infinitepay_tag is not null)) end,
    'empresa', jsonb_build_object('nome', coalesce(v_cfg.nome_fantasia, v_cfg.razao_social), 'razao_social', v_cfg.razao_social, 'cnpj', v_cfg.cnpj,
      'whatsapp', v_cfg.whatsapp, 'telefone', v_cfg.telefone, 'email', v_cfg.email, 'endereco', v_cfg.endereco, 'municipio', v_cfg.municipio, 'uf', v_cfg.uf,
      'termo_garantia', v_cfg.termo_garantia),
    'layout', jsonb_build_object('titulo', v_cfg.proposta_titulo, 'apresentacao', v_cfg.proposta_apresentacao, 'condicoes', v_cfg.proposta_condicoes,
      'rodape', v_cfg.proposta_rodape, 'cor', v_cfg.proposta_cor));
end $$;
revoke execute on function public.proposta_publica(uuid) from public;
grant execute on function public.proposta_publica(uuid) to anon, authenticated;

-- Área do cliente: cada conta diz se dá para pagar pelo link (Pix/cartão ou vencida, com InfinitePay na unidade).
create or replace function public.area_cliente(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c clientes; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into c from clientes where portal_token = p_token;
  if c.id is null then return null; end if;
  return jsonb_build_object(
    'cliente', coalesce(nullif(btrim(c.nome_fantasia), ''), c.nome),
    'empresa', (select jsonb_build_object('nome', coalesce(nullif(btrim(nome_fantasia), ''), razao_social), 'whatsapp', whatsapp, 'telefone', telefone, 'email', email)
                  from configuracoes where id = 1),
    'abertas', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'descricao', r.descricao, 'valor', r.valor, 'vencimento', r.vencimento, 'forma', r.forma_pagamento,
               'pagamento', u.instrucoes_pagamento, 'pix_chave', nullif(btrim(u.pix_chave), ''),
               'pix_nome', coalesce(nullif(btrim(u.pix_nome), ''), u.razao_social, u.nome), 'pix_cidade', coalesce(nullif(btrim(u.pix_cidade), ''), u.municipio),
               'link', (r.forma_pagamento in ('pix', 'cartao') or r.vencimento < v_hoje)
                       and (case when r.unidade_id is null then (select m.infinitepay_tag from unidades m where m.matriz limit 1)
                                 else u.infinitepay_tag end) is not null)
             order by r.vencimento)
        from contas_receber r left join unidades u on u.id = r.unidade_id
       where r.cliente_id = c.id and r.status = 'aberto'), '[]'::jsonb),
    'pagas', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('descricao', descricao, 'valor', coalesce(valor_pago, valor), 'data_pagamento', data_pagamento) x
          from contas_receber where cliente_id = c.id and status = 'pago' order by data_pagamento desc nulls last limit 10) t), '[]'::jsonb));
end $$;
revoke execute on function public.area_cliente(uuid) from public;
grant execute on function public.area_cliente(uuid) to anon, authenticated;
