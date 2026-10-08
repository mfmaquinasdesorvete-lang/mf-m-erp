-- =====================================================================
-- Painel do contador
--   * papel "contador": acesso só de leitura aos dados fiscais e financeiros
--     (não conta como usuário comum do ERP: nada de cadastro, venda ou estoque)
--   * fechamento mensal por unidade: pacote com os XML e as planilhas,
--     enviado automaticamente por e-mail; mês fechado fica travado
--   * mensagens entre o contador e o financeiro, por competência
-- =====================================================================

alter table public.usuarios_erp drop constraint if exists usuarios_erp_papel_check;
alter table public.usuarios_erp add constraint usuarios_erp_papel_check
  check (papel in ('admin', 'vendas', 'financeiro', 'tecnico', 'contador'));

-- O contador não é "usuário do ERP" para as regras gerais (cadastros, vendas, estoque, RPCs).
-- Ele ganha leitura só nas tabelas listadas abaixo.
create or replace function public.is_erp_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios_erp where user_id = auth.uid() and ativo and papel <> 'contador');
$$;

create or replace function public.e_contador()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios_erp where user_id = auth.uid() and ativo and papel = 'contador');
$$;
grant execute on function public.e_contador() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['configuracoes', 'unidades', 'notas_fiscais', 'nfe_recebidas', 'nfe_cartas_correcao', 'nfe_inutilizacoes',
                           'contas_receber', 'contas_pagar', 'clientes', 'fornecedores', 'produtos', 'pedidos', 'pedido_itens',
                           'regras_tributacao', 'icms_uf', 'transferencias', 'documentos'] loop
    execute format('drop policy if exists "contador_select" on public.%I', t);
    execute format('create policy "contador_select" on public.%I for select to authenticated using (public.e_contador())', t);
  end loop;
end $$;

-- notificações endereçadas ao contador
create policy "contador_notificacoes" on public.notificacoes for select to authenticated
  using (public.e_contador() and 'contador' = any(papeis));

-- documentos: o contador lê todos e pode anexar guias, balancetes etc. no fechamento ou nos documentos da empresa
alter table public.documentos drop constraint if exists documentos_entidade_check;
alter table public.documentos add constraint documentos_entidade_check
  check (entidade in ('pedido', 'os', 'cliente', 'fornecedor', 'produto', 'conta_receber', 'conta_pagar',
                      'nfe_recebida', 'pedido_compra', 'equipamento', 'geral', 'fechamento'));
create policy "contador_doc_insert" on public.documentos for insert to authenticated
  with check (public.e_contador() and entidade in ('geral', 'fechamento') and created_by = auth.uid());
create policy "contador_doc_ler" on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.e_contador());
create policy "contador_doc_enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and public.e_contador() and split_part(name, '/', 1) in ('geral', 'fechamento'));

-- ---------------------------------------------------------------------
-- Fechamento mensal
-- ---------------------------------------------------------------------
alter table public.configuracoes
  add column contador_nome text,
  add column contador_email text,
  add column contador_envio_auto boolean not null default false,
  add column contador_envio_dia int not null default 5 check (contador_envio_dia between 1 and 28);

create table public.fechamentos (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  competencia text not null check (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status text not null default 'aberto' check (status in ('aberto', 'enviado', 'fechado')),
  enviado_em timestamptz,
  fechado_em timestamptz,
  fechado_por uuid,
  arquivo_caminho text,
  resumo jsonb,
  observacoes text,
  created_at timestamptz not null default now(),
  unique (unidade_id, competencia)
);
alter table public.fechamentos enable row level security;
create policy "fech_select" on public.fechamentos for select to authenticated using (public.tem_papel('financeiro') or public.e_contador());
-- mudanças só pelas funções abaixo e pela função contador-pacote

create or replace function public.fechar_competencia(p_unidade uuid, p_competencia text, p_observacoes text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.e_contador() or public.is_erp_admin()) then raise exception 'só o contador ou o administrador fecha o mês'; end if;
  if p_competencia !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'competência inválida'; end if;
  if p_competencia >= to_char(current_date, 'YYYY-MM') then raise exception 'só dá para fechar meses que já terminaram'; end if;
  insert into fechamentos (unidade_id, competencia, status, fechado_em, fechado_por, observacoes)
  values (p_unidade, p_competencia, 'fechado', now(), auth.uid(), p_observacoes)
  on conflict (unidade_id, competencia) do update set status = 'fechado', fechado_em = now(), fechado_por = auth.uid(),
    observacoes = coalesce(excluded.observacoes, fechamentos.observacoes);
  perform notificar('outro', 'Mês ' || to_char(to_date(p_competencia, 'YYYY-MM'), 'MM/YYYY') || ' fechado pelo contador',
    (select nome from unidades where id = p_unidade), '/contador', '{financeiro}', p_unidade);
end $$;

create or replace function public.reabrir_competencia(p_unidade uuid, p_competencia text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_erp_admin() then raise exception 'só o administrador reabre um mês fechado'; end if;
  update fechamentos set status = case when enviado_em is not null then 'enviado' else 'aberto' end, fechado_em = null, fechado_por = null
   where unidade_id = p_unidade and competencia = p_competencia;
  perform notificar('outro', 'Mês ' || to_char(to_date(p_competencia, 'YYYY-MM'), 'MM/YYYY') || ' reaberto', 'Confira os lançamentos alterados',
    '/contador', '{contador,financeiro}', p_unidade);
end $$;
revoke execute on function public.fechar_competencia(uuid, text, text) from public, anon;
revoke execute on function public.reabrir_competencia(uuid, text) from public, anon;
grant execute on function public.fechar_competencia(uuid, text, text) to authenticated;
grant execute on function public.reabrir_competencia(uuid, text) to authenticated;

-- Mês fechado: pagamentos e recebimentos daquele mês não podem mais ser alterados (só reabrindo)
create or replace function public.trg_mes_fechado()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_unid uuid; v_datas date[];
begin
  if tg_op = 'DELETE' then v_unid := old.unidade_id; v_datas := array[old.data_pagamento];
  elsif tg_op = 'INSERT' then v_unid := new.unidade_id; v_datas := array[new.data_pagamento];
  else v_unid := coalesce(new.unidade_id, old.unidade_id); v_datas := array[old.data_pagamento, new.data_pagamento]; end if;
  if exists (select 1 from fechamentos f where f.status = 'fechado' and f.unidade_id = v_unid
              and f.competencia = any (select to_char(d, 'YYYY-MM') from unnest(v_datas) d where d is not null)) then
    raise exception 'o mês deste pagamento já foi fechado pelo contador: peça ao administrador para reabrir';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_mes_fechado before insert or update or delete on public.contas_receber for each row execute function public.trg_mes_fechado();
create trigger trg_mes_fechado before insert or update or delete on public.contas_pagar for each row execute function public.trg_mes_fechado();

-- ---------------------------------------------------------------------
-- Conversa entre contador e financeiro
-- ---------------------------------------------------------------------
create table public.contador_mensagens (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid references public.unidades(id),
  competencia text not null,
  autor uuid not null default auth.uid(),
  autor_nome text,
  texto text not null check (length(texto) between 1 and 4000),
  resolvida boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.contador_mensagens (competencia);
alter table public.contador_mensagens enable row level security;
create policy "msg_select" on public.contador_mensagens for select to authenticated using (public.tem_papel('financeiro') or public.e_contador());
create policy "msg_insert" on public.contador_mensagens for insert to authenticated
  with check ((public.tem_papel('financeiro') or public.e_contador()) and autor = auth.uid());
create policy "msg_update" on public.contador_mensagens for update to authenticated
  using (public.tem_papel('financeiro') or public.e_contador()) with check (public.tem_papel('financeiro') or public.e_contador());

create or replace function public.trg_msg_contador()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.e_contador() then
    perform notificar('outro', 'Mensagem do contador (' || to_char(to_date(new.competencia, 'YYYY-MM'), 'MM/YYYY') || ')', left(new.texto, 120), '/contador', '{financeiro}', new.unidade_id);
  else
    perform notificar('outro', 'Resposta do financeiro (' || to_char(to_date(new.competencia, 'YYYY-MM'), 'MM/YYYY') || ')', left(new.texto, 120), '/contador', '{contador}', new.unidade_id);
  end if;
  return null;
end $$;
create trigger trg_msg_contador after insert on public.contador_mensagens for each row execute function public.trg_msg_contador();

-- Pacotes do fechamento (ZIP com XML e planilhas): só a função contador-pacote grava e gera links
insert into storage.buckets (id, name, public, file_size_limit)
values ('contador', 'contador', false, 104857600)
on conflict (id) do nothing;

-- Garante a linha do fechamento (para anexar guias e conversar antes de gerar o pacote)
create or replace function public.garantir_fechamento(p_unidade uuid, p_competencia text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not (public.e_contador() or public.tem_papel('financeiro')) then raise exception 'sem permissão'; end if;
  if p_competencia !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'competência inválida'; end if;
  insert into fechamentos (unidade_id, competencia) values (p_unidade, p_competencia)
  on conflict (unidade_id, competencia) do update set unidade_id = excluded.unidade_id
  returning id into v;
  return v;
end $$;
revoke execute on function public.garantir_fechamento(uuid, text) from public, anon;
grant execute on function public.garantir_fechamento(uuid, text) to authenticated;
