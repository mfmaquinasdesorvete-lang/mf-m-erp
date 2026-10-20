// Inventário sem parar a empresa (Kaizen): em vez de contar tudo de uma vez, o ERP sorteia poucos itens por dia,
// priorizando os que valem mais (curva ABC) e os que estão há mais tempo sem contar. Também a dupla contagem
// (duas pessoas, só vale quando bate), a acuracidade (itens que já estavam certos) e o giro do estoque.
// Arquivo puro (testado).

export type Curva = "A" | "B" | "C";
export type ItemInventario = { id: string; custo: number; saldo: number; vendido12m: number; ultimaContagem: string | null };

/** Curva ABC pelo valor que gira no ano (vendido × custo); sem venda vale o valor parado. A = 80% do valor, B = próximos 15%. */
export function curvaABC(itens: ItemInventario[]): Map<string, Curva> {
  const valor = (i: ItemInventario) => (i.vendido12m > 0 ? i.vendido12m : i.saldo) * Math.max(0, i.custo);
  const ord = [...itens].sort((a, b) => valor(b) - valor(a));
  const total = ord.reduce((s, i) => s + valor(i), 0);
  const m = new Map<string, Curva>();
  let acum = 0;
  for (const i of ord) {
    const antes = total ? acum / total : 1;
    m.set(i.id, antes < 0.8 && valor(i) > 0 ? "A" : antes < 0.95 && valor(i) > 0 ? "B" : "C");
    acum += valor(i);
  }
  return m;
}

/** De quanto em quanto tempo cada curva deve ser contada (dias). */
export const PRAZO_CURVA: Record<Curva, number> = { A: 30, B: 60, C: 120 };

const dias = (de: string, ate: string) => (new Date(ate.slice(0, 10)).getTime() - new Date(de.slice(0, 10)).getTime()) / 864e5;
// número estável por dia e produto: o sorteio do dia é o mesmo para todo mundo que abrir a tela
const semente = (s: string) => { let h = 2166136261; for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619); return (h >>> 0) / 4294967296; };

/** Os itens da contagem do dia: os mais atrasados para contar (nunca contados primeiro), A antes de B e C. */
export function sorteioDoDia(itens: ItemInventario[], hoje: string, n = 8): { id: string; curva: Curva; atraso: number }[] {
  const curva = curvaABC(itens);
  return itens
    .filter((i) => i.saldo > 0 || i.vendido12m > 0)
    .map((i) => {
      const c = curva.get(i.id) ?? "C";
      const prazo = PRAZO_CURVA[c];
      // atraso relativo ao prazo da curva: nunca contado = muito atrasado
      const atraso = i.ultimaContagem ? dias(i.ultimaContagem, hoje) / prazo : 10;
      return { id: i.id, curva: c, atraso, r: semente(hoje + i.id) };
    })
    .filter((x) => x.atraso >= 1)
    .sort((a, b) => (Math.min(b.atraso, 10) - Math.min(a.atraso, 10)) || a.curva.localeCompare(b.curva) || a.r - b.r)
    .slice(0, n)
    .map(({ id, curva: c, atraso }) => ({ id, curva: c, atraso }));
}

/** Dupla contagem: falta a 2ª, as duas batem ou é preciso recontar. */
export function situacaoDupla(contado: number | null, contado2: number | null): "falta1" | "falta2" | "bate" | "recontar" {
  if (contado == null) return "falta1";
  if (contado2 == null) return "falta2";
  return Number(contado) === Number(contado2) ? "bate" : "recontar";
}

/** Acuracidade: dos itens contados, quantos o sistema já tinha certo (sem ajuste). Meta acima de 98%. */
export function acuracidade(contagens: { status: string; contados?: number | null; ajustes?: number | null; concluida_em?: string | null }[], desde: string) {
  const c = contagens.filter((x) => x.status === "concluida" && (x.concluida_em ?? "") >= desde && (x.contados ?? 0) > 0);
  const contados = c.reduce((s, x) => s + Number(x.contados), 0);
  const certos = c.reduce((s, x) => s + Number(x.contados) - Number(x.ajustes ?? 0), 0);
  return { contagens: c.length, contados, certos, pct: contados ? Math.round((certos / contados) * 1000) / 10 : null };
}

/** Giro do estoque no ano: quanto saiu (a custo) dividido pelo que está parado hoje (a custo). E o valor sem venda. */
export function giroEstoque(itens: ItemInventario[]) {
  const vendido = itens.reduce((s, i) => s + i.vendido12m * Math.max(0, i.custo), 0);
  const estoque = itens.reduce((s, i) => s + Math.max(0, i.saldo) * Math.max(0, i.custo), 0);
  const parados = itens.filter((i) => i.saldo > 0 && i.vendido12m === 0);
  return {
    giro: estoque > 0 ? Math.round((vendido / estoque) * 10) / 10 : null,
    diasDeEstoque: vendido > 0 ? Math.round((estoque / vendido) * 365) : null,
    valorEstoque: estoque,
    parados: parados.length,
    valorParado: parados.reduce((s, i) => s + i.saldo * Math.max(0, i.custo), 0),
    paradosIds: parados.sort((a, b) => b.saldo * b.custo - a.saldo * a.custo).map((i) => i.id),
  };
}
