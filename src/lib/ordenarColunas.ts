// Ordenar as listas clicando no título da coluna (setinhas como no Tiny): o valor de cada célula sai do texto que
// ela mostra (data dd/mm/aaaa, R$, número, porcentagem ou texto), sem a tela precisar dizer nada. Puro, sem tela.
// Testes em __tests__/ordenarColunas.test.ts.
import { Children, cloneElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";

type Props = { children?: ReactNode; [k: string]: unknown };

/** Os filhos em lista, abrindo os fragmentos sem chave (`<>…</>`). Fragmento com chave é uma unidade (linha + detalhe). */
export function achatar(n: ReactNode): ReactNode[] {
  return Children.toArray(n).flatMap((c, i) => {
    if (!isValidElement(c) || c.type !== Fragment || !String(c.key ?? "").match(/^\.\d+$/)) return [c];
    // fragmento sem chave: os filhos sobem, com a posição dele na chave (duas listas no mesmo fragmento não se misturam)
    return achatar((c.props as Props).children).map((f) => (isValidElement(f) ? cloneElement(f, { key: `${i}${f.key}` }) : f));
  });
}

// componente da tela (ex.: <NomeCadastro r={cliente} />, <Badge value="pago" />): o texto vem destas propriedades
const PROPS_TEXTO = ["texto", "titulo", "label", "nome", "value", "valor"];
const CAMPOS_NOME = ["nome", "razao_social", "descricao", "titulo"];

/**
 * O texto que o elemento mostra: o que está escrito nele e nos filhos. Componente sem texto dentro (que se desenha
 * sozinho) usa o texto/nome/valor que recebe, ou o nome do cadastro que recebe (r.nome).
 */
export function textoDoNo(n: ReactNode): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textoDoNo).filter(Boolean).join(" ");
  if (!isValidElement(n)) return "";
  const p = n.props as Props;
  const dentro = textoDoNo(p.children);
  if (dentro || typeof n.type === "string") return dentro;
  for (const k of PROPS_TEXTO) if (typeof p[k] === "string" || typeof p[k] === "number") return String(p[k]);
  for (const v of Object.values(p)) {
    if (!v || typeof v !== "object" || Array.isArray(v) || isValidElement(v)) continue;
    const o = v as Record<string, unknown>;
    const campo = CAMPOS_NOME.find((c) => typeof o[c] === "string" && o[c]);
    if (campo) return String(o[campo]);
  }
  return "";
}

/** Tem botão, caixinha ou lista de escolha dentro (aí o título já faz outra coisa ao clicar). */
export function temInterativo(n: ReactNode): boolean {
  return achatar(n).some((c) => isValidElement(c)
    && (c.type === "button" || c.type === "input" || c.type === "select" || temInterativo((c.props as Props).children)));
}

export type ValorOrdem = { tipo: "numero"; v: number } | { tipo: "texto"; v: string } | null;

const DATA = /^(\d{2})\/(\d{2})\/(\d{4})(?:\D+(\d{2}):(\d{2}))?/;
const NUMERO = /^(-)?\s*(?:R\$|#|Nº|N°)?\s*(-)?\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\s*%?(?=\s|$)/i;

/** Data, dinheiro, número ou porcentagem viram número; o resto é texto; vazio e "—" ficam sem valor (vão para o fim). */
export function valorOrdenavel(texto: string): ValorOrdem {
  const t = texto.replace(/\s+/g, " ").trim();
  if (!t || /^[—–-]+$/.test(t)) return null;
  const d = DATA.exec(t);
  if (d) return { tipo: "numero", v: Number(`${d[3]}${d[2]}${d[1]}${d[4] ?? "00"}${d[5] ?? "00"}`) };
  const m = NUMERO.exec(t);
  if (m) {
    const v = Number(`${m[3].replace(/\./g, "")}.${m[4] ?? "0"}`);
    return { tipo: "numero", v: m[1] || m[2] ? -v : v };
  }
  return { tipo: "texto", v: t };
}

const COLADOR = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** Sem valor sempre no fim; números antes de textos; texto em ordem alfabética (sem diferença de acento e maiúscula). */
export function compararValores(a: ValorOrdem, b: ValorOrdem, crescente: boolean): number {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  if (a.tipo !== b.tipo) return a.tipo === "numero" ? -1 : 1;
  const r = a.tipo === "numero" ? a.v - (b.v as number) : COLADOR.compare(a.v, b.v as string);
  return crescente ? r : -r;
}

/** Primeira linha (`tr`) da unidade: a própria linha ou a primeira de um fragmento com chave (linha + detalhe). */
function primeiraLinha(u: ReactNode): ReactElement | null {
  if (!isValidElement(u)) return null;
  if (u.type === "tr") return u;
  if (u.type === Fragment) return (achatar((u.props as Props).children).find((c) => isValidElement(c) && c.type === "tr") as ReactElement) ?? null;
  return null;
}

/** As células da unidade (null quando a linha é um componente e não dá para ler). */
export function celulasDa(u: ReactNode): ReactNode[] | null {
  const tr = primeiraLinha(u);
  return tr ? achatar((tr.props as Props).children).filter((c) => isValidElement(c)) : null;
}

/** Valor da coluna `col` na unidade (linha). */
export const valorDaCelula = (u: ReactNode, col: number): ValorOrdem => {
  const c = celulasDa(u)?.[col];
  return c ? valorOrdenavel(textoDoNo((c as ReactElement<Props>).props.children)) : null;
};

/** Ordena as linhas pela coluna (estável: empate fica na ordem de antes). */
export function ordenarLinhas(linhas: ReactNode[], col: number, crescente: boolean): ReactNode[] {
  return linhas.map((u, i) => ({ u, i, v: valorDaCelula(u, col) }))
    .sort((a, b) => compararValores(a.v, b.v, crescente) || a.i - b.i)
    .map((x) => x.u);
}

/** Primeiro clique: texto de A a Z; número, valor e data do maior para o menor. */
export function sentidoNatural(linhas: ReactNode[], col: number): boolean {
  for (const u of linhas) {
    const v = valorDaCelula(u, col);
    if (v) return v.tipo === "texto";
  }
  return true;
}
