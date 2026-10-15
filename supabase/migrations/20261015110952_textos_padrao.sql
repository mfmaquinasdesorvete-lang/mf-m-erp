-- =====================================================================
-- Textos padrão dos documentos (Configurações → Orçamentos e garantia):
--  * configuracoes.textos: OP, OC (cotação e condições), OS (comprovante de entrada), termo da ficha cadastral
--    e termo da máquina usada; vazio = texto padrão do sistema;
--  * termo_ficha_cadastral(): usa o texto salvo ({empresa} = nome da empresa) ou o de sempre;
--  * proposta_publica(): marca as máquinas usadas e manda o termo da máquina usada para a página da proposta.
-- Somente acréscimos: uma coluna nova e as mesmas funções com campos a mais.
-- =====================================================================
alter table public.configuracoes add column if not exists textos jsonb not null default '{}'::jsonb;

create or replace function public.termo_ficha_cadastral()
returns text language sql stable security definer set search_path = public as $$
  with c as (select coalesce(nullif(btrim(nome_fantasia), ''), razao_social, 'empresa') as nome,
                    nullif(btrim(textos->>'ficha_termo'), '') as termo
               from configuracoes where id = 1)
  select coalesce(
    (select replace(termo, '{empresa}', nome) from c where termo is not null),
    'Declaro que as informações desta ficha cadastral são verdadeiras e me comprometo a avisar a '
      || coalesce((select nome from c), 'empresa')
      || ' sobre qualquer alteração. Autorizo o uso destes dados para emissão de notas fiscais, entregas, cobranças, garantia, '
      || 'assistência técnica e contato comercial, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). '
      || 'Reconheço como válida esta assinatura eletrônica, registrada com data, hora, endereço IP e código de verificação '
      || '(Medida Provisória nº 2.200-2/2001, art. 10, § 2º).');
$$;

create or replace function public.proposta_publica(p_token uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
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
