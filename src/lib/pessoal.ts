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

/**
 * Acertar pelo saldo do app do banco: "no fim do dia `data` o banco mostrava `valor`".
 * Devolve o saldo inicial (e a data dele) que fazem o saldo da conta bater com o banco nesse dia.
 */
export function acertarSaldo(c: ContaPessoal, lancs: LancPessoal[], valor: number, data: string): { saldo_inicial: number; saldo_inicial_em: string } {
  const em = data < c.saldo_inicial_em ? data : c.saldo_inicial_em;
  const mov = lancs.filter((l) => l.conta_id === c.id && vale(l) && l.data >= em && l.data <= data).reduce((t, l) => t + Number(l.valor), 0);
  return { saldo_inicial: Math.round((valor - mov) * 100) / 100, saldo_inicial_em: em };
}

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

/* ------------------------------ períodos e painel ------------------------------ */

export type PeriodoId = "mes" | "3m" | "6m" | "12m" | "ano" | "tudo" | "pers";
export type Faixa = { de: string; ate: string };
export const PERIODOS_PESSOAIS: { id: PeriodoId; rotulo: string; meses?: number }[] = [
  { id: "mes", rotulo: "Mês", meses: 1 }, { id: "3m", rotulo: "3 meses", meses: 3 }, { id: "6m", rotulo: "6 meses", meses: 6 },
  { id: "12m", rotulo: "12 meses", meses: 12 }, { id: "ano", rotulo: "Ano", meses: 12 }, { id: "tudo", rotulo: "Tudo" }, { id: "pers", rotulo: "Escolher datas" },
];

export const somarMesPessoal = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
export const fimDoMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};
export const somarDiasPessoal = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

/**
 * Datas do período. `mes` é o mês de referência (AAAA-MM): "Mês" é ele; 3/6/12 meses terminam nele; "Ano" é o ano dele.
 * "Tudo" vai do primeiro ao último lançamento (ou hoje); "Escolher datas" usa `livre`.
 */
export function faixaDoPeriodo(id: PeriodoId, mes: string, lancs: LancPessoal[], hoje: string, livre?: Faixa): Faixa {
  const p = PERIODOS_PESSOAIS.find((x) => x.id === id);
  if (id === "ano") return { de: `${mes.slice(0, 4)}-01-01`, ate: `${mes.slice(0, 4)}-12-31` };
  if (p?.meses) return { de: `${somarMesPessoal(mes, 1 - p.meses)}-01`, ate: fimDoMes(mes) };
  if (id === "pers" && livre?.de && livre?.ate) return livre.de <= livre.ate ? livre : { de: livre.ate, ate: livre.de };
  const datas = lancs.map((l) => l.data).sort();
  return { de: datas[0] ?? hoje, ate: datas.length && datas[datas.length - 1] > hoje ? datas[datas.length - 1] : hoje };
}

/** O período anterior do mesmo tamanho (meses inteiros nos períodos por mês), para comparar. */
export function faixaAnterior(id: PeriodoId, mes: string, f: Faixa): Faixa {
  const p = PERIODOS_PESSOAIS.find((x) => x.id === id);
  if (id === "ano") { const a = Number(mes.slice(0, 4)) - 1; return { de: `${a}-01-01`, ate: `${a}-12-31` }; }
  if (p?.meses) { const ref = somarMesPessoal(mes, -p.meses); return { de: `${somarMesPessoal(ref, 1 - p.meses)}-01`, ate: fimDoMes(ref) }; }
  const n = diasEntre(f.de, f.ate) + 1;
  return { de: somarDiasPessoal(f.de, -n), ate: somarDiasPessoal(f.de, -1) };
}

/** Categoria do lançamento: a escolhida ou, sem nenhuma (ex.: veio do Meu Pluggy), a do texto do extrato. */
export const categoriaDoLanc = (l: Pick<LancPessoal, "categoria" | "descricao">) => l.categoria || categoriaDe(l.descricao);

/**
 * O que não é entrada nem gasto. Com `fora` (o painel manda: o dinheiro que só passou de uma conta sua para outra e,
 * havendo conta de cartão no painel, o pagamento da fatura, que já está nas compras do cartão), só esses ficam de fora.
 * Sem `fora`, vale a regra antiga pela categoria (Transferências e Cartão (fatura)).
 */
const conta = (l: LancPessoal, fora?: Set<string>) => (fora ? !fora.has(l.id) : categoriaDoLanc(l) !== "Transferências" && categoriaDoLanc(l) !== "Cartão (fatura)");

/** Entradas, saídas, resultado, gastos por categoria e os maiores gastos do período. */
export function resumoPeriodo(lancs: LancPessoal[], f: Faixa, hoje?: string, fora?: Set<string>) {
  const doPeriodo = lancs.filter((l) => vale(l) && l.data >= f.de && l.data <= f.ate && conta(l, fora));
  const entrou = Math.round(doPeriodo.filter((l) => l.valor > 0).reduce((t, l) => t + Number(l.valor), 0) * 100) / 100;
  const saiu = Math.round(-doPeriodo.filter((l) => l.valor < 0).reduce((t, l) => t + Number(l.valor), 0) * 100) / 100;
  const porCategoria = new Map<string, number>();
  for (const l of doPeriodo) if (l.valor < 0) porCategoria.set(categoriaDoLanc(l), (porCategoria.get(categoriaDoLanc(l)) ?? 0) - Number(l.valor));
  // média por dia: até hoje, se o período ainda não acabou
  const fimMedia = hoje && hoje < f.ate ? (hoje < f.de ? f.de : hoje) : f.ate;
  const dias = diasEntre(f.de, fimMedia) + 1;
  return {
    entrou, saiu, resultado: Math.round((entrou - saiu) * 100) / 100, quantidade: doPeriodo.length,
    mediaDia: Math.round((saiu / Math.max(1, dias)) * 100) / 100,
    categorias: [...porCategoria].map(([nome, valor]) => ({ nome, valor: Math.round(valor * 100) / 100 })).sort((a, b) => b.valor - a.valor),
    maiores: doPeriodo.filter((l) => l.valor < 0).sort((a, b) => a.valor - b.valor).slice(0, 8),
  };
}

/** Entradas e saídas mês a mês: os `n` meses que terminam em `ateMes`. */
export function serieMensal(lancs: LancPessoal[], ateMes: string, n = 12, fora?: Set<string>) {
  return Array.from({ length: n }, (_, i) => {
    const mes = somarMesPessoal(ateMes, i - n + 1);
    const r = resumoPeriodo(lancs, { de: `${mes}-01`, ate: fimDoMes(mes) }, undefined, fora);
    return { mes, entrou: r.entrou, saiu: r.saiu };
  });
}

/**
 * Saldo das contas (sem os cartões) ao longo do período: dia a dia até ~3 meses, senão no fim de cada mês.
 * Não passa de hoje (o que vem depois é previsto).
 */
export function serieSaldo(contas: ContaPessoal[], lancs: LancPessoal[], f: Faixa, hoje: string) {
  const ate = f.ate > hoje ? hoje : f.ate;
  if (ate < f.de) return [];
  const daqui = contas.filter((c) => c.tipo !== "cartao");
  const pontos: string[] = [];
  if (diasEntre(f.de, ate) <= 95) for (let d = f.de; d <= ate; d = somarDiasPessoal(d, 1)) pontos.push(d);
  else {
    for (let m = f.de.slice(0, 7); `${m}-01` <= ate; m = somarMesPessoal(m, 1)) pontos.push(fimDoMes(m) < ate ? fimDoMes(m) : ate);
  }
  return pontos.map((dia) => ({ dia, saldo: Math.round(daqui.reduce((t, c) => t + (c.saldo_inicial_em <= dia ? saldoConta(c, lancs, dia) : 0), 0) * 100) / 100 }));
}

/** Data do último lançamento feito na conta (para mostrar até quando o extrato está atualizado). */
export const ultimoLancamento = (lancs: LancPessoal[], contaId: string) =>
  lancs.filter((l) => l.conta_id === contaId && vale(l)).reduce<string | null>((m, l) => (!m || l.data > m ? l.data : m), null);

/** A própria empresa no extrato pessoal: pela razão social (sem LTDA) ou pelo CNPJ que aparece na descrição. */
export type Empresa = { nomes: string[]; documentos: string[] };
// o banco cola a data no nome ("MF MAQUINAS03 01"): letra e número viram palavras separadas
const textoAlto = (s: unknown) => ` ${String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/([A-Z])(\d)/g, "$1 $2").replace(/[^A-Z0-9]+/g, " ").trim()} `;
// palavras que sozinhas não identificam empresa nenhuma
const GENERICAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "COMERCIO", "INDUSTRIA", "SERVICOS", "EMPRESA"]);
export function daEmpresa(descricao: string | null | undefined, e: Empresa): boolean {
  const d = textoAlto(descricao);
  const digitos = String(descricao ?? "").replace(/\D/g, "");
  if (e.documentos.some((doc) => doc.length >= 11 && digitos.includes(doc))) return true;
  const nomes = e.nomes.map((n) => textoAlto(n).trim().replace(/ (LTDA|ME|EPP|EIRELI|S A|SA)$/, "").trim()).filter((n) => n.length >= 5);
  if (nomes.some((n) => d.includes(` ${n} `))) return true;
  // o Pix por QR code corta o nome ("PIX QRS MF MAQUINAS"): as duas primeiras palavras bastam, se não forem genéricas
  return nomes.map((n) => n.split(" ").slice(0, 2)).filter((p) => p.length === 2 && !p.some((w) => GENERICAS.has(w)) && p.join(" ").length >= 8)
    .some((p) => d.includes(` ${p.join(" ")} `));
}

/** Entradas que vieram da empresa (Pix da MF para a pessoa) e ainda não estão como pró-labore. */
export const recebidosDaEmpresa = (lancs: LancPessoal[], e: Empresa) =>
  lancs.filter((l) => !l.anulado && l.valor > 0 && daEmpresa(l.descricao, e));
