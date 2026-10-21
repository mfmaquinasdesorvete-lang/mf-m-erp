-- Sincronização (pedido de 21/10), primeiro em pedidos e contas:
--  * cada registro tem "versao", que sobe 1 a cada mudança gravada (por qualquer tela ou função);
--  * cada gravação da tela é uma operação com op_id próprio: chegar duas vezes não aplica duas vezes;
--  * a tela manda só os campos que a pessoa mudou, com o valor de antes; o banco junta com o que outra pessoa
--    mudou nos outros campos. No mesmo campo: dado comum fica com a última gravação (e a tela avisa quem perdeu);
--    dado crítico (valor, situação, vencimento, cliente…) não grava e devolve o conflito para a pessoa escolher.
-- A função roda com a permissão de quem chama (RLS e gatilhos de sempre).

alter table public.pedidos add column if not exists versao integer not null default 1;
alter table public.contas_receber add column if not exists versao integer not null default 1;
alter table public.contas_pagar add column if not exists versao integer not null default 1;

create or replace function public.trg_versao_registro() returns trigger language plpgsql set search_path = public as $$
begin
  new.versao := coalesce(old.versao, 0) + 1;
  return new;
end $$;
create or replace trigger aa_versao before update on public.pedidos for each row execute function public.trg_versao_registro();
create or replace trigger aa_versao before update on public.contas_receber for each row execute function public.trg_versao_registro();
create or replace trigger aa_versao before update on public.contas_pagar for each row execute function public.trg_versao_registro();

create table if not exists public.operacoes_aplicadas (
  op_id uuid primary key,
  tabela text not null,
  registro_id uuid not null,
  versao integer,
  resultado jsonb not null,
  autor uuid not null default auth.uid(),
  aplicada_em timestamptz not null default now()
);
create index if not exists operacoes_aplicadas_registro_idx on public.operacoes_aplicadas (tabela, registro_id, aplicada_em desc);
alter table public.operacoes_aplicadas enable row level security;
revoke all on public.operacoes_aplicadas from anon, public;
grant select, insert on public.operacoes_aplicadas to authenticated;
grant all on public.operacoes_aplicadas to service_role;
create policy operacoes_aplicadas_ler on public.operacoes_aplicadas for select to authenticated using (autor = auth.uid());
create policy operacoes_aplicadas_gravar on public.operacoes_aplicadas for insert to authenticated with check (autor = auth.uid());

/** Mesmo valor? Números comparados como número (10.5 = 10.50), o resto pelo texto; null = vazio. */
create or replace function public.valor_igual(a jsonb, b jsonb) returns boolean language sql immutable as $$
  select case
    when coalesce(a, 'null'::jsonb) = 'null'::jsonb or a = '""'::jsonb then coalesce(b, 'null'::jsonb) = 'null'::jsonb or b = '""'::jsonb
    when coalesce(b, 'null'::jsonb) = 'null'::jsonb or b = '""'::jsonb then false
    when jsonb_typeof(a) in ('number', 'string') and jsonb_typeof(b) in ('number', 'string')
         and (a #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$' and (b #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (a #>> '{}')::numeric = (b #>> '{}')::numeric
    when jsonb_typeof(a) = 'string' and jsonb_typeof(b) = 'string' then (a #>> '{}') = (b #>> '{}')
    else a = b
  end
$$;

/** Campos que não se decidem sozinhos quando duas pessoas mudam ao mesmo tempo. */
create or replace function public.campos_criticos(p_tabela text) returns text[] language sql immutable as $$
  select case p_tabela
    when 'pedidos' then array['status', 'cliente_id', 'unidade_id', 'desconto', 'frete', 'parcelas', 'primeiro_vencimento', 'intervalo_dias',
                              'forma_pagamento', 'forma_pagamento_id', 'tabela_preco_id', 'vendedor_id', 'comissao_percentual']
    when 'contas_receber' then array['status', 'valor', 'valor_pago', 'vencimento', 'data_pagamento', 'cliente_id', 'unidade_id', 'forma_pagamento', 'conta_bancaria_id']
    when 'contas_pagar' then array['status', 'valor', 'valor_pago', 'vencimento', 'data_pagamento', 'fornecedor_id', 'unidade_id', 'conta_bancaria_id',
                                   'linha_digitavel', 'chave_pix', 'forma_pagamento_id', 'decisao', 'pagar_em']
    else array[]::text[] end
$$;

/**
 * Aplica uma operação da tela. p_campos = { campo: { "antes": valor visto, "depois": valor novo } }.
 * Devolve { status: aplicada | repetida | conflito | nao_encontrado, versao, conflitos: [{campo, antes, seu, atual}], sobrescritos: [campo] }.
 * "repetida" = o mesmo op_id já foi aplicado: devolve a resposta da primeira vez e não grava de novo.
 */
create or replace function public.aplicar_operacao(p_op_id uuid, p_tabela text, p_registro uuid, p_versao_base integer, p_campos jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_ja jsonb; v_atual jsonb; v_versao int; v_campo text; v_par jsonb; v_db jsonb;
  v_novos jsonb := '{}'::jsonb; v_conflitos jsonb := '[]'::jsonb; v_sobrescritos jsonb := '[]'::jsonb;
  v_criticos text[] := public.campos_criticos(p_tabela); v_sets text; v_res jsonb;
begin
  if p_tabela not in ('pedidos', 'contas_receber', 'contas_pagar') then raise exception 'Tabela sem sincronização: %', p_tabela; end if;
  if p_op_id is null or p_registro is null then raise exception 'Operação sem identificação'; end if;
  if jsonb_typeof(coalesce(p_campos, '{}'::jsonb)) <> 'object' then raise exception 'Campos inválidos'; end if;

  select resultado into v_ja from operacoes_aplicadas where op_id = p_op_id;
  if v_ja is not null then return v_ja || jsonb_build_object('status', 'repetida'); end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1 for update', p_tabela) into v_atual using p_registro;
  if v_atual is null then return jsonb_build_object('status', 'nao_encontrado'); end if;
  v_versao := (v_atual->>'versao')::int;

  for v_campo, v_par in select key, value from jsonb_each(coalesce(p_campos, '{}'::jsonb)) loop
    if v_campo in ('id', 'versao', 'created_at', 'numero', 'created_by', 'criado_por') or not (v_atual ? v_campo) then
      raise exception 'Campo que não se grava por aqui: %', v_campo;
    end if;
    v_db := v_atual -> v_campo;
    if public.valor_igual(v_db, v_par->'depois') then continue; end if;          -- já está como a pessoa quer
    if v_versao = p_versao_base or public.valor_igual(v_db, v_par->'antes') then  -- ninguém mexeu neste campo
      v_novos := v_novos || jsonb_build_object(v_campo, v_par->'depois');
    elsif v_campo = any(v_criticos) then                                          -- crítico: a pessoa escolhe
      v_conflitos := v_conflitos || jsonb_build_object('campo', v_campo, 'antes', v_par->'antes', 'seu', v_par->'depois', 'atual', v_db);
    else                                                                           -- comum: vale a última gravação
      v_novos := v_novos || jsonb_build_object(v_campo, v_par->'depois');
      v_sobrescritos := v_sobrescritos || jsonb_build_object('campo', v_campo, 'antes', v_par->'antes', 'atual', v_db);
    end if;
  end loop;

  if jsonb_array_length(v_conflitos) > 0 then
    -- nada é gravado: a tela mostra os dois valores e manda outra operação com a escolha
    return jsonb_build_object('status', 'conflito', 'versao', v_versao, 'conflitos', v_conflitos);
  end if;

  if v_novos <> '{}'::jsonb then
    select string_agg(format('%I = r.%I', k, k), ', ') into v_sets from jsonb_object_keys(v_novos) k;
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.id = $2 returning t.versao', p_tabela, v_sets, p_tabela)
      into v_versao using v_novos, p_registro;
  end if;

  v_res := jsonb_build_object('status', 'aplicada', 'versao', v_versao, 'conflitos', '[]'::jsonb, 'sobrescritos', v_sobrescritos);
  insert into operacoes_aplicadas (op_id, tabela, registro_id, versao, resultado) values (p_op_id, p_tabela, p_registro, v_versao, v_res);
  return v_res;
end $$;
revoke all on function public.aplicar_operacao(uuid, text, uuid, integer, jsonb) from anon, public;
grant execute on function public.aplicar_operacao(uuid, text, uuid, integer, jsonb) to authenticated;
