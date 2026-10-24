// Banco Inter (API PJ): extrato e saldo automáticos das contas ligadas ao app do Inter.
//  POST { acao: "ligar", conta_bancaria_id, client_id, client_secret, cert, key, conta_corrente?, desde?, conexao_id? }
//       (admin) → confere no Inter (acesso + saldo), guarda as credenciais no cofre e já busca o extrato.
//       Com conexao_id: troca só o que vier preenchido (ex.: certificado novo quando o antigo vence).
//  POST { acao: "sincronizar", conexao_id? }   (financeiro ou agendamento) → lançamentos novos e saldo
//  POST { acao: "desligar", conexao_id }       (admin) → para de buscar e esquece as credenciais
//  Boleto com Pix (boletos.ts): boletos_ligar / boletos_desligar (admin), boleto_emitir, boleto_atualizar, boleto_pdf
//       (financeiro ou vendas), boleto_cancelar (financeiro) e o aviso do Inter (lista de cobranças, sem login).
//  Pix de saída (pix.ts): pix_pagar { conta_id, conexao_id, chave } e pix_consultar { id } (financeiro); na sincronização,
//       os Pix que ficaram esperando são conferidos no Inter sozinhos (conferirPixAbertos) e o financeiro é avisado.
//  Boletos pagos/agendados (pagamentos.ts): pagamentos_boleto { conexao_id, dias? } (financeiro) → casa com as contas a
//       pagar e dá a baixa nas pagas (a API não traz o DDA).
// Deploy com --no-verify-jwt: o agendamento não manda login de usuário; o resto confere aqui dentro.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { chamadaDoAgendamento } from "../_shared/cron.ts";
import { type ChavesInter, clienteInter, conferirCertificado, ErroInter, hojeSP, linhasInter, somarDias } from "../_shared/inter.ts";
import { conferirPixAbertos, consultarPix, pagarPix } from "./pix.ts";
import { buscarPagamentosBoleto } from "./pagamentos.ts";
import { atualizarBoleto, avisoBoletos, cancelarBoleto, conferirAbertos, desligarBoletos, emitirBoleto, ligarBoletos, pdfBoleto } from "./boletos.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Conexao = {
  id: string; conta_bancaria_id: string; conta_corrente: string | null; status: string; desde: string;
  sincronizado_em: string | null; certificado_validade: string | null; boletos?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "use POST" }, 405);
  const body = await req.json().catch(() => null);
  const db = adminClient();
  // aviso do Inter sobre boletos (pago, cancelado, expirado): lista de cobranças, sem login; o ERP confere cada uma no Inter
  if (Array.isArray(body)) {
    try { return json(await avisoBoletos(db, body, chaves)); } catch (e) { return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200); }
  }
  if (!body || typeof body !== "object") return json({ error: "corpo inválido" }, 400);
  try {
    if (body.acao === "boletos_ligar" || body.acao === "boletos_desligar") {
      await requireErpUser(req, []);
      const id = String(body.conexao_id ?? "");
      return json(body.acao === "boletos_ligar" ? await ligarBoletos(db, id, chaves) : await desligarBoletos(db, id, chaves));
    }
    if (body.acao === "boleto_emitir") {
      const { userId } = await requireErpUser(req, ["financeiro", "vendas"]);
      return json(await emitirBoleto(db, body, userId, chaves));
    }
    if (body.acao === "boleto_atualizar" || body.acao === "boleto_pdf") {
      await requireErpUser(req, ["financeiro", "vendas"]);
      const id = String(body.id ?? "");
      return json(body.acao === "boleto_pdf" ? await pdfBoleto(db, id, chaves) : await atualizarBoleto(db, id, chaves));
    }
    if (body.acao === "boleto_cancelar") {
      await requireErpUser(req, ["financeiro"]);
      return json(await cancelarBoleto(db, String(body.id ?? ""), String(body.motivo ?? ""), chaves));
    }
    if (body.acao === "pix_pagar") {
      const { userId } = await requireErpUser(req, ["financeiro"]);
      return json(await pagarPix(req, db, body, userId, chaves));
    }
    if (body.acao === "pix_consultar") {
      await requireErpUser(req, ["financeiro"]);
      return json(await consultarPix(req, db, String(body.id ?? ""), chaves));
    }
    if (body.acao === "pagamentos_boleto") {
      await requireErpUser(req, ["financeiro"]);
      return json(await buscarPagamentosBoleto(req, db, body, chaves));
    }
    if (body.acao === "ligar") {
      await requireErpUser(req, []);
      return json(await ligar(db, body));
    }
    if (body.acao === "desligar") {
      await requireErpUser(req, []);
      return json(await desligar(db, String(body.conexao_id ?? "")));
    }
    if (body.acao === "sincronizar") {
      const agendamento = await chamadaDoAgendamento(req);
      if (!agendamento) await requireErpUser(req, ["financeiro"]);
      let q = db.from("inter_conexoes").select("*").neq("status", "desligada");
      if (body.conexao_id) q = q.eq("id", String(body.conexao_id));
      const { data: lista } = await q;
      const resultado: Record<string, unknown> = {};
      for (const c of (lista ?? []) as Conexao[]) {
        resultado[c.id] = await sincronizar(db, c, agendamento);
        // boletos em aberto conferidos no Inter (rede de segurança do aviso automático)
        if (c.boletos) {
          try { (resultado[c.id] as Record<string, unknown>).boletos = await conferirAbertos(db, c.id, chaves); } catch { /* fica para a próxima */ }
        }
        // Pix de saída que ficou esperando (envio sem resposta, aprovação no app do Inter, agendado)
        try { (resultado[c.id] as Record<string, unknown>).pix = await conferirPixAbertos(db, c.id, chaves); } catch { /* fica para a próxima */ }
      }
      return json({ ok: true, resultado });
    }
    return json({ error: "ação inválida" }, 400);
  } catch (e) {
    const status = e instanceof HttpError || e instanceof ErroInter ? e.status : 500;
    return json({ error: e instanceof Error ? e.message : String(e) }, status >= 400 && status < 600 ? status : 500);
  }
});

const limpo = (v: unknown) => String(v ?? "").replace(/\r\n/g, "\n").trim();

async function ligar(db: SupabaseClient, b: Record<string, unknown>) {
  const conexaoId = b.conexao_id ? String(b.conexao_id) : null;
  if (conexaoId && !UUID.test(conexaoId)) throw new HttpError(400, "conexão inválida");
  let anterior: Conexao | null = null;
  if (conexaoId) {
    const { data } = await db.from("inter_conexoes").select("*").eq("id", conexaoId).neq("status", "desligada").maybeSingle();
    if (!data) throw new HttpError(404, "conexão do Inter não encontrada");
    anterior = data as Conexao;
  }
  const contaErp = anterior?.conta_bancaria_id ?? String(b.conta_bancaria_id ?? "");
  if (!UUID.test(contaErp)) throw new HttpError(400, "escolha a conta bancária do ERP");
  const { data: cb } = await db.from("contas_bancarias").select("id, nome, ativo").eq("id", contaErp).maybeSingle();
  if (!cb?.ativo) throw new HttpError(400, "conta bancária do ERP não encontrada");
  if (!anterior) {
    const { data: ja } = await db.from("inter_conexoes").select("id").eq("conta_bancaria_id", contaErp).neq("status", "desligada").maybeSingle();
    if (ja) throw new HttpError(400, `${cb.nome} já está ligada ao Inter: use "Trocar credenciais".`);
  }

  // o que não veio preenchido (ao trocar só o certificado, por exemplo) é o que já estava guardado
  const guardadas = anterior ? await chaves(db, anterior.id) : null;
  const ch: ChavesInter = {
    client_id: limpo(b.client_id) || guardadas?.client_id || "",
    client_secret: limpo(b.client_secret) || guardadas?.client_secret || "",
    cert: limpo(b.cert) || guardadas?.cert || "",
    key: limpo(b.key) || guardadas?.key || "",
  };
  if (!ch.client_id || !ch.client_secret) throw new HttpError(400, "Informe o Client ID e o Client Secret do app do Inter.");
  if (!ch.cert || !ch.key) throw new HttpError(400, "Envie o certificado (.crt) e a chave (.key) do app do Inter.");
  const { validade } = conferirCertificado(ch.cert, ch.key);
  const contaCorrente = b.conta_corrente !== undefined ? limpo(b.conta_corrente).replace(/\D/g, "") || null : anterior?.conta_corrente ?? null;

  // confere no Inter antes de guardar: acesso e saldo
  const cli = clienteInter(ch, contaCorrente);
  let saldo: number | null;
  try {
    await cli.entrar();
    saldo = await cli.saldo();
  } finally {
    cli.fechar();
  }

  const hoje = hojeSP();
  let desde = /^\d{4}-\d{2}-\d{2}$/.test(String(b.desde ?? "")) ? String(b.desde) : anterior?.desde ?? somarDias(hoje, -30);
  if (desde > hoje) desde = hoje;
  if (desde < somarDias(hoje, -365)) desde = somarDias(hoje, -365);

  const campos = { conta_corrente: contaCorrente, desde, status: "ativa", erro: null, certificado_validade: validade, saldo, saldo_em: new Date().toISOString() };
  const { data: c, error } = anterior
    ? await db.from("inter_conexoes").update(campos).eq("id", anterior.id).select("*").single()
    : await db.from("inter_conexoes").insert({ ...campos, conta_bancaria_id: contaErp }).select("*").single();
  if (error || !c) throw new HttpError(400, error?.message ?? "não consegui gravar a conexão");
  const { error: e2 } = await db.rpc("inter_guardar_chaves", {
    p_conexao: c.id, p_client_id: ch.client_id, p_client_secret: ch.client_secret, p_cert: ch.cert, p_key: ch.key,
  });
  if (e2) {
    if (!anterior) await db.from("inter_conexoes").update({ status: "desligada", erro: "credenciais não guardadas" }).eq("id", c.id);
    throw new HttpError(500, `não consegui guardar as credenciais: ${e2.message}`);
  }
  const r = await sincronizar(db, c as Conexao, false);
  return { ok: true, conexao_id: c.id, saldo, certificado_validade: validade, ...r };
}

async function chaves(db: SupabaseClient, id: string): Promise<ChavesInter | null> {
  const { data } = await db.rpc("inter_chaves", { p_conexao: id });
  const ch = data as ChavesInter | null;
  return ch?.client_id && ch?.client_secret && ch?.cert && ch?.key ? ch : null;
}

async function sincronizar(db: SupabaseClient, c: Conexao, agendamento: boolean) {
  const ch = await chaves(db, c.id);
  const falhou = async (msg: string) => {
    await db.from("inter_conexoes").update({ status: "erro", erro: msg.slice(0, 300) }).eq("id", c.id).neq("status", "desligada");
    if (c.status !== "erro") {
      const { data: cb } = await db.from("contas_bancarias").select("nome, unidade_id").eq("id", c.conta_bancaria_id).maybeSingle();
      await db.rpc("notificar", {
        p_tipo: "pagamento", p_titulo: `Inter: o extrato de ${cb?.nome ?? "uma conta"} parou de chegar`, p_texto: msg.slice(0, 300),
        p_link: "/conciliacao", p_papeis: ["financeiro"], p_unidade: cb?.unidade_id ?? null,
      });
    }
    return { erro: msg };
  };
  if (!ch) return await falhou("As credenciais do app do Inter não estão guardadas: ligue a conta de novo em Bancos e conciliação.");

  const hoje = hojeSP();
  // busca de novo os últimos 5 dias (lançamentos que o banco inclui com atraso); repetidos são ignorados
  const ultimo = c.sincronizado_em ? somarDias(c.sincronizado_em.slice(0, 10), -5) : c.desde;
  const inicio = ultimo > c.desde ? ultimo : c.desde;
  const cli = clienteInter(ch, c.conta_corrente);
  try {
    await cli.entrar();
    const saldo = await cli.saldo();
    const linhas = linhasInter(await cli.extrato(inicio, hoje));
    const { data, error } = await db.rpc("importar_extrato_inter", { p_conexao: c.id, p_linhas: linhas, p_saldo: saldo, p_saldo_em: new Date().toISOString() });
    if (error) throw new Error(error.message);
    await avisarVencimento(db, c, agendamento);
    return { novas: data?.novas ?? 0, conciliadas: data?.conciliadas ?? 0, saldo };
  } catch (e) {
    return await falhou(e instanceof Error ? e.message : String(e));
  } finally {
    cli.fechar();
  }
}

/** Certificado do app vencendo: avisa o financeiro uma vez por dia (no agendamento do começo da tarde). */
async function avisarVencimento(db: SupabaseClient, c: Conexao, agendamento: boolean) {
  if (!agendamento || !c.certificado_validade) return;
  const dias = Math.floor((new Date(c.certificado_validade).getTime() - Date.now()) / 864e5);
  const hora = new Date().getUTCHours();
  if (dias > 20 || hora < 15 || hora >= 19) return;
  const { data: cb } = await db.from("contas_bancarias").select("nome, unidade_id").eq("id", c.conta_bancaria_id).maybeSingle();
  await db.rpc("notificar", {
    p_tipo: "pagamento", p_titulo: `Certificado do Inter (${cb?.nome ?? "conta"}) ${dias < 0 ? "venceu" : `vence em ${dias} dia(s)`}`,
    p_texto: "Gere um certificado novo no app do Inter (Internet Banking → Soluções para sua empresa → Integrações) e envie em Bancos e conciliação → Trocar credenciais.",
    p_link: "/conciliacao", p_papeis: ["financeiro"], p_unidade: cb?.unidade_id ?? null,
  });
}

async function desligar(db: SupabaseClient, id: string) {
  if (!UUID.test(id)) throw new HttpError(400, "conexão inválida");
  const { error } = await db.from("inter_conexoes").update({ status: "desligada" }).eq("id", id);
  if (error) throw new HttpError(400, error.message);
  await db.rpc("inter_esquecer_chaves", { p_conexao: id });
  return { ok: true };
}
