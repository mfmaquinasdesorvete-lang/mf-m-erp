-- Vencimento de chaves e certificados (Sobre → Monitor → Chaves e certificados): o certificado digital de cada unidade,
-- a chave do Supabase usada pelo GitHub (o backup parou quando a dela venceu), chaves de bancos e domínios. Guarda só o
-- NOME, ONDE está e a DATA — nunca a chave em si. O certificado do Banco Inter entra sozinho (inter_conexoes).
-- O vigia avisa o administrador no prazo escolhido (padrão 15 dias), com 7, 3 e 1 dia, no dia e toda semana depois de
-- vencido; 3 dias ou menos: urgente e com ciência. saude_sistema passa a trazer a lista. Só o administrador vê e muda.

create table if not exists public.vencimentos_chaves (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(nome) between 2 and 120),
  tipo text not null default 'chave' check (tipo in ('certificado', 'chave', 'senha', 'dominio', 'outro')),
  onde text check (onde is null or length(onde) <= 200),
  vence_em date not null,
  avisar_dias int not null default 15 check (avisar_dias between 1 and 120),
  como_renovar text check (como_renovar is null or length(como_renovar) <= 1000),
  situacao text not null default 'ativa' check (situacao in ('ativa', 'substituida', 'desativada')),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.vencimentos_chaves enable row level security;
revoke all on public.vencimentos_chaves from anon, public;
grant select, insert, update on public.vencimentos_chaves to authenticated;
create policy vencimentos_chaves_ler on public.vencimentos_chaves for select to authenticated using (public.is_erp_admin());
create policy vencimentos_chaves_criar on public.vencimentos_chaves for insert to authenticated with check (public.is_erp_admin());
create policy vencimentos_chaves_mudar on public.vencimentos_chaves for update to authenticated using (public.is_erp_admin()) with check (public.is_erp_admin());
create trigger vencimentos_chaves_atualizado before update on public.vencimentos_chaves for each row execute function public.ecl_execucoes_atualizado();
create trigger zz_auditoria before insert or update on public.vencimentos_chaves for each row execute function public.trg_auditoria();

/** Tudo o que vence: o cadastrado à mão (ativo) e o certificado do Banco Inter de cada conexão ligada. */
create or replace function public.vencimentos_ativos()
returns table (id uuid, origem text, nome text, tipo text, onde text, vence_em date, avisar_dias int, como_renovar text)
language sql stable security definer set search_path = public as $$
  select v.id, 'cadastro', v.nome, v.tipo, v.onde, v.vence_em, v.avisar_dias, v.como_renovar
    from vencimentos_chaves v where v.situacao = 'ativa'
  union all
  select c.id, 'inter', 'Certificado do Banco Inter' || coalesce(' · conta ' || c.conta_corrente, ''), 'certificado', 'Bancos e conciliação → Banco Inter',
         (c.certificado_validade at time zone 'America/Sao_Paulo')::date, 30, 'Gere outro certificado no app do Inter e use "Trocar credenciais".'
    from inter_conexoes c
   where c.certificado_validade is not null and c.status <> 'desligada'
$$;
revoke execute on function public.vencimentos_ativos() from public, anon, authenticated;

/** Saúde do sistema para a tela Monitor: uma leitura do histórico do agendador (7 dias), as filas e o backup. */
create or replace function public.saude_sistema()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_auto jsonb; v_filas jsonb; v_backup jsonb; v_chamadas jsonb; v_venc jsonb;
begin
  if not public.is_erp_admin() then raise exception 'Só o administrador vê a saúde do sistema'; end if;

  with r as materialized (
    select jobid, runid, status, start_time, end_time, return_message
      from cron.job_run_details where start_time > now() - interval '7 days'
  ), a as (
    select jobid,
           count(*) filter (where start_time > now() - interval '24 hours') as rodadas_24h,
           count(*) filter (where start_time > now() - interval '24 hours' and status = 'failed') as falhas_24h,
           count(*) filter (where status = 'failed') as falhas_7d,
           max(runid) as ultima_id,
           max(runid) filter (where status = 'failed') as erro_id
      from r group by jobid
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'nome', j.jobname, 'agenda', j.schedule, 'ativo', j.active,
           'ultima', u.start_time, 'ultima_situacao', u.status,
           'ultima_seg', round(extract(epoch from (u.end_time - u.start_time))::numeric, 2),
           'rodadas_24h', coalesce(a.rodadas_24h, 0), 'falhas_24h', coalesce(a.falhas_24h, 0), 'falhas_7d', coalesce(a.falhas_7d, 0),
           'ultimo_erro', left(e.return_message, 300), 'ultimo_erro_em', e.start_time) order by j.jobname), '[]'::jsonb)
    into v_auto
    from cron.job j
    left join a on a.jobid = j.jobid
    left join r u on u.runid = a.ultima_id
    left join r e on e.runid = a.erro_id
   where j.jobname like 'erp-%';

  v_filas := jsonb_build_array(
    (select jsonb_build_object('chave', 'nfe_erro', 'qtd', count(*), 'desde', min(created_at)) from notas_fiscais where status = 'erro'),
    (select jsonb_build_object('chave', 'nfe_vinculo', 'qtd', count(*), 'desde', min(created_at)) from nfe_recebidas where processamento = 'aguardando_vinculo'),
    (select jsonb_build_object('chave', 'extrato', 'qtd', count(*) filter (where status = 'pendente'), 'total', count(*), 'desde', min(created_at) filter (where status = 'pendente')) from extrato_lancamentos),
    (select jsonb_build_object('chave', 'avisos', 'qtd', count(*), 'desde', min(created_at)) from avisos where status = 'erro'),
    (select jsonb_build_object('chave', 'whatsapp', 'qtd', count(*) filter (where status in ('pendente', 'erro')), 'desde', min(created_at) filter (where status in ('pendente', 'erro'))) from whatsapp_mensagens),
    (select jsonb_build_object('chave', 'mercadolivre', 'qtd', count(*), 'desde', min(pedido_em)) from ml_sync_fila where tentativas > 0),
    (select jsonb_build_object('chave', 'sugestoes', 'qtd', count(*), 'desde', min(criado_em)) from produto_sugestoes where situacao = 'pendente')
  );

  select jsonb_build_object(
           'ultimo_ok', (select max(created_at) from backups_registro where status = 'ok'),
           'ultimo', (select jsonb_build_object('em', created_at, 'status', status, 'detalhe', left(detalhe, 300), 'hostinger_em', hostinger_em)
                        from backups_registro order by created_at desc limit 1),
           'falhas_seguidas', (select count(*) from backups_registro b
                                where b.status <> 'ok' and b.created_at > coalesce((select max(created_at) from backups_registro where status = 'ok'), '-infinity')))
    into v_backup;

  -- as automações chamam as funções pela internet (pg_net): o agendador marca "sucesso" ao chamar; a resposta fica 6 h aqui
  select jsonb_build_object(
           'ok', count(*) filter (where status_code between 200 and 299),
           'erro', count(*) filter (where status_code is null or status_code not between 200 and 299),
           'tempo_esgotado', count(*) filter (where timed_out),
           'desde', min(created),
           'ultimo_erro', (select left(coalesce(x.error_msg, x.status_code::text || ' ' || x.content), 200) from net._http_response x
                            where x.status_code is null or x.status_code not between 200 and 299 order by x.created desc limit 1))
    into v_chamadas from net._http_response;

  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'origem', x.origem, 'nome', x.nome, 'tipo', x.tipo, 'onde', x.onde, 'vence_em', x.vence_em,
           'avisar_dias', x.avisar_dias, 'como_renovar', x.como_renovar, 'dias', x.vence_em - current_date) order by x.vence_em), '[]'::jsonb)
    into v_venc from vencimentos_ativos() x;

  return jsonb_build_object('agora', now(), 'automacoes', v_auto, 'filas', v_filas, 'backup', v_backup, 'chamadas', v_chamadas, 'vencimentos', v_venc,
                            'historico_linhas', (select count(*) from cron.job_run_details));
end $$;
revoke execute on function public.saude_sistema() from public, anon;
grant execute on function public.saude_sistema() to authenticated;

/** Vigia de hora em hora: avisa o administrador do que parou e registra a execução (só quando acha algo novo). */
create or replace function public.vigiar_sistema()
returns int language plpgsql security definer set search_path = public as $$
declare
  achados text[] := '{}'; acoes text[] := '{}'; n int := 0;
  v_ok timestamptz; v_ult record; v_dias int; r record; v_titulo text; d int;
begin
  -- 1) backup: sem cópia guardada há mais de 30 horas
  select max(created_at) into v_ok from backups_registro where status = 'ok';
  select created_at, status, detalhe into v_ult from backups_registro order by created_at desc limit 1;
  if v_ok is null or v_ok < now() - interval '30 hours' then
    v_dias := case when v_ok is null then null else extract(day from now() - v_ok)::int end;
    v_titulo := case when v_ok is null then 'Backup: nenhuma cópia guardada até hoje' else 'Backup: ' || v_dias || ' dias sem cópia guardada' end;
    if not exists (select 1 from notificacoes where titulo = v_titulo and created_at > now() - interval '20 hours') then
      insert into notificacoes (tipo, titulo, texto, link, papeis, urgencia, exige_ciencia)
      values ('outro', v_titulo,
        case when v_ult.created_at is null or v_ult.created_at < now() - interval '30 hours'
             then 'O backup de hoje nem avisou o ERP: no GitHub, confira se a chave de acesso ao Supabase (SUPABASE_ACCESS_TOKEN) ainda vale.'
             else coalesce(left(v_ult.detalhe, 240), 'O último backup falhou.') || ' Abra o link, veja o passo que falhou e corrija.' end
          || ' Veja Sobre → Monitor.',
        '/sobre?aba=monitor', '{admin}', 'urgente', true);
      n := n + 1;
      achados := array_append(achados, v_titulo);
      acoes := array_append(acoes, ('Backup: corrigir os secrets do GitHub (BACKUP_CHAVE e SUPABASE_ACCESS_TOKEN) e rodar o "Backup diário" de novo')::text);
    end if;
  end if;

  -- 2) automações agendadas com falha nas últimas 2 horas
  for r in
    select j.jobname, count(*) as falhas, left(max(d.return_message), 160) as msg
      from cron.job j join cron.job_run_details d on d.jobid = j.jobid
     where j.jobname like 'erp-%' and d.start_time > now() - interval '2 hours' and d.status = 'failed'
     group by j.jobname
  loop
    v_titulo := 'Automação falhando: ' || r.jobname;
    if not exists (select 1 from notificacoes where titulo = v_titulo and created_at > now() - interval '20 hours') then
      insert into notificacoes (tipo, titulo, texto, link, papeis, urgencia, exige_ciencia)
      values ('outro', v_titulo, r.falhas || ' falha(s) nas últimas 2 horas: ' || coalesce(r.msg, 'sem mensagem'), '/sobre?aba=monitor', '{admin}', 'importante', false);
      n := n + 1;
      achados := array_append(achados, (v_titulo || ' (' || r.falhas || 'x)')::text);
      acoes := array_append(acoes, ('Ver o erro de ' || r.jobname || ' em Sobre → Monitor')::text);
    end if;
  end loop;

  -- 3) funções do ERP respondendo com erro (a chamada saiu, mas a função falhou)
  select count(*) as qtd, left(max(coalesce(error_msg, status_code::text)), 160) as msg into r
    from net._http_response where created > now() - interval '2 hours' and (status_code is null or status_code not between 200 and 299);
  if r.qtd >= 3 then
    v_titulo := 'Funções do ERP respondendo com erro';
    if not exists (select 1 from notificacoes where titulo = v_titulo and created_at > now() - interval '20 hours') then
      insert into notificacoes (tipo, titulo, texto, link, papeis, urgencia, exige_ciencia)
      values ('outro', v_titulo, r.qtd || ' chamada(s) com erro nas últimas 2 horas: ' || coalesce(r.msg, 'sem mensagem'), '/sobre?aba=monitor', '{admin}', 'importante', false);
      n := n + 1;
      achados := array_append(achados, (r.qtd || ' chamadas às funções com erro em 2 horas')::text);
      acoes := array_append(acoes, ('Ver em Sobre → Monitor qual integração parou (banco, NF-e, e-mail, Mercado Livre)')::text);
    end if;
  end if;

  -- 4) NF-e com erro há mais de 1 dia (rejeitada e esquecida)
  select count(*) as qtd into r from notas_fiscais where status = 'erro' and created_at < now() - interval '24 hours';
  if r.qtd > 0 then
    v_titulo := 'NF-e com erro esperando correção';
    if not exists (select 1 from notificacoes where titulo = v_titulo and created_at > now() - interval '20 hours') then
      insert into notificacoes (tipo, titulo, texto, link, papeis, urgencia, exige_ciencia)
      values ('outro', v_titulo, r.qtd || ' nota(s) rejeitada(s) há mais de 1 dia: corrigir e emitir de novo, ou cancelar o rascunho.', '/notas', '{admin}', 'importante', false);
      n := n + 1;
      achados := array_append(achados, (r.qtd || ' NF-e com erro há mais de 1 dia')::text);
      acoes := array_append(acoes, ('Notas fiscais: abrir as notas com erro e corrigir')::text);
    end if;
  end if;

  -- 5) chaves e certificados: no prazo escolhido, com 7, 3 e 1 dia, no dia e toda semana depois de vencido
  for r in select * from vencimentos_ativos() loop
    d := r.vence_em - current_date;
    if d = r.avisar_dias or d in (7, 3, 1, 0) or (d < 0 and ((-d) = 1 or (-d) % 7 = 0)) then
      v_titulo := case when d > 0 then 'Vence em ' || d || ' ' || case when d = 1 then 'dia' else 'dias' end || ': ' || r.nome
                       when d = 0 then 'Vence hoje: ' || r.nome
                       else 'Venceu há ' || (-d) || ' ' || case when d = -1 then 'dia' else 'dias' end || ': ' || r.nome end;
      if not exists (select 1 from notificacoes where titulo = v_titulo and created_at > now() - interval '20 hours') then
        insert into notificacoes (tipo, titulo, texto, link, papeis, urgencia, exige_ciencia)
        values ('outro', v_titulo,
          concat_ws(' · ', to_char(r.vence_em, 'DD/MM/YYYY'), r.onde, r.como_renovar),
          '/sobre?aba=monitor', '{admin}', case when d <= 3 then 'urgente' else 'importante' end, d <= 3);
        n := n + 1;
        achados := array_append(achados, v_titulo);
        acoes := array_append(acoes, ('Renovar ' || r.nome || ' e marcar como renovada em Sobre → Monitor')::text);
      end if;
    end if;
  end loop;

  if n > 0 then
    insert into ecl_execucoes (comando, alvo, entrada, diagnostico, decisao, entrega, validacao, proxima_acao, origem, situacao)
    values ('MONITOR', 'automacoes', 'Vigia automático (de hora em hora)',
      array_to_string(achados, E'\n'),
      'Avisar o administrador no sino do ERP: backup como urgente e com ciência; o resto como importante.',
      n || ' aviso(s) novo(s) no sino do ERP',
      'A próxima rodada (daqui a 1 hora) confere de novo; o mesmo aviso não se repete por 20 horas.',
      array_to_string(acoes, E'\n'), 'monitor', 'em_andamento');
  end if;
  return n;
end $$;
revoke execute on function public.vigiar_sistema() from public, anon, authenticated;

