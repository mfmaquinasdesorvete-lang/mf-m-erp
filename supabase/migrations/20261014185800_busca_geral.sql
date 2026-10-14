-- Busca geral do ERP (campo de busca do menu): clientes, vendas, notas fiscais, produtos, OS e fornecedores numa
-- consulta só. Roda com as permissões de quem busca (security invoker): cada pessoa só acha o que já poderia ver.
-- Não devolve CPF/CNPJ nem telefone, só o que identifica o registro. Só acrescenta uma função.
create or replace function public.busca_geral(p_termo text, p_limite int default 5)
returns jsonb language plpgsql stable security invoker set search_path = public, extensions as $$
declare
  t text := btrim(coalesce(p_termo, ''));
  d text := regexp_replace(coalesce(p_termo, ''), '\D', '', 'g');
  num text := case when btrim(coalesce(p_termo, '')) ~ '^#?\s*\d{1,9}$' then regexp_replace(p_termo, '\D', '', 'g') end;
  lim int := least(greatest(coalesce(p_limite, 5), 1), 20);
  r jsonb := '[]'::jsonb;
begin
  if length(t) < 2 then return r; end if;
  t := replace(replace(t, '%', ''), '_', '');

  r := r || coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('tipo', 'cliente', 'id', c.id, 'titulo', coalesce(nullif(btrim(c.nome_fantasia), ''), c.nome),
      'sub', concat_ws(' · ', case when nullif(btrim(c.nome_fantasia), '') is not null then c.nome end, nullif(concat_ws('/', c.municipio, c.uf), ''))) x
    from clientes c
    where c.nome ilike '%' || t || '%' or c.nome_fantasia ilike '%' || t || '%'
       or (length(d) >= 5 and regexp_replace(coalesce(c.cpf_cnpj, ''), '\D', '', 'g') like d || '%')
       or (length(d) >= 8 and (regexp_replace(coalesce(c.whatsapp, ''), '\D', '', 'g') like '%' || d || '%' or regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g') like '%' || d || '%'))
       or (num is not null and c.codigo::text = num)
    order by (c.nome ilike t || '%') desc, c.nome limit lim) s), '[]'::jsonb);

  r := r || coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('tipo', 'venda', 'id', p.id, 'titulo', 'Venda #' || p.numero, 'sub', concat_ws(' · ', cl.nome, p.status), 'valor', p.valor_total) x
    from pedidos p left join clientes cl on cl.id = p.cliente_id
    where (num is not null and p.numero::text = num) or (num is null and (cl.nome ilike '%' || t || '%' or cl.nome_fantasia ilike '%' || t || '%'))
    order by p.created_at desc limit lim) s), '[]'::jsonb);

  r := r || coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('tipo', 'nota', 'id', n.id, 'titulo', 'NF-e ' || coalesce(n.numero::text, '(sem número)'), 'sub', concat_ws(' · ', coalesce(cl.nome, n.destinatario_nome), n.status), 'valor', n.valor_total) x
    from notas_fiscais n left join clientes cl on cl.id = n.cliente_id
    where n.excluida_em is null and ((num is not null and n.numero::text = num) or (length(d) = 44 and n.chave = d)
       or (num is null and (n.destinatario_nome ilike '%' || t || '%' or cl.nome ilike '%' || t || '%')))
    order by n.created_at desc limit lim) s), '[]'::jsonb);

  r := r || coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('tipo', 'produto', 'id', pr.id, 'titulo', pr.descricao, 'sub', concat_ws(' · ', pr.sku, pr.tipo, case when not pr.ativo then 'inativo' end)) x
    from produtos pr
    where pr.descricao ilike '%' || t || '%' or pr.sku ilike t || '%' or pr.codigo_fabricante ilike t || '%' or (length(d) >= 8 and pr.codigo_barras = d)
    order by pr.ativo desc, (pr.descricao ilike t || '%') desc, pr.descricao limit lim) s), '[]'::jsonb);

  r := r || coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('tipo', 'os', 'id', o.id, 'titulo', 'OS #' || o.numero, 'sub', concat_ws(' · ', cl.nome, o.equipamento, o.status)) x
    from ordens_servico o left join clientes cl on cl.id = o.cliente_id
    where (num is not null and o.numero::text = num) or (num is null and (cl.nome ilike '%' || t || '%' or o.numero_serie ilike '%' || t || '%' or o.equipamento ilike '%' || t || '%'))
    order by o.created_at desc limit lim) s), '[]'::jsonb);

  r := r || coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('tipo', 'fornecedor', 'id', f.id, 'titulo', coalesce(nullif(btrim(f.nome_fantasia), ''), f.nome), 'sub', nullif(concat_ws('/', f.municipio, f.uf), '')) x
    from fornecedores f
    where f.nome ilike '%' || t || '%' or f.nome_fantasia ilike '%' || t || '%' or (length(d) >= 5 and regexp_replace(coalesce(f.cnpj, ''), '\D', '', 'g') like d || '%')
    order by f.nome limit lim) s), '[]'::jsonb);

  return r;
end $$;
revoke execute on function public.busca_geral(text, int) from public, anon;
grant execute on function public.busca_geral(text, int) to authenticated;
