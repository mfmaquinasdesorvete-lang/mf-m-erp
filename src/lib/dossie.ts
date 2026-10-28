// Dossiê da empresa (Painel do contador): o que o ERP tem de cada mês desde a abertura da unidade — NF-e emitidas e
// recebidas (com XML), NFS-e, CT-e, guias, folha, obrigações, fechamento e o extrato de cada conta — e o que falta,
// com de onde tirar. As contagens vêm de dossie_empresa() no banco; aqui fica só a regra de cada célula.

export type LinhaDossie = { mes: string; tipo: string; qtd: number; completos: number };
export type Situacao = "tem" | "parcial" | "falta" | "nada";
export type Celula = { situacao: Situacao; qtd: number; completos: number };
export type ContaDossie = { id: string; nome: string };

type Coluna = {
  tipo: string; rotulo: string;
  /** todo mês tem que ter (sem nada = falta); senão, sem nada = nada (pode não ter havido) */
  todoMes: boolean;
  /** o que é "completo" quando há parte só */
  parcial?: string;
  onde: string;
};

/** Tipos fixos, na ordem da tela. Os extratos entram depois, um por conta da unidade. */
export const COLUNAS_FIXAS: Coluna[] = [
  { tipo: "nfe_emitidas", rotulo: "NF-e emitidas", todoMes: true, parcial: "sem o XML", onde: "Tiny (backup ou API) e portal da SEFAZ SC (NF-e emitidas, com o certificado)" },
  { tipo: "nfe_recebidas", rotulo: "NF-e recebidas", todoMes: true, parcial: "só o resumo, sem o XML", onde: "portal da SEFAZ SC (NF-e destinadas), fornecedores e contador; o ERP só busca sozinho os últimos 90 dias" },
  { tipo: "nfse", rotulo: "NFS-e", todoMes: false, onde: "portal da NFS-e (prefeitura ou nacional)" },
  { tipo: "cte", rotulo: "CT-e", todoMes: false, onde: "portal do CT-e (SEFAZ) ou as transportadoras" },
  { tipo: "guias", rotulo: "Guias", todoMes: true, parcial: "lançadas e ainda não pagas", onde: "e-CAC (comprovantes de arrecadação), SEFAZ SC (DAE pagos) e contador" },
  { tipo: "folha", rotulo: "Folha", todoMes: false, parcial: "lançada e ainda não paga", onde: "contador (folha do mês, guias de INSS e FGTS)" },
  { tipo: "obrigacoes", rotulo: "Obrigações", todoMes: true, parcial: "com alguma pendente", onde: "contador (recibos do SPED Fiscal, EFD-Contribuições, DCTFWeb, ECD e ECF)" },
  { tipo: "fechamento", rotulo: "Mês fechado", todoMes: true, parcial: "aberto", onde: "aqui no Painel do contador, depois de conferir o mês" },
];
export const ONDE_EXTRATO = "banco (extrato OFX ou PDF do período; se a conta já existia)";

export const ROTULO_SITUACAO: Record<Situacao, string> = { tem: "tem", parcial: "parcial", falta: "falta", nada: "—" };

/** Meses de `inicio` até `fim` (AAAA-MM), do mais novo para o mais antigo. */
export function mesesEntre(inicio: string, fim: string): string[] {
  const [a0, m0] = inicio.split("-").map(Number), [a1, m1] = fim.split("-").map(Number);
  const out: string[] = [];
  for (let t = a1 * 12 + m1 - 1; t >= a0 * 12 + m0 - 1; t--) out.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`);
  return out;
}

export type ColunaDossie = { tipo: string; rotulo: string; onde: string; parcial?: string; todoMes: boolean; primeiro: string | null };
export type MapaDossie = {
  colunas: ColunaDossie[];
  meses: { mes: string; celulas: Record<string, Celula> }[];
  /** por coluna: meses com falta e com parte só */
  resumo: Record<string, { falta: string[]; parcial: string[] }>;
  completos: number;
};

/**
 * Monta o mapa. Extrato: só conta como falta entre o primeiro mês que o ERP tem daquela conta e hoje
 * (antes disso a conta pode nem existir; aparece no resumo como "antes de").
 */
export function mapaDossie(linhas: LinhaDossie[], contas: ContaDossie[], inicio: string, fim: string): MapaDossie {
  const meses = mesesEntre(inicio, fim);
  const porChave = new Map(linhas.map((l) => [`${l.mes}|${l.tipo}`, l]));
  const primeiroDe = (tipo: string) => linhas.filter((l) => l.tipo === tipo && l.qtd > 0 && l.mes >= inicio).reduce<string | null>((p, l) => (!p || l.mes < p ? l.mes : p), null);
  const colunas: ColunaDossie[] = [
    ...COLUNAS_FIXAS.map((c) => ({ ...c, primeiro: primeiroDe(c.tipo) })),
    ...contas.map((c) => ({ tipo: `extrato:${c.id}`, rotulo: `Extrato ${c.nome}`, onde: ONDE_EXTRATO, todoMes: true, primeiro: primeiroDe(`extrato:${c.id}`) })),
  ];
  const resumo: MapaDossie["resumo"] = Object.fromEntries(colunas.map((c) => [c.tipo, { falta: [], parcial: [] }]));
  let completos = 0;
  const linhasMes = meses.map((mes) => {
    const celulas: Record<string, Celula> = {};
    let todasOk = true;
    for (const c of colunas) {
      const l = porChave.get(`${mes}|${c.tipo}`);
      const qtd = l?.qtd ?? 0, ok = Math.min(l?.completos ?? 0, qtd);
      const extratoAntes = c.tipo.startsWith("extrato:") && (!c.primeiro || mes < c.primeiro);
      const situacao: Situacao = qtd > 0 ? (ok >= qtd ? "tem" : "parcial") : c.todoMes && !extratoAntes ? "falta" : "nada";
      celulas[c.tipo] = { situacao, qtd, completos: ok };
      if (situacao === "falta") resumo[c.tipo].falta.push(mes);
      if (situacao === "parcial") resumo[c.tipo].parcial.push(mes);
      if (situacao === "falta" || situacao === "parcial") todasOk = false;
    }
    if (todasOk) completos++;
    return { mes, celulas };
  });
  return { colunas, meses: linhasMes, resumo, completos };
}

/** "06/2022 a 02/2023, 05/2023" — meses seguidos viram um intervalo. */
export function faixasDeMeses(meses: string[]): string {
  const ord = [...meses].sort();
  const br = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
  const idx = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
  const faixas: string[] = [];
  for (let i = 0; i < ord.length; i++) {
    let j = i;
    while (j + 1 < ord.length && idx(ord[j + 1]) === idx(ord[j]) + 1) j++;
    faixas.push(i === j ? br(ord[i]) : `${br(ord[i])} a ${br(ord[j])}`);
    i = j;
  }
  return faixas.join(", ");
}
