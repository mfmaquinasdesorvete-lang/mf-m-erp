-- =====================================================================
-- Cobrança: régua configurável (na criação, antes/no/depois do vencimento, no pagamento) por e-mail e
-- WhatsApp, Pix copia e cola por unidade e a página do cliente (contas em aberto e segunda via).
-- Só comandos aditivos: políticas criadas se não existirem, create or replace.
-- =====================================================================

create table if not exists public.regua_cobranca (
  id uuid primary key default gen_random_uuid(),
  evento text not null check (evento in ('criacao', 'vencimento', 'pagamento')),
  dias int not null default 0 check (dias between -30 and 90),   -- vencimento: -3 = 3 dias antes, 0 = no dia, 5 = 5 dias depois
  nome text not null,
  canal_email boolean not null default true,
  canal_whatsapp boolean not null default false,
  assunto text not null,
  mensagem text not null check (length(mensagem) between 10 and 2000),
  ativo boolean not null default true,
  ordem int not null default 100,
  created_at timestamptz not null default now()
);
create unique index if not exists regua_cobranca_evento_dias on public.regua_cobranca (evento, dias);
alter table public.regua_cobranca enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'regua_cobranca' and policyname = 'rc_select') then
    create policy "rc_select" on public.regua_cobranca for select to authenticated using (public.is_erp_user());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'regua_cobranca' and policyname = 'rc_insert') then
    create policy "rc_insert" on public.regua_cobranca for insert to authenticated with check (public.tem_papel('financeiro'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'regua_cobranca' and policyname = 'rc_update') then
    create policy "rc_update" on public.regua_cobranca for update to authenticated using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));
  end if;
end $$;
create or replace trigger zz_auditoria before insert or update or delete on public.regua_cobranca for each row execute function public.trg_auditoria();

insert into public.regua_cobranca (evento, dias, nome, canal_email, canal_whatsapp, ativo, ordem, assunto, mensagem) values
  ('criacao', 0, 'Na criação da cobrança', false, false, false, 1, 'Cobrança: {descricao}',
   E'Olá, {cliente}! Segue a cobrança de *{descricao}*, no valor de *{valor}*, com vencimento em *{vencimento}*.\n\n{pagamento}\n\nSuas contas e a segunda via: {link}'),
  ('vencimento', -3, '3 dias antes', true, false, true, 2, 'Lembrete: pagamento vence em {vencimento}',
   E'Olá, {cliente}! Passando para lembrar que *{descricao}* ({valor}) vence em *{vencimento}*. Se já pagou, pode desconsiderar.\n\n{pagamento}\n\nSuas contas e a segunda via: {link}'),
  ('vencimento', 0, 'No vencimento', false, true, true, 3, 'Vence hoje: {descricao}',
   E'Olá, {cliente}! Hoje vence *{descricao}*, no valor de *{valor}*.\n\n{pagamento}\n\nSe já pagou, pode desconsiderar. Qualquer dúvida, é só responder aqui.'),
  ('vencimento', 5, '5 dias depois', true, true, true, 4, 'Pagamento em aberto desde {vencimento}',
   E'Olá, {cliente}! Não identificamos o pagamento de *{descricao}* ({valor}), que venceu em {vencimento}. Se já pagou, desconsidere. Se precisar de outra data, é só responder.\n\n{pagamento}\n\nSuas contas e a segunda via: {link}'),
  ('pagamento', 0, 'No pagamento', true, false, true, 5, 'Pagamento recebido · obrigado!',
   E'Olá, {cliente}! Recebemos o pagamento de *{descricao}* ({valor}). Muito obrigado pela confiança!')
on conflict do nothing;

-- O que já foi enviado (ou pulado) de cada etapa para cada conta: a fila do WhatsApp não repete
create table if not exists public.cobranca_envios (
  id uuid primary key default gen_random_uuid(),
  conta_receber_id uuid not null references public.contas_receber(id) on delete cascade,
  etapa_id uuid not null references public.regua_cobranca(id) on delete cascade,
  canal text not null check (canal in ('email', 'whatsapp')),
  situacao text not null default 'enviado' check (situacao in ('enviado', 'pulado')),
  enviado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (conta_receber_id, etapa_id, canal)
);
alter table public.cobranca_envios enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cobranca_envios' and policyname = 'ce_select') then
    create policy "ce_select" on public.cobranca_envios for select to authenticated using (public.tem_papel('vendas', 'financeiro'));
  end if;
end $$;

-- Pix por unidade (cada CNPJ recebe na própria chave), página do cliente e endereço do site
alter table public.unidades add column if not exists pix_chave text;
alter table public.unidades add column if not exists pix_nome text;
alter table public.unidades add column if not exists pix_cidade text;
alter table public.clientes add column if not exists portal_token uuid not null default gen_random_uuid();
create unique index if not exists clientes_portal_token on public.clientes (portal_token);
alter table public.configuracoes add column if not exists site_url text;
update public.configuracoes set site_url = 'https://erp.myfrost.ai' where id = 1 and site_url is null;

-- E-mails da régua usam um tipo só; os lembretes fixos antigos (3 dias antes / 1 dia depois) saem de cena
insert into public.avisos_tipos (tipo, publico, titulo, descricao, papeis, ativo, ordem)
values ('cli_cobranca', 'cliente', 'Régua de cobrança', 'Mensagens da régua de cobrança por e-mail (Financeiro → Cobrança)', '{}', true, 23)
on conflict do nothing;
update public.avisos_tipos set ativo = false, descricao = 'Substituído pela régua de cobrança (Financeiro → Cobrança)'
 where tipo in ('cli_cobranca_lembrete', 'cli_cobranca_vencida') and descricao not like 'Substituído%';

-- Conteúdo de uma mensagem da régua para a conta (o texto final é montado no envio)
create or replace function public.dados_cobranca(p_conta uuid, p_etapa uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'etapa', e.nome, 'assunto', e.assunto, 'mensagem', e.mensagem, 'conta_id', r.id,
    'descricao', r.descricao, 'valor', coalesce(case when r.status = 'pago' then r.valor_pago end, r.valor), 'vencimento', r.vencimento,
    'dias_atraso', greatest(current_date - r.vencimento, 0), 'forma', r.forma_pagamento,
    'pagamento', u.instrucoes_pagamento,
    'pix', case when nullif(btrim(u.pix_chave), '') is null or r.status <> 'aberto' then null
                else jsonb_build_object('chave', u.pix_chave, 'nome', coalesce(nullif(btrim(u.pix_nome), ''), u.razao_social, u.nome),
                                        'cidade', coalesce(nullif(btrim(u.pix_cidade), ''), u.municipio)) end,
    'link', case when cfg.site_url is not null then rtrim(cfg.site_url, '/') || '/cliente/' || c.portal_token end)
  from contas_receber r
  join regua_cobranca e on e.id = p_etapa
  left join clientes c on c.id = r.cliente_id
  left join unidades u on u.id = r.unidade_id
  left join configuracoes cfg on cfg.id = 1
  where r.id = p_conta
$$;
revoke execute on function public.dados_cobranca(uuid, uuid) from public, anon, authenticated;

-- E-mail de uma etapa para uma conta (uma vez só): fila de avisos + registro do envio
create or replace function public.cobrar_por_email(p_conta uuid, p_etapa uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_cli uuid; v_ok boolean;
begin
  select cliente_id into v_cli from contas_receber where id = p_conta;
  if v_cli is null or exists (select 1 from cobranca_envios where conta_receber_id = p_conta and etapa_id = p_etapa and canal = 'email') then return false; end if;
  v_ok := public.avisar_cliente('cli_cobranca', v_cli, 'regua:' || p_etapa || ':' || p_conta, public.dados_cobranca(p_conta, p_etapa));
  if v_ok then
    insert into cobranca_envios (conta_receber_id, etapa_id, canal, enviado_por) values (p_conta, p_etapa, 'email', null) on conflict do nothing;
  end if;
  return v_ok;
end $$;
revoke execute on function public.cobrar_por_email(uuid, uuid) from public, anon, authenticated;

-- Rotina diária: e-mails das etapas antes/no/depois do vencimento
create or replace function public.gerar_cobrancas_regua()
returns int language plpgsql security definer set search_path = public as $$
declare e record; r record; n int := 0;
begin
  for e in select * from regua_cobranca where ativo and canal_email and evento = 'vencimento' order by ordem loop
    for r in select id from contas_receber where status = 'aberto' and cliente_id is not null and vencimento + e.dias = current_date loop
      if public.cobrar_por_email(r.id, e.id) then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $$;
revoke execute on function public.gerar_cobrancas_regua() from public, anon, authenticated;

-- Na criação da conta: e-mail da etapa "na criação" (se ligada)
create or replace function public.trg_regua_criacao()
returns trigger language plpgsql security definer set search_path = public as $$
declare e record;
begin
  if new.status = 'aberto' and new.cliente_id is not null then
    for e in select id from regua_cobranca where ativo and canal_email and evento = 'criacao' loop
      perform public.cobrar_por_email(new.id, e.id);
    end loop;
  end if;
  return null;
end $$;
create or replace trigger trg_regua_criacao after insert on public.contas_receber for each row execute function public.trg_regua_criacao();

-- No pagamento: o agradecimento por e-mail segue a etapa "no pagamento" da régua
create or replace function public.trg_aviso_conta_receber()
returns trigger language plpgsql security definer set search_path = public as $$
declare cli text;
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
  end if;
  return null;
end $$;

-- WhatsApp: quem mandou registra (ou pula); vira atendimento na ficha do cliente
create or replace function public.registrar_cobranca(p_conta uuid, p_etapa uuid, p_canal text default 'whatsapp', p_situacao text default 'enviado')
returns void language plpgsql security definer set search_path = public as $$
declare r contas_receber; v_etapa text;
begin
  perform public.exigir_papel('vendas', 'financeiro');
  select * into r from contas_receber where id = p_conta;
  select nome into v_etapa from regua_cobranca where id = p_etapa;
  if r.id is null or v_etapa is null then raise exception 'conta ou etapa da régua não encontrada'; end if;
  insert into cobranca_envios (conta_receber_id, etapa_id, canal, situacao) values (p_conta, p_etapa, p_canal, p_situacao)
  on conflict (conta_receber_id, etapa_id, canal) do nothing;
  if p_situacao = 'enviado' and r.cliente_id is not null then
    insert into contatos_cliente (cliente_id, tipo, canal, resultado)
    values (r.cliente_id, 'cobranca', p_canal, 'Régua de cobrança (' || v_etapa || '): ' || r.descricao || ' · ' || public.reais(r.valor));
  end if;
end $$;
revoke execute on function public.registrar_cobranca(uuid, uuid, text, text) from public, anon;
grant execute on function public.registrar_cobranca(uuid, uuid, text, text) to authenticated;

-- Página do cliente (link sem login, pelo token do cliente): contas em aberto com Pix e as últimas pagas
create or replace function public.area_cliente(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c clientes;
begin
  select * into c from clientes where portal_token = p_token;
  if c.id is null then return null; end if;
  return jsonb_build_object(
    'cliente', coalesce(nullif(btrim(c.nome_fantasia), ''), c.nome),
    'empresa', (select jsonb_build_object('nome', coalesce(nullif(btrim(nome_fantasia), ''), razao_social), 'whatsapp', whatsapp, 'telefone', telefone, 'email', email)
                  from configuracoes where id = 1),
    'abertas', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'descricao', r.descricao, 'valor', r.valor, 'vencimento', r.vencimento, 'forma', r.forma_pagamento,
               'pagamento', u.instrucoes_pagamento, 'pix_chave', nullif(btrim(u.pix_chave), ''),
               'pix_nome', coalesce(nullif(btrim(u.pix_nome), ''), u.razao_social, u.nome), 'pix_cidade', coalesce(nullif(btrim(u.pix_cidade), ''), u.municipio))
             order by r.vencimento)
        from contas_receber r left join unidades u on u.id = r.unidade_id
       where r.cliente_id = c.id and r.status = 'aberto'), '[]'::jsonb),
    'pagas', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('descricao', descricao, 'valor', coalesce(valor_pago, valor), 'data_pagamento', data_pagamento) x
          from contas_receber where cliente_id = c.id and status = 'pago' order by data_pagamento desc nulls last limit 10) t), '[]'::jsonb));
end $$;
revoke execute on function public.area_cliente(uuid) from public;
grant execute on function public.area_cliente(uuid) to anon, authenticated;
