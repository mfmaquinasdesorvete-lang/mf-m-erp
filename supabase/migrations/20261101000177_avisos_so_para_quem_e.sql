-- Avisos só para quem é (pedido da usuária, 27/10): os avisos dos chats do Claude ("… precisa de você") apareciam no
-- painel de Notificações de toda a equipe, porque eram gravados sem papel (papeis = '{}') e a regra deixava qualquer
-- usuário ler o que não tem papel. Agora:
--  * aviso com destinatários escolhidos só aparece para eles (e para quem mandou, pela regra notificacoes_destinatario);
--  * os avisos de Segurança só aparecem para a conta master.
alter policy erp_select on public.notificacoes using (
  (select public.is_erp_user())
  and coalesce(cardinality(destinatarios), 0) = 0
  and (titulo not like 'Segurança:%' or (select public.is_erp_master()))
  and ((select public.is_erp_admin()) or papeis = '{}'::text[] or (select public.tem_papel(variadic notificacoes.papeis)))
);
