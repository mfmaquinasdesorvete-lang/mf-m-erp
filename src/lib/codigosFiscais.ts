// Códigos da NF-e mais usados (CST/CSOSN, cClassTrib) com a descrição, para listas de escolha.
// A lista só sugere: qualquer código válido pode ser digitado.

export type Codigo = readonly [codigo: string, descricao: string];

export const CST_ICMS: Codigo[] = [
  ["00", "Tributada integralmente"],
  ["10", "Tributada e com cobrança do ICMS por ST"],
  ["20", "Com redução de base de cálculo"],
  ["30", "Isenta ou não tributada e com cobrança por ST"],
  ["40", "Isenta"],
  ["41", "Não tributada"],
  ["50", "Suspensão"],
  ["51", "Diferimento"],
  ["60", "ICMS cobrado anteriormente por ST"],
  ["70", "Com redução de base e cobrança por ST"],
  ["90", "Outras"],
];

export const CST_IPI: Codigo[] = [
  ["50", "Saída tributada"],
  ["51", "Saída tributada com alíquota zero"],
  ["52", "Saída isenta"],
  ["53", "Saída não tributada"],
  ["54", "Saída imune"],
  ["55", "Saída com suspensão"],
  ["99", "Outras saídas"],
];

export const CST_PIS_COFINS: Codigo[] = [
  ["01", "Tributável (alíquota básica)"],
  ["02", "Tributável (alíquota diferenciada)"],
  ["04", "Monofásica (revenda a alíquota zero)"],
  ["06", "Alíquota zero"],
  ["07", "Isenta"],
  ["08", "Sem incidência"],
  ["09", "Suspensão"],
  ["49", "Outras operações de saída"],
  ["99", "Outras operações"],
];

export const CST_IBS_CBS: Codigo[] = [
  ["000", "Tributação integral"],
  ["200", "Alíquota reduzida"],
  ["400", "Isenção"],
  ["410", "Imunidade e não incidência"],
  ["510", "Diferimento"],
  ["550", "Suspensão"],
  ["620", "Tributação monofásica"],
];

export const CLASS_TRIB: Codigo[] = [
  ["000001", "Tributadas integralmente pelo IBS e pela CBS"],
  ["410002", "Transferência entre estabelecimentos do mesmo contribuinte"],
];

/** Descrição do código (ou vazio quando não está na lista). */
export const descricaoCodigo = (lista: Codigo[], codigo: unknown) => lista.find(([c]) => c === String(codigo ?? "").trim())?.[1] ?? "";
