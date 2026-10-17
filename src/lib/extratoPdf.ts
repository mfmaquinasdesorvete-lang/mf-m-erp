// Extrato em PDF (o Itaú, por exemplo, só entrega assim): o texto de cada página vira linhas e cada linha com data e
// valor vira um lançamento. Lido no próprio navegador (pdf.js): o arquivo não vai para lugar nenhum.
// lerExtratoTexto é pura (testada); lerExtratoPdf só junta o texto das páginas.

export type LinhaPdf = { data: string; descricao: string; valor: number; identificador: string };

const DATA = /^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?\b/;
// 1.234,56 · -1.234,56 · 1.234,56- · 1.234,56 D (débito) / C (crédito)
const DINHEIRO = /(-\s?)?\d{1,3}(?:\.\d{3})*,\d{2}(?:\s?-|\s[DC]\b)?/g;
const NAO_E_LANCAMENTO = /\b(saldo|s\s?a\s?l\s?d\s?o|total|limite|juros acumulados|lancamentos futuros|saldo anterior)\b/;
const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function valorDe(token: string): number {
  const t = token.trim();
  const negativo = /^-/.test(t) || /-$/.test(t) || /\sD$/.test(t);
  const n = Number(t.replace(/[^\d,]/g, "").replace(",", "."));
  return negativo ? -n : n;
}

/** Ano mais citado nas datas completas do documento (o período do extrato), para as linhas que só têm dia/mês. */
function anoDoDocumento(linhas: string[]): number {
  const anos = new Map<number, number>();
  for (const l of linhas) for (const m of l.matchAll(/\b\d{2}\/\d{2}\/(\d{4})\b/g)) anos.set(Number(m[1]), (anos.get(Number(m[1])) ?? 0) + 1);
  return [...anos].sort((a, b) => b[1] - a[1])[0]?.[0] ?? new Date().getFullYear();
}

/**
 * Linhas de texto do extrato → lançamentos. Vale a linha que começa com a data (ou continua o dia anterior) e tem um
 * valor; com dois valores, o 1º é o lançamento e o 2º o saldo. Linhas de saldo e totais ficam de fora. Uma descrição
 * quebrada em duas linhas é juntada.
 */
export function lerExtratoTexto(linhas: string[]): { linhas: LinhaPdf[]; ignoradas: number } {
  const ano = anoDoDocumento(linhas);
  const saida: LinhaPdf[] = [];
  const vistos = new Map<string, number>();
  let dia: string | null = null;
  let pendente: { data: string; descricao: string } | null = null;
  let ignoradas = 0;
  for (const bruta of linhas) {
    const l = bruta.replace(/\s+/g, " ").trim();
    if (!l) continue;
    const m = l.match(DATA);
    let data: string | null = dia;
    let resto = l;
    if (m) {
      const a = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : ano;
      data = `${a}-${m[2]}-${m[1]}`;
      resto = l.slice(m[0].length).trim();
      dia = data;
    }
    const valores = resto.match(DINHEIRO) ?? [];
    let descricao = resto.replace(DINHEIRO, " ").replace(/\s+/g, " ").replace(/\s[-–]\s*$/, "").trim();
    if (!valores.length) {
      // descrição sem valor: pode continuar na linha de baixo
      pendente = m && descricao && !NAO_E_LANCAMENTO.test(sem(descricao)) ? { data: data!, descricao } : null;
      continue;
    }
    if (!data) { ignoradas++; continue; }
    if (pendente && !m) { descricao = `${pendente.descricao} ${descricao}`.trim(); data = pendente.data; }
    pendente = null;
    if (NAO_E_LANCAMENTO.test(sem(descricao)) || !descricao) { ignoradas++; continue; }
    const valor = valorDe(valores[0] ?? "");
    if (!valor) { ignoradas++; continue; }
    const base = `pdf:${data}:${valor.toFixed(2)}:${sem(descricao).replace(/[^a-z0-9]/g, "").slice(0, 60)}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    saida.push({ data, descricao: descricao.slice(0, 200), valor, identificador: n > 1 ? `${base}:${n}` : base });
  }
  return { linhas: saida, ignoradas };
}

/** Texto das páginas do PDF em linhas (agrupa os pedaços pela altura na página, da esquerda para a direita). */
export async function textoDoPdf(arquivo: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  const linhas: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const conteudo = await (await doc.getPage(p)).getTextContent();
      const porY = new Map<number, { x: number; s: string }[]>();
      for (const it of conteudo.items as { str?: string; transform?: number[] }[]) {
        if (!it.str?.trim() || !it.transform) continue;
        const y = Math.round(it.transform[5] / 2) * 2;
        porY.set(y, [...(porY.get(y) ?? []), { x: it.transform[4], s: it.str }]);
      }
      for (const [, partes] of [...porY].sort((a, b) => b[0] - a[0])) linhas.push(partes.sort((a, b) => a.x - b.x).map((q) => q.s).join(" "));
    }
  } finally {
    doc.destroy();
  }
  return linhas;
}

export async function lerExtratoPdf(arquivo: File) {
  const texto = await textoDoPdf(arquivo);
  if (!texto.length) throw new Error("o PDF não tem texto (é uma imagem escaneada?): baixe o extrato pelo app ou site do banco");
  return lerExtratoTexto(texto);
}
