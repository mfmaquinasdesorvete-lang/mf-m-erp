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

/** Transferências entre as próprias contas e o pagamento da fatura não são entrada nem gasto. */
const conta = (l: LancPessoal) => l.categoria !== "Transferências" && l.categoria !== "Cartão (fatura)";

/** Entradas, saídas, resultado, gastos por categoria e os maiores gastos do período. */
export function resumoPeriodo(lancs: LancPessoal[], f: Faixa, hoje?: string) {
  const doPeriodo = lancs.filter((l) => vale(l) && l.data >= f.de && l.data <= f.ate && conta(l));
  const entrou = Math.round(doPeriodo.filter((l) => l.valor > 0).reduce((t, l) => t + Number(l.valor), 0) * 100) / 100;
  const saiu = Math.round(-doPeriodo.filter((l) => l.valor < 0).reduce((t, l) => t + Number(l.valor), 0) * 100) / 100;
  const porCategoria = new Map<string, number>();
  for (const l of doPeriodo) if (l.valor < 0) porCategoria.set(l.categoria ?? "Outros", (porCategoria.get(l.categoria ?? "Outros") ?? 0) - Number(l.valor));
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
export function serieMensal(lancs: LancPessoal[], ateMes: string, n = 12) {
  return Array.from({ length: n }, (_, i) => {
    const mes = somarMesPessoal(ateMes, i - n + 1);
    const r = resumoPeriodo(lancs, { de: `${mes}-01`, ate: fimDoMes(mes) });
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
const textoAlto = (s: unknown) => ` ${String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()} `;
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

/**
 * Cards do painel pessoal: os gastos separados pelo tipo, pelo texto do extrato (cada lançamento entra no primeiro
 * tipo que combina). `aviso` marca o que vale mostrar ao contador (dinheiro pessoal que pagou coisa da empresa).
 */
export type GrupoPessoalId = "veiculo" | "empresas" | "impostos" | "saude" | "seguros" | "cartoes" | "bancos" | "postos" | "delivery"
  | "farmacia" | "mercado" | "online" | "assinaturas" | "casa" | "doacoes" | "tarifas";
export const GRUPOS_PESSOAIS: { id: GrupoPessoalId; nome: string; dica: string; aviso?: string;
  testa: (d: string, l: LancPessoal, e: Empresa) => boolean }[] = [
  { id: "veiculo", nome: "Financiamento e consórcio", dica: "Parcela do carro (PAGTO FINANC VEIC), consórcio, leasing",
    aviso: "Se o carro também serve à empresa, há caminhos dentro da lei (reembolso por km com controle ou o carro em nome da MF). Confirmar com o contador.",
    testa: (d) => /financ|\bfin veic|\bcdc\b|consorcio|leasing|parcela (do )?(carro|veiculo)/.test(d) },
  { id: "empresas", nome: "Pix para as empresas", dica: "Dinheiro seu que foi para a MF ou outra empresa sua",
    aviso: "Registrar na empresa como aporte do sócio ou empréstimo (contrato de mútuo). Confirmar com o contador.",
    testa: (_d, l, e) => l.valor < 0 && daEmpresa(l.descricao, e) },
  { id: "impostos", nome: "Impostos", dica: "DARF, DAS, IPVA e licenciamento (Detran), IPTU, INSS, GNRE…",
    aviso: "Imposto da MF pago daqui: lance na empresa (Contas a pagar, já pago) e anote como dinheiro do sócio. Confirmar com o contador.",
    testa: (d) => /darf|\bdas (mei|simples|sn)\b|pgdas|simples nac|ipva|iptu|irpf|imposto|receita fed|\bgps\b|inss|fgts|\bdae\b|gnre|icms|tributo|licenciamento|detran|departamento estadual|transito|sefaz|secretaria|prefeitura/.test(d) },
  { id: "saude", nome: "Plano de saúde", dica: "Unimed e outros planos",
    testa: (d) => /unimed|\bamil\b|sulamerica saude|bradesco saude|hapvida|notredame|plano de saude|odontoprev/.test(d) },
  { id: "seguros", nome: "Seguros e proteção", dica: "Seguro de vida, do carro, da casa, proteção familiar",
    testa: (d) => /seguro|\bseg\b|protecao|premio aces|allianz|porto seguro|mapfre|tokio marine|sulamerica/.test(d) },
  { id: "cartoes", nome: "Cartões (faturas)", dica: "Pagamento das faturas; o que foi comprado no cartão entra nos outros cards",
    testa: (d, l) => l.categoria === "Cartão (fatura)" || /fatura|pagamento cartao|pgto cartao|pag cartao|pgto min|pagamento minimo/.test(d) },
  { id: "bancos", nome: "Boletos de bancos", dica: "Fatura de cartão ou parcela paga por boleto do banco (Itaú, Pan, BV, Midway, Nubank…)",
    testa: (d) => /(pag|pagto|pgto|pagamento) (de )?boleto (itau|banco|midway|nu pagamento|nubank|santander|bradesco|caixa|c6|bv|pan)/.test(d) },
  { id: "postos", nome: "Postos e pedágio", dica: "Gasolina, etanol e tag de pedágio (ConectCar, Sem Parar)",
    testa: (d) => /\bposto|combust|gasolina|etanol|shell|ipiranga|petrobras|br mania|conectcar|sem parar|veloe|pedagio/.test(d) },
  { id: "delivery", nome: "iFood e delivery", dica: "iFood, Rappi, Zé Delivery…",
    testa: (d) => /ifood|i food|rappi|ze delivery|uber ?eats|aiqfome|99 ?food/.test(d) },
  { id: "farmacia", nome: "Farmácia", dica: "Remédios e drogarias",
    testa: (d) => /farmacia|drogaria|\braia\b|rd saude|panvel|pague menos|drogasil|nissei/.test(d) },
  { id: "mercado", nome: "Mercado", dica: "Supermercado, atacado, padaria, açougue",
    testa: (d, l) => l.categoria === "Mercado" || /supermerc|atacad|mercado\b(?! ?(livre|pago))/.test(d) },
  { id: "online", nome: "Compras pela internet", dica: "Mercado Livre, Shopee, TikTok, Amazon, cursos e apps",
    aviso: "Se foi peça ou material para a MF, peça a nota no CNPJ da empresa e lance lá. Confirmar com o contador.",
    testa: (d) => /mercado ?livre|mercado ?pago|marketp|shopee|shpp|amazon|magalu|shein|aliexpress|bytedance|tiktok|ebanx|kiwify|eduzz|hotmart/.test(d) },
  { id: "assinaturas", nome: "Assinaturas", dica: "Streaming, nuvem, apps",
    testa: (_d, l) => l.categoria === "Assinaturas" },
  { id: "casa", nome: "Contas da casa", dica: "Luz, água, internet, celular, aluguel, condomínio",
    testa: (d, l) => l.categoria === "Casa" || /\bclaro\b|unifique|\bvivo\b|\btim\b|telecom|celesc|aluguel|condominio/.test(d) },
  { id: "doacoes", nome: "Doações", dica: "LBV, igreja, campanhas",
    testa: (d) => /\blbv\b|doacao|dizimo|teleton|graacc|unicef/.test(d) },
  { id: "tarifas", nome: "Tarifas e juros do banco", dica: "Juros do cheque especial, IOF e tarifas: dinheiro que dá para economizar",
    testa: (d) => /tarifa|anuidade|\biof\b|juros|encargo|\bmora\b|cesta de servico|adiant depositante|adiantamento a depositante/.test(d) },
];

/** Em qual card o lançamento entra (o primeiro tipo que combina), ou null. */
export function grupoDe(l: LancPessoal, e: Empresa): GrupoPessoalId | null {
  if (l.valor >= 0) return null;
  const d = ` ${sem(l.descricao)} `;
  return GRUPOS_PESSOAIS.find((g) => g.testa(d, l, e))?.id ?? null;
}

/** Total, quantidade e o período anterior de cada card (só os que têm gasto num dos dois períodos). */
export function gruposDoPeriodo(lancs: LancPessoal[], f: Faixa, ant: Faixa, e: Empresa) {
  const soma = new Map<GrupoPessoalId, { total: number; qtd: number; anterior: number }>();
  for (const l of lancs) {
    if (!vale(l)) continue;
    const agora = l.data >= f.de && l.data <= f.ate;
    const antes = l.data >= ant.de && l.data <= ant.ate;
    if (!agora && !antes) continue;
    const g = grupoDe(l, e);
    if (!g) continue;
    const s = soma.get(g) ?? { total: 0, qtd: 0, anterior: 0 };
    if (agora) { s.total -= Number(l.valor); s.qtd += 1; }
    if (antes) s.anterior -= Number(l.valor);
    soma.set(g, s);
  }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return GRUPOS_PESSOAIS.filter((g) => soma.has(g.id)).map((g) => {
    const s = soma.get(g.id)!;
    return { ...g, total: r2(s.total), qtd: s.qtd, anterior: r2(s.anterior) };
  });
}
