// Textos da página Módulos: o que faz cada área do menu e cada tela. A chave da tela é o endereço dela no menu
// (src/lib/menu.ts); o teste avisa quando uma tela nova entra no menu sem texto aqui.

/** O que faz cada área do menu (pelo id do grupo em menu.ts). */
export const SOBRE_AREAS: Record<string, string> = {
  inicio: "O resumo do dia, a caixa de e-mail da empresa e os documentos (todos os anexos num lugar só).",
  vendas: "Do orçamento à venda: peças, máquinas, PDV, Mercado Livre, comissões e metas.",
  cadastros: "Pessoas e serviços usados em todas as áreas: painel dos clientes, clientes, técnicos parceiros, fornecedores e serviços.",
  logistica: "Depois da venda: fluxo dos pedidos, separação e embalagem, fretes, transportadoras e embalagens.",
  posvenda: "Ordens de serviço, garantias e preventivas das máquinas dos clientes.",
  producao: "Produtos e estoque das duas unidades, máquinas, produção, compras, teste do giga e transferências entre SC e SP.",
  financeiro: "Contas a pagar e a receber, aprovações, bancos e conciliação, gastos separados (combustível, marketplaces, impostos, tarifas, funcionários e quiosques) e o dinheiro entre contas e sócios.",
  notas: "Notas fiscais emitidas e recebidas, painel fiscal, painel do contador e analista fiscal.",
  analises: "Decisões e organização: painel gerencial, relatórios, margem, troca do Tiny e funcionários.",
};

/** Telas fora da lista do menu: por onde se chega nelas (além da busca do menu). */
export const ONDE_ABRE: Record<string, string> = {
  "/pdv": "Cartão rosa \"PDV\" no alto do menu (abre em outra aba)",
  "/painel/maquinas": "Botão \"Painel das máquinas\" na tela Máquinas",
  "/painel/produtos": "Botão \"Painel dos produtos\" em Produtos e estoque",
  "/produtos/pecas": "Cartão \"Peças de reposição\" em Produtos e estoque",
  "/produtos/componentes": "Cartão \"Componentes de produção\" em Produtos e estoque",
  "/formas-pagamento": "Engrenagem no fim do menu → Configurações",
  "/usuarios": "Engrenagem no fim do menu → Configurações",
  "/importar": "Engrenagem no fim do menu → Configurações",
  "/configuracoes": "Engrenagem no fim do menu",
  "/configuracoes/cadastros": "Engrenagem no fim do menu → Configurações",
};

/** O que faz cada tela (pelo endereço). */
export const SOBRE_TELAS: Record<string, string> = {
  "/": "Resumo do dia: vendas, contas da semana, avisos e atalhos para o que precisa de atenção.",
  "/email": "Caixa de e-mail da empresa dentro do ERP, para ler e enviar sem sair do sistema.",
  "/painel/vendas": "Indicadores de vendas por período, com comparação, funil, canal e vendedor; tocar num gráfico filtra o resto.",
  "/pedidos": "Orçamentos e pedidos de peças: se já foram pagos, forma de pagamento e de envio em ícone, rastreio, NF e foto do produto, com a situação do Tiny, período, soma no rodapé e ações em lote.",
  "/vendas-maquinas": "Propostas da MF e da My Frost e vendas de máquinas, ligadas ao pedido, à ordem de produção e à NF-e.",
  "/mercado-livre": "Conta do Mercado Livre ligada ao ERP: as vendas pagas entram sozinhas e o estoque e o preço do ERP vão para os anúncios.",
  "/comissoes": "Comissões de vendedores e representantes: % por vendedor, por categoria e por linha de produtos, calculadas item a item.",
  "/metas": "Metas de vendas por vendedor, estado e região, com projeção do mês e ranking.",
  "/tudo-do-cliente": "Busca pelo CNPJ, CPF ou nome, confirma quem é e junta numa página só tudo do cliente: vendas, propostas, notas, contas, extrato dos bancos, recibos, OS, máquinas e fretes.",
  "/clientes": "Cadastro dos clientes: o novo é passo a passo (Receita, contato, endereço, venda e revisão); o completo tem até 3 endereços, WhatsApp, máquinas compradas, técnico ligado e a Ficha 360°.",
  "/tecnicos": "Técnicos parceiros por cidade e região, para indicar a quem precisa de assistência.",
  "/fornecedores": "Fornecedores conferidos na Receita, com filiais, produtos que vendem, cotações e últimas compras.",
  "/produtos/servicos": "Serviços sem estoque (carga de gás, limpeza, troca de compressor…) usados nas OS e nas vendas.",
  "/fluxo": "Quadro dos pedidos aprovados até a entrega: NF-e, separação, despacho e entrega, com as ações no cartão.",
  "/expedicao": "Fila de separação e embalagem: conferir os itens, embalar, imprimir etiquetas e despachar.",
  "/fretes": "Cotação de frete padronizada, envios, comprovantes, conferência com as faturas e indicadores do mês.",
  "/rastreio": "As entregas na estrada: código de rastreio, link da transportadora, mandar ao cliente pelo WhatsApp e e-mail automático quando o código é preenchido.",
  "/transportadoras": "Transportadoras por marca, com filiais, contatos, site e API.",
  "/embalagens": "Caixas, engradados e paletes com medidas e peso, usados na cotação do frete.",
  "/painel/posvenda": "Indicadores da assistência: OS abertas, tempo de conserto, garantias e preventivas.",
  "/assistencia": "Ordens de serviço com a máquina e a garantia do cliente, peças e serviços, NFS-e e o aviso das máquinas vendidas pela My Frost.",
  "/garantias": "Garantias das máquinas vendidas e preventivas a fazer.",
  "/painel/producao": "Indicadores da fábrica: ordens de produção, peças faltando, estoque mínimo e compras.",
  "/estoque": "Produtos e estoque por unidade: NCM, EAN, custos, preços, kits, tabelas de preço, formação de preço e contagem. Em Qualidade, as correções sugeridas pelo ERP (NCM, custo, categoria, marca) para aplicar com um toque.",
  "/produtos/maquinas": "Máquinas fabricadas: ficha técnica em vários níveis, fotos e vídeos, manuais, garantia e custos.",
  "/teste-giga": "Registro de qualidade REG-006: teste de cada máquina na bancada, com histórico e reteste.",
  "/producao": "Ordens de produção planejadas, em produção, prontas e atrasadas, com as peças que faltam.",
  "/compras": "Pedidos de compra, cotações por e-mail com resposta online, necessidades de compra e reposição para SC ou SP.",
  "/transferencias": "Transferência de estoque entre a matriz (SC) e a filial (SP), com a NF-e de transferência.",
  "/painel/financeiro": "Quanto tem, quanto entra e quanto sai: saldos, contas da semana, inadimplência e despesas por categoria.",
  "/financeiro": "Contas a pagar e a receber, contas fixas, recibos, boletos, régua de cobrança, plano de contas e DRE.",
  "/aprovacoes": "Revisão das contas antes do contador (1ª e 2ª revisão e pendências); a conta a pagar só é paga depois de aprovada.",
  "/conciliacao": "Contas bancárias, extratos (OFX, e-mail, Open Finance, Banco Inter) e conciliação com as contas lançadas.",
  "/gastos": "Gastos acompanhados à parte, uma aba para cada: combustível por posto, compras no Mercado Livre, TikTok, Shopee e Amazon e tarifas de cartão, da Olist e dos bancos, de todas as contas. Impostos pagos ficam no Fiscal, pagamentos aos funcionários em Funcionários e quiosques em My Frost Sorveterias.",
  "/impostos-pagos": "Impostos pagos de todas as contas, por esfera (federal, estadual, municipal e veículos): total, mês a mês e a lista das guias, com exportação para o Excel.",
  "/partes-relacionadas": "Dinheiro entre as contas da MF, com os sócios e com as empresas ligadas, separado do resto.",
  "/auditoria": "Histórico de alterações, checklist do mês e exceções do financeiro.",
  "/painel/notas": "Indicadores fiscais: faturamento, impostos, CFOP, notas rejeitadas e as próximas obrigações do Lucro Real.",
  "/notas": "NF-e emitidas e recebidas: emitir (com ou sem pedido), entrada, transferência, devolução, carta de correção, XML e marcadores.",
  "/contador": "Situação do mês para o contador (pendências, conciliação dos bancos, fechamento e pacote de arquivos) e o calendário de obrigações do Lucro Real, com o que foi pago ou entregue.",
  "/analista-fiscal": "Auditoria fiscal, apuração estimada e estratégias legais para pagar menos imposto, para conferir com o contador.",
  "/parcelamentos": "Parcelamentos de impostos (Receita Federal, PGFN, SEFAZ SC e SP, prefeitura): parcelas pagas e a vencer, quem pagou cada uma com o comprovante, avisos antes do vencimento e risco de cancelar o parcelamento.",
  "/gerencial": "Painel para decidir: curva ABC, clientes parados, tendências, gargalos e metas.",
  "/automacoes": "Tudo o que o ERP faz sozinho, por área (financeiro, notas, vendas, cadastros, avisos, equipe e IA, sistema): quando roda, se está em dia e as próximas automações na fila.",
  "/relatorios": "Relatórios de faturamento, DRE e fluxo de caixa, com exportação.",
  "/margem": "Margem de contribuição por venda, canal, produto, vendedor, cliente e unidade.",
  "/implantacao": "Plano da troca do Tiny: etapas, prazos, responsáveis e o uso do ERP.",
  "/funcionarios": "Funcionários: dados pessoais, contrato, salário, documentos e ligação com o usuário do ERP.",
  "/documentos": "Todos os anexos (pedidos, OS, clientes, contas, produtos) num lugar só.",
  "/scrum": "Scrum de cada equipe (ERP Line, Produção, Assistência, Vendas e Financeiro): backlog na ordem de prioridade, sprints de 1 ou 2 semanas com objetivo, quadro A fazer → Fazendo → Revisão → Feito, daily com impedimentos, revisão e retrospectiva ao encerrar, e painel com burndown, velocidade e pontos por pessoa. As Ideias do Sobre o ERP Line viram itens do backlog do ERP Line. No item, o assistente preenche os campos, detalha a descrição, monta tarefas, critérios de aceite, cenários e casos de teste, mostra o que já existe parecido e resume os comentários.",
  "/pdv": "Venda de balcão em outra aba, sem o menu do ERP, só com as peças de reposição. Abre na tela de entrada colorida (relógio, data, caixa aberto, vendas de hoje, vendedor F9 e cliente F8); bipar o primeiro produto abre a venda: bipa ou digita o produto (com foto), escolhe o cliente (ou cadastra na hora) e o vendedor, e recebe em dinheiro com troco, Pix, cartão ou dividido. Desconto acima do limite pede a senha do administrador. Ao finalizar, a venda fica entregue, o estoque da loja baixa, a conta entra recebida e sai o comprovante de 80 mm; link InfinitePay e \"a prazo\" deixam a conta em aberto.",
  "/configuracoes": "Empresa e marca, unidades, recebimentos, NF-e, textos padrão, avisos, backup e as demais configurações.",
  "/importar": "Planilhas, XML, extratos e dados do Tiny e da My Frost, num lugar só.",
  "/usuarios": "Quem acessa o ERP: papel principal e adicionais (vendas, financeiro, técnico, contador, expedição, marketplaces, compras), unidade, função, contato e foto. Senha provisória com troca obrigatória no primeiro acesso, ligação com o cadastro de vendedor, o que cada papel pode fazer e o que cada perfil vê no menu.",
  "/formas-pagamento": "Formas de pagamento como no Tiny: nome, meio (Pix, boleto, cartão, dinheiro…), condição (parcelas, intervalo e 1º vencimento) e custo (taxa % e tarifa por parcela). As vendas e as contas fixas escolhem daqui, e a taxa entra na margem.",
  "/configuracoes/cadastros": "Categorias e marcadores coloridos de todos os cadastros.",
  "/painel/cadastros": "Clientes novos e sumidos e a qualidade dos cadastros.",
  "/painel/maquinas": "Como estão as máquinas: quantas vendemos e de quais modelos, quanto há pronto e em montagem (e para quantos meses dá no ritmo de venda), onde estão as vendidas, garantias a vencer, preventivas atrasadas e os modelos que mais voltam para a assistência. Tocar num modelo filtra o painel inteiro.",
  "/painel/produtos": "Produtos mais vendidos, curva ABC, parados, margem e o que vai faltar.",
  "/produtos/pecas": "Peças de reposição: o que o cliente compra. Vão para o catálogo, os pedidos, o PDV e os anúncios, com preço, estoque em SC e SP, foto, código do fabricante e NCM.",
  "/pessoal": "Painel pessoal do dono (só o administrador): contas pessoais de banco, cartão e investimento, gastos por tipo, extrato automático e o que mostrar ao contador, separados da empresa.",
  "/licenciados": "My Frost Sorveterias (só o administrador, pelo botão rosa no fim do menu): as unidades licenciadas com endereço, contrato e arquivos, máquinas com a data da compra, quanto custou montar e o que cada uma pagou, fora da MF e do contador.",
  "/produtos/componentes": "Componentes de produção: o que vai dentro das máquinas e não se vende avulso. Entram na ficha técnica, nas ordens de produção e nas necessidades de compra; a peça de reposição que também é usada na fábrica aparece com a etiqueta \"também vende\".",
};

/** Exemplo real que dá para abrir de dentro do ERP (o código do link vem do banco; aberto pela equipe não conta como visto). */
export type ExemploLink = "proposta" | "cliente" | "ficha" | "maquina" | "cotacao";

/** Páginas abertas por link, sem entrar no ERP (clientes, fornecedores e representantes). */
export const PAGINAS_POR_LINK: {
  caminho: string; nome: string; texto: string;
  /** quem recebe o link e quando */
  quem: string;
  /** onde a equipe gera ou manda o link (o caminho na tela) */
  onde: string;
  /** tela do ERP onde se gera o link */
  tela: string;
  /** página que abre direto (sem código) ou o tipo de exemplo real */
  abre?: string; exemplo?: ExemploLink;
}[] = [
  { caminho: "/proposta/…", nome: "Proposta comercial", texto: "O cliente vê a proposta com fotos, garantia e condições e aprova ou recusa (com o motivo). Ao aprovar, o pedido já fica aprovado no ERP.",
    quem: "O cliente, quando a proposta é enviada", onde: "Vendas → abrir o orçamento → Proposta comercial → Enviar por e-mail, Link no WhatsApp ou Copiar link", tela: "/pedidos", exemplo: "proposta" },
  { caminho: "/cliente/…", nome: "Página do cliente", texto: "Contas em aberto, Pix copia e cola e segunda via do boleto: o link que vai na régua de cobrança e nas mensagens de cobrança.",
    quem: "O cliente com conta a receber", onde: "Clientes → abrir o cliente → Ver como o cliente vê (ou a cobrança no Financeiro, que já leva o link)", tela: "/clientes", exemplo: "cliente" },
  { caminho: "/ficha/…", nome: "Ficha cadastral", texto: "O cliente confere os dados, corrige o que mudou e assina a ficha; o ERP guarda a assinatura com data, hora e o comprovante.",
    quem: "O cliente que precisa assinar ou atualizar o cadastro", onde: "Clientes → abrir o cliente → Assinatura da ficha → WhatsApp, E-mail ou Copiar", tela: "/clientes", exemplo: "ficha" },
  { caminho: "/maquina/…", nome: "Máquina do cliente", texto: "Manuais, dicas de manutenção, garantia e o botão para chamar a assistência, da máquina que o cliente comprou.",
    quem: "O dono da máquina, depois da venda", onde: "Clientes → abrir o cliente → Assistência → máquina → Copiar link (ou Máquinas → ficha do modelo)", tela: "/clientes", exemplo: "maquina" },
  { caminho: "/cotacao/…", nome: "Cotação do fornecedor", texto: "O fornecedor informa preço, prazo, frete e condições de cada item; a resposta cai na comparação da cotação no ERP.",
    quem: "O fornecedor convidado para cotar", onde: "Compras → Cotações → abrir a cotação → copiar o link de cada fornecedor", tela: "/compras", exemplo: "cotacao" },
  { caminho: "/loja", nome: "Vitrine de peças", texto: "Catálogo das peças com preço e foto, cadastro do cliente e carrinho (é o link dos produtos no catálogo do WhatsApp).",
    quem: "Qualquer pessoa", onde: "Configurações → Catálogo do WhatsApp e Google Shopping → Abrir a vitrine", tela: "/configuracoes/catalogo", abre: "/loja" },
  { caminho: "/portal", nome: "Portal do representante", texto: "O representante entra com o login dele e vê só os próprios pedidos, orçamentos, carteira de clientes e comissões.",
    quem: "O representante externo, com login próprio", onde: "Comissões → Vendedores e representantes → botão Portal no representante (cria o login dele; só ele entra no portal, o seu login abre o ERP)", tela: "/comissoes" },
];
