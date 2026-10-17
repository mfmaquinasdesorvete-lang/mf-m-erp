// Painel pessoal: as contas pessoais do dono (banco, cartão, investimento), separadas da empresa.
// Nada daqui entra no DRE, na conciliação, nos painéis da empresa nem no pacote do contador; no banco, cada linha
// é de quem a criou (public.pessoal_contas e public.pessoal_lancamentos) e só essa pessoa lê.

export type TipoConta = "corrente" | "poupanca" | "cartao" | "investimento" | "dinheiro" | "outra";
export type ContaPessoal = {
  id: string; nome: string; tipo: TipoConta; banco: string | null; cor: string; saldo_inicial: number; saldo_inicial_em: string;
  limite: number | null; ativa: boolean; ordem: number;
};
export type LancPessoal = {
  id: string; conta_id: string; data: string; descricao: string; valor: number; categoria: string | null;
  situacao: "realizado" | "previsto"; identificador?: string | null; anulado: boolean;
};

export const TIPOS_CONTA: { id: TipoConta; nome: string }[] = [
  { id: "corrente", nome: "Conta corrente" }, { id: "poupanca", nome: "Poupança" }, { id: "cartao", nome: "Cartão de crédito" },
  { id: "investimento", nome: "Investimento" }, { id: "dinheiro", nome: "Dinheiro" }, { id: "outra", nome: "Outra" },
];
export const NOME_TIPO_CONTA = Object.fromEntries(TIPOS_CONTA.map((t) => [t.id, t.nome])) as Record<TipoConta, string>;

/** Cores das contas (fundo forte, letra branca: não mudam com o tema). */
export const CORES_CONTA: Record<string, string> = {
  sky: "#0284c7", violet: "#7c3aed", emerald: "#047857", orange: "#c2410c", pink: "#be185d", slate: "#475569", amber: "#b45309", teal: "#0f766e",
};

export const CATEGORIAS = ["Casa", "Mercado", "Saúde", "Educação", "Transporte", "Lazer", "Compras", "Assinaturas", "Impostos e taxas",
  "Cartão (fatura)", "Transferências", "Salário e pró-labore", "Investimentos", "Outros"] as const;

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const REGRAS: [RegExp, (typeof CATEGORIAS)[number]][] = [
  [/pro.?labore|salario|folha|remuneracao/, "Salário e pró-labore"],
  [/fatura|pagamento cartao|pgto cartao/, "Cartão (fatura)"],
  [/aplicacao|resgate|cdb|tesouro|invest|poupanca|rdb/, "Investimentos"],
  [/aluguel|condominio|energia|celesc|enel|cemig|copel|light|agua|casan|sabesp|gas |internet|vivo|claro|tim |oi /, "Casa"],
  [/mercado|supermerc|atacad|padaria|acougue|hortifruti|assai|carrefour|angeloni|giassi|fort atacadista/, "Mercado"],
  [/farmacia|drogaria|raia|panvel|hospital|clinica|laborat|unimed|odonto|medic/, "Saúde"],
  [/escola|colegio|faculdade|curso|udemy|livraria/, "Educação"],
  [/posto|combust|uber|99 ?app|99pop|estacion|pedagio|ipva|detran|onibus/, "Transporte"],
  [/netflix|spotify|disney|prime video|amazon prime|youtube|hbo|globoplay|icloud|google one|assinatura/, "Assinaturas"],
  [/restaurante|lanchonete|bar |cinema|ifood|viagem|hotel|airbnb|show/, "Lazer"],
  [/iptu|irpf|darf|taxa|tarifa|anuidade|iof/, "Impostos e taxas"],
  [/mercado ?livre|shopee|amazon|magalu|americanas|shein|loja/, "Compras"],
  [/pix|ted|doc|transf/, "Transferências"],
];

/** Categoria pelo texto do lançamento (o extrato do banco), para não precisar escolher uma a uma. */
export function categoriaDe(descricao: string | null | undefined): (typeof CATEGORIAS)[number] {
  const d = ` ${sem(descricao)} `;
  return REGRAS.find(([re]) => re.test(d))?.[1] ?? "Outros";
}

const vale = (l: LancPessoal) => !l.anulado && l.situacao === "realizado";

/** Saldo da conta: o inicial mais o que foi realizado a partir da data do saldo inicial (até a data, se houver). */
export function saldoConta(c: ContaPessoal, lancs: LancPessoal[], ate?: string): number {
  const s = lancs.filter((l) => l.conta_id === c.id && vale(l) && l.data >= c.saldo_inicial_em && (!ate || l.data <= ate))
    .reduce((t, l) => t + Number(l.valor), 0);
  return Math.round((Number(c.saldo_inicial) + s) * 100) / 100;
}

/** Entradas, saídas e saídas por categoria do mês (AAAA-MM), sem as transferências entre as próprias contas. */
export function resumoMes(lancs: LancPessoal[], mes: string) {
  const doMes = lancs.filter((l) => vale(l) && l.data.startsWith(mes) && l.categoria !== "Transferências" && l.categoria !== "Cartão (fatura)");
  const entrou = doMes.filter((l) => l.valor > 0).reduce((t, l) => t + Number(l.valor), 0);
  const saiu = -doMes.filter((l) => l.valor < 0).reduce((t, l) => t + Number(l.valor), 0);
  const porCategoria = new Map<string, number>();
  for (const l of doMes) if (l.valor < 0) porCategoria.set(l.categoria ?? "Outros", (porCategoria.get(l.categoria ?? "Outros") ?? 0) - Number(l.valor));
  return {
    entrou: Math.round(entrou * 100) / 100, saiu: Math.round(saiu * 100) / 100,
    categorias: [...porCategoria].map(([nome, valor]) => ({ nome, valor: Math.round(valor * 100) / 100 })).sort((a, b) => b.valor - a.valor),
  };
}

/** Previstos (contas a pagar e a receber pessoais) a partir de hoje, do mais perto ao mais longe. */
export const proximos = (lancs: LancPessoal[], hoje: string) =>
  lancs.filter((l) => !l.anulado && l.situacao === "previsto" && l.data >= hoje).sort((a, b) => a.data.localeCompare(b.data));
