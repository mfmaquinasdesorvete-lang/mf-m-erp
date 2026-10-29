# O que só você faz — lista do FAZ
Atualizada em 28/10/2026. Em ordem: o que trava mais coisa vem primeiro.
Nunca mande senha, chave ou token no chat: cole direto no lugar indicado. Eu confiro sozinho quando ficar feito.

Conferido no banco e no GitHub em 27/10: as funções do Supabase estão todas no ar e iguais ao código, as Actions
(CI, Publicar Supabase e Backup diário) estão verdes e não há site que ficou só montado. O que falta é isto:

---

## 0. Escolher como os chats gravam no banco (SEG, 29/10) — 1 minuto
**O que é:** no conector do Supabase no claude.ai, a gravação (`execute_sql` e `apply_migration`) está como "pedir
aprovação". O cartão de Permitir só aparece no chat que gravou e some rápido, por isso as gravações dos chats (IAD,
PRD, eu) estão parando. Não foi mudança no ERP nem no banco.
**Escolha uma:**
1. **Mais seguro:** deixar como está. O chat avisa antes de gravar e você fica com aquele chat aberto para tocar em
   "Permitir". O que não der vai para o arquivo do SQL Editor (item 1).
2. **Mais prático:** claude.ai → Personalizar → **Conectores** → Supabase → permissões das ferramentas → marcar
   **"Sempre permitir"** só em `execute_sql` e `apply_migration`. As que apagam ou pausam (delete_branch,
   pause_project, reset_branch, merge_branch, create_project, deploy_edge_function) continuam pedindo. Vale para todos
   os chats; a proteção continua pelas regras do CLAUDE.md e pelas regras de acesso do banco.

## 1. Rodar um arquivo no SQL Editor do Supabase (6 coisas de uma vez) — ~3 minutos
**O que é:** 5 partes do banco que os chats escreveram e não conseguem criar sozinhos (a ferramenta deles trava ao
criar tabela ou apagar índice).
**Por que importa:**
- GER: sem a tabela `config_ajustes`, os prazos, taxas e textos para o cliente não saem do código para
  Configurações (a base que todos os chats vão usar).
- FUN: sem a marca `de_funcionario`, os recibos de funcionário aparecem no Financeiro e a aba Funcionários → Recibos
  fica vazia (achado do FAZ: o FUN achava que já estava no banco).
- ELO: sem a tabela `paginas_claude`, a aba Sobre → Páginas (já no ar) fica vazia.
- PRD: sem a regra das variações, dá para gravar variação de variação no cadastro de produtos.
- REV: 3 índices repetidos deixam a gravação de notas mais lenta.
- IAD (29/10): 17 IAs voltam para "fazendo" até o teste com tarefa real (o MCP passou a pedir a sua confirmação
  para toda gravação e o cartão não chega até você).

**Onde:** Supabase → seu projeto → **SQL Editor** (menu da esquerda).
**Passo a passo:**
1. Abra o arquivo `.claude/skills/faz/sql/rodar-no-sql-editor.sql` no GitHub (branch `paineis-no-ar`) e clique
   em **Copy raw file** (ícone de copiar).
2. No Supabase: **SQL Editor → New query**, cole tudo e clique em **Run**.
3. Se aparecer o aviso de "operação destrutiva", clique para confirmar: ele só apaga os 3 índices repetidos.
4. No fim aparecem 4 colunas: todas devem dar `true`. Pronto, eu confiro e aviso os chats.

## 2. Senhas das transportadoras nos secrets do Supabase (TRA) — depende de você pedir os acessos
**Por que importa:** sem elas a cotação e o rastreio automáticos ficam desligados (Rodonaves, Braspress e Melhor
Envio já estão prontos no ERP).
**Onde:** Supabase → **Edge Functions → Secrets** → **Add new secret** (nome exatamente como abaixo).
1. **Melhor Envio:** no site do Melhor Envio → Configurações → Tokens → gerar token. Secret `MELHORENVIO_TOKEN`.
2. **Rodonaves:** pedir à Rodonaves o **usuário da API** (não o do site). Secrets `RODONAVES_USUARIO` e
   `RODONAVES_SENHA`.
3. **Braspress:** pedir ao comercial da Braspress o acesso de API **no CNPJ da MF** (o antigo é de outro CNPJ).
   Secrets `BRASPRESS_USUARIO` e `BRASPRESS_SENHA`.
4. Depois, no ERP: Fretes → transportadora → **Testar conexão**.

## 3. Chaves do Meu Pluggy nos secrets do Supabase (CAR)
**Por que importa:** sem elas o painel pessoal não puxa os extratos sozinho (a função já está no ar).
**Onde:** no painel do Meu Pluggy, pegue o Client ID e o Client Secret da sua aplicação pessoal. Cole em
Supabase → **Edge Functions → Secrets**: `PLUGGY_PESSOAL_CLIENT_ID` e `PLUGGY_PESSOAL_CLIENT_SECRET`.

## 4. Olist: programar o envio diário do extrato OFX para o e-mail do ERP (ENT)
**Por que importa:** o último extrato da Olist no ERP é de 08/10; o ERP já importa sozinho o OFX que chega no e-mail.
**Onde:** painel da Olist → extrato da conta → envio automático por e-mail, todo dia, formato OFX, para o e-mail do
ERP (o mesmo que já recebe os outros extratos).

## 5. Banco Inter SP: chaves da API (ENT) — só se a conta Inter SP existir
**Por que importa:** a SC já entra sozinha pela API; a SP não tem conta ligada.
**Onde:** no app ou internet banking do Inter **PJ da SP** → Soluções para sua empresa → **Nova integração**
(extrato e saldo) → baixar o zip do certificado. No ERP: Configurações → **Bancos** → Banco Inter → ligar a conta e escolher o zip
(Client ID e Client Secret colados na própria tela; não mande no chat).

## 6. WhatsApp oficial da empresa na Meta (IAD e GER)
**Por que importa:** sem ele não saem os avisos da equipe nem o robô do WhatsApp.
**Onde:** Meta Business (WhatsApp Business API) → ligar o número fixo da empresa. Depois, no ERP: Configurações →
Cobrança automática → **WhatsApp oficial**, e em Configurações → Avisos automáticos → "Mandar o modelo para a Meta".

## 7. Telegram dos avisos (pendente desde 19/10)
**Onde:** no Telegram, abrir **@BotFather** → `/newbot` → ele dá um token. Supabase → Edge Functions → Secrets:
`TELEGRAM_BOT_TOKEN` (o token) e `TELEGRAM_WEBHOOK_SECRET` (uma senha qualquer). No ERP: Avisos → **Ligar o robô**.

## 8. Login com o rosto (SEG)
**Onde:** no ERP, pelo celular: menu → **Meu rosto** → cadastrar. Depois o SEG marca a data em que passa a ser
obrigatório (7 dias depois) e avisa a equipe.

## 9. Conectar o Gmail do contador (FIS)
**Onde:** claude.ai → Configurações → Conectores → Gmail → **Conectar** com o e-mail do contador da MF (está na
skill do FIS). Serve para o FIS achar guias, parcelamentos e avisos do DTEC.

## Bloco "Dossiê MF SC" (pedido de 28/10: tudo da MF SC desde a abertura, 28/06/2022)
O FIS coordena (pedido 21a33e7d), com TIN, GER e ENT. Aqui entra só o que você busca nos portais e painéis; cada
tarefa com o passo a passo, na ordem do que destrava mais. No resumo da manhã vai **uma por dia**.
**Como mandar cada extrato:** no ERP, Financeiro → Bancos e conciliação → **Importar extrato** (a tela mostra "Vai
entrar na conta X" e trava conta errada; importar de novo o mesmo período não duplica) ou mande o arquivo para o e-mail
de extratos do ERP. Prefira OFX; se o banco não tiver, PDF. Depois de importar, eu aviso o GER e o ENT para conferir.

**Antes de tudo (responder no chat do ENT):** a data de abertura de cada conta da MF SC e quais bancos a MF SC usou em
2022 e 2023 (não há nenhum extrato desses anos no ERP). Antes da abertura não falta nada.

- **D1. Unicred MF SC** (GER e ENT) — o maior buraco.
  1. Primeiro importe os 5 OFX que você já tem (jun/2025 a out/2026).
  2. Internet banking Unicred → Conta corrente → Extrato → período personalizado (até 90 dias por vez, se o banco
     limitar) → Exportar → **OFX (Money)**. Pode ser um arquivo por ano.
  3. Períodos: da abertura da conta (06/2022) até 12/2024, e de 05/2025 até hoje.
  4. Se a conta foi encerrada, peça ao gerente o extrato de encerramento.
- **D2. Olist (conta encerrada)** (GER) — painel Olist/Tiny Conta Digital → Extrato → exportar OFX. Períodos: da
  abertura até 03/2025, e setembro/2026 inteiro (hoje só há 8 dias).
- **D3. InfinitePay SC** (GER e ENT) — app ou site InfinitePay → Extrato → filtrar o período → Exportar (OFX ou CSV).
  Período: da abertura até 07/2024 (se houve movimento antes de 08/2024).
- **D4. Sicoob MF SC** (GER e ENT) — primeiro diga se a conta teve movimento. Se teve: app Sicoob → Conta corrente →
  Extrato → período → OFX ou PDF, de quando abriu até o encerramento. Conta encerrada: pedir à cooperativa.
- **D5. Banco Inter SC** (GER) — o ERP só tem desde 10/2026 (ligação automática). Se a conta é mais antiga: app Inter →
  Extrato → período → Exportar → OFX.
**Tiny, antes de cancelar a assinatura** (TIN; o resto do Tiny já está no ERP). Mandar os arquivos no chat do TIN.
- **T1. Primeiro de tudo (2 cliques, a API do Tiny para quando a assinatura acabar):** no ERP, Importar → Tiny →
  **Buscar recebimentos do Tiny** e **Atualizar cadastros do Tiny** (período: tudo).
- **T2. NFS-e emitidas pelo Tiny:** Tiny → Serviços → Notas fiscais de serviço → período 01/2023 a 09/2026 → selecionar
  todas → Exportar XML (e PDF, se tiver). Se a lista estiver vazia, avise o TIN: não há nada a trazer.
- **T3. 3 notas de entrada de 01/2025:** Tiny → Notas fiscais (ou Suprimentos → Notas de entrada) → tipo "Entrada" →
  01/01/2025 a 31/01/2025 → Baixar XML de todas.
- **T4. Anexos:** Tiny → menu do usuário → Configurações → Backup / Exportar dados → marcar Anexos → período todo →
  baixar o zip.
(Os nomes dos menus do Tiny podem variar um pouco na conta.)

**Fiscal** (FIS; acompanhe no ERP em Painel do contador → **Dossiê da empresa**). Mandar os arquivos no chat do FIS.
- **S1. SEFAZ SC, XML das notas de 06/2022 a 01/2025** (o que mais destrava: sem isso não há como provar vendas e
  compras desses 2 anos e meio; o Tiny só tem 11 de saída e 17 de entrada no período). Portal da SEFAZ SC com o
  certificado digital da MF → NF-e → download de XML: as **emitidas** e as **recebidas (destinadas)**, período
  06/2022 a 01/2025 (um mês por vez, se o portal limitar).
- **C1. Pedir ao contador atual e ao antigo** (um e-mail para cada): recibos de entrega do SPED Fiscal,
  EFD-Contribuições, DCTF/DCTFWeb, ECD e ECF de 2022 até hoje; balancetes e balanços anuais; folha de 06/2022 a
  07/2024. Sem isso não se sabe se as declarações foram entregues.
- **G1. Guias pagas de 06/2022 até hoje** (hoje só há desde 08/2024): e-CAC → Pagamentos → **Comprovante de
  arrecadação** (DARF e DAS, por período); e no portal da SEFAZ SC, os **DAE pagos** no mesmo período.
- **E1. Caixa de e-mail da contabilidade antiga da MF** (ELO; você escolheu "Depois": não cobro por enquanto). Guias,
  folha, honorários e parcelamentos desde 2022 chegavam numa conta Gmail que não está ligada aos chats.
  1. claude.ai → Configurações → Conectores → Gmail → desconectar e entrar com a conta da contabilidade antiga.
  2. Avisar o ELO; os chats buscam o que for da MF (o que for da My Frost vai para o MYF; Soft Premium fica de fora).
  3. Depois, ligar de novo a conta da My Frost.
  Alternativa: Google Takeout dessa caixa (arquivo .mbox).

Ordem do Dossiê no resumo (FIS): T1 a T4 (Tiny, tem prazo) → S1 → C1 → G1 → D1 a D5 (bancos). E1 só quando ela pedir.

---
Fora desta lista (são decisões ou dados que você responde no chat do assunto; quem acompanha é o CNF): planilhas de
custo, extratos para importar, perguntas da auditoria, qual loja é de qual cliente, apagar a tabela `tmp_oc_plano_2310`
(GER e REV esperam o seu ok), etc.
