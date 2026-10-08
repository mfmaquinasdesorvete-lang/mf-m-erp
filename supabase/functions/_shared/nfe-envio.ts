// Envio da NF-e para a Focus com fila de contingência: se a Focus/SEFAZ não responder,
// a nota fica "em contingência" e o agendamento reenvia sozinho até autorizar.
// (Quando a SEFAZ do estado declara contingência, a Focus emite pela SVC automaticamente.)
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { focus } from "./focusnfe.ts";
import { aplicarRetornoNfe } from "./nfe-status.ts";

export type Envio = { status: "processando" | "erro" | "contingencia"; mensagem: string | null; resposta: unknown };

const FILA = "Sem resposta da SEFAZ/Focus. A nota ficou na fila de contingência e será reenviada automaticamente.";

export async function enviarNfe(referencia: string, payload: unknown): Promise<Envio> {
  let res: Response;
  try {
    res = await focus(`/v2/nfe?ref=${encodeURIComponent(referencia)}`, { method: "POST", body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    return { status: "contingencia", mensagem: FILA, resposta: { erro: (e as Error).message } };
  }
  const resposta = await res.json().catch(() => ({}));
  if (res.status >= 500 || res.status === 429) return { status: "contingencia", mensagem: FILA, resposta };
  if (res.ok) return { status: "processando", mensagem: null, resposta };
  const mensagem = [resposta.mensagem, ...(resposta.erros ?? []).map((e: any) => e.mensagem)].filter(Boolean).join(" | ");
  return { status: "erro", mensagem: mensagem || `Focus NFe HTTP ${res.status}`, resposta };
}

/** Reenvia as notas da fila de contingência (chamado pelo agendamento). */
export async function reenviarContingencia(db: SupabaseClient) {
  const { data: fila } = await db.from("notas_fiscais").select("*").eq("status", "contingencia").lt("tentativas", 200)
    .order("created_at").limit(20);
  let reenviadas = 0;
  for (const n of fila ?? []) {
    // A Focus pode ter recebido a nota antes de cair: consulta primeiro para não duplicar
    try {
      const c = await focus(`/v2/nfe/${encodeURIComponent(n.referencia)}?completa=0`, { signal: AbortSignal.timeout(20_000) });
      if (c.ok) { await aplicarRetornoNfe(db, n, await c.json()); reenviadas++; continue; }
      if (c.status !== 404) { await db.from("notas_fiscais").update({ tentativas: n.tentativas + 1 }).eq("id", n.id); continue; }
    } catch {
      await db.from("notas_fiscais").update({ tentativas: n.tentativas + 1 }).eq("id", n.id);
      continue;
    }
    const r = await enviarNfe(n.referencia, n.payload);
    await db.from("notas_fiscais").update({ status: r.status, mensagem: r.mensagem, resposta: r.resposta, tentativas: n.tentativas + 1, updated_at: new Date().toISOString() }).eq("id", n.id);
    if (r.status !== "contingencia") reenviadas++;
  }
  return reenviadas;
}
