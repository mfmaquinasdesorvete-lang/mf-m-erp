-- SSW: rastreio das entregas pela chave da NF-e (functions/ssw), sem senha, para as transportadoras que usam o SSW.
-- O envio guarda o que a transportadora informou; a entrega informada pelo SSW tira o envio dos avisos de atraso
-- e de "chega hoje/amanhã" ao cliente, e a equipe confirma a entrega na tela (o comprovante continua exigido).
alter table public.envios
  add column if not exists rastreio_fonte text,
  add column if not exists rastreio_chave text,
  add column if not exists rastreio_em timestamptz,
  add column if not exists rastreio_situacao text,
  add column if not exists rastreio_eventos jsonb,
  add column if not exists rastreio_entregue_em timestamptz,
  add column if not exists rastreio_recebedor text;
comment on column public.envios.rastreio_fonte is 'De onde veio o rastreio automático (SSW)';
comment on column public.envios.rastreio_chave is 'Chave da NF-e usada no rastreio automático';
comment on column public.envios.rastreio_em is 'Última conferência do rastreio automático';
comment on column public.envios.rastreio_situacao is 'Última ocorrência informada pela transportadora';
comment on column public.envios.rastreio_eventos is 'Ocorrências informadas pela transportadora (mais antiga primeiro)';
comment on column public.envios.rastreio_entregue_em is 'Entrega informada pela transportadora (falta a equipe confirmar)';
comment on column public.envios.rastreio_recebedor is 'Quem recebeu, segundo a transportadora';

-- avisos da manhã: envio que a transportadora já entregou não recebe "atrasado" nem "chegando"
create or replace function public.acompanhar_envios()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  e record;
  v_dados jsonb;
  n_chegando int := 0; n_atrasado int := 0; n_sem_codigo int := 0; n_parado int := 0; n_emails int := 0; n_entregue int := 0;
begin
  for e in
    select en.*, p.numero as pedido_numero, coalesce(t.nome_fantasia, t.nome, en.transportadora_nome) as transp
      from envios en
      left join pedidos p on p.id = en.pedido_id
      left join transportadoras t on t.id = en.transportadora_id
     where en.status in ('coleta', 'transito')
  loop
    v_dados := jsonb_build_object('numero', coalesce(e.pedido_numero, e.numero), 'transportadora', e.transp,
      'rastreio', nullif(btrim(e.codigo_rastreio), ''), 'previsao', e.entrega_prevista,
      'link', case when nullif(btrim(e.codigo_rastreio), '') is not null then public.link_rastreio(e.transportadora_id, btrim(e.codigo_rastreio)) end);

    if e.rastreio_entregue_em is not null then
      n_entregue := n_entregue + 1;
    elsif e.status = 'transito' and nullif(btrim(e.codigo_rastreio), '') is null then
      n_sem_codigo := n_sem_codigo + 1;
    elsif e.entrega_prevista is not null and e.entrega_prevista < v_hoje then
      n_atrasado := n_atrasado + 1;
      -- e-mail só para atraso recente (até 3 dias): envio esquecido há semanas a equipe confere antes
      if e.aviso_atraso_em is null and e.entrega_prevista >= v_hoje - 3 and public.avisar_cliente('cli_entrega_atraso', e.cliente_id, 'atraso:' || e.id,
           v_dados || jsonb_build_object('motivo', nullif(btrim(e.motivo_atraso), ''))) then
        update envios set aviso_atraso_em = now() where id = e.id;
        n_emails := n_emails + 1;
      end if;
    elsif e.entrega_prevista is not null and e.entrega_prevista <= v_hoje + 1 and e.status = 'transito' then
      n_chegando := n_chegando + 1;
      if e.aviso_chegando_em is null and public.avisar_cliente('cli_entrega_chegando', e.cliente_id, 'chegando:' || e.id,
           v_dados || jsonb_build_object('hoje', e.entrega_prevista = v_hoje)) then
        update envios set aviso_chegando_em = now() where id = e.id;
        n_emails := n_emails + 1;
      end if;
    elsif coalesce(e.atualizado_em, e.created_at) < now() - interval '3 days' then
      n_parado := n_parado + 1;
    end if;
  end loop;

  if n_chegando + n_atrasado + n_sem_codigo + n_parado + n_entregue > 0 then
    perform public.notificar('outro', 'Envios de hoje: ' || concat_ws(' · ',
        case when n_entregue > 0 then n_entregue || ' entregue' || case when n_entregue > 1 then 's' else '' end || ' pela transportadora (confirmar)' end,
        case when n_chegando > 0 then n_chegando || ' chegando' end,
        case when n_atrasado > 0 then n_atrasado || ' atrasado' || case when n_atrasado > 1 then 's' else '' end end,
        case when n_sem_codigo > 0 then n_sem_codigo || ' sem código' end,
        case when n_parado > 0 then n_parado || ' parado' || case when n_parado > 1 then 's' else '' end end),
      case when n_emails > 0 then n_emails || ' e-mail(s) já foram para os clientes. ' else '' end
        || 'Confira o rastreio e avise pelo WhatsApp quem ainda não foi avisado.',
      '/fretes?aba=rastreio', '{vendas,expedicao}');
  end if;
  return jsonb_build_object('chegando', n_chegando, 'atrasados', n_atrasado, 'sem_codigo', n_sem_codigo, 'parados', n_parado,
    'emails', n_emails, 'entregues_transportadora', n_entregue);
end $function$;

-- rastreio pelo SSW antes dos avisos da manhã (7h30) e de novo à tarde (horário de Brasília = UTC-3)
select cron.unschedule('erp-ssw-rastreio') where exists (select 1 from cron.job where jobname = 'erp-ssw-rastreio');
select cron.schedule('erp-ssw-rastreio', '5 10,17 * * *',
  $c$ select public.chamar_funcao('ssw', '{"acao":"atualizar"}'::jsonb, 120000) $c$);
