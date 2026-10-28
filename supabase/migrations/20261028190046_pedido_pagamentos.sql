-- Onde o cliente pagou o pedido (28/10, pedido da usuária): cada pagamento do cliente com o lugar em que ele foi feito —
-- na conta da MF, direto a um fornecedor da MF (ex.: peças da Frigelar faturadas para a MF e pagas no cartão do cliente),
-- na conta pessoal da sócia ou outro. Registrar um pagamento baixa a parte paga numa parcela do pedido (sem e-mail nem
-- cobrança ao cliente) e, quando foi direto ao fornecedor, dá a baixa da conta a pagar daquela NF de compra (ou cria a
-- conta já paga). Tudo numa transação; desfazer volta as duas pontas. Só o financeiro.

create table if not exists public.pedido_pagamentos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  tipo text not null check (tipo in ('conta_mf', 'fornecedor', 'conta_socia', 'outro')),
  valor numeric(14,2) not null check (valor > 0),
  data date not null,
  forma text,
  parcelas int not null default 1 check (parcelas between 1 and 48),
  nfe_recebida_id uuid references public.nfe_recebidas(id) on delete set null,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  conta_bancaria_id uuid references public.contas_bancarias(id) on delete set null,
  extrato_lancamento_id uuid references public.extrato_lancamentos(id) on delete set null,
  conta_receber_id uuid references public.contas_receber(id) on delete set null,
  conta_pagar_id uuid references public.contas_pagar(id) on delete set null,
  -- o que foi baixado em cada lado, para desfazer exatamente: [{conta, valor, acao}] (acao: reduziu | cancelou | criou)
  baixa_receber jsonb not null default '[]',
  baixa_pagar jsonb not null default '[]',
  observacao text check (observacao is null or length(observacao) <= 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por uuid,
  excluido_motivo text
);
comment on table public.pedido_pagamentos is 'Onde e quanto o cliente pagou cada pedido (conta da MF, direto ao fornecedor, conta da sócia); gravado só pelas funções registrar_pagamento_cliente e desfazer_pagamento_cliente.';
create index if not exists pedido_pagamentos_pedido_idx on public.pedido_pagamentos (pedido_id, data);
create index if not exists pedido_pagamentos_nfe_idx on public.pedido_pagamentos (nfe_recebida_id) where nfe_recebida_id is not null;
create index if not exists pedido_pagamentos_receber_idx on public.pedido_pagamentos (conta_receber_id) where conta_receber_id is not null;
create index if not exists pedido_pagamentos_pagar_idx on public.pedido_pagamentos (conta_pagar_id) where conta_pagar_id is not null;
create index if not exists pedido_pagamentos_fornecedor_idx on public.pedido_pagamentos (fornecedor_id) where fornecedor_id is not null;
create index if not exists pedido_pagamentos_conta_idx on public.pedido_pagamentos (conta_bancaria_id) where conta_bancaria_id is not null;
create index if not exists pedido_pagamentos_extrato_idx on public.pedido_pagamentos (extrato_lancamento_id) where extrato_lancamento_id is not null;

alter table public.pedido_pagamentos enable row level security;
revoke all on public.pedido_pagamentos from anon, authenticated;
grant select on public.pedido_pagamentos to authenticated;
do $$ begin
  create policy pedido_pagamentos_select on public.pedido_pagamentos for select to authenticated
    using ((select public.tem_papel('financeiro')) or (select public.e_contador()));
exception when duplicate_object then null; end $$;

-- Núcleo (sem checagem de papel): só as funções abaixo chamam. Devolve o id do registro.
create or replace function public._registrar_pagamento_cliente(
  p_pedido uuid, p_tipo text, p_valor numeric, p_data date, p_forma text default null, p_parcelas int default 1,
  p_nfe_recebida uuid default null, p_fornecedor uuid default null, p_conta_bancaria uuid default null,
  p_extrato uuid default null, p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public set "TimeZone" to 'America/Sao_Paulo' as $$
declare
  v_ped pedidos; v_valor numeric := round(coalesce(p_valor, 0), 2); v_resto numeric; v_take numeric;
  v_aberto numeric; c record; v_primeira contas_receber; v_nova uuid; v_onde text; v_baixa_r jsonb := '[]'; v_baixa_p jsonb := '[]';
  v_nf nfe_recebidas; v_forn uuid; v_num text; v_emit text; v_conta_pagar uuid; v_ja numeric; v_lanc extrato_lancamentos;
  v_conta_banco uuid := p_conta_bancaria; v_base text; v_id uuid; v_unid_pagar uuid;
begin
  if p_tipo not in ('conta_mf', 'fornecedor', 'conta_socia', 'outro') then raise exception 'tipo de pagamento inválido'; end if;
  if not (v_valor > 0) then raise exception 'informe o valor pago'; end if;
  if p_data is null or p_data > current_date + 1 then raise exception 'data do pagamento inválida'; end if;
  if p_tipo = 'fornecedor' and p_nfe_recebida is null and p_fornecedor is null then
    raise exception 'escolha a nota do fornecedor (ou o fornecedor)';
  end if;

  select * into v_ped from pedidos where id = p_pedido for update;
  if v_ped.id is null then raise exception 'pedido não encontrado'; end if;
  if v_ped.status not in ('aprovado', 'faturado', 'entregue') then raise exception 'o pedido precisa estar aprovado'; end if;

  -- 1) cliente: tira o valor das parcelas abertas (na ordem do vencimento) e cria a parte paga, sem e-mail nem cobrança
  select coalesce(sum(valor), 0) into v_aberto from contas_receber where pedido_id = p_pedido and status = 'aberto';
  if v_valor > v_aberto + 0.004 then
    raise exception 'o pedido tem só % em aberto', public.brl(v_aberto);
  end if;
  if exists (select 1 from boletos_inter b join contas_receber r on r.id = b.conta_receber_id
              where r.pedido_id = p_pedido and r.status = 'aberto' and b.situacao in ('EM_PROCESSAMENTO', 'A_RECEBER', 'ATRASADO', 'PROTESTO')) then
    raise exception 'há boleto do Inter valendo numa parcela deste pedido: cancele o boleto antes';
  end if;

  v_onde := case p_tipo when 'conta_mf' then 'na conta da MF' when 'fornecedor' then 'direto ao fornecedor'
                        when 'conta_socia' then 'na conta pessoal da sócia' else 'outro' end;
  v_resto := v_valor;
  for c in select * from contas_receber where pedido_id = p_pedido and status = 'aberto' order by vencimento, parcela, created_at for update loop
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

  -- conta da MF: o lançamento do extrato (se escolhido) dá a conta bancária
  if p_tipo = 'conta_mf' and p_extrato is not null then
    select * into v_lanc from extrato_lancamentos where id = p_extrato for update;
    if v_lanc.id is null or v_lanc.valor <= 0 then raise exception 'lançamento do extrato inválido'; end if;
    if v_lanc.status <> 'pendente' then raise exception 'esse lançamento do extrato já foi conciliado'; end if;
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

  -- 2) fornecedor: baixa a conta a pagar da NF de compra (ou cria já paga), como paga pelo cliente
  if p_tipo = 'fornecedor' then
    if p_nfe_recebida is not null then
      select * into v_nf from nfe_recebidas where id = p_nfe_recebida for update;
      if v_nf.id is null or v_nf.excluida_em is not null then raise exception 'nota do fornecedor não encontrada'; end if;
      if coalesce(v_nf.situacao, 'autorizada') = 'cancelada' then raise exception 'essa nota do fornecedor está cancelada'; end if;
      v_forn := v_nf.fornecedor_id; v_unid_pagar := v_nf.unidade_id; v_emit := v_nf.emitente_nome;
      v_num := ltrim(substring(v_nf.chave from 26 for 9), '0');
      -- não passa do valor da nota (somando o que já foi pago por clientes)
      select coalesce(sum(valor), 0) into v_ja from pedido_pagamentos where nfe_recebida_id = v_nf.id and excluido_em is null;
      if v_valor > coalesce(v_nf.valor_total, 0) - v_ja + 0.004 then
        raise exception 'a nota % é de % e já tem % pagos por clientes', v_num, public.brl(v_nf.valor_total), public.brl(v_ja);
      end if;
      v_resto := v_valor;
      for c in select * from contas_pagar where nfe_recebida_id = v_nf.id and status = 'aberto' order by vencimento, created_at for update loop
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
    else
      v_forn := p_fornecedor; v_resto := v_valor;
      select coalesce(nome_fantasia, nome) into v_emit from fornecedores where id = p_fornecedor;
      if v_emit is null then raise exception 'fornecedor não encontrado'; end if;
      v_unid_pagar := v_primeira.unidade_id;
    end if;
    -- o que sobrou (nota sem conta lançada, ou sem nota): conta nova já paga
    if v_resto > 0 then
      insert into contas_pagar (descricao, fornecedor_id, categoria, documento, valor, vencimento, emissao, competencia, status,
        data_pagamento, valor_pago, nfe_recebida_id, unidade_id, observacoes, motivo_alteracao)
      values (case when v_num is not null then 'NF ' || v_num || ' - ' else '' end || coalesce(v_emit, 'fornecedor')
                || ' (paga pelo cliente do pedido #' || v_ped.numero || ')',
        v_forn, 'fornecedores', coalesce('NF ' || v_num, 'Pago pelo cliente - pedido #' || v_ped.numero), v_resto, p_data,
        coalesce(v_nf.data_emissao::date, p_data), date_trunc('month', coalesce(v_nf.data_emissao::date, p_data))::date,
        'pago', p_data, v_resto, v_nf.id, coalesce(v_unid_pagar, v_primeira.unidade_id),
        concat_ws(' · ', 'Paga pelo cliente do pedido #' || v_ped.numero, nullif(p_forma, ''), case when coalesce(p_parcelas, 1) > 1 then p_parcelas || 'x' end),
        'Paga pelo cliente do pedido #' || v_ped.numero)
      returning id into v_id;
      v_baixa_p := v_baixa_p || jsonb_build_object('conta', v_id, 'valor', v_resto, 'acao', 'criou');
      v_conta_pagar := coalesce(v_conta_pagar, v_id);
    end if;
    if v_nf.id is not null then
      update nfe_recebidas set conta_pagar_id = v_conta_pagar where id = v_nf.id and conta_pagar_id is null;
    end if;
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

create or replace function public.registrar_pagamento_cliente(
  p_pedido uuid, p_tipo text, p_valor numeric, p_data date, p_forma text default null, p_parcelas int default 1,
  p_nfe_recebida uuid default null, p_fornecedor uuid default null, p_conta_bancaria uuid default null,
  p_extrato uuid default null, p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_papel('financeiro');
  return public._registrar_pagamento_cliente(p_pedido, p_tipo, p_valor, p_data, p_forma, p_parcelas, p_nfe_recebida, p_fornecedor,
    p_conta_bancaria, p_extrato, p_observacao);
end $$;
revoke execute on function public.registrar_pagamento_cliente(uuid, text, numeric, date, text, int, uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.registrar_pagamento_cliente(uuid, text, numeric, date, text, int, uuid, uuid, uuid, uuid, text) to authenticated;

-- Desfazer: volta as parcelas do cliente e as contas do fornecedor como estavam e marca o registro como desfeito.
create or replace function public._desfazer_pagamento_cliente(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
declare r pedido_pagamentos; b jsonb; v_ped int;
begin
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'escreva o motivo'; end if;
  select * into r from pedido_pagamentos where id = p_id for update;
  if r.id is null or r.excluido_em is not null then raise exception 'registro não encontrado ou já desfeito'; end if;
  select numero into v_ped from pedidos where id = r.pedido_id;

  -- cliente: a parte paga é cancelada (a comissão dela cai junto) e o valor volta para as parcelas abertas
  update contas_receber set status = 'cancelado', motivo_alteracao = 'Desfeito: ' || p_motivo where id = r.conta_receber_id and status = 'pago';
  for b in select * from jsonb_array_elements(r.baixa_receber) loop
    if b->>'acao' = 'cancelou' then
      update contas_receber set status = 'aberto', motivo_alteracao = 'Volta da baixa desfeita: ' || p_motivo where id = (b->>'conta')::uuid;
    else
      update contas_receber set valor = round(valor + (b->>'valor')::numeric, 2), motivo_alteracao = 'Volta da baixa desfeita: ' || p_motivo
       where id = (b->>'conta')::uuid;
    end if;
  end loop;
  if r.extrato_lancamento_id is not null then
    update extrato_lancamentos set status = 'pendente', conta_receber_id = null, conciliado_por = null, conciliado_em = null
     where id = r.extrato_lancamento_id and conta_receber_id = r.conta_receber_id;
  end if;

  -- fornecedor: conta criada é cancelada; conta paga volta a aberta; a dividida recebe o valor de volta
  for b in select * from jsonb_array_elements(r.baixa_pagar) loop
    if b->>'acao' = 'criou' then
      update contas_pagar set status = 'cancelado', motivo_alteracao = 'Desfeito: ' || p_motivo where id = (b->>'conta')::uuid;
    elsif b->>'acao' = 'pagou' then
      update contas_pagar set status = 'aberto', data_pagamento = null, valor_pago = null, motivo_alteracao = 'Desfeito: ' || p_motivo
       where id = (b->>'conta')::uuid;
    else
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

create or replace function public.desfazer_pagamento_cliente(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_papel('financeiro');
  perform public._desfazer_pagamento_cliente(p_id, p_motivo);
end $$;
revoke execute on function public.desfazer_pagamento_cliente(uuid, text) from public, anon;
grant execute on function public.desfazer_pagamento_cliente(uuid, text) to authenticated;

-- A conciliação automática não liga ao extrato a parte paga direto ao fornecedor ou na conta da sócia (o dinheiro não
-- passou pela conta da MF): fica de fora qualquer conta registrada aqui, exceto a "na conta da MF".
create or replace function public.conciliar_automatico_interno(p_conta uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare l record; v_unid uuid; v_ids uuid[]; n int := 0;
begin
  select unidade_id into v_unid from contas_bancarias where id = p_conta;
  for l in select * from extrato_lancamentos where conta_bancaria_id = p_conta and status = 'pendente' order by data loop
    if l.valor > 0 then
      select array_agg(c.id) into v_ids from contas_receber c
       where c.unidade_id = v_unid
         and not exists (select 1 from extrato_lancamentos x where x.conta_receber_id = c.id and x.status = 'conciliado')
         and not exists (select 1 from pedido_pagamentos pp where pp.conta_receber_id = c.id and pp.tipo <> 'conta_mf' and pp.excluido_em is null)
         and ((c.status = 'aberto' and c.valor = l.valor and c.vencimento between l.data - 10 and l.data + 10)
           or (c.status = 'pago' and coalesce(c.valor_pago, c.valor) = l.valor and c.data_pagamento between l.data - 3 and l.data + 3
               and (c.conta_bancaria_id is null or c.conta_bancaria_id = p_conta)));
      if cardinality(v_ids) = 1 then
        begin perform vincular_lancamento(l.id, 'receber', v_ids[1]); n := n + 1;
        exception when others then null; end;
      end if;
    else
      select array_agg(c.id) into v_ids from contas_pagar c
       where c.unidade_id = v_unid
         and not exists (select 1 from extrato_lancamentos x where x.conta_pagar_id = c.id and x.status = 'conciliado')
         -- a conta paga pelo cliente (a criada ou a baixada aqui) não é ligada a saída da conta da MF
         and not exists (select 1 from pedido_pagamentos pp, jsonb_array_elements(pp.baixa_pagar) b
                          where pp.excluido_em is null
                            and ((b->>'acao' in ('pagou', 'criou') and c.id = (b->>'conta')::uuid) or c.id = (b->>'criada')::uuid))
         and ((c.status = 'aberto' and c.valor = -l.valor and c.vencimento between l.data - 10 and l.data + 10)
           or (c.status = 'pago' and coalesce(c.valor_pago, c.valor) = -l.valor and c.data_pagamento between l.data - 3 and l.data + 3
               and (c.conta_bancaria_id is null or c.conta_bancaria_id = p_conta)));
      if cardinality(v_ids) = 1 then
        begin perform vincular_lancamento(l.id, 'pagar', v_ids[1]); n := n + 1;
        exception when others then null; end;
      end if;
    end if;
  end loop;
  return n;
end $function$;

-- As duplicatas de uma nota já paga por cliente não voltam como contas abertas.
create or replace function public.lancar_duplicatas_a_vencer(p_desde date default current_date)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare n int := 0; ns text[] := array[array['nfe', 'http://www.portalfiscal.inf.br/nfe']];
begin
  if current_user in ('authenticated', 'anon') then perform public.exigir_papel('financeiro'); end if;
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
