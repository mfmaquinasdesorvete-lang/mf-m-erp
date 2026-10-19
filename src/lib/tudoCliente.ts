// "Tudo do cliente": acha o cliente (ou fornecedor) pelo CNPJ, CPF ou nome e reconhece as linhas do extrato que são dele.
// O banco mascara o documento no extrato ("Cdx Asa Franchising Ltda - ***733820001** -"): vale o nome ou os dígitos
// que sobram no meio da máscara. Arquivo puro (testado).

export const digitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** CNPJ ou CPF completo no texto da busca. */
export function docDaBusca(texto: string): string | null {
  const d = digitos(texto);
  return d.length === 14 || d.length === 11 ? d : null;
}

const SUFIXOS = /\b(ltda|me|epp|eireli|s\/?a|sa|ss|cia|comercio|industria|servicos|e)\b\.?/g;
/** Núcleo do nome para achar no extrato: sem "Ltda", "ME", pontuação e espaços repetidos. */
export function nucleoNome(nome: string | null | undefined): string {
  return sem(nome).replace(/[^a-z0-9 ]+/g, " ").replace(SUFIXOS, " ").replace(/\s+/g, " ").trim();
}

/** Os dígitos que o banco deixa à mostra na máscara (***733820001**) batem com o documento. */
export function mascaraCasa(descricao: string | null | undefined, doc: string | null | undefined): boolean {
  const d = digitos(doc);
  if (d.length < 11) return false;
  for (const m of String(descricao ?? "").matchAll(/\*{2,}([\d.\-/]{5,})\*+/g)) {
    const meio = digitos(m[1]);
    if (meio.length >= 6 && d.includes(meio)) return true;
  }
  return false;
}

/** A linha do extrato é deste cliente: documento inteiro, máscara que bate ou o nome (núcleo com 2+ palavras ou 8+ letras). */
export function extratoDoCliente(descricao: string | null | undefined, nome: string | null | undefined, doc: string | null | undefined): boolean {
  const d = digitos(doc);
  if (d.length >= 11 && digitos(descricao).includes(d)) return true;
  if (mascaraCasa(descricao, d)) return true;
  const n = nucleoNome(nome);
  if (!n || (n.split(" ").length < 2 && n.length < 8)) return false;
  return ` ${nucleoNome(descricao)} `.includes(` ${n} `);
}

/** Pedaço para a busca no banco (ilike): as 2 primeiras palavras do núcleo do nome. */
export const termoExtrato = (nome: string | null | undefined) => nucleoNome(nome).split(" ").slice(0, 2).join(" ");
