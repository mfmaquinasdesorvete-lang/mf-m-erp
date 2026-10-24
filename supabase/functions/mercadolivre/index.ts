// Mercado Livre (fase 1): as vendas pagas entram sozinhas no ERP.
//  POST { topic, resource, user_id, application_id }        (aviso do Mercado Livre, sem login) → responde na hora e importa
//       a venda em segundo plano. O aviso só serve de sinal: a venda é sempre buscada na API com o token da MF.
//  POST { acao: "credenciais", client_id, client_secret }   (admin) → guarda as chaves do app no cofre
//  POST { acao: "autorizar" }                               (admin) → link para conectar a conta do Mercado Livre
//  POST { acao: "conectar", code, state }                   (admin) → troca o código pelo token, liga a conta e importa
//  POST { acao: "sincronizar" }                             (vendas, financeiro ou agendamento) → vendas que o aviso não trouxe
//  POST { acao: "importar", order_id }                      (vendas) → busca de novo uma venda
//  POST { acao: "desconectar" }                             (admin) → para de importar e esquece os tokens
// Fase 2 (estoque e preço nos anúncios):
//  POST { acao: "anuncios" }                (financeiro, marketplaces ou agendamento de 5 min) → manda o que está na fila
//  POST { acao: "buscar_anuncios" }         (vendas, financeiro ou marketplaces) → traz os anúncios da conta e liga pelo SKU
//  POST { acao: "situacao_anuncios", itens: ["MLB…"], status: "paused" | "active" } (financeiro ou marketplaces) →
//       pausa ou reativa vários anúncios de uma vez
// Fase A (depois da venda):
//  POST { acao: "pos_venda" }               (vendas, financeiro ou agendamento de 10 min) → manda as NF-e autorizadas e o
//       rastreio dos envios por conta própria; a situação do envio (enviado, entregue…) chega junto com cada venda.
// Histórico (painel da primeira aba):
//  POST { acao: "historico" }               (vendas, financeiro ou marketplaces) → busca para trás tudo o que já foi
//       vendido na conta e as datas de envio (tabela ml_historico, sem criar pedido); a sincronização também avança.
// Anúncios novos (produtos da loja que não estão no Mercado Livre):
//  POST { acao: "preparar_anuncios", produtos?: [ids] } (vendas, financeiro ou marketplaces) → monta as propostas
//       (categoria, atributos, preço que deixa o valor da loja, conferência do Mercado Livre), sem publicar
//  POST { acao: "publicar_anuncios", propostas: [ids] }  (financeiro, marketplaces ou o banco) → publica só as escolhidas
// Anúncios no ar:
//  POST { acao: "atualizar_anuncios", itens?: ["MLB…"] } (financeiro, marketplaces ou o banco) → título (sem a marca
//       My Frost), foto principal e descrição iguais ao cadastro do produto ligado
//  POST { acao: "copiar_fotos" }            (financeiro, marketplaces ou o banco) → fotos de produto por link (Canva)
//       copiadas para o ERP antes de o link vencer
// Deploy com --no-verify-jwt: o Mercado Livre e o agendamento não mandam login; o resto confere o usuário aqui dentro.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { chamadaDoAgendamento } from "../_shared/cron.ts";
import { enderecoSite } from "../_shared/site.ts";
import { buscarVenda, chamarML, ErroML, idDoRecurso, linkAutorizacao, normalizarPedido, parPkce, pedirToken, situacaoEnvio } from "../_shared/mercadolivre.ts";
import { buscarAnuncios, enviarAnuncios, mudarSituacao } from "./anuncios.ts";
import { enviarNotas, enviarRastreios } from "./posvenda.ts";
import { gravarHistorico, puxarHistorico } from "./historico.ts";
import { prepararAnuncios, publicarAnuncios } from "./novos.ts";
import { atualizarAnuncios, copiarFotos } from "./atualizar.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

type Conta = {
  id: string; ml_user_id: number; apelido: string | null; status: string; token_expira_em: string | null;
  sincronizado_em: string | null; importar_desde: string;
  historico_ate?: string | null; historico_fonte?: string | null; historico_completo?: boolean | null;
};
type Segredos = { ml_client_id?: string; ml_client_secret?: string; ml_access_token?: string; ml_refresh_token?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "use POST" }, 405);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "corpo inválido" }, 400);
  const db = adminClient();
  try {
    if (body.topic && body.resource) return await aviso(db, body);
    switch (body.acao) {
      case "credenciais": await requireErpUser(req, []); return json(await credenciais(db, body));
      case "autorizar": { const { userId } = await requireErpUser(req, []); return json(await autorizar(db, userId)); }
      case "conectar": { const { userId } = await requireErpUser(req, []); return json(await conectar(db, userId, body)); }
      case "desconectar": await requireErpUser(req, []); return json(await desconectar(db));
      case "importar": {
        await requireErpUser(req, ["vendas"]);
        const conta = await contaLigada(db);
        return json(await importar(db, conta, await tokenValido(db, conta), String(body.order_id ?? ""), true));
      }
      case "sincronizar": {
        if (!(await chamadaDoAgendamento(req))) await requireErpUser(req, ["vendas", "financeiro"]);
        const { data: c } = await db.from("ml_contas").select("*").neq("status", "desligada").order("created_at").limit(1).maybeSingle();
        if (!c) return json({ ok: true, resultado: "nenhuma conta conectada" });
        return json({ ok: true, resultado: await sincronizar(db, c as Conta) });
      }
      case "anuncios": {
        if (!(await chamadaDoAgendamento(req))) await requireErpUser(req, ["financeiro", "marketplace"]);
        const { data: c } = await db.from("ml_contas").select("*").neq("status", "desligada").order("created_at").limit(1).maybeSingle();
        if (!c) return json({ ok: true, resultado: { aviso: "nenhuma conta do Mercado Livre conectada" } });
        const conta = c as Conta & { ml_user_id: number };
        return json({ ok: true, resultado: await enviarAnuncios(db, conta, () => tokenValido(db, conta)) });
      }
      case "pos_venda": {
        if (!(await chamadaDoAgendamento(req))) await requireErpUser(req, ["vendas", "financeiro"]);
        const { data: c } = await db.from("ml_contas").select("*").eq("status", "ativa").order("created_at").limit(1).maybeSingle();
        if (!c) return json({ ok: true, resultado: { aviso: "nenhuma conta do Mercado Livre conectada" } });
        const token = await tokenValido(db, c as Conta);
        return json({ ok: true, resultado: { notas: await enviarNotas(db, token), rastreios: await enviarRastreios(db, token) } });
      }
      case "situacao_anuncios": {
        await requireErpUser(req, ["financeiro", "marketplace"]);
        const conta = await contaLigada(db);
        return json({ ok: true, resultado: await mudarSituacao(db, body.itens, body.status, await tokenValido(db, conta)) });
      }
      case "historico": {
        await requireErpUser(req, ["vendas", "financeiro", "marketplace"]);
        const conta = await contaLigada(db);
        return json({ ok: true, resultado: await puxarHistorico(db, conta, await tokenValido(db, conta)) });
      }
      case "preparar_anuncios": {
        // só monta propostas (não publica): o agendamento também pode pedir
        if (!(await chamadaDoAgendamento(req))) await requireErpUser(req, ["vendas", "financeiro", "marketplace"]);
        const conta = await contaLigada(db);
        const ids = Array.isArray(body.produtos) ? body.produtos.map(String) : undefined;
        return json({ ok: true, resultado: await prepararAnuncios(db, conta as any, await tokenValido(db, conta), ids) });
      }
      case "publicar_anuncios": {
        // pela tela (financeiro ou marketplaces) ou pelo banco, com a lista que ela aprovou
        const userId = (await chamadaDoAgendamento(req)) ? null : (await requireErpUser(req, ["financeiro", "marketplace"])).userId;
        const conta = await contaLigada(db);
        return json({ ok: true, resultado: await publicarAnuncios(db, conta as any, await tokenValido(db, conta), body.propostas, userId) });
      }
      case "atualizar_anuncios": {
        if (!(await chamadaDoAgendamento(req))) await requireErpUser(req, ["financeiro", "marketplace"]);
        const conta = await contaLigada(db);
        return json({ ok: true, resultado: await atualizarAnuncios(db, await tokenValido(db, conta), body.itens) });
      }
      case "copiar_fotos": {
        if (!(await chamadaDoAgendamento(req))) await requireErpUser(req, ["financeiro", "marketplace"]);
        return json({ ok: true, resultado: await copiarFotos(db) });
      }
      case "buscar_anuncios": {
        await requireErpUser(req, ["vendas", "financeiro", "marketplace"]);
        const conta = await contaLigada(db);
        return json({ ok: true, resultado: await buscarAnuncios(db, conta, await tokenValido(db, conta)) });
      }
    }
    return json({ error: "ação inválida" }, 400);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : e instanceof ErroML && e.status >= 400 && e.status < 500 ? 400 : 500;
    return json({ error: e instanceof Error ? e.message : String(e) }, status);
  }
});

// ---------------------------------------------------------------------
// Cofre e conta
// ---------------------------------------------------------------------
async function segredos(db: SupabaseClient): Promise<Segredos> {
  const { data, error } = await db.rpc("ml_segredos");
  if (error) throw new Error(`cofre: ${error.message}`);
  return (data ?? {}) as Segredos;
}

async function guardar(db: SupabaseClient, nome: keyof Segredos, valor: string) {
  const { error } = await db.rpc("ml_guardar_segredo", { p_nome: nome, p_valor: valor });
  if (error) throw new Error(`cofre: ${error.message}`);
}

async function contaLigada(db: SupabaseClient): Promise<Conta> {
  const { data } = await db.from("ml_contas").select("*").neq("status", "desligada").order("created_at").limit(1).maybeSingle();
  if (!data) throw new HttpError(400, "nenhuma conta do Mercado Livre conectada");
  return data as Conta;
}

/** Endereço de retorno do "Conectar": o mesmo que vai cadastrado no app do Mercado Livre. */
async function enderecoRetorno(db: SupabaseClient) {
  const { data: cfg } = await db.from("configuracoes").select("site_url").eq("id", 1).maybeSingle();
  const site = enderecoSite(cfg?.site_url);
  if (!site) throw new HttpError(400, "preencha o Endereço do site em Configurações → Empresa e marca");
  return `${site}/mercado-livre/retorno`;
}

/** Token de acesso válido; perto de vencer, renova (o refresh token muda a cada renovação e só vale uma vez). */
async function tokenValido(db: SupabaseClient, conta: Conta): Promise<string> {
  let s = await segredos(db);
  const vence = conta.token_expira_em ? new Date(conta.token_expira_em).getTime() : 0;
  if (s.ml_access_token && vence - Date.now() > 5 * 60_000) return s.ml_access_token;
  if (!s.ml_client_id || !s.ml_client_secret || !s.ml_refresh_token) {
    await marcarErro(db, conta, "Faltam as chaves ou o acesso da conta: conecte de novo em Vendas → Mercado Livre.");
    throw new HttpError(400, "conta do Mercado Livre sem acesso: conecte de novo");
  }
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const t = await pedirToken({ client_id: s.ml_client_id!, client_secret: s.ml_client_secret!, refresh_token: s.ml_refresh_token! });
      await guardar(db, "ml_access_token", t.access_token);
      await guardar(db, "ml_refresh_token", t.refresh_token);
      await db.from("ml_contas").update({ token_expira_em: new Date(Date.now() + t.expires_in * 1000).toISOString(), status: "ativa", erro: null })
        .eq("id", conta.id);
      return t.access_token;
    } catch (e) {
      // outra chamada pode ter renovado ao mesmo tempo: relê o cofre e tenta com o refresh token novo
      const antes: string | undefined = s.ml_refresh_token;
      s = await segredos(db);
      if (tentativa === 0 && s.ml_refresh_token && s.ml_refresh_token !== antes) continue;
      if (e instanceof ErroML && (e.codigo === "invalid_grant" || e.status === 400 || e.status === 401)) {
        await marcarErro(db, conta, "O acesso ao Mercado Livre expirou ou foi revogado: conecte de novo em Vendas → Mercado Livre.");
      }
      throw e;
    }
  }
  throw new Error("não foi possível renovar o acesso ao Mercado Livre");
}

async function marcarErro(db: SupabaseClient, conta: Conta, msg: string) {
  await db.from("ml_contas").update({ status: "erro", erro: msg }).eq("id", conta.id);
}

// ---------------------------------------------------------------------
// Importar
// ---------------------------------------------------------------------
async function importar(db: SupabaseClient, conta: Conta, token: string, orderId: string, forcar = false) {
  if (!/^\d{6,20}$/.test(orderId)) throw new HttpError(400, "número da venda inválido");
  const v = await buscarVenda(token, orderId);
  if (Number(v.order?.seller?.id) !== Number(conta.ml_user_id)) return { situacao: "ignorada", motivo: "venda de outra conta" };
  const venda = normalizarPedido(v.order, { billing: v.billing, envio: v.envio, custos: v.custos, pagamento: v.pagamento, vendedorId: conta.ml_user_id });
  // vendas anteriores à data de início não entram (a não ser que já estejam no ERP ou que alguém peça)
  if (!forcar && (venda.data ?? "").slice(0, 10) < conta.importar_desde) {
    const { data: ja } = await db.from("ml_pedidos").select("id").eq("ml_order_id", venda.order_id).maybeSingle();
    if (!ja) return { situacao: "ignorada", motivo: "anterior à data de início" };
  }
  const { data, error } = await db.rpc("ml_importar_pedido", { p: { conta_id: conta.id, ...venda } });
  if (error) throw new Error(error.message);
  // situação do envio (enviado, entregue…): vai para a venda e para a expedição do ERP
  if (v.envio) {
    const { error: e2 } = await db.rpc("ml_registrar_envio", { p: { order_id: venda.order_id, ...situacaoEnvio(v.envio) } });
    if (e2) console.error("mercadolivre: situação do envio", venda.order_id, e2.message);
  }
  return data;
}

async function sincronizar(db: SupabaseClient, conta: Conta) {
  const token = await tokenValido(db, conta);
  const inicio = new Date(`${conta.importar_desde}T00:00:00-03:00`).getTime();
  const ultima = conta.sincronizado_em ? new Date(conta.sincronizado_em).getTime() - 2 * 3600_000 : 0;
  const desde = new Date(Math.max(inicio, ultima)).toISOString();
  const resumo: Record<string, number> = {};
  let offset = 0;
  for (let pagina = 0; pagina < 10; pagina++) {
    const r = await chamarML(`/orders/search?seller=${conta.ml_user_id}&order.date_last_updated.from=${encodeURIComponent(desde)}&sort=date_asc&limit=50&offset=${offset}`, token);
    const lista: any[] = r?.results ?? [];
    try { await gravarHistorico(db, conta.id, lista); } catch (e) { console.error("mercadolivre:", e instanceof Error ? e.message : e); }
    for (const o of lista) {
      try {
        const res = await importar(db, conta, token, String(o.id));
        const sit = String((res as any)?.situacao ?? "?");
        resumo[sit] = (resumo[sit] ?? 0) + 1;
      } catch (e) {
        resumo.erro = (resumo.erro ?? 0) + 1;
        console.error("mercadolivre: venda", o?.id, e instanceof Error ? e.message : e);
      }
    }
    offset += lista.length;
    if (lista.length < 50 || offset >= Number(r?.paging?.total ?? 0)) break;
  }
  await db.from("ml_contas").update({ sincronizado_em: new Date().toISOString(), ultimas_novas: resumo.importada ?? 0, status: "ativa", erro: null })
    .eq("id", conta.id);
  // o histórico do painel avança um pouco a cada sincronização (e as datas de envio ficam em dia)
  try {
    const { data: c } = await db.from("ml_contas").select("*").eq("id", conta.id).single();
    const h = await puxarHistorico(db, c as Conta, token, 25_000);
    resumo.historico = h.vendas;
  } catch (e) { console.error("mercadolivre: histórico", e instanceof Error ? e.message : e); }
  return resumo;
}

/** Aviso do Mercado Livre: confere o app e a conta, responde logo e importa em segundo plano. */
async function aviso(db: SupabaseClient, b: Record<string, unknown>) {
  const s = await segredos(db);
  if (!s.ml_client_id || String(b.application_id ?? "") !== String(s.ml_client_id)) return json({ ok: true, ignorado: "app" });
  const { data: c } = await db.from("ml_contas").select("*").eq("ml_user_id", Number(b.user_id)).neq("status", "desligada").maybeSingle();
  if (!c) return json({ ok: true, ignorado: "conta" });
  const conta = c as Conta;
  const tarefa = (async () => {
    try {
      let orderId = idDoRecurso(b.resource, "orders");
      if (!orderId && String(b.topic).startsWith("shipments")) {
        const envio = idDoRecurso(b.resource, "shipments");
        if (envio) {
          const { data: p } = await db.from("ml_pedidos").select("ml_order_id").eq("shipment_id", Number(envio)).limit(1).maybeSingle();
          orderId = p ? String(p.ml_order_id) : null;
        }
      }
      if (orderId) await importar(db, conta, await tokenValido(db, conta), orderId);
    } catch (e) {
      console.error("mercadolivre: aviso", b.resource, e instanceof Error ? e.message : e);
    }
  })();
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(tarefa);
  else await tarefa;
  return json({ ok: true });
}

// ---------------------------------------------------------------------
// Conectar e desconectar (administrador)
// ---------------------------------------------------------------------
async function credenciais(db: SupabaseClient, b: Record<string, unknown>) {
  const id = String(b.client_id ?? "").trim();
  const segredo = String(b.client_secret ?? "").trim();
  if (!/^\d{6,25}$/.test(id)) throw new HttpError(400, "o Client ID do app do Mercado Livre tem só números");
  if (segredo.length < 16 || /\s/.test(segredo)) throw new HttpError(400, "confira o Client Secret (copie inteiro, sem espaços)");
  await guardar(db, "ml_client_id", id);
  await guardar(db, "ml_client_secret", segredo);
  return { ok: true, retorno: await enderecoRetorno(db) };
}

async function autorizar(db: SupabaseClient, userId: string) {
  const s = await segredos(db);
  if (!s.ml_client_id || !s.ml_client_secret) throw new HttpError(400, "informe antes o Client ID e o Client Secret do app");
  const estado = crypto.randomUUID();
  // PKCE: o segredo fica guardado aqui com o estado; só o desafio vai no link
  const { verificador, desafio } = await parPkce();
  await db.from("ml_oauth_estados").delete().lt("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  const { error } = await db.from("ml_oauth_estados").insert({ estado, criado_por: userId, verificador });
  if (error) throw new Error(error.message);
  return { url: linkAutorizacao(s.ml_client_id, await enderecoRetorno(db), estado, desafio) };
}

async function conectar(db: SupabaseClient, userId: string, b: Record<string, unknown>) {
  const code = String(b.code ?? "").trim();
  const estado = String(b.state ?? "").trim();
  if (!code || !estado) throw new HttpError(400, "retorno do Mercado Livre incompleto: clique em Conectar de novo");
  const { data: est } = await db.from("ml_oauth_estados").select("*").eq("estado", estado).maybeSingle();
  await db.from("ml_oauth_estados").delete().eq("estado", estado);
  if (!est || est.criado_por !== userId || Date.now() - new Date(est.created_at).getTime() > 15 * 60_000) {
    throw new HttpError(400, "o pedido de conexão venceu ou foi feito por outra pessoa: clique em Conectar de novo");
  }
  const s = await segredos(db);
  if (!s.ml_client_id || !s.ml_client_secret) throw new HttpError(400, "informe antes o Client ID e o Client Secret do app");
  const t = await pedirToken({ client_id: s.ml_client_id, client_secret: s.ml_client_secret, code, redirect_uri: await enderecoRetorno(db), code_verifier: est.verificador ?? undefined });
  const eu = await chamarML<{ id: number; nickname: string }>("/users/me", t.access_token);
  await guardar(db, "ml_access_token", t.access_token);
  await guardar(db, "ml_refresh_token", t.refresh_token);
  const { data: sp } = await db.from("unidades").select("id").ilike("codigo", "sp").maybeSingle();
  // uma conta só: se ligar outra, a anterior para de importar
  await db.from("ml_contas").update({ status: "desligada" }).neq("ml_user_id", eu.id).neq("status", "desligada");
  const { data: ja } = await db.from("ml_contas").select("id, unidade_id").eq("ml_user_id", eu.id).maybeSingle();
  const dados = {
    ml_user_id: eu.id, apelido: eu.nickname, status: "ativa", erro: null, conectado_em: new Date().toISOString(),
    token_expira_em: new Date(Date.now() + t.expires_in * 1000).toISOString(), unidade_id: ja?.unidade_id ?? sp?.id ?? null,
  };
  const { data: conta, error } = ja
    ? await db.from("ml_contas").update(dados).eq("id", ja.id).select("*").single()
    : await db.from("ml_contas").insert({ ...dados, criado_por: userId }).select("*").single();
  if (error) throw new Error(error.message);
  let resultado: unknown = null;
  try { resultado = await sincronizar(db, conta as Conta); } catch (e) { resultado = { erro: e instanceof Error ? e.message : String(e) }; }
  return { ok: true, apelido: eu.nickname, resultado };
}

async function desconectar(db: SupabaseClient) {
  await db.from("ml_contas").update({ status: "desligada", token_expira_em: null }).neq("status", "desligada");
  await guardar(db, "ml_access_token", "");
  await guardar(db, "ml_refresh_token", "");
  return { ok: true };
}
