-- =====================================================================
-- Acompanhamento de envio, todas as manhãs (7h30)
--   * confere os envios na estrada: chegando (hoje ou amanhã), atrasado
--     (passou da previsão), sem código de rastreio e parado (3 dias sem
--     nenhuma atualização)
--   * cliente com e-mail recebe sozinho "Seu pedido chega hoje/amanhã" e,
--     no atraso, o aviso proativo com a explicação (o motivo escrito pela
--     equipe ou uma explicação padrão)
--   * a equipe (vendas, expedição) recebe a notificação com o resumo e,
--     na tela Rastreio, a mensagem pronta para o WhatsApp de cada cliente
-- Cada aviso sai uma vez por envio (aviso_chegando_em / aviso_atraso_em).
-- =====================================================================
alter table public.envios
  add column if not exists aviso_chegando_em timestamptz,
  add column if not exists aviso_atraso_em timestamptz,
  add column if not exists motivo_atraso text;
comment on column public.envios.aviso_chegando_em is 'Quando o cliente foi avisado de que a entrega está chegando (e-mail automático ou WhatsApp)';
comment on column public.envios.aviso_atraso_em is 'Quando o cliente foi avisado do atraso (e-mail automático ou WhatsApp)';
comment on column public.envios.motivo_atraso is 'Explicação do atraso para o cliente (vai no e-mail e no WhatsApp)';

insert into public.avisos_tipos (tipo, publico, titulo, descricao, papeis, ativo, ordem) values
  ('cli_entrega_chegando', 'cliente', 'Entrega chegando', 'Na manhã da véspera ou do dia da entrega prevista', '{}', true, 40),
  ('cli_entrega_atraso', 'cliente', 'Entrega atrasada', 'Aviso proativo quando passa da previsão, com a explicação', '{}', true, 41)
on conflict (tipo) do nothing;

create or replace function public.acompanhar_envios()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  e record;
  v_dados jsonb;
  n_chegando int := 0; n_atrasado int := 0; n_sem_codigo int := 0; n_parado int := 0; n_emails int := 0;
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

    if e.status = 'transito' and nullif(btrim(e.codigo_rastreio), '') is null then
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

  if n_chegando + n_atrasado + n_sem_codigo + n_parado > 0 then
    perform public.notificar('outro', 'Envios de hoje: ' || concat_ws(' · ',
        case when n_chegando > 0 then n_chegando || ' chegando' end,
        case when n_atrasado > 0 then n_atrasado || ' atrasado' || case when n_atrasado > 1 then 's' else '' end end,
        case when n_sem_codigo > 0 then n_sem_codigo || ' sem código' end,
        case when n_parado > 0 then n_parado || ' parado' || case when n_parado > 1 then 's' else '' end end),
      case when n_emails > 0 then n_emails || ' e-mail(s) já foram para os clientes. ' else '' end
        || 'Confira o rastreio e avise pelo WhatsApp quem ainda não foi avisado.',
      '/fretes?aba=rastreio', '{vendas,expedicao}');
  end if;
  return jsonb_build_object('chegando', n_chegando, 'atrasados', n_atrasado, 'sem_codigo', n_sem_codigo, 'parados', n_parado, 'emails', n_emails);
end $$;
revoke execute on function public.acompanhar_envios() from public, anon, authenticated;

-- todas as manhãs às 7h30 (horário de Brasília = 10h30 UTC)
select cron.unschedule('erp-envios-manha') where exists (select 1 from cron.job where jobname = 'erp-envios-manha');
select cron.schedule('erp-envios-manha', '30 10 * * *', 'select public.acompanhar_envios()');
