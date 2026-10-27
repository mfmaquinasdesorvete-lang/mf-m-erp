// Mercado Livre: as fotos do produto para o anúncio (a principal do cadastro e as da galeria, na ordem da galeria).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { chamarML } from "../_shared/mercadolivre.ts";
import { fotosParaML } from "../_shared/ml-novos.ts";

const base = () => `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public`;
export const urlFotoPrincipal = (c: string) => (/^https?:\/\//.test(c) ? c : `${base()}/produtos-fotos/${c}`);
const urlGaleria = (c: string) => (/^https?:\/\//.test(c) ? c : `${base()}/produtos-midia/${c}`);

/** Fotos ativas da galeria de cada produto, em URL pública e na ordem da galeria. */
export async function galerias(db: SupabaseClient, ids: string[]): Promise<Map<string, string[]>> {
  const r = new Map<string, string[]>();
  if (!ids.length) return r;
  const { data } = await db.from("produtos_midia").select("produto_id, caminho").in("produto_id", ids).eq("tipo", "foto").eq("ativo", true)
    .order("ordem", { ascending: true }).order("created_at", { ascending: true });
  for (const m of (data ?? []) as { produto_id: string; caminho: string }[]) {
    const l = r.get(m.produto_id) ?? [];
    l.push(urlGaleria(m.caminho));
    r.set(m.produto_id, l);
  }
  return r;
}

const maximos = new Map<string, number | null>();
/** Quantas fotos a categoria aceita (settings.max_pictures_per_item); guarda por categoria durante a chamada. */
export async function maxFotos(categoria: string | null | undefined, token: string): Promise<number | null> {
  if (!categoria) return null;
  if (!maximos.has(categoria)) {
    const c = await chamarML<any>(`/categories/${encodeURIComponent(categoria)}`, token).catch(() => null);
    maximos.set(categoria, Number(c?.settings?.max_pictures_per_item) || null);
  }
  return maximos.get(categoria) ?? null;
}

export async function fotosDoAnuncio(principal: string | null | undefined, galeria: string[], categoria: string | null | undefined, token: string) {
  return fotosParaML(principal ? urlFotoPrincipal(principal) : null, galeria, await maxFotos(categoria, token));
}
