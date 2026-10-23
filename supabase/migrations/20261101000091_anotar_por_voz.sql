-- =====================================================================
-- Anotar por voz (botão do microfone no ERP, celular e tablet): a pessoa fala ("a cliente tal pagou a vídeo chamada",
-- "a transportadora coletou a máquina do pedido 1520", "giga da série 1234 conferido"), a IA (função ia-voz) entende,
-- a pessoa confirma e fica uma ANOTAÇÃO: quem falou, quando, o que disse e a que registro se refere.
-- A voz só anota: nada muda de situação sozinho. A anotação vira uma OBS no registro (OS, OP, envio, compra) e um
-- aviso "importante" para quem confere (Configurações: voz_responsaveis; sem ninguém, a conta master), que aparece no
-- meio da tela ao entrar. Quem confere marca "Conferido" ou "Não achei". Parada há mais de 2 dias: avisa a
-- retaguarda (conta master). Toda segunda: resumo da semana para o financeiro acompanhar. Somente acréscimos.
-- =====================================================================

set local lock_timeout = '10s';

create table if not exists public.anotacoes_voz (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  criado_por uuid not null default auth.uid(),
  criado_por_nome text,
  fala text not null,
  tipo text not null check (tipo in ('pagamento_video', 'coleta', 'etapa_montagem', 'material_recebido', 'conserto', 'lembrete', 'giga_ok', 'outro')),
  resumo text not null,
  ref_tabela text check (ref_tabela in ('ordens_servico', 'envios', 'ordens_producao', 'pedidos_compra', 'clientes', 'testes_giga')),
  ref_id uuid,
  ref_rotulo text,
  link text,
  valor numeric(14, 2),
  para_user_id uuid,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'conferido', 'nao_achei')),
  conferido_por uuid,
  conferido_por_nome text,
  conferido_em timestamptz,
  resposta text,
  escalada_em timestamptz,
  notificacao_id bigint
);
comment on table public.anotacoes_voz is 'Anotações feitas por voz (botão do microfone): só anotam; quem confere marca Conferido ou Não achei';
create index if not exists anotacoes_voz_pendentes on public.anotacoes_voz (criado_em) where situacao = 'pendente';
create index if not exists anotacoes_voz_ref on public.anotacoes_voz (ref_tabela, ref_id) where ref_id is not null;

alter table public.anotacoes_voz enable row level security;
revoke all on public.anotacoes_voz from anon, authenticated;
grant select on public.anotacoes_voz to authenticated;
do $$ begin
  create policy anotacoes_voz_ler on public.anotacoes_voz for select to authenticated using (public.is_erp_user());
exception when duplicate_object then null; end $$;

-- quem confere as anotações (a Évellem cuida do dia a dia; a conta master fica na retaguarda)
alter table public.configuracoes add column if not exists voz_responsaveis uuid[] not null default '{}';
comment on column public.configuracoes.voz_responsaveis is 'Quem recebe e confere as anotações por voz; vazio = a conta master';
update public.configuracoes c set voz_responsaveis = array[u.user_id]
  from (select user_id from public.usuarios_erp where ativo and nome ilike 'év%llem%' order by created_at limit 1) u
  where c.id = 1 and c.voz_responsaveis = '{}';

create or replace function public.voz_conferem()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(array(select x from unnest((select voz_responsaveis from configuracoes where id = 1)) x
                 where exists (select 1 from usuarios_erp u where u.user_id = x and u.ativo)), '{}'),
    array(select user_id from usuarios_erp where ativo and master));
$$;
revoke all on function public.voz_conferem() from public, anon, authenticated;

create or replace function public.voz_rotulo_tipo(p_tipo text)
returns text language sql immutable as $$
  select case p_tipo
    when 'pagamento_video' then 'Pagamento de vídeo chamada' when 'coleta' then 'Coleta da transportadora'
    when 'etapa_montagem' then 'Etapa da montagem' when 'material_recebido' then 'Material recebido'
    when 'conserto' then 'Máquina para conserto' when 'lembrete' then 'Lembrete' when 'giga_ok' then 'Ok do teste do giga'
    else 'Anotação' end;
$$;

-- Grava a anotação confirmada, põe a OBS no registro e avisa quem confere. Devolve o id da anotação.
create or replace function public.anotar_por_voz(
  p_fala text, p_tipo text, p_resumo text,
  p_ref_tabela text default null, p_ref_id uuid default null, p_ref_rotulo text default null, p_link text default null,
  p_valor numeric default null, p_para uuid default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_eu uuid := auth.uid(); v_nome text; v_id bigint; v_para uuid[]; v_not bigint; v_obs text;
begin
  if not public.is_erp_user() then raise exception 'sem permissão para esta ação'; end if;
  if coalesce(btrim(p_fala), '') = '' or coalesce(btrim(p_resumo), '') = '' then raise exception 'Fale o que quer anotar'; end if;
  if (p_ref_tabela is null) <> (p_ref_id is null) then raise exception 'Registro da anotação incompleto'; end if;
  if p_link is not null and p_link !~ '^/[a-z0-9/_-]*$' then raise exception 'Link inválido'; end if;
  if p_para is not null and not exists (select 1 from usuarios_erp where user_id = p_para and ativo) then
    raise exception 'Pessoa não encontrada';
  end if;
  select nome into v_nome from usuarios_erp where user_id = v_eu;

  insert into anotacoes_voz (criado_por, criado_por_nome, fala, tipo, resumo, ref_tabela, ref_id, ref_rotulo, link, valor, para_user_id)
  values (v_eu, v_nome, left(btrim(p_fala), 2000), p_tipo, left(btrim(p_resumo), 500), p_ref_tabela, p_ref_id,
          left(p_ref_rotulo, 200), p_link, p_valor, p_para)
  returning id into v_id;

  -- a OBS no registro (se o registro não aceitar a alteração, a anotação continua valendo sozinha)
  v_obs := format('[%s · %s, por voz] %s', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), coalesce(v_nome, 'ERP'), btrim(p_resumo));
  begin
    if p_ref_tabela = 'ordens_servico' then
      update ordens_servico set observacoes = concat_ws(E'\n', nullif(observacoes, ''), v_obs) where id = p_ref_id;
    elsif p_ref_tabela = 'ordens_producao' then
      update ordens_producao set observacoes = concat_ws(E'\n', nullif(observacoes, ''), v_obs) where id = p_ref_id;
    elsif p_ref_tabela = 'envios' then
      update envios set observacoes = concat_ws(E'\n', nullif(observacoes, ''), v_obs) where id = p_ref_id;
    elsif p_ref_tabela = 'pedidos_compra' then
      update pedidos_compra set observacoes_internas = concat_ws(E'\n', nullif(observacoes_internas, ''), v_obs) where id = p_ref_id;
    end if;
  exception when others then null;
  end;

  -- lembrete para alguém: vai para essa pessoa; o resto vai para quem confere
  v_para := case when p_para is not null then array[p_para] else public.voz_conferem() end;
  if coalesce(cardinality(v_para), 0) > 0 then
    insert into notificacoes (tipo, titulo, texto, link, papeis, urgencia, destinatarios, remetente_id, remetente_nome, exige_ciencia)
    values ('outro', left('🎤 ' || coalesce(v_nome, 'Alguém') || ' anotou: ' || public.voz_rotulo_tipo(p_tipo), 140),
            left(concat_ws(' · ', btrim(p_resumo), p_ref_rotulo), 2000), '/anotacoes', '{mensagem}', 'importante',
            v_para, v_eu, v_nome, true)
    returning id into v_not;
    update anotacoes_voz set notificacao_id = v_not where id = v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.anotar_por_voz(text, text, text, text, uuid, text, text, numeric, uuid) from public, anon;
grant execute on function public.anotar_por_voz(text, text, text, text, uuid, text, text, numeric, uuid) to authenticated;

-- Conferir: quem confere, a pessoa do lembrete ou um administrador
create or replace function public.conferir_anotacao_voz(p_id bigint, p_situacao text, p_resposta text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a record; v_eu uuid := auth.uid();
begin
  if not public.is_erp_user() then raise exception 'sem permissão para esta ação'; end if;
  if p_situacao not in ('pendente', 'conferido', 'nao_achei') then raise exception 'Situação inválida'; end if;
  select * into a from anotacoes_voz where id = p_id;
  if not found then raise exception 'Anotação não encontrada'; end if;
  if not (public.is_erp_admin() or v_eu = any(public.voz_conferem()) or a.para_user_id = v_eu) then
    raise exception 'Só quem confere as anotações pode marcar';
  end if;
  update anotacoes_voz set situacao = p_situacao,
    conferido_por = case when p_situacao = 'pendente' then null else v_eu end,
    conferido_por_nome = case when p_situacao = 'pendente' then null else (select nome from usuarios_erp where user_id = v_eu) end,
    conferido_em = case when p_situacao = 'pendente' then null else now() end,
    resposta = nullif(btrim(p_resposta), '')
  where id = p_id;
  -- conferiu: o aviso sai do meio da tela de quem confere
  if p_situacao <> 'pendente' and a.notificacao_id is not null then
    insert into notificacoes_ciencia (notificacao_id, user_id) values (a.notificacao_id, v_eu) on conflict do nothing;
  end if;
end $$;
revoke all on function public.conferir_anotacao_voz(bigint, text, text) from public, anon;
grant execute on function public.conferir_anotacao_voz(bigint, text, text) to authenticated;

-- Retaguarda: anotação parada há mais de 2 dias avisa a conta master (uma vez por anotação, um aviso só por rodada)
create or replace function public.voz_escalar()
returns void language plpgsql security definer set search_path = public as $$
declare v_ids bigint[]; v_master uuid[];
begin
  select array_agg(id order by criado_em) into v_ids from anotacoes_voz
   where situacao = 'pendente' and escalada_em is null and criado_em < now() - interval '2 days';
  if v_ids is null then return; end if;
  v_master := array(select user_id from usuarios_erp where ativo and master);
  if cardinality(v_master) > 0 then
    insert into notificacoes (tipo, titulo, texto, link, papeis, urgencia, destinatarios, exige_ciencia)
    values ('outro', '🎤 ' || cardinality(v_ids) || case when cardinality(v_ids) = 1 then ' anotação por voz parada' else ' anotações por voz paradas' end || ' há mais de 2 dias',
            (select string_agg(left(resumo, 80), ' · ' order by criado_em) from (select resumo, criado_em from anotacoes_voz where id = any(v_ids) limit 5) x),
            '/anotacoes', '{mensagem}', 'importante', v_master, true);
  end if;
  update anotacoes_voz set escalada_em = now() where id = any(v_ids);
end $$;
revoke all on function public.voz_escalar() from public, anon, authenticated;

-- Resumo da semana para o financeiro acompanhar (só olhar: não pede conferência)
create or replace function public.voz_resumo_semana()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_fin uuid[];
begin
  select count(*) total, count(*) filter (where situacao = 'conferido') conferidas,
         count(*) filter (where situacao = 'nao_achei') nao_achou,
         count(*) filter (where tipo = 'pagamento_video') pagamentos,
         count(*) filter (where tipo = 'pagamento_video' and situacao = 'conferido') pag_conferidos
    into r from anotacoes_voz where criado_em >= now() - interval '7 days';
  if r.total = 0 then return; end if;
  v_fin := array(select user_id from usuarios_erp where ativo and (papel = 'financeiro' or 'financeiro' = any(papeis_extras)));
  if cardinality(v_fin) = 0 then return; end if;
  insert into notificacoes (tipo, titulo, texto, link, papeis, urgencia, destinatarios)
  values ('outro', '🎤 Resumo da semana: ' || r.total || case when r.total = 1 then ' anotação por voz' else ' anotações por voz' end,
          concat_ws(' · ', r.conferidas || case when r.conferidas = 1 then ' conferida' else ' conferidas' end,
                    nullif(r.nao_achou, 0) || ' não encontradas',
                    case when r.pagamentos > 0 then r.pagamentos || case when r.pagamentos = 1 then ' pagamento anotado (' else ' pagamentos anotados (' end || r.pag_conferidos || ' conferidos com o banco)' end,
                    nullif(r.total - r.conferidas - r.nao_achou, 0) || ' esperando'),
          '/anotacoes', '{mensagem}', 'normal', v_fin);
end $$;
revoke all on function public.voz_resumo_semana() from public, anon, authenticated;

-- dias úteis às 9h (Brasília = 12h UTC): retaguarda; segunda às 8h (11h UTC): resumo da semana
select cron.unschedule('erp-voz-escalar') where exists (select 1 from cron.job where jobname = 'erp-voz-escalar');
select cron.schedule('erp-voz-escalar', '0 12 * * 1-5', $c$ select public.voz_escalar() $c$);
select cron.unschedule('erp-voz-resumo') where exists (select 1 from cron.job where jobname = 'erp-voz-resumo');
select cron.schedule('erp-voz-resumo', '0 11 * * 1', $c$ select public.voz_resumo_semana() $c$);
