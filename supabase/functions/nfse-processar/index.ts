// Execução agendada (a cada 5 min, só quando há NFS-e sem resultado; ver supabase/agendamento.sql):
// consulta na Focus as NFS-e em andamento ou com resultado incerto (pela mesma referência; só reenvia o mesmo conteúdo
// se a Focus confirmar que não recebeu) e confere os cancelamentos pedidos.
// Deploy com --no-verify-jwt; protegido pelo header Authorization: Bearer <token do agendamento>.
import { json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { chamadaDoAgendamento } from "../_shared/cron.ts";
import { processarNfses } from "../_shared/nfse.ts";

Deno.serve(async (req) => {
  if (!(await chamadaDoAgendamento(req))) return json({ error: "não autorizado" }, 401);
  return json({ ok: true, ...(await processarNfses(adminClient())) });
});
