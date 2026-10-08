// Catálogo do WhatsApp e vitrine: fotos públicas dos produtos e dados da loja.
import { DEMO, supabase } from "./supabase";
import { reduzir } from "./fotos";
export { descricaoCatalogo, pendenciaCatalogo, type ProdutoLoja } from "../../supabase/functions/_shared/catalogo";
import type { ProdutoLoja } from "../../supabase/functions/_shared/catalogo";

const BUCKET = "produtos-fotos";

export const urlFotoProduto = (caminho: string | null | undefined) =>
  !caminho ? "" : /^https?:\/\//.test(caminho) ? caminho : supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;

export async function enviarFotoProduto(arquivo: File) {
  const caminho = `${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, await reduzir(arquivo, 1200), { contentType: "image/jpeg" });
  if (error) throw error;
  return caminho;
}

export type DadosLoja = {
  empresa: { nome: string; whatsapp?: string | null; telefone?: string | null; email?: string | null; endereco?: string | null; municipio?: string | null; uf?: string | null; texto?: string | null };
  produtos: ProdutoLoja[];
};

export const DISPONIBILIDADE: Record<string, { rotulo: string; tom: string }> = {
  "in stock": { rotulo: "Pronta entrega", tom: "bg-emerald-50 text-emerald-700" },
  "available for order": { rotulo: "Sob encomenda", tom: "bg-sky-50 text-sky-700" },
  "out of stock": { rotulo: "Esgotado", tom: "bg-slate-100 text-slate-600" },
};

/** Endereço do feed que vai no Gerenciador de Comércio da Meta. */
export const urlFeed = () =>
  DEMO ? "https://SEU-PROJETO.supabase.co/functions/v1/catalogo-feed" : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/catalogo-feed`;

export const urlLoja = (id?: string) => `${DEMO ? "https://erp.mfmaquinas.com.br" : window.location.origin}/loja${id ? `/${id}` : ""}`;
