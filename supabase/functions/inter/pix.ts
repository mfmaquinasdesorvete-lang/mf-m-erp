// Pix de saída pelo Banco Inter (pagar uma conta a pagar), chamado pela função inter (index.ts):
//  pix_pagar { conta_id, conexao_id, chave }  (financeiro) → confere a conta (aberta, aprovada, fornecedor sem bloqueio),
//       grava o pedido (o id dele é a chave de idempotência do Inter: clique repetido não paga duas vezes), manda o Pix
//       e, se o Inter já processou, registra o pagamento da conta (baixar_conta, com o login de quem pediu).
//  pix_consultar { id }  (financeiro) → lê a situação no Inter (ex.: depois de aprovar no app do Inter) e dá a baixa.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { HttpError } from "../_shared/supabase.ts";
import { type ChavesInter, clienteInter, ErroInter, hojeSP } from "../_shared/inter.ts";
import { corpoPix, ESCOPO_PIX, lerChavePix, situacaoDaConsulta, situacaoDoEnvio, type SituacaoPix } from "../_shared/pix-saida.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Chaves = (db: SupabaseClient, id: string) => Promise<ChavesInter | null>;
type Pedido = { id: string; conta_pagar_id: string; conexao_id: string; valor: number; status: SituacaoPix; codigo_solicitacao: string | null };

/** Cliente do banco com o login de quem clicou: a baixa passa pelas mesmas regras de quem registra o pagamento na tela. */
const comoUsuario = (req: Request) => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
  { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });

async function conexaoAtiva(db: SupabaseClient, id: string) {
  const { data } = await db.from("inter_conexoes").select("id, conta_bancaria_id, conta_corrente, status").eq("id", id).neq("status", "desligada").maybeSingle();
  if (!data) throw new HttpError(404, "conta do Inter não encontrada");
  return data as { id: string; conta_bancaria_id: string; conta_corrente: string | null };
}

async function darBaixa(req: Request, db: SupabaseClient, p: Pedido, conexao: { conta_bancaria_id: string }) {
  const { data: conta } = await db.from("contas_pagar").select("status").eq("id", p.conta_pagar_id).single();
  if (conta?.status === "pago") return null;
  const { error } = await comoUsuario(req).rpc("baixar_conta", {
    p_tabela: "contas_pagar", p_id: p.conta_pagar_id, p_data: hojeSP(), p_valor: p.valor, p_conta_bancaria: conexao.conta_bancaria_id, p_restante_vencimento: null,
  });
  return error ? `O Pix foi pago, mas a baixa da conta não foi registrada (${error.message}). Registre o pagamento à mão.` : null;
}

export async function pagarPix(req: Request, db: SupabaseClient, b: Record<string, unknown>, userId: string, chaves: Chaves) {
  const contaId = String(b.conta_id ?? ""), conexaoId = String(b.conexao_id ?? "");
  if (!UUID.test(contaId) || !UUID.test(conexaoId)) throw new HttpError(400, "conta inválida");
  const chave = lerChavePix(String(b.chave ?? ""));
  if (!chave) throw new HttpError(400, "Chave Pix inválida: use CPF, CNPJ, e-mail, celular com DDD ou a chave aleatória.");

  const { data: c } = await db.from("contas_pagar").select("id, descricao, valor, status, revisao, decisao, fornecedor:fornecedores(nome, bloqueado)").eq("id", contaId).maybeSingle();
  if (!c) throw new HttpError(404, "conta a pagar não encontrada");
  if (c.status !== "aberto") throw new HttpError(409, "Esta conta não está em aberto (já foi paga ou cancelada).");
  if (c.revisao && !["aprovado", "historico"].includes(String(c.revisao))) throw new HttpError(409, "Esta conta ainda não foi aprovada: o Pix só sai depois da aprovação (Financeiro → Aprovações).");
  if (c.decisao === "nao_pagar") throw new HttpError(409, "Esta conta está marcada como \"Não pagar\".");
  if ((c.fornecedor as { bloqueado?: boolean } | null)?.bloqueado) throw new HttpError(409, "Fornecedor bloqueado (golpe): o ERP não paga.");
  const valor = Math.round(Number(c.valor) * 100) / 100;
  if (!(valor > 0)) throw new HttpError(400, "valor da conta inválido");

  const conexao = await conexaoAtiva(db, conexaoId);
  const ch = await chaves(db, conexao.id);
  if (!ch) throw new HttpError(400, "As credenciais do app do Inter não estão guardadas: ligue a conta de novo em Bancos e conciliação.");
  const { data: quem } = await db.from("usuarios_erp").select("nome").eq("user_id", userId).maybeSingle();

  // o pedido primeiro: o índice único impede dois Pix ao mesmo tempo para a mesma conta
  const { data: pedido, error: errPedido } = await db.from("pix_pagamentos").insert({
    conta_pagar_id: contaId, conexao_id: conexao.id, chave: chave.chave, tipo_chave: chave.tipo, valor, criado_por: userId, criado_por_nome: quem?.nome ?? null,
  }).select("id, conta_pagar_id, conexao_id, valor, status, codigo_solicitacao").single();
  if (errPedido) {
    if (/duplicate|unique/i.test(errPedido.message)) throw new HttpError(409, "Já existe um Pix em andamento ou pago para esta conta.");
    throw errPedido;
  }
  await db.from("contas_pagar").update({ chave_pix: chave.chave }).eq("id", contaId).is("chave_pix", null);

  const cli = clienteInter(ch, conexao.conta_corrente);
  try {
    const r = await cli.pedir<Record<string, unknown>>("POST", "/banking/v2/pix", corpoPix({ chave: chave.chave, valor, descricao: String(c.descricao ?? "") }), ESCOPO_PIX,
      { "x-id-idempotente": pedido.id });
    const status = situacaoDoEnvio(r.tipoRetorno);
    await db.from("pix_pagamentos").update({ status, codigo_solicitacao: r.codigoSolicitacao ? String(r.codigoSolicitacao) : null, resposta: r, atualizado_em: new Date().toISOString() }).eq("id", pedido.id);
    const aviso = status === "pago" ? await darBaixa(req, db, { ...pedido, status } as Pedido, conexao) : null;
    return { ok: true, id: pedido.id, status, aviso };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // falha sem resposta do Inter (rede): fica "enviando" para conferir depois, nunca reenviar às cegas
    const semResposta = e instanceof ErroInter && e.status === 502;
    await db.from("pix_pagamentos").update({ status: semResposta ? "enviando" : "falhou", erro: msg.slice(0, 500), atualizado_em: new Date().toISOString() }).eq("id", pedido.id);
    if (semResposta) throw new HttpError(502, `${msg} O Pix pode ter saído: confira no app do Inter antes de tentar de novo.`);
    throw e;
  } finally {
    cli.fechar();
  }
}

export async function consultarPix(req: Request, db: SupabaseClient, id: string, chaves: Chaves) {
  if (!UUID.test(id)) throw new HttpError(400, "pedido inválido");
  const { data } = await db.from("pix_pagamentos").select("id, conta_pagar_id, conexao_id, valor, status, codigo_solicitacao").eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "Pix não encontrado");
  const p = data as Pedido;
  if (p.status === "pago" || p.status === "falhou") return { ok: true, status: p.status };
  if (!p.codigo_solicitacao) return { ok: true, status: p.status, aviso: "O Inter não devolveu o código deste Pix: confira no app do Inter." };
  const conexao = await conexaoAtiva(db, p.conexao_id);
  const ch = await chaves(db, conexao.id);
  if (!ch) throw new HttpError(400, "As credenciais do app do Inter não estão guardadas.");
  const cli = clienteInter(ch, conexao.conta_corrente);
  try {
    const r = await cli.pedir<Record<string, unknown>>("GET", `/banking/v2/pix/${encodeURIComponent(p.codigo_solicitacao)}`, undefined, ESCOPO_PIX);
    const lida = situacaoDaConsulta(r);
    const status = lida === "enviando" ? p.status : lida;
    await db.from("pix_pagamentos").update({ status, resposta: r, atualizado_em: new Date().toISOString() }).eq("id", p.id);
    const aviso = status === "pago" ? await darBaixa(req, db, p, conexao) : null;
    return { ok: true, status, aviso };
  } finally {
    cli.fechar();
  }
}

/**
 * Rede de segurança do Pix de saída (na sincronização agendada, como os boletos): o Pix que ficou "enviando",
 * "aguardando aprovação" no app do Inter ou "agendado" é conferido no Inter sozinho. Mudou de situação: grava.
 * Saiu (pago): avisa o financeiro para dar a baixa pela conta ("Conferir no Inter"), com o login de quem confere.
 * Sem o código do Inter há mais de 1 dia (a internet caiu no envio): avisa uma vez para conferir no app.
 */
export async function conferirPixAbertos(db: SupabaseClient, conexaoId: string, chaves: Chaves) {
  const { data } = await db.from("pix_pagamentos")
    .select("id, conta_pagar_id, conexao_id, valor, status, codigo_solicitacao, erro, atualizado_em, conta:contas_pagar(descricao)")
    .eq("conexao_id", conexaoId).in("status", ["enviando", "aguardando_aprovacao", "agendado"]).limit(20);
  const lista = (data ?? []) as (Pedido & { erro: string | null; atualizado_em: string | null; conta: { descricao?: string } | null })[];
  if (!lista.length) return { conferidos: 0 };
  const AVISO_SEM_CODIGO = "Sem resposta do Inter no envio: confira no app do Inter se este Pix saiu.";
  const avisar = (titulo: string, p: (typeof lista)[number]) => db.rpc("notificar", {
    p_tipo: "pagamento", p_titulo: titulo, p_texto: `${p.conta?.descricao ?? "Conta a pagar"} · R$ ${Number(p.valor).toFixed(2).replace(".", ",")}`,
    p_link: "/financeiro", p_papeis: ["financeiro"],
  });
  const ch = await chaves(db, conexaoId);
  const conexao = await conexaoAtiva(db, conexaoId);
  let mudaram = 0;
  const cli = ch ? clienteInter(ch, conexao.conta_corrente) : null;
  try {
    for (const p of lista) {
      if (!p.codigo_solicitacao) {
        const velho = p.atualizado_em && Date.now() - new Date(p.atualizado_em).getTime() > 864e5;
        if (velho && p.erro !== AVISO_SEM_CODIGO) {
          await db.from("pix_pagamentos").update({ erro: AVISO_SEM_CODIGO }).eq("id", p.id);
          await avisar("Pix de saída sem confirmação do Inter: confira no app", p);
        }
        continue;
      }
      if (!cli) continue;
      try {
        const r = await cli.pedir<Record<string, unknown>>("GET", `/banking/v2/pix/${encodeURIComponent(p.codigo_solicitacao)}`, undefined, ESCOPO_PIX);
        const lida = situacaoDaConsulta(r);
        if (lida === "enviando" || lida === p.status) continue;
        await db.from("pix_pagamentos").update({ status: lida, resposta: r, atualizado_em: new Date().toISOString() }).eq("id", p.id);
        mudaram++;
        if (lida === "pago") await avisar("Pix saiu no Inter: dê a baixa da conta (Conferir no Inter)", p);
        if (lida === "falhou") await avisar("Pix de saída não foi feito pelo Inter: pague de novo ou por outro meio", p);
      } catch { /* fica para a próxima sincronização */ }
    }
  } finally {
    cli?.fechar();
  }
  return { conferidos: lista.length, mudaram };
}
