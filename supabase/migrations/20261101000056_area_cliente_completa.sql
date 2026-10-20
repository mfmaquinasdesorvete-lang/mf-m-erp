-- Área do cliente completa: além de contas, máquinas, OS e compras, mostra os dados do cadastro (CPF mascarado),
-- as notas fiscais da MF (NF-e e NFS-e autorizadas, com o DANFE), as propostas da MF e até 50 pagamentos.
-- Notas e propostas da My Frost ficam de fora (MF ≠ My Frost).
create or replace function public.area_cliente(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  c clientes;
  v_hoje date default (now() at time zone 'America/Sao_Paulo')::date;
  v_doc text;
begin
  select * into c from clientes where portal_token = p_token;
  if c.id is null then return null; end if;
  v_doc := regexp_replace(coalesce(c.cpf_cnpj, ''), '\D', '', 'g');
  return jsonb_build_object(
    'cliente', coalesce(nullif(btrim(c.nome_fantasia), ''), c.nome),
    'empresa', (select jsonb_build_object('nome', coalesce(nullif(btrim(nome_fantasia), ''), razao_social), 'whatsapp', whatsapp, 'telefone', telefone, 'email', email)
                  from configuracoes where id = 1),
    'dados', jsonb_strip_nulls(jsonb_build_object(
      'nome', c.nome, 'fantasia', nullif(btrim(c.nome_fantasia), ''),
      'documento', case when length(v_doc) = 14 then substr(v_doc,1,2)||'.'||substr(v_doc,3,3)||'.'||substr(v_doc,6,3)||'/'||substr(v_doc,9,4)||'-'||substr(v_doc,13,2)
                        when length(v_doc) = 11 then '***.'||substr(v_doc,4,3)||'.'||substr(v_doc,7,3)||'-**' end,
      'ie', nullif(btrim(c.inscricao_estadual), ''),
      'endereco', nullif(concat_ws(' · ', nullif(concat_ws(', ', nullif(btrim(c.logradouro), ''), nullif(btrim(c.numero), '')), ''), nullif(btrim(c.complemento), ''),
                     nullif(btrim(c.bairro), ''), nullif(concat_ws('/', nullif(btrim(c.municipio), ''), nullif(btrim(c.uf), '')), ''),
                     case when nullif(btrim(c.cep), '') is not null then 'CEP ' || c.cep end), ''),
      'telefone', nullif(concat_ws(' / ', nullif(btrim(c.telefone), ''), nullif(btrim(c.telefone_adicional), '')), ''),
      'whatsapp', nullif(btrim(c.whatsapp), ''), 'email', nullif(btrim(c.email), ''),
      'cliente_desde', least(c.created_at::date, (select min(coalesce(pe.aprovado_em, pe.created_at))::date from pedidos pe where pe.cliente_id = c.id and pe.excluida_em is null)))),
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
          from contas_receber where cliente_id = c.id and status = 'pago' order by data_pagamento desc nulls last limit 50) t), '[]'::jsonb),
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
         order by coalesce(pe.aprovado_em, pe.created_at) desc limit 30) t), '[]'::jsonb),
    'notas', coalesce((
      select jsonb_agg(x order by x->>'data' desc) from (
        select jsonb_strip_nulls(jsonb_build_object('tipo', 'NF-e', 'numero', n.numero, 'serie', n.serie, 'data', n.created_at::date, 'valor', n.valor_total,
                 'chave', n.chave, 'danfe', n.danfe_url, 'devolucao', n.finalidade = 'devolucao')) x
          from notas_fiscais n
         where n.status = 'autorizada' and coalesce(n.ambiente, 'producao') <> 'homologacao' and n.excluida_em is null
           and (n.cliente_id = c.id or n.pedido_id in (select id from pedidos where cliente_id = c.id) or (v_doc <> '' and n.destinatario_doc = v_doc))
        union all
        select jsonb_strip_nulls(jsonb_build_object('tipo', 'NFS-e', 'numero', s.numero, 'data', coalesce(s.data_emissao::date, s.created_at::date),
                 'valor', s.valor_servicos, 'danfe', coalesce(s.url_danfse, s.url)))
          from nfse s
         where s.cliente_id = c.id and s.status = 'autorizada' and coalesce(s.ambiente, 'producao') <> 'homologacao'
        limit 100) t), '[]'::jsonb),
    'propostas', coalesce((
      select jsonb_agg(x) from (
        select jsonb_strip_nulls(jsonb_build_object('numero', p.numero, 'data', p.data, 'situacao', p.situacao, 'valor', p.total)) x
          from propostas_tiny p
         where p.cliente_id = c.id and p.empresa = 'mf'
         order by p.data desc nulls last limit 30) t), '[]'::jsonb));
end $function$;
