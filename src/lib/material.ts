// Material comprado inteiro (barra, tubo, chapa) e cortado em peças: quanto de cada um vai numa peça, pelo aproveitamento.
// Ex.: tubo de 6 m, peça de 420 mm → saem 14 peças por tubo (sobra 120 mm) e cada peça leva 1/14 do tubo.
// Chapa 1000 × 2000 mm, peça 150 × 80 mm → saem 156 peças por chapa (o melhor dos dois sentidos de corte).
// A quantidade gravada na receita fica sempre na unidade em que o material é comprado (UN, M, KG, M2), para o custo
// e a baixa do estoque continuarem iguais; o jeito de medir (mm, peças por chapa) fica guardado em "uso".
import { diametroDoNome } from "@/lib/tornearia";

export type FormatoMaterial = "barra" | "tubo" | "chapa";
export const FORMATOS: { v: FormatoMaterial; rotulo: string }[] = [
  { v: "barra", rotulo: "Barra (maciça: redonda, chata, quadrada)" },
  { v: "tubo", rotulo: "Tubo" },
  { v: "chapa", rotulo: "Chapa" },
];

export type Material = {
  descricao?: string | null; unidade?: string | null;
  material_formato?: string | null; material_comprimento_mm?: number | string | null;
  material_largura_mm?: number | string | null; material_espessura_mm?: number | string | null;
};
/** Como a peça usa o material: pelo comprimento (barra, tubo), pelo tamanho da peça cortada da chapa ou por quantas saem. */
export type UsoMaterial =
  | { modo: "comprimento"; mm: number; perda?: number }
  | { modo: "peca"; comprimento: number; largura: number }
  | { modo: "pecas"; n: number };

const num = (v: unknown) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : 0; };
const arred = (v: number, casas = 4) => Math.round(v * 10 ** casas) / 10 ** casas;
/** kg por mm³: inox 7,93 g/cm³; o resto (ferro, aço carbono) 7,85. */
export const densidade = (descricao?: string | null) => (/inox/i.test(descricao ?? "") ? 7.93e-6 : 7.85e-6);

export const formatoDe = (m: Material): FormatoMaterial | null =>
  m.material_formato === "barra" || m.material_formato === "tubo" || m.material_formato === "chapa" ? m.material_formato : null;

/** Quantas peças de `peca` mm saem de uma barra de `barra` mm (com a perda de cada corte, ex.: 3 mm da serra). */
export function pecasPorBarra(barra: number, peca: number, perdaCorte = 0) {
  if (!(barra > 0) || !(peca > 0)) return 0;
  return Math.floor((barra + perdaCorte) / (peca + perdaCorte));
}

/** Quantas peças retangulares saem da chapa: o melhor entre cortar a peça deitada ou em pé. */
export function pecasPorChapa(chapaC: number, chapaL: number, pecaC: number, pecaL: number) {
  if (![chapaC, chapaL, pecaC, pecaL].every((x) => x > 0)) return 0;
  return Math.max(Math.floor(chapaC / pecaC) * Math.floor(chapaL / pecaL), Math.floor(chapaC / pecaL) * Math.floor(chapaL / pecaC));
}

/** Quanto é o material inteiro (1 barra, 1 tubo, 1 chapa) na unidade em que ele é comprado; null se faltar medida. */
export function inteiroNaUnidade(m: Material): number | null {
  const un = String(m.unidade ?? "UN").toUpperCase();
  const C = num(m.material_comprimento_mm), L = num(m.material_largura_mm), E = num(m.material_espessura_mm);
  const f = formatoDe(m);
  if (un === "M") return C ? C / 1000 : null;
  if (un === "M2") return C && L ? (C * L) / 1e6 : null;
  if (un === "KG") {
    if (f === "chapa") return C && L && E ? arred(C * L * E * densidade(m.descricao)) : null;
    const d = E || diametroDoNome(m.descricao) || 0; // barra redonda: o diâmetro
    return f === "barra" && C && d ? arred(Math.PI * (d / 2) ** 2 * C * densidade(m.descricao)) : null;
  }
  return 1; // UN, PC, BR, CH…: comprado por barra ou chapa inteira
}

export type Consumo = { quantidade: number; porInteiro: number; sobra: number; texto: string; aviso?: string };

/** Quantidade de material por peça (na unidade de compra) e o aproveitamento. */
export function consumo(m: Material, uso: UsoMaterial, perdaCorte = 0): Consumo | null {
  const f = formatoDe(m);
  const C = num(m.material_comprimento_mm), L = num(m.material_largura_mm);
  const inteiro = inteiroNaUnidade(m);
  const nome = f === "chapa" ? "chapa" : f === "tubo" ? "tubo" : "barra";
  const un = String(m.unidade ?? "UN").toUpperCase();
  if (uso.modo === "pecas") {
    if (!(uso.n > 0) || inteiro == null) return null;
    return { quantidade: arred(inteiro / uso.n), porInteiro: uso.n, sobra: 0, texto: `${uso.n} por ${nome}` };
  }
  if (uso.modo === "comprimento") {
    if (!(uso.mm > 0)) return null;
    perdaCorte = num(uso.perda) || perdaCorte;
    const n = pecasPorBarra(C, uso.mm, perdaCorte);
    if (C && n > 0 && inteiro != null) {
      const sobra = Math.round(C - n * uso.mm - Math.max(0, n - 1) * perdaCorte);
      return { quantidade: arred(inteiro / n), porInteiro: n, sobra, texto: `${uso.mm} mm${perdaCorte ? ` + ${perdaCorte} mm do corte` : ""} · ${n} por ${nome} de ${C} mm (sobra ${sobra} mm)` };
    }
    if (C && n === 0) return { quantidade: 0, porInteiro: 0, sobra: 0, texto: "", aviso: `A peça é maior que a ${nome} (${C} mm).` };
    // sem o comprimento da barra: conta só o pedaço (sem a sobra)
    if (un === "M") return { quantidade: arred(uso.mm / 1000), porInteiro: 0, sobra: 0, texto: `${uso.mm} mm`, aviso: `Sem o comprimento da ${nome}: a sobra não entra na conta.` };
    const d = num(m.material_espessura_mm) || diametroDoNome(m.descricao) || 0;
    if (un === "KG" && d) return { quantidade: arred(Math.PI * (d / 2) ** 2 * uso.mm * densidade(m.descricao)), porInteiro: 0, sobra: 0, texto: `${uso.mm} mm (Ø ${d} mm)`, aviso: `Sem o comprimento da ${nome}: a sobra não entra na conta.` };
    return null;
  }
  // peça cortada da chapa
  const n = pecasPorChapa(C, L, uso.comprimento, uso.largura);
  if (!(C && L)) return null;
  if (n === 0) return { quantidade: 0, porInteiro: 0, sobra: 0, texto: "", aviso: `A peça não cabe na chapa (${C} × ${L} mm).` };
  if (inteiro == null) return null;
  const sobraPct = Math.round((1 - (n * uso.comprimento * uso.largura) / (C * L)) * 100);
  return { quantidade: arred(inteiro / n), porInteiro: n, sobra: sobraPct, texto: `${uso.comprimento} × ${uso.largura} mm · ${n} por chapa (sobra ${sobraPct}%)` };
}

/** O texto do jeito de medir guardado na receita (para mostrar na linha). */
export function textoUso(m: Material, uso: unknown): string {
  if (!uso || typeof uso !== "object") return "";
  const c = consumo(m, uso as UsoMaterial);
  return c?.texto ?? "";
}

/** Medidas que faltam no cadastro do material para calcular o aproveitamento. */
export function faltaMedida(m: Material): string | null {
  const f = formatoDe(m);
  if (!f) return null;
  if (!num(m.material_comprimento_mm)) return "o comprimento";
  if (f === "chapa" && !num(m.material_largura_mm)) return "a largura";
  if (inteiroNaUnidade(m) == null) return f === "chapa" ? "a espessura (comprado por kg)" : "o diâmetro (comprado por kg)";
  return null;
}
