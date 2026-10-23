// Esquemas dos processos (Sobre o ERP Line → Esquema): cada processo em poucos passos, quem faz e a tela do ERP
// onde acontece. Viram um desenho simples, com cara de rascunho em guardanapo, para explicar à equipe.

export type Quem = "vendas" | "cliente" | "fiscal" | "expedicao" | "logistica" | "financeiro" | "contador" | "compras" | "estoque"
  | "diretoria" | "assistencia" | "tecnico" | "sistema" | "todos" | "claude";
export type Passo = { titulo: string; quem: Quem; tela?: string; nota?: string };
export type Area = "vendas" | "financeiro" | "fiscal" | "producao" | "assistencia" | "erp" | "retaguarda";
/** restrito: "admin" só aparece para o administrador; "master" só para a conta master (a dona). */
export type Processo = { id: string; area: Area; nome: string; resumo: string; passos: Passo[]; restrito?: "admin" | "master" };

/** Áreas dos esquemas, na ordem da tela. */
export const AREAS_ESQUEMA: { id: Area; nome: string }[] = [
  { id: "vendas", nome: "Vendas" }, { id: "financeiro", nome: "Financeiro" }, { id: "fiscal", nome: "Fiscal" },
  { id: "producao", nome: "Compras e produção" }, { id: "assistencia", nome: "Assistência" }, { id: "erp", nome: "O ERP e a equipe" },
  { id: "retaguarda", nome: "Retaguarda (só a dona)" },
];

export const ROTULO_QUEM: Record<Quem, string> = {
  vendas: "Vendas", cliente: "Cliente", fiscal: "Fiscal", expedicao: "Expedição", logistica: "Logística", financeiro: "Financeiro",
  contador: "Contador", compras: "Compras", estoque: "Estoque", diretoria: "Diretoria", assistencia: "Assistência", tecnico: "Técnico",
  sistema: "O ERP sozinho", todos: "Todos", claude: "Claude",
};
/** Cor de marca-texto de cada um (o desenho fica sempre em papel claro). */
export const COR_QUEM: Record<Quem, string> = {
  vendas: "#10b981", cliente: "#8b5cf6", fiscal: "#0ea5e9", expedicao: "#a855f7", logistica: "#6366f1", financeiro: "#f59e0b",
  contador: "#0891b2", compras: "#f97316", estoque: "#ea580c", diretoria: "#e11d48", assistencia: "#14b8a6", tecnico: "#0d9488",
  sistema: "#64748b", todos: "#64748b", claude: "#d97706",
};

export const PROCESSOS: Processo[] = [
  {
    id: "venda", area: "vendas", nome: "Venda do começo ao fim", resumo: "Do orçamento ao dinheiro conciliado e ao mês fechado com o contador.",
    passos: [
      { titulo: "Orçamento", quem: "vendas", tela: "/pedidos", nota: "pelo WhatsApp ou proposta" },
      { titulo: "Cliente aprova", quem: "cliente", nota: "pelo link da proposta" },
      { titulo: "Venda aprovada", quem: "vendas", tela: "/pedidos", nota: "Pix, boleto, cartão ou link" },
      { titulo: "NF-e emitida", quem: "fiscal", tela: "/notas", nota: "com o valor da venda" },
      { titulo: "Separar e embalar", quem: "expedicao", tela: "/expedicao" },
      { titulo: "Envio e rastreio", quem: "logistica", tela: "/fretes" },
      { titulo: "Entregue", quem: "logistica", tela: "/fluxo" },
      { titulo: "Pagamento recebido", quem: "financeiro", tela: "/financeiro", nota: "conta a receber baixada" },
      { titulo: "Conciliado no banco", quem: "financeiro", tela: "/conciliacao" },
      { titulo: "Mês fechado", quem: "contador", tela: "/contador" },
    ],
  },
  {
    id: "compra", area: "producao", nome: "Compra de peças e insumos", resumo: "Da falta no estoque ao pagamento aprovado e conciliado.",
    passos: [
      { titulo: "Falta no estoque", quem: "sistema", tela: "/compras", nota: "necessidades de compra" },
      { titulo: "Cotação", quem: "compras", tela: "/compras", nota: "resposta pelo link" },
      { titulo: "Pedido de compra", quem: "compras", tela: "/compras" },
      { titulo: "NF do fornecedor chega", quem: "fiscal", tela: "/notas", nota: "busca automática" },
      { titulo: "Entrada no estoque", quem: "estoque", tela: "/estoque" },
      { titulo: "Conta a pagar", quem: "financeiro", tela: "/financeiro" },
      { titulo: "Aprovação", quem: "diretoria", tela: "/aprovacoes" },
      { titulo: "Pagamento", quem: "financeiro", tela: "/financeiro" },
      { titulo: "Conciliado no banco", quem: "financeiro", tela: "/conciliacao" },
    ],
  },
  {
    id: "assistencia", area: "assistencia", nome: "Máquina na assistência", resumo: "Do chamado do cliente à máquina de volta e à próxima preventiva.",
    passos: [
      { titulo: "Cliente chama", quem: "cliente", nota: "WhatsApp ou página da máquina" },
      { titulo: "Abrir a OS", quem: "assistencia", tela: "/assistencia", nota: "garantia conferida" },
      { titulo: "Diagnóstico", quem: "tecnico", tela: "/assistencia" },
      { titulo: "Orçamento aprovado", quem: "cliente", nota: "fora da garantia" },
      { titulo: "Conserto e peças", quem: "tecnico", tela: "/assistencia" },
      { titulo: "NFS-e e cobrança", quem: "financeiro", tela: "/assistencia" },
      { titulo: "Máquina volta", quem: "logistica", tela: "/fretes", nota: "NF de retorno" },
      { titulo: "Próxima preventiva", quem: "assistencia", tela: "/garantias" },
    ],
  },
  {
    id: "proposta", area: "vendas", nome: "Proposta pelo link", resumo: "O cliente recebe a proposta, abre, aprova e o pedido já fica aprovado no ERP.",
    passos: [
      { titulo: "Orçamento pronto", quem: "vendas", tela: "/pedidos", nota: "itens, frete e pagamento" },
      { titulo: "Enviar a proposta", quem: "vendas", tela: "/pedidos", nota: "WhatsApp ou e-mail" },
      { titulo: "Cliente abre o link", quem: "cliente", nota: "vendas recebe o aviso" },
      { titulo: "Aprova ou recusa", quem: "cliente", nota: "recusa pede o motivo" },
      { titulo: "Pedido aprovado", quem: "sistema", tela: "/pedidos", nota: "sem digitar de novo" },
      { titulo: "Link de pagamento", quem: "sistema", tela: "/pedidos", nota: "Pix ou cartão" },
    ],
  },
  {
    id: "venda-maquina", area: "vendas", nome: "Venda de máquina", resumo: "Da proposta da máquina à máquina funcionando no cliente, com garantia e preventiva contadas.",
    passos: [
      { titulo: "Proposta da máquina", quem: "vendas", tela: "/vendas-maquinas" },
      { titulo: "Venda aprovada", quem: "cliente", nota: "pelo link ou na conversa" },
      { titulo: "Ordem de produção", quem: "sistema", tela: "/producao", nota: "se não houver pronta" },
      { titulo: "Montagem", quem: "tecnico", tela: "/producao", nota: "etapas e peças" },
      { titulo: "Teste do giga", quem: "tecnico", tela: "/teste-giga", nota: "aprovada para sair" },
      { titulo: "NF-e emitida", quem: "fiscal", tela: "/notas" },
      { titulo: "Entrega e instalação", quem: "logistica", tela: "/fretes" },
      { titulo: "Máquina na ficha", quem: "sistema", tela: "/clientes", nota: "garantia e preventiva" },
      { titulo: "Página da máquina", quem: "assistencia", nota: "manuais pelo WhatsApp" },
    ],
  },
  {
    id: "nf-outra", area: "vendas", nome: "Venda com NF de outra empresa", resumo: "Quando a unidade não tinha como emitir e a empresa ligada emitiu a nota da venda.",
    passos: [
      { titulo: "Venda aprovada", quem: "vendas", tela: "/pedidos" },
      { titulo: "Outra empresa emite", quem: "fiscal", nota: "a nota sai fora do ERP" },
      { titulo: "NF de outra empresa", quem: "vendas", tela: "/pedidos", nota: "colar a chave no pedido" },
      { titulo: "Pedido entregue", quem: "sistema", tela: "/pedidos", nota: "sai de \"falta a nota\"" },
      { titulo: "Máquina na ficha", quem: "sistema", tela: "/clientes", nota: "garantia pela data da NF" },
      { titulo: "Conferir com o contador", quem: "contador", tela: "/analista-fiscal", nota: "acerto entre empresas" },
    ],
  },
  {
    id: "mercado-livre", area: "vendas", nome: "Venda no Mercado Livre", resumo: "A venda paga entra sozinha, a nota e o rastreio voltam para o Mercado Livre e o dinheiro é conciliado.",
    passos: [
      { titulo: "Cliente compra", quem: "cliente", nota: "no anúncio do ML" },
      { titulo: "Venda entra no ERP", quem: "sistema", tela: "/mercado-livre", nota: "cliente e itens prontos" },
      { titulo: "NF-e emitida", quem: "fiscal", tela: "/notas" },
      { titulo: "NF vai para o ML", quem: "sistema", tela: "/mercado-livre", nota: "sozinha, a cada 10 min" },
      { titulo: "Separar e etiquetar", quem: "expedicao", tela: "/expedicao" },
      { titulo: "Rastreio", quem: "sistema", tela: "/mercado-livre" },
      { titulo: "Dinheiro liberado", quem: "financeiro", tela: "/financeiro", nota: "Mercado Pago" },
      { titulo: "Conciliado no banco", quem: "financeiro", tela: "/conciliacao" },
    ],
  },
  {
    id: "pdv", area: "vendas", nome: "Venda de balcão (PDV)", resumo: "O cliente chega na loja, compra a peça e sai com o comprovante.",
    passos: [
      { titulo: "Abrir o PDV", quem: "vendas", tela: "/pdv", nota: "em outra aba" },
      { titulo: "Buscar a peça", quem: "vendas", tela: "/pdv", nota: "nome, código ou leitor" },
      { titulo: "Cliente e desconto", quem: "vendas", tela: "/pdv", nota: "acima da regra: senha" },
      { titulo: "Receber", quem: "vendas", tela: "/pdv", nota: "Pix, cartão ou dinheiro" },
      { titulo: "Estoque baixa", quem: "sistema", tela: "/estoque" },
      { titulo: "Nota e comprovante", quem: "fiscal", tela: "/notas" },
    ],
  },
  {
    id: "cobranca", area: "financeiro", nome: "Cobrança sem esquecer ninguém", resumo: "Da conta a receber ao dinheiro no banco, com lembretes automáticos.",
    passos: [
      { titulo: "Conta a receber", quem: "sistema", tela: "/financeiro", nota: "nasce da venda" },
      { titulo: "Lembrete antes", quem: "sistema", tela: "/configuracoes", nota: "régua pelo WhatsApp" },
      { titulo: "Página do cliente", quem: "cliente", nota: "Pix e 2ª via no link" },
      { titulo: "Cliente paga", quem: "cliente" },
      { titulo: "Baixa automática", quem: "sistema", tela: "/financeiro", nota: "InfinitePay ou Inter" },
      { titulo: "Atrasou? Cobrar", quem: "financeiro", tela: "/financeiro", nota: "mensagem pronta" },
      { titulo: "Conciliado no banco", quem: "financeiro", tela: "/conciliacao" },
    ],
  },
  {
    id: "pagar", area: "financeiro", nome: "Conta a pagar", resumo: "Do boleto ou da nota do fornecedor ao pagamento aprovado e conferido no extrato.",
    passos: [
      { titulo: "Boleto ou NF chega", quem: "financeiro", tela: "/financeiro", nota: "ou a busca automática" },
      { titulo: "Conta a pagar", quem: "financeiro", tela: "/financeiro", nota: "categoria e vencimento" },
      { titulo: "Aprovação", quem: "diretoria", tela: "/aprovacoes", nota: "sem ok, não paga" },
      { titulo: "Pagar ou agendar", quem: "financeiro", tela: "/financeiro", nota: "em lote, se quiser" },
      { titulo: "Comprovante anexado", quem: "financeiro", tela: "/financeiro" },
      { titulo: "Conciliado no banco", quem: "financeiro", tela: "/conciliacao" },
    ],
  },
  {
    id: "conciliacao", area: "financeiro", nome: "Extrato conciliado", resumo: "Cada linha do banco ligada à sua conta, para o saldo do ERP bater com o do banco.",
    passos: [
      { titulo: "Extrato entra", quem: "sistema", tela: "/conciliacao", nota: "banco, OFX ou e-mail" },
      { titulo: "ERP sugere", quem: "sistema", tela: "/conciliacao", nota: "conta, venda ou regra" },
      { titulo: "Aprovar em lote", quem: "financeiro", tela: "/conciliacao" },
      { titulo: "Resolver os que sobram", quem: "financeiro", tela: "/conciliacao", nota: "divergentes" },
      { titulo: "Saldo bate", quem: "financeiro", tela: "/conciliacao" },
      { titulo: "Pronto para o contador", quem: "contador", tela: "/contador" },
    ],
  },
  {
    id: "fechamento", area: "financeiro", nome: "Fechamento do mês", resumo: "O que precisa estar certo para o contador fechar o mês sem pedir nada de volta.",
    passos: [
      { titulo: "Bancos conciliados", quem: "financeiro", tela: "/conciliacao" },
      { titulo: "Notas conferidas", quem: "fiscal", tela: "/notas", nota: "emitidas e recebidas" },
      { titulo: "Pendências zeradas", quem: "financeiro", tela: "/auditoria" },
      { titulo: "Pacote do mês", quem: "sistema", tela: "/contador", nota: "XML e planilhas" },
      { titulo: "Contador confere", quem: "contador", tela: "/contador" },
      { titulo: "Mês travado", quem: "contador", tela: "/contador", nota: "ninguém muda depois" },
    ],
  },
  {
    id: "imposto-nota", area: "fiscal", nome: "Como a nota pega o imposto", resumo: "De onde vêm o CST, a alíquota e a redução de cada item da NF-e.",
    passos: [
      { titulo: "Item na venda", quem: "vendas", tela: "/pedidos", nota: "NCM e origem do cadastro" },
      { titulo: "Padrão da unidade", quem: "sistema", tela: "/notas", nota: "Configurações da NF-e" },
      { titulo: "1ª regra que combina", quem: "sistema", tela: "/notas", nota: "Regras de tributação" },
      { titulo: "Conferência", quem: "sistema", tela: "/notas", nota: "antes de emitir" },
      { titulo: "SEFAZ autoriza", quem: "fiscal", tela: "/notas", nota: "pela Focus" },
      { titulo: "Analista fiscal", quem: "contador", tela: "/analista-fiscal", nota: "confere e avisa" },
    ],
  },
  {
    id: "nf-fornecedor", area: "fiscal", nome: "Nota do fornecedor", resumo: "A nota de compra chega sozinha, entra no estoque com o custo certo e vira conta a pagar.",
    passos: [
      { titulo: "SEFAZ avisa", quem: "sistema", tela: "/notas", nota: "busca automática" },
      { titulo: "Conferir os itens", quem: "compras", tela: "/notas", nota: "com o pedido de compra" },
      { titulo: "Entrada no estoque", quem: "estoque", tela: "/estoque", nota: "custo atualizado" },
      { titulo: "Conta a pagar", quem: "financeiro", tela: "/financeiro", nota: "parcelas da nota" },
      { titulo: "Crédito de impostos", quem: "contador", tela: "/analista-fiscal", nota: "ICMS, IPI, PIS/COFINS" },
    ],
  },
  {
    id: "transferencia", area: "fiscal", nome: "Transferência SC → SP", resumo: "Mercadoria que sai da matriz para a filial, com a nota certa nas duas pontas.",
    passos: [
      { titulo: "Pedir a transferência", quem: "estoque", tela: "/transferencias", nota: "itens e quantidades" },
      { titulo: "NF de transferência", quem: "fiscal", tela: "/transferencias", nota: "emitida em SC" },
      { titulo: "Mercadoria viaja", quem: "logistica", tela: "/fretes" },
      { titulo: "Entrada em SP", quem: "estoque", tela: "/transferencias", nota: "confere e recebe" },
      { titulo: "Estoque de SP", quem: "sistema", tela: "/estoque" },
    ],
  },
  {
    id: "producao", area: "producao", nome: "Produção de uma máquina", resumo: "Da necessidade (venda ou estoque) à máquina testada e pronta no estoque.",
    passos: [
      { titulo: "Precisa de máquina", quem: "sistema", tela: "/producao", nota: "venda ou estoque mínimo" },
      { titulo: "Abrir a OP", quem: "compras", tela: "/producao" },
      { titulo: "Separar as peças", quem: "estoque", tela: "/producao", nota: "pela ficha técnica" },
      { titulo: "Comprar o que falta", quem: "compras", tela: "/compras", nota: "cotação e OC" },
      { titulo: "Montagem por etapas", quem: "tecnico", tela: "/producao" },
      { titulo: "Teste do giga", quem: "tecnico", tela: "/teste-giga" },
      { titulo: "Pronta no estoque", quem: "estoque", tela: "/estoque", nota: "com nº de série" },
    ],
  },
  {
    id: "preventiva", area: "assistencia", nome: "Garantia e preventiva", resumo: "Depois da venda: o ERP lembra a preventiva e cuida da garantia de cada máquina.",
    passos: [
      { titulo: "Máquina vendida", quem: "vendas", tela: "/clientes", nota: "entra na ficha" },
      { titulo: "Garantia contada", quem: "sistema", tela: "/garantias", nota: "da data da NF" },
      { titulo: "Aviso de preventiva", quem: "sistema", tela: "/garantias" },
      { titulo: "Agendar o técnico", quem: "assistencia", tela: "/assistencia", nota: "da região do cliente" },
      { titulo: "OS da preventiva", quem: "tecnico", tela: "/assistencia" },
      { titulo: "Próxima data", quem: "sistema", tela: "/garantias" },
    ],
  },
  {
    id: "acesso", area: "erp", nome: "Novo usuário no ERP", resumo: "Como uma pessoa nova da equipe ganha acesso só ao que precisa.",
    passos: [
      { titulo: "Criar o usuário", quem: "diretoria", tela: "/usuarios", nota: "nome e e-mail" },
      { titulo: "Escolher o perfil", quem: "diretoria", tela: "/usuarios", nota: "vendas, financeiro…" },
      { titulo: "1º acesso", quem: "todos", nota: "troca a senha" },
      { titulo: "Duas etapas", quem: "todos", nota: "admin e financeiro" },
      { titulo: "Vê só o que é seu", quem: "sistema", nota: "menu do perfil" },
    ],
  },
  {
    id: "mudanca", area: "erp", nome: "Uma mudança no ERP", resumo: "Da ideia de alguém da equipe até a versão nova no ar.",
    passos: [
      { titulo: "Ideia anotada", quem: "todos", tela: "/sobre?aba=ideias", nota: "qualquer pessoa" },
      { titulo: "Avaliada e votada", quem: "diretoria", tela: "/sobre?aba=ideias" },
      { titulo: "Vira pendência", quem: "diretoria", tela: "/sobre?aba=handoff", nota: "no Handoff, com quem faz" },
      { titulo: "Feita e testada", quem: "claude", nota: "testes automáticos" },
      { titulo: "Ok para publicar", quem: "diretoria", nota: "só com o ok da empresa" },
      { titulo: "No ar", quem: "todos", tela: "/sobre?aba=atualizacoes", nota: "aparece em Atualizações" },
    ],
  },  // auditoria de 23/10: os processos que o ERP já faz e ainda não tinham esquema
  {
    id: "cliente-novo", area: "vendas", nome: "Cliente novo no cadastro", resumo: "O cadastro passo a passo, conferido na Receita, sem repetir quem já existe.",
    passos: [
      { titulo: "Quem é o cliente", quem: "vendas", tela: "/clientes", nota: "CPF ou CNPJ" },
      { titulo: "Conferir na Receita", quem: "sistema", tela: "/clientes", nota: "nome e endereço certos" },
      { titulo: "Já existe?", quem: "sistema", tela: "/clientes", nota: "aviso de já cadastrado" },
      { titulo: "Contato e endereço", quem: "vendas", tela: "/clientes", nota: "endereço pelo CEP" },
      { titulo: "Assinar a ficha", quem: "cliente", nota: "na hora ou por link" },
      { titulo: "Abrir a venda", quem: "vendas", tela: "/pedidos" },
    ],
  },
  {
    id: "comissao", area: "vendas", nome: "Comissão do vendedor", resumo: "Da venda com vendedor à comissão paga, calculada sozinha e sem planilha.",
    passos: [
      { titulo: "Venda com vendedor", quem: "vendas", tela: "/pedidos", nota: "ou o da carteira do cliente" },
      { titulo: "Comissão calculada", quem: "sistema", tela: "/comissoes", nota: "item a item, pelas regras" },
      { titulo: "Comissão liberada", quem: "sistema", tela: "/comissoes", nota: "na aprovação ou no pagamento" },
      { titulo: "Gerar a conta", quem: "financeiro", tela: "/comissoes", nota: "marcar as do vendedor" },
      { titulo: "Aprovação", quem: "diretoria", tela: "/aprovacoes" },
      { titulo: "Comissão paga", quem: "financeiro", tela: "/financeiro", nota: "a baixa marca como paga" },
      { titulo: "Vendedor confere", quem: "vendas", tela: "/comissoes", nota: "vê só as próprias" },
    ],
  },
  {
    id: "rastreio", area: "vendas", nome: "Cliente acompanha a entrega", resumo: "O cliente sabe onde está o pedido sem precisar perguntar.",
    passos: [
      { titulo: "Pedido despachado", quem: "expedicao", tela: "/expedicao" },
      { titulo: "Código de rastreio", quem: "logistica", tela: "/rastreio", nota: "preenchido na lista" },
      { titulo: "E-mail ao cliente", quem: "sistema", tela: "/rastreio", nota: "sozinho, com o código" },
      { titulo: "WhatsApp pronto", quem: "logistica", tela: "/rastreio", nota: "com a previsão e o link" },
      { titulo: "Passou da previsão?", quem: "logistica", tela: "/rastreio", nota: "aparece em destaque" },
      { titulo: "Entregue", quem: "logistica", tela: "/fluxo" },
    ],
  },
  {
    id: "frete", area: "financeiro", nome: "Frete do CT-e à conta paga", resumo: "Da cotação do frete à fatura da transportadora conferida e paga.",
    passos: [
      { titulo: "Cotar o frete", quem: "vendas", tela: "/fretes", nota: "mensagem pronta" },
      { titulo: "Aprovar e coletar", quem: "logistica", tela: "/fretes", nota: "agendar a coleta" },
      { titulo: "CT-e chega", quem: "sistema", tela: "/fretes", nota: "busca a cada 15 min" },
      { titulo: "Montar a fatura", quem: "financeiro", tela: "/fretes", nota: "a soma dos CT-e confere" },
      { titulo: "Conta a pagar", quem: "financeiro", tela: "/financeiro" },
      { titulo: "Aprovação", quem: "diretoria", tela: "/aprovacoes" },
      { titulo: "Conciliado no banco", quem: "financeiro", tela: "/conciliacao" },
    ],
  },
  {
    id: "entradas", area: "financeiro", nome: "De onde veio a entrada", resumo: "Cada dinheiro que entra nos bancos da MF ligado à venda, ao cliente ou à conta certa.",
    passos: [
      { titulo: "Extrato entra", quem: "sistema", tela: "/conciliacao", nota: "banco, Open Finance ou OFX" },
      { titulo: "ERP reconhece", quem: "sistema", tela: "/conciliacao", nota: "Pix, cartão, boleto ou regra" },
      { titulo: "Ligar à venda", quem: "financeiro", tela: "/conciliacao", nota: "conta a receber baixada" },
      { titulo: "Entre contas e sócios", quem: "sistema", tela: "/partes-relacionadas", nota: "não conta como venda" },
      { titulo: "Entrada grande sem dono", quem: "diretoria", nota: "a dona anota de quem é" },
      { titulo: "Pronto para o contador", quem: "contador", tela: "/contador" },
    ],
  },
  {
    id: "cartao-empresa", area: "financeiro", nome: "Gasto no cartão da empresa", resumo: "Cada compra no cartão corporativo com a nota certa ou o motivo de não ter.",
    passos: [
      { titulo: "Compra no cartão", quem: "todos" },
      { titulo: "Pedir a nota", quem: "financeiro", tela: "/", nota: "botão Pedi a nota" },
      { titulo: "NF chega e liga", quem: "sistema", tela: "/notas", nota: "pelo valor da compra" },
      { titulo: "Sem nota? Motivo", quem: "financeiro", tela: "/", nota: "Sem nota ou Pessoal" },
      { titulo: "Gasto separado", quem: "sistema", tela: "/gastos", nota: "combustível, marketplaces" },
      { titulo: "Conciliado no banco", quem: "financeiro", tela: "/conciliacao" },
    ],
  },
  {
    id: "devolucao", area: "fiscal", nome: "Devolução de venda", resumo: "O cliente devolve: nota de devolução, reembolso aprovado e a venda descontada.",
    passos: [
      { titulo: "Cliente devolve", quem: "cliente", nota: "peça ou máquina" },
      { titulo: "NF de devolução", quem: "fiscal", tela: "/notas", nota: "a partir da nota de venda" },
      { titulo: "Conferir o que voltou", quem: "estoque", tela: "/estoque" },
      { titulo: "Reembolso a pagar", quem: "financeiro", tela: "/notas", nota: "vira conta a pagar" },
      { titulo: "Aprovação", quem: "diretoria", tela: "/aprovacoes" },
      { titulo: "Venda descontada", quem: "sistema", tela: "/relatorios", nota: "relatórios, metas e DRE" },
    ],
  },
  {
    id: "nfse", area: "fiscal", nome: "Nota de serviço (NFS-e)", resumo: "Da OS concluída à nota de serviço autorizada pela prefeitura e entregue ao cliente.",
    passos: [
      { titulo: "OS concluída", quem: "tecnico", tela: "/assistencia" },
      { titulo: "Conferir antes", quem: "sistema", tela: "/assistencia", nota: "antes de enviar" },
      { titulo: "Emitir a NFS-e", quem: "financeiro", tela: "/assistencia", nota: "pela Focus" },
      { titulo: "Prefeitura autoriza", quem: "sistema", tela: "/assistencia", nota: "acompanhada no ERP" },
      { titulo: "Mandar ao cliente", quem: "financeiro", tela: "/assistencia" },
      { titulo: "Pacote do mês", quem: "contador", tela: "/contador" },
    ],
  },
  {
    id: "parcelamento", area: "fiscal", nome: "Parcelamento de imposto", resumo: "Nenhuma parcela esquecida e nenhum parcelamento cancelado por atraso.",
    passos: [
      { titulo: "Pedir a lista", quem: "contador", tela: "/parcelamentos", nota: "mensagem pronta" },
      { titulo: "Cadastrar", quem: "financeiro", tela: "/parcelamentos", nota: "parcelas geradas na hora" },
      { titulo: "Aviso antes de vencer", quem: "sistema", tela: "/parcelamentos", nota: "7 e 2 dias antes" },
      { titulo: "Pagar a guia", quem: "financeiro", tela: "/parcelamentos", nota: "com o comprovante" },
      { titulo: "Risco de cancelar", quem: "sistema", tela: "/parcelamentos", nota: "pelas parcelas atrasadas" },
      { titulo: "Impostos pagos", quem: "sistema", tela: "/impostos-pagos", nota: "todas as contas juntas" },
    ],
  },
  {
    id: "os-celular", area: "assistencia", nome: "OS pelo celular do técnico", resumo: "O técnico na bancada ou no cliente, com a OS no celular, sem o menu do ERP.",
    passos: [
      { titulo: "Abrir o app", quem: "tecnico", nota: "instalado no celular" },
      { titulo: "Minhas OS por etapa", quem: "tecnico", nota: "o próximo passo num toque" },
      { titulo: "Foto da câmera", quem: "tecnico", nota: "vai direto para a OS" },
      { titulo: "Checklist e laudo", quem: "tecnico", tela: "/assistencia" },
      { titulo: "Cliente assina", quem: "cliente", nota: "na entrada e na retirada" },
      { titulo: "Avisar o cliente", quem: "tecnico", nota: "mensagem pronta" },
    ],
  },
  {
    id: "tiny", area: "erp", nome: "Dados do Tiny para o ERP", resumo: "Trazer cadastros, notas e vendas do Tiny sem digitar e sem perder nada.",
    passos: [
      { titulo: "Exportar do Tiny", quem: "diretoria", nota: "planilha, XML ou pela API" },
      { titulo: "Importar", quem: "diretoria", tela: "/importar", nota: "um cartão por tipo" },
      { titulo: "Resumo antes", quem: "sistema", tela: "/importar", nota: "o que entra e o que fica" },
      { titulo: "Sem duplicar", quem: "sistema", nota: "pelo CPF ou CNPJ" },
      { titulo: "Marcadores somam", quem: "sistema", nota: "nunca tiram os que existem" },
      { titulo: "Plano de troca", quem: "diretoria", tela: "/implantacao", nota: "até desligar o Tiny" },
    ],
  },
  {
    id: "sprint", area: "erp", nome: "Sprint da equipe", resumo: "Cada equipe entrega um pouco toda semana, sem perder o foco.",
    passos: [
      { titulo: "Anotar no backlog", quem: "todos", tela: "/scrum" },
      { titulo: "Planejar a sprint", quem: "diretoria", tela: "/scrum", nota: "objetivo e datas" },
      { titulo: "Daily", quem: "todos", tela: "/scrum", nota: "fiz, vou fazer, me impede" },
      { titulo: "Quadro", quem: "todos", tela: "/scrum", nota: "A fazer → Feito" },
      { titulo: "Revisão e retro", quem: "todos", tela: "/scrum" },
      { titulo: "Volta ao backlog", quem: "sistema", tela: "/scrum", nota: "o que não terminou" },
    ],
  },
  {
    id: "chats", area: "erp", restrito: "admin", nome: "Publicação pelos chats", resumo: "Cada chat do Claude cuida de um assunto; só um publica por vez e nada vai ao ar sem o seu ok.",
    passos: [
      { titulo: "Pedido no chat certo", quem: "diretoria", tela: "/sobre?aba=chats", nota: "um chat por assunto" },
      { titulo: "Entra em Pedidos", quem: "claude", tela: "/sobre?aba=pedidos", nota: "no dia do pedido" },
      { titulo: "Feito e testado", quem: "claude", nota: "testes automáticos" },
      { titulo: "Aviso para você", quem: "claude", nota: "som, voz e celular" },
      { titulo: "Pode publicar?", quem: "diretoria", nota: "botões no chat" },
      { titulo: "Um publica por vez", quem: "claude", tela: "/sobre?aba=chats", nota: "o outro chat espera" },
      { titulo: "No ar", quem: "todos", tela: "/sobre?aba=atualizacoes", nota: "aparece em Atualizações" },
    ],
  },
  {
    id: "encontro-contas", area: "retaguarda", restrito: "master", nome: "Encontro de contas", resumo: "O gasto da empresa pago pela conta pessoal volta para a empresa, com o contador sabendo.",
    passos: [
      { titulo: "Gasto pessoal", quem: "diretoria", tela: "/pessoal", nota: "por voz ou foto" },
      { titulo: "Era da empresa?", quem: "diretoria", tela: "/pessoal", nota: "card em âmbar" },
      { titulo: "Lançar na MF", quem: "diretoria", tela: "/pessoal", nota: "conta a pagar preenchida" },
      { titulo: "Aprovação", quem: "diretoria", tela: "/aprovacoes" },
      { titulo: "Planilha ao contador", quem: "contador", nota: "o que foi pago por você" },
    ],
  },
  {
    id: "licenciado", area: "retaguarda", restrito: "master", nome: "Pagamento de licenciado", resumo: "O que cada loja My Frost pagou, ligado à loja certa, com aviso de atraso.",
    passos: [
      { titulo: "Entrada no extrato", quem: "sistema", tela: "/licenciados", nota: "para conferir" },
      { titulo: "Loja sugerida", quem: "sistema", tela: "/licenciados", nota: "pelo nome no extrato" },
      { titulo: "Ligar à loja", quem: "diretoria", tela: "/licenciados", nota: "licença, mensalidade…" },
      { titulo: "Atraso?", quem: "sistema", tela: "/licenciados", nota: "45 dias sem pagar" },
      { titulo: "Carteira", quem: "diretoria", tela: "/licenciados", nota: "recebido e líquido" },
    ],
  },
];

/** Os esquemas que a pessoa pode ver (os restritos só para o administrador ou a conta master). */
export const processosVisiveis = (admin: boolean, master: boolean) =>
  PROCESSOS.filter((p) => !p.restrito || (p.restrito === "admin" ? admin : master));

/** Os passos em texto numerado, para mandar no WhatsApp. */
export function textoProcesso(p: Processo, nomeTela: (rota: string) => string | undefined = () => undefined) {
  return [
    `${p.nome}`, p.resumo, "",
    ...p.passos.map((s, k) => {
      const tela = s.tela ? nomeTela(s.tela) : undefined;
      return `${k + 1}. ${s.titulo} — ${ROTULO_QUEM[s.quem]}${s.nota ? ` (${s.nota})` : ""}${tela ? ` · no ERP: ${tela}` : ""}`;
    }),
  ].join("\n");
}

/** Quebra o título em linhas de até `max` letras (sem cortar palavra). */
export function quebrar(texto: string, max: number): string[] {
  const linhas: string[] = [];
  for (const p of texto.split(/\s+/)) {
    const ult = linhas[linhas.length - 1];
    if (ult && `${ult} ${p}`.length <= max) linhas[linhas.length - 1] = `${ult} ${p}`; else linhas.push(p);
  }
  return linhas;
}

/** Posições do desenho em zigue-zague: a 1ª linha vai para a direita, a 2ª volta, e assim por diante. */
export function posicoes(n: number, colunas: number) {
  return Array.from({ length: n }, (_, k) => {
    const linha = Math.floor(k / colunas);
    const pos = k % colunas;
    return { linha, coluna: linha % 2 === 0 ? pos : colunas - 1 - pos };
  });
}
