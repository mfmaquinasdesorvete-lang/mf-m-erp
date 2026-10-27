// Galeria dos produtos (fotos e vídeos curtos) e documentos das máquinas (manual, esquema elétrico, dicas),
// no bucket público produtos-midia. Antes de subir, a foto vira JPEG de até 1600 px e o vídeo é regravado em
// 720p com taxa menor (fica leve para o site e para o WhatsApp do cliente).
import { supabase } from "./supabase";
import { reduzir } from "./fotos";

export const BUCKET_MIDIA = "produtos-midia";
export type TipoMidia = "foto" | "video" | "manual" | "eletrico" | "dicas" | "outro" | "desenho";
export type Midia = {
  id: string; produto_id: string; tipo: TipoMidia; titulo: string | null; caminho: string; mime: string | null;
  tamanho: number | null; duracao_seg: number | null; ordem: number; ativo: boolean; created_at: string;
};

export const NOME_MIDIA: Record<TipoMidia, string> = {
  foto: "Foto", video: "Vídeo", manual: "Manual da máquina", eletrico: "Manual elétrico / esquema", dicas: "Dicas de manutenção", outro: "Outro documento", desenho: "Desenho técnico",
};
/** Vídeo rápido: até 90 segundos. */
export const VIDEO_MAX_SEG = 90;
const LIMITE_BYTES = 50 * 1024 * 1024;

export const urlMidia = (caminho: string) =>
  /^https?:\/\//.test(caminho) ? caminho : supabase.storage.from(BUCKET_MIDIA).getPublicUrl(caminho).data.publicUrl;

/** Documento por link (Calameo, Google Drive, site do fabricante): devolve o endereço limpo ou null se não for link.
 *  Link do Calameo vira o leitor público (calameo.com/read/CÓDIGO), que abre em qualquer celular. */
export function linkDocumento(texto: string): string | null {
  const t = texto.trim();
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null;
  if (/(^|\.)calameo\.com$/i.test(u.hostname)) {
    const cod = u.pathname.match(/\/(?:read|books)\/([0-9a-z]{10,})/i)?.[1] ?? u.searchParams.get("bkcode");
    if (cod) return `https://www.calameo.com/read/${cod}`;
  }
  u.protocol = "https:";
  return u.toString();
}
export const ehLinkCalameo = (caminho: string) => /^https:\/\/www\.calameo\.com\/read\//.test(caminho);

export const tamanhoTexto = (b: number | null | undefined) =>
  !b ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

/** Duração do vídeo (segundos), sem regravar. */
function lerVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((ok, erro) => {
    const v = document.createElement("video");
    v.preload = "metadata"; v.muted = true; v.playsInline = true; v.src = url;
    v.onloadedmetadata = () => ok(v);
    v.onerror = () => erro(new Error("Este vídeo não abre neste navegador. Grave em MP4 (H.264) ou tente pelo computador."));
  });
}

/**
 * Regrava o vídeo menor (720p, ~1,2 Mbps) tocando-o num canvas. Vídeos pequenos, navegadores sem gravação
 * ou resultado maior que o original: sobe o original.
 */
export async function reduzirVideo(arquivo: File, aoProgredir?: (pct: number) => void): Promise<{ blob: Blob; mime: string; duracao: number }> {
  const url = URL.createObjectURL(arquivo);
  try {
    const v = await lerVideo(url);
    const duracao = Number.isFinite(v.duration) ? v.duration : 0;
    if (duracao > VIDEO_MAX_SEG + 1) throw new Error(`Vídeo de ${Math.round(duracao)} segundos: o limite é ${VIDEO_MAX_SEG} s (vídeo rápido). Corte antes de enviar.`);
    const tipo = typeof MediaRecorder === "undefined" ? undefined
      : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find((t) => MediaRecorder.isTypeSupported?.(t));
    const canvas = document.createElement("canvas");
    const pequeno = arquivo.size < 4 * 1024 * 1024 && Math.max(v.videoWidth, v.videoHeight) <= 1280;
    if (pequeno || !tipo || typeof canvas.captureStream !== "function") return { blob: arquivo, mime: arquivo.type || "video/mp4", duracao };

    const escala = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight, 1), 720 / Math.min(v.videoWidth || 720, v.videoHeight || 720));
    canvas.width = Math.max(2, Math.round((v.videoWidth * escala) / 2) * 2);
    canvas.height = Math.max(2, Math.round((v.videoHeight * escala) / 2) * 2);
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(30);
    // som: pega a faixa de áudio do próprio vídeo (Chrome, Edge, Firefox); sem isso, vai sem som
    v.muted = false; v.volume = 0.0001;
    try {
      const fonte = (v as any).captureStream?.() ?? (v as any).mozCaptureStream?.();
      fonte?.getAudioTracks?.().forEach((t: MediaStreamTrack) => stream.addTrack(t));
    } catch { /* sem som */ }
    const rec = new MediaRecorder(stream, { mimeType: tipo, videoBitsPerSecond: 1_200_000, audioBitsPerSecond: 64_000 });
    const partes: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
    const parou = new Promise<void>((ok) => { rec.onstop = () => ok(); });
    const desenhar = () => {
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      if (duracao) aoProgredir?.(Math.min(99, Math.round((v.currentTime / duracao) * 100)));
      if (!v.paused && !v.ended) requestAnimationFrame(desenhar);
    };
    rec.start(1000);
    try { await v.play(); } catch { v.muted = true; await v.play(); }
    desenhar();
    await new Promise<void>((ok) => { v.onended = () => ok(); });
    rec.stop();
    await parou;
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(partes, { type: tipo.split(";")[0] });
    aoProgredir?.(100);
    return blob.size && blob.size < arquivo.size ? { blob, mime: blob.type, duracao } : { blob: arquivo, mime: arquivo.type || "video/mp4", duracao };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const extensao = (mime: string) =>
  mime.includes("pdf") ? "pdf" : mime.includes("webm") ? "webm" : mime.includes("quicktime") ? "mov" : mime.startsWith("video") ? "mp4" : mime.includes("png") ? "png" : "jpg";

/** Reduz (foto ou vídeo), sobe e registra na galeria do produto. */
export async function enviarMidia(produtoId: string, arquivo: File, tipo: TipoMidia, titulo?: string | null, aoProgredir?: (pct: number) => void): Promise<Midia> {
  let blob: Blob = arquivo, mime = arquivo.type || "application/octet-stream", duracao: number | null = null;
  if (tipo === "foto") {
    if (!arquivo.type.startsWith("image/")) throw new Error(`${arquivo.name}: não é uma imagem`);
    blob = await reduzir(arquivo, 1600); mime = "image/jpeg";
  } else if (tipo === "video") {
    if (!arquivo.type.startsWith("video/")) throw new Error(`${arquivo.name}: não é um vídeo`);
    const r = await reduzirVideo(arquivo, aoProgredir);
    blob = r.blob; mime = r.mime; duracao = Math.round(r.duracao);
  } else if (mime !== "application/pdf" && !mime.startsWith("image/")) {
    throw new Error(`${arquivo.name}: envie o documento em PDF (ou uma imagem)`);
  } else if (mime.startsWith("image/")) {
    blob = await reduzir(arquivo, 2200); mime = "image/jpeg";
  }
  if (blob.size > LIMITE_BYTES) throw new Error(`${arquivo.name}: ${tamanhoTexto(blob.size)} — o limite é 50 MB`);
  const caminho = `${produtoId}/${crypto.randomUUID()}.${extensao(mime)}`;
  const { error } = await supabase.storage.from(BUCKET_MIDIA).upload(caminho, blob, { contentType: mime, cacheControl: "31536000" });
  if (error) throw error;
  const { data, error: e2 } = await supabase.from("produtos_midia").insert({
    produto_id: produtoId, tipo, caminho, mime, tamanho: blob.size, duracao_seg: duracao,
    titulo: (titulo ?? "").trim() || (tipo === "foto" || tipo === "video" ? null : arquivo.name.replace(/\.[a-z0-9]+$/i, "")),
  }).select().single();
  if (e2) throw e2;
  return data as Midia;
}

