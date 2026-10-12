// Extrato automático pelo Open Finance (Pluggy).
//  POST { acao: "status" }                                       (financeiro) → { configurado, origem }
//  POST { acao: "configurar", client_id, client_secret }         (admin) → confere na Pluggy e guarda no cofre
//  POST { acao: "token", item_id? }                              (financeiro) → { token } para a janela da Pluggy
//                                                                 (com item_id: renovar o consentimento daquela conexão)
//  POST { acao: "contas", item_id }                              (financeiro) → { instituicao, contas } da conexão recém-feita
//  POST { acao: "ligar", item_id, conta_externa_id, conta_bancaria_id, desde }  (financeiro) → liga e já busca o extrato
//  POST { acao: "sincronizar", conexao_id?, atualizar? }         (financeiro ou agendamento) → busca os lançamentos novos
//  POST { acao: "desligar", conexao_id }                         (financeiro) → para de buscar e apaga a conexão na Pluggy
//  POST { event, itemId }                                        (aviso da Pluggy, sem login) → busca os lançamentos da conexão
// Deploy com --no-verify-jwt: o aviso da Pluggy e o agendamento não mandam login de usuário; o resto confere aqui dentro.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { chamadaDoAgendamento } from "../_shared/cron.ts";
import {
  avisoDoItem, type Chaves, chavesPluggy, type ContaPluggy, entrarPluggy, type ItemPluggy, linhaDoExtrato, nomeConta, pluggy,
  type TransacaoPluggy,
} from "../_shared/pluggy.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM = /^[0-9a-f-]{36}$/i;
const hojeSP = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const somarDias = (data: string, n: number) => new Date(new Date(`${data}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);

type Conexao = {
  id: string; item_id: string; conta_externa_id: string; conta_bancaria_id: string; status: string; desde: string; sincronizado_em: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "use POST" }, 405);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "corpo inválido" }, 400);
  const db = adminClient();
  try {
    // aviso da Pluggy: só serve de gatilho; os dados vêm da própria API da Pluggy
    if (typeof body.event === "string" && !body.acao) return json(await aviso(db, body));

    const agendamento = body.acao === "sincronizar" && await chamadaDoAgendamento(req);
    if (body.acao === "configurar") {
      await requireErpUser(req, []);
      return json(await configurar(db, String(body.client_id ?? ""), String(body.client_secret ?? "")));
    }
    if (!agendamento) await requireErpUser(req, ["financeiro"]);

    if (body.acao === "status") {
      const ch = await chavesPluggy(db);
      return json({ configurado: !!ch, origem: ch?.origem ?? null });
    }
    const ch = await chavesPluggy(db);
    if (!ch) throw new HttpError(400, "Ligue o Open Finance primeiro: informe as chaves da Pluggy em Bancos e conciliação.");

    if (body.acao === "token") return json(await tokenJanela(ch, body.item_id ? String(body.item_id) : null));
    if (body.acao === "contas") return json(await contasDoItem(ch, String(body.item_id ?? "")));
    if (body.acao === "ligar") return json(await ligar(db, ch, body));
    if (body.acao === "sincronizar") {
      let q = db.from("openfinance_conexoes").select("*").neq("status", "desligada");
      if (body.conexao_id) q = q.eq("id", String(body.conexao_id));
      const { data: lista } = await q;
      const resultado: Record<string, unknown> = {};
      for (const c of (lista ?? []) as Conexao[]) resultado[c.id] = await sincronizar(db, ch, c, body.atualizar === true);
      return json({ ok: true, resultado });
    }
    if (body.acao === "desligar") return json(await desligar(db, ch, String(body.conexao_id ?? "")));
    return json({ error: "ação inválida" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, e instanceof HttpError ? e.status : 500);
  }
});

async function configurar(db: SupabaseClient, clientId: string, clientSecret: string) {
  clientId = clientId.trim(); clientSecret = clientSecret.trim();
  if (!clientId || !clientSecret) throw new HttpError(400, "Informe o Client ID e o Client Secret da Pluggy.");
  await entrarPluggy({ clientId, clientSecret }, true); // confere antes de guardar
  const { error } = await db.rpc("openfinance_guardar_chaves", { p_client_id: clientId, p_client_secret: clientSecret });
  if (error) throw new Error(error.message);
  const ch = await chavesPluggy(db);
  return { ok: true, origem: ch?.origem ?? "cofre" };
}

async function tokenJanela(ch: Chaves, itemId: string | null) {
  if (itemId && !ITEM.test(itemId)) throw new HttpError(400, "conexão inválida");
  const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/openfinance`;
  const base = itemId ? { itemId } : {};
  let r: { accessToken: string };
  try {
    r = await pluggy(ch, "POST", "/connect_token", { ...base, options: { webhookUrl, avoidDuplicates: true } });
  } catch {
    r = await pluggy(ch, "POST", "/connect_token", base); // sem as opções (aviso automático fica de fora; o agendamento cobre)
  }
  return { token: r.accessToken };
}

async function contasDoItem(ch: Chaves, itemId: string) {
  if (!ITEM.test(itemId)) throw new HttpError(400, "conexão inválida");
  const item = await pluggy<ItemPluggy>(ch, "GET", `/items/${itemId}`);
  const { results } = await pluggy<{ results: ContaPluggy[] }>(ch, "GET", `/accounts?itemId=${itemId}`);
  return {
    instituicao: item.connector?.name ?? null,
    contas: (results ?? []).map((a) => ({ id: a.id, nome: nomeConta(a), tipo: a.type, saldo: a.balance ?? null })),
  };
}

async function ligar(db: SupabaseClient, ch: Chaves, b: Record<string, unknown>) {
  const itemId = String(b.item_id ?? ""), contaExt = String(b.conta_externa_id ?? ""), contaErp = String(b.conta_bancaria_id ?? "");
  if (!ITEM.test(itemId) || !contaExt || !UUID.test(contaErp)) throw new HttpError(400, "dados incompletos");
  const { data: cb } = await db.from("contas_bancarias").select("id, ativo").eq("id", contaErp).maybeSingle();
  if (!cb?.ativo) throw new HttpError(400, "conta bancária do ERP não encontrada");
  const { instituicao, contas } = await contasDoItem(ch, itemId);
  const conta = contas.find((a) => a.id === contaExt);
  if (!conta) throw new HttpError(400, "essa conta não está nesta conexão do banco");
  const hoje = hojeSP();
  let desde = /^\d{4}-\d{2}-\d{2}$/.test(String(b.desde ?? "")) ? String(b.desde) : somarDias(hoje, -30);
  if (desde > hoje) desde = hoje;
  if (desde < somarDias(hoje, -365)) desde = somarDias(hoje, -365);

  // a conta do ERP passa a usar esta conexão (a anterior, se houver, é desligada)
  await db.from("openfinance_conexoes").update({ status: "desligada" }).eq("conta_bancaria_id", contaErp).neq("status", "desligada");
  const { data: nova, error } = await db.from("openfinance_conexoes").insert({
    item_id: itemId, conta_externa_id: contaExt, conta_bancaria_id: contaErp, instituicao, conta_externa_nome: conta.nome, desde,
    saldo: conta.saldo, saldo_em: conta.saldo == null ? null : new Date().toISOString(),
  }).select("*").single();
  if (error || !nova) throw new Error(error?.message ?? "não foi possível ligar a conta");
  const r = await sincronizar(db, ch, nova as Conexao, false);
  return { ok: true, conexao_id: nova.id, ...r };
}

async function sincronizar(db: SupabaseClient, ch: Chaves, c: Conexao, atualizar: boolean) {
  try {
    // pede ao banco os dados mais novos (no Open Finance a Pluggy também atualiza sozinha)
    if (atualizar) await pluggy(ch, "PATCH", `/items/${c.item_id}`, {}).catch(() => null);
    const item = await pluggy<ItemPluggy>(ch, "GET", `/items/${c.item_id}`);
    const conta = await pluggy<ContaPluggy>(ch, "GET", `/accounts/${c.conta_externa_id}`);
    // revisa a última semana (lançamento que entra com atraso) a partir do que já foi buscado
    const ultimo = c.sincronizado_em ? somarDias(c.sincronizado_em.slice(0, 10), -7) : c.desde;
    const de = ultimo > c.desde ? ultimo : c.desde;
    const linhas: ReturnType<typeof linhaDoExtrato>[] = [];
    for (let pagina = 1; pagina <= 20; pagina++) {
      const r = await pluggy<{ results: TransacaoPluggy[]; totalPages?: number }>(ch, "GET",
        `/transactions?accountId=${encodeURIComponent(c.conta_externa_id)}&from=${de}&pageSize=500&page=${pagina}`);
      for (const t of r.results ?? []) if (t.status !== "PENDING") linhas.push(linhaDoExtrato(t));
      if (!r.totalPages || pagina >= r.totalPages) break;
    }
    const { data, error } = await db.rpc("importar_extrato_openfinance", {
      p_conexao: c.id, p_linhas: linhas, p_saldo: conta.balance ?? null, p_saldo_em: item.lastUpdatedAt ?? null,
      p_status_provedor: item.status, p_consentimento: item.consentExpiresAt ?? null,
    });
    if (error) throw new Error(error.message);
    const aviso = avisoDoItem(item);
    if (aviso) await db.from("openfinance_conexoes").update({ status: aviso.erro ? "erro" : "ativa", erro: aviso.texto }).eq("id", c.id);
    return { ...(data as Record<string, unknown>), aviso: aviso?.texto ?? null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("openfinance_conexoes").update({ status: "erro", erro: msg }).eq("id", c.id);
    return { erro: msg };
  }
}

async function desligar(db: SupabaseClient, ch: Chaves, id: string) {
  if (!UUID.test(id)) throw new HttpError(400, "conexão inválida");
  const { data: c } = await db.from("openfinance_conexoes").select("id, item_id").eq("id", id).maybeSingle();
  if (!c) throw new HttpError(404, "conexão não encontrada");
  await db.from("openfinance_conexoes").update({ status: "desligada" }).eq("id", id);
  // ninguém mais usa a conexão: apaga na Pluggy (encerra o consentimento). Os lançamentos já buscados ficam no ERP.
  const { count } = await db.from("openfinance_conexoes").select("id", { count: "exact", head: true }).eq("item_id", c.item_id).neq("status", "desligada");
  if (!count) await pluggy(ch, "DELETE", `/items/${c.item_id}`).catch(() => null);
  return { ok: true };
}

async function aviso(db: SupabaseClient, body: Record<string, unknown>) {
  const itemId = String(body.itemId ?? body.item_id ?? "");
  if (!ITEM.test(itemId)) return { ok: true, ignorado: "sem conexão" };
  const { data: lista } = await db.from("openfinance_conexoes").select("*").eq("item_id", itemId).neq("status", "desligada");
  if (!lista?.length) return { ok: true, ignorado: "conexão não é do ERP" };
  const ch = await chavesPluggy(db);
  if (!ch) return { ok: true, ignorado: "sem chaves" };
  const resultado: Record<string, unknown> = {};
  for (const c of lista as Conexao[]) {
    // avisos em sequência: uma busca por minuto basta
    if (c.sincronizado_em && Date.now() - new Date(c.sincronizado_em).getTime() < 60_000) continue;
    resultado[c.id] = await sincronizar(db, ch, c, false);
  }
  return { ok: true, resultado };
}
