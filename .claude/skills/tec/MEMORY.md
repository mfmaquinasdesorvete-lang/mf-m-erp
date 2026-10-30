# MEMORY — TEC (ERP Line – Técnicos)
Atualizado em 30/10/2026.

## Estado agora
Cadastros → Técnicos virou um guia de cartões enxutos, com foto, estado, Instagram e WhatsApp.
Os parceiros Dr. Frost têm a foto do anúncio. Não há pedido de técnicos em aberto.

## No ar
- Guia de técnicos: cartões em colunas, botão Guia/Lista, parceiros Dr. Frost primeiro, filtros
  "Atende o estado" e "Cidade da base" (dde055c).
- Cartão enxuto: foto (ou iniciais), nome, sigla do estado, ícone do WhatsApp sem o número e quantos clientes
  ele já atendeu, contados por `clientes.tecnico_id`. O resto aparece ao abrir o técnico (25304a8).
- Foto do anúncio Dr. Frost gravada em `tecnicos.logo_url` nos 108 parceiros; o cartão aproxima no círculo do
  banner. Ícone do Instagram com link (f1d6fb1); ícones de Instagram e WhatsApp menores, 32 px, a pedido dela.
- Visão simplificada do técnico (fd6fd92, no ar no site 63df953): papel "tecnico" só com Ordens de serviço filtradas
  nas dele e o app com "Minhas OS" e "Meu cadastro"; o teste do giga ficou com o papel "giga".
- Linha do chat em `chats_claude` (ordem 34, cor laranja).

## Em andamento
- Banco (RLS) da visão do técnico: com o SEG (o técnico ler só as OS dele, sem preços, compras e clientes de fora).

## Esperando a usuária
- Nada para conferir: em 29/10 ela testou no ar e confirmou os ícones menores, o "desde" e as siglas no modo Lista
  e a visão do técnico.
- Decidir se faz os achados do DSG no formulário do técnico (auditoria de 30/10, itens B1–B3): aviso de técnico
  repetido ao cadastrar; formulário em blocos fechados (Contato, Região, Site Dr. Frost); "Logo" repetido e UF em
  lista. Pela rodada de fechamento, só com o ok dela.
- Para saber: 1 dos 2 usuários técnicos não tem cadastro em Técnicos com o mesmo nome (o "Meu cadastro" dele mostra
  o aviso); quem for fazer o teste do giga precisa do papel "Giga".

## Decisões da usuária
- O cartão mostra só o necessário: nome, estado, WhatsApp (só o ícone), Instagram (só o ícone) e quantos clientes
  já atendeu; descrição, máquinas, e-mail e anúncio ficam ao abrir.
- A foto do parceiro vem do anúncio no site Dr. Frost.
- O técnico da equipe (login) vê só as OS dele e o próprio cadastro; os parceiros continuam sem login (27/10).
- Mensagem para técnico (WhatsApp, e-mail) só com o ok dela; mudança em lote (unificar, inativar, mudar região) só
  depois de mostrar e confirmar.

## Onde está
- Telas: `src/pages/Tecnicos.tsx`; cartões no PC pela opção `cartoesNoPc` de `src/components/CrudPage.tsx`.
- Regras: `src/lib/tecnicos.ts` (`linkInstagram`, `ehBannerDrFrost`), com teste.
- Banco: `tecnicos` (incluindo `drfrost_id`, que é o número do anúncio), `clientes.tecnico_id`,
  `ordens_servico.tecnico_id`.
- Site Dr. Frost: WordPress com o tema Listeo, lido pela API `/wp-json/wp/v2/listing` usando `net.http_get` no banco.

## Próximos passos
1. Levantamento (só leitura): técnicos sem cidade ou região, repetidos, que nunca atenderam, e regiões sem técnico.
2. Contar os atendimentos também pelas OS (`ordens_servico.tecnico_id`), se ela quiser, além do vínculo na ficha.
3. Assuntos herdados, quando ela pedir: app do técnico (#88), técnicos da região no painel das máquinas (#144),
   cadastro no grupo Cadastros e a parte de técnicos do Lote 3 (#154).
