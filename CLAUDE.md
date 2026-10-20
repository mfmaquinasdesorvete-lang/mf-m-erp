# Instruções para o Claude

- Responder sempre em português do Brasil.
- Publicação (site na Hostinger ou funções do Supabase): pedir a autorização com a pergunta de botões
  (AskUserQuestion), primeira opção "Pode publicar" e a outra "Ainda não", com uma linha do que vai ao ar.
  Não pedir para digitar "pode publicar".
- Sempre manter o Sobre em dia: cada pedido da usuária entra no Checklist dos pedidos (Sobre → Pedidos, tabela
  pedidos_checklist) no dia em que foi pedido, e a situação muda (fila → fazendo → feito, ou "precisa de você")
  assim que mudar, com o commit em "versao". As abas Atualizações, Telas alteradas e Código saem do git sozinhas.
- Publicar Supabase (GitHub Actions) sempre pela branch paineis-no-ar; a main é antiga.
