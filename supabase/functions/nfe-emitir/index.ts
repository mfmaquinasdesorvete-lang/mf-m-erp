// Emite NF-e (modelo 55) via Focus NFe, pelo CNPJ da unidade (matriz SC ou filial SP).
// POST { pedido_id }         -> venda do pedido aprovado
// POST { transferencia_id }  -> transferência de mercadoria entre as unidades
// POST { devolucao: { tipo: "emitida" | "recebida", id }, previa: true }            -> o que dá para devolver
// POST { devolucao: { tipo, id }, itens: [{ numero, quantidade, cfop?, produto_id? }], motivo } -> NF-e de devolução
// A lógica fica em _shared/nfe-emissao.ts (também usada pela NF-e automática do agendamento).
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { emitirPedido, emitirTransferencia } from "../_shared/nfe-emissao.ts";
import { emitirDevolucao, previaDevolucao } from "../_shared/nfe-devolucao-emissao.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const corpo = await req.json();
    const { pedido_id, transferencia_id, devolucao } = corpo;
    const db = adminClient();
    if (devolucao) {
      if (!["emitida", "recebida"].includes(devolucao.tipo) || typeof devolucao.id !== "string") throw new HttpError(400, "informe a nota original");
      await requireErpUser(req, devolucao.tipo === "recebida" ? ["financeiro"] : ["vendas", "financeiro"]);
      if (corpo.previa) return json({ ok: true, ...(await previaDevolucao(db, devolucao)) });
      return await emitirDevolucao(db, devolucao, corpo.itens, corpo.motivo);
    }
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
