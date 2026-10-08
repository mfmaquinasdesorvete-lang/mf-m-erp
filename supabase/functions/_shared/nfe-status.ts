// Aplica o retorno da Focus NFe (consulta ou gatilho) a uma nota emitida.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { focusUrl } from "./focusnfe.ts";

const STATUS: Record<string, string> = {
  autorizado: "autorizada",
  cancelado: "cancelada",
  erro_autorizacao: "erro",
  denegado: "denegada",
  processando_autorizacao: "processando",
};

export async function aplicarRetornoNfe(db: SupabaseClient, nota: { id: string; status: string; pedido_id: string | null }, body: any) {
  const status = STATUS[body.status] ?? nota.status;
  // Só sobrescreve o que veio no retorno (o retorno do cancelamento, p.ex., não traz número/chave).
  const patch: Record<string, unknown> = { status, resposta: body, updated_at: new Date().toISOString() };
  if (body.numero) patch.numero = body.numero;
  if (body.serie) patch.serie = body.serie;
  if (body.chave_nfe) patch.chave = body.chave_nfe;
  if (body.caminho_xml_nota_fiscal) patch.xml_url = focusUrl(body.caminho_xml_nota_fiscal);
  if (body.caminho_danfe) patch.danfe_url = focusUrl(body.caminho_danfe);
  if (body.mensagem_sefaz !== undefined) patch.mensagem = body.mensagem_sefaz;

  const { data } = await db.from("notas_fiscais").update(patch).eq("id", nota.id).select().single();

  if (nota.pedido_id) {
    if (status === "autorizada") {
      await db.from("pedidos").update({ status: "faturado" }).eq("id", nota.pedido_id).eq("status", "aprovado");
    } else if (status === "cancelada") {
      await db.from("pedidos").update({ status: "aprovado" }).eq("id", nota.pedido_id).eq("status", "faturado");
    }
  }
  return data;
}
