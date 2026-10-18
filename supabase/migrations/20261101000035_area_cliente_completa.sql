-- Página do cliente (/cliente/<código>) completa: além das contas, as máquinas dele (com o link da página de cada
-- uma, onde ficam manuais, dicas e garantia), as manutenções (OS) e as compras (peças e máquinas, com o rastreio).
-- Só leitura, pelo código secreto do cliente; nada de custo, margem ou dado interno.
create or replace function public.area_cliente(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c clientes;
  v_hoje date default (now() at time zone 'America/Sao_Paulo')::date;
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
          from contas_receber where cliente_id = c.id and status = 'pago' order by data_pagamento desc nulls last limit 10) t), '[]'::jsonb),
    'maquinas', coalesce((
      select jsonb_agg(x) from (
        select jsonb_strip_nulls(jsonb_build_object('token', e.token, 'descricao', coalesce(p.descricao, e.descricao), 'modelo', p.modelo,
                 'numero_serie', e.numero_serie, 'data_venda', e.data_venda, 'garantia_ate', e.garantia_ate,
                 'proxima_preventiva', e.proxima_preventiva, 'usada', e.usada, 'foto', p.foto_caminho,
                 'manuais', (select count(*) from produtos_midia m where m.produto_id = p.id and m.ativo and m.tipo in ('manual', 'eletrico', 'dicas')))) x
          from equipamentos e left join produtos p on p.id = e.produto_id
         where e.cliente_id = c.id
         order by e.data_venda desc nulls last, e.created_at desc limit 30) t), '[]'::jsonb),
    'manutencoes', coalesce((
      select jsonb_agg(x) from (
        select jsonb_strip_nulls(jsonb_build_object('numero', o.numero, 'equipamento', o.equipamento, 'numero_serie', o.numero_serie,
                 'status', o.status, 'data_entrada', o.data_entrada, 'previsao', o.previsao, 'concluida_em', o.concluida_em::date,
                 'entregue_em', o.entregue_em::date, 'em_garantia', o.em_garantia, 'defeito', left(o.defeito_relatado, 200),
                 'solucao', left(o.solucao, 300), 'valor', o.valor_total)) x
          from ordens_servico o
         where o.cliente_id = c.id and o.excluida_em is null and o.status <> 'cancelada'
         order by o.data_entrada desc nulls last, o.created_at desc limit 20) t), '[]'::jsonb),
    'compras', coalesce((
      select jsonb_agg(x) from (
        select jsonb_strip_nulls(jsonb_build_object('numero', pe.numero, 'data', coalesce(pe.aprovado_em, pe.created_at)::date, 'status', pe.status,
                 'valor', pe.valor_total, 'rastreio', nullif(btrim(pe.codigo_rastreio), ''), 'enviado_em', pe.enviado_em::date,
                 'transportadora', (select coalesce(nullif(btrim(t.nome_fantasia), ''), t.nome) from transportadoras t where t.id = pe.transportadora_id),
                 'itens', (select jsonb_agg(jsonb_build_object('descricao', i.descricao, 'quantidade', i.quantidade) order by i.descricao)
                             from pedido_itens i where i.pedido_id = pe.id))) x
          from pedidos pe
         where pe.cliente_id = c.id and pe.excluida_em is null and pe.status in ('aprovado', 'faturado', 'entregue')
         order by coalesce(pe.aprovado_em, pe.created_at) desc limit 30) t), '[]'::jsonb));
end $$;
revoke execute on function public.area_cliente(uuid) from public;
grant execute on function public.area_cliente(uuid) to anon, authenticated;
