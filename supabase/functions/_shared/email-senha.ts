// Senha da caixa de e-mail: fica no cofre do Supabase (Vault), não na tabela email_contas. Só o servidor lê
// (a função email_senha do banco é liberada apenas ao service_role).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";

export async function senhaDoEmail(db: SupabaseClient, conta: string): Promise<string> {
  const { data, error } = await db.rpc("email_senha", { p_conta: conta });
  if (error) throw new Error(`senha da caixa de e-mail: ${error.message}`);
  return String(data ?? "");
}
