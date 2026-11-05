-- FAZ (05/11/2026): decisão da usuária. Os pedidos em "voce" que são só olhar na tela, já no ar e testados, viram
-- "feito" sem a conferência dela. Cada chat mandou a sua lista; vai tudo num update só, para ela aprovar uma vez.
-- Junta o teste no detalhe (não apaga o que estava escrito).
with lista(pref, teste) as (values
  -- ENT
  ('9f211251', 'Testado em 05/11: a rodada diária do auditor rodou sozinha às 07:03 todos os dias de 29/10 a 05/11, sem erro (11 achados).'),
  ('ed9f9143', 'Testado em 05/11: as conferências da fase 1 rodam todo dia na rodada e aparecem em Auditoria → Exceções.'),
  ('533660d3', 'Testado em 31/10 no ar: a Auditoria baixa ~3,5 MB em vez de ~6,8 MB, as mesmas regras e 63 testes ok.'),
  ('f660d5d7', 'Testado em 28/10 no ar: o cartão de cada conta mostra "Aberta em" e o cadastro edita a data.'),
  ('e3e2cb8c', 'Testado em 30/10 na demonstração (celular de 390 px), ficha pelo link: redes com teclado de letras e exemplo "@suaempresa"; CEP inexistente mostra "CEP não encontrado"; Assinar vazio mostra os três erros; "Falar com a MF" no 1º passo; nome vazio fica vermelho com foco; exemplo de CPF/CNPJ conforme o tipo.'),
  ('c5348c1c', 'Testado em 30/10 na demonstração, do começo ao fim: Ficha 360 com 6 abas → Ver como o cliente vê → Meus dados "Falta assinar" → assinar → "Ficha cadastral assinada"; lista com os ícones; no banco, "Cliente desde" corrigido e ficha pendente na página do cliente.'),
  ('96c09995', 'Testado em 24/10 na demonstração: Funcionários é área própria no menu, fora de Gestão, com a Pasta de documentos por pessoa.'),
  ('d6ad60e5', 'Testado em 24/10 na demonstração: área Funcionários no menu com Equipe e Pasta; a pasta de cada pessoa abre com as divisões.'),
  ('f7896949', 'Testado em 24/10 na demonstração: a lista da Equipe abre fechada; buscar ou clicar num cartão abre a lista.'),
  ('c1a8249f', 'Testado em 24/10 na demonstração: os 5 cartões filtram a lista com a contagem certa.'),
  ('9a0ff0ba', 'Testado em 26/10 na demonstração: a aba Crown Móveis filtra pelos cartões e abre os pagamentos antigos e a pasta da pessoa.'),
  ('26bbd786', 'Testado em 29/10 na demonstração (computador e celular): Funcionários → Recibos abre um cartão por pessoa; o cartão mostra só os recibos dela.'),
  ('7ffc42b5', 'Testado em 28/10 na demonstração (celular): peça nova pelos 7 passos curtos, na ordem nova, até o Salvar.'),
  ('3e227456', 'Testado em 28/10 na demonstração (celular): kit novo em 6 passos e componente de fabricação em 4, sem preço nem catálogo.'),
  ('7ead9da6', 'Testado em 28/10 na demonstração: tubo de 6000 mm; peça de 420 mm + 3 mm de corte = 14 por tubo, sobra 81 mm.'),
  ('fc94bf54', 'Testado em 28/10 na demonstração: componente de fabricação sem preço de venda, margem nem sugerido (só custo).'),
  ('e8620e82', 'Testado em 29/10 na demonstração (computador e celular): produto salvo em abas, com o quanto falta e a aba Documentos.'),
  ('b2d52b34', 'Testado em 29/10 na demonstração: aba Peças do kit com preço e custo por peça; no banco, a peça +R$ 10 subiu o custo do kit (teste desfeito).'),
  ('ee946732', 'Testado em 30/10 na demonstração (celular): sem descrição não aparece o Salvar agora; com descrição grava no 1º passo.'),
  ('f4128eb7', 'Testado em 05/11 na demonstração: o Fluxo de pedidos abre sem erro e sem pedidos nem canais do Tiny.'),
  ('6b7069c3', 'Testado em 05/11 na demonstração: Clonar venda no pedido #106 → Salvar orçamento → "Pedido salvo", sem erro.'),
  ('bd5c4168', 'Testado em 05/11 no banco de produção: os 96 avisos dos chats desde 28/10 foram só para a usuária, nenhum para a equipe.'),
  ('8a363b5a', 'Testado em 30/10 na demonstração (quadro, nova oportunidade, perdido pede motivo, métricas, celular) e no banco (desfeito). A parte 2 espera a decisão dela.'),
  ('bf8f7e71', 'Testado em 30/10 na demonstração (Data da venda no pedido) e no banco de produção: com a #628 em 30/07, a semana deixou de contar a venda antiga.'),
  ('1cb1c7c7', 'Testado em 31/10 na demonstração (computador e celular; esconder e mostrar).'),
  ('eb650308', 'Testado em 31/10 na demonstração (computador e celular) e conta conferida no banco: outubro bate com a conta do ENT.'),
  ('4f0bac69', 'Testado em 29/10 com dados reais no ar: os 57 produtos da loja têm anúncio no Mercado Livre, ativos e com estoque mínimo de 1.'),
  ('6ee8f2be', 'Testado em 05/11 na demonstração: aba Simulador (MF-300) mostra lucro, margem, preço mínimo, preço para o lucro desejado, verba de anúncio e o "como foi calculado".')
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

-- SEG: só o detalhe (continua com ela)
update public.pedidos_checklist
   set detalhe = 'Decidido em 27/10: fica privado. Falta cadastrar a chave da Hostinger no GitHub (Settings → Deploy keys, só leitura); depois o SEG troca para privado.'
 where left(id::text, 8) = '1bb8f5db';
