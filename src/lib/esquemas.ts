// Esquemas dos processos (Sobre o ERP Line → Esquema): cada processo em poucos passos, quem faz e a tela do ERP
// onde acontece. Viram um desenho simples, com cara de rascunho em guardanapo, para explicar à equipe.

export type Quem = "vendas" | "cliente" | "fiscal" | "expedicao" | "logistica" | "financeiro" | "contador" | "compras" | "estoque"
  | "diretoria" | "assistencia" | "tecnico" | "sistema" | "todos" | "claude";
export type Passo = { titulo: string; quem: Quem; tela?: string; nota?: string };
export type Area = "vendas" | "financeiro" | "fiscal" | "producao" | "assistencia" | "erp";
export type Processo = { id: string; area: Area; nome: string; resumo: string; passos: Passo[] };

/** Áreas dos esquemas, na ordem da tela. */
export const AREAS_ESQUEMA: { id: Area; nome: string }[] = [
  { id: "vendas", nome: "Vendas" }, { id: "financeiro", nome: "Financeiro" }, { id: "fiscal", nome: "Fiscal" },
  { id: "producao", nome: "Compras e produção" }, { id: "assistencia", nome: "Assistência" }, { id: "erp", nome: "O ERP e a equipe" },
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
  },
];

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
