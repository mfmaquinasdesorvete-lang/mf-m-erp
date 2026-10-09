// Busca de produto para adicionar item: descrição (sem acento, palavras em qualquer ordem), SKU, código de
// barras, modelo, marca, código do fabricante, códigos alternativos, NCM ou categoria. Códigos valem com ou sem
// traços, pontos e espaços. Funções puras.
import { normalizar } from "./buscaCliente";

export type ProdutoBuscavel = {
  id: string; descricao: string; sku?: string | null; codigo_barras?: string | null; modelo?: string | null; marca?: string | null;
  codigo_fabricante?: string | null; codigos_alternativos?: string | null; ncm?: string | null; categoria?: string | null;
};

/** Só letras e números, minúsculos: "MF-100 A" → "mf100a". */
export const compacto = (s: string | null | undefined) => normalizar(s).replace(/[^a-z0-9]/g, "");

const codigos = (p: ProdutoBuscavel) =>
  [p.sku, p.codigo_barras, p.modelo, p.codigo_fabricante, ...String(p.codigos_alternativos ?? "").split(/[,;\n|]+/)]
    .map(compacto).filter(Boolean);

const texto = (p: ProdutoBuscavel) =>
  normalizar([p.descricao, p.sku, p.codigo_barras, p.modelo, p.marca, p.codigo_fabricante, p.codigos_alternativos, p.ncm, p.categoria]
    .filter(Boolean).join(" "));

/**
 * Nota de quanto o produto combina com o que foi digitado (0 = não combina). Código exato (SKU, código de barras,
 * modelo…) vem primeiro; depois começo de código, descrição que começa igual, palavra que começa igual e o resto.
 * Cada palavra digitada precisa aparecer em algum campo.
 */
export function notaProduto(p: ProdutoBuscavel, consulta: string): number {
  const q = normalizar(consulta);
  if (!q) return 1;
  const qc = compacto(consulta);
  const cods = codigos(p);
  if (qc && cods.includes(qc)) return 100;
  if (qc.length >= 2 && cods.some((c) => c.startsWith(qc))) return 80;

  const t = texto(p);
  const tc = compacto(t);
  const palavras = q.split(" ");
  // cada palavra como foi digitada ou sem traços e pontos ("mf100" acha "MF-100"; "8418.50.90" acha o NCM)
  if (!palavras.every((w) => t.includes(w) || (compacto(w).length >= 2 && tc.includes(compacto(w))))) return 0;
  const d = normalizar(p.descricao);
  if (d === q) return 90;
  if (d.startsWith(q)) return 60;
  if (d.split(" ").some((w) => w.startsWith(palavras[0]))) return 40;
  return 20;
}

/** Os que combinam, do mais parecido para o menos (empate: ordem alfabética da descrição). */
export function buscarProdutos<T extends ProdutoBuscavel>(lista: T[], consulta: string, limite = 30): T[] {
  if (!normalizar(consulta)) return [...lista].sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR")).slice(0, limite);
  return lista
    .map((p) => ({ p, n: notaProduto(p, consulta) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.p.descricao.localeCompare(b.p.descricao, "pt-BR"))
    .slice(0, limite)
    .map((x) => x.p);
}
