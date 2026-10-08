import { supabase } from "./supabase";

const BUCKET = "os-fotos";

/** Reduz a foto (celulares geram arquivos de vários MB) antes de enviar. */
export async function reduzir(arquivo: File, lado = 1600): Promise<Blob> {
  const img = await createImageBitmap(arquivo);
  const escala = Math.min(1, lado / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * escala);
  c.height = Math.round(img.height * escala);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob((b) => ok(b!), "image/jpeg", 0.82));
}

export async function enviarFotoOS(osId: string, arquivo: File) {
  const caminho = `${osId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, await reduzir(arquivo), { contentType: "image/jpeg" });
  if (error) throw error;
  return caminho;
}

/** Links temporários (1 h) para exibir as fotos do bucket privado. */
export async function urlsFotos(caminhos: string[]): Promise<Record<string, string>> {
  if (!caminhos.length) return {};
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(caminhos, 3600);
  return Object.fromEntries((data ?? []).map((d) => [d.path, d.signedUrl]));
}

export async function apagarFotoOS(caminho: string) {
  await supabase.storage.from(BUCKET).remove([caminho]);
}
