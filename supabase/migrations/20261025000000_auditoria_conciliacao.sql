-- =====================================================================
-- Auditoria financeira
--   1. Histórico de alterações: quem mudou o quê, quando, valor antes e
--      depois e o motivo. Contas não são excluídas (só canceladas), e mudar
--      valor/vencimento, cancelar ou estornar exige motivo.
--   2. Contas bancárias e conciliação pelo extrato (OFX/CSV): Unicred,
--      Nubank, InfinitePay; cada unidade com as suas contas.
--   3. Exceções: tratativa de cada alerta (indício, confirmado, resolvido),
--      com impacto, responsável e prazo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Histórico de alterações
-- ---------------------------------------------------------------------
create table public.auditoria (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id text,
  acao text not null check (acao in ('insert', 'update', 'delete')),
  usuario uuid,
  usuario_nome text,
  campos text[],
  antes jsonb,
  depois jsonb,
  motivo text,
  origem text not null default 'usuario' check (origem in ('usuario', 'sistema')),
  created_at timestamptz not null default now()
);
create index on public.auditoria (tabela, registro_id);
create index on public.auditoria (created_at desc);
alter table public.auditoria enable row level security;
-- só leitura, e só para quem confere; ninguém altera ou apaga o histórico
create policy "auditoria_select" on public.auditoria for select to authenticated
  using (public.tem_papel('financeiro') or public.e_contador());

alter table public.contas_receber add column motivo_alteracao text;
alter table public.contas_pagar add column motivo_alteracao text;

-- Grava a linha do histórico. Só funciona chamada de dentro do gatilho (ninguém consegue
-- inserir uma linha "de mentira" chamando a função direto pela API).
create or replace function public.registrar_auditoria(p_tabela text, p_registro text, p_acao text, p_campos text[],
  p_antes jsonb, p_depois jsonb, p_motivo text, p_origem text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() = 0 then raise exception 'uso interno'; end if;
  insert into public.auditoria (tabela, registro_id, acao, usuario, usuario_nome, campos, antes, depois, motivo, origem)
  values (p_tabela, p_registro, p_acao, auth.uid(), (select nome from public.usuarios_erp where user_id = auth.uid()),
          p_campos, p_antes, p_depois, p_motivo, p_origem);
end $$;
revoke execute on function public.registrar_auditoria(text, text, text, text[], jsonb, jsonb, text, text) from public, anon;
grant execute on function public.registrar_auditoria(text, text, text, text[], jsonb, jsonb, text, text) to authenticated;

-- Roda com o papel de quem fez a alteração: "authenticated" = alteração direta pela tela/API;
-- dentro das rotinas do ERP (aprovar pedido, conciliar, cancelar…) o papel é o do sistema.
create or replace function public.trg_auditoria()
returns trigger language plpgsql set search_path = public as $$
declare
  v_old jsonb; v_new jsonb; v_campos text[]; v_motivo text;
  v_direto boolean := current_user in ('authenticated', 'anon');
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
    case when v_direto then 'usuario' else 'sistema' end);

  if tg_op = 'DELETE' then return old; end if;
  if v_new ? 'motivo_alteracao' then new := jsonb_populate_record(new, '{"motivo_alteracao": null}'); end if;
  return new;
end $$;

-- "zz_" para rodar depois dos outros gatilhos (totais, mês fechado) e registrar o valor final
do $$
declare t text;
begin
  foreach t in array array['contas_receber', 'contas_pagar', 'pedidos', 'clientes', 'fornecedores', 'transportadoras',
                           'produtos', 'usuarios_erp', 'configuracoes', 'unidades', 'vendedores', 'comissoes'] loop
    execute format('create trigger zz_auditoria before insert or update or delete on public.%I for each row execute function public.trg_auditoria()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Contas bancárias e extrato
-- ---------------------------------------------------------------------
create table public.contas_bancarias (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  nome text not null,
  banco text not null default 'outro' check (banco in ('unicred', 'nubank', 'infinitepay', 'outro', 'caixa')),
  agencia text,
  numero text,
  tipo text not null default 'corrente' check (tipo in ('corrente', 'pagamentos', 'caixa')),
  saldo_inicial numeric(14,2) not null default 0,
  saldo_inicial_data date not null default current_date,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.contas_bancarias enable row level security;
create policy "cb_select" on public.contas_bancarias for select to authenticated using (public.tem_papel('financeiro') or public.e_contador());
create policy "cb_insert" on public.contas_bancarias for insert to authenticated with check (public.tem_papel('financeiro'));
create policy "cb_update" on public.contas_bancarias for update to authenticated using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));
create trigger zz_auditoria before insert or update or delete on public.contas_bancarias for each row execute function public.trg_auditoria();

alter table public.contas_receber add column conta_bancaria_id uuid references public.contas_bancarias(id);
alter table public.contas_pagar add column conta_bancaria_id uuid references public.contas_bancarias(id);

create table public.extrato_importacoes (
  id uuid primary key default gen_random_uuid(),
  conta_bancaria_id uuid not null references public.contas_bancarias(id),
  arquivo text,
  formato text not null check (formato in ('ofx', 'csv')),
  periodo_inicio date,
  periodo_fim date,
  saldo_final numeric(14,2),
  saldo_final_data date,
  linhas_novas int not null default 0,
  linhas_repetidas int not null default 0,
  conciliadas_auto int not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.extrato_importacoes enable row level security;
create policy "ei_select" on public.extrato_importacoes for select to authenticated using (public.tem_papel('financeiro') or public.e_contador());

create table public.extrato_lancamentos (
  id uuid primary key default gen_random_uuid(),
  conta_bancaria_id uuid not null references public.contas_bancarias(id),
  importacao_id uuid references public.extrato_importacoes(id),
  data date not null,
  valor numeric(14,2) not null check (valor <> 0),
  descricao text,
  documento text,
  identificador text not null,               -- FITID do OFX (ou hash da linha do CSV): evita importar duas vezes
  status text not null default 'pendente' check (status in ('pendente', 'conciliado', 'ignorado', 'transferencia')),
  conta_receber_id uuid references public.contas_receber(id),
  conta_pagar_id uuid references public.contas_pagar(id),
  baixou_conta boolean not null default false, -- a baixa da conta foi feita por esta conciliação
  par_transferencia_id uuid references public.extrato_lancamentos(id),
  observacao text,
  conciliado_por uuid,
  conciliado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (conta_bancaria_id, identificador)
);
create index on public.extrato_lancamentos (conta_bancaria_id, data);
create index on public.extrato_lancamentos (status);
alter table public.extrato_lancamentos enable row level security;
create policy "el_select" on public.extrato_lancamentos for select to authenticated using (public.tem_papel('financeiro') or public.e_contador());
-- alterações só pelas funções abaixo (ficam no histórico)
create trigger zz_auditoria before update on public.extrato_lancamentos for each row execute function public.trg_auditoria();

-- Vincula a linha do extrato à conta e, se ela estava em aberto, dá a baixa com a data e o valor do banco
create or replace function public.vincular_lancamento(p_lanc uuid, p_tipo text, p_conta uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l extrato_lancamentos; v_status text; v_cb uuid; v_baixou boolean := false;
begin
  select * into l from extrato_lancamentos where id = p_lanc for update;
  if p_tipo = 'receber' then
    if l.valor < 0 then raise exception 'saída do banco não pode ser ligada a uma conta a receber'; end if;
    select status, conta_bancaria_id into v_status, v_cb from contas_receber where id = p_conta for update;
    if v_status is null then raise exception 'conta a receber não encontrada'; end if;
    if v_status = 'cancelado' then raise exception 'conta cancelada'; end if;
    if exists (select 1 from extrato_lancamentos where conta_receber_id = p_conta and id <> p_lanc and status = 'conciliado') then
      raise exception 'esta conta já está conciliada com outra linha do extrato';
    end if;
    if v_status = 'aberto' then
      update contas_receber set status = 'pago', data_pagamento = l.data, valor_pago = l.valor, conta_bancaria_id = l.conta_bancaria_id,
             motivo_alteracao = 'Baixa pela conciliação bancária' where id = p_conta;
      v_baixou := true;
    elsif v_cb is null then
      update contas_receber set conta_bancaria_id = l.conta_bancaria_id where id = p_conta;
    end if;
    update extrato_lancamentos set status = 'conciliado', conta_receber_id = p_conta, conta_pagar_id = null, baixou_conta = v_baixou,
           conciliado_por = auth.uid(), conciliado_em = now() where id = p_lanc;
  elsif p_tipo = 'pagar' then
    if l.valor > 0 then raise exception 'entrada no banco não pode ser ligada a uma conta a pagar'; end if;
    select status, conta_bancaria_id into v_status, v_cb from contas_pagar where id = p_conta for update;
    if v_status is null then raise exception 'conta a pagar não encontrada'; end if;
    if v_status = 'cancelado' then raise exception 'conta cancelada'; end if;
    if exists (select 1 from extrato_lancamentos where conta_pagar_id = p_conta and id <> p_lanc and status = 'conciliado') then
      raise exception 'esta conta já está conciliada com outra linha do extrato';
    end if;
    if v_status = 'aberto' then
      update contas_pagar set status = 'pago', data_pagamento = l.data, valor_pago = -l.valor, conta_bancaria_id = l.conta_bancaria_id,
             motivo_alteracao = 'Baixa pela conciliação bancária' where id = p_conta;
      v_baixou := true;
    elsif v_cb is null then
      update contas_pagar set conta_bancaria_id = l.conta_bancaria_id where id = p_conta;
    end if;
    update extrato_lancamentos set status = 'conciliado', conta_pagar_id = p_conta, conta_receber_id = null, baixou_conta = v_baixou,
           conciliado_por = auth.uid(), conciliado_em = now() where id = p_lanc;
  else
    raise exception 'tipo inválido';
  end if;
end $$;
revoke execute on function public.vincular_lancamento(uuid, text, uuid) from public, anon, authenticated;

-- Concilia sozinho o que tem um único par certo: mesmo valor, mesma unidade, data próxima
create or replace function public.conciliar_automatico(p_conta uuid)
returns int language plpgsql security definer set search_path = public as $$
declare l record; v_unid uuid; v_ids uuid[]; n int := 0;
begin
  perform public.exigir_papel('financeiro');
  select unidade_id into v_unid from contas_bancarias where id = p_conta;
  for l in select * from extrato_lancamentos where conta_bancaria_id = p_conta and status = 'pendente' order by data loop
    if l.valor > 0 then
      select array_agg(c.id) into v_ids from contas_receber c
       where c.unidade_id = v_unid
         and not exists (select 1 from extrato_lancamentos x where x.conta_receber_id = c.id and x.status = 'conciliado')
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
end $$;

-- Importa as linhas do extrato (repetidas são ignoradas) e já concilia o que for certo
-- p_linhas: [{ data, valor, descricao, documento, identificador }]
create or replace function public.importar_extrato(p_conta uuid, p_arquivo text, p_formato text, p_linhas jsonb,
  p_saldo_final numeric default null, p_saldo_data date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_imp uuid; v_total int; v_novas int; v_auto int;
begin
  perform public.exigir_papel('financeiro');
  if not exists (select 1 from contas_bancarias where id = p_conta and ativo) then raise exception 'conta bancária não encontrada'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then raise exception 'o arquivo não tem lançamentos'; end if;
  v_total := jsonb_array_length(p_linhas);
  insert into extrato_importacoes (conta_bancaria_id, arquivo, formato, periodo_inicio, periodo_fim, saldo_final, saldo_final_data)
  select p_conta, p_arquivo, p_formato, min((e->>'data')::date), max((e->>'data')::date), p_saldo_final, p_saldo_data
    from jsonb_array_elements(p_linhas) e
  returning id into v_imp;

  with novas as (
    insert into extrato_lancamentos (conta_bancaria_id, importacao_id, data, valor, descricao, documento, identificador)
    select p_conta, v_imp, (e->>'data')::date, round((e->>'valor')::numeric, 2), left(e->>'descricao', 300), left(e->>'documento', 60), e->>'identificador'
      from jsonb_array_elements(p_linhas) e
     where coalesce((e->>'valor')::numeric, 0) <> 0 and coalesce(e->>'identificador', '') <> ''
    on conflict (conta_bancaria_id, identificador) do nothing
    returning 1)
  select count(*) into v_novas from novas;

  v_auto := public.conciliar_automatico(p_conta);
  update extrato_importacoes set linhas_novas = v_novas, linhas_repetidas = v_total - v_novas, conciliadas_auto = v_auto where id = v_imp;
  return jsonb_build_object('importacao', v_imp, 'novas', v_novas, 'repetidas', v_total - v_novas, 'conciliadas', v_auto);
end $$;

create or replace function public.conciliar_lancamento(p_lanc uuid, p_tipo text, p_conta uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_papel('financeiro');
  if (select status from extrato_lancamentos where id = p_lanc) <> 'pendente' then raise exception 'esta linha do extrato já foi tratada'; end if;
  perform public.vincular_lancamento(p_lanc, p_tipo, p_conta);
end $$;

-- Desfaz: a linha volta a pendente; se a baixa foi feita pela conciliação, a conta volta a ficar em aberto
create or replace function public.desfazer_conciliacao(p_lanc uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare l extrato_lancamentos;
begin
  perform public.exigir_papel('financeiro');
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'informe o motivo'; end if;
  select * into l from extrato_lancamentos where id = p_lanc for update;
  if l.status = 'pendente' then raise exception 'esta linha ainda não foi tratada'; end if;
  if l.baixou_conta and l.conta_receber_id is not null then
    update contas_receber set status = 'aberto', data_pagamento = null, valor_pago = null, motivo_alteracao = 'Conciliação desfeita: ' || p_motivo
     where id = l.conta_receber_id;
  elsif l.baixou_conta and l.conta_pagar_id is not null then
    update contas_pagar set status = 'aberto', data_pagamento = null, valor_pago = null, motivo_alteracao = 'Conciliação desfeita: ' || p_motivo
     where id = l.conta_pagar_id;
  end if;
  if l.par_transferencia_id is not null then
    update extrato_lancamentos set status = 'pendente', par_transferencia_id = null, observacao = null, conciliado_por = null, conciliado_em = null
     where id = l.par_transferencia_id;
  end if;
  update extrato_lancamentos set status = 'pendente', conta_receber_id = null, conta_pagar_id = null, baixou_conta = false,
         par_transferencia_id = null, observacao = 'Desfeito: ' || p_motivo, conciliado_por = null, conciliado_em = null
   where id = p_lanc;
end $$;

-- Linha que não é receita nem despesa do ERP (aplicação, resgate, estorno do próprio banco)
create or replace function public.ignorar_lancamento(p_lanc uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_papel('financeiro');
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'informe o motivo'; end if;
  update extrato_lancamentos set status = 'ignorado', observacao = p_motivo, conciliado_por = auth.uid(), conciliado_em = now()
   where id = p_lanc and status = 'pendente';
  if not found then raise exception 'esta linha do extrato já foi tratada'; end if;
end $$;

-- Transferência entre contas da empresa: saída numa conta e entrada na outra, mesmo valor; não é receita nem despesa
create or replace function public.marcar_transferencia(p_lanc uuid, p_par uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a extrato_lancamentos; b extrato_lancamentos;
begin
  perform public.exigir_papel('financeiro');
  select * into a from extrato_lancamentos where id = p_lanc for update;
  select * into b from extrato_lancamentos where id = p_par for update;
  if a.id is null or b.id is null then raise exception 'linha do extrato não encontrada'; end if;
  if a.status <> 'pendente' or b.status <> 'pendente' then raise exception 'as duas linhas precisam estar pendentes'; end if;
  if a.conta_bancaria_id = b.conta_bancaria_id then raise exception 'escolha a linha da outra conta'; end if;
  if a.valor + b.valor <> 0 then raise exception 'os valores precisam ser iguais (saída numa conta, entrada na outra)'; end if;
  update extrato_lancamentos set status = 'transferencia', par_transferencia_id = b.id, conciliado_por = auth.uid(), conciliado_em = now() where id = a.id;
  update extrato_lancamentos set status = 'transferencia', par_transferencia_id = a.id, conciliado_por = auth.uid(), conciliado_em = now() where id = b.id;
end $$;

-- Lança no ERP algo que só apareceu no banco (tarifa, juros, rendimento) já pago e conciliado
create or replace function public.lancar_do_extrato(p_lanc uuid, p_categoria text, p_descricao text, p_fornecedor uuid default null, p_cliente uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare l extrato_lancamentos; v_unid uuid; v_id uuid;
begin
  perform public.exigir_papel('financeiro');
  select * into l from extrato_lancamentos where id = p_lanc for update;
  if l.status <> 'pendente' then raise exception 'esta linha do extrato já foi tratada'; end if;
  select unidade_id into v_unid from contas_bancarias where id = l.conta_bancaria_id;
  if l.valor < 0 then
    insert into contas_pagar (descricao, categoria, fornecedor_id, valor, vencimento, status, data_pagamento, valor_pago, unidade_id, conta_bancaria_id, observacoes)
    values (coalesce(nullif(btrim(p_descricao), ''), l.descricao), coalesce(p_categoria, 'outros'), p_fornecedor, -l.valor, l.data, 'pago', l.data, -l.valor,
            v_unid, l.conta_bancaria_id, 'Lançado a partir do extrato bancário')
    returning id into v_id;
    update extrato_lancamentos set status = 'conciliado', conta_pagar_id = v_id, baixou_conta = false, conciliado_por = auth.uid(), conciliado_em = now() where id = p_lanc;
  else
    insert into contas_receber (descricao, cliente_id, valor, vencimento, status, data_pagamento, valor_pago, forma_pagamento, unidade_id, conta_bancaria_id)
    values (coalesce(nullif(btrim(p_descricao), ''), l.descricao), p_cliente, l.valor, l.data, 'pago', l.data, l.valor, 'transferencia', v_unid, l.conta_bancaria_id)
    returning id into v_id;
    update extrato_lancamentos set status = 'conciliado', conta_receber_id = v_id, baixou_conta = false, conciliado_por = auth.uid(), conciliado_em = now() where id = p_lanc;
  end if;
  return v_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array['conciliar_automatico(uuid)', 'importar_extrato(uuid, text, text, jsonb, numeric, date)', 'conciliar_lancamento(uuid, text, uuid)',
                           'desfazer_conciliacao(uuid, text)', 'ignorar_lancamento(uuid, text)', 'marcar_transferencia(uuid, uuid)',
                           'lancar_do_extrato(uuid, text, text, uuid, uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Exceções: tratativa de cada alerta do painel de auditoria
-- ---------------------------------------------------------------------
create table public.auditoria_excecoes (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,            -- tipo:registro (ex.: duplicada:<id da conta>)
  tipo text not null,
  titulo text,
  situacao text not null default 'indicio' check (situacao in ('indicio', 'confirmado', 'resolvido', 'descartado')),
  impacto text,
  responsavel text,
  prazo date,
  observacao text,
  atualizado_por uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.auditoria_excecoes enable row level security;
create policy "ae_select" on public.auditoria_excecoes for select to authenticated using (public.tem_papel('financeiro') or public.e_contador());
create policy "ae_insert" on public.auditoria_excecoes for insert to authenticated with check (public.tem_papel('financeiro') or public.e_contador());
create policy "ae_update" on public.auditoria_excecoes for update to authenticated
  using (public.tem_papel('financeiro') or public.e_contador()) with check (public.tem_papel('financeiro') or public.e_contador());
create or replace function public.trg_excecao_atualizada()
returns trigger language plpgsql as $$
begin new.updated_at := now(); new.atualizado_por := auth.uid(); return new; end $$;
create trigger trg_excecao_atualizada before update on public.auditoria_excecoes for each row execute function public.trg_excecao_atualizada();
create trigger zz_auditoria before insert or update on public.auditoria_excecoes for each row execute function public.trg_auditoria();
