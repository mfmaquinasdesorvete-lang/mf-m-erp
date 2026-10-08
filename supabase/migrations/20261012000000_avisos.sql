-- =====================================================================
-- Avisos automáticos
--   * Equipe: robô do Telegram (cada pessoa recebe o que é do papel dela)
--   * Clientes: e-mail (OS recebida/pronta, vencimento, pagamento, NF-e, envio,
--     preventiva e garantia)
-- Os eventos entram na fila public.avisos (por gatilhos e por uma rotina
-- diária); a função avisos-enviar entrega a fila a cada minuto (pg_cron).
-- =====================================================================

alter table public.configuracoes
  add column telegram_bot text,                                   -- @usuário do robô (o token fica em secret)
  add column avisos_email_ativo boolean not null default false,   -- liga/desliga todos os e-mails para clientes
  add column email_responder_para text;                           -- "responder para" dos e-mails (ex.: comercial@...)

alter table public.usuarios_erp
  add column telegram_chat_id bigint,
  add column telegram_vinculo_token text,
  add column telegram_vinculo_expira timestamptz,
  add column avisos jsonb not null default '{}'::jsonb;           -- { "tipo": false } = não quero receber

alter table public.clientes
  add column avisos_email boolean not null default true,
  add column email_token uuid not null default gen_random_uuid(); -- link "não quero mais receber"
create unique index clientes_email_token_key on public.clientes (email_token);

-- ---------------------------------------------------------------------
-- Tipos de aviso (o admin liga/desliga cada um)
-- ---------------------------------------------------------------------
create table public.avisos_tipos (
  tipo text primary key,
  publico text not null check (publico in ('equipe', 'cliente')),
  titulo text not null,
  descricao text not null,
  papeis text[] not null default '{}',   -- equipe: quais papéis recebem (admin sempre recebe)
  ativo boolean not null default true,
  ordem int not null default 0
);

insert into public.avisos_tipos (tipo, publico, titulo, descricao, papeis, ativo, ordem) values
  ('resumo_diario',      'equipe', 'Resumo do dia (8h)',            'Vendas e recebimentos de ontem, contas do dia, OS e o que precisa de atenção', '{vendas,financeiro,tecnico}', true, 1),
  ('pagamento_recebido', 'equipe', 'Pagamento recebido',            'Conta a receber baixada como paga',                           '{vendas,financeiro}', true, 2),
  ('pedido_aprovado',    'equipe', 'Venda aprovada',                'Orçamento virou pedido',                                       '{vendas,financeiro}', true, 3),
  ('nfe_autorizada',     'equipe', 'Nota fiscal autorizada',        'NF-e de venda autorizada pela SEFAZ',                          '{vendas,financeiro}', true, 4),
  ('nfe_erro',           'equipe', 'Nota fiscal rejeitada',         'A SEFAZ recusou a NF-e: precisa corrigir',                     '{vendas,financeiro}', true, 5),
  ('os_nova',            'equipe', 'Nova OS',                       'Máquina entrou na assistência',                                '{tecnico}', true, 6),
  ('os_pronta',          'equipe', 'OS pronta',                     'Conserto concluído: avisar o cliente para retirar',            '{vendas,tecnico}', true, 7),
  ('nfe_fornecedor',     'equipe', 'Nota de fornecedor para conferir', 'Chegou NF-e de compra que precisa de vínculo ou revisão',   '{financeiro}', true, 8),
  ('compra_recebida',    'equipe', 'Peças recebidas',               'Pedido de compra recebido (total ou parcial)',                 '{financeiro,tecnico}', true, 9),
  ('estoque_minimo',     'equipe', 'Estoque no mínimo',             'Um item chegou no estoque mínimo',                             '{financeiro,tecnico}', true, 10),
  ('cli_os_recebida',    'cliente', 'Recebemos sua máquina',        'Confirmação com o número da OS e o defeito informado',         '{}', true, 21),
  ('cli_os_pronta',      'cliente', 'Máquina pronta para retirar',  'Conserto concluído, com o valor (ou "coberto pela garantia")', '{}', true, 22),
  ('cli_cobranca_lembrete','cliente', 'Lembrete de vencimento',     'Três dias antes do vencimento, com os dados para pagamento',   '{}', true, 24),
  ('cli_cobranca_vencida', 'cliente', 'Pagamento em atraso',        'Aviso gentil no dia seguinte ao vencimento',                   '{}', true, 25),
  ('cli_pagamento',      'cliente', 'Pagamento confirmado',         'Agradecimento quando o pagamento é confirmado',                '{}', true, 26),
  ('cli_nfe',            'cliente', 'Nota fiscal emitida',          'Link da DANFE quando a NF-e é autorizada',                     '{}', true, 27),
  ('cli_pedido_enviado', 'cliente', 'Pedido enviado',               'Transportadora e código de rastreio',                          '{}', true, 28),
  ('cli_preventiva',     'cliente', 'Hora da manutenção preventiva','Uma semana antes da data da preventiva',                       '{}', true, 29),
  ('cli_garantia',       'cliente', 'Garantia acabando',            '30 dias antes do fim da garantia da máquina',                  '{}', true, 30);

-- ---------------------------------------------------------------------
-- Fila de envio
-- ---------------------------------------------------------------------
create table public.avisos (
  id bigint generated always as identity primary key,
  tipo text not null references public.avisos_tipos(tipo),
  canal text not null check (canal in ('telegram', 'email')),
  destino text not null,                      -- chat do Telegram ou e-mail
  usuario_id uuid references public.usuarios_erp(user_id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete cascade,
  dados jsonb not null default '{}'::jsonb,   -- conteúdo; o texto é montado na hora do envio
  chave text not null,                        -- evita o mesmo aviso duas vezes
  status text not null default 'pendente' check (status in ('pendente', 'enviando', 'enviado', 'erro')),
  tentativas int not null default 0,
  erro text,
  created_at timestamptz not null default now(),
  enviado_em timestamptz,
  unique (chave, canal, destino)
);
create index avisos_fila_idx on public.avisos (created_at) where status in ('pendente', 'erro', 'enviando');
create index on public.avisos (created_at desc);

-- Equipe: uma linha por pessoa com Telegram conectado e que quer este tipo
create or replace function public.avisar_equipe(p_tipo text, p_chave text, p_dados jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.avisos (tipo, canal, destino, usuario_id, dados, chave)
  select p_tipo, 'telegram', u.telegram_chat_id::text, u.user_id, p_dados, p_chave
    from public.usuarios_erp u
    join public.avisos_tipos t on t.tipo = p_tipo and t.ativo
   where u.ativo and u.telegram_chat_id is not null
     and (u.papel = 'admin' or u.papel = any(t.papeis))
     and coalesce((u.avisos ->> p_tipo)::boolean, true)
  on conflict (chave, canal, destino) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Cliente: só se os e-mails estiverem ligados, o tipo ativo e o cliente tiver e-mail e não tiver saído da lista
create or replace function public.avisar_cliente(p_tipo text, p_cliente uuid, p_chave text, p_dados jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_cliente is null then return false; end if;
  insert into public.avisos (tipo, canal, destino, cliente_id, dados, chave)
  select p_tipo, 'email', lower(trim(c.email)), c.id, p_dados || jsonb_build_object('cliente', c.nome), p_chave
    from public.clientes c
    join public.avisos_tipos t on t.tipo = p_tipo and t.ativo
    join public.configuracoes cfg on cfg.id = 1 and cfg.avisos_email_ativo
   where c.id = p_cliente and c.avisos_email
     and trim(coalesce(c.email, '')) ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'
  on conflict (chave, canal, destino) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ---------------------------------------------------------------------
-- Gatilhos dos eventos
-- ---------------------------------------------------------------------
create or replace function public.trg_aviso_conta_receber()
returns trigger language plpgsql security definer set search_path = public as $$
declare cli text;
begin
  select nome into cli from public.clientes where id = new.cliente_id;
  if new.status = 'pago' and old.status is distinct from 'pago' then
    perform public.avisar_equipe('pagamento_recebido', 'pago:' || new.id || ':' || coalesce(new.data_pagamento::text, ''),
      jsonb_build_object('cliente', cli, 'descricao', new.descricao, 'valor', coalesce(new.valor_pago, new.valor), 'forma', new.forma_pagamento));
    perform public.avisar_cliente('cli_pagamento', new.cliente_id, 'pago:' || new.id,
      jsonb_build_object('descricao', new.descricao, 'valor', coalesce(new.valor_pago, new.valor), 'data', new.data_pagamento));
  end if;
  return null;
end $$;
create trigger trg_aviso_conta_receber after update on public.contas_receber
for each row execute function public.trg_aviso_conta_receber();

create or replace function public.trg_aviso_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
declare cli text; transp text;
begin
  select nome into cli from public.clientes where id = new.cliente_id;
  if new.status = 'aprovado' and old.status = 'orcamento' then
    perform public.avisar_equipe('pedido_aprovado', 'aprovado:' || new.id,
      jsonb_build_object('numero', new.numero, 'cliente', cli, 'valor', new.valor_total, 'vendedor', new.vendedor, 'forma', new.forma_pagamento));
  end if;
  if coalesce(new.codigo_rastreio, '') <> '' and new.codigo_rastreio is distinct from old.codigo_rastreio then
    select nome into transp from public.transportadoras where id = new.transportadora_id;
    perform public.avisar_cliente('cli_pedido_enviado', new.cliente_id, 'enviado:' || new.id || ':' || new.codigo_rastreio,
      jsonb_build_object('numero', new.numero, 'transportadora', transp, 'rastreio', new.codigo_rastreio, 'volumes', new.volumes));
  end if;
  return null;
end $$;
create trigger trg_aviso_pedido after update on public.pedidos
for each row execute function public.trg_aviso_pedido();

create or replace function public.trg_aviso_nota()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  select pe.numero, pe.cliente_id, c.nome as cliente into p
    from public.pedidos pe join public.clientes c on c.id = pe.cliente_id where pe.id = new.pedido_id;
  if new.status = 'autorizada' then
    perform public.avisar_equipe('nfe_autorizada', 'nfe-ok:' || new.id,
      jsonb_build_object('numero', new.numero, 'pedido', p.numero, 'cliente', p.cliente, 'valor', new.valor_total));
    perform public.avisar_cliente('cli_nfe', p.cliente_id, 'nfe:' || new.id,
      jsonb_build_object('numero', new.numero, 'pedido', p.numero, 'valor', new.valor_total, 'danfe_url', new.danfe_url, 'chave', new.chave));
  elsif new.status = 'erro' then
    perform public.avisar_equipe('nfe_erro', 'nfe-erro:' || new.id || ':' || md5(coalesce(new.mensagem, '')),
      jsonb_build_object('pedido', p.numero, 'cliente', p.cliente, 'mensagem', new.mensagem));
  end if;
  return null;
end $$;
create trigger trg_aviso_nota after insert or update on public.notas_fiscais
for each row execute function public.trg_aviso_nota();

create or replace function public.trg_aviso_os()
returns trigger language plpgsql security definer set search_path = public as $$
declare cli text;
begin
  select nome into cli from public.clientes where id = new.cliente_id;
  if tg_op = 'INSERT' then
    perform public.avisar_equipe('os_nova', 'os-nova:' || new.id,
      jsonb_build_object('numero', new.numero, 'cliente', cli, 'equipamento', new.equipamento, 'defeito', new.defeito_relatado, 'garantia', new.em_garantia));
    perform public.avisar_cliente('cli_os_recebida', new.cliente_id, 'os-recebida:' || new.id,
      jsonb_build_object('numero', new.numero, 'equipamento', new.equipamento, 'numero_serie', new.numero_serie,
        'defeito', new.defeito_relatado, 'previsao', new.previsao));
  elsif new.status = 'concluida' and old.status is distinct from 'concluida' then
    perform public.avisar_equipe('os_pronta', 'os-pronta:' || new.id,
      jsonb_build_object('numero', new.numero, 'cliente', cli, 'equipamento', new.equipamento, 'valor', new.valor_total, 'garantia', new.em_garantia));
    perform public.avisar_cliente('cli_os_pronta', new.cliente_id, 'os-pronta:' || new.id,
      jsonb_build_object('numero', new.numero, 'equipamento', new.equipamento, 'solucao', new.solucao,
        'valor', new.valor_total, 'garantia', new.em_garantia));
  end if;
  return null;
end $$;
create trigger trg_aviso_os after insert or update on public.ordens_servico
for each row execute function public.trg_aviso_os();

create or replace function public.trg_aviso_nfe_recebida()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.processamento in ('aguardando_vinculo', 'revisao')
     and (tg_op = 'INSERT' or old.processamento is distinct from new.processamento) then
    perform public.avisar_equipe('nfe_fornecedor', 'nfe-forn:' || new.id || ':' || new.processamento,
      jsonb_build_object('emitente', new.emitente_nome, 'valor', new.valor_total, 'situacao', new.processamento, 'motivo', new.processamento_msg));
  end if;
  return null;
end $$;
create trigger trg_aviso_nfe_recebida after insert or update on public.nfe_recebidas
for each row execute function public.trg_aviso_nfe_recebida();

create or replace function public.trg_aviso_compra()
returns trigger language plpgsql security definer set search_path = public as $$
declare forn text;
begin
  if new.status in ('parcial', 'recebido') and old.status is distinct from new.status then
    select nome into forn from public.fornecedores where id = new.fornecedor_id;
    perform public.avisar_equipe('compra_recebida', 'compra:' || new.id || ':' || new.status,
      jsonb_build_object('numero', new.numero, 'fornecedor', forn, 'status', new.status, 'valor', new.valor_total));
  end if;
  return null;
end $$;
create trigger trg_aviso_compra after update on public.pedidos_compra
for each row execute function public.trg_aviso_compra();

create or replace function public.trg_aviso_estoque()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ativo and new.estoque_minimo > 0
     and new.estoque_atual <= new.estoque_minimo and old.estoque_atual > old.estoque_minimo then
    perform public.avisar_equipe('estoque_minimo', 'estoque:' || new.id || ':' || current_date,
      jsonb_build_object('produto', new.descricao, 'sku', new.sku, 'atual', new.estoque_atual, 'minimo', new.estoque_minimo, 'unidade', new.unidade));
  end if;
  return null;
end $$;
create trigger trg_aviso_estoque after update of estoque_atual on public.produtos
for each row execute function public.trg_aviso_estoque();

-- ---------------------------------------------------------------------
-- Rotina diária (pg_cron às 8h de Brasília): resumo da equipe e e-mails
-- de lembrete para clientes. Pode rodar mais de uma vez no dia sem duplicar.
-- ---------------------------------------------------------------------
create or replace function public.gerar_avisos_diarios()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ontem date := current_date - 1;
  resumo jsonb;
  r record;
  n_cli int := 0;
begin
  select jsonb_build_object(
    'data', current_date,
    'vendas_ontem', (select coalesce(sum(valor_total), 0) from pedidos where status not in ('orcamento', 'cancelado') and created_at::date = ontem),
    'qtd_vendas_ontem', (select count(*) from pedidos where status not in ('orcamento', 'cancelado') and created_at::date = ontem),
    'orcamentos_abertos', (select count(*) from pedidos where status = 'orcamento'),
    'a_entregar', (select count(*) from pedidos where status in ('aprovado', 'faturado')),
    'recebido_ontem', (select coalesce(sum(coalesce(valor_pago, valor)), 0) from contas_receber where status = 'pago' and data_pagamento = ontem),
    'receber_hoje', (select coalesce(sum(valor), 0) from contas_receber where status = 'aberto' and vencimento = current_date),
    'receber_vencido', (select coalesce(sum(valor), 0) from contas_receber where status = 'aberto' and vencimento < current_date),
    'qtd_receber_vencido', (select count(*) from contas_receber where status = 'aberto' and vencimento < current_date),
    'pagar_hoje', (select coalesce(sum(valor), 0) from contas_pagar where status = 'aberto' and vencimento = current_date),
    'pagar_vencido', (select coalesce(sum(valor), 0) from contas_pagar where status = 'aberto' and vencimento < current_date),
    'os_abertas', (select count(*) from ordens_servico where status not in ('concluida', 'entregue', 'cancelada')),
    'os_atrasadas', (select count(*) from ordens_servico where status not in ('concluida', 'entregue', 'cancelada') and previsao < current_date),
    'os_prontas', (select count(*) from ordens_servico where status = 'concluida'),
    'estoque_baixo', (select count(*) from produtos where ativo and estoque_minimo > 0 and estoque_atual <= estoque_minimo),
    'compras_atrasadas', (select count(*) from pedidos_compra where status in ('enviado', 'parcial') and previsao_entrega < current_date),
    'nfe_conferir', (select count(*) from nfe_recebidas where processamento in ('aguardando_vinculo', 'revisao')),
    'preventivas', (select count(*) from equipamentos where proxima_preventiva <= current_date + 15
                      and (preventiva_agendada is null or preventiva_agendada < current_date))
  ) into resumo;
  perform public.avisar_equipe('resumo_diario', 'resumo:' || current_date, resumo);

  -- Contas a receber: 3 dias antes e 1 dia depois do vencimento
  for r in select * from contas_receber where status = 'aberto' and cliente_id is not null
            and vencimento in (current_date + 3, current_date - 1) loop
    if public.avisar_cliente(case when r.vencimento > current_date then 'cli_cobranca_lembrete' else 'cli_cobranca_vencida' end,
         r.cliente_id, (case when r.vencimento > current_date then 'lembrete:' else 'vencido:' end) || r.id || ':' || r.vencimento,
         jsonb_build_object('descricao', r.descricao, 'valor', r.valor, 'vencimento', r.vencimento, 'forma', r.forma_pagamento,
           -- dados de pagamento da unidade que cobra (tabela criada na migração de unidades)
           'pagamento', (select u.instrucoes_pagamento from unidades u where u.id = r.unidade_id))) then
      n_cli := n_cli + 1;
    end if;
  end loop;

  -- Preventiva: uma semana antes (ou já vencida e sem agendamento), uma vez por ciclo
  for r in select e.*, p.descricao as modelo from equipamentos e left join produtos p on p.id = e.produto_id
            where e.proxima_preventiva between current_date - 30 and current_date + 7
              and (e.preventiva_agendada is null or e.preventiva_agendada < current_date) loop
    if public.avisar_cliente('cli_preventiva', r.cliente_id, 'preventiva:' || r.id || ':' || r.proxima_preventiva,
         jsonb_build_object('equipamento', r.descricao, 'numero_serie', r.numero_serie, 'data', r.proxima_preventiva, 'em_garantia', r.garantia_ate >= current_date)) then
      insert into contatos_cliente (cliente_id, equipamento_id, tipo, canal, resultado)
      values (r.cliente_id, r.id, 'preventiva', 'email', 'lembrete automático enviado por e-mail');
      n_cli := n_cli + 1;
    end if;
  end loop;

  -- Garantia: 30 dias antes de acabar
  for r in select * from equipamentos where garantia_ate = current_date + 30 loop
    if public.avisar_cliente('cli_garantia', r.cliente_id, 'garantia:' || r.id || ':' || r.garantia_ate,
         jsonb_build_object('equipamento', r.descricao, 'numero_serie', r.numero_serie, 'garantia_ate', r.garantia_ate)) then
      n_cli := n_cli + 1;
    end if;
  end loop;

  -- Limpeza: histórico de 120 dias
  delete from avisos where created_at < now() - interval '120 days' and status = 'enviado';

  return jsonb_build_object('clientes', n_cli);
end $$;

-- Reserva um lote da fila para envio (várias execuções ao mesmo tempo não pegam o mesmo aviso).
-- Erros tentam de novo em 5, 10, 15... minutos, até 5 tentativas.
create or replace function public.avisos_reservar(p_limite int default 40)
returns setof public.avisos language sql security definer set search_path = public as $$
  update public.avisos a set status = 'enviando', tentativas = a.tentativas + 1
   where a.id in (
     select id from public.avisos
      where (status = 'pendente')
         or (status = 'erro' and tentativas < 5 and created_at < now() - make_interval(mins => 5 * tentativas))
         or (status = 'enviando' and created_at < now() - interval '10 minutes' and tentativas < 5)
      order by id
      limit p_limite
      for update skip locked)
  returning a.*;
$$;

-- ---------------------------------------------------------------------
-- Telegram: cada pessoa conecta a própria conta
-- ---------------------------------------------------------------------
create or replace function public.telegram_gerar_vinculo()
returns text language plpgsql security definer set search_path = public as $$
declare t text := replace(gen_random_uuid()::text, '-', '');
begin
  if not public.is_erp_user() then raise exception 'usuário sem acesso ao ERP'; end if;
  update public.usuarios_erp set telegram_vinculo_token = t, telegram_vinculo_expira = now() + interval '30 minutes'
   where user_id = auth.uid();
  return t;
end $$;

create or replace function public.telegram_desconectar()
returns void language sql security definer set search_path = public as $$
  update public.usuarios_erp set telegram_chat_id = null, telegram_vinculo_token = null where user_id = auth.uid();
$$;

create or replace function public.salvar_meus_avisos(p_avisos jsonb)
returns void language sql security definer set search_path = public as $$
  update public.usuarios_erp set avisos = coalesce(p_avisos, '{}'::jsonb) where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
alter table public.avisos_tipos enable row level security;
create policy "erp_select" on public.avisos_tipos for select to authenticated using (public.is_erp_user());
create policy "erp_update" on public.avisos_tipos for update to authenticated using (public.is_erp_admin()) with check (public.is_erp_admin());

alter table public.avisos enable row level security;
create policy "erp_select" on public.avisos for select to authenticated
  using (public.is_erp_admin() or usuario_id = auth.uid() or (canal = 'email' and public.tem_papel('vendas', 'financeiro')));
-- admin pode mandar reenviar (volta para pendente)
create policy "erp_update" on public.avisos for update to authenticated using (public.is_erp_admin()) with check (public.is_erp_admin());

revoke execute on function public.avisar_equipe(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.avisar_cliente(text, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.gerar_avisos_diarios() from public, anon, authenticated;
revoke execute on function public.avisos_reservar(int) from public, anon, authenticated;
revoke execute on function public.telegram_gerar_vinculo() from public, anon;
revoke execute on function public.telegram_desconectar() from public, anon;
revoke execute on function public.salvar_meus_avisos(jsonb) from public, anon;
grant execute on function public.telegram_gerar_vinculo() to authenticated;
grant execute on function public.telegram_desconectar() to authenticated;
grant execute on function public.salvar_meus_avisos(jsonb) to authenticated;
