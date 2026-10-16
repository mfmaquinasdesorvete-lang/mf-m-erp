-- Ligar NF-e do Tiny aos pedidos: a nota muitas vezes sai sem o frete (o valor não bate com o total do pedido) e a nota
-- importada pelo XML pode estar sem o cliente ligado. Terceira regra: mesmo CPF/CNPJ do destinatário, nota emitida até
-- 30 dias depois do pedido e valor perto do total ou dos produtos (até 10% de diferença), só quando há um único par.
-- A nota sem cliente passa a ter o cliente do pedido.
create or replace function public.ligar_notas_tiny(p_unidade uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pela_nota int := 0; v_pelo_valor int := 0; v_pelo_documento int := 0;
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

  -- 3) pelo CPF/CNPJ do destinatário (nota sem frete ou sem o cliente ligado)
  with ped as (
    select pe.id, pe.cliente_id, pe.valor_total, pe.valor_produtos, (pe.created_at at time zone 'America/Sao_Paulo')::date dia,
           regexp_replace(coalesce(c.cpf_cnpj, ''), '\D', '', 'g') doc
      from pedidos pe join clientes c on c.id = pe.cliente_id
     where pe.unidade_id = p_unidade and pe.id_externo like 'tiny:%' and pe.status in ('faturado', 'entregue')
       and not exists (select 1 from notas_fiscais n where n.pedido_id = pe.id)
  ), nf as (
    select n.id, n.valor_total, (n.created_at at time zone 'America/Sao_Paulo')::date dia,
           regexp_replace(coalesce(n.destinatario_doc, ''), '\D', '', 'g') doc
      from notas_fiscais n
     where n.unidade_id = p_unidade and n.pedido_id is null and n.excluida_em is null and n.origem = 'importada'
       and n.status = 'autorizada' and coalesce(n.tipo_operacao, 'saida') = 'saida'
  ), par as (
    select ped.id pedido_id, ped.cliente_id, nf.id nota_id,
           count(*) over (partition by ped.id) por_pedido, count(*) over (partition by nf.id) por_nota
      from ped join nf on length(nf.doc) in (11, 14) and nf.doc = ped.doc
                      and nf.dia between ped.dia - 1 and ped.dia + 30
                      and (abs(nf.valor_total - ped.valor_total) <= greatest(0.05, ped.valor_total * 0.10)
                        or abs(nf.valor_total - ped.valor_produtos) <= greatest(0.05, ped.valor_produtos * 0.10))
  ), feito as (
    update notas_fiscais n set pedido_id = par.pedido_id, cliente_id = coalesce(n.cliente_id, par.cliente_id) from par
     where n.id = par.nota_id and par.por_pedido = 1 and par.por_nota = 1 returning n.id
  )
  select count(*) into v_pelo_documento from feito;

  -- conta a receber do pedido importado passa a apontar para a nota
  update contas_receber cr set nota_fiscal_id = n.id
    from notas_fiscais n
   where n.pedido_id = cr.pedido_id and cr.nota_fiscal_id is null and cr.id_externo like 'tiny:cr:%' and n.unidade_id = p_unidade;

  return jsonb_build_object('pela_nota', v_pela_nota, 'pelo_valor', v_pelo_valor, 'pelo_documento', v_pelo_documento);
end $$;
revoke all on function public.ligar_notas_tiny(uuid) from public, anon;
grant execute on function public.ligar_notas_tiny(uuid) to authenticated;
