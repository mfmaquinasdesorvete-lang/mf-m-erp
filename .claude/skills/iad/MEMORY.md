# MEMORY — IAD (ERP Line – IA do dia a dia (ideias))
Atualizado em 26/10/2026.

## Estado agora
As cinco frentes de IA nos cadastros e nas vendas estão no ar, e também a fila das ideias da pesquisa (resumo, busca nos
documentos, títulos a pagar, regras da IA analítica, ações com aprovação). Na fila sobrou só o robô do WhatsApp.
Nenhuma das IAs novas foi testada com dado real ainda: falta a usuária usar e contar o que achou.

## No ar
- Anotar por voz (🎤 em todas as telas), Anotações, pagamentos anotados na conciliação, ok do giga por voz;
  imagem junto (📎 ou colar): a IA lê o comprovante/nota/foto e a imagem fica anexada no registro escolhido.
- Perguntar à IA: perguntas na hora, dúvida de manutenção ("Virou dica"), ⚡ Pedir uma ação (baixa de conta e mensagem),
  regras: login de quem pergunta, unidade SC/SP, MF × My Frost nas máquinas, sem dado pessoal, até 50 resultados.
- Cadastro de cliente: "Preencher com IA" (conversa do WhatsApp ou foto do cartão, aviso de repetido).
- Orçamento: "Montar com IA" (produtos do catálogo e cliente; preço sempre da tabela do pedido).
- Produto: "Preencher com IA" também com código do fabricante, NCM (nunca marcado) e peso/medidas.
- Responder no WhatsApp: aba "Escrever com IA" (pedidos, contas e OS do cliente).
- Aprovações: "Analisar com IA" (parecer ok/atenção/conferir nas contas a pagar em revisão).
- Documentos: ✨ Resumir com IA (PDF e foto, guardado) e "Achar pelo assunto".
- Controle: Configurações → Inteligência artificial (IA desligada e registro de uso de todas as funções).

## Em andamento
- Nada parado no meio.

## Esperando a usuária
- Testar as IAs novas no dia a dia e dizer o que ajustar.
- Robô do WhatsApp: ligar o número fixo na conta oficial da Meta (WhatsApp Business API) antes de começar.
- Crédito da conta da Anthropic: ela cuida no console; a chave fica só no secret do Supabase.

## Decisões da usuária
- A IA só sugere ou prepara; quem grava é a pessoa, com o Confirmar da tela de sempre.
- Dúvida de manutenção: conhecimento geral + base que cresce com "Virou dica" (técnico ou administrador).
- Cadastro de produto é do PRD; a parte de IA dele é deste chat.
- Publicar só com o botão "Pode publicar", uma linha do que vai ao ar.
- Dados de funcionários e da carteira pessoal nunca vão para a IA.

## Onde está
- Telas: `src/components/PerguntarIA.tsx`, `PedirAcaoIA.tsx`, `DuvidaManutencao.tsx`, `ResumoDocumento.tsx`,
  `BuscaDocumentosIA.tsx`, `clientes/PreencherClienteIA.tsx`, `vendas/MontarOrcamentoIA.tsx`,
  `produtos/AssistenteIA.tsx`, `atendimento/ResponderWhatsApp.tsx`, `voz/AnotarPorVoz.tsx`, `pages/Aprovacoes.tsx`.
- Banco: `anotacoes_voz`, `ia_registros`, `manutencao_dicas`, `ia_pareceres_pagar`, `ia_resumos_documentos`.
- Funções do Supabase: ia-voz, ia-busca, ia-produto, ia-manutencao, ia-cliente, ia-orcamento, ia-texto, ia-titulos,
  ia-resumo, ia-busca-docs, ia-acao (regras em `supabase/functions/_shared/ia-*.ts`, testes em `src/lib/__tests__/ia*.test.ts`).

## Próximos passos
1. Ouvir o retorno da usuária sobre as IAs novas e ajustar.
2. Robô do WhatsApp, quando o número estiver ligado na Meta.
3. Novas ações no ⚡ Pedir uma ação (ex.: marcar coleta, abrir OS), sempre reaproveitando a tela que já tem as regras.
