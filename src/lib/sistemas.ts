// Sobre → Sistemas: o ERP Line visto como sistemas (finance-os, analytics-os, ops-os, innovation-os) e a linguagem de
// comandos da empresa (ECL). Cada módulo diz se o ERP já tem, tem em parte ou ainda falta, e abre as telas onde está.
// Um sistema novo é só mais um item. Cada comando tem uma entrega clara e cada execução fica registrada em 6 etapas
// (entrada → diagnóstico → decisão → entrega → validação → próxima ação; ver src/lib/monitor.ts).

export type Situacao = "tem" | "parcial" | "falta";
export type Destino = { rotulo: string; to: string };
export type ModuloSistema = { nome: string; situacao: Situacao; texto: string; telas: Destino[] };
export type Sistema = { id: string; nome: string; texto: string; cor: string; modulos: ModuloSistema[] };

export const SITUACOES: { id: Situacao; nome: string; cor: string; ponto: string }[] = [
  { id: "tem", nome: "Já tem", cor: "bg-emerald-100 text-emerald-900 ring-emerald-300", ponto: "bg-emerald-500" },
  { id: "parcial", nome: "Em parte", cor: "bg-amber-100 text-amber-900 ring-amber-300", ponto: "bg-amber-500" },
  { id: "falta", nome: "Falta", cor: "bg-rose-100 text-rose-900 ring-rose-300", ponto: "bg-rose-500" },
];

export const SISTEMAS: Sistema[] = [
  {
    id: "finance-os", nome: "Sistema financeiro", cor: "from-[#f59e0b] to-[#b45309]",
    texto: "O dinheiro da empresa do começo ao fim: o que entra e sai, os bancos, a cobrança, os gastos separados, o resultado e o fechamento com o contador.",
    modulos: [
      { nome: "Contas a pagar e a receber", situacao: "tem", texto: "Uma situação por conta, aprovação antes de pagar, pagamento em lote, baixa parcial, contas fixas e recibos.",
        telas: [{ rotulo: "Contas", to: "/financeiro" }, { rotulo: "Aprovações", to: "/aprovacoes" }] },
      { nome: "Bancos e conciliação", situacao: "tem", texto: "Extratos por OFX, e-mail, Open Finance e Banco Inter, conciliados com as contas lançadas, com sugestões.",
        telas: [{ rotulo: "Bancos e conciliação", to: "/conciliacao" }] },
      { nome: "Fluxo de caixa", situacao: "tem", texto: "Saldo nos bancos, o que entrou e saiu e o que vai entrar e sair nos próximos dias.",
        telas: [{ rotulo: "Painel do financeiro", to: "/painel/financeiro" }, { rotulo: "Relatórios", to: "/relatorios" }] },
      { nome: "DRE e plano de contas", situacao: "tem", texto: "Resultado do mês pelos lançamentos e pelos extratos (sem contar duas vezes), plano de contas e centros de custo.",
        telas: [{ rotulo: "DRE", to: "/financeiro?aba=dre" }, { rotulo: "Plano de contas", to: "/financeiro?aba=plano" }] },
      { nome: "Cobrança", situacao: "parcial", texto: "Régua de cobrança pelo WhatsApp, Pix copia e cola e link de pagamento na venda. Falta emitir boleto pelo ERP.",
        telas: [{ rotulo: "Cobrança", to: "/financeiro?aba=cobranca" }, { rotulo: "Régua de cobrança", to: "/configuracoes/cobranca" }] },
      { nome: "Gastos separados", situacao: "tem", texto: "Combustível, marketplaces, impostos, tarifas, funcionários e quiosques, juntando todas as contas.",
        telas: [{ rotulo: "Gastos separados", to: "/gastos" }] },
      { nome: "Entre contas e sócios", situacao: "tem", texto: "Dinheiro entre as contas da MF, a sócia e as empresas ligadas, isolado do resultado.",
        telas: [{ rotulo: "Entre contas e sócios", to: "/partes-relacionadas" }] },
      { nome: "Auditoria e fechamento", situacao: "tem", texto: "Checklist do mês, exceções, histórico de alterações, mês travado e o pacote do contador.",
        telas: [{ rotulo: "Auditoria financeira", to: "/auditoria" }, { rotulo: "Painel do contador", to: "/contador" }] },
      { nome: "Impostos", situacao: "parcial", texto: "Analista fiscal (auditoria e economia legal), calendário do Lucro Real, guias pagas e parcelamentos com avisos de prazo e quem pagou. A apuração oficial continua com o contador.",
        telas: [{ rotulo: "Analista fiscal", to: "/analista-fiscal" }, { rotulo: "Parcelamentos", to: "/parcelamentos" }, { rotulo: "Impostos pagos", to: "/impostos-pagos" }] },
      { nome: "Comissões", situacao: "tem", texto: "Por vendedor, categoria e linha de produto, ligadas às vendas e ao financeiro.",
        telas: [{ rotulo: "Comissões", to: "/comissoes" }] },
      { nome: "Orçamento (previsto x realizado)", situacao: "falta", texto: "Quanto se planeja gastar por categoria e centro de custo, comparado com o realizado mês a mês.", telas: [] },
    ],
  },
  {
    id: "analytics-os", nome: "Sistema de inteligência", cor: "from-[#8b5cf6] to-[#5b21b6]",
    texto: "Os números da empresa viram decisão: indicadores, painéis, cruzamentos, previsões, alertas e análise feita pela IA.",
    modulos: [
      { nome: "KPIs", situacao: "tem", texto: "Indicadores no alto de cada painel (vendas, financeiro, fábrica, assistência, fiscal), comparados com o período anterior.",
        telas: [{ rotulo: "Vendas", to: "/painel/vendas" }, { rotulo: "Financeiro", to: "/painel/financeiro" }, { rotulo: "Fábrica", to: "/painel/producao" }, { rotulo: "Assistência", to: "/painel/posvenda" }] },
      { nome: "Dashboards", situacao: "tem", texto: "Um painel por área e o Painel gerencial para decidir. Tocar num número abre a lista por trás dele.",
        telas: [{ rotulo: "Painel gerencial", to: "/gerencial" }, { rotulo: "Máquinas", to: "/painel/maquinas" }, { rotulo: "Produtos", to: "/painel/produtos" }, { rotulo: "Clientes", to: "/painel/cadastros" }] },
      { nome: "BI", situacao: "parcial", texto: "Faturamento, DRE, fluxo de caixa e margem de contribuição por venda, canal, produto, vendedor, cliente e unidade, tudo em Excel. Falta o cruzamento livre (escolher linhas e colunas na tela).",
        telas: [{ rotulo: "Relatórios", to: "/relatorios" }, { rotulo: "Margem", to: "/margem" }] },
      { nome: "Previsões", situacao: "parcial", texto: "O que entra e sai nos próximos dias, necessidades de compra e para quantos dias dá o estoque de máquinas. Falta prever vendas e compras pela produção planejada.",
        telas: [{ rotulo: "Painel do financeiro", to: "/painel/financeiro" }, { rotulo: "Compras", to: "/compras" }, { rotulo: "Painel das máquinas", to: "/painel/maquinas" }] },
      { nome: "Alertas", situacao: "tem", texto: "Avisos entre usuários com urgência e som, notificações, pendências fiscais, exceções da auditoria e peça faltando para a produção.",
        telas: [{ rotulo: "Auditoria financeira", to: "/auditoria" }, { rotulo: "Painel fiscal", to: "/painel/notas" }] },
      { nome: "IA analítica", situacao: "parcial", texto: "Analista fiscal, correções sugeridas no cadastro de produtos e sugestões na conciliação. Falta perguntar em português (\"quanto vendi de pás em setembro?\") e receber a resposta.",
        telas: [{ rotulo: "Analista fiscal", to: "/analista-fiscal" }, { rotulo: "Correções de produtos", to: "/estoque?aba=qualidade" }] },
      { nome: "Benchmarking", situacao: "parcial", texto: "Comparação com o mês e o ano anterior, metas por vendedor e por região e ranking. Falta comparar com referências do setor.",
        telas: [{ rotulo: "Metas", to: "/metas" }, { rotulo: "Painel gerencial", to: "/gerencial" }] },
      { nome: "Tendências", situacao: "tem", texto: "Mês a mês, curva ABC, clientes parados, ritmo de venda de 90 dias por modelo e o que mais volta para a assistência.",
        telas: [{ rotulo: "Painel gerencial", to: "/gerencial" }, { rotulo: "Painel das máquinas", to: "/painel/maquinas" }] },
    ],
  },
];

/** capability-showcase: a vitrine do que o ERP Line já faz, para mostrar à equipe, a clientes e a parceiros. */
SISTEMAS.push({
  id: "capability-showcase", nome: "Vitrine de capacidades", cor: "from-[#0d9488] to-[#115e59]",
  texto: "O que o ERP Line já faz pela MF, do orçamento à nota, da fábrica à assistência, com o banco e o contador conectados.",
  modulos: [
    { nome: "Notas do Lucro Real nas duas unidades", situacao: "tem", texto: "NF-e de venda, transferência SC ↔ SP, entrada e devolução; NFS-e da assistência; Reforma Tributária (IBS/CBS) já no XML.",
      telas: [{ rotulo: "Notas fiscais", to: "/notas" }, { rotulo: "Painel fiscal", to: "/painel/notas" }] },
    { nome: "Banco que entra sozinho", situacao: "tem", texto: "Extratos pelo Open Finance, Banco Inter, InfinitePay e OFX por e-mail, conciliados com sugestões e baixa automática do Pix.",
      telas: [{ rotulo: "Bancos e conciliação", to: "/conciliacao" }] },
    { nome: "Do orçamento à entrega", situacao: "tem", texto: "Proposta aprovada pelo cliente online, pedido, nota automática, separação, embalagem, frete e rastreio num fluxo só.",
      telas: [{ rotulo: "Fluxo de pedidos", to: "/fluxo" }, { rotulo: "Venda de Peças", to: "/pedidos" }] },
    { nome: "Fábrica com ficha técnica", situacao: "tem", texto: "Ordens de produção, ficha técnica em vários níveis, custo pelas notas, peças que faltam e o teste do giga (REG-006).",
      telas: [{ rotulo: "Produção", to: "/producao" }, { rotulo: "Painel da fábrica", to: "/painel/producao" }] },
    { nome: "Assistência técnica", situacao: "tem", texto: "OS com a máquina e a garantia do cliente, NFS-e, técnicos parceiros por região e o histórico de consertos na ficha.",
      telas: [{ rotulo: "Ordens de serviço", to: "/assistencia" }, { rotulo: "Garantias", to: "/garantias" }] },
    { nome: "Venda em todo canal", situacao: "tem", texto: "Balcão (PDV), WhatsApp, loja, Mercado Livre com estoque e preço do ERP, feed do Google e representantes com portal.",
      telas: [{ rotulo: "PDV", to: "/pdv" }, { rotulo: "Mercado Livre", to: "/mercado-livre" }, { rotulo: "Comissões", to: "/comissoes" }] },
    { nome: "Cobrança automática", situacao: "tem", texto: "Régua de cobrança pelo WhatsApp oficial, Pix copia e cola, link de pagamento e página do cliente.",
      telas: [{ rotulo: "Cobrança", to: "/financeiro?aba=cobranca" }, { rotulo: "Régua de cobrança", to: "/configuracoes/cobranca" }] },
    { nome: "Analista fiscal com IA", situacao: "tem", texto: "Auditoria das notas, apuração estimada e estratégias legais para pagar menos imposto, para o contador validar.",
      telas: [{ rotulo: "Analista fiscal", to: "/analista-fiscal" }] },
    { nome: "Cadastro que se conserta", situacao: "tem", texto: "Clientes conferidos na Receita, repetidos unificados sem perder nada e correções sugeridas nos produtos (NCM, custo, categoria).",
      telas: [{ rotulo: "Clientes", to: "/clientes" }, { rotulo: "Correções de produtos", to: "/estoque?aba=qualidade" }] },
    { nome: "Painéis para decidir", situacao: "tem", texto: "Um painel por área, metas por vendedor e região, margem de contribuição e curva ABC; tocar num número abre a lista.",
      telas: [{ rotulo: "Painel gerencial", to: "/gerencial" }, { rotulo: "Margem", to: "/margem" }] },
    { nome: "Contador conectado", situacao: "tem", texto: "Fechamento do mês com o pacote do contador, calendário de obrigações do Lucro Real e mês travado depois de conferido.",
      telas: [{ rotulo: "Painel do contador", to: "/contador" }] },
    { nome: "Controle e segurança", situacao: "tem", texto: "Perfil por função, pagamento só depois da aprovação, histórico de toda alteração e auditoria financeira com checklist.",
      telas: [{ rotulo: "Aprovações", to: "/aprovacoes" }, { rotulo: "Auditoria financeira", to: "/auditoria" }] },
  ],
});

/** ops-os: o ERP cuidando de si mesmo — as rotinas que rodam sozinhas, quem confere se rodaram e o que avisa quando param. */
SISTEMAS.push({
  id: "ops-os", nome: "Monitoramento e automações", cor: "from-[#0ea5e9] to-[#0369a1]",
  texto: "As rotinas que rodam sozinhas (notas, bancos, e-mails, WhatsApp, Mercado Livre, Receita, backup), quem confere se rodaram e o aviso quando alguma para.",
  modulos: [
    { nome: "Automações agendadas", situacao: "tem", texto: "Notas de fornecedor, extratos, e-mails, WhatsApp, Mercado Livre, Receita, contas fixas, avisos e o pacote do contador rodam sozinhos.",
      telas: [{ rotulo: "Monitor", to: "/sobre?aba=monitor" }] },
    { nome: "Monitor de saúde", situacao: "tem", texto: "Cada automação com a última rodada, as falhas e o último erro; as respostas das funções; as filas que travam o trabalho; o backup.",
      telas: [{ rotulo: "Monitor", to: "/sobre?aba=monitor" }] },
    { nome: "Vigia com avisos", situacao: "tem", texto: "De hora em hora confere tudo e avisa o administrador no sino; backup parado é urgente e pede ciência; o mesmo aviso não se repete por 20 horas.",
      telas: [{ rotulo: "Monitor", to: "/sobre?aba=monitor" }] },
    { nome: "Registro das execuções", situacao: "tem", texto: "Cada comando fica anotado em 6 etapas: entrada, diagnóstico, decisão, entrega, validação e próxima ação.",
      telas: [{ rotulo: "Registro", to: "/sobre?aba=monitor" }] },
    { nome: "Backup diário", situacao: "parcial", texto: "Banco e arquivos com teste de restauração todo dia. A cópia só é guardada com a chave de criptografia e o acesso ao Supabase em dia nos secrets do GitHub.",
      telas: [{ rotulo: "Monitor: backup", to: "/sobre?aba=monitor" }, { rotulo: "Configurações", to: "/configuracoes" }] },
    { nome: "Prazos de chaves e certificados", situacao: "tem", texto: "Certificado digital, chave do Supabase no GitHub, domínio e certificado do Banco Inter com a data; o vigia avisa antes de vencer (urgente a 3 dias).",
      telas: [{ rotulo: "Monitor: chaves", to: "/sobre?aba=monitor" }] },
    { nome: "Nova tentativa sozinha", situacao: "falta", texto: "Tentar de novo o que falhou por instabilidade (e-mail, NF-e) e só chamar alguém se continuar falhando.", telas: [] },
  ],
});

/** innovation-os: como uma ideia vira coisa pronta no ERP, sem pular etapa. */
SISTEMAS.push({
  id: "innovation-os", nome: "Motor de inovação", cor: "from-[#ec4899] to-[#9d174d]",
  texto: "O caminho de uma ideia até virar tela no ERP: pesquisa, tendências, testes, MVP, validação, lançamento e melhoria.",
  modulos: [
    { nome: "Pesquisa", situacao: "tem", texto: "Ideias anotadas por todos, com impacto, esforço e votos; antes de construir, a regra (lei, Receita, SEFAZ) e o que o mercado usa.",
      telas: [{ rotulo: "Ideias", to: "/sobre?aba=ideias" }] },
    { nome: "Tendências", situacao: "tem", texto: "Mês a mês, curva ABC, clientes parados, ritmo de venda e o que mais volta para a assistência.",
      telas: [{ rotulo: "Painel gerencial", to: "/gerencial" }, { rotulo: "Painel das máquinas", to: "/painel/maquinas" }] },
    { nome: "Testes", situacao: "tem", texto: "Modo demonstração com dados de exemplo e centenas de testes automáticos rodando a cada mudança; nada vai ao ar sem passar.",
      telas: [{ rotulo: "Atualizações", to: "/sobre?aba=atualizacoes" }] },
    { nome: "MVP", situacao: "tem", texto: "Cada módulo nasce com o mínimo que resolve o problema e cresce com o uso (ex.: Parcelamentos, Monitor).",
      telas: [{ rotulo: "Módulos", to: "/sobre?aba=modulos" }] },
    { nome: "Validação", situacao: "parcial", texto: "A rodada mostra o pedido e o que virou, as suposições e os riscos. Falta medir o uso de cada tela depois do lançamento.",
      telas: [{ rotulo: "Rodada", to: "/sobre?aba=rodada" }] },
    { nome: "Lançamento", situacao: "tem", texto: "Vai ao ar só depois do \"pode publicar\", com a lista do que mudou em Atualizações.",
      telas: [{ rotulo: "Atualizações", to: "/sobre?aba=atualizacoes" }] },
    { nome: "Melhoria", situacao: "tem", texto: "IMPROVE e ANALYZE trazem melhorias com o motivo; o registro das execuções guarda a próxima ação de cada uma.",
      telas: [{ rotulo: "Registro das execuções", to: "/sobre?aba=monitor" }] },
  ],
});

/** ANALYZE: os 6 pontos de toda análise de um sistema existente. */
export const DIMENSOES_ANALISE: { id: string; nome: string; pergunta: string }[] = [
  { id: "gargalos", nome: "Gargalos", pergunta: "Onde o trabalho para ou se acumula (filas, aprovações, conciliação)?" },
  { id: "ux", nome: "UX", pergunta: "As telas são fáceis no computador e no celular? Algo sai da tela ou confunde?" },
  { id: "desempenho", nome: "Desempenho", pergunta: "Abre rápido? O que pesa no site e no banco?" },
  { id: "consistencia", nome: "Consistência", pergunta: "Os números batem entre telas? Nomes, cores e regras iguais em todo lugar?" },
  { id: "riscos", nome: "Riscos", pergunta: "O que pode parar, vazar ou dar multa (backup, segurança, prazos)?" },
  { id: "oportunidades", nome: "Oportunidades", pergunta: "O que dá mais resultado com menos esforço agora?" },
];

/** INNOVATE: as etapas do motor de inovação, em ordem. */
export const CICLO_INOVACAO: { id: string; nome: string; texto: string }[] = [
  { id: "pesquisa", nome: "Pesquisa", texto: "O problema, quem sofre com ele e a regra que vale." },
  { id: "tendencias", nome: "Tendências", texto: "O que os números e o mercado mostram." },
  { id: "testes", nome: "Testes", texto: "Experimentar com dados de exemplo antes de mexer no real." },
  { id: "mvp", nome: "MVP", texto: "O mínimo que resolve, no ar rápido." },
  { id: "validacao", nome: "Validação", texto: "Medir se resolveu, com o número antes e depois." },
  { id: "lancamento", nome: "Lançamento", texto: "Publicar com aprovação e contar o que mudou." },
  { id: "melhoria", nome: "Melhoria", texto: "Ajustar pelo uso e voltar ao começo." },
];

// ---------------------------------------------------------------------------------------------------------------------
// Enterprise Command Language (ECL): a linguagem de domínio (DSL) da empresa. Gramática: VERBO + alvo, com as palavras
// da MF (financeiro, fiscal, produtos…). O ERP mostra onde aquilo é feito.

export type ComandoEcl = {
  verbo: string; nome: string; texto: string;
  /** o que o comando entrega, sempre: o resultado que se pode cobrar */
  entrega: string;
  alvos: { alvo: string; palavras: string[]; destinos: Destino[] }[];
};

export const ECL: ComandoEcl[] = [
  {
    verbo: "AUDIT", nome: "Auditoria estruturada", texto: "Confere uma área com checklist e mostra o que está errado, por que importa e o que fazer.",
    entrega: "A lista do que está errado, cada item com por que importa, o valor em risco, o que fazer e quem faz.",
    alvos: [
      { alvo: "financeiro", palavras: ["financeiro", "financas", "contas", "bancos", "caixa"], destinos: [{ rotulo: "Auditoria financeira", to: "/auditoria" }, { rotulo: "Painel do contador", to: "/contador" }] },
      { alvo: "fiscal", palavras: ["fiscal", "impostos", "notas", "nf", "tributos"], destinos: [{ rotulo: "Analista fiscal", to: "/analista-fiscal" }, { rotulo: "Painel fiscal", to: "/painel/notas" }] },
      { alvo: "parcelamentos", palavras: ["parcelamentos", "parcelamento", "parcelas", "dividas", "pgfn", "refis"], destinos: [{ rotulo: "Parcelamentos de impostos", to: "/parcelamentos" }] },
      { alvo: "produtos", palavras: ["produtos", "cadastro", "estoque", "pecas"], destinos: [{ rotulo: "Qualidade do cadastro", to: "/estoque?aba=qualidade" }, { rotulo: "Marketplace e anúncios", to: "/estoque?aba=auditoria" }] },
      { alvo: "menu", palavras: ["menu", "telas", "erp", "sistema"], destinos: [{ rotulo: "Auditoria do menu", to: "/sobre?aba=esquemas" }] },
      { alvo: "estoque", palavras: ["estoque", "contagem", "saldo", "giro"], destinos: [{ rotulo: "Contagem de estoque", to: "/estoque?aba=contagem" }, { rotulo: "Giro de estoque", to: "/estoque/giro" }] },
      { alvo: "maquinas", palavras: ["maquinas", "maquina", "garantia", "preventiva", "serie"], destinos: [{ rotulo: "Garantias e preventivas", to: "/garantias" }, { rotulo: "Painel das máquinas", to: "/painel/maquinas" }] },
      { alvo: "licenciados", palavras: ["licenciados", "licenciadas", "lojas", "sorveterias", "yozzy"], destinos: [{ rotulo: "My Frost Sorveterias", to: "/licenciados" }, { rotulo: "Painel das licenças", to: "/painel/licencas" }] },
      { alvo: "pedidos", palavras: ["pedidos", "checklist", "parados", "pendentes"], destinos: [{ rotulo: "Pedidos ao ERP (checklist)", to: "/sobre?aba=pedidos" }, { rotulo: "Vendas", to: "/pedidos" }] },
    ],
  },
  {
    verbo: "VISUALIZE", nome: "Mostra em página visual", texto: "Abre a página que mostra o assunto de relance: etapas, números, cores e o que falta.",
    entrega: "A página visual aberta no assunto, pronta para mostrar à equipe.",
    alvos: [
      { alvo: "rodada", palavras: ["rodada", "plano", "trabalho", "pendencias"], destinos: [{ rotulo: "Rodada atual", to: "/sobre?aba=rodada" }] },
      { alvo: "sistemas", palavras: ["sistemas", "capacidades", "modulos", "erp"], destinos: [{ rotulo: "Sistemas e capacidades", to: "/sobre?aba=sistemas" }] },
      { alvo: "processos", palavras: ["processos", "menu", "esquemas", "fluxo"], destinos: [{ rotulo: "Esquemas", to: "/sobre?aba=esquemas" }] },
      { alvo: "financeiro", palavras: ["financeiro", "dinheiro", "caixa"], destinos: [{ rotulo: "Painel do financeiro", to: "/painel/financeiro" }] },
      { alvo: "producao", palavras: ["producao", "fabrica", "montagem", "op"], destinos: [{ rotulo: "Painel da produção", to: "/painel/producao" }] },
      { alvo: "licenciados", palavras: ["licenciados", "licenciadas", "lojas", "sorveterias"], destinos: [{ rotulo: "Painel das licenças", to: "/painel/licencas" }] },
      { alvo: "assistencia", palavras: ["assistencia", "os", "posvenda", "conserto"], destinos: [{ rotulo: "Painel da assistência", to: "/painel/posvenda" }] },
    ],
  },
  {
    verbo: "IMPROVE", nome: "Propõe melhorias", texto: "Traz sugestões prontas para aplicar ou anotar, com o motivo de cada uma.",
    entrega: "Sugestões prontas para aplicar ou anotar como ideia, cada uma com o motivo.",
    alvos: [
      { alvo: "produtos", palavras: ["produtos", "cadastro", "ncm", "custo", "pecas"], destinos: [{ rotulo: "Correções sugeridas", to: "/estoque?aba=qualidade" }] },
      { alvo: "impostos", palavras: ["impostos", "fiscal", "tributos", "economia"], destinos: [{ rotulo: "Estratégias do analista fiscal", to: "/analista-fiscal" }] },
      { alvo: "conciliacao", palavras: ["conciliacao", "bancos", "extrato"], destinos: [{ rotulo: "Sugestões da conciliação", to: "/conciliacao" }] },
      { alvo: "erp", palavras: ["erp", "telas", "menu", "sistema", "ideias"], destinos: [{ rotulo: "Ideias", to: "/sobre?aba=ideias" }] },
    ],
  },
  {
    verbo: "MONITOR", nome: "Monitoramento contínuo", texto: "Mostra se as automações rodaram na hora, se as funções responderam, as filas que travam o trabalho e o backup. O vigia confere sozinho de hora em hora.",
    entrega: "O semáforo de cada automação, fila e do backup, com o que parou e o que fazer; aviso urgente quando o backup para.",
    alvos: [
      { alvo: "automacoes", palavras: ["automacoes", "automacao", "rotinas", "agendador", "cron", "tudo", "sistema"], destinos: [{ rotulo: "Monitor", to: "/sobre?aba=monitor" }] },
      { alvo: "filas", palavras: ["filas", "fila", "pendencias", "travado"], destinos: [{ rotulo: "Painel gerencial: filas e o que está parado", to: "/gerencial" }] },
      { alvo: "backup", palavras: ["backup", "copia", "copias"], destinos: [{ rotulo: "Monitor: backup", to: "/sobre?aba=monitor" }, { rotulo: "Configurações do backup", to: "/configuracoes" }] },
      { alvo: "integracoes", palavras: ["integracoes", "bancos", "funcoes", "mercado", "sefaz", "email"], destinos: [{ rotulo: "Monitor: funções", to: "/sobre?aba=monitor" }, { rotulo: "Bancos e conciliação", to: "/conciliacao" }] },
      { alvo: "certificados", palavras: ["certificados", "certificado", "chaves", "calibracao", "vencimentos"], destinos: [{ rotulo: "Painel gerencial: chaves e certificados", to: "/gerencial" }] },
      { alvo: "notas", palavras: ["notas", "nfe", "nf", "rejeitadas", "sefaz"], destinos: [{ rotulo: "Notas fiscais", to: "/notas" }, { rotulo: "Painel gerencial: NF-e com erro", to: "/gerencial" }] },
    ],
  },
  {
    verbo: "ANALYZE", nome: "Analisa um sistema existente", texto: "Olha uma área inteira em 6 pontos: gargalos, UX, desempenho, consistência, riscos e oportunidades.",
    entrega: "A análise em 6 pontos com números, cada ponto com o que fazer, registrada no Monitor (entrada → diagnóstico → decisão → entrega → validação → próxima ação).",
    alvos: [
      { alvo: "erp", palavras: ["erp", "sistema", "tudo", "geral"], destinos: [{ rotulo: "Registro das execuções", to: "/sobre?aba=monitor" }, { rotulo: "Sistemas", to: "/sobre?aba=sistemas" }] },
      { alvo: "telas", palavras: ["telas", "ux", "menu", "uso"], destinos: [{ rotulo: "Auditoria do menu", to: "/sobre?aba=esquemas" }] },
      { alvo: "financeiro", palavras: ["financeiro", "bancos", "contas", "caixa"], destinos: [{ rotulo: "Auditoria financeira", to: "/auditoria" }, { rotulo: "Bancos e conciliação", to: "/conciliacao" }] },
      { alvo: "fiscal", palavras: ["fiscal", "impostos", "notas"], destinos: [{ rotulo: "Analista fiscal", to: "/analista-fiscal" }] },
      { alvo: "produtos", palavras: ["produtos", "cadastro", "estoque"], destinos: [{ rotulo: "Qualidade do cadastro", to: "/estoque?aba=qualidade" }] },
      { alvo: "vendas", palavras: ["vendas", "venda", "clientes", "abc"], destinos: [{ rotulo: "Painel de vendas", to: "/painel/vendas" }, { rotulo: "Painel gerencial", to: "/gerencial" }] },
      { alvo: "assistencia", palavras: ["assistencia", "os", "conserto", "garantia"], destinos: [{ rotulo: "Assistência", to: "/assistencia" }, { rotulo: "Painel da assistência", to: "/painel/posvenda" }] },
      { alvo: "compras", palavras: ["compras", "fornecedores", "oc"], destinos: [{ rotulo: "Compras", to: "/compras" }, { rotulo: "Avaliação de fornecedores", to: "/fornecedores/avaliacao" }] },
    ],
  },
  {
    verbo: "INNOVATE", nome: "Motor de inovação", texto: "Leva uma ideia pelo ciclo: pesquisa, tendências, testes, MVP, validação, lançamento e melhoria.",
    entrega: "A ideia no ciclo com a etapa atual, o MVP (o mínimo que resolve) e como medir se deu certo.",
    alvos: [
      { alvo: "ideias", palavras: ["ideias", "ideia", "pesquisa"], destinos: [{ rotulo: "Ideias", to: "/sobre?aba=ideias" }] },
      { alvo: "tendencias", palavras: ["tendencias", "mercado", "numeros"], destinos: [{ rotulo: "Painel gerencial", to: "/gerencial" }] },
      { alvo: "lancamentos", palavras: ["lancamentos", "lancamento", "versoes", "mvp"], destinos: [{ rotulo: "Atualizações", to: "/sobre?aba=atualizacoes" }, { rotulo: "Rodada", to: "/sobre?aba=rodada" }] },
    ],
  },
  {
    verbo: "TRACE", nome: "Rastreia um item", texto: "Segue uma máquina pelo nº de série, um pedido, uma nota ou um cliente: de onde veio, para quem foi e tudo o que aconteceu com ele.",
    entrega: "O item achado com quem comprou, a nota, a garantia, as preventivas e as OS, cada um com o link para abrir.",
    alvos: [
      { alvo: "maquina", palavras: ["maquina", "serie", "equipamento"], destinos: [{ rotulo: "Garantias e preventivas", to: "/garantias" }, { rotulo: "Teste do giga", to: "/teste-giga" }, { rotulo: "Assistência", to: "/assistencia" }] },
      { alvo: "pedido", palavras: ["pedido", "venda", "proposta"], destinos: [{ rotulo: "Vendas", to: "/pedidos" }] },
      { alvo: "nota", palavras: ["nota", "nf", "nfe"], destinos: [{ rotulo: "Notas fiscais", to: "/notas" }] },
      { alvo: "cliente", palavras: ["cliente"], destinos: [{ rotulo: "Clientes", to: "/clientes" }, { rotulo: "Tudo do cliente", to: "/tudo-do-cliente" }] },
    ],
  },
  {
    verbo: "CHECK", nome: "Confere o que vence", texto: "Mostra o que vence nos próximos 30 dias e de quem é: preventivas, garantias e certificados.",
    entrega: "A lista do que vence em 30 dias, com o dono de cada item e o que fazer.",
    alvos: [
      { alvo: "preventivas", palavras: ["preventivas", "preventiva", "manutencao"], destinos: [{ rotulo: "Garantias e preventivas", to: "/garantias" }, { rotulo: "Painel da assistência", to: "/painel/posvenda" }] },
      { alvo: "garantias", palavras: ["garantias", "garantia"], destinos: [{ rotulo: "Garantias e preventivas", to: "/garantias" }] },
      { alvo: "certificados", palavras: ["certificados", "certificado", "chaves", "calibracao"], destinos: [{ rotulo: "Painel gerencial: chaves e certificados", to: "/gerencial" }, { rotulo: "Calibração do giga", to: "/teste-giga" }] },
    ],
  },
  {
    verbo: "FORECAST", nome: "Previsão", texto: "Olha para a frente: o caixa das próximas semanas, o que vai faltar no estoque e a tendência das vendas.",
    entrega: "A previsão com o número de hoje, o esperado e o ponto de atenção (quando o caixa aperta, o que acaba primeiro).",
    alvos: [
      { alvo: "caixa", palavras: ["caixa", "fluxo", "dinheiro", "saldo"], destinos: [{ rotulo: "Fluxo de caixa", to: "/fluxo" }] },
      { alvo: "estoque", palavras: ["estoque", "falta", "compras", "giro"], destinos: [{ rotulo: "Giro de estoque", to: "/estoque/giro" }, { rotulo: "Compras", to: "/compras" }] },
      { alvo: "vendas", palavras: ["vendas", "venda", "metas", "tendencia"], destinos: [{ rotulo: "Painel gerencial", to: "/gerencial?aba=tendencias" }, { rotulo: "Metas", to: "/metas" }] },
    ],
  },
  {
    verbo: "RECONCILE", nome: "Concilia", texto: "Mostra o que falta ligar entre o banco, o cartão e o marketplace e o que está no ERP.",
    entrega: "Os lançamentos sem ligação, com a sugestão de conta, pedido ou nota para cada um.",
    alvos: [
      { alvo: "bancos", palavras: ["bancos", "banco", "extrato", "pix"], destinos: [{ rotulo: "Bancos e conciliação", to: "/conciliacao" }] },
      { alvo: "cartao", palavras: ["cartao", "infinitepay", "maquininha", "taxas"], destinos: [{ rotulo: "Bancos e conciliação", to: "/conciliacao" }, { rotulo: "Impostos e tarifas", to: "/impostos-tarifas" }] },
      { alvo: "marketplace", palavras: ["marketplace", "mercado", "livre", "ml", "olist"], destinos: [{ rotulo: "Mercado Livre", to: "/mercado-livre" }, { rotulo: "Margem por venda", to: "/margem" }] },
    ],
  },
  {
    verbo: "COMPARE", nome: "Compara", texto: "Põe lado a lado: SC × SP, este mês × o passado, este ano × o anterior.",
    entrega: "Os números lado a lado, com quanto subiu ou caiu e o motivo mais provável.",
    alvos: [
      { alvo: "unidades", palavras: ["unidades", "unidade", "sc", "sp", "filial", "matriz"], destinos: [{ rotulo: "Painel gerencial (escolha a unidade no alto do menu)", to: "/gerencial" }, { rotulo: "Painel do financeiro", to: "/painel/financeiro" }] },
      { alvo: "mes", palavras: ["mes", "mensal"], destinos: [{ rotulo: "Painel gerencial", to: "/gerencial" }] },
      { alvo: "ano", palavras: ["ano", "anual"], destinos: [{ rotulo: "Painel gerencial", to: "/gerencial" }] },
    ],
  },
  {
    verbo: "PLAN", nome: "Planeja", texto: "Monta o que comprar e o que produzir pela necessidade da produção e das vendas.",
    entrega: "A lista do que comprar (com fornecedor e prazo) ou do que produzir (com as peças que faltam).",
    alvos: [
      { alvo: "compras", palavras: ["compras", "comprar", "pecas", "fornecedores"], destinos: [{ rotulo: "Compras", to: "/compras" }] },
      { alvo: "producao", palavras: ["producao", "produzir", "montagem", "op", "fabrica"], destinos: [{ rotulo: "Produção", to: "/producao" }, { rotulo: "Painel da produção", to: "/painel/producao" }] },
    ],
  },
  {
    verbo: "CLEAN", nome: "Limpa cadastros", texto: "Acha cadastros repetidos, CNPJ errado ou vencido na Receita e o que falta preencher.",
    entrega: "Os cadastros para unificar, corrigir ou completar, com o botão de cada correção.",
    alvos: [
      { alvo: "clientes", palavras: ["clientes", "cliente"], destinos: [{ rotulo: "Clientes", to: "/clientes" }, { rotulo: "Painel dos cadastros", to: "/painel/cadastros" }] },
      { alvo: "produtos", palavras: ["produtos", "produto", "pecas", "ncm"], destinos: [{ rotulo: "Qualidade do cadastro", to: "/estoque?aba=qualidade" }] },
      { alvo: "fornecedores", palavras: ["fornecedores", "fornecedor"], destinos: [{ rotulo: "Fornecedores", to: "/fornecedores" }, { rotulo: "Painel dos cadastros", to: "/painel/cadastros" }] },
    ],
  },
  {
    verbo: "REPORT", nome: "Relatório pronto", texto: "Junta o resumo para mandar: ao contador, aos sócios ou o da semana.",
    entrega: "O resumo pronto para enviar, com os números e o que precisa de decisão.",
    alvos: [
      { alvo: "contador", palavras: ["contador", "contabilidade", "fechamento"], destinos: [{ rotulo: "Painel do contador", to: "/contador" }] },
      { alvo: "socios", palavras: ["socios", "socio", "diretoria", "gestao"], destinos: [{ rotulo: "Painel gerencial", to: "/gerencial" }, { rotulo: "Painel do financeiro", to: "/painel/financeiro" }] },
      { alvo: "semana", palavras: ["semana", "semanal", "resumo"], destinos: [{ rotulo: "Relatórios", to: "/relatorios" }, { rotulo: "Painel gerencial", to: "/gerencial" }] },
    ],
  },
];

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export type Interpretacao =
  /** argumento: o que vem depois do alvo (ex.: o nº de série em "TRACE maquina 050626366-01") */
  | { ok: true; comando: ComandoEcl; alvo: string | null; destinos: Destino[]; argumento?: string }
  | { ok: false; motivo: string };

/** O texto digitado a partir da palavra n (mantém maiúsculas e acentos do nº de série ou do nome). */
const textoOriginal = (texto: string, n: number) => texto.trim().split(/\s+/).slice(n).join(" ");

/** Lê "AUDIT financeiro" (ou "audit", "improve produtos"…): sem alvo, devolve todos os destinos do verbo. */
export function interpretarEcl(texto: string): Interpretacao {
  const [verbo = "", ...resto] = sem(texto).split(/\s+/).filter(Boolean);
  if (!verbo) return { ok: false, motivo: "Digite um comando, por exemplo: AUDIT financeiro" };
  const comando = ECL.find((c) => c.verbo.toLowerCase() === verbo);
  if (!comando) return { ok: false, motivo: `Comando "${verbo.toUpperCase()}" não existe. Use ${ECL.map((c) => c.verbo).join(" ou ")}.` };
  const alvoTexto = resto.join(" ");
  if (!alvoTexto) return { ok: true, comando, alvo: null, destinos: comando.alvos.flatMap((a) => a.destinos) };
  const alvo = comando.alvos.find((a) => sem(a.alvo) === resto[0])
    ?? comando.alvos.find((a) => a.palavras.some((p) => resto[0] === p))
    ?? comando.alvos.find((a) => a.palavras.some((p) => alvoTexto.includes(p)));
  // TRACE sem alvo conhecido ("TRACE 554", "TRACE padaria"): procura o texto em tudo
  if (!alvo && comando.verbo === "TRACE") return { ok: true, comando, alvo: null, destinos: comando.alvos.flatMap((a) => a.destinos), argumento: textoOriginal(texto, 1) };
  if (!alvo) return { ok: false, motivo: `${comando.verbo} funciona com: ${comando.alvos.map((a) => a.alvo).join(", ")}.` };
  const argumento = sem(alvo.alvo) === resto[0] || alvo.palavras.includes(resto[0] ?? "") ? textoOriginal(texto, 2) : "";
  return { ok: true, comando, alvo: alvo.alvo, destinos: alvo.destinos, ...(argumento ? { argumento } : {}) };
}
