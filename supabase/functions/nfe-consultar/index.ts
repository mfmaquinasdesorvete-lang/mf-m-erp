// Ações sobre NF-e emitidas.
// POST { nota_id, acao?: "consultar" }                         -> atualiza o status
// POST { nota_id, acao: "cancelar", justificativa }            -> cancela (até 24 h, regra da SEFAZ)
// POST { nota_id, acao: "carta_correcao", correcao }           -> carta de correção eletrônica (CC-e)
// POST { nota_id, acao: "reenviar" }                           -> reenvia agora uma nota da fila de contingência
// POST { acao: "inutilizar", unidade_id, serie, numero_inicial, numero_final, justificativa }
// POST { acao: "ambiente" }                                   -> "producao" ou "homologacao" (para avisar na tela)
// POST { acao: "importar_xml", xmls: string[] }                -> NF-e emitidas em outro sistema (ex.: Tiny) e seus cancelamentos
// POST { nota_id, acao: "reenviar_corrigida", alteracoes }      -> nota rejeitada: corrige natureza, informações, destinatário
//                                                                 e NCM/CFOP/descrição dos itens e manda de novo (valores não mudam)
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, onlyDigits, requireErpUser } from "../_shared/supabase.ts";
import { codigoUnidade, focus, focusProducao, focusUrl } from "../_shared/focusnfe.ts";
import { aplicarRetornoNfe } from "../_shared/nfe-status.ts";
import { aplicarRetornoDoEnvio, enviarNfe } from "../_shared/nfe-envio.ts";
import { importarXmlEmitida } from "../_shared/nfe-importar.ts";
import { corrigirPayload } from "../_shared/nfe-correcao.ts";

const msgFocus = (b: any, padrao: string) =>
  [b.mensagem_sefaz || b.mensagem, ...(b.erros ?? []).map((e: any) => e.mensagem)].filter(Boolean).join(" | ") || padrao;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const corpo = await req.json();
    const { nota_id, acao = "consultar" } = corpo;
    const db = adminClient();
    const { userId } = await requireErpUser(req, ["inutilizar", "importar_xml"].includes(acao) ? ["financeiro"] : ["vendas", "financeiro"]);

    if (acao === "ambiente") return json({ ok: true, ambiente: focusProducao() ? "producao" : "homologacao" });

    if (acao === "importar_xml") {
      const xmls = corpo.xmls;
      if (!Array.isArray(xmls) || !xmls.length || xmls.length > 50 || xmls.some((x) => typeof x !== "string" || x.length > 3_000_000)) {
        throw new HttpError(400, "envie de 1 a 50 XML por vez");
      }
      const resultados = [];
      for (const xml of xmls) resultados.push(await importarXmlEmitida(db, xml));
      return json({ ok: true, resultados });
    }

    if (acao === "inutilizar") {
      const { unidade_id, justificativa } = corpo;
      const serie = Number(corpo.serie), ini = Number(corpo.numero_inicial), fim = Number(corpo.numero_final);
      if (!Number.isInteger(serie) || !Number.isInteger(ini) || !Number.isInteger(fim) || ini < 1 || fim < ini) throw new HttpError(400, "informe série e a faixa de números");
      if (fim - ini > 999) throw new HttpError(400, "inutilize no máximo 1.000 números por vez");
      if (!justificativa || justificativa.trim().length < 15) throw new HttpError(400, "a justificativa deve ter ao menos 15 caracteres");
      const { data: u } = await db.from("unidades").select("*").eq("id", unidade_id).single();
      if (!u || onlyDigits(u.cnpj).length !== 14) throw new HttpError(400, "unidade sem CNPJ");
      // não deixa inutilizar número que já virou nota
      // nota rejeitada não usou o número (é justamente o que se inutiliza)
      const { data: usadas } = await db.from("notas_fiscais").select("numero").eq("unidade_id", unidade_id).eq("serie", String(serie)).not("numero", "is", null)
        .in("status", ["autorizada", "cancelada", "denegada", "processando", "contingencia"]).neq("ambiente", "homologacao");
      const conflito = (usadas ?? []).map((n) => Number(n.numero)).filter((n) => n >= ini && n <= fim);
      if (conflito.length) throw new HttpError(400, `os números ${conflito.join(", ")} já são notas emitidas`);

      const res = await focus("/v2/nfe/inutilizacao", {
        method: "POST",
        body: JSON.stringify({ cnpj: onlyDigits(u.cnpj), serie: String(serie), numero_inicial: String(ini), numero_final: String(fim), justificativa: justificativa.trim() }),
      }, u.codigo);
      const body = await res.json().catch(() => ({}));
      const ok = res.ok && body.status === "autorizado";
      const { data } = await db.from("nfe_inutilizacoes").insert({
        unidade_id, serie, numero_inicial: ini, numero_final: fim, justificativa: justificativa.trim(), created_by: userId,
        status: ok ? "autorizada" : "erro", mensagem: ok ? body.mensagem_sefaz ?? null : msgFocus(body, "inutilização não aceita"),
        xml_url: focusUrl(body.caminho_xml), resposta: body,
      }).select().single();
      if (!ok) throw new HttpError(422, data?.mensagem ?? "inutilização não aceita");
      return json({ ok: true, inutilizacao: data });
    }

    const { data: nota } = await db.from("notas_fiscais").select("*").eq("id", nota_id).single();
    if (!nota) throw new HttpError(404, "nota não encontrada");
    const ref = encodeURIComponent(nota.referencia);
    const codigo = await codigoUnidade(db, nota.unidade_id);

    if (acao === "cancelar") {
      const { justificativa } = corpo;
      if (nota.status !== "autorizada") throw new HttpError(400, "só notas autorizadas podem ser canceladas");
      if (!justificativa || justificativa.length < 15) throw new HttpError(400, "a justificativa deve ter ao menos 15 caracteres");
      const res = await focus(`/v2/nfe/${ref}`, { method: "DELETE", body: JSON.stringify({ justificativa }) }, codigo);
      const body = await res.json().catch(() => ({}));
      if (body.status !== "cancelado") throw new HttpError(422, msgFocus(body, "cancelamento não aceito"));
      return json({ ok: true, nota: await aplicarRetornoNfe(db, nota, body) });
    }

    if (acao === "carta_correcao") {
      const correcao = String(corpo.correcao ?? "").trim();
      if (nota.status !== "autorizada") throw new HttpError(400, "só notas autorizadas recebem carta de correção");
      if (correcao.length < 15 || correcao.length > 1000) throw new HttpError(400, "a correção deve ter entre 15 e 1.000 caracteres");
      const res = await focus(`/v2/nfe/${ref}/carta_correcao`, { method: "POST", body: JSON.stringify({ correcao }) }, codigo);
      const body = await res.json().catch(() => ({}));
      const ok = res.ok && body.status === "autorizado";
      const { data } = await db.from("nfe_cartas_correcao").insert({
        nota_id, correcao, created_by: userId, status: ok ? "autorizada" : "erro",
        sequencia: body.numero_carta_correcao ?? null, mensagem: ok ? body.mensagem_sefaz ?? null : msgFocus(body, "carta de correção não aceita"),
        pdf_url: focusUrl(body.caminho_pdf_carta_correcao), xml_url: focusUrl(body.caminho_xml_carta_correcao), resposta: body,
      }).select().single();
      if (!ok) throw new HttpError(422, data?.mensagem ?? "carta de correção não aceita");
      return json({ ok: true, carta: data });
    }

    if (acao === "reenviar_corrigida") {
      if (nota.excluida_em) throw new HttpError(404, "nota excluída");
      if (nota.status !== "erro") throw new HttpError(400, "só nota rejeitada pode ser corrigida e reenviada");
      if (nota.origem === "importada" || !nota.payload?.items?.length) {
        throw new HttpError(400, "esta tentativa não chegou a ser montada (faltava cadastro): corrija o cadastro e emita de novo pelo pedido");
      }
      const payload = corrigirPayload(nota.payload, corpo.alteracoes ?? {});
      const base = nota.referencia.replace(/-c\d+$/, "");
      let k = Number(nota.tentativas ?? 1) + 1;
      let referencia = `${base}-c${k}`;
      while ((await db.from("notas_fiscais").select("id").eq("referencia", referencia).maybeSingle()).data) referencia = `${base}-c${++k}`;
      const r = await enviarNfe(referencia, payload, codigo);
      const historico = [...(nota.historico_envios ?? []), { referencia: nota.referencia, mensagem: nota.mensagem, em: nota.updated_at ?? nota.created_at, por: userId }];
      const { data: gravada } = await db.from("notas_fiscais").update({
        referencia, payload, status: r.status, mensagem: r.mensagem, resposta: r.resposta, tentativas: k, historico_envios: historico,
        ambiente: focusProducao() ? "producao" : "homologacao", updated_at: new Date().toISOString(),
      }).eq("id", nota.id).select().single();
      const data = await aplicarRetornoDoEnvio(db, gravada, r);
      return json({ ok: r.status !== "erro" && data?.status !== "erro", nota: data });
    }

    if (acao === "reenviar") {
      if (nota.status !== "contingencia") throw new HttpError(400, "esta nota não está na fila de contingência");
      const c = await focus(`/v2/nfe/${ref}?completa=0`, {}, codigo).catch(() => null);
      if (c?.ok) return json({ ok: true, nota: await aplicarRetornoNfe(db, nota, await c.json()) });
      const r = await enviarNfe(nota.referencia, nota.payload, codigo);
      const { data: gravada } = await db.from("notas_fiscais").update({ status: r.status, mensagem: r.mensagem, resposta: r.resposta, tentativas: nota.tentativas + 1, updated_at: new Date().toISOString() })
        .eq("id", nota.id).select().single();
      const data = await aplicarRetornoDoEnvio(db, gravada, r);
      return json({ ok: r.status !== "erro" && data?.status !== "erro", nota: data });
    }

    const res = await focus(`/v2/nfe/${ref}?completa=0`, {}, codigo);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpError(502, body.mensagem || `Focus NFe HTTP ${res.status}`);
    return json({ ok: true, nota: await aplicarRetornoNfe(db, nota, body) });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
