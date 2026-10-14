// No site de verdade a demonstração não entra no pacote (deixa o ERP mais leve para abrir).
// O vite.config troca "./demo" por este arquivo fora do modo demonstração (npm run build:demo usa o demo.ts completo).
import type { SupabaseClient } from "@supabase/supabase-js";

export const USUARIOS_DEMO: { user_id: string; nome: string; email: string; papel: string }[] = [];

export function entrarDemo(_userId: string) {
  /* sem demonstração no site de verdade */
}

export function criarClienteDemo(): SupabaseClient {
  throw new Error("Modo demonstração indisponível nesta versão do site");
}
