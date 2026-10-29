// Carta de correção (CC-e): texto pronto para trocar a transportadora de uma NF-e já autorizada e a leitura de volta
// (etiquetas e tela). Funções puras: a tela (FiscalAvancado), as etiquetas (lib/etiquetas.ts) e os testes usam a mesma regra.
// Regra fiscal: a CC-e corrige o transportador e a modalidade do frete (não valores, impostos, destinatário nem data) e
// a última carta substitui as anteriores (Ajuste SINIEF 07/05, cláusula 14ª-A, § 4º): por isso o texto novo junta tudo.

export const MODALIDADE_FRETE: Record<number, string> = {
  0: "0 - Por conta do remetente", 1: "1 - Por conta do destinatário", 2: "2 - Por conta de terceiros",
  3: "3 - Transporte próprio do remetente", 4: "4 - Transporte próprio do destinatário", 9: "9 - Sem ocorrência de transporte",
};

export type TranspCarta = {
  nome: string; cnpj?: string | null; inscricao_estadual?: string | null; logradouro?: string | null; numero?: string | null;
  bairro?: string | null; municipio?: string | null; uf?: string | null;
};

/** "CNPJ 11.222.333/0001-81" ou "CPF 123.456.789-09" (o cadastro guarda o CPF do transportador na coluna cnpj). */
export function documentoTransportador(d: string | null | undefined) {
  const x = String(d ?? "").replace(/\D/g, "");
  if (x.length === 14) return `CNPJ ${x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}`;
  if (x.length === 11) return `CPF ${x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")}`;
  return "";
}

// a SEFAZ não aceita quebra de linha; aspas e parênteses do cadastro atrapalhariam ler o texto de volta
const limpo = (s: unknown) => String(s ?? "").replace(/["()\s]+/g, " ").trim();

/** A nota saiu sem transporte (modalidade 9): a troca precisa dizer também quem paga o frete. */
export const semFreteNaNota = (payload: any) => Number(payload?.modalidade_frete ?? 9) === 9;

/** Texto da troca, sempre a partir do que saiu no XML (payload): a carta nova substitui as anteriores. */
export function textoTrocaTransportadora(payload: any, t: TranspCarta, modalidadeNova?: number | null) {
  const docAtual = documentoTransportador(payload?.cnpj_transportador ?? payload?.cpf_transportador);
  const atual = payload?.nome_transportador ? `"${limpo(payload.nome_transportador)}"${docAtual ? ` (${docAtual})` : ""}` : `"sem transportadora"`;
  const ender = [t.logradouro, t.numero, t.bairro].map(limpo).filter(Boolean).join(", ");
  const dados = [documentoTransportador(t.cnpj), t.inscricao_estadual && `IE ${limpo(t.inscricao_estadual)}`, ender,
    t.municipio && `${limpo(t.municipio)}${t.uf ? `/${String(t.uf).toUpperCase()}` : ""}`].filter(Boolean).join("; ");
  const linha = `Transportadora: onde se lê ${atual}, leia-se "${limpo(t.nome)}"${dados ? ` (${dados})` : ""}.`;
  const mod = semFreteNaNota(payload) && modalidadeNova != null && modalidadeNova !== 9 && MODALIDADE_FRETE[modalidadeNova]
    ? `Modalidade do frete: onde se lê "${MODALIDADE_FRETE[9]}", leia-se "${MODALIDADE_FRETE[modalidadeNova]}". ` : "";
  return mod + linha;
}

const RE_TRANSP = /Transportadora: onde se lê "[^"]*"(?: \([^)]*\))?, leia-se "([^"]*)"(?: \([^)]*\))?\.\s*/g;
const RE_MOD = /Modalidade do frete: onde se lê "[^"]*", leia-se "[^"]*"\.\s*/g;

/** Tira do texto a troca de transportadora (e de modalidade) montada antes, mantendo as outras correções. */
export const semTrocaTransportadora = (texto: string) => texto.replace(RE_MOD, "").replace(RE_TRANSP, "").replace(/\s+/g, " ").trim();

/** Junta as outras correções com a troca nova numa linha só (a SEFAZ não aceita quebra de linha). */
export const juntarCorrecao = (outras: string, troca: string) => [semTrocaTransportadora(outras), troca].filter(Boolean).join(" ");

/** Transportadora que vale pela carta de correção: só a última carta autorizada conta (ela substitui as anteriores).
 *  Recebe os textos em ordem; null quando a última não troca a transportadora. */
export function transportadoraDaUltimaCarta(correcoes: string[]): string | null {
  const ultima = correcoes.length ? correcoes[correcoes.length - 1] ?? "" : "";
  const m = new RegExp(RE_TRANSP.source).exec(ultima);
  return m ? m[1].trim() || null : null;
}
