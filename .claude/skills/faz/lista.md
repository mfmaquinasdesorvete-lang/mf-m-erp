# O que só você faz — lista do FAZ
Atualizada em 27/10/2026. Em ordem: o que trava mais coisa vem primeiro.
Nunca mande senha, chave ou token no chat: cole direto no lugar indicado. Eu confiro sozinho quando ficar feito.

Conferido no banco e no GitHub em 27/10: as funções do Supabase estão todas no ar e iguais ao código, as Actions
(CI, Publicar Supabase e Backup diário) estão verdes e não há site que ficou só montado. O que falta é isto:

---

## 1. Rodar um arquivo no SQL Editor do Supabase (5 coisas de uma vez) — ~3 minutos
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

---
Fora desta lista (são decisões ou dados que você responde no chat do assunto; quem acompanha é o CNF): planilhas de
custo, extratos para importar, perguntas da auditoria, qual loja é de qual cliente, apagar a tabela `tmp_oc_plano_2310`
(GER e REV esperam o seu ok), etc.
