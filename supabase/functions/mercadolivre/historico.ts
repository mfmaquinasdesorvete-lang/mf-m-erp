// Histórico de tudo o que já foi vendido na conta do Mercado Livre (tabela ml_historico): só para o painel e os
// números, não cria pedido no ERP. Busca para trás, 50 vendas por vez, primeiro nos pedidos recentes e depois nos
// arquivados, e completa cada venda com as datas do envio (pronto, despachado, entregue). Continua de onde parou.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { chamarML, ErroML } from "../_shared/mercadolivre.ts";

type ContaHistorico = {
  id: string; ml_user_id: number; historico_ate?: string | null; historico_fonte?: string | null; historico_completo?: boolean | null;
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const texto = (v: unknown) => (v == null || String(v).trim() === "" ? null : String(v));

/** Uma venda (como vem na busca de pedidos) no formato da tabela ml_historico. */
export function linhaHistorico(o: any, contaId: string) {
  const itens = (o?.order_items ?? []).map((oi: any) => ({
    item_id: texto(oi?.item?.id),
    sku: texto(oi?.item?.seller_sku) ?? texto(oi?.item?.seller_custom_field),
    titulo: String(oi?.item?.title ?? "Anúncio do Mercado Livre").slice(0, 300),
    quantidade: num(oi?.quantity) || 1,
    preco: num(oi?.unit_price),
  }));
  const pagos = (o?.payments ?? []).filter((p: any) => p?.status === "approved");
  const tarifaPag = pagos.reduce((s: number, p: any) => s + num(p?.marketplace_fee), 0);
  const tarifaItens = (o?.order_items ?? []).reduce((s: number, oi: any) => s + num(oi?.sale_fee) * (num(oi?.quantity) || 1), 0);
  return {
    conta_id: contaId,
    ml_order_id: Number(o.id),
    ml_pack_id: o?.pack_id ? Number(o.pack_id) : null,
    data_venda: texto(o?.date_closed) ?? texto(o?.date_created),
    status: texto(o?.status),
    total: num(o?.total_amount),
    pago: num(o?.paid_amount),
    tarifa: Math.round((tarifaPag || tarifaItens) * 100) / 100,
    comprador: texto(o?.buyer?.nickname),
    itens,
    qtd_itens: itens.reduce((s: number, i: { quantidade: number }) => s + i.quantidade, 0),
    pagamento_id: pagos[0]?.id ? Number(pagos[0].id) : null,
    pago_em: texto(pagos[0]?.date_approved),
    shipment_id: o?.shipping?.id ? Number(o.shipping.id) : null,
    atualizado_em: new Date().toISOString(),
  };
}

/** Grava (ou atualiza) as vendas no histórico; as datas do envio não são tocadas aqui. */
export async function gravarHistorico(db: SupabaseClient, contaId: string, pedidos: any[]) {
  const linhas = pedidos.filter((o) => o?.id).map((o) => linhaHistorico(o, contaId));
  if (!linhas.length) return 0;
  const { error } = await db.from("ml_historico").upsert(linhas, { onConflict: "ml_order_id" });
  if (error) throw new Error(`histórico: ${error.message}`);
  return linhas.length;
}

/**
 * Um pedaço da busca para trás e das datas de envio, dentro do tempo dado.
 * Devolve quantas vendas vieram, quantos envios foram completados e se o histórico já chegou ao começo.
 */
export async function puxarHistorico(db: SupabaseClient, conta: ContaHistorico, token: string, limiteMs = 90_000) {
  const comeco = Date.now();
  let ate = conta.historico_ate ? new Date(conta.historico_ate) : new Date();
  let fonte = conta.historico_fonte === "arquivadas" ? "arquivadas" : "recentes";
  let completo = !!conta.historico_completo;
  let vendas = 0;

  while (!completo && Date.now() - comeco < limiteMs * 0.6) {
    const base = fonte === "recentes" ? "/orders/search" : "/orders/search/archived";
    let lista: any[] = [];
    try {
      const r = await chamarML(`${base}?seller=${conta.ml_user_id}&order.date_created.to=${encodeURIComponent(new Date(ate.getTime() - 1).toISOString())}&sort=date_desc&limit=50&offset=0`, token);
      lista = r?.results ?? [];
    } catch (e) {
      // a busca dos arquivados pode não existir para a conta: o histórico termina nos recentes
      if (fonte === "arquivadas" && e instanceof ErroML && e.status >= 400 && e.status < 500) { completo = true; break; }
      throw e;
    }
    if (!lista.length) {
      if (fonte === "recentes") { fonte = "arquivadas"; continue; }
      completo = true;
      break;
    }
    vendas += await gravarHistorico(db, conta.id, lista);
    const maisAntiga = Math.min(...lista.map((o) => new Date(o?.date_created ?? o?.date_closed ?? ate).getTime()).filter(Number.isFinite));
    if (!(maisAntiga < ate.getTime())) { completo = true; break; } // não andou: evita ficar parado no mesmo lugar
    ate = new Date(maisAntiga);
  }
  await db.from("ml_contas").update({
    historico_ate: ate.toISOString(), historico_fonte: fonte, historico_completo: completo, historico_em: new Date().toISOString(),
  }).eq("id", conta.id);

  const envios = await completarEnvios(db, token, comeco + limiteMs);
  return { vendas, envios, completo, ate: ate.toISOString() };
}

/** Datas do envio das vendas que ainda não têm (ou que ainda estão a caminho), das mais recentes para as antigas. */
async function completarEnvios(db: SupabaseClient, token: string, prazo: number) {
  const tresHoras = new Date(Date.now() - 3 * 3600_000).toISOString();
  const doisMeses = new Date(Date.now() - 60 * 86400_000).toISOString();
  const { data } = await db.from("ml_historico").select("id, shipment_id")
    .not("shipment_id", "is", null).neq("status", "cancelled")
    .or(`envio_buscado_em.is.null,and(entregue_em.is.null,envio_buscado_em.lt.${tresHoras},data_venda.gt.${doisMeses},envio_status.not.in.(delivered,cancelled,not_delivered))`)
    .order("data_venda", { ascending: false }).limit(120);
  const fila = (data ?? []) as { id: string; shipment_id: number }[];
  let feitos = 0;
  for (let i = 0; i < fila.length && Date.now() < prazo; i += 8) {
    await Promise.all(fila.slice(i, i + 8).map(async (h) => {
      const agora = new Date().toISOString();
      try {
        const s = await chamarML(`/shipments/${h.shipment_id}`, token, { cabecalhos: { "x-format-new": "true" } });
        const hist = s?.status_history ?? {};
        await db.from("ml_historico").update({
          envio_status: texto(s?.status), envio_substatus: texto(s?.substatus),
          logistica: texto(s?.logistic?.type) ?? texto(s?.logistic_type),
          pronto_em: texto(hist.date_ready_to_ship), despachado_em: texto(hist.date_shipped), entregue_em: texto(hist.date_delivered),
          envio_buscado_em: agora,
        }).eq("id", h.id);
        feitos++;
      } catch (e) {
        // envio que o Mercado Livre não mostra mais (muito antigo): marca como buscado para não tentar sempre
        console.error("mercadolivre: envio do histórico", h.shipment_id, e instanceof Error ? e.message : e);
        if (e instanceof ErroML && (e.status === 429 || e.status >= 500)) return; // limite ou instabilidade: tenta na próxima
        await db.from("ml_historico").update({ envio_buscado_em: agora }).eq("id", h.id);
      }
    }));
  }
  return feitos;
}
