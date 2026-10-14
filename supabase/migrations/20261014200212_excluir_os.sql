-- =====================================================================
-- Excluir OS feita errada (ou de teste), como já acontece com a OC e a OP:
--  * some das listas e dos painéis, mas fica guardada (quem excluiu, quando, motivo) e pode ser restaurada;
--  * as peças que a OS tirou do estoque voltam e a conta a receber em aberto é cancelada;
--  * não deixa com NFS-e emitida (ou em emissão) nem com conta já recebida.
-- E ao excluir uma OP, as OC dela que ainda estão em cotação (nada recebido) saem junto (e voltam junto ao restaurar).
-- Somente acréscimos: colunas novas, política de leitura e as mesmas funções com um caso a mais.
-- =====================================================================

alter table public.ordens_servico
  add column if not exists excluida_em timestamptz,
  add column if not exists excluida_por uuid,
  add column if not exists excluida_motivo text,
  add column if not exists excluida_status text;
do $$ begin
  create policy "nao_excluida" on public.ordens_servico as restrictive for select to authenticated using (excluida_em is null);
exception when duplicate_object then null; end $$;

create or replace function public.excluir_documento(p_tabela text, p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_numero text; v_mov record; v_novo text;
begin
  perform public.exigir_papel('financeiro', 'tecnico');
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'escreva o motivo da exclusão (pelo menos 5 letras)'; end if;
  if p_tabela = 'pedidos_compra' then
    select status, numero::text into v_status, v_numero from pedidos_compra where id = p_id and excluida_em is null for update;
    if not found then raise exception 'ordem de compra não encontrada'; end if;
    if v_status in ('parcial', 'recebido')
       or exists (select 1 from pedido_compra_itens where pedido_compra_id = p_id and coalesce(quantidade_recebida, 0) > 0) then
      raise exception 'a OC #% já teve mercadoria recebida: o estoque mexeu, não dá para excluir (cancele o saldo)', v_numero;
    end if;
    v_novo := 'cancelado';
    update pedidos_compra set excluida_em = now(), excluida_por = auth.uid(), excluida_motivo = btrim(p_motivo),
           excluida_status = status, status = 'cancelado' where id = p_id;
  elsif p_tabela = 'ordens_producao' then
    select status, numero::text into v_status, v_numero from ordens_producao where id = p_id and excluida_em is null for update;
    if not found then raise exception 'ordem de produção não encontrada'; end if;
    if v_status = 'concluida'
       or exists (select 1 from estoque_movimentos where referencia_tipo = 'producao' and referencia_id = p_id) then
      raise exception 'a OP #% já foi concluída: o estoque mexeu, não dá para excluir', v_numero;
    end if;
    v_novo := 'cancelada';
    update ordens_producao set excluida_em = now(), excluida_por = auth.uid(), excluida_motivo = btrim(p_motivo),
           excluida_status = status, status = 'cancelada' where id = p_id;
    -- as OC que a OP gerou e que ainda estão em cotação (nada pedido nem recebido) saem junto
    update pedidos_compra c set excluida_em = now(), excluida_por = auth.uid(), excluida_motivo = 'Junto com a OP #' || v_numero || ': ' || btrim(p_motivo),
           excluida_status = c.status, status = 'cancelado'
     where c.ordem_producao_id = p_id and c.excluida_em is null and c.status = 'cotacao'
       and not exists (select 1 from pedido_compra_itens i where i.pedido_compra_id = c.id and coalesce(i.quantidade_recebida, 0) > 0);
  elsif p_tabela = 'ordens_servico' then
    perform public.exigir_papel('tecnico');
    select status, numero::text into v_status, v_numero from ordens_servico where id = p_id and excluida_em is null for update;
    if not found then raise exception 'OS não encontrada'; end if;
    if exists (select 1 from nfse where os_id = p_id and status in ('pendente', 'processando', 'autorizada', 'incerto')) then
      raise exception 'a OS #% tem NFS-e emitida (ou em emissão): cancele a nota antes de excluir', v_numero;
    end if;
    if exists (select 1 from contas_receber where os_id = p_id and status = 'pago') then
      raise exception 'a OS #% já tem valor recebido: estorne o recebimento antes de excluir', v_numero;
    end if;
    -- as peças que a OS tirou voltam ao estoque (o histórico fica, com a entrada ao lado)
    for v_mov in select produto_id, unidade_id, sum(case when tipo = 'saida' then abs(quantidade) else -abs(quantidade) end) as q
                   from estoque_movimentos where referencia_tipo = 'os' and referencia_id = p_id and tipo in ('saida', 'entrada')
                  group by produto_id, unidade_id loop
      if v_mov.q > 0 then
        insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, unidade_id)
        values (v_mov.produto_id, 'entrada', v_mov.q, 'OS #' || v_numero || ' excluída', 'os', p_id, v_mov.unidade_id);
      end if;
    end loop;
    update contas_receber set status = 'cancelado' where os_id = p_id and status = 'aberto';
    v_novo := 'cancelada';
    update ordens_servico set excluida_em = now(), excluida_por = auth.uid(), excluida_motivo = btrim(p_motivo),
           excluida_status = status, status = 'cancelada', estoque_baixado = false where id = p_id;
  else
    raise exception 'este documento não pode ser excluído por aqui';
  end if;
  insert into auditoria (tabela, registro_id, acao, usuario, usuario_nome, campos, antes, depois, motivo, origem)
  values (p_tabela, p_id::text, 'update', auth.uid(), (select nome from usuarios_erp where user_id = auth.uid()), array['excluida_em', 'status'],
          jsonb_build_object('status', v_status), jsonb_build_object('excluida_em', now(), 'status', v_novo), btrim(p_motivo), 'usuario');
end $$;
revoke execute on function public.excluir_documento(text, uuid, text) from public, anon;
grant execute on function public.excluir_documento(text, uuid, text) to authenticated;

create or replace function public.restaurar_documento(p_tabela text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_numero text; v_n int;
begin
  perform public.exigir_papel('financeiro', 'tecnico');
  if p_tabela = 'pedidos_compra' then
    update pedidos_compra set status = coalesce(excluida_status, 'cotacao'), excluida_em = null, excluida_por = null, excluida_motivo = null, excluida_status = null
     where id = p_id and excluida_em is not null;
    get diagnostics v_n = row_count;
  elsif p_tabela = 'ordens_producao' then
    update ordens_producao set status = coalesce(excluida_status, 'planejada'), excluida_em = null, excluida_por = null, excluida_motivo = null, excluida_status = null
     where id = p_id and excluida_em is not null
    returning numero::text into v_numero;
    get diagnostics v_n = row_count;
    -- as OC que saíram junto com a OP voltam junto
    if v_n > 0 then
      update pedidos_compra set status = coalesce(excluida_status, 'cotacao'), excluida_em = null, excluida_por = null, excluida_motivo = null, excluida_status = null
       where ordem_producao_id = p_id and excluida_em is not null and excluida_motivo like 'Junto com a OP #' || v_numero || ':%';
    end if;
  elsif p_tabela = 'ordens_servico' then
    perform public.exigir_papel('tecnico');
    -- volta em aberto: as peças e a conta voltaram na exclusão; ao concluir de novo, o ERP baixa e lança outra vez
    update ordens_servico set status = case when excluida_status in ('concluida', 'entregue') then 'aberta' else coalesce(excluida_status, 'aberta') end,
           excluida_em = null, excluida_por = null, excluida_motivo = null, excluida_status = null
     where id = p_id and excluida_em is not null;
    get diagnostics v_n = row_count;
  else
    raise exception 'este documento não pode ser restaurado por aqui';
  end if;
  if v_n = 0 then raise exception 'documento excluído não encontrado'; end if;
  insert into auditoria (tabela, registro_id, acao, usuario, usuario_nome, campos, antes, depois, motivo, origem)
  values (p_tabela, p_id::text, 'update', auth.uid(), (select nome from usuarios_erp where user_id = auth.uid()), array['excluida_em'],
          null, jsonb_build_object('excluida_em', null), 'restaurada', 'usuario');
end $$;
revoke execute on function public.restaurar_documento(text, uuid) from public, anon;
grant execute on function public.restaurar_documento(text, uuid) to authenticated;

-- Excluídas (para consultar e restaurar)
create or replace function public.documentos_excluidos()
returns table (tabela text, id uuid, numero text, descricao text, excluida_em timestamptz, excluida_motivo text, excluida_por text)
language sql stable security definer set search_path = public as $$
  select 'pedidos_compra', c.id, c.numero::text, coalesce(f.nome, 'sem fornecedor'), c.excluida_em, c.excluida_motivo, coalesce(u.email, '')
    from pedidos_compra c left join fornecedores f on f.id = c.fornecedor_id left join auth.users u on u.id = c.excluida_por
   where c.excluida_em is not null and public.tem_papel('financeiro', 'tecnico')
  union all
  select 'ordens_producao', o.id, o.numero::text, coalesce(p.descricao, ''), o.excluida_em, o.excluida_motivo, coalesce(u.email, '')
    from ordens_producao o left join produtos p on p.id = o.produto_id left join auth.users u on u.id = o.excluida_por
   where o.excluida_em is not null and public.tem_papel('financeiro', 'tecnico')
  union all
  select 'ordens_servico', s.id, s.numero::text, concat_ws(' · ', cl.nome, s.equipamento), s.excluida_em, s.excluida_motivo, coalesce(u.email, '')
    from ordens_servico s left join clientes cl on cl.id = s.cliente_id left join auth.users u on u.id = s.excluida_por
   where s.excluida_em is not null and public.tem_papel('tecnico')
  order by 5 desc
$$;
revoke execute on function public.documentos_excluidos() from public, anon;
grant execute on function public.documentos_excluidos() to authenticated;
