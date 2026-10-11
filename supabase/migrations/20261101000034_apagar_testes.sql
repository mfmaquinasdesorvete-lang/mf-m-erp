-- =====================================================================
-- Apagar dados de teste (Configurações → só administrador)
--   * p_executar = false: só mostra o que vai sair (prévia)
--   * p_executar = true: apaga pedidos, OS, ordens de produção e contas escolhidos, com o que depende deles
--     (parcelas, comissões, envios, links de cobrança, itens), devolve ao estoque o que eles tiraram
--     e apaga os avisos ligados a eles.
--   * NF-e autorizada em produção nunca é apagada: fica no ERP, solta do pedido e com uma observação
--     (precisa de devolução / contador). NF-e de homologação (teste da Sefaz) sai da lista.
--   * A exclusão fica registrada na auditoria (gatilho zz_auditoria).
-- Somente acréscimos: função nova.
-- =====================================================================

create or replace function public.testes_apagar(
  p_pedidos bigint[] default '{}', p_os bigint[] default '{}', p_ops bigint[] default '{}', p_contas uuid[] default '{}',
  p_executar boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ped uuid[]; v_os uuid[]; v_op uuid[]; v_contas uuid[]; v_resumo jsonb; v_nums text;
begin
  if not public.is_erp_admin() then raise exception 'só o administrador apaga dados de teste'; end if;
  select coalesce(array_agg(id), '{}') into v_ped from pedidos where numero = any(coalesce(p_pedidos, '{}'));
  select coalesce(array_agg(id), '{}') into v_os from ordens_servico where numero = any(coalesce(p_os, '{}'));
  select coalesce(array_agg(id), '{}') into v_op from ordens_producao where numero = any(coalesce(p_ops, '{}')) and status <> 'concluida';
  select coalesce(array_agg(id), '{}') into v_contas from contas_receber
   where pedido_id = any(v_ped) or os_id = any(v_os) or id = any(coalesce(p_contas, '{}'));

  v_resumo := jsonb_build_object(
    'pedidos', (select coalesce(jsonb_agg(jsonb_build_object('numero', p.numero, 'cliente', c.nome, 'total', p.valor_total, 'status', p.status) order by p.numero), '[]')
                  from pedidos p left join clientes c on c.id = p.cliente_id where p.id = any(v_ped)),
    'os', (select coalesce(jsonb_agg(jsonb_build_object('numero', o.numero, 'cliente', c.nome, 'status', o.status) order by o.numero), '[]')
             from ordens_servico o left join clientes c on c.id = o.cliente_id where o.id = any(v_os)),
    'ops', (select coalesce(jsonb_agg(jsonb_build_object('numero', o.numero, 'maquina', p.descricao, 'status', o.status) order by o.numero), '[]')
              from ordens_producao o left join produtos p on p.id = o.produto_id where o.id = any(v_op)),
    'contas', (select coalesce(jsonb_agg(jsonb_build_object('descricao', r.descricao, 'valor', r.valor, 'status', r.status) order by r.vencimento), '[]')
                 from contas_receber r where r.id = any(v_contas)),
    'estoque_volta', (select coalesce(jsonb_agg(jsonb_build_object('produto', p.descricao, 'quantidade', x.saldo)), '[]')
                        from (select produto_id, sum(case when tipo = 'saida' then quantidade else -quantidade end) saldo
                                from estoque_movimentos
                               where referencia_tipo in ('pedido', 'os') and referencia_id = any(v_ped || v_os) and tipo in ('saida', 'entrada')
                               group by produto_id) x join produtos p on p.id = x.produto_id where x.saldo > 0),
    'notas_reais', (select coalesce(jsonb_agg(numero), '[]') from notas_fiscais
                     where pedido_id = any(v_ped) and ambiente = 'producao' and status = 'autorizada'),
    'notas_teste', (select count(*) from notas_fiscais where pedido_id = any(v_ped) and ambiente = 'homologacao' and excluida_em is null));
  if not p_executar then return v_resumo; end if;

  -- estoque: devolve o que os testes tiraram (o histórico fica, com o estorno ao lado)
  insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, unidade_id)
  select produto_id, 'entrada', saldo, 'Estorno: teste apagado', 'manual', unidade_id
    from (select produto_id, unidade_id, sum(case when tipo = 'saida' then quantidade else -quantidade end) saldo
            from estoque_movimentos
           where referencia_tipo in ('pedido', 'os') and referencia_id = any(v_ped || v_os) and tipo in ('saida', 'entrada')
           group by produto_id, unidade_id) x
   where saldo > 0;

  -- notas fiscais: as reais ficam (soltas do pedido, com aviso); as de homologação saem da lista
  update notas_fiscais set excluida_em = now(), excluida_motivo = 'Teste em homologação (sem valor fiscal)'
   where pedido_id = any(v_ped) and ambiente = 'homologacao' and excluida_em is null;
  update notas_fiscais set observacao_interna = concat_ws(E'\n', nullif(observacao_interna, ''),
         'O pedido desta nota era teste e foi apagado em ' || to_char(now(), 'DD/MM/YYYY') || '. NF-e autorizada: tratar com devolução e o contador.')
   where pedido_id = any(v_ped) and ambiente = 'producao';
  update notas_fiscais set pedido_id = null where pedido_id = any(v_ped);

  delete from comissoes where pedido_id = any(v_ped) or conta_receber_id = any(v_contas);
  delete from cobrancas_link where conta_receber_id = any(v_contas);
  delete from contas_receber where id = any(v_contas);
  delete from envios where pedido_id = any(v_ped);
  delete from ordens_servico where id = any(v_os);
  delete from pedidos where id = any(v_ped);
  delete from ordens_producao where id = any(v_op);

  -- avisos que falam dos pedidos apagados ("Pedido #2 - parcela 1/3", "Proposta #1 aberta…")
  v_nums := (select string_agg(n::text, '|') from unnest(coalesce(p_pedidos, '{}')) n);
  if v_nums is not null then
    delete from notificacoes where texto ~ ('Pedido #(' || v_nums || ')\M') or titulo ~ ('^Proposta #(' || v_nums || ')\M');
  end if;
  return v_resumo;
end $$;

revoke execute on function public.testes_apagar(bigint[], bigint[], bigint[], uuid[], boolean) from public, anon;
grant execute on function public.testes_apagar(bigint[], bigint[], bigint[], uuid[], boolean) to authenticated;
