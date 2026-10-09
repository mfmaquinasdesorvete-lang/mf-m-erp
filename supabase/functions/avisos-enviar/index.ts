// Entrega os avisos pendentes (Telegram e e-mail). Chamada a cada minuto pelo
// pg_cron (ver supabase/agendamento.sql) com Authorization: Bearer <token do agendamento>.
// Deploy com --no-verify-jwt.
import { json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { entregarFila } from "../_shared/avisos.ts";
import { chamadaDoAgendamento } from "../_shared/cron.ts";

Deno.serve(async (req) => {
  if (!(await chamadaDoAgendamento(req))) return json({ error: "não autorizado" }, 401);
  try {
    return json({ ok: true, ...(await entregarFila(adminClient())) });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
