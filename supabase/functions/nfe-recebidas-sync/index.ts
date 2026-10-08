// NF-e recebidas de fornecedores (Manifestação do Destinatário via Focus NFe).
// POST { acao: "sincronizar" }                        -> busca notas novas e processa as pendentes
// POST { acao: "processar", nfe_id? }                 -> (re)processa uma nota ou todas as pendentes
// POST { acao: "manifestar", chave, tipo, justificativa? }
// POST { acao: "itens", nfe_id }                      -> itens do XML + produto já vinculado
// POST { acao: "lancar_conta", nfe_id, vencimento? }  -> contas a pagar pelas duplicatas do XML
// POST { acao: "xml", chave }                         -> devolve o XML da nota
// POST { acao: "importar_xml", xml }                  -> nota de compra pelo arquivo XML (entra no estoque/contas)
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import {
  baixarXml, carregarItens, lancarContaPagar, manifestar, processarNota, processarPendentes,
  importarXml, sincronizarRecebidas, vincularItens,
} from "../_shared/nfe-recebidas.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";

const TIPOS = ["ciencia", "confirmacao", "desconhecimento", "nao_realizada"];

/** Garante a ciência (necessária para o XML) e devolve itens/duplicatas. */
async function itensDaNota(db: SupabaseClient, nfe: any) {
  if (!nfe.manifestacao) await manifestar(db, nfe.chave, "ciencia");
  const lido = await carregarItens(db, nfe);
  if (!lido) {
    throw new HttpError(422, "XML ainda não disponível na SEFAZ. Após a ciência pode levar alguns minutos — tente novamente.");
  }
  return lido;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    await requireErpUser(req, ["financeiro"]);
    const body = await req.json();
    const db = adminClient();

    const carregarNota = async () => {
      const { data } = await db.from("nfe_recebidas").select("*").eq("id", body.nfe_id).single();
      if (!data) throw new HttpError(404, "nota não encontrada");
      return data;
    };

    switch (body.acao) {
      case "sincronizar": {
        const avisos: string[] = [];
        const processadas = await sincronizarRecebidas(db, avisos);
        const automaticas = await processarPendentes(db);
        return json({ ok: true, processadas, automaticas, avisos });
      }

      case "processar": {
        if (!body.nfe_id) return json({ ok: true, automaticas: await processarPendentes(db) });
        const nfe = await carregarNota();
        const { data: cfg } = await db.from("configuracoes")
          .select("entrada_automatica_estoque, conta_pagar_automatica").eq("id", 1).single();
        await db.from("nfe_recebidas").update({ tentativas: 0 }).eq("id", nfe.id);
        await processarNota(db, { ...nfe, tentativas: 0 }, cfg!);
        const { data } = await db.from("nfe_recebidas").select("processamento, processamento_msg").eq("id", nfe.id).single();
        return json({ ok: true, ...data });
      }

      case "manifestar": {
        if (!TIPOS.includes(body.tipo)) throw new HttpError(400, "tipo de manifestação inválido");
        if (body.tipo === "nao_realizada" && (body.justificativa ?? "").length < 15) {
          throw new HttpError(400, "justificativa com ao menos 15 caracteres é obrigatória");
        }
        const resposta = await manifestar(db, body.chave, body.tipo, body.justificativa);
        if (["desconhecimento", "nao_realizada"].includes(body.tipo)) {
          await db.from("nfe_recebidas").update({ processamento: "ignorada" }).eq("chave", body.chave).eq("estoque_lancado", false);
        }
        return json({ ok: true, resposta });
      }

      case "itens": {
        const nfe = await carregarNota();
        const { itens } = await itensDaNota(db, nfe);
        return json({ ok: true, itens: await vincularItens(db, nfe.fornecedor_id, itens) });
      }

      case "lancar_conta": {
        const nfe = await carregarNota();
        if (nfe.conta_pagar_id) throw new HttpError(400, "esta nota já foi lançada em contas a pagar");
        let duplicatas: { numero: string | null; vencimento: string; valor: number }[] = [];
        try {
          duplicatas = (await itensDaNota(db, nfe)).duplicatas;
        } catch (_) { /* sem XML ainda: parcela única */ }
        const contas = await lancarContaPagar(db, nfe, duplicatas,
          body.vencimento ?? new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10));
        return json({ ok: true, contas });
      }

      case "importar_xml": {
        if (typeof body.xml !== "string" || body.xml.length > 3_000_000) throw new HttpError(400, "envie o conteúdo do XML");
        const r = await importarXml(db, body.xml);
        const { data } = await db.from("nfe_recebidas").select("processamento, processamento_msg").eq("id", r.id).single();
        return json({ ok: true, ...r, ...data });
      }

      case "xml": {
        const { data: salvo } = await db.from("nfe_recebidas").select("xml").eq("chave", body.chave).maybeSingle();
        const xml = salvo?.xml || await baixarXml(db, body.chave);
        if (!xml) throw new HttpError(422, "XML indisponível — faça a ciência da operação e tente novamente");
        return json({ ok: true, xml });
      }

      default:
        throw new HttpError(400, "ação inválida");
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
