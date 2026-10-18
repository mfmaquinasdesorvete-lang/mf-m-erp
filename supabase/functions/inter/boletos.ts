// Boleto com Pix do Banco Inter, chamado pela função inter (index.ts):
//  boletos_ligar / boletos_desligar (admin)  → confere a permissão de boletos do app e cadastra o aviso (webhook)
//  boleto_emitir { conta_id, vencimento? }   → emite para a conta a receber (financeiro ou vendas)
//  boleto_atualizar { id } · boleto_pdf { id } · boleto_cancelar { id, motivo } (cancelar: financeiro)
//  aviso do Inter (lista [{ codigoSolicitacao, … }], sem login) → consulta cada boleto no Inter e só então registra
// A baixa da conta é feita no banco (registrar_boleto_inter), sempre com a situação lida direto do Inter.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { HttpError } from "../_shared/supabase.ts";
import { type ChavesInter, clienteInter, ErroInter, hojeSP } from "../_shared/inter.ts";
import {
  BOLETO_EM_ABERTO, type ClienteBoleto, type CobrancaInter, codigosDoAviso, corpoCobranca, ESCOPO_BOLETO, lerCobranca, pagadorInter,
} from "../_shared/inter-boleto.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COBRANCAS = "/cobranca/v3/cobrancas";
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Conexao = {
  id: string; conta_bancaria_id: string; conta_corrente: string | null; status: string; boletos: boolean;
  boleto_multa_pct: number; boleto_juros_mes_pct: number; boleto_dias_baixa: number; boleto_mensagem: string | null;
};
type Boleto = { id: string; conexao_id: string; conta_receber_id: string | null; codigo_solicitacao: string | null; situacao: string };
type Chaves = (db: SupabaseClient, id: string) => Promise<ChavesInter | null>;

async function conexao(db: SupabaseClient, id: string) {
  const { data } = await db.from("inter_conexoes").select("*").eq("id", id).neq("status", "desligada").maybeSingle();
  if (!data) throw new HttpError(404, "conta do Inter não encontrada");
  return data as Conexao;
}

async function cliente(db: SupabaseClient, c: Conexao, chaves: Chaves) {
  const ch = await chaves(db, c.id);
  if (!ch) throw new HttpError(400, "As credenciais do app do Inter não estão guardadas: ligue a conta de novo em Bancos e conciliação.");
  return clienteInter(ch, c.conta_corrente);
}

const urlAviso = (conexaoId: string) => `${Deno.env.get("SUPABASE_URL")}/functions/v1/inter?boletos=${conexaoId}`;

/** Liga os boletos na conta: confere a permissão no Inter e cadastra o aviso de pagamento (webhook). */
export async function ligarBoletos(db: SupabaseClient, id: string, chaves: Chaves) {
  if (!UUID.test(id)) throw new HttpError(400, "conexão inválida");
  const c = await conexao(db, id);
  const cli = await cliente(db, c, chaves);
  try {
    try {
      await cli.entrar(ESCOPO_BOLETO);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from("inter_conexoes").update({ boletos: false, boletos_erro: msg.slice(0, 300) }).eq("id", c.id);
      throw e;
    }
    let aviso: string | null = null;
    try {
      await cli.pedir("PUT", `${COBRANCAS}/webhook`, { webhookUrl: urlAviso(c.id) }, ESCOPO_BOLETO);
    } catch (e) {
      aviso = `Boletos ligados, mas o aviso automático de pagamento não foi cadastrado no Inter (${e instanceof Error ? e.message : e}). O ERP confere os boletos em aberto a cada atualização do extrato.`;
    }
    await db.from("inter_conexoes").update({ boletos: true, boletos_erro: aviso?.slice(0, 300) ?? null, boletos_webhook_em: aviso ? null : new Date().toISOString() }).eq("id", c.id);
    return { ok: true, aviso };
  } finally {
    cli.fechar();
  }
}

export async function desligarBoletos(db: SupabaseClient, id: string, chaves: Chaves) {
  if (!UUID.test(id)) throw new HttpError(400, "conexão inválida");
  const c = await conexao(db, id);
  const ch = await chaves(db, c.id);
  if (ch) {
    const cli = clienteInter(ch, c.conta_corrente);
    try { await cli.pedir("DELETE", `${COBRANCAS}/webhook`, undefined, ESCOPO_BOLETO); } catch { /* sem aviso cadastrado */ } finally { cli.fechar(); }
  }
  await db.from("inter_conexoes").update({ boletos: false, boletos_erro: null, boletos_webhook_em: null }).eq("id", c.id);
  return { ok: true };
}

/** Lê o boleto no Inter e grava (com a baixa da conta, quando pago). */
async function atualizarUm(db: SupabaseClient, b: Boleto, cli: ReturnType<typeof clienteInter>) {
  if (!b.codigo_solicitacao) return b.situacao;
  const r = await cli.pedir<CobrancaInter>("GET", `${COBRANCAS}/${b.codigo_solicitacao}`, undefined, ESCOPO_BOLETO);
  const { data, error } = await db.rpc("registrar_boleto_inter", { p_id: b.id, p_dados: { ...lerCobranca(r), erro: "" } });
  if (error) throw new HttpError(500, error.message);
  return String(data ?? "");
}

const CAMPOS_CLIENTE = "nome, tipo_pessoa, cpf_cnpj, email, telefone, whatsapp, cep, logradouro, numero, complemento, bairro, municipio, uf, " +
  "cobranca_diferente, cobranca_cep, cobranca_logradouro, cobranca_numero, cobranca_complemento, cobranca_bairro, cobranca_municipio, cobranca_uf";

/** Emite o boleto com Pix da conta a receber na conta do Inter da mesma unidade. */
export async function emitirBoleto(db: SupabaseClient, b: Record<string, unknown>, userId: string, chaves: Chaves) {
  const contaId = String(b.conta_id ?? "");
  if (!UUID.test(contaId)) throw new HttpError(400, "conta inválida");
  const { data: conta } = await db.from("contas_receber").select(`id, descricao, valor, vencimento, status, unidade_id, cliente:clientes(${CAMPOS_CLIENTE})`).eq("id", contaId).maybeSingle();
  if (!conta) throw new HttpError(404, "conta a receber não encontrada");
  if (conta.status !== "aberto") throw new HttpError(400, "Só conta em aberto recebe boleto.");
  const vencimento = /^\d{4}-\d{2}-\d{2}$/.test(String(b.vencimento ?? "")) ? String(b.vencimento) : String(conta.vencimento);
  if (vencimento < hojeSP()) throw new HttpError(400, "O vencimento já passou: escolha uma data a partir de hoje para o boleto.");
  const { pagador, faltando } = pagadorInter(conta.cliente as ClienteBoleto | null);
  if (!pagador) throw new HttpError(400, `Complete o cadastro do cliente para emitir o boleto: falta ${faltando.join(", ")}.`);

  // conta do Inter com boletos ligados na mesma unidade da conta a receber
  const { data: lista } = await db.from("inter_conexoes").select("*, banco:contas_bancarias(unidade_id, nome)").eq("boletos", true).neq("status", "desligada");
  const c = ((lista ?? []) as (Conexao & { banco: { unidade_id: string | null } | null })[]).find((x) => x.banco?.unidade_id === conta.unidade_id);
  if (!c) throw new HttpError(400, "A unidade desta conta não tem conta do Inter com boletos ligados (Bancos e conciliação → Banco Inter → Ligar boletos).");

  const { count } = await db.from("boletos_inter").select("id", { count: "exact", head: true }).eq("conta_receber_id", conta.id);
  const corpo = corpoCobranca({
    contaId: conta.id, tentativa: count ?? 0, valor: Number(conta.valor), vencimento, pagador, descricao: conta.descricao,
    regras: { multa_pct: c.boleto_multa_pct, juros_mes_pct: c.boleto_juros_mes_pct, dias_baixa: c.boleto_dias_baixa, mensagem: c.boleto_mensagem },
  });
  const { data: usuario } = await db.from("usuarios_erp").select("nome").eq("user_id", userId).maybeSingle();
  const { data: novo, error } = await db.from("boletos_inter").insert({
    conta_receber_id: conta.id, conexao_id: c.id, unidade_id: conta.unidade_id, seu_numero: corpo.seuNumero, valor: corpo.valorNominal,
    vencimento, criado_por: userId, criado_nome: usuario?.nome ?? null,
  }).select("id, conexao_id, conta_receber_id, codigo_solicitacao, situacao").single();
  if (error || !novo) {
    if (/boletos_inter_um_aberto/.test(error?.message ?? "")) throw new HttpError(400, "Esta conta já tem um boleto em aberto: cancele o anterior para emitir outro.");
    throw new HttpError(500, error?.message ?? "não consegui registrar o boleto");
  }

  const cli = await cliente(db, c, chaves);
  try {
    let codigo: string;
    try {
      const r = await cli.pedir<{ codigoSolicitacao?: string }>("POST", COBRANCAS, corpo, ESCOPO_BOLETO);
      codigo = String(r.codigoSolicitacao ?? "");
      if (!UUID.test(codigo)) throw new ErroInter(502, "O Inter não devolveu o código do boleto.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from("boletos_inter").update({ situacao: "FALHA_EMISSAO", erro: msg.slice(0, 300), atualizado_em: new Date().toISOString() }).eq("id", novo.id);
      throw e;
    }
    await db.from("boletos_inter").update({ codigo_solicitacao: codigo }).eq("id", novo.id);
    // o Inter registra em alguns segundos: a linha digitável e o Pix chegam na consulta
    let situacao = "EM_PROCESSAMENTO";
    for (let i = 0; i < 5 && situacao === "EM_PROCESSAMENTO"; i++) {
      await esperar(i === 0 ? 1500 : 2000);
      try { situacao = await atualizarUm(db, { ...(novo as Boleto), codigo_solicitacao: codigo }, cli); } catch { /* tenta de novo */ }
    }
    const { data: final } = await db.from("boletos_inter").select("*").eq("id", novo.id).single();
    return { ok: true, boleto: final };
  } finally {
    cli.fechar();
  }
}

async function boletoComCliente(db: SupabaseClient, id: string, chaves: Chaves) {
  if (!UUID.test(id)) throw new HttpError(400, "boleto inválido");
  const { data: b } = await db.from("boletos_inter").select("id, conexao_id, conta_receber_id, codigo_solicitacao, situacao").eq("id", id).maybeSingle();
  if (!b) throw new HttpError(404, "boleto não encontrado");
  if (!b.codigo_solicitacao) throw new HttpError(400, "Este boleto não chegou a ser registrado no Inter.");
  const c = await conexao(db, b.conexao_id);
  return { b: b as Boleto, cli: await cliente(db, c, chaves) };
}

export async function atualizarBoleto(db: SupabaseClient, id: string, chaves: Chaves) {
  const { b, cli } = await boletoComCliente(db, id, chaves);
  try {
    const r = await atualizarUm(db, b, cli);
    const { data } = await db.from("boletos_inter").select("*").eq("id", b.id).single();
    return { ok: true, resultado: r, boleto: data };
  } finally { cli.fechar(); }
}

export async function pdfBoleto(db: SupabaseClient, id: string, chaves: Chaves) {
  const { b, cli } = await boletoComCliente(db, id, chaves);
  try {
    const r = await cli.pedir<{ pdf?: string }>("GET", `${COBRANCAS}/${b.codigo_solicitacao}/pdf`, undefined, ESCOPO_BOLETO);
    if (!r.pdf) throw new HttpError(502, "O Inter não devolveu o PDF do boleto.");
    return { pdf: r.pdf };
  } finally { cli.fechar(); }
}

export async function cancelarBoleto(db: SupabaseClient, id: string, motivo: string, chaves: Chaves) {
  const m = motivo.trim();
  if (m.length < 3) throw new HttpError(400, "Informe o motivo do cancelamento.");
  const { b, cli } = await boletoComCliente(db, id, chaves);
  try {
    if (!BOLETO_EM_ABERTO.includes(b.situacao as never)) throw new HttpError(400, "Só boleto em aberto pode ser cancelado.");
    await cli.pedir("POST", `${COBRANCAS}/${b.codigo_solicitacao}/cancelar`, { motivoCancelamento: m.slice(0, 50) }, ESCOPO_BOLETO);
    await db.from("boletos_inter").update({ motivo_cancelamento: m.slice(0, 300) }).eq("id", b.id);
    // o cancelamento pode levar alguns segundos no Inter
    let sit = b.situacao;
    for (let i = 0; i < 3 && sit !== "CANCELADO"; i++) {
      await esperar(1500);
      try { sit = await atualizarUm(db, b, cli); } catch { /* tenta de novo */ }
    }
    return { ok: true, situacao: sit };
  } finally { cli.fechar(); }
}

/** Aviso do Inter (não é assinado): consulta cada boleto conhecido direto no Inter antes de registrar. */
export async function avisoBoletos(db: SupabaseClient, corpo: unknown, chaves: Chaves) {
  const codigos = codigosDoAviso(corpo);
  if (!codigos.length) return { ok: true, conferidos: 0 };
  const { data } = await db.from("boletos_inter").select("id, conexao_id, conta_receber_id, codigo_solicitacao, situacao").in("codigo_solicitacao", codigos);
  return { ok: true, conferidos: await atualizarLista(db, (data ?? []) as Boleto[], chaves) };
}

/** Confere no Inter os boletos em aberto (rede de segurança do aviso, junto com a atualização do extrato). */
export async function conferirAbertos(db: SupabaseClient, conexaoId: string, chaves: Chaves) {
  const { data } = await db.from("boletos_inter").select("id, conexao_id, conta_receber_id, codigo_solicitacao, situacao")
    .eq("conexao_id", conexaoId).in("situacao", BOLETO_EM_ABERTO).not("codigo_solicitacao", "is", null)
    .order("atualizado_em", { ascending: true }).limit(60);
  return await atualizarLista(db, (data ?? []) as Boleto[], chaves);
}

async function atualizarLista(db: SupabaseClient, lista: Boleto[], chaves: Chaves) {
  let n = 0;
  const porConexao = new Map<string, Boleto[]>();
  for (const b of lista) porConexao.set(b.conexao_id, [...(porConexao.get(b.conexao_id) ?? []), b]);
  for (const [id, bs] of porConexao) {
    let cli: ReturnType<typeof clienteInter>;
    try { cli = await cliente(db, await conexao(db, id), chaves); } catch { continue; }
    try {
      for (const b of bs) {
        try { await atualizarUm(db, b, cli); n++; } catch (e) {
          await db.from("boletos_inter").update({ erro: `Não consegui consultar no Inter: ${e instanceof Error ? e.message : e}`.slice(0, 300) }).eq("id", b.id);
        }
      }
    } finally { cli.fechar(); }
  }
  return n;
}
