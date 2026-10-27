// Notas fiscais da My Frost (empresa anterior), da aba NFes do backup do Tiny: número, data, tipo e o valor da nota.
// A aba só traz o nome do destinatário; o CPF/CNPJ sai do próprio nome (quando está escrito nele), dos contatos e dos
// pedidos de venda do mesmo backup. Quando o nome leva a mais de um documento, vale o pedido do mesmo nome feito até
// 90 dias antes da nota; se ainda sobrar mais de um, vão todos e o banco só liga a nota se todos forem do mesmo cliente.
// Puro (sem banco e sem tela). Testes em __tests__/notasMyFrost.test.ts.
import { dataDaPlanilha } from "./propostasTiny";

type Linha = Record<string, unknown>;

/** Como a nota vai para o banco (importar_notas_legado). */
export type NotaLegadoLida = { numero: string; data: string | null; valor: number | null; natureza: string; docs: string[] };

const txt = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const sem = (v: unknown) => txt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const digitos = (v: unknown) => String(v ?? "").replace(/\.0+$/, "").replace(/\D/g, "");
const docValido = (d: string) => d.length === 11 || d.length === 14;

/** Nome para comparar: sem acento, sem números, sem pontuação e sem LTDA/ME/EPP/EIRELI. */
export function nomeParaComparar(v: unknown): string {
  return txt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/\d/g, " ").replace(/[^A-Z ]/g, " ")
    .replace(/\b(LTDA|ME|EPP|EIRELI|MEI|SA|S A|CPF|CNPJ)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}

/** CPF/CNPJ escrito no próprio nome do destinatário ("Fulano - 123.456.789-09"). */
function docNoNome(v: unknown): string | null {
  for (const m of txt(v).match(/\d[\d./-]{9,}\d/g) ?? []) {
    const d = m.replace(/\D/g, "");
    if (docValido(d)) return d;
  }
  return null;
}

function leitor(l: Linha) {
  const mapa = new Map(Object.keys(l).map((k) => [sem(k), k]));
  return (...nomes: string[]) => {
    for (const n of nomes) { const k = mapa.get(sem(n)); if (k !== undefined) return l[k]; }
    return "";
  };
}

const dia = (s: string) => Math.round(Date.parse(`${s}T12:00:00Z`) / 864e5);

/**
 * Monta as notas a partir das abas NFes, Contatos e Pedidos_venda_itens do backup.
 * Só entram as notas do emitente principal da aba (a própria My Frost); as de outro emitente ficam de fora.
 */
export function montarNotasMyFrost(nfes: Linha[], contatos: Linha[], pedidos: Linha[]): NotaLegadoLida[] {
  // nome → documentos (contatos) e nome → [documento, data] (pedidos)
  const porNome = new Map<string, Set<string>>();
  const juntar = (nome: unknown, doc: string) => {
    const n = nomeParaComparar(nome);
    if (!n || !docValido(doc)) return;
    porNome.set(n, (porNome.get(n) ?? new Set()).add(doc));
  };
  for (const l of contatos) {
    const c = leitor(l);
    const d = digitos(c("CNPJ / CPF", "CPF/CNPJ"));
    juntar(c("Nome"), d);
    juntar(c("Fantasia"), d);
  }
  const pedidosPorNome = new Map<string, { doc: string; dia: number }[]>();
  for (const l of pedidos) {
    const c = leitor(l);
    const d = digitos(c("CPF/CNPJ"));
    const data = dataDaPlanilha(c("Data"));
    if (!docValido(d)) continue;
    for (const nome of [c("Nome do contato"), c("Destinatário")]) {
      const n = nomeParaComparar(nome);
      if (!n) continue;
      juntar(nome, d);
      if (data) pedidosPorNome.set(n, [...(pedidosPorNome.get(n) ?? []), { doc: d, dia: dia(data) }]);
    }
  }

  // emitente principal: o que mais aparece na aba (a própria empresa)
  const emitentes = new Map<string, number>();
  for (const l of nfes) { const e = nomeParaComparar(leitor(l)("emitente")); emitentes.set(e, (emitentes.get(e) ?? 0) + 1); }
  const principal = [...emitentes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const vistas = new Set<string>();
  const out: NotaLegadoLida[] = [];
  for (const l of nfes) {
    const c = leitor(l);
    if (principal !== undefined && nomeParaComparar(c("emitente")) !== principal) continue;
    const numero = digitos(c("numero", "número")).replace(/^0+/, "");
    if (!numero || vistas.has(numero)) continue;
    vistas.add(numero);
    const data = dataDaPlanilha(c("data_emissao", "dt"));
    const v = Number(c("valor_nf", "valor"));
    let docs: string[] = [];
    const noNome = docNoNome(c("destinatario"));
    if (noNome) docs = [noNome];
    else {
      const n = nomeParaComparar(c("destinatario"));
      const candidatos = [...(porNome.get(n) ?? [])];
      if (candidatos.length > 1 && data) {
        const perto = new Set((pedidosPorNome.get(n) ?? []).filter((p) => dia(data) - p.dia >= 0 && dia(data) - p.dia <= 90).map((p) => p.doc));
        docs = perto.size === 1 ? [...perto] : candidatos.slice(0, 6);
      } else docs = candidatos;
    }
    out.push({ numero, data, valor: Number.isFinite(v) && String(c("valor_nf", "valor")) !== "" ? Math.round(v * 100) / 100 : null, natureza: txt(c("natureza")).slice(0, 120), docs });
  }
  return out;
}

/** Tipo curto para a tela, a partir da natureza da operação. */
export function tipoDaNota(natureza: string | null | undefined): string {
  const n = sem(natureza);
  if (/estorno/.test(n)) return "Estorno";
  if (/devol/.test(n)) return "Devolução";
  if (/garant/.test(n)) return "Garantia";
  if (/conserto|reparo/.test(n)) return /retorno/.test(n) ? "Retorno de conserto" : "Conserto";
  if (/venda/.test(n)) return "Venda";
  if (/remessa/.test(n)) return "Remessa";
  return "Outra";
}
