-- =====================================================================
-- Teste do giga (registro de qualidade REG-006, Revisão 00): cada máquina testada na bancada antes de sair da fábrica.
-- No papel: Data | Máquina | NS | Operador | Funcional | Giga de Testes (Cont. Aterram. e Tensão Suport.) | Observações.
--  * testes_giga: um teste por linha. Data e hora, unidade, máquina (produto tipo máquina), número de série (NS),
--    OP ligada (opcional), operador (funcionário, usuário do ERP ou nome), os três resultados (aprovado/reprovado),
--    medidas opcionais (aterramento: resistência em Ω e corrente de teste em A; tensão suportável: tensão aplicada
--    em V, tempo em s e corrente de fuga em mA), giga usada, observações, quem lançou e quando.
--    Resultado geral calculado: aprovada só com os três aprovados.
--  * Histórico nunca sobrescrito: o teste não muda depois de gravado (gatilho). Reprovada → novo teste do mesmo NS
--    (reteste), ligado ao anterior, com o número da tentativa. Lançamento errado é anulado com o motivo e fica no
--    histórico, fora das contas.
--  * NS com teste aprovado não recebe outro teste (aviso na função + índice único).
--  * teste_giga_parametros: limites por modelo, com padrão geral (produto vazio). Continuidade do aterramento:
--    resistência máxima e corrente de teste. Tensão suportável: tensão, tempo e corrente de fuga máxima.
--    Começam vazios: os valores são da empresa (confirmar com o responsável técnico). Os ensaios de segurança
--    elétrica de aparelhos seguem a família IEC/NBR 60335. Cada teste guarda os limites da hora em que foi feito.
--  * Funções (checagem de papel e auditoria):
--      teste_giga_lancar            — técnico (produção) ou administrador;
--      teste_giga_anular            — técnico ou administrador, com motivo;
--      teste_giga_salvar_parametros — só o administrador;
--      teste_giga_operadores        — funcionários ativos e usuários do ERP, para escolher o operador;
--      teste_giga_situacao          — resumo do teste por NS (ficha da máquina, Ficha 360 e OP), também para vendas.
--  * Leem os testes: técnico, financeiro e administrador. Marcadores coloridos: marcar_registros aceita testes_giga.
-- Somente acréscimos: tabelas novas, funções create or replace e políticas novas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Apoio: número digitado (vírgula ou ponto) e número em texto no jeito brasileiro
-- ---------------------------------------------------------------------
create or replace function public.teste_giga_num(p text)
returns numeric language plpgsql immutable set search_path = public as $$
declare v text := replace(replace(btrim(coalesce(p, '')), ' ', ''), ',', '.');
begin
  if v = '' then return null; end if;
  if v !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'número inválido: %', p; end if;
  return v::numeric;
end $$;

create or replace function public.teste_giga_txt(n numeric)
returns text language sql immutable set search_path = public as $$
  select case when n is null then null
              when n = trunc(n) then trunc(n)::text
              else replace(rtrim(rtrim(n::text, '0'), '.'), '.', ',') end;
$$;

revoke execute on function public.teste_giga_num(text) from public, anon;
revoke execute on function public.teste_giga_txt(numeric) from public, anon;
grant execute on function public.teste_giga_num(text) to authenticated;
grant execute on function public.teste_giga_txt(numeric) to authenticated;

-- ---------------------------------------------------------------------
-- Limites dos testes (por modelo, com padrão geral)
-- ---------------------------------------------------------------------
create table if not exists public.teste_giga_parametros (
  id uuid primary key default gen_random_uuid(),
  -- vazio = padrão geral (vale para os modelos sem limite próprio)
  produto_id uuid references public.produtos(id),
  aterramento_resistencia_max_ohm numeric(10,4),
  aterramento_corrente_a numeric(8,2),
  tensao_v numeric(8,1),
  tensao_tempo_s numeric(8,1),
  tensao_fuga_max_ma numeric(10,3),
  observacao text,
  ativo boolean not null default true,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_por uuid,
  atualizado_em timestamptz,
  constraint teste_giga_parametros_valores check (
        coalesce(aterramento_resistencia_max_ohm, 0) >= 0 and coalesce(aterramento_corrente_a, 0) >= 0
    and coalesce(tensao_v, 0) >= 0 and coalesce(tensao_tempo_s, 0) >= 0 and coalesce(tensao_fuga_max_ma, 0) >= 0
    and (observacao is null or length(observacao) <= 500))
);
comment on table public.teste_giga_parametros is 'Teste do giga (REG-006): limites por modelo; produto vazio = padrão geral. Gravados por teste_giga_salvar_parametros (administrador). Valores da empresa: confirmar com o responsável técnico.';

create unique index if not exists teste_giga_parametros_modelo on public.teste_giga_parametros (produto_id) nulls not distinct;

alter table public.teste_giga_parametros enable row level security;
revoke all on public.teste_giga_parametros from anon, authenticated;
grant select on public.teste_giga_parametros to authenticated;
grant all on public.teste_giga_parametros to service_role;

do $$ begin
  create policy teste_giga_parametros_ler on public.teste_giga_parametros for select to authenticated
    using (public.tem_algum_papel(array['tecnico', 'financeiro']));
exception when duplicate_object then null; end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'zz_auditoria' and tgrelid = 'public.teste_giga_parametros'::regclass) then
    create trigger zz_auditoria before insert or update on public.teste_giga_parametros for each row execute function public.trg_auditoria();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Testes
-- ---------------------------------------------------------------------
create sequence if not exists public.testes_giga_numero_seq;

create table if not exists public.testes_giga (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null default nextval('public.testes_giga_numero_seq'),
  testado_em timestamptz not null default now(),
  unidade_id uuid references public.unidades(id),
  produto_id uuid not null references public.produtos(id),
  -- NS em maiúsculas, sem espaços nas pontas
  numero_serie text not null,
  ordem_producao_id uuid references public.ordens_producao(id),
  -- operador: funcionário (RH) ou usuário do ERP; o nome fica guardado como estava no dia
  operador_funcionario_id uuid references public.funcionarios(id),
  operador_user_id uuid,
  operador_nome text not null,
  funcional text not null,
  aterramento text not null,
  aterramento_resistencia_ohm numeric(10,4),
  aterramento_corrente_a numeric(8,2),
  tensao text not null,
  tensao_aplicada_v numeric(8,1),
  tensao_tempo_s numeric(8,1),
  tensao_fuga_ma numeric(10,3),
  resultado text generated always as (
    case when funcional = 'aprovado' and aterramento = 'aprovado' and tensao = 'aprovado' then 'aprovada' else 'reprovada' end) stored,
  -- número da giga (equipamento de teste) usada
  giga text,
  observacoes text,
  -- reteste: o teste reprovado anterior do mesmo NS
  reteste_de uuid references public.testes_giga(id),
  tentativa integer not null default 1,
  -- limites em vigor na hora do teste (do modelo ou o padrão geral)
  parametros jsonb not null default '{}'::jsonb,
  -- medida fora do limite marcada como aprovada (com a explicação nas observações)
  divergencias text[] not null default '{}',
  marcadores uuid[] not null default '{}',
  anulado_em timestamptz,
  anulado_por uuid,
  anulado_motivo text,
  criado_por uuid default auth.uid(),
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  constraint testes_giga_resultados check (
    funcional in ('aprovado', 'reprovado') and aterramento in ('aprovado', 'reprovado') and tensao in ('aprovado', 'reprovado')),
  constraint testes_giga_ns check (numero_serie = upper(btrim(numero_serie)) and numero_serie <> '' and length(numero_serie) <= 60),
  constraint testes_giga_medidas check (
        coalesce(aterramento_resistencia_ohm, 0) >= 0 and coalesce(aterramento_corrente_a, 0) >= 0
    and coalesce(tensao_aplicada_v, 0) >= 0 and coalesce(tensao_tempo_s, 0) >= 0 and coalesce(tensao_fuga_ma, 0) >= 0),
  constraint testes_giga_textos check (
        btrim(operador_nome) <> '' and length(operador_nome) <= 120
    and (giga is null or length(giga) <= 60) and (observacoes is null or length(observacoes) <= 1000)
    and (anulado_motivo is null or length(anulado_motivo) <= 500)),
  constraint testes_giga_tentativa check (tentativa >= 1),
  constraint testes_giga_anulado check ((anulado_em is null) = (anulado_motivo is null))
);
alter sequence public.testes_giga_numero_seq owned by public.testes_giga.numero;
comment on table public.testes_giga is 'Teste do giga (registro de qualidade REG-006): um teste por linha, nunca sobrescrito. Reteste ligado ao anterior; anulado com motivo. Gravado por teste_giga_lancar e teste_giga_anular.';

create unique index if not exists testes_giga_numero_unico on public.testes_giga (numero);
-- um teste aprovado por NS (os anulados não contam)
create unique index if not exists testes_giga_ns_aprovado on public.testes_giga (numero_serie)
  where funcional = 'aprovado' and aterramento = 'aprovado' and tensao = 'aprovado' and anulado_em is null;
create index if not exists testes_giga_ns on public.testes_giga (numero_serie, testado_em);
create index if not exists testes_giga_data on public.testes_giga (testado_em);
create index if not exists testes_giga_produto on public.testes_giga (produto_id);
create index if not exists testes_giga_op on public.testes_giga (ordem_producao_id) where ordem_producao_id is not null;

alter table public.testes_giga enable row level security;
revoke all on public.testes_giga from anon, authenticated;
revoke all on sequence public.testes_giga_numero_seq from anon, authenticated;
grant select on public.testes_giga to authenticated;
-- direto pela tela só os marcadores (marcar_registros); o resto só pelas funções
grant update (marcadores) on public.testes_giga to authenticated;
grant all on public.testes_giga to service_role;

do $$ begin
  create policy testes_giga_ler on public.testes_giga for select to authenticated
    using (public.tem_algum_papel(array['tecnico', 'financeiro']));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy testes_giga_marcadores on public.testes_giga for update to authenticated
    using (public.tem_algum_papel(array['tecnico'])) with check (public.tem_algum_papel(array['tecnico']));
exception when duplicate_object then null; end $$;

-- o teste gravado não muda: só marcadores e a anulação (uma vez, com motivo)
create or replace function public.trg_testes_giga_imutavel()
returns trigger language plpgsql set search_path = public as $$
declare
  v_livres text[] := array['marcadores', 'anulado_em', 'anulado_por', 'anulado_motivo', 'resultado'];
begin
  if (to_jsonb(new) - v_livres) is distinct from (to_jsonb(old) - v_livres) then
    raise exception 'o teste do giga nº % não pode ser alterado: lance um reteste ou anule o lançamento com o motivo', old.numero;
  end if;
  if old.anulado_em is not null and (new.anulado_em is distinct from old.anulado_em
      or new.anulado_motivo is distinct from old.anulado_motivo or new.anulado_por is distinct from old.anulado_por) then
    raise exception 'o teste do giga nº % já foi anulado', old.numero;
  end if;
  return new;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'testes_giga_imutavel' and tgrelid = 'public.testes_giga'::regclass) then
    create trigger testes_giga_imutavel before update on public.testes_giga for each row execute function public.trg_testes_giga_imutavel();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'zz_auditoria' and tgrelid = 'public.testes_giga'::regclass) then
    create trigger zz_auditoria before insert or update on public.testes_giga for each row execute function public.trg_auditoria();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Lançar um teste (técnico ou administrador)
--   p: { produto_id, numero_serie, testado_em?, unidade_id?, ordem_producao_id?,
--        operador_funcionario_id? | operador_user_id? | operador_nome? (vazio = quem lança),
--        funcional, aterramento, tensao ('aprovado' | 'reprovado'),
--        aterramento_resistencia_ohm?, aterramento_corrente_a?, tensao_aplicada_v?, tensao_tempo_s?, tensao_fuga_ma?,
--        giga?, observacoes? }
--   NS já aprovado: recusa. NS com teste reprovado: vira reteste do último, com a tentativa seguinte.
--   Medida fora do limite marcada como aprovada: exige a explicação nas observações e fica registrada.
--   Máquina reprovada: exige nas observações o que falhou.
-- ---------------------------------------------------------------------
create or replace function public.teste_giga_lancar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_prod produtos;
  v_op ordens_producao;
  v_ant testes_giga;
  v_aprov testes_giga;
  v_ns text;
  v_quando timestamptz;
  v_unid uuid;
  v_func uuid;
  v_user uuid;
  v_nome text;
  v_funcional text;
  v_aterr text;
  v_tensao text;
  v_res numeric;
  v_cor numeric;
  v_vol numeric;
  v_tempo numeric;
  v_fuga numeric;
  v_giga text;
  v_obs text;
  v_par jsonb;
  v_div text[] := '{}';
  v_tent integer;
  v_id uuid;
  v_num bigint;
begin
  if not public.tem_algum_papel(array['tecnico']) then
    raise exception 'só o técnico (produção) ou o administrador lançam o teste do giga';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'dados do teste inválidos'; end if;

  v_ns := upper(regexp_replace(btrim(coalesce(p->>'numero_serie', '')), '\s+', ' ', 'g'));
  v_unid := nullif(p->>'unidade_id', '')::uuid;
  v_func := nullif(p->>'operador_funcionario_id', '')::uuid;
  v_user := nullif(p->>'operador_user_id', '')::uuid;
  v_nome := left(nullif(btrim(coalesce(p->>'operador_nome', '')), ''), 120);
  v_funcional := p->>'funcional';
  v_aterr := p->>'aterramento';
  v_tensao := p->>'tensao';
  v_res := public.teste_giga_num(p->>'aterramento_resistencia_ohm');
  v_cor := public.teste_giga_num(p->>'aterramento_corrente_a');
  v_vol := public.teste_giga_num(p->>'tensao_aplicada_v');
  v_tempo := public.teste_giga_num(p->>'tensao_tempo_s');
  v_fuga := public.teste_giga_num(p->>'tensao_fuga_ma');
  v_giga := left(nullif(btrim(coalesce(p->>'giga', '')), ''), 60);
  v_obs := left(nullif(btrim(coalesce(p->>'observacoes', '')), ''), 1000);

  select * into v_prod from produtos where id = nullif(p->>'produto_id', '')::uuid;
  if v_prod.id is null then raise exception 'escolha a máquina testada'; end if;
  if v_prod.tipo <> 'maquina' then raise exception '"%" não é uma máquina', v_prod.descricao; end if;
  if v_ns = '' then raise exception 'informe o número de série (NS) da máquina'; end if;
  if length(v_ns) > 60 then raise exception 'número de série muito longo (máximo 60 caracteres)'; end if;
  if coalesce(v_funcional, '') not in ('aprovado', 'reprovado') then raise exception 'marque o resultado do teste funcional'; end if;
  if coalesce(v_aterr, '') not in ('aprovado', 'reprovado') then raise exception 'marque o resultado da continuidade do aterramento'; end if;
  if coalesce(v_tensao, '') not in ('aprovado', 'reprovado') then raise exception 'marque o resultado da tensão suportável'; end if;

  v_quando := coalesce(nullif(p->>'testado_em', '')::timestamptz, now());
  if v_quando > now() + interval '10 minutes' then raise exception 'a data do teste não pode estar no futuro'; end if;
  if v_quando < timestamptz '2015-01-01 00:00:00-03' then raise exception 'data do teste inválida'; end if;

  -- OP (opcional): do mesmo modelo
  if nullif(p->>'ordem_producao_id', '') is not null then
    select * into v_op from ordens_producao where id = (p->>'ordem_producao_id')::uuid and excluida_em is null;
    if v_op.id is null then raise exception 'ordem de produção não encontrada'; end if;
    if v_op.produto_id <> v_prod.id then raise exception 'a OP #% é de outro modelo', v_op.numero; end if;
  end if;

  -- operador: funcionário, usuário do ERP, nome escrito ou quem está lançando
  if v_func is not null then
    select f.nome into v_nome from funcionarios f where f.id = v_func and f.ativo;
    if v_nome is null then raise exception 'funcionário não encontrado ou inativo'; end if;
  elsif v_user is not null then
    select u.nome into v_nome from usuarios_erp u where u.user_id = v_user and u.ativo;
    if v_nome is null then raise exception 'usuário não encontrado ou inativo'; end if;
  elsif v_nome is null then
    v_user := auth.uid();
    select u.nome into v_nome from usuarios_erp u where u.user_id = v_user;
  end if;
  if v_nome is null or btrim(v_nome) = '' then raise exception 'informe o operador'; end if;
  v_nome := left(btrim(v_nome), 120);

  v_unid := coalesce(v_unid, v_op.unidade_id, (select u.unidade_id from usuarios_erp u where u.user_id = auth.uid()),
                     (select x.id from unidades x where x.matriz and x.ativo order by x.codigo limit 1));
  if v_unid is not null and not exists (select 1 from unidades where id = v_unid) then raise exception 'unidade não encontrada'; end if;

  -- um lançamento por NS de cada vez
  perform pg_advisory_xact_lock(hashtext('teste_giga:' || v_ns));

  select * into v_aprov from testes_giga g
   where g.numero_serie = v_ns and g.resultado = 'aprovada' and g.anulado_em is null
   order by g.testado_em desc limit 1;
  if v_aprov.id is not null then
    raise exception 'o NS % já tem teste aprovado (nº %, em %). Para testar de novo, anule aquele lançamento com o motivo',
      v_ns, v_aprov.numero, to_char(v_aprov.testado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY');
  end if;

  select * into v_ant from testes_giga g
   where g.numero_serie = v_ns and g.anulado_em is null
   order by g.testado_em desc, g.numero desc limit 1;
  if v_ant.id is not null then
    if v_ant.produto_id <> v_prod.id then
      raise exception 'o NS % já foi testado como outro modelo (%): confira o número', v_ns,
        (select x.descricao from produtos x where x.id = v_ant.produto_id);
    end if;
    if v_quando < v_ant.testado_em then
      raise exception 'o reteste não pode ter data anterior à do teste nº % (%)', v_ant.numero,
        to_char(v_ant.testado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
    end if;
  end if;
  select count(*)::int + 1 into v_tent from testes_giga g where g.numero_serie = v_ns and g.anulado_em is null;

  -- limites em vigor: os do modelo, campo a campo, ou o padrão geral
  select jsonb_build_object(
           'aterramento_resistencia_max_ohm', coalesce(m.aterramento_resistencia_max_ohm, g.aterramento_resistencia_max_ohm),
           'aterramento_corrente_a', coalesce(m.aterramento_corrente_a, g.aterramento_corrente_a),
           'tensao_v', coalesce(m.tensao_v, g.tensao_v),
           'tensao_tempo_s', coalesce(m.tensao_tempo_s, g.tensao_tempo_s),
           'tensao_fuga_max_ma', coalesce(m.tensao_fuga_max_ma, g.tensao_fuga_max_ma),
           'origem', case when m.id is not null then 'modelo' when g.id is not null then 'geral' else 'nenhum' end)
    into v_par
    from (select 1) x
    left join teste_giga_parametros m on m.produto_id = v_prod.id and m.ativo
    left join teste_giga_parametros g on g.produto_id is null and g.ativo;

  if v_aterr = 'aprovado' and v_res is not null and (v_par->>'aterramento_resistencia_max_ohm') is not null
     and v_res > (v_par->>'aterramento_resistencia_max_ohm')::numeric then
    v_div := v_div || format('Continuidade do aterramento aprovada com %s Ω (limite %s Ω)',
      public.teste_giga_txt(v_res), public.teste_giga_txt((v_par->>'aterramento_resistencia_max_ohm')::numeric));
  end if;
  if v_tensao = 'aprovado' and v_fuga is not null and (v_par->>'tensao_fuga_max_ma') is not null
     and v_fuga > (v_par->>'tensao_fuga_max_ma')::numeric then
    v_div := v_div || format('Tensão suportável aprovada com fuga de %s mA (limite %s mA)',
      public.teste_giga_txt(v_fuga), public.teste_giga_txt((v_par->>'tensao_fuga_max_ma')::numeric));
  end if;
  if cardinality(v_div) > 0 and v_obs is null then
    raise exception 'medida fora do limite marcada como aprovada: explique nas observações (%)', array_to_string(v_div, '; ');
  end if;
  if 'reprovado' in (v_funcional, v_aterr, v_tensao) and v_obs is null then
    raise exception 'máquina reprovada: escreva nas observações o que falhou';
  end if;

  perform set_config('erp.acao_usuario', 'on', true);
  insert into testes_giga (testado_em, unidade_id, produto_id, numero_serie, ordem_producao_id, operador_funcionario_id, operador_user_id,
                           operador_nome, funcional, aterramento, aterramento_resistencia_ohm, aterramento_corrente_a, tensao,
                           tensao_aplicada_v, tensao_tempo_s, tensao_fuga_ma, giga, observacoes, reteste_de, tentativa, parametros,
                           divergencias, criado_por, criado_por_nome)
  values (v_quando, v_unid, v_prod.id, v_ns, v_op.id, v_func, v_user,
          v_nome, v_funcional, v_aterr, v_res, v_cor, v_tensao,
          v_vol, v_tempo, v_fuga, v_giga, v_obs, v_ant.id, v_tent, v_par,
          v_div, auth.uid(), (select u.nome from usuarios_erp u where u.user_id = auth.uid()))
  returning id, numero into v_id, v_num;

  return jsonb_build_object(
    'id', v_id, 'numero', v_num, 'numero_serie', v_ns, 'tentativa', v_tent,
    'resultado', case when v_funcional = 'aprovado' and v_aterr = 'aprovado' and v_tensao = 'aprovado' then 'aprovada' else 'reprovada' end,
    'reteste_de_numero', v_ant.numero, 'divergencias', to_jsonb(v_div));
end $$;
revoke execute on function public.teste_giga_lancar(jsonb) from public, anon;
grant execute on function public.teste_giga_lancar(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Anular um lançamento errado (técnico ou administrador, com motivo). Fica no histórico, fora das contas.
-- ---------------------------------------------------------------------
create or replace function public.teste_giga_anular(p_id uuid, p_motivo text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v testes_giga;
  v_motivo text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 500);
begin
  if not public.tem_algum_papel(array['tecnico']) then
    raise exception 'só o técnico (produção) ou o administrador anulam o teste do giga';
  end if;
  if v_motivo is null or length(v_motivo) < 5 then raise exception 'informe o motivo da anulação (mínimo 5 caracteres)'; end if;
  select * into v from testes_giga where id = p_id for update;
  if v.id is null then raise exception 'teste não encontrado'; end if;
  if v.anulado_em is not null then raise exception 'o teste nº % já foi anulado', v.numero; end if;
  if exists (select 1 from testes_giga g where g.reteste_de = v.id and g.anulado_em is null) then
    raise exception 'o teste nº % tem reteste lançado depois: anule o reteste primeiro', v.numero;
  end if;
  perform set_config('erp.acao_usuario', 'on', true);
  update testes_giga set anulado_em = now(), anulado_por = auth.uid(), anulado_motivo = v_motivo where id = v.id;
  return v.numero;
end $$;
revoke execute on function public.teste_giga_anular(uuid, text) from public, anon;
grant execute on function public.teste_giga_anular(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Gravar os limites de um modelo (p_produto) ou o padrão geral (p_produto vazio). Só o administrador.
--   p: { aterramento_resistencia_max_ohm?, aterramento_corrente_a?, tensao_v?, tensao_tempo_s?, tensao_fuga_max_ma?, observacao? }
--   modelo sem nenhum valor deixa de ter limite próprio (volta a valer o padrão geral)
-- ---------------------------------------------------------------------
create or replace function public.teste_giga_salvar_parametros(p_produto uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_res numeric := public.teste_giga_num(p->>'aterramento_resistencia_max_ohm');
  v_cor numeric := public.teste_giga_num(p->>'aterramento_corrente_a');
  v_vol numeric := public.teste_giga_num(p->>'tensao_v');
  v_tempo numeric := public.teste_giga_num(p->>'tensao_tempo_s');
  v_fuga numeric := public.teste_giga_num(p->>'tensao_fuga_max_ma');
  v_obs text := left(nullif(btrim(coalesce(p->>'observacao', '')), ''), 500);
  v_ativo boolean;
begin
  if not public.is_erp_admin() then raise exception 'só o administrador muda os limites do teste do giga'; end if;
  if p_produto is not null and not exists (select 1 from produtos where id = p_produto and tipo = 'maquina') then
    raise exception 'máquina não encontrada';
  end if;
  v_ativo := p_produto is null or coalesce(v_res, v_cor, v_vol, v_tempo, v_fuga) is not null or v_obs is not null;

  perform set_config('erp.acao_usuario', 'on', true);
  select x.id into v_id from teste_giga_parametros x where x.produto_id is not distinct from p_produto for update;
  if v_id is null then
    if not v_ativo then return null; end if;
    insert into teste_giga_parametros (produto_id, aterramento_resistencia_max_ohm, aterramento_corrente_a, tensao_v, tensao_tempo_s,
                                       tensao_fuga_max_ma, observacao)
    values (p_produto, v_res, v_cor, v_vol, v_tempo, v_fuga, v_obs)
    returning id into v_id;
  else
    update teste_giga_parametros
       set aterramento_resistencia_max_ohm = v_res, aterramento_corrente_a = v_cor, tensao_v = v_vol, tensao_tempo_s = v_tempo,
           tensao_fuga_max_ma = v_fuga, observacao = v_obs, ativo = v_ativo, atualizado_por = auth.uid(), atualizado_em = now()
     where id = v_id;
  end if;
  return v_id;
end $$;
revoke execute on function public.teste_giga_salvar_parametros(uuid, jsonb) from public, anon;
grant execute on function public.teste_giga_salvar_parametros(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Quem pode ser o operador: funcionários ativos (RH) e usuários ativos do ERP. Só o nome e o cargo.
-- ---------------------------------------------------------------------
create or replace function public.teste_giga_operadores()
returns table (tipo text, id uuid, nome text, detalhe text)
language sql stable security definer set search_path = public as $$
  select o.tipo, o.id, o.nome, o.detalhe
    from (
      select 'funcionario'::text as tipo, f.id, f.nome,
             nullif(concat_ws(' · ', nullif(btrim(f.cargo), ''), nullif(btrim(f.setor), '')), '') as detalhe
        from funcionarios f
       where f.ativo and coalesce(f.situacao, 'ativo') <> 'desligado'
      union all
      select 'usuario'::text, u.user_id, u.nome, null::text
        from usuarios_erp u
       where u.ativo and coalesce(btrim(u.nome), '') <> ''
    ) o
   where public.tem_algum_papel(array['tecnico', 'financeiro'])
   order by o.nome, o.tipo;
$$;
revoke execute on function public.teste_giga_operadores() from public, anon;
grant execute on function public.teste_giga_operadores() to authenticated;

-- ---------------------------------------------------------------------
-- Situação do teste por NS (ficha da máquina, Ficha 360 e OP): último teste válido e o aprovado, se houver.
-- Técnico, financeiro, vendas e administrador (só o resumo; a lista completa fica com quem lê os testes).
-- ---------------------------------------------------------------------
create or replace function public.teste_giga_situacao(p_ns text[])
returns table (numero_serie text, testes integer, ultimo_numero bigint, ultimo_em timestamptz, ultimo_resultado text,
               ultimo_operador text, ultimo_falhas text[], aprovado_numero bigint, aprovado_em timestamptz, aprovado_operador text)
language sql stable security definer set search_path = public as $$
  with lista as (
    select distinct upper(regexp_replace(btrim(x), '\s+', ' ', 'g')) as ns
      from unnest(coalesce(p_ns, '{}'::text[])) x
     where btrim(coalesce(x, '')) <> ''
     limit 2000
  ), validos as (
    select g.* from testes_giga g join lista l on l.ns = g.numero_serie where g.anulado_em is null
  )
  select l.ns,
         (select count(*)::int from validos v where v.numero_serie = l.ns),
         u.numero, u.testado_em, u.resultado, u.operador_nome,
         array_remove(array[case when u.funcional = 'reprovado' then 'funcional' end,
                            case when u.aterramento = 'reprovado' then 'aterramento' end,
                            case when u.tensao = 'reprovado' then 'tensao' end], null),
         a.numero, a.testado_em, a.operador_nome
    from lista l
    left join lateral (select v.* from validos v where v.numero_serie = l.ns order by v.testado_em desc, v.numero desc limit 1) u on true
    left join lateral (select v.* from validos v where v.numero_serie = l.ns and v.resultado = 'aprovada' order by v.testado_em desc limit 1) a on true
   where public.tem_algum_papel(array['tecnico', 'financeiro', 'vendas']);
$$;
revoke execute on function public.teste_giga_situacao(text[]) from public, anon;
grant execute on function public.teste_giga_situacao(text[]) to authenticated;

-- ---------------------------------------------------------------------
-- Marcadores coloridos também nos testes do giga (o mesmo marcar_registros das outras telas)
-- ---------------------------------------------------------------------
create or replace function public.marcar_registros(p_tabela text, p_ids uuid[], p_adicionar uuid[], p_remover uuid[])
returns int language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if p_tabela not in ('clientes', 'fornecedores', 'produtos', 'transportadoras', 'funcionarios', 'embalagens', 'formas_pagamento',
                      'pedidos', 'ordens_servico', 'pedidos_compra', 'ordens_producao', 'contas_pagar', 'contas_receber', 'propostas_tiny',
                      'testes_giga') then
    raise exception 'esta tela não tem marcadores';
  end if;
  if coalesce(array_length(p_ids, 1), 0) not between 1 and 1000 then raise exception 'escolha de 1 a 1000 registros'; end if;
  perform set_config('erp.acao_usuario', 'on', true);
  execute format('update public.%I set marcadores = array(select distinct x from unnest(marcadores || $1) x where x <> all ($2)) where id = any ($3)', p_tabela)
    using coalesce(p_adicionar, '{}'::uuid[]), coalesce(p_remover, '{}'::uuid[]), p_ids;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.marcar_registros(text, uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.marcar_registros(text, uuid[], uuid[], uuid[]) to authenticated;
