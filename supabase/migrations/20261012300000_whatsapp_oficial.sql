-- Régua de cobrança pelo WhatsApp oficial (API da Meta), sem clique manual.
--  * configuracoes guarda o número (Phone number ID), a conta (WABA ID) e se o envio automático está ligado;
--    o token da Meta, o segredo do app e o código do webhook ficam no cofre (Vault), gravados pela função whatsapp;
--  * cada etapa da régua com WhatsApp vira um modelo (template) aprovado pela Meta (wa_*): fora da janela de 24 h
--    a Meta só deixa mandar modelo aprovado;
--  * whatsapp_mensagens: fila de envio, situação (enviado, entregue, lido, erro) e as respostas dos clientes;
--  * a rotina diária e os gatilhos da régua põem na fila; a função whatsapp manda (a cada minuto) e recebe os avisos
--    da Meta. Sem a API ligada, nada muda: a fila manual (um toque no WhatsApp) continua igual.

alter table public.configuracoes add column if not exists whatsapp_api_ativo boolean not null default false;
alter table public.configuracoes add column if not exists whatsapp_numero_id text;
alter table public.configuracoes add column if not exists whatsapp_waba_id text;
alter table public.configuracoes add column if not exists whatsapp_numero text;
alter table public.configuracoes add column if not exists whatsapp_nome text;

alter table public.regua_cobranca add column if not exists wa_modelo text;
alter table public.regua_cobranca add column if not exists wa_status text;
alter table public.regua_cobranca add column if not exists wa_texto text;
alter table public.regua_cobranca add column if not exists wa_variaveis text[];
alter table public.regua_cobranca add column if not exists wa_mensagem_base text;
alter table public.regua_cobranca add column if not exists wa_erro text;

create table if not exists public.whatsapp_mensagens (
  id uuid primary key default gen_random_uuid(),
  direcao text not null default 'saida',
  telefone text not null,
  cliente_id uuid references public.clientes(id) on delete set null,
  conta_receber_id uuid references public.contas_receber(id) on delete set null,
  etapa_id uuid references public.regua_cobranca(id) on delete set null,
  modelo text,
  texto text,
  status text not null default 'pendente',
  wamid text,
  erro text,
  tentativas int not null default 0,
  enviado_por uuid default auth.uid(),
  enviado_em timestamptz,
  atualizado_em timestamptz,
  created_at timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'whatsapp_mensagens_direcao_valida') then
    alter table public.whatsapp_mensagens add constraint whatsapp_mensagens_direcao_valida check (direcao in ('saida', 'entrada'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'whatsapp_mensagens_status_valido') then
    alter table public.whatsapp_mensagens add constraint whatsapp_mensagens_status_valido
      check (status in ('pendente', 'enviando', 'enviado', 'entregue', 'lido', 'erro', 'recebido'));
  end if;
end $$;
create unique index if not exists whatsapp_mensagens_wamid on public.whatsapp_mensagens (wamid) where wamid is not null;
create index if not exists whatsapp_mensagens_pendentes on public.whatsapp_mensagens (created_at) where status = 'pendente';
create index if not exists whatsapp_mensagens_telefone on public.whatsapp_mensagens (telefone, created_at desc);
create index if not exists whatsapp_mensagens_cliente on public.whatsapp_mensagens (cliente_id);

alter table public.whatsapp_mensagens enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'whatsapp_mensagens' and policyname = 'wm_select') then
    create policy wm_select on public.whatsapp_mensagens for select to authenticated using (public.tem_papel('vendas', 'financeiro'));
  end if;
end $$;
-- gravação só pelas funções (fila) e pela função whatsapp (envio, avisos e respostas)
revoke insert, update, delete on public.whatsapp_mensagens from anon, authenticated;

-- Telefone no formato da Meta (55 + DDD + número); null se não der para usar
create or replace function public.telefone_whatsapp(p text)
returns text language sql immutable as $$
  select case
    when d ~ '^55\d{10,11}$' then d
    when d ~ '^\d{10,11}$' then '55' || d
    else null end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;

-- Põe a mensagem da etapa na fila do WhatsApp oficial (uma vez por conta e etapa).
-- Só quando a API está ligada e o modelo da etapa está aprovado e em dia com o texto da régua.
create or replace function public.cobrar_por_whatsapp(p_conta uuid, p_etapa uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare e regua_cobranca; r contas_receber; v_fone text;
begin
  if not coalesce((select whatsapp_api_ativo and whatsapp_numero_id is not null from configuracoes where id = 1), false) then return false; end if;
  select * into e from regua_cobranca where id = p_etapa;
  if e.id is null or not e.ativo or not e.canal_whatsapp or e.wa_status is distinct from 'APPROVED' or e.wa_modelo is null
     or e.wa_mensagem_base is distinct from e.mensagem then return false; end if;
  select * into r from contas_receber where id = p_conta;
  if r.id is null or r.cliente_id is null then return false; end if;
  if exists (select 1 from cobranca_envios where conta_receber_id = p_conta and etapa_id = p_etapa and canal = 'whatsapp') then return false; end if;
  select public.telefone_whatsapp(coalesce(nullif(btrim(whatsapp), ''), telefone)) into v_fone from clientes where id = r.cliente_id;
  if v_fone is null then return false; end if;
  insert into whatsapp_mensagens (direcao, telefone, cliente_id, conta_receber_id, etapa_id, modelo, status, enviado_por)
  values ('saida', v_fone, r.cliente_id, p_conta, p_etapa, e.wa_modelo, 'pendente', null);
  insert into cobranca_envios (conta_receber_id, etapa_id, canal, situacao, enviado_por) values (p_conta, p_etapa, 'whatsapp', 'enviado', null)
  on conflict (conta_receber_id, etapa_id, canal) do nothing;
  return true;
end $$;
revoke execute on function public.cobrar_por_whatsapp(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cobrar_por_whatsapp(uuid, uuid) to service_role;

-- Mensagem enviada pela Meta: registra na ficha do cliente (como o envio manual)
create or replace function public.whatsapp_enviado(p_id uuid, p_wamid text)
returns void language plpgsql security definer set search_path = public as $$
declare m whatsapp_mensagens; v_etapa text; r contas_receber;
begin
  update whatsapp_mensagens set status = 'enviado', wamid = p_wamid, erro = null, enviado_em = now(), atualizado_em = now()
   where id = p_id returning * into m;
  if m.id is null or m.cliente_id is null then return; end if;
  if m.etapa_id is not null then
    select nome into v_etapa from regua_cobranca where id = m.etapa_id;
    select * into r from contas_receber where id = m.conta_receber_id;
    insert into contatos_cliente (cliente_id, tipo, canal, resultado)
    values (m.cliente_id, 'cobranca', 'whatsapp', 'Régua de cobrança pelo WhatsApp oficial (' || coalesce(v_etapa, 'etapa') || ')'
            || coalesce(': ' || r.descricao || ' · ' || public.reais(r.valor), ''));
  end if;
end $$;
revoke execute on function public.whatsapp_enviado(uuid, text) from public, anon, authenticated;
grant execute on function public.whatsapp_enviado(uuid, text) to service_role;

-- Rotina diária: e-mails e WhatsApp das etapas antes/no/depois do vencimento
create or replace function public.gerar_cobrancas_regua()
returns int language plpgsql security definer set search_path = public as $$
declare e record; r record; n int := 0;
begin
  for e in select * from regua_cobranca where ativo and canal_email and evento = 'vencimento' order by ordem loop
    for r in select id from contas_receber where status = 'aberto' and cliente_id is not null and vencimento + e.dias = current_date loop
      if public.cobrar_por_email(r.id, e.id) then n := n + 1; end if;
    end loop;
  end loop;
  for e in select * from regua_cobranca where ativo and canal_whatsapp and evento = 'vencimento' order by ordem loop
    for r in select id from contas_receber where status = 'aberto' and cliente_id is not null and vencimento + e.dias = current_date loop
      if public.cobrar_por_whatsapp(r.id, e.id) then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $$;
revoke execute on function public.gerar_cobrancas_regua() from public, anon, authenticated;

-- Na criação da conta: etapa "na criação" (e-mail e WhatsApp, se ligados)
create or replace function public.trg_regua_criacao()
returns trigger language plpgsql security definer set search_path = public as $$
declare e record;
begin
  if new.status = 'aberto' and new.cliente_id is not null then
    for e in select id, canal_email, canal_whatsapp from regua_cobranca where ativo and evento = 'criacao' loop
      if e.canal_email then perform public.cobrar_por_email(new.id, e.id); end if;
      if e.canal_whatsapp then perform public.cobrar_por_whatsapp(new.id, e.id); end if;
    end loop;
  end if;
  return null;
end $$;

-- No pagamento: o agradecimento segue a etapa "no pagamento" da régua (e-mail e, se ligado, WhatsApp oficial)
create or replace function public.trg_aviso_conta_receber()
returns trigger language plpgsql security definer set search_path = public as $$
declare cli text; e record;
begin
  select nome into cli from public.clientes where id = new.cliente_id;
  if new.status = 'pago' and old.status is distinct from 'pago' then
    perform public.avisar_equipe('pagamento_recebido', 'pago:' || new.id || ':' || coalesce(new.data_pagamento::text, ''),
      jsonb_build_object('cliente', cli, 'descricao', new.descricao, 'valor', coalesce(new.valor_pago, new.valor), 'forma', new.forma_pagamento));
    if not exists (select 1 from public.regua_cobranca where evento = 'pagamento')
       or exists (select 1 from public.regua_cobranca where evento = 'pagamento' and ativo and canal_email) then
      perform public.avisar_cliente('cli_pagamento', new.cliente_id, 'pago:' || new.id,
        jsonb_build_object('descricao', new.descricao, 'valor', coalesce(new.valor_pago, new.valor), 'data', new.data_pagamento));
    end if;
    for e in select id from public.regua_cobranca where evento = 'pagamento' and ativo and canal_whatsapp loop
      perform public.cobrar_por_whatsapp(new.id, e.id);
    end loop;
  end if;
  return null;
end $$;

-- A cada minuto, se houver mensagem na fila, a função whatsapp manda
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'erp-whatsapp-enviar') then
    perform cron.schedule('erp-whatsapp-enviar', '* * * * *', $c$ select public.chamar_funcao('whatsapp', '{"acao":"enviar"}'::jsonb, 60000)
      where exists (select 1 from public.whatsapp_mensagens where status = 'pendente') $c$);
  end if;
end $$;

-- Segredos da Meta no cofre: gravar e ler só pela função whatsapp (service role)
create or replace function public.whatsapp_guardar_segredo(p_nome text, p_valor text)
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid;
begin
  if p_nome not in ('whatsapp_token', 'whatsapp_app_secret', 'whatsapp_verify_token') then raise exception 'segredo inválido'; end if;
  if coalesce(btrim(p_valor), '') = '' then return; end if;
  select id into v_id from vault.secrets where name = p_nome;
  if v_id is null then perform vault.create_secret(btrim(p_valor), p_nome, 'WhatsApp oficial (Meta)');
  else perform vault.update_secret(v_id, btrim(p_valor)); end if;
end $$;
revoke execute on function public.whatsapp_guardar_segredo(text, text) from public, anon, authenticated;
grant execute on function public.whatsapp_guardar_segredo(text, text) to service_role;

create or replace function public.whatsapp_segredos()
returns jsonb language sql stable security definer set search_path = public, vault as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
    from vault.decrypted_secrets where name in ('whatsapp_token', 'whatsapp_app_secret', 'whatsapp_verify_token');
$$;
revoke execute on function public.whatsapp_segredos() from public, anon, authenticated;
grant execute on function public.whatsapp_segredos() to service_role;

-- Resposta do cliente (aviso da Meta): guarda, liga ao cliente pelo telefone e avisa a equipe
create or replace function public.whatsapp_receber(p_telefone text, p_texto text, p_wamid text, p_nome text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_cli uuid; v_nome text; v_id uuid; v_fone text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
begin
  if v_fone = '' then return null; end if;
  if coalesce(p_wamid, '') <> '' and exists (select 1 from whatsapp_mensagens where wamid = p_wamid) then return null; end if;
  -- DDD + 8 últimos dígitos: o WhatsApp às vezes manda o número sem o 9
  select c.id, coalesce(nullif(btrim(c.nome_fantasia), ''), c.nome) into v_cli, v_nome
    from clientes c, lateral (select public.telefone_whatsapp(coalesce(nullif(btrim(c.whatsapp), ''), c.telefone)) as f) x
   where x.f is not null and substr(x.f, 3, 2) = substr(v_fone, 3, 2) and right(x.f, 8) = right(v_fone, 8)
   limit 1;
  insert into whatsapp_mensagens (direcao, telefone, cliente_id, texto, status, wamid, enviado_por)
  values ('entrada', v_fone, v_cli, left(coalesce(p_texto, ''), 4000), 'recebido', nullif(p_wamid, ''), null)
  returning id into v_id;
  perform public.notificar('outro', 'WhatsApp: ' || coalesce(v_nome, nullif(btrim(p_nome), ''), '+' || v_fone) || ' respondeu',
    left(coalesce(p_texto, ''), 140), '/financeiro', '{vendas,financeiro}', null);
  return v_id;
end $$;
revoke execute on function public.whatsapp_receber(text, text, text, text) from public, anon, authenticated;
grant execute on function public.whatsapp_receber(text, text, text, text) to service_role;

-- a função whatsapp monta os parâmetros do modelo com os dados da conta
grant execute on function public.dados_cobranca(uuid, uuid) to service_role;
