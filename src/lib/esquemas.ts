// Esquemas dos processos (Sobre o ERP Line → Esquema): cada processo em poucos passos, quem faz e a tela do ERP
// onde acontece. Viram um desenho simples, com cara de rascunho em guardanapo, para explicar à equipe.

export type Quem = "vendas" | "cliente" | "fiscal" | "expedicao" | "logistica" | "financeiro" | "contador" | "compras" | "estoque"
  | "diretoria" | "assistencia" | "tecnico" | "sistema" | "todos" | "claude";
export type Passo = { titulo: string; quem: Quem; tela?: string; nota?: string };
export type Processo = { id: string; nome: string; resumo: string; passos: Passo[] };

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
    id: "venda", nome: "Venda do começo ao fim", resumo: "Do orçamento ao dinheiro conciliado e ao mês fechado com o contador.",
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
    id: "compra", nome: "Compra de peças e insumos", resumo: "Da falta no estoque ao pagamento aprovado e conciliado.",
    passos: [
      { titulo: "Falta no estoque", quem: "sistema", tela: "/compras", nota: "necessidades de compra" },
      { titulo: "Cotação", quem: "compras", tela: "/compras", nota: "fornecedores respondem pelo link" },
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
    id: "assistencia", nome: "Máquina na assistência", resumo: "Do chamado do cliente à máquina de volta e à próxima preventiva.",
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
    id: "mudanca", nome: "Uma mudança no ERP", resumo: "Da ideia de alguém da equipe até a versão nova no ar.",
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
