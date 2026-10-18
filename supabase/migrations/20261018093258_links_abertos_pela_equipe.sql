-- Páginas por link (proposta, cotação e ficha cadastral) abertas por alguém da equipe logado no ERP (para conferir
-- o que o cliente vê, ou pelo "Abrir um exemplo" de Sobre → Módulos) não contam como "o cliente viu": não marcam
-- visualizada/vista e não avisam vendas. Quem abre sem login (o cliente ou o fornecedor) continua marcando.
-- O resto das funções fica igual (a proposta vencida continua virando "expirada" para qualquer um).

create or replace function public.link_aberto_pela_equipe()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select auth.uid() is not null
     and exists (select 1 from public.usuarios_erp where user_id = auth.uid() and ativo);
$$;
comment on function public.link_aberto_pela_equipe() is
  'true quando quem abre uma página por link é um usuário ativo do ERP (a abertura não conta como visualização do cliente).';
revoke all on function public.link_aberto_pela_equipe() from public;
grant execute on function public.link_aberto_pela_equipe() to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.proposta_publica(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ped pedidos; v_cfg configuracoes; v_status text;
begin
  select * into v_ped from pedidos where proposta_token = p_token and proposta_status is not null;
  if not found then return null; end if;
  select * into v_cfg from configuracoes where id = 1;
  v_status := v_ped.proposta_status;
  if v_status in ('enviada', 'visualizada') and v_ped.status = 'orcamento' and v_ped.proposta_validade < current_date then
    update pedidos set proposta_status = 'expirada' where id = v_ped.id;
    v_status := 'expirada';
  elsif v_status = 'enviada' and not public.link_aberto_pela_equipe() then
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
        'garantia_meses', case when p.tipo = 'maquina' then coalesce(p.garantia_meses, v_cfg.garantia_meses_padrao) end,
        'usada', (coalesce(p.descricao, '') || ' ' || coalesce(i.descricao, '')) ~* '(usad[ao]|semi\s*-?\s*nov[ao]|seminov[ao]|recondicionad[ao])') order by i.descricao)
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
      'termo_garantia', v_cfg.termo_garantia, 'termo_usada', nullif(btrim(v_cfg.textos->>'usada_termo'), '')),
    'layout', jsonb_build_object('titulo', v_cfg.proposta_titulo, 'apresentacao', v_cfg.proposta_apresentacao, 'condicoes', v_cfg.proposta_condicoes,
      'rodape', v_cfg.proposta_rodape, 'cor', v_cfg.proposta_cor));
end $function$;

CREATE OR REPLACE FUNCTION public.cotacao_publica(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare cf cotacao_fornecedores; c cotacoes; v_cfg configuracoes;
begin
  select * into cf from cotacao_fornecedores where token = p_token;
  if not found then return null; end if;
  select * into c from cotacoes where id = cf.cotacao_id;
  if c.status = 'rascunho' then return null; end if;
  select * into v_cfg from configuracoes where id = 1;
  if cf.status in ('pendente', 'enviada') and c.status = 'enviada' and not public.link_aberto_pela_equipe() then
    update cotacao_fornecedores set status = 'vista', visto_em = now() where id = cf.id;
    cf.status := 'vista';
  end if;
  return jsonb_build_object(
    'numero', c.numero, 'titulo', c.titulo, 'status', c.status, 'situacao', cf.status,
    'prazo_resposta', c.prazo_resposta, 'entrega_desejada', c.entrega_desejada, 'observacoes', c.observacoes,
    'fornecedor', (select coalesce(nullif(nome_fantasia, ''), nome) from fornecedores where id = cf.fornecedor_id),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'descricao', i.descricao, 'quantidade', i.quantidade, 'unidade', coalesce(i.unidade, p.unidade), 'observacao', i.observacao,
        'codigo_fabricante', p.codigo_fabricante, 'marca', p.marca, 'modelo', p.modelo,
        'seu_codigo', (select f.codigo_fornecedor from fornecimentos f where f.produto_id = i.produto_id and f.fornecedor_id = cf.fornecedor_id),
        'preco_unitario', r.preco_unitario, 'prazo_dias', r.prazo_dias, 'disponivel', coalesce(r.disponivel, true), 'obs_resposta', r.observacao)
        order by i.ordem, i.descricao)
      from cotacao_itens i left join produtos p on p.id = i.produto_id
      left join cotacao_respostas r on r.cotacao_item_id = i.id and r.cotacao_fornecedor_id = cf.id
      where i.cotacao_id = c.id), '[]'::jsonb),
    'condicao_pagamento', cf.condicao_pagamento, 'prazo_entrega_dias', cf.prazo_entrega_dias, 'frete', cf.frete, 'frete_tipo', cf.frete_tipo,
    'validade', cf.validade, 'obs_fornecedor', cf.observacoes, 'respondido_por', cf.respondido_por, 'respondido_em', cf.respondido_em,
    'empresa', jsonb_build_object('nome', coalesce(v_cfg.nome_fantasia, v_cfg.razao_social), 'razao_social', v_cfg.razao_social, 'cnpj', v_cfg.cnpj,
      'whatsapp', v_cfg.whatsapp, 'telefone', v_cfg.telefone, 'email', v_cfg.email, 'municipio', v_cfg.municipio, 'uf', v_cfg.uf),
    'cor', coalesce(v_cfg.proposta_cor, '#0EA5E9'));
end $function$;

CREATE OR REPLACE FUNCTION public.ficha_cadastral_publica(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a clientes_assinaturas; v_cfg configuracoes; v_status text;
begin
  select * into a from clientes_assinaturas where token = p_token and canal = 'link';
  if a.id is null then return null; end if;
  v_status := case when a.status = 'pendente' and a.expira_em < now() then 'vencido' else a.status end;
  if v_status = 'pendente' and a.visualizado_em is null and not public.link_aberto_pela_equipe() then
    update clientes_assinaturas set visualizado_em = now() where id = a.id;
  end if;
  select * into v_cfg from configuracoes where id = 1;
  return jsonb_build_object(
    'status', v_status,
    'termo', a.termo,
    'dados', case v_status when 'pendente' then public.cliente_ficha(a.cliente_id) when 'assinado' then a.dados end,
    'nome', a.nome, 'assinado_em', a.assinado_em, 'hash', a.hash, 'expira_em', a.expira_em,
    'empresa', jsonb_build_object('nome', coalesce(nullif(btrim(v_cfg.nome_fantasia), ''), v_cfg.razao_social), 'razao_social', v_cfg.razao_social,
                                  'cnpj', v_cfg.cnpj, 'whatsapp', v_cfg.whatsapp, 'telefone', v_cfg.telefone, 'email', v_cfg.email));
end $function$;
