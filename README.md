# ERP Line — MF Máquinas

Sistema de gestão da MF Máquinas. É um projeto separado do app de onboarding da My Frost, com banco de dados próprio.

| Módulo | O que faz |
|---|---|
| **Vendas / Pedidos** | Orçamento → aprovação → NF-e → entrega. Origem WhatsApp por padrão, com botão que manda o orçamento pronto no WhatsApp do cliente. Ao aprovar, **baixa o estoque** e **gera as parcelas** no contas a receber. Cancelar devolve o estoque. |
| **Estoque** | Máquinas, peças, acessórios e insumos. Entradas, saídas e ajustes de inventário, com histórico, nº de série e alerta de estoque mínimo. |
| **Assistência técnica** | Ordens de serviço com nº de série, defeito, diagnóstico, peças usadas, mão de obra e garantia. Mensagem de status pronta para o WhatsApp. Ao concluir, baixa as peças do estoque e gera a cobrança (se fora da garantia). |
| **Financeiro** | Contas a receber e a pagar por unidade, baixa do pagamento, filtro por mês e indicadores. Cobrança pelo WhatsApp e lembretes de vencimento por e-mail com os dados para pagamento (Pix/banco) de cada unidade. |
| **Notas fiscais** | **Emissão de NF-e** (modelo 55) dos pedidos, com DANFE, XML e cancelamento. **NF-e recebidas de fornecedores**: busca na SEFAZ as notas emitidas contra o CNPJ da MF, faz a manifestação (ciência/confirmação), baixa o XML, **dá entrada no estoque** pelos itens do XML (com vínculo item do fornecedor → produto da MF, fator de caixa e atualização do custo) e lança no contas a pagar usando as duplicatas da nota. **Tudo automático:** quando chega uma nota de compra, o ERP faz a ciência, lê o XML, lança as parcelas no contas a pagar e dá entrada no estoque. Só pede ajuda na primeira vez que aparece um item sem vínculo, ou quando a nota é uma remessa (ex.: máquina para conserto). |
| **Orçamento em PDF** | Orçamento ou pedido em PDF com os dados da empresa, os itens, a garantia de cada máquina, a validade e as condições. No celular, o botão Compartilhar manda direto pelo WhatsApp. |
| **Garantias e preventivas** | Cada máquina vendida (por nº de série) entra sozinha quando o pedido é aprovado, com a garantia e a próxima preventiva calculadas. Cards de *em garantia*, *vence em 30 dias*, *fora da garantia* e *preventiva atrasada*, lembrete pronto no WhatsApp e histórico de atendimentos da máquina. Máquinas vendidas antes do ERP podem ser cadastradas à mão. |
| **OS completa** | Checklist de recebimento, fotos do equipamento (câmera do celular), assinatura do cliente na entrada e na retirada, comprovante de entrada e laudo em PDF, cartão de garantia da máquina e histórico por nº de série. Concluir a OS reagenda a preventiva. |
| **Relatórios** | Vendas por mês, fluxo de caixa das próximas 8 semanas, produtos que mais faturaram, DRE simplificado e comissão por vendedor sobre o valor recebido. |
| **Produção e compras** | Ficha técnica de cada máquina (peças por unidade, custo e margem). Ordem de produção mostra o que precisa, o que tem em estoque, o que já está reservado por outras ordens e o que está a caminho; um clique gera os pedidos de compra das peças que faltam, separados por fornecedor. Pedido de compra começa **em cotação** (PDF e WhatsApp para o fornecedor), vira **pedido enviado** e é **recebido** total ou em partes, com entrada no estoque, atualização de custo e conta a pagar. Concluir a produção baixa as peças e coloca as máquinas no estoque. |
| **Frete** | Transportadoras cadastradas; no pedido de venda, a aba *Frete e envio* mostra destino, peso, volumes e medidas, pede cotação no WhatsApp de cada transportadora, compara as cotações (menor preço em destaque), aplica a escolhida ao pedido e registra rastreio e envio, com aviso pronto para o cliente. |
| **Lembretes de manutenção** | Fila diária das máquinas com preventiva vencida ou próxima: enviar lembrete no WhatsApp, registrar agendamento ou adiar. Cada contato fica no histórico e a máquina sai da fila. |
| **Tema e celular** | Tema escuro (padrão) e claro, letras maiores, menu de atalhos fixo embaixo no celular, cartões no lugar de tabelas e ícone instalável na tela inicial. |
| **Loja virtual própria** | Em `https://erp.myfrost.ai/loja`: o cliente vê os produtos, põe no carrinho, **cria a conta** (e-mail e senha), completa o cadastro (CNPJ preenche o resto) e **faz o pedido**. O pedido entra em *Vendas* como orçamento com o selo **LOJA**, o preço vem sempre do ERP, e a equipe recebe o aviso na tela e no Telegram. O cliente acompanha em *Meus pedidos*. Cliente da loja nunca enxerga dados do ERP. |
| **Notificações na tela** | Pop-up com som na hora em que um **pagamento é recebido**, um **pedido chega pela loja** ou um **e-mail novo** cai na caixa; sino com o histórico. Com a permissão do navegador, avisa até com o ERP minimizado. Cada pessoa só recebe o que o papel dela vê. |
| **Caixa de e-mail** | O e-mail da empresa (IMAP/SMTP) dentro do ERP: ler, responder e escrever; reconhece clientes e fornecedores pelo remetente; XML de NF-e em anexo **dá entrada com um clique**; botão para abrir orçamento para quem escreveu. |
| **NF-e de entrada por XML** | Além da busca na SEFAZ, *Notas fiscais → Importar XML* aceita o arquivo que o fornecedor mandou: confere se a nota é para um CNPJ da MF e segue o mesmo processo automático (estoque e contas a pagar). |
| **Importar do Tiny / Olist** | Em *Estoque → Importar do Tiny*, a planilha de produtos exportada do Tiny entra de uma vez: descrição, SKU, NCM, CEST, origem, preços, estoque (como saldo inicial na unidade escolhida), mínimo e máximo, localização, EAN, marca, categoria, garantia, peso e medidas, foto, texto de venda e fornecedor com o código dele (as NF-e de compra já entram ligadas ao produto). Variações viram produtos próprios; estoque negativo entra como zero. Importar de novo atualiza, sem duplicar. As fotos são copiadas do Tiny para o ERP. |
| **Busca pelo CNPJ** | Em clientes, fornecedores, transportadoras, unidades e no cadastro da loja: digitou o CNPJ, razão social, endereço, telefone e e-mail vêm sozinhos (BrasilAPI, gratuita), e o ERP avisa se o CNPJ não está ativo. |
| **Cores por usuário** | Em *Aparência* cada pessoa escolhe tema claro ou escuro e a cor de destaque (6 opções); fica salvo no usuário e vale no computador e no celular. |
| **Propostas comerciais** | O orçamento vira proposta com layout próprio (título, cor, apresentação, condições, rodapé e fotos dos produtos) em PDF e numa página para o cliente (`https://erp.myfrost.ai/proposta/…`). Envio por **e-mail** (com o PDF) ou link no **WhatsApp**; aviso na tela quando o cliente **abre**, **aprova** ou **recusa**. Aprovada vira pedido de venda sozinha (baixa o estoque e gera as parcelas). Recusada guarda o **motivo** (preço, prazo, frete, concorrente…) e entra na análise de conversão em Relatórios. |
| **Comissões** | Cadastro de **vendedores e representantes** com % e quando a comissão sai (no **recebimento**, parcela a parcela, ou no **faturamento**), com ou sem frete. A comissão nasce sozinha das vendas, é cancelada se o pedido for cancelado e é paga pelo **contas a pagar**; cada vendedor vê as próprias. |
| **Kits** | Produto marcado como kit com **componentes** obrigatórios, **opcionais** e **alternativas** (escolhe um do grupo). No pedido dá para ajustar a composição; ao aprovar a venda, baixa o estoque **dos componentes**; cancelar devolve exatamente o que saiu. A lista mostra quantos kits dá para montar. |
| **Documentos** | Anexe arquivos (PDF, fotos, planilhas, até 20 MB) em pedidos, OS, clientes, fornecedores, produtos e contas, e os documentos da empresa (contrato social, alvarás). Tela **Documentos** com busca. Arquivos financeiros só para quem é do financeiro. |
| **Exportar e imprimir** | Botão **Exportar** (Excel) nas listas, em Vendas (pedidos + itens), no Financeiro e nas Comissões; **Imprimir** o financeiro (relatório em PDF com filtros e totais); planilha com **todos os dados** em Configurações. |
| **NF-e avançada** | **Carta de correção** (CC-e), **inutilização** de numeração, **contingência** (se a SEFAZ/Focus não responder, a nota fica na fila e é reenviada sozinha) e cancelamento. |
| **Regras de tributação** | Regras por operação (venda/transferência), destino, tipo de cliente, tipo de produto, NCM, origem e CFOP que definem CFOP, ICMS (CST, alíquota, redução, DIFAL), IPI, PIS, COFINS e o texto da nota. |
| **Compliance fiscal** | Conferência automática antes de emitir (CPF/CNPJ com dígito, IE de contribuinte, endereço, NCM, CEST, CFOP, DIFAL) e painel de pendências: cadastros, notas com erro, **números pulados para inutilizar**, manifestações atrasadas, tabela do DIFAL. Acompanhamento da **reforma tributária** (IBS/CBS: destaque de teste de 2026 e simulação). |
| **Fluxo de pedidos** | Todos os pedidos de todos os canais (WhatsApp, loja, proposta, representante, telefone) num **painel só**: orçamentos → aprovados/nota fiscal → separar e conferir → embalar e despachar → em trânsito → entregues. Com a **NF-e automática** ligada, a venda aprovada tem a nota emitida sozinha. A **expedição** nasce sozinha (na aprovação ou com a NF-e autorizada): lista de separação com localização e componentes de kit, **conferência por código de barras/SKU/nº de série**, volumes e peso, **etiquetas dos volumes**, despacho (exige NF-e autorizada) com rastreio enviado ao cliente e entrega. |
| **Margem de contribuição** | Lucro de verdade por **venda, produto, canal, vendedor, cliente e unidade**: receita menos impostos (os da NF-e, ou estimados pelo cadastro da unidade: ICMS, DIFAL, PIS, COFINS), custo do produto (kit pelo custo dos componentes), comissão, frete pago e taxa do meio de pagamento (configurável). Cascata da receita à margem, ordenação e exportação. |
| **Cadastros (clientes, fornecedores, transportadoras)** | **Código** automático, **nome fantasia** separado da **razão social**, máscaras de CPF/CNPJ, telefone, CEP e e-mail (com validação dos dígitos), **busca pelo CNPJ** (Receita: razão social, fantasia, contato, endereço e **inscrição estadual** pelo SINTEGRA), **busca pelo CEP**, WhatsApp pronto para clicar e chamar, telefone para ligar e e-mail para escrever. |
| **Etiquetas de envio** | **Um clique** imprime as etiquetas de todos os volumes: ícone de impressora em cada cartão do Fluxo, **Imprimir todas** na coluna Embalar e despachar, na expedição e no pedido. Cada volume sai com remetente, destinatário (CEP em destaque), pedido, NF-e, volume 1/N, transportadora, peso, rastreio e **código de barras da chave da NF-e**. Formato **10x15 cm** (impressora térmica Zebra/Elgin/Argox) ou **A4 com 4 por folha**, em Configurações → Automação de pedidos. |
| **Bancos e conciliação** | Contas bancárias por unidade (Unicred, Nubank, InfinitePay, caixa) com saldo inicial. **Importa o extrato** em OFX (Unicred, Nubank) ou CSV (InfinitePay; colunas reconhecidas sozinhas e ajustáveis); o mesmo período pode ser importado de novo sem duplicar. **Concilia sozinho** o que tem um único par certo (mesmo valor, mesma unidade, data próxima) e já dá a baixa com a data do banco. O resto: ligar a uma conta (com sugestões), lançar tarifa/juros/rendimento, marcar **transferência entre contas** (não vira receita nem despesa) ou ignorar com motivo. Saldo pelo extrato × saldo pelo ERP × saldo informado pelo banco. |
| **Auditoria** | **Histórico de alterações** gravado pelo banco (quem, quando, antes → depois, motivo), que ninguém edita nem apaga; contas não são excluídas, só canceladas, e mudar valor/vencimento, cancelar ou estornar exige motivo. **Painel de exceções**: possível duplicidade, pagamento sem documento, valor redondo incomum, alteração após o lançamento, baixa sem conferência no extrato, extrato pendente, pedido cancelado com parcela aberta, OS concluída sem cobrança, saldo diferente do banco e mesma pessoa lançou e pagou; cada uma com critério, evidência, situação (indício, confirmado, resolvido, descartado), impacto, responsável e prazo. Vencidos por faixa de atraso. |
| **Painel do contador** | Papel **Contador**: entra no ERP só para consultar notas fiscais, financeiro e documentos (não altera nada). Por mês e unidade: resumo (notas emitidas, canceladas, recebidas, CC-e, inutilizações, recebimentos e pagamentos), pendências fiscais, **saídas e entradas por CFOP**, **pacote ZIP** com todos os XML e planilhas, **envio automático por e-mail** no dia escolhido, **fechamento do mês** (pagamentos e recebimentos do mês fechado ficam travados; só o administrador reabre), conversa com o financeiro e anexos (guias, balancete). |
| **Painel** | Indicadores de cada papel: vendas do mês, orçamentos, OS em andamento, estoque baixo, a receber, a pagar e notas de fornecedor para conferir. |
| **Usuários e permissões** | Papéis **Administrador**, **Vendas**, **Financeiro** e **Técnico**. Cada um vê só as telas dele, e o banco bloqueia o resto (RLS). Detalhes abaixo. |

## Arquitetura

- **Frontend:** React + Vite + Tailwind (pasta `src/`)
- **Banco/Autenticação:** Supabase (Postgres com RLS). As regras de negócio (aprovar pedido, cancelar, concluir OS) ficam em funções SQL transacionais.
- **Edge Functions** (`supabase/functions/`):
  - `nfe-emitir` / `nfe-consultar`: emissão, consulta e cancelamento da NF-e
  - `nfe-recebidas-sync`: NF-e de fornecedores (sincronizar, manifestar, ler itens do XML, lançar a pagar)
  - `focus-webhook`: recebe os gatilhos da Focus (status da NF-e e nova nota de fornecedor)
  - `focus-config`: ativa os gatilhos na Focus (botão em Configurações)
  - `nfe-processar`: execução agendada (a cada 15 min) que busca e processa as notas de fornecedores
  - `usuarios-admin`: criar usuários, trocar papel, desativar e redefinir senha (só admin)

### Por que Focus NFe para a nota fiscal?

A venda de máquinas e peças exige **NF-e** (produto). A parte fiscal usa a [Focus NFe](https://focusnfe.com.br), que faz a emissão da NF-e e a captura das notas de fornecedores (MD-e) pela mesma API. O código fiscal fica isolado em `supabase/functions/_shared/focusnfe.ts`, então dá para trocar de provedor (NFE.io, PlugNotas etc.) sem mexer nas telas.

## Papéis e permissões

| Tela | Admin | Vendas | Financeiro | Técnico |
|---|:-:|:-:|:-:|:-:|
| Painel | ✔ | ✔ | ✔ | ✔ |
| Vendas / Pedidos | ✔ | ✔ editar | 👁 ver | — |
| Assistência técnica | ✔ | 👁 ver | 👁 ver | ✔ editar |
| Garantias e preventivas | ✔ | ✔ | 👁 ver | ✔ |
| Relatórios | ✔ | — | ✔ | — |
| Produção e compras | ✔ | 👁 produção | ✔ (recebe compras) | ✔ produção e compras |
| Estoque | ✔ | 👁 ver | ✔ editar | 👁 ver |
| Financeiro | ✔ | contas a receber | ✔ tudo | — |
| Notas fiscais | ✔ | NF-e emitidas | ✔ emitidas + fornecedores | — |
| Clientes | ✔ | ✔ | ✔ | ✔ |
| Fornecedores | ✔ | — | ✔ | — |
| Usuários / Configurações | ✔ | — | — | — |

As permissões valem em três camadas: o menu (a tela some), as Edge Functions (conferem o papel) e o banco (políticas RLS). Mesmo quem chamar a API direto não passa.

## Como colocar no ar (passo a passo)

### 1. Supabase (banco e login)
1. Crie um projeto **novo** em https://supabase.com (região São Paulo). Anote a **senha do banco**.
2. Publique o banco e as funções. Há dois jeitos:
   - **Pelo GitHub (sem instalar nada):** no repositório, abra *Settings → Secrets and variables → Actions* e crie `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` e `SUPABASE_DB_PASSWORD`. Depois vá em *Actions → Publicar Supabase → Run workflow*.
   - **Pelo terminal:**
     ```bash
     npm i -g supabase && supabase login
     supabase link --project-ref SEU_PROJECT_REF
     supabase db push
     # funções (as 3 últimas recebem chamadas externas, por isso --no-verify-jwt)
     for f in nfe-emitir nfe-consultar nfe-recebidas-sync focus-config usuarios-admin avisos-config produtos-fotos proposta-enviar; do supabase functions deploy $f; done
     for f in focus-webhook nfe-processar avisos-enviar telegram-webhook email-descadastrar catalogo-feed email-caixa contador-pacote; do supabase functions deploy $f --no-verify-jwt; done
     ```
3. **Primeiro administrador:** depois de publicar o site (passo 6), abra o endereço e clique em **Primeiro acesso? Criar conta de administrador**. A primeira conta criada vira administradora automaticamente, e depois disso a opção some. Os demais usuários você cria pelo próprio ERP, em **Usuários**.
   - Deixe ligada em *Supabase → Authentication → Sign In / Providers* a opção **Allow new users to sign up**: é por ela que os clientes criam conta na loja. Quem se cadastra pela loja nunca vira usuário do ERP (nem administrador); a equipe continua sendo criada só pela tela de Usuários.

### 2. Chaves (secrets) das funções
No Supabase, em *Edge Functions → Secrets* (ou `supabase secrets set ...`):

| Secret | Valor |
|---|---|
| `FOCUS_NFE_TOKEN` | token da Focus (comece pelo de homologação) |
| `FOCUS_NFE_TOKEN_SP` | token da Focus da **Filial SP** (cada CNPJ tem o seu; vale `FOCUS_NFE_TOKEN_<código da unidade>`, e a unidade sem token próprio usa o `FOCUS_NFE_TOKEN`) |
| `FOCUS_NFE_ENV` | `homologacao`, depois `producao` |
| `FOCUS_WEBHOOK_TOKEN` | outra senha qualquer, que você inventa |
| `ERP_CRON_TOKEN` | outra senha qualquer, que você inventa |
| `TELEGRAM_BOT_TOKEN` | token do robô (passo 4b) |
| `TELEGRAM_WEBHOOK_SECRET` | outra senha qualquer (só letras, números, `_` e `-`) |
| `RESEND_API_KEY` | chave da API do Resend (passo 4c) |
| `EMAIL_REMETENTE` | ex.: `MF Máquinas <avisos@myfrost.ai>` |
| `ERP_SITE_URL` | endereço do ERP (`https://erp.myfrost.ai`), para os links dos avisos e o logo no e-mail |

### 3. Matriz SC e filial SP (lucro real)
Em **Configurações → Unidades**, preencha cada unidade: CNPJ, IE, endereço e a aba **Impostos (lucro real)** (CST, ICMS interno, PIS 1,65%, COFINS 7,6%, IPI, DIFAL). Os valores que vêm prontos são o ponto de partida mais comum — **confirme com o contador**. A alíquota de IPI fica no cadastro de cada máquina (TIPI do NCM).

- **Seletor no topo do menu** (Todas · Matriz SC · Filial SP): filtra as telas e define em qual unidade entram os novos pedidos, OS, contas e compras.
- **Estoque separado por unidade.** Para levar máquina ou peça de uma para a outra, use **Transferências SC ↔ SP**: enviar (baixa da origem) → emitir NF-e de transferência (CFOP 6151/6152, sem ICMS por padrão) → "chegou" (entra no destino).
- **NF-e** sai pelo CNPJ da unidade do pedido, com ICMS (12% ou 7% interestadual, 4% importado), IPI do que a unidade fabrica, PIS/COFINS não cumulativos e DIFAL para consumidor final de outro estado.
- **Focus NFe:** cadastre os dois CNPJs (certificado A1 de cada um). O botão "Ativar atualização automática" registra os gatilhos das duas unidades, e as notas de fornecedores são buscadas para cada CNPJ.
- **Cobrança:** cada unidade tem os seus dados para pagamento (Pix, banco), que vão nos lembretes por e-mail e na cobrança pelo WhatsApp. A baixa do pagamento é feita em Contas a receber e pagar.

### 4. Focus NFe
1. No painel (https://app.focusnfe.com.br), cadastre a empresa: CNPJ, IE, regime e endereço.
2. Envie o **certificado digital A1** (arquivo .pfx e senha).
3. Habilite **NF-e** e **Manifestação do Destinatário / NF-e recebidas**.
4. **Numeração:** se a MF já emitiu NF-e por outro sistema, informe à Focus a série e o **próximo número**.
5. Coloque o token em `FOCUS_NFE_TOKEN`.
6. No ERP, em **Configurações → Focus NFe**, clique em **Ativar atualização automática**. Faça de novo quando trocar para o token de produção.

> A busca de notas de fornecedores consulta a SEFAZ real, então só funciona com o token de **produção**. Em homologação, teste só a emissão.

### 4b. Avisos da equipe no Telegram (gratuito)
1. No Telegram, abra **@BotFather**, mande `/newbot`, escolha um nome (ex.: *MF Máquinas Avisos*) e um usuário terminado em `bot`.
2. Copie o **token** que ele devolve para o secret `TELEGRAM_BOT_TOKEN` e crie `TELEGRAM_WEBHOOK_SECRET`.
3. No ERP, em **Configurações → Avisos automáticos → Equipe**, clique em **Ligar o robô**.
4. Cada pessoa abre **Meus avisos** (menu, embaixo) → **Conectar meu Telegram** → toca em **INICIAR**. Ali também escolhe o que quer receber.

Cada papel recebe só o que é dele (ex.: financeiro recebe "pagamento recebido"; técnico, "nova OS"). O admin recebe tudo e liga/desliga cada tipo de aviso.

### 4c. E-mails para os clientes (Resend)
1. Crie uma conta em https://resend.com e adicione o **domínio** `myfrost.ai` (o mesmo do ERP). Ele mostra 3 registros DNS: cadastre-os onde o domínio está (Hostinger, Registro.br...) e espere ficar *Verified*.
2. Crie uma **API key** e coloque em `RESEND_API_KEY`; em `EMAIL_REMETENTE`, um endereço desse domínio.
3. No ERP, em **Configurações → Avisos automáticos → Clientes**, ligue **Enviar e-mails para os clientes**, informe para onde vão as respostas e mande um **e-mail de teste**.

Só recebe quem tem e-mail no cadastro. Todo e-mail tem o link "Não quero mais receber"; quem clicar sai da lista (também dá para desmarcar no cadastro do cliente).

### 4d. Catálogo do WhatsApp e vitrine
O catálogo de peças sai do WhatsApp Business **(48) 3375-5280** da matriz (já vem preenchido em Configurações e na Matriz SC). Esse mesmo número recebe os pedidos da vitrine pelo botão do WhatsApp.

1. Em **Estoque**, edite cada produto que vai para o catálogo: marque **Mostrar no catálogo**, tire a **foto** e escreva o **texto de venda**. Sem foto ou sem preço o produto não vai (o ERP avisa).
2. Em **Configurações → Catálogo do WhatsApp**, copie o link.
3. No Gerenciador de Comércio da Meta (business.facebook.com/commerce), no catálogo ligado ao WhatsApp: **Fontes de dados → Feed de dados → Programado**, cole o link e escolha atualizar **a cada hora**.

Preço e disponibilidade vêm do ERP: com estoque = *pronta entrega*; máquina sem estoque = *sob encomenda*; peça sem estoque = *esgotado*. A vitrine pública fica em `https://erp.myfrost.ai/loja` (cada produto tem a sua página com o botão **Pedir pelo WhatsApp**) e é o link que a Meta exige para cada item.

### 4e. Loja virtual (contas de clientes)
No Supabase, em **Authentication → URL Configuration**, coloque `https://erp.myfrost.ai` em *Site URL* e adicione `https://erp.myfrost.ai/loja/conta` e `https://erp.myfrost.ai/**` em *Redirect URLs* (é para onde vai o link de confirmação de e-mail e de nova senha). Em *Authentication → Sign In / Providers → Email* deixe **Confirm email** ligado. Em **Configurações** escolha qual unidade recebe os pedidos da loja (padrão: matriz). Clientes da loja nunca viram usuários do ERP.

### 4f. Caixa de e-mail
Em **Configurações → Caixa de e-mail → Ligar uma caixa**, informe o e-mail, a senha e os servidores (Hostinger: `imap.hostinger.com` 993 e `smtp.hostinger.com` 465; Gmail: `imap.gmail.com`/`smtp.gmail.com` com **senha de app**). O ERP testa o acesso antes de salvar; a senha fica só no servidor. Escolha quem vê a caixa (vendas, financeiro, técnico). Os e-mails novos chegam a cada 5 minutos pelo agendamento (passo 5) ou no botão Atualizar.

### 5. Agendamento (notas de fornecedores e avisos)
Abra o arquivo `supabase/agendamento.sql`, troque `SEU_PROJECT_REF` e o token (`ERP_CRON_TOKEN`) e rode no *SQL Editor*. Ele agenda:
- notas de fornecedores a cada 15 min (cobre notas que chegarem sem o aviso da Focus e tenta de novo as que esperavam o XML);
- envio da fila de avisos a cada minuto;
- caixa de e-mail a cada 5 min;
- às 8h: resumo do dia para a equipe e lembretes por e-mail para clientes (vencimento chegando ou em atraso, preventiva, garantia acabando).

### 6. Publicar o site na Hostinger (erp.myfrost.ai)
O site é só arquivos (HTML/JS); o banco, o login e as funções ficam no Supabase. Qualquer plano de hospedagem da Hostinger serve.
1. **Subdomínio:** hPanel → *Domínios → Subdomínios* → crie `erp` em `myfrost.ai` (pasta, ex.: `public_html/erp`). Ative o **SSL** (gratuito) em *Segurança → SSL*.
2. **Publicação automática (recomendado):** no GitHub do projeto, *Settings → Secrets and variables → Actions*, crie:
   - `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Supabase → *Settings → API*);
   - `HOSTINGER_FTP_HOST`, `HOSTINGER_FTP_USER`, `HOSTINGER_FTP_PASSWORD` (hPanel → *Arquivos → Contas FTP*);
   - `HOSTINGER_FTP_DIR` = a pasta do subdomínio terminando com `/` (ex.: `/domains/myfrost.ai/public_html/erp/`).
   
   A cada alteração na `main`, o GitHub monta o site e envia para a Hostinger (workflow *Publicar na Hostinger*).
3. **Ou manual:** `npm run build` e envie o conteúdo da pasta `dist` (inclusive o arquivo oculto `.htaccess`) para a pasta do subdomínio pelo Gerenciador de Arquivos.
4. No Supabase, *Authentication → URL Configuration*: **Site URL** `https://erp.myfrost.ai`; em *Edge Functions → Secrets*, `ERP_SITE_URL` = `https://erp.myfrost.ai`.

O `.htaccess` já faz as rotas (`/pedidos`, `/loja`, `/proposta/...`) abrirem direto, força HTTPS e cuida do cache.
Também funciona na Vercel, Netlify ou Cloudflare Pages (comando `npm run build`, pasta `dist`).

**Por que o banco não fica na Hostinger:** o banco da hospedagem da Hostinger é MySQL, e o ERP usa PostgreSQL com login, arquivos,
tempo real (avisos na tela), funções e agendamentos do Supabase. Para produção use o plano **Pro** do Supabase (o gratuito pausa
o projeto após 7 dias sem uso e não tem backup diário), região **São Paulo**.

### 6b. Contador
Em **Usuários**, crie o acesso do contador com o papel **Contador**. Em **Configurações → Contador**, informe o e-mail e, se quiser, ligue o **envio automático** (todo mês, no dia escolhido, o pacote do mês anterior vai por e-mail; precisa do agendamento do passo 5 e do Resend do passo 4c).

### 7. Antes de emitir notas de verdade
- Em **Configurações**, preencha CNPJ, IE, UF e os padrões fiscais (CFOP, CSOSN/CST, PIS/COFINS), **validados com o contador**.
- Cadastre o **NCM** de cada produto. Sem NCM a nota não é emitida. O **código de barras (EAN)** é opcional, mas ajuda a vincular sozinho os itens das notas de fornecedores.
- Emita algumas notas em **homologação** antes de trocar `FOCUS_NFE_ENV` para `producao`.

## Prévia com dados de exemplo

`npm run build:demo` gera `dist-demo/index.html`, um único arquivo com o ERP funcionando em memória (sem Supabase). Serve para mostrar o sistema e treinar a equipe.

## Desenvolvimento local

```bash
cp .env.example .env   # URL e anon key do Supabase
npm install
npm run dev            # http://localhost:5174
```

O CI (GitHub Actions) verifica os tipos e o build do site e das Edge Functions em cada PR.

## Próximos passos sugeridos
- Envio automático pelo WhatsApp (API oficial do WhatsApp Business) em vez do link wa.me
- Relatórios (DRE simplificado, curva ABC, comissão de vendedores)
- Emissão de NFS-e para a mão de obra da assistência técnica
