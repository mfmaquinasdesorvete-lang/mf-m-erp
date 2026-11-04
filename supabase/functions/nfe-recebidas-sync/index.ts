// NF-e recebidas de fornecedores (Manifestação do Destinatário via Focus NFe).
// POST { acao: "sincronizar" }                        -> busca notas novas e processa as pendentes
// POST { acao: "processar", nfe_id? }                 -> (re)processa uma nota ou todas as pendentes
// POST { acao: "manifestar", chave, tipo, justificativa? }
// POST { acao: "itens", nfe_id }                      -> itens do XML + produto já vinculado
// POST { acao: "lancar_conta", nfe_id, vencimento? }  -> contas a pagar pelas duplicatas do XML
// POST { acao: "xml", chave }                         -> devolve o XML da nota
// POST { acao: "importar_xml", xml }                  -> nota de compra pelo arquivo XML (entra no estoque/contas)
// POST { acao: "importar_xmls", xmls: string[] }       -> várias de uma vez (ex.: .zip do sistema anterior), resultado por arquivo
// POST { acao: "sincronizar_ctes" }                   -> busca agora os CT-e (fretes) de SC e SP e completa os XML
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import {
  baixarXml, CONFIG_RECEBIDAS, carregarItens, lancarContaPagar, manifestar, processarNota, processarPendentes,
  importarXml, sincronizarRecebidas, vincularItens,
} from "../_shared/nfe-recebidas.ts";
import { sincronizarCtes } from "../_shared/cte-recebidas.ts";
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
    // notas de fornecedor: financeiro e compras; contas a pagar só o financeiro (abaixo)
    const body = await req.json();
    // baixar o XML também é do contador (ele pede os arquivos); o resto é de financeiro e compras
    const papeisXml = ["financeiro", "compras", "contador"];
    await requireErpUser(req, body?.acao === "xml" ? papeisXml : ["financeiro", "compras"]);
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

      case "sincronizar_ctes":
        return json({ ok: true, ...(await sincronizarCtes(db, 40)) });

      case "processar": {
        if (!body.nfe_id) return json({ ok: true, automaticas: await processarPendentes(db) });
        const nfe = await carregarNota();
        const { data: cfg } = await db.from("configuracoes").select(CONFIG_RECEBIDAS).eq("id", 1).single();
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
        // nota lançada à mão (pelo DANFE, sem XML): os itens já estão nela e não há o que buscar na SEFAZ
        // (a Focus responde "documento fiscal não encontrado" para nota que não veio pela distribuição)
        if (!nfe.xml && Array.isArray(nfe.itens) && nfe.itens.length) {
          return json({ ok: true, itens: await vincularItens(db, nfe.fornecedor_id, nfe.itens, nfe.id) });
        }
        const { itens } = await itensDaNota(db, nfe);
        return json({ ok: true, itens: await vincularItens(db, nfe.fornecedor_id, itens, nfe.id) });
      }

      case "lancar_conta": {
        await requireErpUser(req, ["financeiro"]);
        const nfe = await carregarNota();
        if (nfe.conta_pagar_id) throw new HttpError(400, "esta nota já foi lançada em contas a pagar");
        let duplicatas: { numero: string | null; vencimento: string; valor: number }[] = [];
        try {
          duplicatas = (await itensDaNota(db, nfe)).duplicatas;
        } catch (_) { /* sem XML ainda: parcela única */ }
        const contas = await lancarContaPagar(db, nfe, duplicatas,
          body.vencimento ?? new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), true);
        return json({ ok: true, contas });
      }

      case "importar_xml": {
        if (typeof body.xml !== "string" || body.xml.length > 3_000_000) throw new HttpError(400, "envie o conteúdo do XML");
        const r = await importarXml(db, body.xml);
        const { data } = await db.from("nfe_recebidas").select("processamento, processamento_msg").eq("id", r.id).single();
        return json({ ok: true, ...r, ...data });
      }

      case "importar_xmls": {
        const xmls = body.xmls;
        if (!Array.isArray(xmls) || !xmls.length || xmls.length > 50 || xmls.some((x: unknown) => typeof x !== "string" || x.length > 3_000_000)) {
          throw new HttpError(400, "envie de 1 a 50 XML por vez");
        }
        const resultados = [];
        for (const xml of xmls as string[]) {
          try {
            const r = await importarXml(db, xml);
            const { data } = await db.from("nfe_recebidas").select("processamento, processamento_msg, situacao").eq("id", r.id).single();
            resultados.push({
              situacao: r.ja_existia ? "atualizada" : "importada", numero: r.numero, emitente: r.emitente,
              processamento: data?.processamento, mensagem: data?.processamento_msg, cancelada: data?.situacao === "cancelada",
            });
          } catch (e) {
            resultados.push({ situacao: e instanceof HttpError && e.status < 500 ? "ignorada" : "erro", mensagem: (e as Error).message });
          }
        }
        return json({ ok: true, resultados });
      }

      case "xml": {
        const chave = String(body.chave ?? "").replace(/\D/g, "");
        if (chave.length !== 44) throw new HttpError(400, "chave de acesso inválida");
        const { data: salvo } = await db.from("nfe_recebidas").select("id, xml, manifestacao").eq("chave", chave).is("excluida_em", null).maybeSingle();
        if (!salvo) throw new HttpError(404, "nota não encontrada");
        if (salvo.xml) return json({ ok: true, xml: salvo.xml });
        // a SEFAZ só entrega o XML completo depois da ciência da operação
        // (o contador só lê: para ele não se manifesta nada; a ciência fica com compras e financeiro)
        if (!salvo.manifestacao) {
          const podeManifestar = await requireErpUser(req, ["financeiro", "compras"]).then(() => true, () => false);
          if (podeManifestar) await manifestar(db, chave, "ciencia").catch(() => null);
        }
        const xml = await baixarXml(db, chave);
        if (!xml) throw new HttpError(422, "O XML desta nota ainda não chegou da SEFAZ (depois da ciência pode levar alguns minutos). Tente de novo mais tarde.");
        // guarda na nota: da próxima vez sai na hora e não depende da Focus
        await db.from("nfe_recebidas").update({ xml }).eq("id", salvo.id).is("xml", null);
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
