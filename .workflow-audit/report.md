# Auditoria dos fluxos das telas — ERP Line (17/10/2026)

264 telas e componentes, 60 rotas, 633 alvos de navegação, 74 links de aba, 64 ações destrutivas, ~85 botões que gravam e 295 rotinas de gravação conferidos; **57 problemas** (10 críticos, 23 altos, 16 médios, 8 baixos) — **30 já consertados** no código 4cc1f72 (✅), 27 em aberto.

| #  | Problema (arquivo:linha) | Urgência | Risco:Conserto | Risco:Não consertar | ROI | Arquivos | Esforço |
|----|---|---|---|---|---|---|---|
| 1  | ✅ NF-e: trava ligada só depois da pergunta de teste (que consulta o servidor) — dois cliques emitiam duas notas. `EmitirNfe.tsx:153,271`, `fluxo/Expedicao.tsx:33`, `nfe/DevolucaoModal.tsx:45` | 🔴 Crítico | ⚪ Baixo | 🔴 Crítico | 🟠 Excelente | 🟡 3 | Trivial |
| 2  | ✅ Clique duplo lançava o estoque duas vezes (ajuste de inventário em dobro). `Produtos.tsx:829` | 🔴 Crítico | ⚪ Baixo | 🔴 Crítico | 🟠 Excelente | ⚪ 1 | Trivial |
| 3  | ✅ Clique duplo criava a série de parcelas a pagar em dobro (insert direto, fora do `useSave`). `Financeiro.tsx:594` | 🔴 Crítico | ⚪ Baixo | 🔴 Crítico | 🟠 Excelente | ⚪ 1 | Trivial |
| 4  | ✅ Clique duplo somava o adicional de frete duas vezes no valor aprovado. `fretes/EnvioForm.tsx:608,774` | 🔴 Crítico | ⚪ Baixo | 🟡 Alto | 🟠 Excelente | ⚪ 1 | Trivial |
| 5  | ✅ Esc na busca de cliente fechava o formulário inteiro (pedido, OS, NF-e direta, contas, serviço tomado…). `ClienteBusca.tsx:57`, `ui.tsx:286` | 🔴 Crítico | ⚪ Baixo | 🔴 Crítico | 🟠 Excelente | 🟢 2 | Trivial |
| 6  | ✅ Janela de baixo voltava ao topo da pilha ao receber dados e o Esc seguinte a fechava (ex.: categorias dentro do cadastro de produto). `ui.tsx:282` | 🔴 Crítico | 🟢 Médio | 🟡 Alto | 🟠 Excelente | ⚪ 1 | Trivial |
| 7  | ✅ Foto da OS apagada sem confirmação; lixeira invisível mas tocável no celular; arquivo apagado antes de gravar a OS. `Assistencia.tsx:316,703` | 🔴 Crítico | ⚪ Baixo | 🔴 Crítico | 🟠 Excelente | ⚪ 1 | Trivial |
| 8  | ✅ Produção concluída mesmo quando os números de série não foram gravados (erro ignorado). `Producao.tsx:347` | 🔴 Crítico | ⚪ Baixo | 🟡 Alto | 🟠 Excelente | ⚪ 1 | Trivial |
| 9  | ✅ Ficha cadastral podia ser assinada sem a declaração ter carregado. `clientes/AssinaturaFicha.tsx:262` | 🔴 Crítico | ⚪ Baixo | 🟡 Alto | 🟠 Excelente | ⚪ 1 | Trivial |
| 10 | Esc e X descartam formulários grandes sem "Sair sem salvar?" (pedido, OS, NF-e direta, produto, contas, OP, OC, transferência, e-mail, parcelamento). Só `ClienteForm.tsx:171` avisa. `ui.tsx:295` | 🔴 Crítico | 🟢 Médio | 🟡 Alto | 🟢 Bom | 🔴 ~11 | Médio |
| 11 | ✅ Aprovação dizia "NF-e enviada" mesmo com a NF-e barrada ou com erro. `Pedidos.tsx:722-737` | 🟡 Alto | ⚪ Baixo | 🟡 Alto | 🟠 Excelente | ⚪ 1 | Pequeno |
| 12 | ✅ "Importar de novo (atualiza)" do Tiny sobrescrevia preço, custo, NCM e endereços sem perguntar. `ImportarTiny.tsx:242` | 🟡 Alto | ⚪ Baixo | 🟡 Alto | 🟠 Excelente | ⚪ 1 | Trivial |
| 13 | ✅ Ações em lote dos cadastros (inativar, tirar do catálogo) sem confirmação; erro de rede/permissão aparecia como "tem vínculos". `CrudPage.tsx:191,400` | 🟡 Alto | ⚪ Baixo | 🟡 Alto | 🟠 Excelente | ⚪ 1 | Pequeno |
| 14 | ✅ Componente do kit apagado no clique (muda a baixa de estoque). `KitComponentes.tsx:29` | 🟡 Alto | ⚪ Baixo | 🟡 Alto | 🟠 Excelente | ⚪ 1 | Trivial |
| 15 | ✅ "Desfazer" em lote apagava agendamentos e motivos de não pagar sem perguntar. `financeiro/DecisaoPagamento.tsx:279` | 🟡 Alto | ⚪ Baixo | 🟡 Alto | 🟠 Excelente | ⚪ 1 | Trivial |
| 16 | ✅ Link de pagamento já enviado descartado com um toque. `financeiro/LinkPagamento.tsx:76` | 🟡 Alto | ⚪ Baixo | 🟢 Médio | 🟠 Excelente | ⚪ 1 | Trivial |
| 17 | ✅ Cotação de frete apagada sem confirmação e sem mostrar erro. `FreteVenda.tsx:107` | 🟡 Alto | ⚪ Baixo | 🟢 Médio | 🟠 Excelente | ⚪ 1 | Trivial |
| 18 | ✅ "Tirar da marca" (transportadora) sem confirmação, ao contrário de Fornecedores. `Transportadoras.tsx:74` | 🟡 Alto | ⚪ Baixo | 🟢 Médio | 🟠 Excelente | ⚪ 1 | Trivial |
| 19 | ✅ "Máquinas vendidas" e o atalho Vendas do Painel das máquinas abriam a Venda de Peças (que exclui máquinas). `paineis/PainelMaquinas.tsx:168,287` | 🟡 Alto | ⚪ Baixo | 🟡 Alto | 🟠 Excelente | ⚪ 1 | Trivial |
| 20 | ✅ "Notas de fornecedor para conferir" abria as NF-e emitidas. `Dashboard.tsx:219,230`, `financeiro/PainelFinanceiro.tsx:127`, `paineis/PainelFinanceiroArea.tsx:175` | 🟡 Alto | ⚪ Baixo | 🟡 Alto | 🟠 Excelente | 🟡 3 | Trivial |
| 21 | ✅ Início: "Cobranças vencidas" abria a Visão geral e "Orçamentos abertos" todos os pedidos. `Dashboard.tsx:203,204,223,232` | 🟡 Alto | ⚪ Baixo | 🟢 Médio | 🟠 Excelente | ⚪ 1 | Trivial |
| 22 | ✅ Rotina do Analista fiscal: 4 botões ("Notas recebidas", "Regras", "Compliance", "Contas a pagar") abriam a aba padrão. `AnalistaFiscal.tsx:335-338` | 🟡 Alto | ⚪ Baixo | 🟢 Médio | 🟠 Excelente | ⚪ 1 | Trivial |
| 23 | ✅ "Pedidos de compra em cotação" abria a aba Cotações (outra tabela). `paineis/PainelProducao.tsx:111` | 🟡 Alto | ⚪ Baixo | 🟢 Médio | 🟠 Excelente | ⚪ 1 | Trivial |
| 24 | ✅ Contador caía em Financeiro sem aba marcada (cobrança escondida para ele). `Financeiro.tsx:123` | 🟡 Alto | ⚪ Baixo | 🟢 Médio | 🟠 Excelente | ⚪ 1 | Trivial |
| 25 | ✅ "Entre contas e sócios" no menu do Vendas levava a uma tela bloqueada. `lib/permissoes.ts:124` | 🟡 Alto | ⚪ Baixo | 🟢 Médio | 🟠 Excelente | ⚪ 1 | Trivial |
| 26 | ✅ Início e Contas diziam "tudo em dia" / "nenhum registro" enquanto carregavam. `Dashboard.tsx:246,326`, `Financeiro.tsx:327,359,678,692` | 🟡 Alto | ⚪ Baixo | 🟡 Alto | 🟠 Excelente | 🟢 2 | Pequeno |
| 27 | Cotação de frete manda a cidade da matriz como origem em pedido da filial SP (preço e prazo errados). `FreteVenda.tsx:75`, `fretes/FreteRapido.tsx:69` | 🟡 Alto | ⚪ Baixo | 🟡 Alto | 🟠 Excelente | 🟢 2 | Pequeno |
| 28 | Comissão prevista nos Relatórios ignora as regras de comissão (difere do Pedido e da Margem). `Relatorios.tsx:89-96` | 🟡 Alto | 🟢 Médio | 🟡 Alto | 🟢 Bom | ⚪ 1 | Pequeno |
| 29 | "Compras e cotações" aparece no menu do Vendas e a tela bloqueia ("Seu perfil não faz compras"); cartões do Início e do Pós-venda levam lá. `lib/menu.ts:85`, `Producao.tsx:55,88` | 🟡 Alto | 🟢 Médio | 🟢 Médio | 🟢 Bom | 🟡 3 | Pequeno |
| 30 | Painel da fábrica leva o perfil Compras a /producao e /transferencias (escondidas); o pedido de Reposição se perde. `paineis/PainelProducao.tsx:98-143` | 🟡 Alto | ⚪ Baixo | 🟢 Médio | 🟢 Bom | ⚪ 1 | Pequeno |
| 31 | Indicadores do Painel de vendas: no quadro Kanban (padrão) a situação clicada é ignorada e as máquinas não aparecem. `paineis/PainelVendas.tsx:125-180`, `Pedidos.tsx:160,233` | 🟡 Alto | 🟢 Médio | 🟢 Médio | 🟢 Bom | 🟢 2 | Pequeno |
| 32 | "Precisa de atenção" e cartões dos painéis não conferem o perfil: o clique volta ao Início sem aviso. `painel/Painel.tsx:233` (+ 5 painéis) | 🟡 Alto | 🟢 Médio | 🟢 Médio | 🟢 Bom | 🔴 6 | Médio |
| 33 | "Marcar todos" some no celular (cabeçalho da tabela escondido) em CT-e, anúncios, comissões, cadastros e propostas do Tiny. `CtePainel.tsx:254`, `AnunciosMercadoLivre.tsx:244`, `Comissoes.tsx:131`, `CrudPage.tsx:444`, `PropostasTiny.tsx:187` | 🟡 Alto | ⚪ Baixo | 🟢 Médio | 🟠 Excelente | 🔴 5 | Pequeno |
| 34 | Erros de leitura engolidos em 9 consultas (`(await …).data`): falha parece lista vazia. `Assistencia.tsx:197,203`, `EnvioForm.tsx:87,93`, `CtePainel.tsx:48`, `FichaProduto.tsx:80`, `config/Cobranca.tsx:46`, `financeiro/Cobranca.tsx:36`, `QualidadeClientes.tsx:354` | 🟢 Médio | ⚪ Baixo | 🟢 Médio | 🟢 Bom | 🔴 9 | Pequeno |
| 35 | ✅ Erros que sumiam: itens da nota de fornecedor (parecia nota sem XML), escolha da cotação no Frete rápido e registro da troca de senha. `RecebidaDetalhe.tsx:48`, `FreteRapido.tsx:94`, `Login.tsx:222` | 🟢 Médio | ⚪ Baixo | 🟢 Médio | 🟠 Excelente | 🟡 3 | Trivial |
| 36 | Garantias: histórico da máquina sem paginar (1.000 OS) e "Agendou" sem conferir o erro. `Garantias.tsx:282,331` | 🟢 Médio | ⚪ Baixo | 🟢 Médio | 🟢 Bom | ⚪ 1 | Pequeno |
| 37 | Configurações ficam em "Carregando…" para sempre se a leitura falhar (sem "tentar de novo"). `config/comum.tsx:87` + 8 páginas | 🟢 Médio | ⚪ Baixo | 🟢 Médio | 🟢 Bom | 🔴 9 | Pequeno |
| 38 | Garantias ignora o filtro mandado pelos painéis ("vencem em 30 dias", "fora da garantia"). `Garantias.tsx:23,31` | 🟢 Médio | ⚪ Baixo | 🟢 Médio | 🟢 Bom | 🟡 4 | Pequeno |
| 39 | Clique duplo em outros botões: salvar cotação e criar envio (`FreteVenda.tsx:150,240`), ocorrência do envio (`EnvioForm.tsx:898`), mensagem ao contador (`Contador.tsx:303`), painel pessoal (`Pessoal.tsx:240,283`) | 🟢 Médio | ⚪ Baixo | 🟢 Médio | 🟢 Bom | 🟡 4 | Pequeno |
| 40 | "MF Máquinas" escrito direto em ~18 mensagens de WhatsApp (não segue o nome em Configurações → Empresa). `ClienteForm.tsx:680`, `Pedidos.tsx:796` e mais 12 | 🟢 Médio | ⚪ Baixo | ⚪ Baixo | 🟡 Marginal | 🔴 14 | Médio |
| 41 | Busca do menu não troca o destaque quando a pessoa já está em Clientes/Estoque/Fornecedores. `CrudPage.tsx:126` | 🟢 Médio | ⚪ Baixo | 🟢 Médio | 🟢 Bom | ⚪ 1 | Pequeno |
| 42 | Exceções da Auditoria "Pedido #N" / "OS #N" abrem a lista, não o registro. `lib/auditoria.ts:205,368-389`, `Auditoria.tsx:232` | 🟢 Médio | ⚪ Baixo | ⚪ Baixo | 🟢 Bom | 🟢 2 | Pequeno |
| 43 | Sobre → Sistemas e Esquemas: links e passos sem filtro de perfil (não admin cai em "Módulos"). `sobre/Sistemas.tsx:75,133`, `sobre/Guardanapo.tsx:169`, `Sobre.tsx:54` | 🟢 Médio | ⚪ Baixo | ⚪ Baixo | 🟡 Marginal | 🟡 3 | Pequeno |
| 44 | Alerta de margem do Painel das máquinas fixo em 15% (ignora a margem mínima das Metas). `paineis/PainelMaquinas.tsx:242` | 🟢 Médio | ⚪ Baixo | ⚪ Baixo | 🟢 Bom | ⚪ 1 | Pequeno |
| 45 | Margem por modelo e "Em risco/Inativo" escondidos no celular. `PainelMaquinas.tsx:242`, `Gerencial.tsx:148,153` | 🟢 Médio | ⚪ Baixo | ⚪ Baixo | 🟢 Bom | 🟢 2 | Pequeno |
| 46 | ✅ Botões da galeria do produto (foto principal, tirar) invisíveis em iPad e celular deitado. `produtos/GaleriaProduto.tsx:76` | 🟢 Médio | ⚪ Baixo | 🟢 Médio | 🟠 Excelente | ⚪ 1 | Trivial |
| 47 | ✅ Motivo da conta devolvida para correção só no tooltip (invisível no celular). `financeiro/AprovarPagar.tsx:83` | 🟢 Médio | ⚪ Baixo | 🟢 Médio | 🟠 Excelente | ⚪ 1 | Trivial |
| 48 | Aviso de estoque baixo sem ação no celular (o filtro "No mínimo" já existe). `Produtos.tsx:407` | 🟢 Médio | ⚪ Baixo | ⚪ Baixo | 🟢 Bom | ⚪ 1 | Pequeno |
| 49 | Escolha da loja no PDV escondida na tela inicial do celular. `Pdv.tsx:314` | 🟢 Médio | ⚪ Baixo | ⚪ Baixo | 🟢 Bom | ⚪ 1 | Trivial |
| 50 | ✅ Links de aba errada: certificados (só admin vê o Monitor), CT-e e faturas, clientes que sumiram. `Contabilidade.tsx:84`, `DeducoesFiscais.tsx:122`, `PainelCadastros.tsx:128` | ⚪ Baixo | ⚪ Baixo | ⚪ Baixo | 🟠 Excelente | 🟡 3 | Trivial |
| 51 | ✅ Avisos verdes/vermelhos sem `aria-live` (leitor de tela não anuncia). `Toaster.tsx:18` | ⚪ Baixo | ⚪ Baixo | ⚪ Baixo | 🟠 Excelente | ⚪ 1 | Trivial |
| 52 | Outras exclusões sem confirmação: categorias, tipos de contato, desconectar Telegram, tirar cotação do envio. `CategoriasProdutos.tsx:104`, `TiposContato.tsx:134`, `Avisos.tsx:113`, `EnvioForm.tsx:603` | ⚪ Baixo | ⚪ Baixo | ⚪ Baixo | 🟢 Bom | 🟡 4 | Trivial |
| 53 | Forma de pagamento só como ícone no celular; botões só com ícone abaixo de 1024px em Contas a pagar. `vendas/ColunasVenda.tsx:21`, `Financeiro.tsx:646` | ⚪ Baixo | ⚪ Baixo | ⚪ Baixo | 🟢 Bom | 🟢 2 | Trivial |
| 54 | Elementos com cara de clicáveis sem ação (valor de inadimplentes sublinhado, fatias do gráfico). `PainelFinanceiro.tsx:149`, `Charts.tsx:330` | ⚪ Baixo | ⚪ Baixo | ⚪ Baixo | 🟢 Bom | 🟢 2 | Trivial |
| 55 | Links genéricos: "esses clientes" (Analista fiscal), "NF-e com erro" (Contador), "sem categoria" (fechamento), conta da fatura de frete, OP #N, conta em Aprovações. `analistaFiscal.ts:413`, `Contador.tsx:112`, `fechamentoMes.ts:114`, `CteFaturas.tsx:92`, `PainelProducao.tsx:143`, `Aprovacoes.tsx:155` | ⚪ Baixo | ⚪ Baixo | ⚪ Baixo | 🟡 Marginal | 🔴 6 | Pequeno |
| 56 | Links internos sem conferir o perfil: Implantação → Usuários, Impostos → Funcionários, "Abrir" do Analista fiscal. `Implantacao.tsx:39,182`, `ImpostosTarifas.tsx:117`, `AnalistaFiscal.tsx:197` | ⚪ Baixo | ⚪ Baixo | ⚪ Baixo | 🟡 Marginal | 🟡 3 | Trivial |
| 57 | Cartões "Entrou/Saiu" mandam a aba para a Conciliação, que não lê. `paineis/PainelFinanceiroArea.tsx:160,163` | ⚪ Baixo | ⚪ Baixo | ⚪ Baixo | 🟡 Marginal | ⚪ 1 | Trivial |

Verificado e sem problema: nenhuma rota inexistente (0 de 103 caminhos), nenhum valor de `?aba=` fora da lista da tela, nenhum componente órfão (263 arquivos), "Abrir OS" do pedido lê todos os campos, nenhuma seleção sem destaque visual, nenhum dado de mentira fora do modo demonstração, quadro de contas a pagar com alternativa visível para o arrastar, PDFs com os dados da unidade.

💡 Para um plano de consertos em fases: `/plan --workflow-audit` (lê `.workflow-audit/handoff.yaml`)
💡 Reordenar: `--sort effort` (mais fáceis primeiro) · `--sort impact` (mais visíveis primeiro) · `--sort implement` (ordem de construção)
💡 Explicação de cada item: `--explain`
