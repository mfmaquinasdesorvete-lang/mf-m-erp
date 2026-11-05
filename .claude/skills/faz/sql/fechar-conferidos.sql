-- FAZ (05/11/2026): decisão da usuária. Os pedidos em "voce" que são só olhar na tela, já no ar e testados, viram
-- "feito" sem a conferência dela. Cada chat mandou a sua lista; vai tudo num update só, para ela aprovar uma vez.
-- Junta o teste no detalhe (não apaga o que estava escrito).
with lista(pref, teste) as (values
  -- ENT
  ('9f211251', 'Testado em 05/11: a rodada diária do auditor rodou sozinha às 07:03 todos os dias de 29/10 a 05/11, sem erro (11 achados).'),
  ('ed9f9143', 'Testado em 05/11: as conferências da fase 1 rodam todo dia na rodada e aparecem em Auditoria → Exceções.'),
  ('533660d3', 'Testado em 31/10 no ar: a Auditoria baixa ~3,5 MB em vez de ~6,8 MB, as mesmas regras e 63 testes ok.'),
  ('f660d5d7', 'Testado em 28/10 no ar: o cartão de cada conta mostra "Aberta em" e o cadastro edita a data.')
  -- (mais chats entram aqui quando responderem)
)
update public.pedidos_checklist p
   set situacao = 'feito',
       detalhe = concat_ws(' · ', nullif(p.detalhe, ''), l.teste || ' (fechado sem a conferência dela, decisão de 05/11)')
  from lista l
 where left(p.id::text, 8) = l.pref and p.situacao = 'voce';

-- TRA: só o detalhe (continua com ela)
update public.pedidos_checklist
   set detalhe = 'No ar (Fretes → Tabelas de frete). E-mails pedindo as tabelas enviados em 28/10; esperando as respostas para cadastrar.'
 where left(id::text, 8) = 'c2eaf691';
