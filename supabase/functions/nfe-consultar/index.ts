// Ações sobre NF-e emitidas.
// POST { nota_id, acao?: "consultar" }                         -> atualiza o status
// POST { nota_id, acao: "cancelar", justificativa }            -> cancela (até 24 h, regra da SEFAZ)
// POST { nota_id, acao: "carta_correcao", correcao }           -> carta de correção eletrônica (CC-e)
// POST { nota_id, acao: "reenviar" }                           -> reenvia agora uma nota da fila de contingência
// POST { acao: "inutilizar", unidade_id, serie, numero_inicial, numero_final, justificativa }
// POST { acao: "ambiente" }                                   -> "producao" ou "homologacao" (para avisar na tela)
// POST { acao: "diagnostico" }                                -> confere ambiente, tokens na Focus, cadastro e numeração
// POST { acao: "eventos", nota_id? , chave? }                  -> eventos da nota na SEFAZ (passagem por posto fiscal, MDF-e/CT-e,
//                                                                 ciência/confirmação), pela consulta completa da Focus; guarda em nfe_eventos
// POST { acao: "importar_xml", xmls: string[] }                -> NF-e emitidas em outro sistema (ex.: Tiny) e seus cancelamentos
// POST { nota_id, acao: "reenviar_corrigida", alteracoes }      -> nota rejeitada: corrige natureza, informações, destinatário
//                                                                 e NCM/CFOP/descrição dos itens e manda de novo (valores não mudam)
// POST { nota_id, acao: "xml" }                               -> o XML da nota na Focus (para o Validador; o navegador não baixa direto)
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, onlyDigits, requireErpUser } from "../_shared/supabase.ts";
import { codigoUnidade, focus, focusBaseUrl, focusProducao, focusToken, focusUrl } from "../_shared/focusnfe.ts";
import { aplicarRetornoNfe } from "../_shared/nfe-status.ts";
import { aplicarRetornoDoEnvio, enviarNfe } from "../_shared/nfe-envio.ts";
import { importarXmlEmitida } from "../_shared/nfe-importar.ts";
import { corrigirPayload } from "../_shared/nfe-correcao.ts";
import { diagnosticoNfe } from "../_shared/nfe-diagnostico.ts";
import { eventosNaResposta } from "../_shared/nfe-eventos.ts";

const msgFocus = (b: any, padrao: string) =>
  [b.mensagem_sefaz || b.mensagem, ...(b.erros ?? []).map((e: any) => e.mensagem)].filter(Boolean).join(" | ") || padrao;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const corpo = await req.json();
    const { nota_id, acao = "consultar" } = corpo;
    const db = adminClient();
    const { userId } = await requireErpUser(req, ["inutilizar", "importar_xml", "diagnostico"].includes(acao) ? ["financeiro"]
      : acao === "xml" ? ["vendas", "financeiro", "contador"] : ["vendas", "financeiro"]);

    if (acao === "ambiente") return json({ ok: true, ambiente: focusProducao() ? "producao" : "homologacao" });
    if (acao === "diagnostico") return json({ ok: true, ...(await diagnosticoNfe(db)) });

    if (acao === "xml") {
      const { data: n } = await db.from("notas_fiscais").select("xml_url, unidade_id").eq("id", nota_id).is("excluida_em", null).maybeSingle();
      if (!n) throw new HttpError(404, "nota não encontrada");
      let url: URL | null = null;
      try { url = n.xml_url ? new URL(n.xml_url) : null; } catch { url = null; }
      if (!url || url.protocol !== "https:" || !/^(api|homologacao)\.focusnfe\.com\.br$/.test(url.hostname)) throw new HttpError(404, "esta nota não tem o XML na Focus");
      // o token só vai para a Focus do mesmo ambiente (igual ao pacote do contador)
      const token = focusToken(await codigoUnidade(db, n.unidade_id));
      const headers: Record<string, string> = token && url.href.startsWith(focusBaseUrl()) ? { Authorization: "Basic " + btoa(`${token}:`) } : {};
      let xml: string;
      try {
        const r = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
        if (!r.ok) throw new HttpError(502, `A Focus não entregou o XML desta nota (HTTP ${r.status})`);
        xml = await r.text();
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(504, "A Focus não respondeu a tempo; tente de novo em instantes");
      }
      return json({ ok: true, xml });
    }

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

    if (acao === "eventos") {
      // nota emitida pela MF (pela referência na Focus) ou recebida de fornecedor (pela chave, na lista de recebidas)
      let res: Response;
      let chave: string | null = null;
      if (nota_id) {
        const { data: n } = await db.from("notas_fiscais").select("referencia, unidade_id, chave").eq("id", nota_id).single();
        if (!n?.referencia) throw new HttpError(404, "nota não encontrada");
        chave = n.chave;
        res = await focus(`/v2/nfe/${encodeURIComponent(n.referencia)}?completa=1`, { signal: AbortSignal.timeout(25_000) }, await codigoUnidade(db, n.unidade_id));
      } else {
        chave = onlyDigits(String(corpo.chave ?? ""));
        if (chave.length !== 44) throw new HttpError(400, "informe a nota ou a chave");
        const { data: r } = await db.from("nfe_recebidas").select("unidade_id").eq("chave", chave).maybeSingle();
        res = await focus(`/v2/nfes_recebidas/${chave}.json?completa=1`, { signal: AbortSignal.timeout(25_000) }, await codigoUnidade(db, r?.unidade_id ?? null), { recebidas: true });
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new HttpError(502, msgFocus(body, `Focus NFe HTTP ${res.status}`));
      const eventos = eventosNaResposta(body).filter((e) => !chave || e.chave === chave);
      if (eventos.length) {
        const { error } = await db.from("nfe_eventos").upsert(eventos.map((e) => ({ ...e, origem: "focus" })), { onConflict: "chave,tp_evento,n_seq" });
        if (error) throw new HttpError(500, error.message);
      }
      // campos devolvidos pela Focus: ajudam a ver se ela entrega os eventos do fisco (passagem) para esta nota
      return json({ ok: true, eventos: eventos.length, campos: Object.keys(body ?? {}) });
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
      // a SEFAZ não aceita quebra de linha nem espaço repetido no texto da correção
      const correcao = String(corpo.correcao ?? "").replace(/\s+/g, " ").trim();
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
      // carta que troca a transportadora (tela Carta de correção → Trocar a transportadora): o pedido e a expedição
      // ainda não despachada passam a usar a nova (pelo servidor: quem é só do financeiro não muda o pedido pela tela)
      let trocada = false;
      if (corpo.transportadora_id && nota.pedido_id && /Transportadora: onde se lê/.test(correcao)) {
        const { data: t } = await db.from("transportadoras").select("id").eq("id", corpo.transportadora_id).maybeSingle();
        if (t) {
          const mod = Number(corpo.modalidade_frete);
          const { error: e1 } = await db.from("pedidos").update({ transportadora_id: t.id, ...([0, 1, 2, 3, 4].includes(mod) ? { modalidade_frete: mod } : {}) }).eq("id", nota.pedido_id);
          const { error: e2 } = await db.from("expedicoes").update({ transportadora_id: t.id }).eq("pedido_id", nota.pedido_id)
            .not("status", "in", "(despachado,entregue,cancelada)");
          trocada = !e1 && !e2;
        }
      }
      return json({ ok: true, carta: data, transportadora_trocada: trocada });
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
