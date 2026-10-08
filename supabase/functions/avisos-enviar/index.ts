// Entrega os avisos pendentes (Telegram e e-mail). Chamada a cada minuto pelo
// pg_cron (ver supabase/agendamento.sql) com Authorization: Bearer ERP_CRON_TOKEN.
// Deploy com --no-verify-jwt.
import { json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { entregarFila } from "../_shared/avisos.ts";

Deno.serve(async (req) => {
  const token = Deno.env.get("ERP_CRON_TOKEN");
  if (!token || req.headers.get("Authorization") !== `Bearer ${token}`) return json({ error: "não autorizado" }, 401);
  try {
    return json({ ok: true, ...(await entregarFila(adminClient())) });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
