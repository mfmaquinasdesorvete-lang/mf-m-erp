-- Onde o cliente pagou: correções da revisão de 28/10.
-- 1) Registrar: trava as parcelas antes de somar; recusa link de pagamento aberto; o lançamento do extrato tem de ter
--    o mesmo valor; a nota do fornecedor só aceita o que ainda não foi pago (pela MF ou por clientes) e, quando o
--    cliente paga só parte de uma nota sem contas lançadas, o resto entra como conta a pagar aberta da MF; pagamento a
--    fornecedor exige a nota (sem nota, registrar como "outro").
-- 2) Desfazer: só desfaz quando as contas ainda estão como o registro deixou (senão pede para desfazer o mais novo
--    primeiro); recusa se a comissão já foi paga; solta qualquer lançamento de extrato ligado às contas do registro.
-- 3) lancar_duplicatas_a_vencer: a conferência de papel não funcionava dentro de security definer (current_user é o dono).

create or replace function public._registrar_pagamento_cliente(
  p_pedido uuid, p_tipo text, p_valor numeric, p_data date, p_forma text default null, p_parcelas int default 1,
  p_nfe_recebida uuid default null, p_fornecedor uuid default null, p_conta_bancaria uuid default null,
  p_extrato uuid default null, p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public set "TimeZone" to 'America/Sao_Paulo' as $$
declare
  v_ped pedidos; v_valor numeric := round(coalesce(p_valor, 0), 2); v_resto numeric; v_take numeric;
  v_aberto numeric; c record; v_primeira contas_receber; v_nova uuid; v_onde text; v_baixa_r jsonb := '[]'; v_baixa_p jsonb := '[]';
  v_nf nfe_recebidas; v_forn uuid; v_num text; v_emit text; v_conta_pagar uuid; v_lanc extrato_lancamentos;
  v_conta_banco uuid := p_conta_bancaria; v_base text; v_id uuid; v_lancado numeric; v_pago_nf numeric; v_sem_conta numeric;
begin
  if p_tipo not in ('conta_mf', 'fornecedor', 'conta_socia', 'outro') then raise exception 'tipo de pagamento inválido'; end if;
  if not (v_valor > 0) then raise exception 'informe o valor pago'; end if;
  if p_data is null or p_data > current_date + 1 then raise exception 'data do pagamento inválida'; end if;
  if coalesce(p_parcelas, 1) not between 1 and 48 then raise exception 'parcelas: de 1 a 48'; end if;
  if p_tipo = 'fornecedor' and p_nfe_recebida is null then
    raise exception 'escolha a nota do fornecedor; se ela ainda não está no ERP, registre como "Outro" e explique na observação';
  end if;

  select * into v_ped from pedidos where id = p_pedido for update;
  if v_ped.id is null then raise exception 'pedido não encontrado'; end if;
  if v_ped.status not in ('aprovado', 'faturado', 'entregue') then raise exception 'o pedido precisa estar aprovado'; end if;

  -- 1) cliente: trava as parcelas abertas, confere o saldo e tira o valor na ordem do vencimento (sem e-mail nem cobrança)
  perform 1 from contas_receber where pedido_id = p_pedido and status = 'aberto' for update;
  select coalesce(sum(valor), 0) into v_aberto from contas_receber where pedido_id = p_pedido and status = 'aberto';
  if v_valor > v_aberto + 0.004 then
    raise exception 'o pedido tem só % em aberto', public.brl(v_aberto);
  end if;
  if exists (select 1 from boletos_inter b join contas_receber r on r.id = b.conta_receber_id
              where r.pedido_id = p_pedido and r.status = 'aberto' and b.situacao in ('EM_PROCESSAMENTO', 'A_RECEBER', 'ATRASADO', 'PROTESTO')) then
    raise exception 'há boleto do Inter valendo numa parcela deste pedido: cancele o boleto antes';
  end if;
  if exists (select 1 from cobrancas_link l left join contas_receber r on r.id = l.conta_receber_id
              where l.status = 'aberto' and (l.pedido_id = p_pedido or r.pedido_id = p_pedido)) then
    raise exception 'há link de pagamento aberto para este pedido: descarte o link antes (o cliente poderia pagar o valor antigo)';
  end if;

  v_onde := case p_tipo when 'conta_mf' then 'na conta da MF' when 'fornecedor' then 'direto ao fornecedor'
                        when 'conta_socia' then 'na conta pessoal da sócia' else 'outro' end;
  v_resto := v_valor;
  for c in select * from contas_receber where pedido_id = p_pedido and status = 'aberto' order by vencimento, parcela, created_at loop
    exit when v_resto <= 0;
    v_take := least(v_resto, c.valor);
    if v_primeira.id is null then v_primeira := c; end if;
    if v_take >= c.valor then
      update contas_receber set status = 'cancelado', motivo_alteracao = 'Substituída pela baixa "' || v_onde || '" (onde o cliente pagou)' where id = c.id;
      v_baixa_r := v_baixa_r || jsonb_build_object('conta', c.id, 'valor', v_take, 'acao', 'cancelou');
    else
      update contas_receber set valor = round(c.valor - v_take, 2), motivo_alteracao = 'Parte paga ' || v_onde || ' (onde o cliente pagou)' where id = c.id;
      v_baixa_r := v_baixa_r || jsonb_build_object('conta', c.id, 'valor', v_take, 'acao', 'reduziu');
    end if;
    v_resto := round(v_resto - v_take, 2);
  end loop;
  if v_resto > 0.004 then raise exception 'as parcelas do pedido mudaram: tente de novo'; end if;

  -- conta da MF: o lançamento do extrato (se escolhido) tem de ser do mesmo valor e dá a conta bancária
  if p_tipo = 'conta_mf' and p_extrato is not null then
    select * into v_lanc from extrato_lancamentos where id = p_extrato for update;
    if v_lanc.id is null or v_lanc.valor <= 0 then raise exception 'lançamento do extrato inválido'; end if;
    if v_lanc.status <> 'pendente' then raise exception 'esse lançamento do extrato já foi conciliado'; end if;
    if abs(v_lanc.valor - v_valor) > 0.004 then
      raise exception 'o lançamento do extrato é de %: o valor tem de ser o mesmo (se cobre mais de um pedido, concilie pelo extrato)', public.brl(v_lanc.valor);
    end if;
    v_conta_banco := v_lanc.conta_bancaria_id;
  end if;
  if p_tipo <> 'conta_mf' then v_conta_banco := null; end if;

  insert into contas_receber (descricao, cliente_id, pedido_id, parcela, total_parcelas, valor, vencimento, status, forma_pagamento,
    data_pagamento, valor_pago, unidade_id, conta_bancaria_id, categoria, conta_origem_id, motivo_alteracao)
  values ('Pedido #' || v_ped.numero || ' - pago ' || v_onde, v_ped.cliente_id, p_pedido, v_primeira.parcela, v_primeira.total_parcelas,
    v_valor, p_data, 'pago', coalesce(nullif(p_forma, ''), v_primeira.forma_pagamento), p_data, v_valor, v_primeira.unidade_id,
    v_conta_banco, 'vendas', v_primeira.id, 'Onde o cliente pagou: ' || v_onde)
  returning id into v_nova;

  -- comissão do vendedor sobre o recebido (só vendedor por recebimento; o de faturamento já recebeu na aprovação)
  select v.base into v_base from vendedores v where v.id = v_ped.vendedor_id;
  if v_base = 'recebimento' then
    perform public.lancar_comissao(p_pedido, v_valor, v_nova, 'Pedido #' || v_ped.numero || ' - pago ' || v_onde);
  end if;

  if p_tipo = 'conta_mf' and p_extrato is not null then
    update extrato_lancamentos set conta_receber_id = v_nova, status = 'conciliado', conciliado_por = auth.uid(), conciliado_em = now()
     where id = p_extrato;
  end if;

  -- 2) fornecedor: baixa as contas abertas da NF e, só para a parte da nota ainda sem conta, cria a conta já paga
  if p_tipo = 'fornecedor' then
    select * into v_nf from nfe_recebidas where id = p_nfe_recebida for update;
    if v_nf.id is null or v_nf.excluida_em is not null then raise exception 'nota do fornecedor não encontrada'; end if;
    if coalesce(v_nf.situacao, 'autorizada') = 'cancelada' then raise exception 'essa nota do fornecedor está cancelada'; end if;
    v_forn := v_nf.fornecedor_id; v_emit := v_nf.emitente_nome;
    v_num := ltrim(substring(v_nf.chave from 26 for 9), '0');
    perform 1 from contas_pagar where nfe_recebida_id = v_nf.id and status <> 'cancelado' for update;
    select coalesce(sum(valor), 0), coalesce(sum(valor) filter (where status = 'pago'), 0)
      into v_lancado, v_pago_nf from contas_pagar where nfe_recebida_id = v_nf.id and status <> 'cancelado';
    -- só o que ainda não foi pago (pela MF ou por clientes): as abertas mais a parte da nota ainda sem conta
    if v_valor > round(coalesce(v_nf.valor_total, 0) - v_pago_nf, 2) + 0.004 then
      raise exception 'a nota % é de % e já tem % pagos (pela MF ou por clientes)', v_num, public.brl(v_nf.valor_total), public.brl(v_pago_nf);
    end if;
    v_resto := v_valor;
    for c in select * from contas_pagar where nfe_recebida_id = v_nf.id and status = 'aberto' order by vencimento, created_at loop
      exit when v_resto <= 0;
      if exists (select 1 from pix_pagamentos x where x.conta_pagar_id = c.id and x.status in ('enviando', 'aguardando_aprovacao', 'agendado', 'pago')) then
        raise exception 'a conta % já tem Pix em andamento pela MF', c.descricao;
      end if;
      v_take := least(v_resto, c.valor);
      if v_take >= c.valor then
        update contas_pagar set status = 'pago', data_pagamento = p_data, valor_pago = c.valor, conta_bancaria_id = null,
          observacoes = concat_ws(' · ', c.observacoes, 'Paga pelo cliente do pedido #' || v_ped.numero),
          motivo_alteracao = 'Paga pelo cliente do pedido #' || v_ped.numero
         where id = c.id;
        v_baixa_p := v_baixa_p || jsonb_build_object('conta', c.id, 'valor', v_take, 'acao', 'pagou');
        v_conta_pagar := coalesce(v_conta_pagar, c.id);
      else
        update contas_pagar set valor = round(c.valor - v_take, 2), motivo_alteracao = 'Parte paga pelo cliente do pedido #' || v_ped.numero where id = c.id;
        insert into contas_pagar (descricao, fornecedor_id, categoria, documento, valor, vencimento, emissao, competencia, status,
          data_pagamento, valor_pago, nfe_recebida_id, unidade_id, conta_origem_id, observacoes, motivo_alteracao)
        values (c.descricao || ' (parte paga pelo cliente)', c.fornecedor_id, c.categoria, c.documento, v_take, c.vencimento, c.emissao,
          c.competencia, 'pago', p_data, v_take, v_nf.id, c.unidade_id, c.id, 'Paga pelo cliente do pedido #' || v_ped.numero,
          'Parte paga pelo cliente do pedido #' || v_ped.numero)
        returning id into v_id;
        v_baixa_p := v_baixa_p || jsonb_build_object('conta', c.id, 'valor', v_take, 'acao', 'reduziu', 'criada', v_id);
        v_conta_pagar := coalesce(v_conta_pagar, v_id);
      end if;
      v_resto := round(v_resto - v_take, 2);
    end loop;
    v_sem_conta := round(coalesce(v_nf.valor_total, 0) - v_lancado, 2);
    if v_resto > 0 then
      insert into contas_pagar (descricao, fornecedor_id, categoria, documento, valor, vencimento, emissao, competencia, status,
        data_pagamento, valor_pago, nfe_recebida_id, unidade_id, observacoes, motivo_alteracao)
      values ('NF ' || v_num || ' - ' || coalesce(v_emit, 'fornecedor') || ' (paga pelo cliente do pedido #' || v_ped.numero || ')',
        v_forn, 'fornecedores', 'NF ' || v_num, v_resto, p_data, v_nf.data_emissao::date, date_trunc('month', v_nf.data_emissao)::date,
        'pago', p_data, v_resto, v_nf.id, v_nf.unidade_id,
        concat_ws(' · ', 'Paga pelo cliente do pedido #' || v_ped.numero, nullif(p_forma, ''), case when coalesce(p_parcelas, 1) > 1 then p_parcelas || 'x' end),
        'Paga pelo cliente do pedido #' || v_ped.numero)
      returning id into v_id;
      v_baixa_p := v_baixa_p || jsonb_build_object('conta', v_id, 'valor', v_resto, 'acao', 'criou');
      v_conta_pagar := coalesce(v_conta_pagar, v_id);
      v_sem_conta := round(v_sem_conta - v_resto, 2);
    end if;
    -- o resto da nota que ninguém pagou ainda vira conta aberta da MF (não fica escondido)
    if v_sem_conta > 0.004 then
      insert into contas_pagar (descricao, fornecedor_id, categoria, documento, valor, vencimento, emissao, competencia, status,
        nfe_recebida_id, unidade_id, observacoes, motivo_alteracao)
      values ('NF ' || v_num || ' - ' || coalesce(v_emit, 'fornecedor') || ' (restante a pagar)', v_forn, 'fornecedores', 'NF ' || v_num,
        v_sem_conta, greatest(v_nf.data_emissao::date + 30, current_date), v_nf.data_emissao::date, date_trunc('month', v_nf.data_emissao)::date,
        'aberto', v_nf.id, v_nf.unidade_id, 'Restante da nota depois do pagamento do cliente do pedido #' || v_ped.numero || ': confira o vencimento',
        'Restante da nota paga em parte pelo cliente do pedido #' || v_ped.numero)
      returning id into v_id;
      v_baixa_p := v_baixa_p || jsonb_build_object('conta', v_id, 'valor', v_sem_conta, 'acao', 'restante');
    end if;
    update nfe_recebidas set conta_pagar_id = v_conta_pagar where id = v_nf.id and conta_pagar_id is null;
  end if;

  insert into pedido_pagamentos (pedido_id, tipo, valor, data, forma, parcelas, nfe_recebida_id, fornecedor_id, conta_bancaria_id,
    extrato_lancamento_id, conta_receber_id, conta_pagar_id, baixa_receber, baixa_pagar, observacao)
  values (p_pedido, p_tipo, v_valor, p_data, nullif(p_forma, ''), greatest(coalesce(p_parcelas, 1), 1), v_nf.id, v_forn, v_conta_banco,
    case when p_tipo = 'conta_mf' then p_extrato end, v_nova, v_conta_pagar, v_baixa_r, v_baixa_p, nullif(trim(coalesce(p_observacao, '')), ''))
  returning id into v_id;

  insert into pedido_ocorrencias (pedido_id, autor_nome, texto)
  values (p_pedido, 'Onde o cliente pagou', public.brl(v_valor) || ' pago ' || v_onde
    || case when v_emit is not null then ' (' || v_emit || coalesce(', NF ' || v_num, '') || ')' else '' end
    || ' em ' || to_char(p_data, 'DD/MM/YYYY'));
  return v_id;
end $$;
revoke execute on function public._registrar_pagamento_cliente(uuid, text, numeric, date, text, int, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;

create or replace function public._desfazer_pagamento_cliente(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
declare r pedido_pagamentos; b jsonb; v_ped pedidos; v_st text;
begin
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'escreva o motivo'; end if;
  select * into r from pedido_pagamentos where id = p_id for update;
  if r.id is null or r.excluido_em is not null then raise exception 'registro não encontrado ou já desfeito'; end if;
  select * into v_ped from pedidos where id = r.pedido_id for update;
  if v_ped.status = 'cancelado' then raise exception 'o pedido foi cancelado: acerte as contas pelo financeiro'; end if;

  -- só desfaz se tudo ainda está como este registro deixou (o mais novo primeiro)
  if exists (select 1 from pedido_pagamentos x where x.pedido_id = r.pedido_id and x.excluido_em is null and x.created_at > r.created_at) then
    raise exception 'há um registro mais novo neste pedido: desfaça primeiro o mais novo';
  end if;
  if exists (select 1 from comissoes where conta_receber_id = r.conta_receber_id and status not in ('a_pagar', 'cancelada')) then
    raise exception 'a comissão deste recebimento já foi paga: estorne a comissão antes';
  end if;
  select status into v_st from contas_receber where id = r.conta_receber_id for update;
  if v_st is distinct from 'pago' then raise exception 'a parte paga deste registro foi mudada depois: acerte pelo financeiro'; end if;
  for b in select * from jsonb_array_elements(r.baixa_receber) loop
    select status into v_st from contas_receber where id = (b->>'conta')::uuid for update;
    if (b->>'acao' = 'cancelou' and v_st is distinct from 'cancelado') or (b->>'acao' = 'reduziu' and v_st is distinct from 'aberto') then
      raise exception 'a parcela de origem mudou depois deste registro (paga, cancelada ou reaberta): acerte pelo financeiro';
    end if;
  end loop;
  for b in select * from jsonb_array_elements(r.baixa_pagar) loop
    select status into v_st from contas_pagar where id = (b->>'conta')::uuid for update;
    if (b->>'acao' = 'pagou' and v_st is distinct from 'pago') or (b->>'acao' = 'reduziu' and v_st is distinct from 'aberto')
       or (b->>'acao' in ('criou', 'restante') and v_st = 'cancelado') then
      raise exception 'a conta do fornecedor mudou depois deste registro: acerte pelo financeiro';
    end if;
    if b->>'acao' = 'restante' and v_st = 'pago' then
      raise exception 'o restante da nota já foi pago pela MF: acerte pelo financeiro';
    end if;
  end loop;

  -- cliente: a parte paga é cancelada (a comissão a pagar cai junto) e o valor volta para as parcelas
  update contas_receber set status = 'cancelado', motivo_alteracao = 'Desfeito: ' || p_motivo where id = r.conta_receber_id;
  for b in select * from jsonb_array_elements(r.baixa_receber) loop
    if b->>'acao' = 'cancelou' then
      update contas_receber set status = 'aberto', motivo_alteracao = 'Volta da baixa desfeita: ' || p_motivo where id = (b->>'conta')::uuid;
    else
      update contas_receber set valor = round(valor + (b->>'valor')::numeric, 2), motivo_alteracao = 'Volta da baixa desfeita: ' || p_motivo
       where id = (b->>'conta')::uuid;
    end if;
  end loop;
  update extrato_lancamentos set status = 'pendente', conta_receber_id = null, conciliado_por = null, conciliado_em = null
   where conta_receber_id = r.conta_receber_id;

  -- fornecedor: criada e restante são canceladas; paga volta a aberta; a dividida recebe o valor de volta
  for b in select * from jsonb_array_elements(r.baixa_pagar) loop
    if b->>'acao' in ('criou', 'restante') then
      update extrato_lancamentos set status = 'pendente', conta_pagar_id = null, conciliado_por = null, conciliado_em = null where conta_pagar_id = (b->>'conta')::uuid;
      update contas_pagar set status = 'cancelado', motivo_alteracao = 'Desfeito: ' || p_motivo where id = (b->>'conta')::uuid;
    elsif b->>'acao' = 'pagou' then
      update extrato_lancamentos set status = 'pendente', conta_pagar_id = null, conciliado_por = null, conciliado_em = null where conta_pagar_id = (b->>'conta')::uuid;
      update contas_pagar set status = 'aberto', data_pagamento = null, valor_pago = null, motivo_alteracao = 'Desfeito: ' || p_motivo
       where id = (b->>'conta')::uuid;
    else
      update extrato_lancamentos set status = 'pendente', conta_pagar_id = null, conciliado_por = null, conciliado_em = null where conta_pagar_id = (b->>'criada')::uuid;
      update contas_pagar set status = 'cancelado', motivo_alteracao = 'Desfeito: ' || p_motivo where id = (b->>'criada')::uuid;
      update contas_pagar set valor = round(valor + (b->>'valor')::numeric, 2), motivo_alteracao = 'Volta da baixa desfeita: ' || p_motivo
       where id = (b->>'conta')::uuid;
    end if;
  end loop;
  if r.nfe_recebida_id is not null then
    update nfe_recebidas n set conta_pagar_id = (select c.id from contas_pagar c where c.nfe_recebida_id = n.id and c.status <> 'cancelado' order by c.created_at limit 1)
     where n.id = r.nfe_recebida_id and n.conta_pagar_id in (select (x->>'conta')::uuid from jsonb_array_elements(r.baixa_pagar) x
                                                              union select (x->>'criada')::uuid from jsonb_array_elements(r.baixa_pagar) x);
  end if;

  update pedido_pagamentos set excluido_em = now(), excluido_por = auth.uid(), excluido_motivo = trim(p_motivo) where id = p_id;
  insert into pedido_ocorrencias (pedido_id, autor_nome, texto)
  values (r.pedido_id, 'Onde o cliente pagou', 'Desfeito o registro de ' || public.brl(r.valor) || ' de ' || to_char(r.data, 'DD/MM/YYYY') || ': ' || trim(p_motivo));
end $$;
revoke execute on function public._desfazer_pagamento_cliente(uuid, text) from public, anon, authenticated;

-- Quem chama pela tela tem auth.uid(); o agendamento não tem. Dentro de security definer o current_user é sempre o dono.
create or replace function public.lancar_duplicatas_a_vencer(p_desde date default current_date)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare n int := 0; ns text[] := array[array['nfe', 'http://www.portalfiscal.inf.br/nfe']];
begin
  if auth.uid() is not null then perform public.exigir_papel('financeiro'); end if;
  perform set_config('erp.acao_usuario', 'on', true);
  with notas as (
    select r.id, r.fornecedor_id, r.unidade_id, r.emitente_nome, xmlparse(document regexp_replace(r.xml, '^\s*<\?xml[^>]*\?>', '')) as x
      from nfe_recebidas r
     where r.excluida_em is null and r.xml is not null and coalesce(r.situacao, 'autorizada') <> 'cancelada'
       and not exists (select 1 from pedido_pagamentos pp where pp.nfe_recebida_id = r.id and pp.excluido_em is null)
  ), dups as (
    select n.id, n.fornecedor_id, n.unidade_id, n.emitente_nome,
           (xpath('//nfe:ide/nfe:nNF/text()', n.x, ns))[1]::text as nnf,
           d.dup, d.ord, count(*) over (partition by n.id) as total
      from notas n, unnest(xpath('//nfe:cobr/nfe:dup', n.x, ns)) with ordinality as d(dup, ord)
  ), parcelas as (
    select dups.*, (xpath('/nfe:dup/nfe:nDup/text()', dup, ns))[1]::text as ndup,
           (xpath('/nfe:dup/nfe:dVenc/text()', dup, ns))[1]::text::date as venc,
           (xpath('/nfe:dup/nfe:vDup/text()', dup, ns))[1]::text::numeric as valor
      from dups
  ), novas as (
    insert into contas_pagar (descricao, fornecedor_id, categoria, documento, valor, vencimento, status, nfe_recebida_id, unidade_id, observacoes)
    select 'NF ' || p.nnf || ' - ' || coalesce(p.emitente_nome, 'fornecedor') || ' (' || p.ord || '/' || p.total || ')',
           p.fornecedor_id, 'fornecedores', 'NF ' || p.nnf || ' dup ' || coalesce(p.ndup, p.ord::text), p.valor, p.venc, 'aberto', p.id,
           coalesce(p.unidade_id, public.unidade_matriz()), 'Lançada das duplicatas da nota importada'
      from parcelas p
     where p.venc >= p_desde and p.valor > 0
       and not exists (select 1 from contas_pagar c where c.nfe_recebida_id = p.id
                         and (c.documento = 'NF ' || p.nnf || ' dup ' || coalesce(p.ndup, p.ord::text) or (c.vencimento = p.venc and c.valor = p.valor)))
    returning 1
  )
  select count(*) into n from novas;
  return n;
end $function$;
