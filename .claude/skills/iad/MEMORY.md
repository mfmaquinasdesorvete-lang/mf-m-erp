# MEMORY — IAD (ERP Line – IA do dia a dia (ideias))
Atualizado em 27/10/2026.

## Estado agora
As cinco frentes de IA nos cadastros e nas vendas estão no ar, e também a fila das ideias da pesquisa (resumo, busca nos
documentos, títulos a pagar, regras da IA analítica, ações com aprovação). Na fila sobrou só o robô do WhatsApp.
Rodada de fechamento (27/10): "feito" só depois do teste com tarefa real. Pelo registro de uso (ia_registros), já foram
usadas de verdade: Anotar por voz, Perguntar à IA e Analisar com IA nos títulos (17 pareceres coerentes em 26/10).
As outras estão no ar e esperando o primeiro uso real.

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
- Rodada de fechamento: no Sobre → Pedidos, as IAs ainda sem uso real voltam para "fazendo" até o teste.

## Esperando a usuária
- Teste com tarefa real (eu não tenho login no ERP nem a chave da IA para testar sozinho):
  1. Clientes → Novo → Preencher com IA (o erro 400 foi corrigido em 26/10; a última tentativa foi antes da correção).
  2. Vendas → novo pedido → Montar com IA, com uma conversa de cliente.
  3. Ficha 360 → Responder no WhatsApp → Escrever com IA.
  4. Produtos → Preencher com IA mandando o PDF do fornecedor (NCM, peso e medidas).
  5. Perguntar à IA → 🛠️ Dúvida de manutenção e ⚡ Pedir uma ação (uma baixa de conta).
  6. Documentos → ✨ Resumir um PDF e "Achar pelo assunto".
  7. Ajuda IA → 📎 mandar a foto de um comprovante.
- Robô do WhatsApp: ligar o número fixo na conta oficial da Meta (WhatsApp Business API) antes de começar.

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
