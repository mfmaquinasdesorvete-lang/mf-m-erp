// Baixar o XML das notas (emitidas e recebidas): um arquivo por nota ou várias num .zip.
// O XML da nota emitida pelo ERP fica na Focus e o navegador não baixa direto de lá (CORS): vem pelo servidor
// (nfe-consultar, ação "xml"). A importada fica em notas_fiscais_xml. A recebida vem de nfe-recebidas-sync (ação "xml"),
// que guarda o XML na nota na primeira vez.
import { supabase, callFunction } from "@/lib/supabase";

export type NotaParaXml = { id: string; chave: string | null; numero?: string | number | null; origem?: string | null };

/** Nome do arquivo: a chave de acesso (é como transportadora e contador procuram); sem chave, o número. */
export const nomeArquivoXml = (n: { chave: string | null; numero?: string | number | null; id: string }, sufixo = "") =>
  `${(n.chave ?? "").replace(/\D/g, "") || `NF-${n.numero ?? n.id.slice(0, 8)}`}${sufixo}.xml`;

export async function xmlDaEmitida(n: NotaParaXml): Promise<string> {
  if (n.origem === "importada") {
    const { data, error } = await supabase.from("notas_fiscais_xml").select("xml").eq("nota_id", n.id).maybeSingle();
    if (error) throw error;
    if (!data?.xml) throw new Error("Esta nota foi importada sem o XML");
    return data.xml;
  }
  const r = (await callFunction("nfe-consultar", { acao: "xml", nota_id: n.id })) as { xml?: string };
  if (!r?.xml) throw new Error("A Focus não devolveu o XML desta nota");
  return r.xml;
}

export async function xmlDaRecebida(n: { chave: string | null }): Promise<string> {
  if (!n.chave) throw new Error("Nota sem chave de acesso");
  const r = (await callFunction("nfe-recebidas-sync", { acao: "xml", chave: n.chave })) as { xml?: string };
  if (!r?.xml) throw new Error("XML indisponível na SEFAZ");
  return r.xml;
}

/** Salva um arquivo no computador (pasta Downloads). */
export function salvarArquivo(nome: string, conteudo: BlobPart, tipo = "application/xml") {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const LIMITE_XML_LOTE = 200;

/** Busca o XML de cada nota (3 por vez) e devolve os arquivos e as que falharam, sem parar no primeiro erro. */
export async function juntarXmls<T extends { id: string; chave: string | null; numero?: string | number | null }>(
  notas: T[], buscar: (n: T) => Promise<string>, progresso?: (feitas: number, total: number) => void,
) {
  const arquivos: Record<string, string> = {};
  const falhas: { nota: T; erro: string }[] = [];
  let feitas = 0;
  const fila = [...notas];
  async function trabalhador() {
    for (let n = fila.shift(); n; n = fila.shift()) {
      try {
        const xml = await buscar(n);
        let nome = nomeArquivoXml(n);
        for (let i = 2; arquivos[nome] !== undefined; i++) nome = nomeArquivoXml(n, `-${i}`);
        arquivos[nome] = xml;
      } catch (e) {
        falhas.push({ nota: n, erro: (e as Error)?.message ?? String(e) });
      }
      progresso?.(++feitas, notas.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, notas.length) }, trabalhador));
  return { arquivos, falhas };
}

/** Junta os XML num .zip (com uma lista das que não vieram, se houver) e salva. */
export async function salvarZipXml(nomeZip: string, arquivos: Record<string, string>, falhas: { nota: { chave: string | null; numero?: string | number | null }; erro: string }[]) {
  const { zipSync, strToU8 } = await import("fflate");
  const conteudo: Record<string, Uint8Array> = {};
  for (const [nome, xml] of Object.entries(arquivos)) conteudo[nome] = strToU8(xml);
  if (falhas.length) {
    conteudo["NOTAS-SEM-XML.txt"] = strToU8(falhas.map((f) => `NF ${f.nota.numero ?? ""} ${f.nota.chave ?? ""}: ${f.erro}`).join("\r\n") + "\r\n");
  }
  salvarArquivo(nomeZip, zipSync(conteudo, { level: 6 }), "application/zip");
}
