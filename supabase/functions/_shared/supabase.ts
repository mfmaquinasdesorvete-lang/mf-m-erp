import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/**
 * Garante que quem chamou é um usuário ativo do ERP com um dos papéis informados
 * (admin sempre passa). Sem papéis = qualquer usuário do ERP; lista vazia = só admin.
 */
export async function requireErpUser(req: Request, papeis?: string[]): Promise<{ userId: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new HttpError(401, "não autenticado");

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) throw new HttpError(401, "sessão inválida");

  const { data: ok } = papeis === undefined
    ? await userClient.rpc("is_erp_user")
    : await userClient.rpc("tem_algum_papel", { p_papeis: papeis });
  if (!ok) throw new HttpError(403, papeis === undefined ? "usuário sem acesso ao ERP" : "sem permissão para esta ação");
  return { userId: user.id };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const onlyDigits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
