// Execução agendada (a cada 15 min, ver supabase/agendamento.sql):
// busca NF-e novas de fornecedores na Focus e processa as pendentes
// (ciência -> XML -> contas a pagar -> entrada no estoque) reenvia as NF-e da fila de contingência e emite a NF-e automática dos pedidos aprovados.
// Deploy com --no-verify-jwt; protegido pelo header Authorization: Bearer ERP_CRON_TOKEN.
import { json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { processarPendentes, sincronizarRecebidas } from "../_shared/nfe-recebidas.ts";
import { reenviarContingencia } from "../_shared/nfe-envio.ts";
import { emitirAutomaticas } from "../_shared/nfe-emissao.ts";

Deno.serve(async (req) => {
  const token = Deno.env.get("ERP_CRON_TOKEN");
  if (!token || req.headers.get("Authorization") !== `Bearer ${token}`) return json({ error: "não autorizado" }, 401);

  const db = adminClient();
  let sincronizadas = 0;
  let erroSync: string | null = null;
  const avisos: string[] = [];
  try {
    sincronizadas = await sincronizarRecebidas(db, avisos);
    erroSync = avisos.join(" | ") || null;
  } catch (e) {
    // em homologação a busca na SEFAZ não funciona; segue processando o que já existe
    erroSync = (e as Error).message;
  }
  const processadas = await processarPendentes(db);
  const contingencia = await reenviarContingencia(db).catch(() => 0);
  const automaticas = await emitirAutomaticas(db).catch(() => 0);
  return json({ ok: true, sincronizadas, processadas, erroSync, contingencia, automaticas });
});
