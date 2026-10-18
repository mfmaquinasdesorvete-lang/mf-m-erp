// Notas fiscais → Regras de tributação, em português simples: o que cada regra faz, a carga de ICMS que sobra com a
// redução da base, um teste "e se eu vender…" e os modelos prontos com a base legal. Tudo é estimativa para conferir
// com o contador; a nota de verdade usa também o cadastro do produto (NCM, origem, IPI) e as Configurações da NF-e.
import { aliquotaInterestadual, reducaoDaBase, regraAplicavel, type RegraTributaria } from "../../supabase/functions/_shared/nfe-impostos";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => Number(String(v ?? "").replace(",", ".")) || 0;
const pct = (n: number) => `${String(r2(n)).replace(".", ",")}%`;

/** Redução por alíquota em texto: { "17": 48.23, "12": 26.66 } ⇄ "17%=48,23 · 12%=26,66". */
export const textoReducoes = (m: Record<string, number | string> | null | undefined) =>
  Object.entries(m ?? {}).sort((a, b) => Number(b[0]) - Number(a[0])).map(([a, r]) => `${a}%=${String(r).replace(".", ",")}`).join(" · ");
export function lerReducoes(t: string): Record<string, number> | null {
  const m: Record<string, number> = {};
  for (const parte of String(t ?? "").split(/[;·\n]+/)) {
    const [a, r] = parte.split("=").map((x) => Number(String(x ?? "").replace("%", "").replace(",", ".").trim()));
    if (a > 0 && r >= 0 && r < 100) m[String(a)] = r;
  }
  return Object.keys(m).length ? m : null;
}

/** O que quer dizer cada CST do ICMS (tabela A da NF-e), em poucas palavras. */
export const CST_ICMS_SIMPLES: Record<string, string> = {
  "00": "tributado normal (ICMS cheio)",
  "10": "tributado com ICMS por substituição tributária",
  "20": "tributado com redução da base de cálculo",
  "30": "isento ou não tributado, com ICMS-ST",
  "40": "isento",
  "41": "não tributado (fora do campo do ICMS)",
  "50": "com suspensão (o ICMS fica para depois, ex.: remessa que volta)",
  "51": "com diferimento (o ICMS é pago adiante na cadeia)",
  "60": "ICMS já cobrado antes por substituição tributária",
  "70": "com redução da base e ICMS-ST",
  "90": "outras situações",
};

/** Carga de ICMS que sobra depois da redução da base: alíquota × (1 − redução). Ex.: 17% com 48,23% de redução = 8,80%. */
export function cargaEfetiva(aliquota: number, reducao: number) {
  return r2(aliquota * (1 - reducao / 100));
}

export type LinhaExemplo = { aliquota: number; reducao: number; base: number; icms: number; carga: number; semRegra: number; desonerado: number };

/** Exemplo de uma venda de "valor" em cada alíquota da regra: base, ICMS, carga e o ICMS que deixou de ser cobrado. */
export function exemploRegra(r: Pick<RegraTributaria, "icms_reducao_base" | "icms_reducao_por_aliquota" | "icms_aliquota">, valor = 10000): LinhaExemplo[] {
  const porAliq = r.icms_reducao_por_aliquota && Object.keys(r.icms_reducao_por_aliquota).length ? r.icms_reducao_por_aliquota : null;
  const aliquotas = porAliq ? Object.keys(porAliq).map(num).sort((a, b) => b - a)
    : r.icms_aliquota != null ? [num(r.icms_aliquota)] : num(r.icms_reducao_base) > 0 ? [17, 12, 7] : [];
  return aliquotas.map((a) => {
    const reducao = reducaoDaBase(a, num(r.icms_reducao_base), porAliq);
    const base = r2(valor * (1 - reducao / 100));
    const icms = r2(base * a / 100);
    const semRegra = r2(valor * a / 100);
    return { aliquota: a, reducao, base, icms, carga: cargaEfetiva(a, reducao), semRegra, desonerado: r2(semRegra - icms) };
  });
}

const ROTULO = {
  operacao: { venda: "nas vendas", transferencia: "nas transferências entre SC e SP" } as Record<string, string>,
  destino: { interna: "dentro do estado", interestadual: "para outro estado" } as Record<string, string>,
  tipo_cliente: { contribuinte: "para cliente com inscrição estadual (contribuinte)", nao_contribuinte: "para consumidor final ou cliente sem IE" } as Record<string, string>,
  tipo_produto: { maquina: "de máquinas", peca: "de peças", acessorio: "de acessórios", insumo: "de insumos" } as Record<string, string>,
  origem_mercadoria: { nacional: "de mercadoria nacional", importada: "de mercadoria importada" } as Record<string, string>,
};

/** Quando a regra vale, numa frase ("Nas vendas de máquinas da Matriz SC, NCM 8418…"). */
export function quandoVale(r: RegraTributaria, nomeUnidade: (id: string) => string = () => "") {
  const partes = [
    r.operacao ? ROTULO.operacao[r.operacao] ?? r.operacao : "em qualquer nota (venda, transferência ou remessa)",
    r.tipo_produto && ROTULO.tipo_produto[r.tipo_produto],
    r.origem_mercadoria && ROTULO.origem_mercadoria[r.origem_mercadoria],
    r.unidade_id && `da ${nomeUnidade(r.unidade_id) || "unidade escolhida"}`,
    r.destino && ROTULO.destino[r.destino],
    r.ufs_destino?.length && `só para ${r.ufs_destino.join(", ")}`,
    r.tipo_cliente && ROTULO.tipo_cliente[r.tipo_cliente],
    r.ncm_prefixo && `com NCM começando em ${r.ncm_prefixo}`,
    r.cfop && `quando o CFOP calculado é ${r.cfop}`,
  ].filter(Boolean) as string[];
  const frase = partes.join(", ");
  return frase.charAt(0).toUpperCase() + frase.slice(1) + ".";
}

/** O que a regra muda na nota, item a item, em português simples. */
export function oQueMuda(r: RegraTributaria): string[] {
  const t: string[] = [];
  if (r.cfop_saida) t.push(`O CFOP da nota passa a ser ${r.cfop_saida}.`);
  if (r.icms_cst) t.push(`ICMS com CST ${r.icms_cst}: ${CST_ICMS_SIMPLES[r.icms_cst] ?? "conforme a tabela da NF-e"}.`);
  if (r.icms_aliquota != null) t.push(`Alíquota do ICMS fixa em ${pct(num(r.icms_aliquota))} (no lugar da alíquota calculada pelo estado).`);
  const porAliq = r.icms_reducao_por_aliquota && Object.keys(r.icms_reducao_por_aliquota).length ? r.icms_reducao_por_aliquota : null;
  if (porAliq) {
    const itens = Object.entries(porAliq).sort((a, b) => num(b[0]) - num(a[0]))
      .map(([a, red]) => `${pct(num(a))} → reduz ${pct(num(red))}, sobra ${pct(cargaEfetiva(num(a), num(red)))}`);
    t.push(`A base do ICMS é reduzida conforme a alíquota da venda: ${itens.join("; ")}. Alíquota fora da lista: sem redução (sai como CST 00).`);
  } else if (num(r.icms_reducao_base) > 0) {
    t.push(`A base do ICMS é reduzida em ${pct(num(r.icms_reducao_base))}: o imposto é calculado só sobre ${pct(100 - num(r.icms_reducao_base))} do valor.`);
  }
  if (r.codigo_beneficio) t.push(`Vai na nota o código do benefício fiscal ${r.codigo_beneficio} (cBenef), que a SEFAZ exige quando há benefício.`);
  if (r.icms_desonerar) {
    t.push(`O ICMS que deixou de ser cobrado aparece no campo "ICMS desonerado" (motivo ${r.icms_motivo_desoneracao || "9"}${r.icms_motivo_desoneracao === "9" || !r.icms_motivo_desoneracao ? " - outros" : ""})` +
      (r.icms_abater_desonerado ? " e é abatido do total da nota." : ", sem mudar o total da nota."));
  }
  if (r.difal === true) t.push("Calcula o DIFAL (diferença entre a alíquota do estado do cliente e a interestadual), devido quando o cliente de outro estado não tem IE.");
  if (r.difal === false) t.push("Não calcula o DIFAL.");
  if (r.ipi_cst || r.ipi_aliquota != null) t.push(`IPI ${[r.ipi_cst && `CST ${r.ipi_cst}`, r.ipi_aliquota != null && `alíquota ${pct(num(r.ipi_aliquota))}`].filter(Boolean).join(", ")}.`);
  if (r.ipi_destacar === false) t.push("Não destaca o IPI na nota (a nota sai sem o grupo do IPI).");
  if (r.pis_cst || r.pis_aliquota != null || r.cofins_cst || r.cofins_aliquota != null) {
    t.push(`PIS/COFINS: ${[r.pis_cst && `PIS CST ${r.pis_cst}`, r.pis_aliquota != null && `PIS ${pct(num(r.pis_aliquota))}`, r.cofins_cst && `COFINS CST ${r.cofins_cst}`, r.cofins_aliquota != null && `COFINS ${pct(num(r.cofins_aliquota))}`].filter(Boolean).join(", ")}.`);
  }
  if (r.ibs_cbs_cst || r.ibs_cbs_class_trib) t.push(`IBS/CBS (Reforma Tributária): ${[r.ibs_cbs_cst && `CST ${r.ibs_cbs_cst}`, r.ibs_cbs_class_trib && `classificação ${r.ibs_cbs_class_trib}`].filter(Boolean).join(", ")}.`);
  if (r.observacao_nfe) t.push(`Texto nas informações complementares da nota: "${r.observacao_nfe}"`);
  if (!t.length) t.push("Ainda não troca nada: preencha o que a regra deve aplicar.");
  return t;
}

// ---------------------------------------------------------------------
// "E se eu vender…": qual regra vale e quanto fica o ICMS
// ---------------------------------------------------------------------
export type EntradaSimulacao = {
  unidade: { id: string; uf: string; icms_cst?: string | null; icms_aliquota_interna?: number | null; icms_reducao_base?: number | null; difal_ativo?: boolean | null };
  operacao: "venda" | "transferencia" | "remessa";
  ufDestino: string; contribuinte: boolean; tipo: string; ncm: string; importada: boolean; valor: number;
  aliquotasUf: Record<string, number>;
};

export type ResultadoSimulacao = {
  regra: RegraTributaria | null; interestadual: boolean; cst: string; aliquota: number; reducao: number; base: number; icms: number;
  carga: number; desonerado: number; cbenef: string | null; difal: number | null; ipiDestacado: boolean; avisos: string[];
};

export function simularVenda(regras: RegraTributaria[], e: EntradaSimulacao): ResultadoSimulacao {
  const ufO = e.unidade.uf.toUpperCase(), ufD = e.ufDestino.toUpperCase();
  const interestadual = ufO !== ufD;
  const regra = regraAplicavel(regras, {
    operacao: e.operacao, interestadual, contribuinte: e.contribuinte, tipo: e.tipo, ncm: e.ncm.replace(/\D/g, ""),
    origem: e.importada ? 1 : 0, cfop: "", unidade_id: e.unidade.id, uf_destino: ufD,
  });
  const avisos: string[] = [];
  const internaOrigem = e.aliquotasUf[ufO] ?? num(e.unidade.icms_aliquota_interna);
  let aliquota = regra?.icms_aliquota != null ? num(regra.icms_aliquota) : interestadual ? aliquotaInterestadual(ufO, ufD, e.importada ? 1 : 0) : internaOrigem;
  // venda interestadual para quem não tem IE: a alíquota é a interestadual e a diferença é o DIFAL do estado de destino
  const reducao = reducaoDaBase(aliquota, regra?.icms_reducao_base != null ? num(regra.icms_reducao_base) : num(e.unidade.icms_reducao_base), regra?.icms_reducao_por_aliquota);
  let cst = regra?.icms_cst || e.unidade.icms_cst || "00";
  if (cst === "20" && reducao === 0) { cst = "00"; avisos.push("A regra pede CST 20, mas não há redução para esta alíquota: a nota sai como CST 00."); }
  if (["40", "41", "50", "51"].includes(cst)) aliquota = 0;
  const base = aliquota ? r2(e.valor * (1 - reducao / 100)) : 0;
  const icms = r2(base * aliquota / 100);
  const cheio = r2(e.valor * (aliquota || (interestadual ? aliquotaInterestadual(ufO, ufD, e.importada ? 1 : 0) : internaOrigem)) / 100);
  const desonerado = regra?.icms_desonerar ? r2(cheio - icms) : 0;
  const difalLigado = regra?.difal != null ? !!regra.difal : e.unidade.difal_ativo !== false;
  const internaDestino = e.aliquotasUf[ufD];
  const difal = e.operacao === "venda" && interestadual && !e.contribuinte && difalLigado && internaDestino != null
    ? r2(Math.max(0, internaDestino - aliquota) / 100 * e.valor) : null;
  if (e.operacao === "venda" && interestadual && !e.contribuinte && internaDestino == null) avisos.push(`Sem a alíquota interna de ${ufD} cadastrada: o DIFAL não pôde ser estimado.`);
  if (regra?.cfop) avisos.push("Esta regra também depende do CFOP calculado da nota, que o teste não calcula: confira na emissão.");
  return {
    regra, interestadual, cst, aliquota, reducao, base, icms, carga: e.valor > 0 ? r2(icms / e.valor * 100) : 0, desonerado,
    cbenef: regra?.codigo_beneficio ?? null, difal, ipiDestacado: regra?.ipi_destacar !== false, avisos,
  };
}

// ---------------------------------------------------------------------
// Glossário e modelos prontos
// ---------------------------------------------------------------------
export const GLOSSARIO: { termo: string; texto: string }[] = [
  { termo: "CST do ICMS", texto: "O código que diz como o ICMS foi tratado no item: 00 = cheio, 20 = com redução da base, 40 = isento, 41 = não tributado, 50 = suspenso, 51 = diferido, 90 = outros." },
  { termo: "Redução da base de cálculo", texto: "O ICMS é calculado só sobre uma parte do valor. Ex.: venda de R$ 10.000 a 17% com 48,23% de redução: a base vira R$ 5.177 e o ICMS R$ 880,09 (carga de 8,80%)." },
  { termo: "Carga efetiva", texto: "Quanto de ICMS sobra de verdade sobre o valor da venda depois da redução: alíquota × (1 − redução)." },
  { termo: "cBenef", texto: "Código do benefício fiscal na nota. Santa Catarina exige quando o item tem benefício (redução, isenção, suspensão…); sem ele a SEFAZ rejeita a nota." },
  { termo: "ICMS desonerado", texto: "O valor de ICMS que deixou de ser cobrado por causa do benefício, informado num campo próprio da nota com o motivo (9 = outros). Pode ou não ser abatido do total." },
  { termo: "Alíquota interestadual", texto: "Venda para outro estado: 4% para mercadoria importada; 7% de Sul/Sudeste (menos ES) para Norte, Nordeste, Centro-Oeste e ES; 12% nos demais casos." },
  { termo: "DIFAL", texto: "Venda para consumidor final ou cliente sem IE de outro estado: a diferença entre a alíquota interna do estado do cliente e a interestadual vai para o estado do cliente (guia GNRE)." },
  { termo: "CFOP", texto: "O código da operação: 5xxx dentro do estado, 6xxx para outro estado. Ex.: 5101/6101 venda de produção própria, 5102/6102 revenda, 5152/6152 transferência, 5915/6915 remessa para conserto." },
  { termo: "IPI destacado", texto: "A indústria destaca o IPI na nota de saída do que fabrica (alíquota da TIPI pelo NCM). \"Não destacar\" tira o grupo do IPI da nota (ex.: revenda sem industrialização)." },
  { termo: "Origem da mercadoria", texto: "0 = nacional; 1, 2, 3 e 8 = importada (direta ou adquirida no mercado interno, ou com mais de 40% de conteúdo importado), que leva 4% na venda para outro estado." },
  { termo: "IBS/CBS", texto: "Os tributos novos da Reforma Tributária. Em 2026 é ano de teste: vão destacados na nota (CBS 0,9% e IBS 0,1%) sem pagamento." },
  { termo: "Ordem da regra", texto: "Vale a primeira regra ativa que combina com a nota, da menor ordem para a maior. Deixe as regras mais específicas (ex.: um NCM) com número menor." },
];

export type ModeloRegra = { id: string; titulo: string; paraQue: string; base: string; regra: Partial<RegraTributaria> & { reducoes?: string; uf?: string } };

/** Modelos prontos: abrem o formulário já preenchido (nada é salvo sem você conferir e clicar em Salvar). */
export const MODELOS_REGRA: ModeloRegra[] = [
  {
    id: "maquinas-sc", titulo: "Máquinas industriais da matriz SC — redução da base",
    paraQue: "Venda de máquinas fabricadas em SC com a carga de ICMS reduzida (8,80% em 17% e 12%; 5,14% em 7%), como o Tiny emitia.",
    base: "RICMS-SC, Anexo 2, art. 9, I, e Convênio ICMS 52/91 (Anexo I). cBenef SC820028. Confirmar com o contador se cada NCM está no anexo.",
    regra: { nome: "Máquinas industriais SC - redução art. 9, I, Anexo 2 RICMS-SC", prioridade: 10, operacao: "venda", tipo_produto: "maquina", ncm_prefixo: "84186910", icms_cst: "20",
      reducoes: "17%=48,23 · 12%=26,66 · 7%=26,57", codigo_beneficio: "SC820028", icms_desonerar: true, icms_motivo_desoneracao: "9", icms_abater_desonerado: false,
      observacao_nfe: "Base de cálculo do ICMS reduzida conforme art. 9, I, do Anexo 2 do RICMS-SC/01 (Convênio ICMS 52/91).", uf: "SC" },
  },
  {
    id: "maquinas-sp", titulo: "Máquinas industriais da filial SP — redução da base",
    paraQue: "Mesma ideia para as máquinas vendidas pela filial SP: carga de 8,80% dentro de SP e para S/SE, 5,14% para N/NE/CO e ES.",
    base: "RICMS-SP, Anexo II, art. 12, e Convênio ICMS 52/91. Confirmar com o contador os percentuais, os NCM e se SP pede o cBenef antes de usar.",
    regra: { nome: "Máquinas industriais SP - redução Anexo II art. 12 RICMS-SP", prioridade: 11, operacao: "venda", tipo_produto: "maquina", ncm_prefixo: "84186910", icms_cst: "20",
      reducoes: "18%=51,11 · 12%=26,67 · 7%=26,57", icms_desonerar: true, icms_motivo_desoneracao: "9", icms_abater_desonerado: false,
      observacao_nfe: "Base de cálculo do ICMS reduzida conforme art. 12 do Anexo II do RICMS-SP (Convênio ICMS 52/91).", uf: "SP" },
  },
  {
    id: "importadas-4", titulo: "Peças importadas para outro estado — 4%",
    paraQue: "Garante 4% de ICMS na venda interestadual de peça importada (origem 1, 2, 3 ou 8). O ERP já faz isso pela origem do produto; a regra deixa explícito.",
    base: "Resolução do Senado 13/2012. A origem certa no cadastro do produto é o que manda.",
    regra: { nome: "Peças importadas (4%)", prioridade: 60, operacao: "venda", destino: "interestadual", tipo_produto: "peca", origem_mercadoria: "importada", icms_aliquota: 4 },
  },
  {
    id: "difal", titulo: "Venda para consumidor final de outro estado (DIFAL)",
    paraQue: "Liga o cálculo do DIFAL e põe a observação na nota quando o cliente de outro estado não tem IE (sorveteria pequena, pessoa física).",
    base: "EC 87/2015 e LC 190/2022. A guia (GNRE) sai pelo ERP.",
    regra: { nome: "Venda interestadual para consumidor final (DIFAL)", prioridade: 50, operacao: "venda", destino: "interestadual", tipo_cliente: "nao_contribuinte", difal: true,
      observacao_nfe: "DIFAL recolhido ao estado de destino conforme EC 87/2015 e LC 190/2022." },
  },
  {
    id: "transferencia", titulo: "Transferência SC → SP sem destaque do ICMS",
    paraQue: "Nota de transferência entre a matriz e a filial com ICMS não tributado (CST 41). SC rejeita sem o cBenef: peça o código ao contador antes de usar.",
    base: "STF, ADC 49, e LC 204/2023 (transferência entre estabelecimentos do mesmo dono não é fato gerador). A opção de destacar o ICMS para levar o crédito é decisão do contador.",
    regra: { nome: "Transferência SC → SP (sem destaque)", prioridade: 20, operacao: "transferencia", icms_cst: "41", observacao_nfe: "Transferência entre estabelecimentos do mesmo titular (LC 204/2023).", uf: "SC" },
  },
  {
    id: "conserto", titulo: "Remessa para conserto fora do estado — suspensão",
    paraQue: "Máquina ou peça que sai para conserto e volta: ICMS suspenso (CST 50). Vale em nota que não é venda, com o CFOP 6915.",
    base: "Convênio AE 15/74 e RICMS do estado. Em SC precisa do cBenef de suspensão (no Tiny a suspensão usava o SC840021): confirmar com o contador para esta operação.",
    regra: { nome: "Remessa para conserto (6915) - suspensão", prioridade: 30, cfop: "6915", icms_cst: "50", icms_desonerar: false,
      observacao_nfe: "ICMS suspenso: remessa para conserto com retorno (Convênio AE 15/74)." },
  },
];
