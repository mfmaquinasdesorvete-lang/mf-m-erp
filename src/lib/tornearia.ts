// Receita das peças da tornearia: quanto de cada insumo (barra, chapa) vai numa peça e quanto a peça custa.
// A barra redonda é comprada por kg; na tornearia se mede o pedaço em mm. Aqui o comprimento vira kg pelo diâmetro
// que está no nome da barra (ex.: "Barra Redonda Inox 304 3/4\" (19,05 mm)").

/** Densidade do inox 304 em kg por mm³ (7,93 g/cm³). */
export const DENSIDADE_INOX = 7.93e-6;

/** Diâmetro em mm tirado do nome: "(19,05 mm)" ou, sem ele, a polegada "3/4\"", "1 1/4\"", "1\"". */
export function diametroDoNome(nome: string | null | undefined): number | null {
  const s = String(nome ?? "");
  const mm = s.match(/(\d+(?:[.,]\d+)?)\s*mm\b/i);
  if (mm) return Number(mm[1].replace(",", "."));
  const pol = s.match(/(?:(\d+)\s+)?(\d+)\/(\d+)\s*(?:"|''|pol)|(?<![\d/])(\d+)\s*(?:"|''|pol)/i);
  if (!pol) return null;
  const pol2 = pol[4] ? Number(pol[4]) : Number(pol[1] ?? 0) + Number(pol[2]) / Number(pol[3]);
  return pol2 > 0 ? Math.round(pol2 * 25.4 * 100) / 100 : null;
}

/** É barra redonda vendida por kg (aí dá para pôr o comprimento em mm em vez do peso). */
export const ehBarraPorKg = (p: { descricao?: string | null; unidade?: string | null }) =>
  String(p.unidade ?? "").toUpperCase() === "KG" && /barra\s+redonda|tarugo/i.test(p.descricao ?? "") && !!diametroDoNome(p.descricao);

/** Peso (kg) de um pedaço de barra redonda de inox: π·r²·comprimento·densidade. */
export function kgDaBarra(diametroMm: number, comprimentoMm: number): number {
  if (!(diametroMm > 0) || !(comprimentoMm > 0)) return 0;
  return Math.round(Math.PI * (diametroMm / 2) ** 2 * comprimentoMm * DENSIDADE_INOX * 10000) / 10000;
}

/** Comprimento (mm) de um peso de barra: o caminho de volta, para mostrar "≈ 120 mm" ao lado do kg gravado. */
export function mmDaBarra(diametroMm: number, kg: number): number {
  if (!(diametroMm > 0) || !(kg > 0)) return 0;
  return Math.round(kg / (Math.PI * (diametroMm / 2) ** 2 * DENSIDADE_INOX));
}

export type LinhaReceita = { componente_id: string; quantidade: number | string };

/** Custo dos insumos de uma peça: soma de quantidade × custo de cada insumo (insumo sem custo conta 0 e é avisado). */
export function custoReceita(linhas: LinhaReceita[], custoDe: (id: string) => number | null | undefined) {
  let total = 0;
  const semCusto: string[] = [];
  for (const l of linhas) {
    const c = Number(custoDe(l.componente_id) ?? 0);
    if (!(c > 0)) semCusto.push(l.componente_id);
    total += c * Number(l.quantidade || 0);
  }
  return { total: Math.round(total * 100) / 100, semCusto };
}
