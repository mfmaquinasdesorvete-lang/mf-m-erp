-- Aviso dos chats do Claude (pedido de 23/10): quando um chat precisa da usuária (autorizar uma publicação, confirmar
-- dados, responder uma pergunta), ele chama aviso_claude com um resumo curto do que ela precisa fazer. O aviso vai só
-- para a conta master, aparece no meio da tela do ERP com som próprio, a voz lê o resumo e o botão abre o chat.
-- O link do chat vem da tabela chats_claude (pelo nome do chat).
create or replace function public.aviso_claude(p_chat text, p_resumo text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_sessao text; v_id bigint; v_para uuid[];
begin
  if coalesce(btrim(p_resumo), '') = '' then raise exception 'Escreva o resumo do que a usuária precisa fazer.'; end if;
  select sessao into v_sessao from public.chats_claude
   where ativo and (lower(nome) = lower(btrim(p_chat)) or lower(nome) like '%' || lower(btrim(p_chat)) || '%')
   order by (lower(nome) = lower(btrim(p_chat))) desc, ordem limit 1;
  select array_agg(user_id) into v_para from public.usuarios_erp where ativo and papel = 'admin' and master;
  if v_para is null then raise exception 'Nenhuma conta master ativa para receber o aviso.'; end if;
  insert into public.notificacoes (tipo, titulo, texto, link, urgencia, destinatarios, remetente_nome, exige_ciencia)
  values ('claude', btrim(p_chat) || ' precisa de você', btrim(p_resumo),
          case when v_sessao is not null then 'https://claude.ai/code/' || v_sessao end,
          'importante', v_para, btrim(p_chat), true)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.aviso_claude(text, text) from public, anon, authenticated;
