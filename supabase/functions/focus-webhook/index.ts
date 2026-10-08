// Gatilhos (webhooks) da Focus NFe:
//  - evento "nfe": mudança de status de uma NF-e emitida (autorizada, rejeitada, cancelada)
//  - evento "nfe_recebida": nova NF-e emitida contra o CNPJ da MF (fornecedores)
// Registre os gatilhos em Configurações (função focus-config). Deploy com --no-verify-jwt:
// a Focus envia no header Authorization o token FOCUS_WEBHOOK_TOKEN.
import { json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { aplicarRetornoNfe } from "../_shared/nfe-status.ts";
import { CONFIG_RECEBIDAS, processarNota, salvarRecebida, unidadePorCnpj } from "../_shared/nfe-recebidas.ts";

Deno.serve(async (req) => {
  const token = Deno.env.get("FOCUS_WEBHOOK_TOKEN")?.trim();
  if (!token || req.headers.get("Authorization") !== token) return json({ error: "não autorizado" }, 401);

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "corpo inválido" }, 400);
  const db = adminClient();

  // NF-e emitida por nós: vem com a referência usada na emissão
  if (body.ref) {
    const { data: nota } = await db.from("notas_fiscais").select("id, status, pedido_id").eq("referencia", body.ref).maybeSingle();
    if (nota) await aplicarRetornoNfe(db, nota, body);
    return json({ ok: true });
  }

  // NF-e recebida de fornecedor
  if (body.chave_nfe && body.documento_emitente) {
    await salvarRecebida(db, body, await unidadePorCnpj(db, body.cnpj_destinatario ?? body.documento_destinatario ?? body.cnpj));
    // Tenta processar já (ciência + XML + estoque). Se o XML ainda não estiver
    // liberado pela SEFAZ, o agendamento (nfe-processar) tenta de novo depois.
    const [{ data: nfe }, { data: cfg }] = await Promise.all([
      db.from("nfe_recebidas").select("*").eq("chave", body.chave_nfe).single(),
      db.from("configuracoes").select(CONFIG_RECEBIDAS).eq("id", 1).single(),
    ]);
    if (nfe && cfg && ["pendente", "aguardando_xml"].includes(nfe.processamento)) await processarNota(db, nfe, cfg);
  }
  return json({ ok: true });
});
