// Modo fiscal avançado (Lucro Real): o que transforma perdas, consumo interno, sucata, serviços e fretes em despesa
// dedutível e em crédito de PIS/COFINS, e o que tira essa dedução (falta de documento). Regras puras, testadas;
// as telas ficam em components/fiscal/. Só planejamento legal: quando a regra depende do estado ou mudou há pouco,
// o texto diz "confirmar com o contador".
import { tipoLancamento, type TipoLanc } from "./extratoTipos";

export type MotivoBaixa =
  | "quebra_fabricacao" | "defeito_fornecedor" | "obsolescencia" | "furto_extravio" | "consumo_interno"
  | "manutencao_fabrica" | "sucata" | "amostra_brinde";

export type Dedutibilidade = "custo" | "despesa" | "condicionada" | "nao_e_perda" | "indedutivel";

export type RegraBaixa = {
  id: MotivoBaixa; rotulo: string; ajuda: string;
  dedutivel: Dedutibilidade;
  /** documento que segura a dedução numa fiscalização */
  documento: string;
  /** o campo "evidência" é obrigatório no modo avançado */
  exigeEvidencia: boolean;
  exigeFornecedor?: boolean; exigeEquipamento?: boolean; pedePeso?: boolean;
  /** estornar o crédito de PIS/COFINS (e de ICMS) tomado na compra */
  estornaCredito: boolean;
  notaFiscal: string;
  base: string;
};

export const REGRAS_BAIXA: RegraBaixa[] = [
  {
    id: "quebra_fabricacao", rotulo: "Quebra ou refugo na fabricação",
    ajuda: "Peça ou material que se perdeu no processo (corte errado, solda, montagem, teste).",
    dedutivel: "custo", documento: "Registro interno da perda (quantidade, causa, quem apontou) e, se possível, foto — a baixa no ERP já é esse registro",
    exigeEvidencia: false, estornaCredito: false,
    notaFiscal: "Não precisa de nota se for perda normal do processo (confirmar com o contador se o estado pede NF de baixa)",
    base: "RIR/2018 (Decreto 9.580/2018), art. 303, I — quebras e perdas razoáveis na fabricação, transporte e manuseio integram o custo; perda normal não exige laudo, basta registro interno, foto ou inventário (Solução de Consulta Cosit 150/2025)",
  },
  {
    id: "defeito_fornecedor", rotulo: "Defeito de fornecedor (devolver)",
    ajuda: "Peça que chegou com defeito: não é perda, volta para o fornecedor com NF de devolução.",
    dedutivel: "nao_e_perda", documento: "NF de devolução de compra ligada à nota do fornecedor",
    exigeEvidencia: false, exigeFornecedor: true, estornaCredito: true,
    notaFiscal: "Emitir NF de devolução: CFOP 5.201/6.201 (compra para industrialização) ou 5.202/6.202 (compra para revenda)",
    base: "A devolução anula a compra e os créditos dela; o valor volta como crédito com o fornecedor (abatimento ou reembolso)",
  },
  {
    id: "obsolescencia", rotulo: "Obsolescência ou deterioração",
    ajuda: "Item parado que não tem mais uso ou venda, ou que estragou (ferrugem, umidade, validade).",
    dedutivel: "condicionada", documento: "Laudo (técnico ou de autoridade) com quantidades e motivo + fotos + NF de baixa",
    exigeEvidencia: true, estornaCredito: true,
    notaFiscal: "NF de baixa de estoque, CFOP 5.927 (perda, roubo ou deterioração), com estorno do ICMS",
    base: "RIR/2018, art. 303, II — perdas por deterioração ou obsolescência, comprovadas por laudo; estorno de PIS/COFINS: Leis 10.637/2002 e 10.833/2003, art. 3º, § 13; ICMS: LC 87/1996, art. 21, IV",
  },
  {
    id: "furto_extravio", rotulo: "Furto, roubo ou extravio",
    ajuda: "Peça que sumiu. Sem boletim de ocorrência a perda não é aceita como despesa.",
    dedutivel: "condicionada", documento: "Boletim de ocorrência (ou inquérito trabalhista, se foi funcionário) + NF de baixa",
    exigeEvidencia: true, estornaCredito: true,
    notaFiscal: "NF de baixa de estoque, CFOP 5.927, com estorno do ICMS",
    base: "Perdas por furto, desfalque ou apropriação indébita são dedutíveis com queixa à polícia ou inquérito trabalhista (RIR/2018, art. 376; Lei 4.506/1964, art. 47, § 3º); estorno de PIS/COFINS: art. 3º, § 13",
  },
  {
    id: "consumo_interno", rotulo: "Uso e consumo interno",
    ajuda: "Material tirado do estoque para uso da empresa (limpeza, EPI, escritório, ferramentas pequenas).",
    dedutivel: "despesa", documento: "Requisição interna (quem retirou, para quê) — a baixa no ERP já é esse registro",
    exigeEvidencia: false, estornaCredito: true,
    notaFiscal: "Item comprado para revenda ou industrialização e usado internamente: estornar o crédito de ICMS (CFOP de uso e consumo conforme o estado — confirmar com o contador)",
    base: "Despesa necessária à atividade é dedutível (RIR/2018, art. 311); crédito de PIS/COFINS só fica se o item for insumo (STJ, REsp 1.221.170)",
  },
  {
    id: "manutencao_fabrica", rotulo: "Manutenção de máquina da fábrica",
    ajuda: "Peça aplicada em máquina, ferramenta ou equipamento de produção da própria MF.",
    dedutivel: "despesa", documento: "Registro da manutenção com a máquina, as peças e o serviço de terceiro (NF do prestador)",
    exigeEvidencia: false, exigeEquipamento: true, estornaCredito: false,
    notaFiscal: "Não emite nota; o serviço de terceiro precisa de NFS-e em nome da MF",
    base: "Peças e serviços de manutenção das máquinas de produção são insumo: crédito de PIS/COFINS (STJ, REsp 1.221.170; IN RFB 2.121/2022, art. 172 — confirmar com o contador)",
  },
  {
    id: "sucata", rotulo: "Sucata, cavaco ou descarte",
    ajuda: "Sobras de metal e peças inservíveis que vão para o depósito de sucata (pesar antes).",
    dedutivel: "custo", documento: "Peso (kg) na entrada do depósito de sucata e NF de venda para a recicladora",
    exigeEvidencia: false, pedePeso: true, estornaCredito: false,
    notaFiscal: "Na venda da sucata, emitir NF de venda para a recicladora. Confirmar com o contador o ICMS (diferimento no estado) e o PIS/COFINS da venda",
    base: "Sobras normais da produção ficam no custo (RIR/2018, art. 303, I). A tributação da venda de sucata mudou em 2026 (STF, Tema 304, e Lei 15.394/2026, que reescreveu os arts. 47 e 48 da Lei 11.196/2005) — confirmar com o contador",
  },
  {
    id: "amostra_brinde", rotulo: "Amostra ou brinde",
    ajuda: "Peça dada de graça a cliente. Brinde não é dedutível; amostra para demonstração precisa de NF.",
    dedutivel: "indedutivel", documento: "NF de remessa de amostra (CFOP 5.911/6.911) ou registro do brinde",
    exigeEvidencia: false, estornaCredito: false,
    notaFiscal: "Amostra grátis: CFOP 5.911/6.911; bonificação/brinde: CFOP 5.910/6.910",
    base: "Brindes são indedutíveis no IRPJ e na CSLL (Lei 9.249/1995, art. 13, VII)",
  },
];

export const regraBaixa = (m: string | null | undefined) => REGRAS_BAIXA.find((r) => r.id === m) ?? null;

export const ROTULO_DEDUTIVEL: Record<Dedutibilidade, { label: string; cor: string }> = {
  custo: { label: "Entra no custo", cor: "bg-emerald-100 text-emerald-800" },
  despesa: { label: "Despesa dedutível", cor: "bg-emerald-100 text-emerald-800" },
  condicionada: { label: "Dedutível com documento", cor: "bg-amber-100 text-amber-800" },
  nao_e_perda: { label: "Devolver ao fornecedor", cor: "bg-sky-100 text-sky-800" },
  indedutivel: { label: "Não dedutível", cor: "bg-red-100 text-red-800" },
};

export type BaixaEstoque = {
  id: string; numero: number; unidade_id: string; motivo: MotivoBaixa; produto_id: string; quantidade: number;
  custo_unitario: number | null; valor: number | null; peso_kg: number | null; equipamento: string | null; fornecedor_id: string | null;
  nota_devolucao_id: string | null; evidencia: string | null; descricao: string; situacao: "registrada" | "comprovada" | "cancelada";
  cancelada_motivo: string | null; criado_por_nome: string | null; created_at: string;
};

/** O que falta para a baixa segurar a dedução. Vazio = documentada. */
export function pendenciasBaixa(b: Pick<BaixaEstoque, "motivo" | "evidencia" | "fornecedor_id" | "nota_devolucao_id" | "equipamento" | "peso_kg" | "situacao">): string[] {
  if (b.situacao === "cancelada") return [];
  const r = regraBaixa(b.motivo);
  if (!r) return ["motivo desconhecido"];
  const falta: string[] = [];
  if (r.exigeEvidencia && !String(b.evidencia ?? "").trim()) falta.push(r.id === "furto_extravio" ? "boletim de ocorrência" : "laudo e fotos");
  if (r.exigeFornecedor && !b.fornecedor_id) falta.push("fornecedor");
  if (r.id === "defeito_fornecedor" && !b.nota_devolucao_id) falta.push("NF de devolução");
  if (r.exigeEquipamento && !String(b.equipamento ?? "").trim()) falta.push("máquina onde foi aplicada");
  if (r.pedePeso && !(Number(b.peso_kg) > 0)) falta.push("peso (kg)");
  return falta;
}

/** Resumo das baixas por motivo: quantidade, valor e quantas ainda sem documento. */
export function resumoBaixas(baixas: BaixaEstoque[]) {
  const m = new Map<MotivoBaixa, { motivo: MotivoBaixa; n: number; valor: number; pendentes: number }>();
  for (const b of baixas) {
    if (b.situacao === "cancelada") continue;
    const x = m.get(b.motivo) ?? { motivo: b.motivo, n: 0, valor: 0, pendentes: 0 };
    x.n += 1;
    x.valor = Math.round((x.valor + Number(b.valor ?? 0)) * 100) / 100;
    if (pendenciasBaixa(b).length) x.pendentes += 1;
    m.set(b.motivo, x);
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor);
}

/* --------------------------------------- pagamentos sem comprovação --------------------------------------- */

export type GrupoComprovacao = "pessoa" | "empresa" | "boleto" | "combustivel_veiculo" | "imposto_tarifa" | "funcionario" | "outra";

export const GRUPOS_COMPROVACAO: Record<GrupoComprovacao, { rotulo: string; risco: "alto" | "medio" | "baixo"; oQueFazer: string }> = {
  pessoa: {
    rotulo: "Pix para pessoa física ou sem nome", risco: "alto",
    oQueFazer: "Ligar a NF, o RPA (autônomo, com INSS e IRRF retidos) ou o recibo com CPF. Pagamento sem beneficiário ou sem causa identificada não é dedutível e sofre IRRF de 35% (Lei 8.981/1995, art. 61).",
  },
  empresa: {
    rotulo: "Pix para empresa", risco: "medio",
    oQueFazer: "Ligar a NF-e (compra) ou a NFS-e (serviço) do fornecedor. Sem a nota, a despesa pode ser glosada e o crédito de PIS/COFINS se perde.",
  },
  boleto: {
    rotulo: "Boletos pagos", risco: "medio",
    oQueFazer: "Conciliar com a conta a pagar da NF (o ERP sugere pela nota e pelo valor).",
  },
  combustivel_veiculo: {
    rotulo: "Combustível, oficina e pedágio", risco: "baixo",
    oQueFazer: "Guardar a NF do posto/oficina em nome da MF (CNPJ) e ligar ao veículo da empresa. Abastecimento sem nota não é dedutível.",
  },
  imposto_tarifa: { rotulo: "Impostos e tarifas", risco: "baixo", oQueFazer: "O comprovante do banco basta; o contador classifica." },
  funcionario: { rotulo: "Funcionários", risco: "baixo", oQueFazer: "Conferir se está na folha (eSocial). Pagamento por fora da folha não é dedutível e gera encargos." },
  outra: { rotulo: "Compras no cartão/débito e outras saídas", risco: "medio", oQueFazer: "Pedir a nota em nome da MF; compra sem nota não vira custo nem crédito." },
};

const EMPRESA = /\b(ltda|eireli|me|epp|s\/?a|comercio|comercial|industria|servicos|distribuidora|transportes?|logistica|holding|cia)\b/;

/** Em que grupo de comprovação cai a saída do extrato (pela descrição do banco). */
export function grupoComprovacao(descricao: string | null | undefined, valor: number, funcionarios: { nome: string }[] = []): GrupoComprovacao {
  const t: TipoLanc = tipoLancamento(descricao, valor, funcionarios);
  const d = String(descricao ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (t === "funcionario") return "funcionario";
  if (t === "imposto" || t === "tarifa") return "imposto_tarifa";
  if (t === "combustivel" || t === "veiculo" || t === "pedagio") return "combustivel_veiculo";
  if (t === "pix_enviado") return EMPRESA.test(d) ? "empresa" : "pessoa";
  if (/\b(boleto|pagamento de titulo|pag titulo|cobranca)\b/.test(d)) return "boleto";
  return "outra";
}

export type SaidaExtrato = { id: string; data: string; valor: number; descricao: string | null; status: string; conta_pagar_id: string | null; identificador?: string | null };

/** Saídas dos extratos ainda sem documento (sem conta a pagar ligada e não ignoradas nem transferência), por grupo. */
export function comprovacaoSaidas(saidas: SaidaExtrato[], funcionarios: { nome: string }[] = []) {
  const vistos = new Set<string>();
  const grupos = new Map<GrupoComprovacao, { grupo: GrupoComprovacao; n: number; total: number; pendentes: number; pendenteValor: number }>();
  for (const s of saidas) {
    if (Number(s.valor) >= 0 || s.status === "transferencia" || s.status === "ignorado") continue;
    if (s.identificador) { if (vistos.has(s.identificador)) continue; vistos.add(s.identificador); }
    const g = grupoComprovacao(s.descricao, Number(s.valor), funcionarios);
    const x = grupos.get(g) ?? { grupo: g, n: 0, total: 0, pendentes: 0, pendenteValor: 0 };
    const v = -Number(s.valor);
    x.n += 1;
    x.total = Math.round((x.total + v) * 100) / 100;
    if (!s.conta_pagar_id && s.status !== "conciliado") { x.pendentes += 1; x.pendenteValor = Math.round((x.pendenteValor + v) * 100) / 100; }
    grupos.set(g, x);
  }
  return [...grupos.values()].sort((a, b) => b.pendenteValor - a.pendenteValor);
}

/* ------------------------------------------------ fretes ------------------------------------------------ */

export const ALIQ_PIS_COFINS = 0.0925;

/**
 * Crédito estimado de PIS/COFINS sobre os fretes pagos pela MF com CT-e: frete na compra de insumo entra no custo
 * de aquisição; frete na venda dá crédito pelo art. 3º, IX. Transferência entre unidades: só com produto acabado,
 * por decisão do CARF/STJ — fica de fora da estimativa.
 */
export function creditoFretes(ctes: { mf_paga: boolean; sentido: string; valor: number }[]) {
  const pagos = ctes.filter((c) => c.mf_paga && (c.sentido === "entrada" || c.sentido === "saida"));
  const base = Math.round(pagos.reduce((s, c) => s + Number(c.valor), 0) * 100) / 100;
  return { base, credito: Math.round(base * ALIQ_PIS_COFINS * 100) / 100, n: pagos.length };
}

/** Conta a pagar de frete sem CT-e ligado (pela categoria ou descrição). */
export const ehFrete = (c: { categoria?: string | null; descricao?: string | null }) => /\bfrete/i.test(`${c.categoria ?? ""} ${c.descricao ?? ""}`);

/** Conta a pagar de serviço para fornecedor sem CNPJ/CPF: despesa sem beneficiário identificado. */
export const servicoSemDocumento = (c: { categoria?: string | null }, f: { cnpj?: string | null } | null | undefined) =>
  /servi|manuten|frete|montag|torne|usinag|terceir/i.test(c.categoria ?? "") && !String(f?.cnpj ?? "").replace(/\D/g, "");
