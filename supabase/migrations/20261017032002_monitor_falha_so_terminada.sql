-- Monitor: a rodada que ainda está em andamento (status 'running' no histórico do agendador) era contada como falha —
-- o vigia chegou a avisar que ele mesmo estava falhando. Agora só conta como falha o que terminou com erro ('failed'),
-- na tela (saude_sistema) e no vigia (vigiar_sistema).

/** Saúde do sistema para a tela Monitor: uma leitura do histórico do agendador (7 dias), as filas e o backup. */
create or replace function public.saude_sistema()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_auto jsonb; v_filas jsonb; v_backup jsonb; v_chamadas jsonb;
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

  return jsonb_build_object('agora', now(), 'automacoes', v_auto, 'filas', v_filas, 'backup', v_backup, 'chamadas', v_chamadas,
                            'historico_linhas', (select count(*) from cron.job_run_details));
end $$;
revoke execute on function public.saude_sistema() from public, anon;
grant execute on function public.saude_sistema() to authenticated;

/** Vigia de hora em hora: avisa o administrador do que parou e registra a execução (só quando acha algo novo). */
create or replace function public.vigiar_sistema()
returns int language plpgsql security definer set search_path = public as $$
declare
  achados text[] := '{}'; acoes text[] := '{}'; n int := 0;
  v_ok timestamptz; v_ult record; v_dias int; r record; v_titulo text;
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

