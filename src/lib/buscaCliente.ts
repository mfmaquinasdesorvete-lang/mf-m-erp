// Busca de cliente que acha pelo jeito que a pessoa digitar: nome ou nome fantasia (sem acento, em qualquer
// ordem), CPF/CNPJ com ou sem pontos, código, cidade, telefone/WhatsApp ou e-mail. Funções puras.
import { digitos } from "./format";

export type ClienteBuscavel = {
  id: string; codigo?: number | null; nome: string; nome_fantasia?: string | null; cpf_cnpj?: string | null;
  municipio?: string | null; uf?: string | null; email?: string | null; telefone?: string | null; whatsapp?: string | null;
};

/** Minúsculas, sem acento e com espaços simples. */
export const normalizar = (s: string | number | null | undefined) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const texto = (c: ClienteBuscavel) =>
  normalizar([c.codigo, c.nome, c.nome_fantasia, c.municipio, c.uf, c.email, c.cpf_cnpj].filter(Boolean).join(" "));
const numeros = (c: ClienteBuscavel) => [c.cpf_cnpj, c.telefone, c.whatsapp].map(digitos).filter(Boolean);

/**
 * Nota de quanto o cliente combina com o que foi digitado (0 = não combina). Cada palavra precisa aparecer
 * em algum campo; números com 3 ou mais dígitos também valem para CPF/CNPJ e telefones sem pontuação.
 */
export function notaCliente(c: ClienteBuscavel, consulta: string): number {
  const q = normalizar(consulta);
  if (!q) return 1;
  const d = digitos(consulta);
  const soNumero = d.length >= 3 && /^[\d\s.\-/()]+$/.test(consulta.trim());
  const docs = numeros(c);
  const doc = digitos(c.cpf_cnpj);

  if (soNumero) {
    if (doc && doc === d) return 100;
    if (c.codigo != null && String(c.codigo) === d) return 90;
    if (doc.startsWith(d)) return 70;
    // meio do CPF/CNPJ só com 8 números ou mais; telefone vale qualquer pedaço com 4 ou mais
    if (d.length >= 8 && doc.includes(d)) return 60;
    if (d.length >= 4 && [c.telefone, c.whatsapp].some((n) => digitos(n).includes(d))) return 50;
    return 0;
  }
  const t = texto(c);
  const palavras = q.split(" ");
  if (!palavras.every((p) => t.includes(p) || (digitos(p).length >= 3 && docs.some((n) => n.includes(digitos(p)))))) return 0;
  const nome = normalizar(c.nome), fant = normalizar(c.nome_fantasia);
  if (nome === q || fant === q) return 80;
  if (nome.startsWith(q) || fant.startsWith(q)) return 60;
  if ([nome, fant].some((n) => n.split(" ").some((w) => w.startsWith(palavras[0])))) return 40;
  return 20;
}

/** Os que combinam, do mais parecido para o menos (empate: ordem alfabética). */
export function buscarClientes<T extends ClienteBuscavel>(lista: T[], consulta: string, limite = 30): T[] {
  if (!normalizar(consulta)) return lista.slice(0, limite);
  return lista
    .map((c) => ({ c, n: notaCliente(c, consulta) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.c.nome.localeCompare(b.c.nome, "pt-BR"))
    .slice(0, limite)
    .map((x) => x.c);
}

/**
 * Busca das listas: todas as palavras precisam aparecer (sem acento, em qualquer ordem e em qualquer campo);
 * só números (CPF, CNPJ, telefone, código) valem com ou sem pontos, traços e barras.
 */
export function combinaBusca(campos: unknown[], consulta: string): boolean {
  const q = normalizar(consulta);
  if (!q) return true;
  const valores = campos.map((v) => (Array.isArray(v) ? v.join(" ") : v == null ? "" : String(v)));
  const t = normalizar(valores.join(" "));
  const d = digitos(consulta);
  if (d.length >= 3 && /^[\d\s.\-/()]+$/.test(consulta.trim()) && valores.some((v) => digitos(v).includes(d))) return true;
  return q.split(" ").every((p) => t.includes(p));
}
