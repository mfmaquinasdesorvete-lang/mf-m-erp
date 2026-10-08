// Emite NF-e (modelo 55) via Focus NFe, pelo CNPJ da unidade (matriz SC ou filial SP).
// POST { pedido_id }         -> venda do pedido aprovado
// POST { transferencia_id }  -> transferência de mercadoria entre as unidades
// A lógica fica em _shared/nfe-emissao.ts (também usada pela NF-e automática do agendamento).
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { emitirPedido, emitirTransferencia } from "../_shared/nfe-emissao.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { pedido_id, transferencia_id } = await req.json();
    const db = adminClient();
    if (transferencia_id) {
      await requireErpUser(req, ["financeiro", "tecnico"]);
      return await emitirTransferencia(db, transferencia_id);
    }
    await requireErpUser(req, ["vendas", "financeiro"]);
    if (!pedido_id) throw new HttpError(400, "pedido_id obrigatório");
    return await emitirPedido(db, pedido_id);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
