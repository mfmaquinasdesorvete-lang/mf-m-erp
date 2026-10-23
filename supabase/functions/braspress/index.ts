// Braspress: cotação e rastreio pela API. O usuário e a senha ficam só nos secrets do Supabase (BRASPRESS_USUARIO e
// BRASPRESS_SENHA; BRASPRESS_HOMOLOGACAO = 1 para testar no ambiente de teste da Braspress).
// POST { acao: "testar" }             -> confere o acesso
// POST { acao: "cotar", envio_id }    -> valor e prazo para os volumes do envio
// POST { acao: "rastrear", envio_id } -> rastreia pela nota do pedido e grava no envio (como o SSW)
// POST { acao: "atualizar" }          -> todos os envios da Braspress na estrada (agendamento, 7h10 e 14h10)
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, onlyDigits, requireErpUser } from "../_shared/supabase.ts";
import { chamadaDoAgendamento } from "../_shared/cron.ts";
import { resumoEvento } from "../_shared/ssw.ts";
import { BASE_BRASPRESS, basicBraspress, corpoCotacaoBp, faltaParaCotarBp, lerCotacaoBp, lerRastreioBp, mensagemBp } from "../_shared/braspress.ts";

type Db = ReturnType<typeof adminClient>;

function acesso() {
  const usuario = Deno.env.get("BRASPRESS_USUARIO"), senha = Deno.env.get("BRASPRESS_SENHA");
  if (!usuario || !senha) throw new HttpError(400, "Faltam os secrets BRASPRESS_USUARIO e BRASPRESS_SENHA no Supabase (Edge Functions → Secrets). O acesso à API é pedido ao comercial da Braspress.");
  return basicBraspress(usuario, senha);
}

async function chamar(caminho: string, init: RequestInit = {}) {
  const base = Deno.env.get("BRASPRESS_HOMOLOGACAO") === "1" ? BASE_BRASPRESS.homologacao : BASE_BRASPRESS.producao;
  const r = await fetch(`${base}${caminho}`, {
    ...init, signal: AbortSignal.timeout(25_000),
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: acesso() },
  });
  const texto = await r.text();
  let corpo: unknown = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = { message: texto.slice(0, 200) }; }
  if (r.status === 401 || r.status === 403) throw new HttpError(401, "A Braspress recusou o usuário e a senha da API. Confira os secrets BRASPRESS_USUARIO e BRASPRESS_SENHA.");
  return { status: r.status, corpo };
}

/** Envio + CNPJ da unidade + documento do cliente + nº da nota autorizada do pedido. */
async function dadosDoEnvio(db: Db, envioId: string) {
  const { data: envio } = await db.from("envios")
    .select("id, pedido_id, cliente_id, unidade_id, cep_origem, cep_destino, valor_mercadoria, peso_total_kg, volumes, modalidade").eq("id", envioId).maybeSingle();
  if (!envio) throw new HttpError(404, "envio não encontrado");
  const [{ data: un }, { data: cli }, { data: nota }] = await Promise.all([
    db.from("unidades").select("cnpj, cep").eq("id", envio.unidade_id).maybeSingle(),
    envio.cliente_id ? db.from("clientes").select("cpf_cnpj").eq("id", envio.cliente_id).maybeSingle() : Promise.resolve({ data: null }),
    envio.pedido_id ? db.from("notas_fiscais").select("numero").eq("pedido_id", envio.pedido_id).eq("status", "autorizada").order("created_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { envio: { ...envio, cep_origem: envio.cep_origem || un?.cep }, cnpj: onlyDigits(un?.cnpj ?? ""), doc: onlyDigits((cli as { cpf_cnpj?: string } | null)?.cpf_cnpj ?? ""), nf: (nota as { numero?: number | string } | null)?.numero ?? null };
}

async function rastrearEnvio(db: Db, envioId: string) {
  const d = await dadosDoEnvio(db, envioId);
  if (!d.nf) return { ok: false as const, erro: "o pedido deste envio não tem nota autorizada" };
  if (d.cnpj.length !== 14) return { ok: false as const, erro: "a unidade do envio está sem CNPJ" };
  const r = await chamar(`/v3/tracking/byNf/${d.cnpj}/${onlyDigits(String(d.nf))}/json`);
  const t = r.status < 300 ? lerRastreioBp(r.corpo) : { ok: false as const, erro: mensagemBp(r.corpo) ?? `HTTP ${r.status}` };
  if (!t.ok) {
    await db.from("envios").update({ rastreio_em: new Date().toISOString() }).eq("id", envioId);
    return t;
  }
  const { error } = await db.from("envios").update({
    rastreio_fonte: "Braspress", rastreio_chave: null, rastreio_em: new Date().toISOString(),
    rastreio_situacao: resumoEvento(t.ultimo), rastreio_eventos: t.eventos,
    rastreio_entregue_em: t.entregue ? (t.entregue_em ?? new Date().toISOString()) : null, rastreio_recebedor: null,
  }).eq("id", envioId);
  if (error) throw new HttpError(500, error.message);
  return t;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    if (!(await chamadaDoAgendamento(req))) await requireErpUser(req, ["vendas", "financeiro", "expedicao"]);
    const db = adminClient();

    if (body.acao === "testar") {
      // rastreio de uma nota que não existe: com o acesso certo a Braspress responde (sem achar), com o errado dá 401
      const { data: un } = await db.from("unidades").select("cnpj").not("cnpj", "is", null).limit(1).maybeSingle();
      const r = await chamar(`/v3/tracking/byNf/${onlyDigits(un?.cnpj ?? "") || "0"}/1/json`);
      if (r.status >= 500) throw new HttpError(502, `A Braspress não respondeu (HTTP ${r.status}).`);
      return json({ ok: true, homologacao: Deno.env.get("BRASPRESS_HOMOLOGACAO") === "1" });
    }

    if (body.acao === "cotar") {
      const d = await dadosDoEnvio(db, body.envio_id);
      const falta = faltaParaCotarBp(d.envio, d.cnpj, d.doc);
      if (falta.length) throw new HttpError(400, `Para cotar na Braspress falta: ${falta.join(", ")}. Complete e salve o envio.`);
      const r = await chamar("/v1/cotacao/calcular/json", { method: "POST", body: JSON.stringify(corpoCotacaoBp(d.envio, d.cnpj, d.doc)) });
      const c = lerCotacaoBp(r.corpo);
      if ("erro" in c) throw new HttpError(400, `Braspress: ${c.erro}`);
      return json({ ok: true, ...c });
    }

    if (body.acao === "rastrear" && body.envio_id) return json(await rastrearEnvio(db, body.envio_id));

    if (body.acao === "atualizar") {
      const { data: marcas } = await db.from("transportadoras").select("id").or("nome.ilike.%braspress%,nome_fantasia.ilike.%braspress%");
      const ids = (marcas ?? []).map((m) => m.id);
      if (!ids.length) return json({ ok: true, envios: 0 });
      const { data: envios } = await db.from("envios").select("id").in("status", ["coleta", "transito"]).in("transportadora_id", ids).not("pedido_id", "is", null).limit(100);
      let achados = 0, entregues = 0;
      for (const e of envios ?? []) {
        try {
          const r = await rastrearEnvio(db, e.id);
          if (r.ok) { achados++; if (r.entregue) entregues++; }
        } catch (err) {
          if ((err as HttpError).status === 401) throw err; // acesso errado: para tudo e avisa
        }
      }
      return json({ ok: true, envios: envios?.length ?? 0, achados, entregues });
    }

    throw new HttpError(400, "ação desconhecida");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
