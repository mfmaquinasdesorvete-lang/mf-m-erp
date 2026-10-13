-- Fluxo de aprovação antes do contador (contas a pagar e a receber). Só acrescenta; não apaga nada.
--   * revisao: em_revisao → (1ª revisão) → [2ª revisão] → aprovado; ou devolvido / rejeitado. "historico" = lançada antes do fluxo.
--   * 2ª revisão quando o valor chega na alçada (configuracoes.aprovacao_alcada), quando aprova com pendência, no estorno,
--     na alteração depois de aprovada e no lançamento corretivo.
--   * quem revisa: configuracoes.aprovacao_revisor1 / aprovacao_revisor2 (o administrador também pode). A 1ª revisão nunca
--     é de quem lançou; a 2ª nunca é de quem fez a 1ª.
--   * lançamento automático (rotina do sistema) entra aprovado quando passa nas validações; o importado do sistema anterior
--     entra como histórico.
--   * contador: valida o lançamento aprovado, tira dúvida (vai para a conversa do mês, presa ao lançamento) e o ajuste volta
--     como "ajustado". Só o contador valida. O mês só fecha com tudo aprovado e validado, ou com justificativa.
--   * lançamento corretivo: corrige_id liga a correção ao lançamento original (que fica como estava).

-- 1. Regras (só o administrador muda: erp_update de configuracoes)
alter table public.configuracoes
  add column if not exists aprovacao_revisor1 uuid[] not null default '{}',
  add column if not exists aprovacao_revisor2 uuid[] not null default '{}',
  add column if not exists aprovacao_alcada numeric(14,2) not null default 300;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'configuracoes_aprovacao_alcada_positiva') then
    alter table public.configuracoes add constraint configuracoes_aprovacao_alcada_positiva check (aprovacao_alcada >= 0);
  end if;
end $$;

-- 2. Campos da revisão nas duas tabelas de contas
do $$
declare t text;
begin
  foreach t in array array['contas_pagar', 'contas_receber'] loop
    -- o que já existe entra como histórico; o que entrar daqui para frente começa em revisão
    execute format('alter table public.%I add column if not exists revisao text not null default ''historico''', t);
    execute format('alter table public.%I alter column revisao set default ''em_revisao''', t);
    execute format('alter table public.%I
      add column if not exists revisao1_por uuid, add column if not exists revisao1_nome text, add column if not exists revisao1_em timestamptz,
      add column if not exists revisao2_por uuid, add column if not exists revisao2_nome text, add column if not exists revisao2_em timestamptz,
      add column if not exists revisao_comentario text,
      add column if not exists exige_2a boolean not null default false, add column if not exists motivo_2a text,
      add column if not exists lancamento text, add column if not exists criado_por uuid,
      add column if not exists contador_status text, add column if not exists contador_em timestamptz,
      add column if not exists contador_nome text, add column if not exists contador_comentario text,
      add column if not exists corrige_id uuid', t);
    if not exists (select 1 from pg_constraint where conname = t || '_revisao_valida') then
      execute format('alter table public.%I add constraint %I check (revisao in (''historico'', ''em_revisao'', ''devolvido'', ''rejeitado'', ''aprovado''))', t, t || '_revisao_valida');
    end if;
    if not exists (select 1 from pg_constraint where conname = t || '_contador_status_valido') then
      execute format('alter table public.%I add constraint %I check (contador_status is null or contador_status in (''validado'', ''duvida'', ''ajustado''))', t, t || '_contador_status_valido');
    end if;
    if not exists (select 1 from pg_constraint where conname = t || '_lancamento_valido') then
      execute format('alter table public.%I add constraint %I check (lancamento is null or lancamento in (''manual'', ''automatico'', ''importado''))', t, t || '_lancamento_valido');
    end if;
    if not exists (select 1 from pg_constraint where conname = t || '_corrige_fk') then
      execute format('alter table public.%I add constraint %I foreign key (corrige_id) references public.%I(id)', t, t || '_corrige_fk', t);
    end if;
    execute format('create index if not exists %I on public.%I (revisao) where revisao in (''em_revisao'', ''devolvido'')', t || '_revisao_idx', t);
  end loop;
end $$;

-- 3. Histórico das revisões (só as funções gravam; ninguém edita nem apaga)
create table if not exists public.revisoes_contas (
  id uuid primary key default gen_random_uuid(),
  tabela text not null check (tabela in ('contas_pagar', 'contas_receber')),
  conta_id uuid not null,
  acao text not null,
  etapa text,
  comentario text,
  usuario uuid default auth.uid(),
  usuario_nome text,
  created_at timestamptz not null default now()
);
create index if not exists revisoes_contas_conta_idx on public.revisoes_contas (tabela, conta_id);
alter table public.revisoes_contas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'revisoes_contas' and policyname = 'revisoes_select') then
    create policy revisoes_select on public.revisoes_contas for select to authenticated using (public.tem_papel('financeiro') or public.e_contador());
  end if;
end $$;

-- dúvida do contador presa ao lançamento
alter table public.contador_mensagens
  add column if not exists conta_tabela text,
  add column if not exists conta_id uuid;

-- 4. Pendências: o que falta para a conta poder ser aprovada sem exceção
--    sem_documento · categoria (fora do plano de contas) · duplicidade (mesmo fornecedor/cliente, valor e vencimento em até 5 dias)
create or replace function public.pendencias_conta_dados(p_tabela text, p_c jsonb)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  v_out text[] := '{}';
  v_id uuid := (p_c->>'id')::uuid;
  v_origem uuid := (p_c->>'conta_origem_id')::uuid;
  v_valor numeric := (p_c->>'valor')::numeric;
  v_venc date := (p_c->>'vencimento')::date;
  v_cat text := lower(btrim(coalesce(p_c->>'categoria', '')));
  v_anexo boolean;
begin
  if p_tabela = 'contas_pagar' then
    v_anexo := exists (select 1 from documentos d where d.entidade = 'conta_pagar' and d.entidade_id in (v_id, v_origem));
    if coalesce(btrim(p_c->>'documento'), '') = '' and p_c->>'nfe_recebida_id' is null and not v_anexo
       and v_cat not in ('tarifas bancárias', 'juros e multas', 'comissoes') then
      v_out := array_append(v_out, 'sem_documento');
    end if;
    if not exists (select 1 from categorias_financeiras c where c.ativo and c.tipo = 'despesa' and lower(c.nome) = v_cat) then
      v_out := array_append(v_out, 'categoria');
    end if;
    if exists (select 1 from contas_pagar o
                where o.id <> v_id and o.status <> 'cancelado' and o.valor = v_valor and abs(o.vencimento - v_venc) <= 5
                  and o.conta_origem_id is distinct from v_id and o.id is distinct from v_origem
                  and case when p_c->>'fornecedor_id' is not null then o.fornecedor_id = (p_c->>'fornecedor_id')::uuid
                           else o.fornecedor_id is null and lower(btrim(o.descricao)) = lower(btrim(p_c->>'descricao')) end) then
      v_out := array_append(v_out, 'duplicidade');
    end if;
  elsif p_tabela = 'contas_receber' then
    v_anexo := exists (select 1 from documentos d where d.entidade = 'conta_receber' and d.entidade_id in (v_id, v_origem));
    if p_c->>'pedido_id' is null and p_c->>'os_id' is null and p_c->>'nota_fiscal_id' is null and p_c->>'nfse_id' is null
       and not v_anexo and v_cat not in ('receitas financeiras') then
      v_out := array_append(v_out, 'sem_documento');
    end if;
    if not exists (select 1 from categorias_financeiras c where c.ativo and c.tipo = 'receita' and lower(c.nome) = v_cat) then
      v_out := array_append(v_out, 'categoria');
    end if;
    if p_c->>'cliente_id' is not null and exists (select 1 from contas_receber o
                where o.id <> v_id and o.status <> 'cancelado' and o.valor = v_valor and abs(o.vencimento - v_venc) <= 5
                  and o.cliente_id = (p_c->>'cliente_id')::uuid
                  and o.conta_origem_id is distinct from v_id and o.id is distinct from v_origem
                  and (p_c->>'pedido_id' is null or o.pedido_id is distinct from (p_c->>'pedido_id')::uuid)) then
      v_out := array_append(v_out, 'duplicidade');
    end if;
  else
    raise exception 'tabela inválida';
  end if;
  return v_out;
end $$;

create or replace function public.pendencias_conta(p_tabela text, p_id uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if p_tabela not in ('contas_pagar', 'contas_receber') then raise exception 'tabela inválida'; end if;
  execute format('select to_jsonb(c) from %I c where id = $1', p_tabela) into v using p_id;
  if v is null then return null; end if;
  return public.pendencias_conta_dados(p_tabela, v);
end $$;
revoke execute on function public.pendencias_conta_dados(text, jsonb) from public, anon;
revoke execute on function public.pendencias_conta(text, uuid) from public, anon;
-- o gatilho roda como quem grava: precisa poder chamar a conferência (só diz o que falta)
grant execute on function public.pendencias_conta_dados(text, jsonb) to authenticated;
grant execute on function public.pendencias_conta(text, uuid) to authenticated;

-- 5. Gatilho: origem do lançamento, entrada no fluxo e volta para revisão quando muda depois de aprovada.
--    Campos da revisão só mudam pelas funções (revisar_contas, contador_conferir).
-- sem "security definer": current_user tem de ser quem gravou (authenticated = pessoa na tela; outro = rotina do sistema)
create or replace function public.trg_revisao_conta()
returns trigger language plpgsql set search_path = public as $$
declare
  v_direto boolean := current_user in ('authenticated', 'anon');
  v_funcao boolean := coalesce(current_setting('erp.revisao', true), '') = 'on';
  v_pend text[];
  v_origem jsonb;
  v_mudou boolean;
  v_estorno boolean;
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, auth.uid());
    new.revisao1_por := null; new.revisao1_nome := null; new.revisao1_em := null;
    new.revisao2_por := null; new.revisao2_nome := null; new.revisao2_em := null;
    new.contador_status := null; new.contador_em := null; new.contador_nome := null; new.contador_comentario := null;
    new.exige_2a := new.corrige_id is not null;
    new.motivo_2a := case when new.corrige_id is not null then 'lançamento corretivo' end;
    new.revisao_comentario := null;
    if new.id_externo is not null then
      new.lancamento := 'importado'; new.revisao := 'historico';
      return new;
    end if;
    new.lancamento := case when v_direto then 'manual' else 'automatico' end;
    new.revisao := 'em_revisao';
    -- restante de um pagamento parcial: segue a conta de origem
    if new.conta_origem_id is not null then
      execute format('select to_jsonb(c) from %I c where id = $1', tg_table_name) into v_origem using new.conta_origem_id;
      if v_origem->>'revisao' in ('aprovado', 'historico') then
        new.revisao := v_origem->>'revisao';
        new.revisao1_nome := 'Restante de conta já aprovada'; new.revisao1_em := now();
        return new;
      end if;
    end if;
    -- automático que passa nas validações entra aprovado
    if new.lancamento = 'automatico' and new.corrige_id is null then
      v_pend := public.pendencias_conta_dados(tg_table_name, to_jsonb(new));
      if cardinality(v_pend) = 0 then
        new.revisao := 'aprovado';
        new.revisao1_nome := 'Automático (passou nas validações)'; new.revisao1_em := now();
      end if;
    end if;
    return new;
  end if;

  -- UPDATE
  if v_funcao then return new; end if;
  -- quem edita a conta não mexe nos campos da revisão
  new.revisao := old.revisao;
  new.revisao1_por := old.revisao1_por; new.revisao1_nome := old.revisao1_nome; new.revisao1_em := old.revisao1_em;
  new.revisao2_por := old.revisao2_por; new.revisao2_nome := old.revisao2_nome; new.revisao2_em := old.revisao2_em;
  new.revisao_comentario := old.revisao_comentario;
  new.exige_2a := old.exige_2a; new.motivo_2a := old.motivo_2a;
  new.lancamento := old.lancamento; new.criado_por := old.criado_por;
  new.contador_status := old.contador_status; new.contador_em := old.contador_em;
  new.contador_nome := old.contador_nome; new.contador_comentario := old.contador_comentario;
  new.corrige_id := old.corrige_id;

  -- mudanças feitas pelas rotinas do sistema (baixa, pagamento parcial, conciliação) não reabrem a revisão
  if not v_direto then return new; end if;

  v_estorno := old.status = 'pago' and new.status = 'aberto';
  v_mudou := v_estorno
    or new.valor is distinct from old.valor or new.vencimento is distinct from old.vencimento
    or new.categoria is distinct from old.categoria or new.competencia is distinct from old.competencia
    or new.rateio is distinct from old.rateio;

  if old.revisao = 'devolvido' and (v_mudou or to_jsonb(new) - 'motivo_alteracao' <> to_jsonb(old) - 'motivo_alteracao') then
    -- corrigida: volta para a revisão desde o começo
    new.revisao := 'em_revisao';
  elsif v_mudou and new.status <> 'cancelado' then
    if old.revisao in ('aprovado', 'historico') or (old.revisao = 'em_revisao' and old.revisao1_em is not null) then
      new.revisao := 'em_revisao';
      new.revisao1_por := null; new.revisao1_nome := null; new.revisao1_em := null;
      new.revisao2_por := null; new.revisao2_nome := null; new.revisao2_em := null;
      new.exige_2a := true;
      new.motivo_2a := case when v_estorno then 'estorno' when old.revisao = 'em_revisao' then 'alterada durante a revisão' else 'alterada depois de aprovada' end;
    end if;
    if old.contador_status = 'duvida' then new.contador_status := 'ajustado'; new.contador_em := now();
    elsif old.contador_status = 'validado' then new.contador_status := null; new.contador_em := null; new.contador_nome := null;
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['contas_pagar', 'contas_receber'] loop
    -- "trg_zr_…": depois de trg_restante_sem_decisao e antes de zz_auditoria (que registra o que a revisão mudou)
    if not exists (select 1 from pg_trigger where tgname = 'trg_zr_revisao_conta' and tgrelid = ('public.' || t)::regclass) then
      execute format('create trigger trg_zr_revisao_conta before insert or update on public.%I for each row execute function public.trg_revisao_conta()', t);
    end if;
  end loop;
end $$;

-- 6. Revisão: aprovar (1ª e 2ª), devolver, rejeitar, reenviar
create or replace function public.revisar_contas(p_tabela text, p_ids uuid[], p_acao text, p_comentario text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_cfg configuracoes;
  v_admin boolean := public.is_erp_admin();
  v_com text := nullif(btrim(p_comentario), '');
  v_c jsonb;
  v_id uuid;
  v_pend text[];
  v_etapa int;
  v_exige boolean;
  v_motivo text;
  v_criador uuid;
  v_r1 uuid;
  v_n int := 0;
  v_para2 int := 0;
begin
  perform public.exigir_papel('financeiro');
  if p_tabela not in ('contas_pagar', 'contas_receber') then raise exception 'tabela inválida'; end if;
  if p_acao not in ('aprovar', 'devolver', 'rejeitar', 'reenviar') then raise exception 'ação inválida'; end if;
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'escolha ao menos uma conta'; end if;
  if p_acao in ('devolver', 'rejeitar') and char_length(coalesce(v_com, '')) < 5 then
    raise exception 'escreva o motivo (fica no histórico e quem lançou vê)';
  end if;
  select * into v_cfg from configuracoes where id = 1;
  select nullif(btrim(nome), '') into v_nome from usuarios_erp where user_id = v_uid;
  perform set_config('erp.revisao', 'on', true);
  perform set_config('erp.acao_usuario', 'on', true);

  foreach v_id in array p_ids loop
    execute format('select to_jsonb(c) from %I c where id = $1 for update', p_tabela) into v_c using v_id;
    if v_c is null then raise exception 'conta não encontrada'; end if;
    v_criador := (v_c->>'criado_por')::uuid;
    v_r1 := (v_c->>'revisao1_por')::uuid;

    if p_acao = 'reenviar' then
      if v_c->>'revisao' <> 'devolvido' then raise exception '"%" não está devolvida', v_c->>'descricao'; end if;
      execute format('update %I set revisao = ''em_revisao'' where id = $1', p_tabela) using v_id;
      insert into revisoes_contas (tabela, conta_id, acao, comentario, usuario_nome) values (p_tabela, v_id, 'reenviou', v_com, v_nome);
      v_n := v_n + 1;
      continue;
    end if;

    if v_c->>'revisao' <> 'em_revisao' then
      raise exception '"%" não está esperando revisão', v_c->>'descricao';
    end if;
    v_etapa := case when v_c->>'revisao1_em' is null then 1 else 2 end;
    -- quem pode: 1ª revisão = revisor 1 (ou administrador; o revisor 2 cobre quando foi o revisor 1 quem lançou);
    -- 2ª revisão = revisor 2 (ou administrador). Quem lançou não faz a 1ª; quem fez a 1ª não faz a 2ª.
    if v_etapa = 1 and not (v_admin or v_uid = any (v_cfg.aprovacao_revisor1)
        or (v_uid = any (v_cfg.aprovacao_revisor2) and v_criador = any (v_cfg.aprovacao_revisor1))) then
      raise exception 'a 1ª revisão de "%" é de quem está em Aprovações → Regras como 1ª revisão', v_c->>'descricao';
    end if;
    if v_etapa = 2 and not (v_admin or v_uid = any (v_cfg.aprovacao_revisor2)) then
      raise exception 'a 2ª revisão de "%" é de quem está em Aprovações → Regras como 2ª revisão', v_c->>'descricao';
    end if;
    if v_etapa = 1 and v_criador is not null and v_criador = v_uid then
      raise exception '"%" foi lançada por você: outra pessoa faz a 1ª revisão', v_c->>'descricao';
    end if;
    if v_etapa = 2 and v_r1 = v_uid then
      raise exception 'você já fez a 1ª revisão de "%": a 2ª é de outra pessoa', v_c->>'descricao';
    end if;

    if p_acao = 'devolver' then
      execute format('update %I set revisao = ''devolvido'', revisao_comentario = $2, revisao1_por = null, revisao1_nome = null, revisao1_em = null,
                        revisao2_por = null, revisao2_nome = null, revisao2_em = null where id = $1', p_tabela) using v_id, v_com;
      insert into revisoes_contas (tabela, conta_id, acao, etapa, comentario, usuario_nome) values (p_tabela, v_id, 'devolveu', v_etapa || 'ª revisão', v_com, v_nome);
      perform notificar('outro', 'Conta devolvida para correção', left((v_c->>'descricao') || ': ' || v_com, 160), '/aprovacoes', '{financeiro}', (v_c->>'unidade_id')::uuid);
    elsif p_acao = 'rejeitar' then
      execute format('update %I set revisao = ''rejeitado'', revisao_comentario = $2,
                        status = case when status = ''aberto'' then ''cancelado'' else status end,
                        motivo_alteracao = case when status = ''aberto'' then left(''Rejeitada na revisão: '' || $2, 500) else motivo_alteracao end
                      where id = $1', p_tabela) using v_id, v_com;
      insert into revisoes_contas (tabela, conta_id, acao, etapa, comentario, usuario_nome) values (p_tabela, v_id, 'rejeitou', v_etapa || 'ª revisão', v_com, v_nome);
    else -- aprovar
      v_pend := public.pendencias_conta(p_tabela, v_id);
      v_exige := (v_c->>'exige_2a')::boolean;
      v_motivo := v_c->>'motivo_2a';
      if cardinality(v_pend) > 0 then
        if char_length(coalesce(v_com, '')) < 10 then
          raise exception '"%" tem pendência (%): para aprovar mesmo assim, escreva por quê (vai para a 2ª revisão)',
            v_c->>'descricao', array_to_string(v_pend, ', ');
        end if;
        v_exige := true;
        v_motivo := coalesce(v_motivo || ' · ', '') || 'aprovada com pendência (' || array_to_string(v_pend, ', ') || ')';
      end if;
      if (v_c->>'valor')::numeric >= v_cfg.aprovacao_alcada then
        v_exige := true;
        v_motivo := coalesce(v_motivo, 'valor a partir de ' || public.reais(v_cfg.aprovacao_alcada));
      end if;
      if v_etapa = 1 then
        execute format('update %I set revisao1_por = $2, revisao1_nome = $3, revisao1_em = now(), exige_2a = $4, motivo_2a = $5,
                          revisao_comentario = coalesce($6, revisao_comentario), revisao = case when $4 then ''em_revisao'' else ''aprovado'' end
                        where id = $1', p_tabela) using v_id, v_uid, v_nome, v_exige, v_motivo, v_com;
        if v_exige then v_para2 := v_para2 + 1; end if;
      else
        execute format('update %I set revisao2_por = $2, revisao2_nome = $3, revisao2_em = now(), revisao = ''aprovado'',
                          revisao_comentario = coalesce($4, revisao_comentario) where id = $1', p_tabela) using v_id, v_uid, v_nome, v_com;
      end if;
      insert into revisoes_contas (tabela, conta_id, acao, etapa, comentario, usuario_nome)
      values (p_tabela, v_id, 'aprovou', v_etapa || 'ª revisão', v_com, v_nome);
    end if;
    v_n := v_n + 1;
  end loop;
  if v_para2 > 0 then
    perform notificar('outro', v_para2 || ' conta(s) esperando a 2ª revisão', 'Aprovações', '/aprovacoes', '{financeiro}', null);
  end if;
  return v_n;
end $$;
revoke execute on function public.revisar_contas(text, uuid[], text, text) from public, anon;
grant execute on function public.revisar_contas(text, uuid[], text, text) to authenticated;

-- 7. Contador: validar, dúvida, desfazer (só o contador)
create or replace function public.contador_conferir(p_tabela text, p_ids uuid[], p_acao text, p_comentario text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_com text := nullif(btrim(p_comentario), '');
  v_c jsonb;
  v_id uuid;
  v_n int := 0;
  v_comp text;
begin
  if not public.e_contador() then raise exception 'só o contador valida os lançamentos'; end if;
  if p_tabela not in ('contas_pagar', 'contas_receber') then raise exception 'tabela inválida'; end if;
  if p_acao not in ('validar', 'duvida', 'desfazer') then raise exception 'ação inválida'; end if;
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'escolha ao menos um lançamento'; end if;
  if p_acao = 'duvida' and char_length(coalesce(v_com, '')) < 5 then raise exception 'escreva a dúvida'; end if;
  select nullif(btrim(nome), '') into v_nome from usuarios_erp where user_id = v_uid;
  perform set_config('erp.revisao', 'on', true);
  perform set_config('erp.acao_usuario', 'on', true);

  foreach v_id in array p_ids loop
    execute format('select to_jsonb(c) from %I c where id = $1 for update', p_tabela) into v_c using v_id;
    if v_c is null then raise exception 'lançamento não encontrado'; end if;
    if p_acao = 'validar' and v_c->>'revisao' not in ('aprovado', 'historico') then
      raise exception '"%" ainda não foi aprovada internamente', v_c->>'descricao';
    end if;
    execute format('update %I set contador_status = $2, contador_em = now(), contador_nome = $3,
                      contador_comentario = case when $2 = ''duvida'' then $4 else contador_comentario end where id = $1', p_tabela)
      using v_id, case p_acao when 'validar' then 'validado' when 'duvida' then 'duvida' end, v_nome, v_com;
    insert into revisoes_contas (tabela, conta_id, acao, etapa, comentario, usuario_nome)
    values (p_tabela, v_id, case p_acao when 'validar' then 'validou' when 'duvida' then 'perguntou' else 'desfez a validação' end, 'contador', v_com, v_nome);
    if p_acao = 'duvida' then
      v_comp := to_char(coalesce((v_c->>'data_pagamento')::date, (v_c->>'competencia')::date, (v_c->>'vencimento')::date), 'YYYY-MM');
      insert into contador_mensagens (unidade_id, competencia, autor, autor_nome, texto, conta_tabela, conta_id)
      values ((v_c->>'unidade_id')::uuid, v_comp, v_uid, v_nome,
              left('Dúvida sobre "' || (v_c->>'descricao') || '" (' || public.reais((v_c->>'valor')::numeric) || '): ' || v_com, 4000), p_tabela, v_id);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.contador_conferir(text, uuid[], text, text) from public, anon;
grant execute on function public.contador_conferir(text, uuid[], text, text) to authenticated;

-- 8. Fechar o mês: igual ao anterior, mas pede tudo aprovado e validado (ou a justificativa)
create or replace function public.fechar_competencia(p_unidade uuid, p_competencia text, p_observacoes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_falta int;
begin
  if not (public.e_contador() or public.is_erp_admin()) then raise exception 'só o contador ou o administrador fecha o mês'; end if;
  if p_competencia !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'competência inválida'; end if;
  if p_competencia >= to_char(current_date, 'YYYY-MM') then raise exception 'só dá para fechar meses que já terminaram'; end if;
  select count(*) into v_falta from (
    select revisao, contador_status from contas_pagar
     where unidade_id = p_unidade and status = 'pago' and to_char(data_pagamento, 'YYYY-MM') = p_competencia
    union all
    select revisao, contador_status from contas_receber
     where unidade_id = p_unidade and status = 'pago' and to_char(data_pagamento, 'YYYY-MM') = p_competencia
  ) x where not (x.revisao = 'historico' or (x.revisao = 'aprovado' and x.contador_status is not distinct from 'validado'));
  if v_falta > 0 and char_length(btrim(coalesce(p_observacoes, ''))) < 15 then
    raise exception '% lançamento(s) do mês ainda não foram aprovados e validados: valide-os ou escreva na observação por que vai fechar assim (mínimo 15 letras)', v_falta;
  end if;
  insert into fechamentos (unidade_id, competencia, status, fechado_em, fechado_por, observacoes)
  values (p_unidade, p_competencia, 'fechado', now(), auth.uid(), p_observacoes)
  on conflict (unidade_id, competencia) do update set status = 'fechado', fechado_em = now(), fechado_por = auth.uid(),
    observacoes = coalesce(excluded.observacoes, fechamentos.observacoes);
  perform notificar('outro', 'Mês ' || to_char(to_date(p_competencia, 'YYYY-MM'), 'MM/YYYY') || ' fechado pelo contador',
    (select nome from unidades where id = p_unidade), '/contador', '{financeiro}', p_unidade);
end $$;

-- 9. Contas em aberto lançadas antes do fluxo entram nele (as pagas e canceladas ficam como histórico).
--    As que foram criadas por rotina do sistema e passam nas validações já entram aprovadas.
do $$
declare t text; r record; v_auto boolean;
begin
  perform set_config('erp.revisao', 'on', true);
  foreach t in array array['contas_pagar', 'contas_receber'] loop
    for r in execute format('select c.id, to_jsonb(c) as j from %I c where c.status = ''aberto'' and c.revisao = ''historico'' and c.id_externo is null', t) loop
      v_auto := exists (select 1 from auditoria a where a.tabela = t and a.registro_id = r.id::text and a.acao = 'insert' and a.origem = 'sistema');
      if v_auto and cardinality(public.pendencias_conta_dados(t, r.j)) = 0 then
        execute format('update %I set revisao = ''aprovado'', lancamento = ''automatico'', revisao1_nome = ''Automático (passou nas validações)'', revisao1_em = now() where id = $1', t) using r.id;
      else
        execute format('update %I set revisao = ''em_revisao'', lancamento = case when $2 then ''automatico'' else ''manual'' end,
                          criado_por = (select a.usuario from auditoria a where a.tabela = $3 and a.registro_id = $1::text and a.acao = ''insert'' limit 1)
                        where id = $1', t) using r.id, v_auto, t;
      end if;
    end loop;
  end loop;
  perform set_config('erp.revisao', '', true);
end $$;
