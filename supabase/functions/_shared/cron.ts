// Chamada do agendamento (pg_cron) com Authorization: Bearer <token>. O token é gerado e guardado no Vault pelo
// próprio banco (erp_cron_token) e conferido aqui pela chave de serviço; o secret ERP_CRON_TOKEN, se existir, também vale.
import { adminClient } from "./supabase.ts";

export async function chamadaDoAgendamento(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7).trim();
  const env = Deno.env.get("ERP_CRON_TOKEN");
  if (env && token === env) return true;
  // o login de um usuário (JWT) não é token do agendamento: nem consulta o banco
  if (token.length < 32 || token.startsWith("eyJ")) return false;
  const { data } = await adminClient().rpc("cron_token_valido", { p_token: token });
  return data === true;
}
