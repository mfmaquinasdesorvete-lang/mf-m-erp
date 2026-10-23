# Instruções para o Claude

- Responder sempre em português do Brasil.
- Publicação (site na Hostinger ou funções do Supabase): pedir a autorização com a pergunta de botões
  (AskUserQuestion), primeira opção "Pode publicar" e a outra "Ainda não", com uma linha do que vai ao ar.
  Não pedir para digitar "pode publicar".
- Sempre manter o Sobre em dia: cada pedido da usuária entra no Checklist dos pedidos (Sobre → Pedidos, tabela
  pedidos_checklist) no dia em que foi pedido, e a situação muda (fila → fazendo → feito, ou "precisa de você")
  assim que mudar, com o commit em "versao". As abas Atualizações, Telas alteradas e Código saem do git sozinhas.
- Publicar Supabase (GitHub Actions) sempre pela branch paineis-no-ar; a main é antiga.
- Quando precisar da usuária (autorizar publicação, confirmar dados, responder pergunta, situação "precisa de você"),
  avisar no ERP antes de perguntar: `select public.aviso_claude('<nome do chat>', '<resumo curto do que ela precisa
  fazer, em 1 ou 2 frases simples>');`. Aparece no meio da tela com som e a voz lê o resumo; o botão abre o chat.
  E mandar também a notificação no celular dela (ferramenta PushNotification, carregar com ToolSearch), começando
  pelo nome do chat: "<chat>: <o que ela precisa fazer>" (até 200 letras, sem valores nem dados pessoais).
- Um chat publica por vez (vários chats trabalham ao mesmo tempo). Depois do "Pode publicar":
  1. Pegar a trava: `select public.publicacao_comecar('<nome do chat>', '<o que vai ao ar>');` (guarda o id).
     Se der "Outro chat está publicando", esperar uns 3 minutos e tentar de novo; não publicar sem a trava.
  2. Site: `scripts/publicar-site.sh` (monta da paineis-no-ar mais nova e junta o site.zip mais novo da branch site);
     depois publicar na Hostinger e conferir o index.html. Funções do Supabase: o GitHub Actions já põe em fila.
  3. Soltar a trava: `select public.publicacao_terminar('<id>');` (também se der erro no meio).
  Antes de enviar commits: `git pull --rebase origin paineis-no-ar`, para não apagar o que outro chat enviou.
- Marcadores são da usuária e não se perdem: importação (Tiny ou outra), unificação de cadastros e correções
  automáticas só somam marcadores, nunca tiram; os marcadores que vierem do Tiny (ex.: Em garantia, Fora de garantia,
  Não cobrado) entram com o mesmo nome.
- Chats por assunto (cada um cuida só do seu; se o assunto aparecer no chat errado, avisar a usuária para levar
  para o certo):
  - "ERP Line – Fiscal e contábil": impostos, apuração, notas fiscais, configuração da NF/NFS-e/CT-e,
    parcelamentos, contador.
  - "ERP Line – Importações do Tiny": tudo o que vem do Tiny (API, planilhas, backups) e a base antiga da My Frost.
  - "ERP Line – Design system": visual (cores, letras, painéis, filtros, cartões).
  - "ERP Line – Segurança": segurança do site, do banco e do código (permissões, login, senhas, testes de segurança).
  - "ERP Line – Minha carteira (pessoal)": a carteira pessoal da usuária (Retaguarda → Pessoal), comprovantes,
    gastos pessoais e o encontro de contas com as empresas. Dados pessoais não saem desse chat.
  - "ERP Line – Entradas nas contas da MF": de onde veio cada entrada nos bancos da MF (vendas, clientes,
    licenciados, cartão, Olist, InfinitePay, Inter, Mercado Pago) e a ligação com pedido, nota ou conta a receber.
  - "ERP Line – IA do dia a dia (ideias)": as ideias da usuária para a IA do trabalho do dia a dia.
  - "ERP Line – continuação (22/10)": todo o resto (vendas, máquinas, cadastros, financeiro, produção, banco).
  - "ERP Line – Conferência dos pedidos": confere se o que foi pedido a cada chat deu certo e está no ar, cobra os
    chats parados e mostra o painel. Quando ele cobrar, responder a ele com send_message (o que deu certo, o que falta).
  - O chat principal (anterior) organiza os outros.
  - Ao abrir um chat novo, acrescentar a linha dele na tabela chats_claude (nome, o que faz, exemplos, sessao =
    "session_…", cor), que aparece em Sobre → Chats; chat encerrado fica com ativo = false.
