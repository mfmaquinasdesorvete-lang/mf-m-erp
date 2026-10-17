// Parcelamentos de impostos: o que está parcelado (Receita Federal, PGFN, SEFAZ SC/SP, prefeitura), em quantas vezes,
// o que já foi pago, quem pagou (a MF, outra empresa, conta pessoal ou o contador) e o que vence. No banco:
// public.parcelamentos e public.parcelamento_parcelas; os avisos saem todo dia pelo pg_cron (avisar_parcelamentos).
// As regras de cancelamento (rescisão) aqui são as gerais da lei; as de cada parcelamento estão no termo de adesão:
// conferir com o contador. As guias (DARF, DAE, DARE) saem no e-CAC, no Regularize e na SEFAZ: quem gera é o contador.
import { diaDoMes, iso, somarMes, ultimoDiaUtil } from "./obrigacoes";

export type Orgao = "receita_federal" | "pgfn" | "sefaz_sc" | "sefaz_sp" | "prefeitura" | "outro";
export type RegraVencimento = "ultimo_dia_util" | "dia";
export type PagoPor = "mf" | "outra_empresa" | "pessoal" | "contador" | "outro";
export type SituacaoParcelamento = "ativo" | "quitado" | "rescindido" | "cancelado";

export type Parcelamento = {
  id: string; unidade_id: string | null; orgao: Orgao; modalidade: string | null; numero: string | null; descricao: string | null;
  data_adesao: string | null; valor_consolidado: number | null; qtd_parcelas: number; valor_parcela: number | null;
  primeira_parcela: string; vencimento_regra: RegraVencimento; dia_vencimento: number | null; corrige_selic: boolean;
  max_atrasos: number; rescinde_ultima: boolean; situacao: SituacaoParcelamento; observacoes: string | null;
};
export type Parcela = {
  id: string; parcelamento_id: string; numero: number; vencimento: string; valor: number | null;
  situacao: "a_pagar" | "pago" | "anulada"; pago_em: string | null; valor_pago: number | null; pago_por: PagoPor | null;
  pago_por_nome: string | null; extrato_lancamento_id?: string | null; observacao: string | null;
};

type InfoOrgao = {
  nome: string; curto: string; cor: string; regra: RegraVencimento; corrige_selic: boolean; max_atrasos: number; rescinde_ultima: boolean;
  /** regra geral de vencimento e cancelamento, em português simples */
  nota: string; modalidades: string[];
};

/** Cada órgão com a sua cor (fundo forte, letra branca: não muda com o tema) e o padrão para um parcelamento novo. */
export const ORGAOS: Record<Orgao, InfoOrgao> = {
  receita_federal: {
    nome: "Receita Federal", curto: "Receita", cor: "#1d4ed8", regra: "ultimo_dia_util", corrige_selic: true, max_atrasos: 3, rescinde_ultima: true,
    nota: "Parcela vence no último dia útil do mês e é corrigida pela Selic (a guia do mês sai no e-CAC). Cancela com 3 parcelas sem pagar, seguidas ou não, ou com 1 sem pagar estando pagas todas as outras (Lei 10.522/2002, art. 14-B). Confirmar com o contador.",
    modalidades: ["Parcelamento ordinário (Lei 10.522)", "Parcelamento simplificado", "Parcelamento de contribuições previdenciárias", "Parcelamento de débitos do eSocial/DCTFWeb"],
  },
  pgfn: {
    nome: "PGFN (dívida ativa da União)", curto: "PGFN", cor: "#7c3aed", regra: "ultimo_dia_util", corrige_selic: true, max_atrasos: 3, rescinde_ultima: true,
    nota: "Dívida ativa federal: parcelamento ou transação no Regularize. As regras de cancelamento estão no termo ou no edital da adesão (conferir no Regularize e com o contador).",
    modalidades: ["Transação tributária (PGFN)", "Transação de pequeno valor", "Parcelamento ordinário na dívida ativa"],
  },
  sefaz_sc: {
    nome: "SEFAZ SC (ICMS)", curto: "SEFAZ SC", cor: "#047857", regra: "dia", corrige_selic: true, max_atrasos: 3, rescinde_ultima: false,
    nota: "ICMS de Santa Catarina: o vencimento e quantas parcelas atrasadas cancelam estão no termo do parcelamento (conferir com o contador).",
    modalidades: ["Parcelamento de ICMS", "Parcelamento de ICMS em dívida ativa", "Programa especial (REFIS estadual)"],
  },
  sefaz_sp: {
    nome: "SEFAZ SP (ICMS)", curto: "SEFAZ SP", cor: "#c2410c", regra: "dia", corrige_selic: true, max_atrasos: 3, rescinde_ultima: false,
    nota: "ICMS de São Paulo: o vencimento e quantas parcelas atrasadas cancelam estão no termo do parcelamento, no portal da SEFAZ/PGE (conferir com o contador).",
    modalidades: ["Parcelamento de ICMS (PEP)", "Parcelamento de ICMS em dívida ativa (PGE)", "Programa especial (acordo/transação SP)"],
  },
  prefeitura: {
    nome: "Prefeitura (ISS, IPTU, taxas)", curto: "Prefeitura", cor: "#0f766e", regra: "dia", corrige_selic: false, max_atrasos: 3, rescinde_ultima: false,
    nota: "Imposto municipal: vencimento e cancelamento conforme a lei do município e o termo (conferir com o contador).",
    modalidades: ["Parcelamento de ISS", "Parcelamento de IPTU", "Parcelamento de taxas"],
  },
  outro: {
    nome: "Outro órgão", curto: "Outro", cor: "#475569", regra: "dia", corrige_selic: false, max_atrasos: 3, rescinde_ultima: false,
    nota: "Vencimento e cancelamento conforme o termo do parcelamento (conferir com o contador).",
    modalidades: ["Parcelamento", "Acordo"],
  },
};
export const LISTA_ORGAOS = Object.keys(ORGAOS) as Orgao[];

export const PAGO_POR: Record<PagoPor, { nome: string; curto: string; cor: string; terceiro: boolean }> = {
  mf: { nome: "MF (conta da empresa)", curto: "MF", cor: "#047857", terceiro: false },
  outra_empresa: { nome: "Outra empresa", curto: "Outra empresa", cor: "#be185d", terceiro: true },
  pessoal: { nome: "Conta pessoal (sócio)", curto: "Pessoal", cor: "#7c3aed", terceiro: true },
  contador: { nome: "Contador", curto: "Contador", cor: "#0284c7", terceiro: true },
  // "outro" também serve para a parcela paga antes do ERP sem saber por quem: não entra na soma de terceiros
  outro: { nome: "Outro / não identificado", curto: "Outro", cor: "#475569", terceiro: false },
};
export const LISTA_PAGO_POR = Object.keys(PAGO_POR) as PagoPor[];

export const SITUACOES_PARCELAMENTO: Record<SituacaoParcelamento, string> = {
  ativo: "Em dia ou pagando", quitado: "Quitado", rescindido: "Cancelado pelo órgão (rescindido)", cancelado: "Desistência / substituído",
};

const ate2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Vencimentos das parcelas: a 1ª na data informada (o recibo da adesão diz qual é); as outras, mês a mês, no último dia
 * útil (Receita e PGFN) ou num dia fixo. Dia que não é útil vai para o dia útil de antes: avisar cedo nunca faz perder prazo.
 */
export function gerarVencimentos({ primeira, qtd, regra, dia }: { primeira: string; qtd: number; regra: RegraVencimento; dia?: number | null }): string[] {
  const [ano, mes, d] = primeira.split("-").map(Number);
  const out = [primeira];
  for (let k = 1; k < qtd; k++) {
    const m = somarMes(ano, mes, k);
    out.push(regra === "ultimo_dia_util" ? ultimoDiaUtil(m.ano, m.mes) : diaDoMes(m.ano, m.mes, dia || d, "antecipa"));
  }
  return out;
}

/** Valor de cada parcela: o informado; sem ele, o consolidado dividido (os centavos que sobram vão para a última). */
export function valoresParcelas(qtd: number, valorParcela: number | null | undefined, consolidado: number | null | undefined): (number | null)[] {
  if (valorParcela != null && valorParcela > 0) return Array.from({ length: qtd }, () => ate2(valorParcela));
  if (!consolidado || consolidado <= 0) return Array.from({ length: qtd }, () => null);
  const base = Math.floor((consolidado / qtd) * 100) / 100;
  return Array.from({ length: qtd }, (_, i) => (i === qtd - 1 ? ate2(consolidado - base * (qtd - 1)) : base));
}

/** As parcelas que o parcelamento deve ter (número, vencimento, valor). */
export function gerarParcelas(p: Pick<Parcelamento, "primeira_parcela" | "qtd_parcelas" | "vencimento_regra" | "dia_vencimento" | "valor_parcela" | "valor_consolidado">) {
  const venc = gerarVencimentos({ primeira: p.primeira_parcela, qtd: p.qtd_parcelas, regra: p.vencimento_regra, dia: p.dia_vencimento });
  const valores = valoresParcelas(p.qtd_parcelas, p.valor_parcela, p.valor_consolidado);
  return venc.map((vencimento, i) => ({ numero: i + 1, vencimento, valor: valores[i] }));
}

export type SituacaoParcela = "paga" | "anulada" | "atrasada" | "hoje" | "vence_logo" | "a_vencer";
export const ROTULO_PARCELA: Record<SituacaoParcela, string> = {
  paga: "Paga", anulada: "Anulada", atrasada: "Atrasada", hoje: "Vence hoje", vence_logo: "Vence em até 7 dias", a_vencer: "A vencer",
};
/** Cor de fundo forte de cada situação (letra branca). */
export const COR_PARCELA: Record<SituacaoParcela, string> = {
  paga: "#047857", anulada: "#94a3b8", atrasada: "#dc2626", hoje: "#ea580c", vence_logo: "#d97706", a_vencer: "#64748b",
};

export const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 864e5);

export function situacaoParcela(p: Pick<Parcela, "situacao" | "vencimento">, hoje: string): SituacaoParcela {
  if (p.situacao === "anulada") return "anulada";
  if (p.situacao === "pago") return "paga";
  const d = diasEntre(hoje, p.vencimento);
  return d < 0 ? "atrasada" : d === 0 ? "hoje" : d <= 7 ? "vence_logo" : "a_vencer";
}

export type Risco = "rescisao" | "alto" | "atencao" | "ok" | "encerrado";
export const RISCO: Record<Risco, { nome: string; cor: string; texto: string }> = {
  rescisao: { nome: "Pode ser cancelado", cor: "#b91c1c", texto: "Já está no ponto em que o órgão pode cancelar o parcelamento: pagar as atrasadas hoje e falar com o contador." },
  alto: { nome: "Risco alto", cor: "#ea580c", texto: "Mais uma parcela sem pagar e o parcelamento pode ser cancelado." },
  atencao: { nome: "Atenção", cor: "#d97706", texto: "Tem parcela atrasada ou vencendo nos próximos 7 dias." },
  ok: { nome: "Em dia", cor: "#047857", texto: "Nenhuma parcela atrasada." },
  encerrado: { nome: "Encerrado", cor: "#475569", texto: "Parcelamento quitado ou encerrado." },
};

/** Números do parcelamento: pagas, saldo, atrasadas, próxima, quanto foi pago por fora da MF e o risco de cancelar. */
export function resumoParcelamento(p: Pick<Parcelamento, "situacao" | "max_atrasos" | "rescinde_ultima" | "qtd_parcelas">, parcelas: Parcela[], hoje: string) {
  const validas = parcelas.filter((x) => x.situacao !== "anulada").sort((a, b) => a.numero - b.numero);
  const pagas = validas.filter((x) => x.situacao === "pago");
  const abertas = validas.filter((x) => x.situacao === "a_pagar");
  const atrasadas = abertas.filter((x) => x.vencimento < hoje);
  const futuras = abertas.filter((x) => x.vencimento >= hoje).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const valorPago = ate2(pagas.reduce((t, x) => t + Number(x.valor_pago ?? x.valor ?? 0), 0));
  const pagoTerceiros = ate2(pagas.filter((x) => x.pago_por && PAGO_POR[x.pago_por]?.terceiro).reduce((t, x) => t + Number(x.valor_pago ?? x.valor ?? 0), 0));
  const saldo = ate2(abertas.reduce((t, x) => t + Number(x.valor ?? 0), 0));
  const valorAtrasado = ate2(atrasadas.reduce((t, x) => t + Number(x.valor ?? 0), 0));
  const proxima = futuras[0] ?? null;
  let risco: Risco = "ok";
  if (p.situacao !== "ativo") risco = "encerrado";
  // 1 sem pagar com todas as outras pagas: na Receita, cancela (art. 14-B, II); vale para quando não sobra parcela futura
  else if (atrasadas.length >= p.max_atrasos || (p.rescinde_ultima && atrasadas.length > 0 && !futuras.length && validas.length > 1)) risco = "rescisao";
  else if (atrasadas.length > 0 && atrasadas.length >= p.max_atrasos - 1) risco = "alto";
  else if (atrasadas.length > 0 || (proxima && diasEntre(hoje, proxima.vencimento) <= 7)) risco = "atencao";
  return {
    total: validas.length, pagas: pagas.length, abertas: abertas.length, atrasadas, proxima, valorPago, pagoTerceiros, saldo, valorAtrasado, risco,
    fim: validas[validas.length - 1]?.vencimento ?? null, faltam: p.qtd_parcelas - pagas.length,
  };
}

/** Parcelas em aberto até a data (atrasadas primeiro, depois por vencimento). */
export function aVencer(parcelas: Parcela[], ate: string) {
  return parcelas.filter((x) => x.situacao === "a_pagar" && x.vencimento <= ate).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

/** Mensagem para pedir ao contador a lista dos parcelamentos (sem dado sigiloso: só o que mandar). */
export const MENSAGEM_CONTADOR = [
  "Olá! Estou colocando no ERP os parcelamentos de impostos da MF (matriz SC e filial SP) para acompanhar os vencimentos e não perder prazo.",
  "Pode me mandar, por favor:",
  "1) A lista de todos os parcelamentos, ativos e antigos — Receita Federal, PGFN (dívida ativa), SEFAZ SC, SEFAZ SP e prefeitura —, com número, modalidade, data de adesão, valor consolidado, quantidade de parcelas e quantas já foram pagas;",
  "2) O PDF do recibo ou termo de adesão e o extrato de cada um (e-CAC, Regularize, SEFAZ);",
  "3) Quais estão em atraso hoje e se algum corre risco de ser cancelado;",
  "4) As guias (DARF/DAE/DARE) de cada mês, assim que gerar.",
  "Algumas parcelas foram pagas por outra empresa ou por conta pessoal: vou registrar quem pagou e mando os comprovantes para você ver como lançar (mútuo, adiantamento ou aporte).",
  "Obrigado!",
].join("\n");

/** AAAA-MM-DD de hoje + n dias. */
export const somarDiasIso = (dia: string, n: number) => { const [a, m, d] = dia.split("-").map(Number); return iso(a, m, d + n); };
