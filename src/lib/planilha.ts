// Abre planilha (.xlsx/.xls) ou CSV. O Tiny e a maioria dos sistemas exportam CSV em UTF-8 sem a marca no começo:
// lido como Windows-1252, "Endereço" virava "EndereÃ§o" e a coluna não era reconhecida. CSV que é UTF-8 válido
// é lido como UTF-8; o resto (e as .xls antigas) segue em Windows-1252, como antes.
import type * as XLSXTipos from "xlsx";

type Lib = typeof XLSXTipos;

/** O conteúdo é texto (não é .xlsx/zip nem .xls binária). */
const ehTexto = (b: Uint8Array) => !((b[0] === 0x50 && b[1] === 0x4b) || (b[0] === 0xd0 && b[1] === 0xcf));

/** Texto em UTF-8 quando o arquivo é UTF-8 válido; senão null. */
export function textoUtf8(b: Uint8Array): string | null {
  if (!ehTexto(b)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b).replace(/^\uFEFF/, "");
  } catch {
    return null;
  }
}

/** textoCru: não converte nada (datas como "05/21" e documentos continuam texto). */
export async function abrirPlanilha(XLSX: Lib, arquivo: Blob, opcoes: { textoCru?: boolean } = {}) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const texto = textoUtf8(bytes);
  if (texto !== null) return XLSX.read(texto, { type: "string", raw: opcoes.textoCru });
  return XLSX.read(bytes, { type: "array", codepage: 1252 });
}
