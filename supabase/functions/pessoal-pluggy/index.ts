// Meu Pluggy no painel pessoal: o extrato das contas pessoais do dono entra sozinho, uma vez por dia.
// O Meu Pluggy (meu.pluggy.ai) é o Open Finance gratuito para uso pessoal: a pessoa conecta os bancos lá e, no Dashboard
// da Pluggy (mesma conta), cria uma aplicação e conecta o conector "MeuPluggy"; cada banco vira um item.
// Chaves só nos secrets PLUGGY_PESSOAL_CLIENT_ID e PLUGGY_PESSOAL_CLIENT_SECRET (da aplicação pessoal, nunca no ERP).
//  POST { acao: "status" }                                         → { configurado }
//  POST { acao: "contas", item_id }                                → { instituicao, contas } do banco ligado no Meu Pluggy
//  POST { acao: "ligar", item_id, conta_externa_id, conta_id | nova: { nome, tipo }, desde }  → liga e já busca
//  POST { acao: "sincronizar", conexao_id? }                       → busca os lançamentos novos (as conexões de quem chama;
//                                                                     no agendamento, as de todos)
// Tudo fica só do dono (pessoal_conexoes e pessoal_lancamentos com dono = quem ligou). O que já entrou pelo OFX ou
// pelo PDF não entra de novo (mesmo dia, valor e texto na mesma conta).
// Deploy com --no-verify-jwt: o agendamento não manda login de usuário; o resto confere aqui dentro.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { chamadaDoAgendamento } from "../_shared/cron.ts";
import { type Chaves, type ContaPluggy, type ItemPluggy, linhaDoExtrato, nomeConta, pluggy, type TransacaoPluggy } from "../_shared/pluggy.ts";
import { semRepetidos } from "../_shared/repetidos.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hojeSP = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const somarDias = (data: string, n: number) => new Date(new Date(`${data}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
const CORES = ["sky", "violet", "emerald", "orange", "pink", "slate", "amber", "teal"];

type Conexao = { id: string; dono: string; item_id: string; conta_externa_id: string; conta_id: string; desde: string; sincronizado_em: string | null; ativa: boolean };

function chaves(): Chaves | null {
  const id = Deno.env.get("PLUGGY_PESSOAL_CLIENT_ID")?.trim(), sec = Deno.env.get("PLUGGY_PESSOAL_CLIENT_SECRET")?.trim();
  return id && sec ? { clientId: id, clientSecret: sec, origem: "secret" } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "use POST" }, 405);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "corpo inválido" }, 400);
  const db = adminClient();
  try {
    const agendamento = body.acao === "sincronizar" && await chamadaDoAgendamento(req);
    // o painel pessoal é do administrador; cada um só mexe nas próprias conexões
    const userId = agendamento ? null : (await requireErpUser(req, [])).userId;
    if (body.acao === "status") return json({ configurado: !!chaves() });
    const ch = chaves();
    if (!ch) throw new HttpError(400, "Falta a chave do Meu Pluggy: cadastre os secrets PLUGGY_PESSOAL_CLIENT_ID e PLUGGY_PESSOAL_CLIENT_SECRET no Supabase (Edge Functions → Secrets).");

    if (body.acao === "contas") return json(await contasDoItem(ch, String(body.item_id ?? "")));
    if (body.acao === "ligar") return json(await ligar(db, ch, userId!, body));
    if (body.acao === "sincronizar") {
      let q = db.from("pessoal_conexoes").select("*").eq("ativa", true);
      if (userId) q = q.eq("dono", userId);
      if (body.conexao_id) q = q.eq("id", String(body.conexao_id));
      const { data: lista } = await q;
      const resultado: Record<string, unknown> = {};
      for (const c of (lista ?? []) as Conexao[]) resultado[c.id] = await sincronizar(db, ch, c);
      return json({ ok: true, resultado });
    }
    return json({ error: "ação inválida" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, e instanceof HttpError ? e.status : 500);
  }
});

async function contasDoItem(ch: Chaves, itemId: string) {
  itemId = itemId.trim().toLowerCase();
  if (!UUID.test(itemId)) throw new HttpError(400, "O Item ID tem este formato: 8-4-4-4-12 letras e números (copie do Dashboard da Pluggy → Demo → Itens conectados).");
  const item = await pluggy<ItemPluggy>(ch, "GET", `/items/${itemId}`).catch(() => null);
  const { results } = await pluggy<{ results: ContaPluggy[] }>(ch, "GET", `/accounts?itemId=${itemId}`).catch((e) => {
    throw new HttpError(400, `A Pluggy não achou as contas deste item (${e instanceof Error ? e.message : e}). Confira se a aplicação é a mesma onde o MeuPluggy foi conectado.`);
  });
  return {
    instituicao: item?.connector?.name ?? null,
    contas: (results ?? []).map((a) => ({ id: a.id, nome: nomeConta(a), tipo: a.type, saldo: a.balance ?? null })),
  };
}

async function ligar(db: SupabaseClient, ch: Chaves, dono: string, b: Record<string, unknown>) {
  const itemId = String(b.item_id ?? "").trim().toLowerCase(), contaExt = String(b.conta_externa_id ?? "");
  if (!UUID.test(itemId) || !UUID.test(contaExt)) throw new HttpError(400, "dados incompletos");
  const { instituicao, contas } = await contasDoItem(ch, itemId);
  const ext = contas.find((a) => a.id === contaExt);
  if (!ext) throw new HttpError(400, "essa conta não está neste banco do Meu Pluggy");
  const hoje = hojeSP();
  let desde = /^\d{4}-\d{2}-\d{2}$/.test(String(b.desde ?? "")) ? String(b.desde) : somarDias(hoje, -90);
  if (desde > hoje) desde = hoje;
  if (desde < somarDias(hoje, -730)) desde = somarDias(hoje, -730);

  let contaId = String(b.conta_id ?? "");
  if (contaId) {
    const { data: c } = await db.from("pessoal_contas").select("id, dono").eq("id", contaId).maybeSingle();
    if (!c || c.dono !== dono) throw new HttpError(404, "conta do painel não encontrada");
  } else {
    // conta nova no painel com o saldo de hoje do banco (o que veio antes não muda o saldo; só os gráficos e os cards)
    const nova = (b.nova ?? {}) as { nome?: string; tipo?: string };
    const cartao = ext.tipo === "CREDIT";
    const { count } = await db.from("pessoal_contas").select("id", { count: "exact", head: true }).eq("dono", dono);
    const saldo = Number(ext.saldo ?? 0);
    const { data: c, error } = await db.from("pessoal_contas").insert({
      dono, nome: String(nova.nome ?? ext.nome ?? "Conta").trim().slice(0, 60) || "Conta", tipo: cartao ? "cartao" : (nova.tipo === "poupanca" || nova.tipo === "investimento" ? nova.tipo : "corrente"),
      banco: instituicao?.slice(0, 60) ?? null, cor: CORES[(count ?? 0) % CORES.length],
      saldo_inicial: cartao ? -Math.abs(saldo) : saldo, saldo_inicial_em: somarDias(hoje, 1), ordem: count ?? 0,
    }).select("id").single();
    if (error || !c) throw new Error(error?.message ?? "não foi possível criar a conta");
    contaId = c.id;
  }
  const { data: cx, error } = await db.from("pessoal_conexoes").upsert({
    dono, item_id: itemId, conta_externa_id: contaExt, conta_id: contaId, instituicao: instituicao?.slice(0, 80) ?? null,
    nome_externo: ext.nome.slice(0, 120), desde, ativa: true, saldo_banco: ext.saldo, erro: null, sincronizado_em: null,
  }, { onConflict: "dono,conta_externa_id" }).select("*").single();
  if (error || !cx) throw new Error(error?.message ?? "não foi possível ligar a conta");
  return { ok: true, conexao_id: cx.id, conta_id: contaId, ...(await sincronizar(db, ch, cx as Conexao)) };
}

async function sincronizar(db: SupabaseClient, ch: Chaves, c: Conexao) {
  try {
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
    const novas = linhas.filter((l) => l.valor !== 0).map((l) => ({
      dono: c.dono, conta_id: c.conta_id, data: l.data, valor: l.valor, descricao: (l.descricao || "Lançamento do banco").slice(0, 200),
      situacao: "realizado", identificador: l.identificador.slice(0, 200),
    }));
    // o que já está no painel por outro caminho (OFX, PDF) não entra de novo
    const { data: existentes } = await db.from("pessoal_lancamentos").select("conta_id, data, valor, descricao, identificador, anulado")
      .eq("conta_id", c.conta_id).gte("data", somarDias(de, -1));
    const { ficam, fora } = semRepetidos(novas, (existentes ?? []).map((e) => ({ ...e, valor: Number(e.valor) })));
    let entraram = 0;
    for (let i = 0; i < ficam.length; i += 500) {
      const { data, error } = await db.from("pessoal_lancamentos").upsert(ficam.slice(i, i + 500), { onConflict: "conta_id,identificador", ignoreDuplicates: true }).select("id");
      if (error) throw new Error(error.message);
      entraram += data?.length ?? 0;
    }
    await db.from("pessoal_conexoes").update({
      sincronizado_em: new Date().toISOString(), ultimas_novas: entraram, saldo_banco: conta.balance ?? null, erro: null,
    }).eq("id", c.id);
    return { novas: entraram, ja_estavam: fora.length, lidas: linhas.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("pessoal_conexoes").update({ erro: msg.slice(0, 500) }).eq("id", c.id);
    return { erro: msg };
  }
}
