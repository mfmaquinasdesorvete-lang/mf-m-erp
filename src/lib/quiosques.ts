// Gastos com a montagem dos quiosques: as notas (e contas a pagar) com o marcador "Quiosques".
// Cada item da nota cai num grupo (MDF e fitas, tinta e acabamento, ferragens e o resto) e os pagamentos
// nos extratos são achados pelo nome das lojas dessas notas e pelas lojas de tinta e MDF.

export type GrupoQuiosque = "mdf" | "tinta" | "ferragens";

export const GRUPOS_QUIOSQUE: { id: GrupoQuiosque; nome: string; barra: string; chip: string }[] = [
  { id: "mdf", nome: "MDF e fitas de borda", barra: "bg-amber-500", chip: "bg-amber-100 text-amber-900 ring-amber-300" },
  { id: "tinta", nome: "Tinta e acabamento", barra: "bg-sky-500", chip: "bg-sky-100 text-sky-900 ring-sky-300" },
  { id: "ferragens", nome: "Ferragens, cola e elétrica", barra: "bg-violet-500", chip: "bg-violet-100 text-violet-900 ring-violet-300" },
];
export const NOME_GRUPO = Object.fromEntries(GRUPOS_QUIOSQUE.map((g) => [g.id, g.nome])) as Record<GrupoQuiosque, string>;

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const MDF = /\bmdf\b|compensad|madeira|fita (de )?borda|^fita\b(?!.*crepe)|tapa furo/;
const TINTA = /tinta|primer|verniz|thinner|catali[sz]ador|\bpu\b|lixa|massa|selador|esmalte|fundo|diluente|laca\b|endurecedor|spray|estopa|crepe|\brolo\b|pincel|trincha/;

/** Grupo do item da nota pela descrição. */
export function grupoDoItem(descricao: string | null | undefined): GrupoQuiosque {
  const d = sem(descricao).trim();
  if (MDF.test(d)) return "mdf";
  if (TINTA.test(d)) return "tinta";
  return "ferragens";
}

/** Nome da marca "Quiosques" (sem acento e maiúscula). */
export const ehMarcadorQuiosque = (nome: string | null | undefined) => /^quiosques?$/.test(sem(nome).trim());

const SUFIXOS = new Set(["ltda", "me", "sa", "eireli", "epp", "mei"]);

/** Como a loja aparece no extrato: as duas primeiras palavras do nome, juntas ("gmad americana", "so tintas").
 *  Nome de uma palavra só vale se tiver 6 letras ou mais; uma palavra sozinha pegava pagamentos de outras pessoas. */
export function chaveDaLoja(nome: string | null | undefined): string {
  const p = sem(nome).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((x) => x.length >= 2 && !SUFIXOS.has(x));
  if (p.length >= 2) return `${p[0]} ${p[1]}`;
  return p[0] && p[0].length >= 6 ? p[0] : "";
}

const LOJA_GENERICA = /\b(mdf|tintas?|compensados?|madeiras?|madeireira)\b/;

/** O lançamento do extrato é pagamento a uma loja de quiosque? (saída, com o nome de uma das lojas ou de loja de tinta/MDF) */
export function pagamentoDeQuiosque(descricao: string | null | undefined, valor: number, chaves: string[]): boolean {
  if (!(Number(valor) < 0)) return false;
  const d = ` ${sem(descricao).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ")} `;
  if (/\b(rendimento|estorno|devolu)/.test(d)) return false;
  if (LOJA_GENERICA.test(d)) return true;
  return chaves.some((c) => !!c && d.includes(` ${c} `));
}
