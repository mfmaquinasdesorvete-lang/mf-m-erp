# Instruções para o Claude

- Responder sempre em português do Brasil.
- Publicação (site na Hostinger ou funções do Supabase): pedir a autorização com a pergunta de botões
  (AskUserQuestion), primeira opção "Pode publicar" e a outra "Ainda não", com uma linha do que vai ao ar.
  Não pedir para digitar "pode publicar".
- Sempre manter o Sobre em dia: cada pedido da usuária entra no Checklist dos pedidos (Sobre → Pedidos, tabela
  pedidos_checklist) no dia em que foi pedido, e a situação muda (fila → fazendo → feito, ou "precisa de você")
  assim que mudar, com o commit em "versao". As abas Atualizações, Telas alteradas e Código saem do git sozinhas.
- Publicar Supabase (GitHub Actions) sempre pela branch paineis-no-ar; a main é antiga.
- Um chat publica por vez (vários chats trabalham ao mesmo tempo). Depois do "Pode publicar":
  1. Pegar a trava: `select public.publicacao_comecar('<nome do chat>', '<o que vai ao ar>');` (guarda o id).
     Se der "Outro chat está publicando", esperar uns 3 minutos e tentar de novo; não publicar sem a trava.
  2. Site: `scripts/publicar-site.sh` (monta da paineis-no-ar mais nova e junta o site.zip mais novo da branch site);
     depois publicar na Hostinger e conferir o index.html. Funções do Supabase: o GitHub Actions já põe em fila.
  3. Soltar a trava: `select public.publicacao_terminar('<id>');` (também se der erro no meio).
  Antes de enviar commits: `git pull --rebase origin paineis-no-ar`, para não apagar o que outro chat enviou.
- Chats por assunto (cada um cuida só do seu; se o assunto aparecer no chat errado, avisar a usuária para levar
  para o certo):
  - "ERP Line – Fiscal e contábil": impostos, apuração, notas fiscais, configuração da NF/NFS-e/CT-e,
    parcelamentos, contador.
  - "ERP Line – Importações do Tiny": tudo o que vem do Tiny (API, planilhas, backups) e a base antiga da My Frost.
  - "ERP Line – Design system": visual (cores, letras, painéis, filtros, cartões).
  - "ERP Line – Segurança": segurança do site, do banco e do código (permissões, login, senhas, testes de segurança).
  - "ERP Line – IA do dia a dia (ideias)": as ideias da usuária para a IA do trabalho do dia a dia.
  - "ERP Line – continuação (22/10)": todo o resto (vendas, máquinas, cadastros, financeiro, produção, banco).
  - O chat principal (anterior) organiza os outros.
