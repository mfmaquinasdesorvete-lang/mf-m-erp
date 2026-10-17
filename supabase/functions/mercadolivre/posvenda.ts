// Mercado Livre (fase A): depois da venda.
//  enviarNotas: anexa à venda no Mercado Livre o XML da NF-e autorizada no ERP (POST /packs/{pack}/fiscal_documents,
//    campo fiscal_document), só com a conta em "o ERP emite a nota". O XML vem do banco (notas importadas) ou da Focus.
//  enviarRastreios: nos envios por conta própria (ME1/personalizado) despachados com código de rastreio na expedição,
//    informa o rastreio e marca como enviado (PUT /shipments/{id} com tracking_number, receiver_id e status shipped).
// Cada item tenta até 5 vezes (a fila fica no banco: ml_notas_pendentes e ml_rastreios_pendentes); o erro fica na venda.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { caminhoNotaML, chamarML, ErroML, prepararXmlNfe } from "../_shared/mercadolivre.ts";
import { focusBaseUrl, focusToken } from "../_shared/focusnfe.ts";

type NotaFila = { ml_pedido_id: string; ml_order_id: number; ml_pack_id: number | null; chave: string | null; xml_url: string | null; xml: string | null; unidade_codigo: string | null };
type RastreioFila = { ml_pedido_id: string; ml_order_id: number; shipment_id: number; rastreio: string };

const LIMITE_MS = 100_000;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 400);

/** XML da nota: o guardado no banco ou o da Focus (com o token da unidade). */
async function xmlDaNota(n: NotaFila): Promise<string | null> {
  if (n.xml) return n.xml;
  if (!n.xml_url) return null;
  const token = focusToken(n.unidade_codigo);
  const headers: Record<string, string> = n.xml_url.startsWith(focusBaseUrl()) && token ? { Authorization: "Basic " + btoa(`${token}:`) } : {};
  try {
    const r = await fetch(n.xml_url, { headers, signal: AbortSignal.timeout(20_000) });
    return r.ok ? await r.text() : null;
  } catch { return null; }
}

export async function enviarNotas(db: SupabaseClient, token: string) {
  const inicio = Date.now();
  const resumo = { enviadas: 0, erros: 0 };
  const { data, error } = await db.rpc("ml_notas_pendentes", { p_limite: 20 });
  if (error) throw new Error(error.message);
  for (const n of (data ?? []) as NotaFila[]) {
    if (Date.now() - inicio > LIMITE_MS) break;
    const pronto = prepararXmlNfe(await xmlDaNota(n));
    if ("erro" in pronto) {
      await db.rpc("ml_marcar_nota", { p_ml_pedido: n.ml_pedido_id, p_ok: false, p_erro: pronto.erro });
      resumo.erros++;
      continue;
    }
    const form = new FormData();
    form.append("fiscal_document", new File([pronto.xml], `${n.chave ?? n.ml_order_id}.xml`, { type: "application/xml" }));
    try {
      const r = await chamarML<any>(caminhoNotaML(n.ml_order_id, n.ml_pack_id), token, { method: "POST", body: form });
      const id = Array.isArray(r?.ids) ? r.ids.join(",") : String(r?.id ?? r?.fiscal_document_id ?? "");
      await db.rpc("ml_marcar_nota", { p_ml_pedido: n.ml_pedido_id, p_ok: true, p_ml_id: id || null });
      resumo.enviadas++;
    } catch (e) {
      if (e instanceof ErroML && e.status === 401) throw e; // acesso perdido: para tudo
      await db.rpc("ml_marcar_nota", { p_ml_pedido: n.ml_pedido_id, p_ok: false, p_erro: msg(e) });
      resumo.erros++;
    }
  }
  return resumo;
}

export async function enviarRastreios(db: SupabaseClient, token: string) {
  const inicio = Date.now();
  const resumo = { enviados: 0, erros: 0 };
  const { data, error } = await db.rpc("ml_rastreios_pendentes", { p_limite: 20 });
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as RastreioFila[]) {
    if (Date.now() - inicio > LIMITE_MS) break;
    try {
      const envio = await chamarML<any>(`/shipments/${r.shipment_id}`, token);
      const receiver = envio?.receiver_id ?? envio?.destination?.receiver_id ?? null;
      await chamarML(`/shipments/${r.shipment_id}`, token, {
        method: "PUT",
        cabecalhos: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracking_number: r.rastreio, ...(receiver ? { receiver_id: receiver } : {}), status: "shipped" }),
      });
      await db.rpc("ml_marcar_rastreio", { p_ml_pedido: r.ml_pedido_id, p_ok: true });
      await db.rpc("ml_registrar_envio", { p: { order_id: r.ml_order_id, status: "shipped", rastreio: r.rastreio } });
      resumo.enviados++;
    } catch (e) {
      if (e instanceof ErroML && e.status === 401) throw e;
      await db.rpc("ml_marcar_rastreio", { p_ml_pedido: r.ml_pedido_id, p_ok: false, p_erro: msg(e) });
      resumo.erros++;
    }
  }
  return resumo;
}
