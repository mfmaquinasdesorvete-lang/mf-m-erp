import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { criarClienteDemo } from "./demo";

/** Modo demonstração: dados de exemplo em memória, sem Supabase (npm run build:demo). */
export const DEMO = import.meta.env.VITE_DEMO === "1";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!DEMO && (!url || !key)) {
  console.error("Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env");
}

export const supabase = (DEMO ? criarClienteDemo() : createClient(url ?? "http://localhost", key ?? "anon")) as SupabaseClient<any, "public", any>;

/** Chama uma Edge Function e devolve o JSON, lançando a mensagem de erro amigável. */
export async function callFunction<T = any>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const ctx = (error as any).context;
    const msg = ctx?.json ? (await ctx.json().catch(() => null))?.error : null;
    throw new Error(msg || error.message);
  }
  return data as T;
}
