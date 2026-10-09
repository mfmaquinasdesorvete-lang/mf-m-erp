-- =====================================================================
-- Pedidos: alterar depois de aprovado, com a trilha completa
--   * vendedor: escolhido entre os vendedores ou os usuários do ERP (o
--     usuário vira cadastro de vendedor na hora)
--   * pedido aprovado: vendedor, comissão, origem e observações mudam com
--     motivo (refaz as comissões que ainda não foram pagas)
--   * reabrir pedido: volta para orçamento para mudar itens e valores
--     (devolve o estoque, cancela as parcelas em aberto e as comissões não
--     pagas). Só sem NF-e válida, sem parcela recebida e sem comissão paga
--   * no servidor: depois de aprovado, itens e condições só mudam reabrindo,
--     e a situação só muda pelos botões (aprovar, reabrir, cancelar, entregar)
--   * itens incluídos, alterados e removidos entram no histórico do pedido
-- =====================================================================

alter table public.pedidos add column if not exists motivo_alteracao text;
alter table public.pedidos add column if not exists reaberto_em timestamptz;

-- Histórico: ação feita por alguém pela tela, mesmo quando passa por uma rotina do ERP
-- (a rotina liga erp.acao_usuario), aparece como do usuário e não como "automático".
create or replace function public.trg_auditoria()
returns trigger language plpgsql set search_path = public as $$
declare
  v_old jsonb; v_new jsonb; v_campos text[]; v_motivo text;
  v_direto boolean := current_user in ('authenticated', 'anon');
  v_usuario boolean := current_user in ('authenticated', 'anon') or coalesce(current_setting('erp.acao_usuario', true), '') = 'on';
  v_ignorar text[] := array['motivo_alteracao', 'updated_at', 'proposta_visualizada_em', 'valor_produtos', 'valor_pecas'];
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_motivo := nullif(btrim(coalesce(v_new->>'motivo_alteracao', '')), '');

  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_campos
      from jsonb_object_keys(v_new) k
     where k <> all (v_ignorar) and (v_new->k) is distinct from (v_old->k);
    if v_campos is null then
      if v_new ? 'motivo_alteracao' then new := jsonb_populate_record(new, '{"motivo_alteracao": null}'); end if;
      return new;
    end if;
  end if;

  -- regras das contas a pagar e a receber (só para alterações diretas; as rotinas do ERP já validam)
  if tg_table_name in ('contas_receber', 'contas_pagar') and v_direto then
    if tg_op = 'DELETE' then
      raise exception 'contas não podem ser excluídas: cancele a conta informando o motivo';
    end if;
    if tg_op = 'UPDATE' and v_motivo is null and (
         (v_campos && array['valor', 'vencimento'])
      or (v_old->>'status' = 'pago' and (v_new->>'status' <> 'pago' or v_campos && array['valor_pago', 'data_pagamento']))
      or (v_new->>'status' = 'cancelado' and v_old->>'status' <> 'cancelado')) then
      raise exception 'informe o motivo da alteração (valor, vencimento, cancelamento ou estorno)';
    end if;
  end if;

  perform public.registrar_auditoria(
    tg_table_name,
    coalesce(v_new->>'id', v_old->>'id', v_new->>'user_id', v_old->>'user_id'),
    lower(tg_op),
    v_campos,
    case when tg_op = 'UPDATE' then (select jsonb_object_agg(k, v_old->k) from unnest(v_campos) k) else v_old end,
    case when tg_op = 'UPDATE' then (select jsonb_object_agg(k, v_new->k) from unnest(v_campos) k) else v_new end,
    v_motivo,
    case when v_usuario then 'usuario' else 'sistema' end);

  if tg_op = 'DELETE' then return old; end if;
  if v_new ? 'motivo_alteracao' then new := jsonb_populate_record(new, '{"motivo_alteracao": null}'); end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Itens no histórico do pedido ("2 × Motor WEG a R$ 350,00")
-- ---------------------------------------------------------------------
create or replace function public.texto_item_pedido(p_qtd numeric, p_descricao text, p_valor numeric, p_serie text)
returns text language sql immutable as $$
  select trim_scale(p_qtd)::text || ' × ' || coalesce(p_descricao, '?') || ' a R$ ' || replace(round(coalesce(p_valor, 0), 2)::text, '.', ',')
    || case when coalesce(p_serie, '') <> '' then ' (série ' || p_serie || ')' else '' end
$$;

create or replace function public.trg_auditoria_pedido_itens()
returns trigger language plpgsql set search_path = public as $$
declare v_campo text; v_usuario boolean := current_user in ('authenticated', 'anon') or coalesce(current_setting('erp.acao_usuario', true), '') = 'on';
begin
  if tg_op = 'UPDATE' and (new.produto_id, new.descricao, new.quantidade, new.valor_unitario, new.numero_serie, new.kit_escolha)
     is not distinct from (old.produto_id, old.descricao, old.quantidade, old.valor_unitario, old.numero_serie, old.kit_escolha) then
    return null;
  end if;
  -- pedido excluído (cascata): o registro do pedido já some junto
  if tg_op = 'DELETE' and not exists (select 1 from pedidos where id = old.pedido_id) then return null; end if;
  v_campo := case tg_op when 'INSERT' then 'item_incluido' when 'DELETE' then 'item_removido' else 'item_alterado' end;
  perform public.registrar_auditoria('pedidos', coalesce(new.pedido_id, old.pedido_id)::text, 'update', array[v_campo],
    case when tg_op = 'INSERT' then null else jsonb_build_object(v_campo, public.texto_item_pedido(old.quantidade, old.descricao, old.valor_unitario, old.numero_serie)) end,
    case when tg_op = 'DELETE' then null else jsonb_build_object(v_campo, public.texto_item_pedido(new.quantidade, new.descricao, new.valor_unitario, new.numero_serie)) end,
    null, case when v_usuario then 'usuario' else 'sistema' end);
  return null;
end $$;

do $$ begin
  create trigger zz_auditoria_itens after insert or update or delete on public.pedido_itens
    for each row execute function public.trg_auditoria_pedido_itens();
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Proteção: pedido aprovado só muda pelas rotinas (que conferem estoque,
-- parcelas, comissões e nota) ou nos dados de envio
-- ---------------------------------------------------------------------
create or replace function public.trg_pedido_protegido()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if new.status is distinct from old.status and not (new.status = 'entregue' and old.status in ('aprovado', 'faturado')) then
    raise exception 'a situação do pedido muda pelos botões do pedido (aprovar, reabrir, cancelar, marcar entregue)';
  end if;
  if old.status <> 'orcamento' and (new.cliente_id, new.unidade_id, new.desconto, new.frete, new.parcelas, new.forma_pagamento,
       new.primeiro_vencimento, new.intervalo_dias, new.modalidade_frete, new.vendedor_id, new.vendedor, new.comissao_percentual,
       new.origem, new.observacoes)
     is distinct from (old.cliente_id, old.unidade_id, old.desconto, old.frete, old.parcelas, old.forma_pagamento,
       old.primeiro_vencimento, old.intervalo_dias, old.modalidade_frete, old.vendedor_id, old.vendedor, old.comissao_percentual,
       old.origem, old.observacoes) then
    raise exception 'pedido já aprovado: use "Editar" no pedido (vendedor, comissão, origem e observações, com motivo) ou "Reabrir pedido" para mudar itens e valores';
  end if;
  return new;
end $$;

do $$ begin
  create trigger trg_pedido_protegido before update on public.pedidos
    for each row execute function public.trg_pedido_protegido();
exception when duplicate_object then null; end $$;

create or replace function public.trg_pedido_itens_protegido()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return coalesce(new, old); end if;
  if coalesce((select status from pedidos where id = coalesce(new.pedido_id, old.pedido_id)), 'orcamento') <> 'orcamento' then
    raise exception 'pedido já aprovado: reabra o pedido para mudar os itens';
  end if;
  return coalesce(new, old);
end $$;

do $$ begin
  create trigger trg_pedido_itens_protegido before insert or update or delete on public.pedido_itens
    for each row execute function public.trg_pedido_itens_protegido();
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Vendedor a partir de um usuário do ERP
-- ---------------------------------------------------------------------
-- Usuários que podem ser escolhidos como vendedor (a lista de usuários só o admin vê).
create or replace function public.usuarios_vendedores()
returns table (user_id uuid, nome text, papel text, vendedor_id uuid)
language sql stable security definer set search_path = public as $$
  select u.user_id, u.nome, u.papel, (select v.id from vendedores v where v.user_id = u.user_id order by v.ativo desc, v.created_at limit 1)
    from usuarios_erp u
   where u.ativo and u.papel in ('admin', 'vendas', 'financeiro') and public.is_erp_user()
   order by u.nome
$$;
revoke execute on function public.usuarios_vendedores() from public, anon;
grant execute on function public.usuarios_vendedores() to authenticated;

-- Cadastro de vendedor do usuário (cria com a comissão padrão das configurações, se ainda não existir).
create or replace function public.vendedor_do_usuario(p_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nome text;
begin
  perform public.exigir_papel('vendas');
  select id into v_id from vendedores where user_id = p_user order by ativo desc, created_at limit 1;
  if v_id is not null then return v_id; end if;
  select nome into v_nome from usuarios_erp where user_id = p_user and ativo;
  if v_nome is null then raise exception 'usuário não encontrado ou inativo'; end if;
  perform set_config('erp.acao_usuario', 'on', true);
  insert into vendedores (nome, user_id, percentual)
  values (v_nome, p_user, coalesce((select comissao_percentual from configuracoes where id = 1), 0))
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.vendedor_do_usuario(uuid) from public, anon;
grant execute on function public.vendedor_do_usuario(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Comissões do pedido refeitas com o vendedor/percentual atual
-- (as já pagas ou já em uma conta a pagar ficam como estão)
-- ---------------------------------------------------------------------
create or replace function public.recalcular_comissoes_pedido(p_pedido uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_base text; v_c record;
begin
  select * into v_ped from pedidos where id = p_pedido;
  update comissoes set status = 'cancelada', conta_receber_id = null
   where pedido_id = p_pedido and status = 'a_pagar' and conta_pagar_id is null;
  if v_ped.vendedor_id is null or v_ped.status not in ('aprovado', 'faturado', 'entregue') then return; end if;
  select base into v_base from vendedores where id = v_ped.vendedor_id;
  if v_base = 'faturamento' then
    if not exists (select 1 from comissoes where pedido_id = p_pedido and conta_receber_id is null and status <> 'cancelada') then
      perform public.lancar_comissao(p_pedido, v_ped.valor_total, null, 'Pedido #' || v_ped.numero);
    end if;
  else
    for v_c in select id, coalesce(valor_pago, valor) as v, descricao from contas_receber where pedido_id = p_pedido and status = 'pago' loop
      if not exists (select 1 from comissoes where conta_receber_id = v_c.id) then
        perform public.lancar_comissao(p_pedido, v_c.v, v_c.id, coalesce(v_c.descricao, 'Parcela'));
      end if;
    end loop;
  end if;
end $$;
revoke execute on function public.recalcular_comissoes_pedido(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Editar pedido aprovado (dados que não mexem em estoque, parcelas nem nota)
-- p_dados: { vendedor_id?, comissao_percentual?, origem?, observacoes? }
-- ---------------------------------------------------------------------
create or replace function public.editar_pedido_aprovado(p_pedido uuid, p_dados jsonb, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_vend uuid; v_pct numeric; v_origem text;
begin
  perform public.exigir_papel('vendas');
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'informe o motivo da alteração (mínimo 5 letras)'; end if;
  select * into v_ped from pedidos where id = p_pedido for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if v_ped.status = 'cancelado' then raise exception 'pedido cancelado não pode ser alterado'; end if;
  if v_ped.status = 'orcamento' then raise exception 'orçamento: altere e salve normalmente'; end if;

  v_vend := case when p_dados ? 'vendedor_id' then nullif(p_dados->>'vendedor_id', '')::uuid else v_ped.vendedor_id end;
  v_pct := case when p_dados ? 'comissao_percentual' then nullif(p_dados->>'comissao_percentual', '')::numeric else v_ped.comissao_percentual end;
  v_origem := coalesce(nullif(p_dados->>'origem', ''), v_ped.origem);
  if v_pct is not null and (v_pct < 0 or v_pct > 100) then raise exception 'comissão deve ser de 0 a 100%%'; end if;
  if v_vend is not null and not exists (select 1 from vendedores where id = v_vend) then raise exception 'vendedor não encontrado'; end if;
  if v_vend is distinct from v_ped.vendedor_id and v_vend is null then v_pct := null; end if;

  perform set_config('erp.acao_usuario', 'on', true);
  update pedidos set
    vendedor_id = v_vend,
    vendedor = case when v_vend is distinct from v_ped.vendedor_id then (select nome from vendedores where id = v_vend) else vendedor end,
    comissao_percentual = v_pct,
    origem = v_origem,
    observacoes = case when p_dados ? 'observacoes' then nullif(btrim(p_dados->>'observacoes'), '') else observacoes end,
    motivo_alteracao = btrim(p_motivo)
  where id = p_pedido;

  if v_vend is distinct from v_ped.vendedor_id or v_pct is distinct from v_ped.comissao_percentual then
    perform public.recalcular_comissoes_pedido(p_pedido);
  end if;
end $$;
revoke execute on function public.editar_pedido_aprovado(uuid, jsonb, text) from public, anon;
grant execute on function public.editar_pedido_aprovado(uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------
-- Reabrir pedido: volta a orçamento para mudar itens e valores
-- ---------------------------------------------------------------------
create or replace function public.reabrir_pedido(p_pedido uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_mov record; v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  perform public.exigir_papel('vendas');
  if length(v_motivo) < 5 then raise exception 'informe o motivo para reabrir o pedido (mínimo 5 letras)'; end if;
  select * into v_ped from pedidos where id = p_pedido for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if v_ped.status not in ('aprovado', 'faturado', 'entregue') then
    raise exception 'só pedidos aprovados, faturados ou entregues podem ser reabertos';
  end if;
  if exists (select 1 from notas_fiscais where pedido_id = p_pedido and coalesce(ambiente, 'producao') <> 'homologacao'
               and status in ('autorizada', 'processando', 'contingencia')) then
    raise exception 'o pedido tem NF-e válida: cancele a nota ou emita uma NF de devolução antes de reabrir';
  end if;
  if exists (select 1 from contas_receber where pedido_id = p_pedido and status = 'pago') then
    raise exception 'o pedido tem parcela recebida: estorne o recebimento antes de reabrir';
  end if;
  if exists (select 1 from comissoes where pedido_id = p_pedido and status <> 'cancelada' and (status = 'paga' or conta_pagar_id is not null)) then
    raise exception 'a comissão deste pedido já foi para pagamento: cancele o pagamento da comissão antes de reabrir';
  end if;

  perform set_config('erp.acao_usuario', 'on', true);
  -- o estoque volta exatamente como saiu (inclusive componentes de kit)
  if v_ped.estoque_baixado then
    for v_mov in select produto_id, numero_serie, unidade_id, sum(case when tipo = 'saida' then abs(quantidade) else -abs(quantidade) end) as q
                   from estoque_movimentos where referencia_tipo = 'pedido' and referencia_id = p_pedido and tipo in ('saida', 'entrada')
                  group by produto_id, numero_serie, unidade_id loop
      if v_mov.q > 0 then
        insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie, unidade_id)
        values (v_mov.produto_id, 'entrada', v_mov.q, 'Pedido #' || v_ped.numero || ' reaberto: ' || v_motivo, 'pedido', p_pedido, v_mov.numero_serie, v_mov.unidade_id);
      end if;
    end loop;
  end if;

  update contas_receber set status = 'cancelado', motivo_alteracao = 'Pedido #' || v_ped.numero || ' reaberto: ' || v_motivo
   where pedido_id = p_pedido and status = 'aberto';
  update comissoes set status = 'cancelada', conta_receber_id = null
   where pedido_id = p_pedido and status = 'a_pagar' and conta_pagar_id is null;
  update expedicoes set status = 'cancelada', updated_at = now()
   where pedido_id = p_pedido and status not in ('despachado', 'entregue', 'cancelada');
  update pedidos set status = 'orcamento', aprovado_em = null, estoque_baixado = false, reaberto_em = now(),
         motivo_alteracao = 'Reaberto: ' || v_motivo
   where id = p_pedido;
end $$;
revoke execute on function public.reabrir_pedido(uuid, text) from public, anon;
grant execute on function public.reabrir_pedido(uuid, text) to authenticated;
