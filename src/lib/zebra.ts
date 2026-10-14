// Impressora de etiquetas Zebra. Dois jeitos de imprimir:
//  * PDF pelo driver (ZDesigner) da impressora, na janela de impressão do navegador: funciona em qualquer Zebra.
//  * Direto, sem janela, pelo programa gratuito Zebra Browser Print instalado no computador da expedição (manda ZPL).
// Aqui ficam o teste de impressão (PDF e ZPL), a calibragem e o escurecimento.
import type { ImpressoraEtiqueta } from "./types";

export const PADRAO_IMPRESSORA: Required<Pick<ImpressoraEtiqueta, "dpi" | "largura_mm" | "altura_mm" | "metodo" | "escurecimento">> = {
  dpi: 203, largura_mm: 100, altura_mm: 150, metodo: "pdf", escurecimento: 15,
};
export const comPadrao = (i?: ImpressoraEtiqueta | null) => ({ ...PADRAO_IMPRESSORA, ...(i ?? {}) });

type Dispositivo = { name: string; uid: string; connection?: string; deviceType?: string; provider?: string; manufacturer?: string };
const BASES = ["http://127.0.0.1:9100", "https://127.0.0.1:9101", "http://localhost:9100"];

/** Acha o Zebra Browser Print e a impressora padrão dele (null = programa fechado ou não instalado). */
export async function zebraPadrao(): Promise<{ base: string; impressora: Dispositivo } | null> {
  for (const base of BASES) {
    try {
      const r = await fetch(`${base}/default?type=printer`, { signal: AbortSignal.timeout(2500) });
      if (!r.ok) continue;
      const texto = await r.text();
      if (!texto.trim()) continue;
      return { base, impressora: JSON.parse(texto) as Dispositivo };
    } catch { /* tenta o próximo endereço */ }
  }
  return null;
}

/** Manda comandos ZPL para a impressora pelo Zebra Browser Print. */
export async function zebraEnviar(base: string, impressora: Dispositivo, zpl: string) {
  const r = await fetch(`${base}/write`, {
    method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ device: impressora, data: zpl }), signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`A impressora não aceitou (${r.status})`);
}

const pontos = (mm: number, dpi: number) => Math.round((mm / 25.4) * dpi);
/** Tira acento (a fonte padrão da Zebra não tem) e caracteres que o ZPL usa como comando. */
const zplTexto = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\^~]/g, "");

/** Etiqueta de teste em ZPL: borda, régua a cada 1 cm e o tamanho configurado. */
export function zplTeste(cfg: ImpressoraEtiqueta, empresa: string): string {
  const c = comPadrao(cfg);
  const w = pontos(c.largura_mm, c.dpi), h = pontos(c.altura_mm, c.dpi), m = pontos(3, c.dpi), cm = pontos(10, c.dpi);
  const reguas = Array.from({ length: Math.floor(c.largura_mm / 10) }, (_, i) => `^FO${(i + 1) * cm},${m}^GB2,${pontos(4, c.dpi)},2^FS`).join("");
  return [
    "^XA", `^PW${w}`, `^LL${h}`, "^CI28", `~SD${Math.max(0, Math.min(30, Math.round(c.escurecimento)))}`,
    `^FO${m},${m}^GB${w - 2 * m},${h - 2 * m},4^FS`, reguas,
    `^FO${m * 3},${pontos(14, c.dpi)}^A0N,${pontos(7, c.dpi)},${pontos(7, c.dpi)}^FD${zplTexto("Teste de etiqueta")}^FS`,
    `^FO${m * 3},${pontos(25, c.dpi)}^A0N,${pontos(4.5, c.dpi)},${pontos(4.5, c.dpi)}^FD${zplTexto(empresa)}^FS`,
    `^FO${m * 3},${pontos(33, c.dpi)}^A0N,${pontos(3.5, c.dpi)},${pontos(3.5, c.dpi)}^FD${c.largura_mm} x ${c.altura_mm} mm - ${c.dpi} dpi^FS`,
    `^FO${m * 3},${pontos(45, c.dpi)}^BY2^BCN,${pontos(15, c.dpi)},Y,N,N^FDERPLINE123^FS`,
    `^FO${m * 3},${h - pontos(14, c.dpi)}^A0N,${pontos(3, c.dpi)},${pontos(3, c.dpi)}^FD${zplTexto("A borda tem que aparecer inteira nos 4 lados")}^FS`,
    "^XZ",
  ].join("\n");
}

/** Calibra o sensor (mede a etiqueta de novo): use depois de trocar o rolo. */
export const ZPL_CALIBRAR = "~JC";

/** Etiqueta de teste em PDF do tamanho configurado (para imprimir pelo driver da Zebra). */
export async function pdfTeste(cfg: ImpressoraEtiqueta, empresa: string): Promise<Blob> {
  const c = comPadrao(cfg);
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ compress: true, unit: "mm", format: [c.largura_mm, c.altura_mm], orientation: c.largura_mm > c.altura_mm ? "landscape" : "portrait" });
  doc.setLineWidth(0.6);
  doc.rect(3, 3, c.largura_mm - 6, c.altura_mm - 6);
  for (let x = 10; x < c.largura_mm; x += 10) doc.line(x, 3, x, 7);
  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text("Teste de etiqueta", 8, 18);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.text(empresa.normalize("NFC"), 8, 26);
  doc.text(`${c.largura_mm} x ${c.altura_mm} mm`, 8, 33);
  doc.setFontSize(8);
  doc.text(["Na janela de impressão: impressora Zebra, papel", `${c.largura_mm} x ${c.altura_mm} mm, escala 100% (tamanho real), sem margens.`,
    "A borda tem que aparecer inteira nos 4 lados."], 8, c.altura_mm - 18);
  return doc.output("blob");
}
