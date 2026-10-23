// SSW (ssw.inf.br): rastreio das entregas pela chave da NF-e, sem senha, para as transportadoras que usam o SSW.
// POST { acao: "rastrear", chave }     -> eventos da nota (para conferir qualquer chave)
// POST { acao: "rastrear", envio_id }  -> rastreia o envio pelas notas do pedido e grava no envio
// POST { acao: "atualizar" }           -> todos os envios na estrada e os CT-e recentes (agendamento, 7h05 e 14h05)
// Quando o SSW diz que entregou, o envio fica com rastreio_entregue_em (a equipe confirma a entrega na tela) e
// sai dos avisos de atraso ao cliente.
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, onlyDigits, requireErpUser } from "../_shared/supabase.ts";
import { chamadaDoAgendamento } from "../_shared/cron.ts";
import { chaveValida, comFuso, lerTrackingSsw, resumoEvento, URL_TRACKING_DANFE, type RastreioSsw } from "../_shared/ssw.ts";

type Db = ReturnType<typeof adminClient>;

async function rastrear(chave: string): Promise<RastreioSsw> {
  try {
    const r = await fetch(URL_TRACKING_DANFE, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ chave_nfe: chave }), signal: AbortSignal.timeout(20_000),
    });
    const texto = await r.text();
    let corpo: unknown = null;
    try { corpo = texto ? JSON.parse(texto) : null; } catch { return { ok: false, erro: `o SSW respondeu fora do padrão (HTTP ${r.status})` }; }
    return lerTrackingSsw(corpo);
  } catch (e) {
    return { ok: false, erro: `o SSW não respondeu (${(e as Error).message})` };
  }
}

/** Chaves das notas autorizadas do pedido do envio (a mais nova primeiro). */
async function chavesDoEnvio(db: Db, pedidoId: string | null) {
  if (!pedidoId) return [];
  const { data } = await db.from("notas_fiscais").select("chave").eq("pedido_id", pedidoId).eq("status", "autorizada")
    .not("chave", "is", null).order("created_at", { ascending: false }).limit(3);
  return (data ?? []).map((n) => onlyDigits(n.chave)).filter(chaveValida);
}

async function rastrearEnvio(db: Db, envio: { id: string; pedido_id: string | null; rastreio_entregue_em?: string | null }) {
  const chaves = await chavesDoEnvio(db, envio.pedido_id);
  if (!chaves.length) return { ok: false as const, erro: "o pedido deste envio não tem nota autorizada com chave" };
  let ultimo: RastreioSsw = { ok: false, erro: "" };
  for (const chave of chaves) {
    ultimo = await rastrear(chave);
    if (!ultimo.ok) continue;
    const { error } = await db.from("envios").update({
      rastreio_fonte: "SSW", rastreio_chave: chave, rastreio_em: new Date().toISOString(),
      rastreio_situacao: resumoEvento(ultimo.ultimo), rastreio_eventos: ultimo.eventos,
      rastreio_entregue_em: ultimo.entregue ? (comFuso(ultimo.entregue_em) ?? new Date().toISOString()) : null,
      rastreio_recebedor: ultimo.entregue ? (ultimo.eventos.findLast((e) => e.recebedor)?.recebedor ?? null) : null,
    }).eq("id", envio.id);
    if (error) throw new HttpError(500, error.message);
    return { ...ultimo, chave };
  }
  // não achou no SSW: só anota quando conferiu (a transportadora pode não usar o SSW)
  await db.from("envios").update({ rastreio_em: new Date().toISOString() }).eq("id", envio.id);
  return ultimo;
}

/** CT-e dos últimos 30 dias ainda sem entrega: ocorrência e data pela primeira nota do CT-e. */
async function atualizarCtes(db: Db) {
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await db.from("ctes").select("id, nfe_chaves, ocorrencia").gte("emissao", desde).limit(200);
  let n = 0;
  for (const c of data ?? []) {
    if (/ENTREGUE \(0?1\)/i.test(c.ocorrencia ?? "")) continue;
    const chave = ((c.nfe_chaves ?? []) as string[]).map(onlyDigits).find(chaveValida);
    if (!chave) continue;
    const r = await rastrear(chave);
    if (!r.ok || !r.ultimo) continue;
    await db.from("ctes").update({ ocorrencia: resumoEvento(r.ultimo), ocorrencia_em: comFuso(r.ultimo.em) }).eq("id", c.id);
    n++;
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const agendamento = await chamadaDoAgendamento(req);
    if (!agendamento) await requireErpUser(req, ["vendas", "financeiro", "expedicao"]);
    const db = adminClient();

    if (body.acao === "rastrear" && body.chave) {
      const chave = onlyDigits(String(body.chave));
      if (!chaveValida(chave)) throw new HttpError(400, "chave da nota inválida (são 44 números)");
      return json({ ...(await rastrear(chave)), chave });
    }

    if (body.acao === "rastrear" && body.envio_id) {
      const { data: envio } = await db.from("envios").select("id, pedido_id").eq("id", body.envio_id).maybeSingle();
      if (!envio) throw new HttpError(404, "envio não encontrado");
      return json(await rastrearEnvio(db, envio));
    }

    if (body.acao === "atualizar") {
      const { data: envios } = await db.from("envios").select("id, pedido_id").in("status", ["coleta", "transito"]).not("pedido_id", "is", null).limit(100);
      let achados = 0, entregues = 0;
      for (const e of envios ?? []) {
        const r = await rastrearEnvio(db, e);
        if (r.ok) { achados++; if (r.entregue) entregues++; }
      }
      const ctes = await atualizarCtes(db);
      return json({ ok: true, envios: envios?.length ?? 0, achados, entregues, ctes });
    }

    throw new HttpError(400, "ação desconhecida");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
