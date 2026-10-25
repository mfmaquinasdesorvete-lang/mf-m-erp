# MEMORY — TEC (ERP Line – Técnicos)
Atualizado em 25/10/2026.

## Estado agora
Cadastros → Técnicos virou um guia de cartões enxutos, com foto, estado, Instagram e WhatsApp.
Os parceiros Dr. Frost têm a foto do anúncio. Não há pedido de técnicos em aberto.

## No ar
- Guia de técnicos: cartões em colunas, botão Guia/Lista, parceiros Dr. Frost primeiro, filtros
  "Atende o estado" e "Cidade da base" (dde055c).
- Cartão enxuto: foto (ou iniciais), nome, sigla do estado, ícone do WhatsApp sem o número e quantos clientes
  ele já atendeu, contados por `clientes.tecnico_id`. O resto aparece ao abrir o técnico (25304a8).
- Foto do anúncio Dr. Frost gravada em `tecnicos.logo_url` nos 108 parceiros; o cartão aproxima no círculo do
  banner. Ícone do Instagram com link (f1d6fb1).
- Linha do chat em `chats_claude` (ordem 34, cor laranja).

## Em andamento
- Nada.

## Esperando a usuária
- Confirmar se o zoom da foto do anúncio deixa o rosto ou o logo centralizado no círculo.

## Decisões da usuária
- O cartão mostra só o necessário: nome, estado, WhatsApp (só o ícone), Instagram (só o ícone) e quantos clientes
  já atendeu; descrição, máquinas, e-mail e anúncio ficam ao abrir.
- A foto do parceiro vem do anúncio no site Dr. Frost.
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
