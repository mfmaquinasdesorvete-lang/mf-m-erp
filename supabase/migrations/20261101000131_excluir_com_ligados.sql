-- Excluir documento de teste leva junto os ligados (pedido da usuária, 24/10, via ELO): antes de excluir, a tela mostra
-- o que nasceu dele ou o gerou (com uma caixinha em cada, já marcada) e exclui tudo com o mesmo motivo.
--  * OS → o pedido de venda de onde ela veio (sem NF autorizada nem valor recebido);
--  * pedido de venda → as OS abertas por ele, as separações e os envios ainda não despachados, as contas em aberto;
--  * OP → as OC em cotação (já saíam junto); OC → as notas de entrada ligadas (sem estoque lançado).
-- As travas de sempre continuam (nota autorizada e valor recebido bloqueiam) e o estoque volta pelo saldo de cada um
-- (cancelar_pedido_sistema e a exclusão da OS devolvem só o que ainda está fora). Restaurar a OS traz o pedido junto.
-- Somente acréscimos (funções novas; restaurar_documento ganha a volta do pedido que saiu junto com a OS).

-- o que está ligado aos documentos (para a lista com caixinhas)
create or replace function public.documentos_ligados(p_tabela text, p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb := '[]'::jsonb;
begin
  if not public.tem_algum_papel(array['financeiro', 'tecnico', 'compras', 'vendas']) then raise exception 'sem permissão'; end if;
  if p_tabela = 'ordens_servico' then
    select coalesce(jsonb_agg(jsonb_build_object('tabela', 'pedidos', 'id', p.id, 'rotulo', 'Pedido de venda #' || p.numero,
             'detalhe', 'de onde a OS veio · ' || p.status,
             'bloqueio', case
               when exists (select 1 from notas_fiscais n where n.pedido_id = p.id and n.excluida_em is null and n.status in ('autorizada', 'processando', 'contingencia'))
                 then 'tem NF-e autorizada ou em emissão'
               when exists (select 1 from contas_receber r where r.pedido_id = p.id and r.status = 'pago') then 'tem valor recebido' end)), '[]'::jsonb)
      into v
      from pedidos p where p.id in (select pedido_id from ordens_servico where id = any (p_ids)) and p.excluida_em is null;
  elsif p_tabela = 'pedidos' then
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v from (
      select jsonb_build_object('tabela', 'ordens_servico', 'id', o.id, 'rotulo', 'OS #' || o.numero,
               'detalhe', 'aberta pelo pedido #' || (select numero from pedidos where id = o.pedido_id) || ' · ' || o.status,
               'bloqueio', case
                 when exists (select 1 from nfse s where s.os_id = o.id and s.status in ('pendente', 'processando', 'autorizada', 'incerto')) then 'tem NFS-e emitida'
                 when exists (select 1 from contas_receber r where r.os_id = o.id and r.status = 'pago') then 'tem valor recebido' end) x
        from ordens_servico o where o.pedido_id = any (p_ids) and o.excluida_em is null and o.status not in ('entregue', 'cancelada')
      union all
      select jsonb_build_object('tabela', 'expedicoes', 'id', e.id, 'rotulo', 'Separação do pedido #' || (select numero from pedidos where id = e.pedido_id),
               'detalhe', e.status, 'bloqueio', null)
        from expedicoes e where e.pedido_id = any (p_ids) and e.status not in ('despachado', 'entregue', 'cancelada')
      union all
      select jsonb_build_object('tabela', 'envios', 'id', e.id, 'rotulo', 'Envio do pedido #' || (select numero from pedidos where id = e.pedido_id),
               'detalhe', e.status, 'bloqueio', null)
        from envios e where e.pedido_id = any (p_ids) and e.status in ('cotacao', 'aprovacao', 'coleta')
      union all
      select jsonb_build_object('tabela', 'contas_receber', 'id', r.id, 'rotulo', 'Conta a receber · ' || r.descricao,
               'detalhe', 'em aberto · ' || public.brl(r.valor), 'bloqueio', null)
        from contas_receber r where r.pedido_id = any (p_ids) and r.status = 'aberto'
    ) t;
  elsif p_tabela = 'ordens_producao' then
    select coalesce(jsonb_agg(jsonb_build_object('tabela', 'pedidos_compra', 'id', c.id, 'rotulo', 'OC #' || c.numero, 'detalhe', 'em cotação (sai junto com a OP)',
             'bloqueio', null, 'automatico', true)), '[]'::jsonb)
      into v from pedidos_compra c where c.ordem_producao_id = any (p_ids) and c.excluida_em is null and c.status = 'cotacao';
  elsif p_tabela = 'pedidos_compra' then
    select coalesce(jsonb_agg(jsonb_build_object('tabela', 'nfe_recebidas', 'id', n.id,
             'rotulo', 'NF de entrada ' || coalesce(nullif(ltrim(substr(n.chave, 26, 9), '0'), ''), '') || ' · ' || coalesce(n.emitente_nome, ''),
             'detalhe', 'ligada à OC',
             'bloqueio', case when n.estoque_lancado then 'o estoque já entrou por esta nota'
                              when exists (select 1 from contas_pagar cp where cp.nfe_recebida_id = n.id and cp.status <> 'cancelado') then 'tem contas a pagar lançadas' end)), '[]'::jsonb)
      into v from nfe_recebidas n
     where n.excluida_em is null and n.id in (select l.nfe_id from nfe_oc_vinculos l where l.pedido_compra_id = any (p_ids) and l.ativo);
  end if;
  return v;
end $$;
revoke execute on function public.documentos_ligados(text, uuid[]) from public, anon;
grant execute on function public.documentos_ligados(text, uuid[]) to authenticated;

-- exclui os documentos e os ligados escolhidos, tudo de uma vez (ou nada)
create or replace function public.excluir_com_ligados(p_tabela text, p_ids uuid[], p_motivo text, p_ligados jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_validos jsonb; l jsonb; v_id uuid; v_tab text; v_rot text; v_ok int := 0; v_res jsonb := null; v_ids uuid[] := p_ids;
  v_origem text; v_st text;
begin
  if length(v_motivo) < 5 then raise exception 'escreva o motivo da exclusão (pelo menos 5 letras)'; end if;
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'escolha o documento'; end if;
  -- o que de fato está ligado (a lista que a tela mostrou), conferido antes de excluir o principal
  v_validos := public.documentos_ligados(p_tabela, p_ids);

  if p_tabela = 'pedidos' then
    v_res := public.excluir_pedidos(p_ids, v_motivo);
    select coalesce(array_agg(id), '{}') into v_ids from pedidos where id = any (p_ids) and excluida_em is not null;
    v_origem := (select string_agg('#' || numero, ', ') from pedidos where id = any (v_ids));
    v_origem := 'Junto com o pedido ' || coalesce(v_origem, '');
  else
    foreach v_id in array p_ids loop perform public.excluir_documento(p_tabela, v_id, v_motivo); end loop;
    v_origem := 'Junto com ' || case p_tabela when 'ordens_servico' then 'a OS ' when 'ordens_producao' then 'a OP ' when 'pedidos_compra' then 'a OC ' else '' end
      || coalesce((select string_agg('#' || numero, ', ') from ordens_servico where p_tabela = 'ordens_servico' and id = any (p_ids)), '')
      || coalesce((select string_agg('#' || numero, ', ') from ordens_producao where p_tabela = 'ordens_producao' and id = any (p_ids)), '')
      || coalesce((select string_agg('#' || numero, ', ') from pedidos_compra where p_tabela = 'pedidos_compra' and id = any (p_ids)), '');
  end if;

  for l in select * from jsonb_array_elements(coalesce(p_ligados, '[]'::jsonb)) loop
    v_tab := l->>'tabela'; v_id := nullif(l->>'id', '')::uuid;
    if not exists (select 1 from jsonb_array_elements(v_validos) x where x->>'tabela' = v_tab and (x->>'id')::uuid = v_id and x->>'bloqueio' is null) then
      raise exception 'um dos documentos ligados não pode sair junto (ou já mudou): abra de novo e confira a lista';
    end if;
    -- só o que pertence a um principal que de fato saiu (pedido pulado por regra não leva os dele)
    if p_tabela = 'pedidos' and v_tab in ('ordens_servico', 'expedicoes', 'envios', 'contas_receber') and not exists (
         select 1 from ordens_servico where v_tab = 'ordens_servico' and id = v_id and pedido_id = any (v_ids)
         union all select 1 from expedicoes where v_tab = 'expedicoes' and id = v_id and pedido_id = any (v_ids)
         union all select 1 from envios where v_tab = 'envios' and id = v_id and pedido_id = any (v_ids)
         union all select 1 from contas_receber where v_tab = 'contas_receber' and id = v_id and pedido_id = any (v_ids)) then
      continue;
    end if;
    v_rot := v_origem || ': ' || v_motivo;
    if v_tab = 'pedidos' then
      -- venda que gerou a OS: cancela (estoque volta pelo saldo, contas em aberto canceladas) e sai das listas
      select status into v_st from pedidos where id = v_id for update;
      perform public.cancelar_pedido_sistema(v_id);
      update pedidos set excluida_em = now(), excluida_por = auth.uid(), excluida_motivo = v_rot, excluida_status = v_st, status = 'cancelado'
       where id = v_id and excluida_em is null;
    elsif v_tab = 'ordens_servico' then
      perform public.excluir_documento('ordens_servico', v_id, v_rot);
    elsif v_tab = 'expedicoes' then
      update expedicoes set status = 'cancelada' where id = v_id and status not in ('despachado', 'entregue', 'cancelada');
    elsif v_tab = 'envios' then
      update envios set status = 'cancelado' where id = v_id and status in ('cotacao', 'aprovacao', 'coleta');
    elsif v_tab = 'contas_receber' then
      update contas_receber set status = 'cancelado' where id = v_id and status = 'aberto';
    elsif v_tab = 'nfe_recebidas' then
      perform public.excluir_nota('nfe_recebidas', v_id, v_rot);
    elsif v_tab = 'pedidos_compra' then
      null;   -- as OC em cotação já saem junto com a OP
    else
      raise exception 'tipo de documento ligado inválido';
    end if;
    v_ok := v_ok + 1;
  end loop;
  return jsonb_build_object('ligados', v_ok, 'pedidos', v_res);
end $$;
revoke execute on function public.excluir_com_ligados(text, uuid[], text, jsonb) from public, anon;
grant execute on function public.excluir_com_ligados(text, uuid[], text, jsonb) to authenticated;

-- restaurar a OS traz junto o pedido de venda que saiu com ela
create or replace function public.restaurar_documento(p_tabela text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_numero text; v_n int;
begin
  perform public.exigir_papel('financeiro', 'tecnico', 'compras');
  if p_tabela = 'pedidos_compra' then
    update pedidos_compra set status = coalesce(excluida_status, 'cotacao'), excluida_em = null, excluida_por = null, excluida_motivo = null, excluida_status = null
     where id = p_id and excluida_em is not null;
    get diagnostics v_n = row_count;
  elsif p_tabela = 'ordens_producao' then
    perform public.exigir_papel('financeiro', 'tecnico');
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
           excluida_em = null, excluida_por = null, excluida_motivo = null, excluida_status = null,
           reaberturas = coalesce(reaberturas, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('em', now(), 'por', auth.uid(),
             'nome', (select nome from usuarios_erp where user_id = auth.uid() limit 1), 'motivo', 'restaurada após exclusão'))
     where id = p_id and excluida_em is not null
    returning numero::text into v_numero;
    get diagnostics v_n = row_count;
    -- o pedido de venda que saiu junto com a OS volta para a lista (cancelado: a venda se refaz se for o caso)
    if v_n > 0 then
      update pedidos set excluida_em = null, excluida_por = null, excluida_motivo = null, excluida_status = null
       where id = (select pedido_id from ordens_servico where id = p_id) and excluida_em is not null
         and excluida_motivo like 'Junto com a OS #' || v_numero || ':%';
    end if;
  else
    raise exception 'este documento não pode ser restaurado por aqui';
  end if;
  if v_n = 0 then raise exception 'documento excluído não encontrado'; end if;
  insert into auditoria (tabela, registro_id, acao, usuario, usuario_nome, campos, antes, depois, motivo, origem)
  values (p_tabela, p_id::text, 'update', auth.uid(), (select nome from usuarios_erp where user_id = auth.uid()), array['excluida_em'],
          null, jsonb_build_object('excluida_em', null), 'restaurada', 'usuario');
end $$;
