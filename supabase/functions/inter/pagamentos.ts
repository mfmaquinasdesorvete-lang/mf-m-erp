// Boletos pagos ou agendados no Banco Inter × contas a pagar (pedido de 24/10), chamado pela função inter (index.ts):
//  pagamentos_boleto { conexao_id, dias? }  (financeiro) → lê no Inter os pagamentos de boleto dos últimos `dias` (30 por
//       padrão) até 60 dias à frente, casa com as contas a pagar em aberto (_shared/inter-pagamentos.ts) e dá a baixa nas
//       pagas (baixar_conta, com o login de quem pediu e a conta bancária do Inter). Agendados e sem par só voltam na lista.
//  A API do Inter não traz o DDA (boletos a pagar emitidos contra o CNPJ): só o que foi pago ou agendado pela conta.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { HttpError } from "../_shared/supabase.ts";
import { type ChavesInter, clienteInter, hojeSP, somarDias } from "../_shared/inter.ts";
import { casarPagamentos, type ContaAberta, ESCOPO_PAGAMENTO_BOLETO, lerPagamento } from "../_shared/inter-pagamentos.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Chaves = (db: SupabaseClient, id: string) => Promise<ChavesInter | null>;

const comoUsuario = (req: Request) => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
  { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });

export async function buscarPagamentosBoleto(req: Request, db: SupabaseClient, b: Record<string, unknown>, chaves: Chaves) {
  const conexaoId = String(b.conexao_id ?? "");
  if (!UUID.test(conexaoId)) throw new HttpError(400, "conta do Inter inválida");
  const { data: conexao } = await db.from("inter_conexoes").select("id, conta_bancaria_id, conta_corrente").eq("id", conexaoId).neq("status", "desligada").maybeSingle();
  if (!conexao) throw new HttpError(404, "conta do Inter não encontrada");
  const ch = await chaves(db, conexao.id);
  if (!ch) throw new HttpError(400, "As credenciais do app do Inter não estão guardadas: ligue a conta de novo em Bancos e conciliação.");

  const hoje = hojeSP();
  const dias = Math.min(Math.max(Number(b.dias) || 30, 1), 89);
  const q = new URLSearchParams({ dataInicio: somarDias(hoje, -dias), dataFim: somarDias(hoje, 60) });
  const inter = clienteInter(ch, conexao.conta_corrente);
  let lista: Record<string, unknown>[];
  try {
    const r = await inter.pedir<unknown>("GET", `/banking/v2/pagamento?${q}`, undefined, ESCOPO_PAGAMENTO_BOLETO);
    lista = Array.isArray(r) ? r : ((r as { pagamentos?: unknown[]; content?: unknown[] })?.pagamentos ?? (r as { content?: unknown[] })?.content ?? []) as Record<string, unknown>[];
  } finally { inter.fechar(); }
  const pagamentos = lista.map(lerPagamento).filter((p) => p.situacao !== "outro");

  const { data: abertas } = await db.from("contas_pagar").select("id, descricao, valor, vencimento, linha_digitavel, fornecedor:fornecedores(cnpj)")
    .eq("status", "aberto").gte("vencimento", somarDias(hoje, -120)).lte("vencimento", somarDias(hoje, 90));
  const contas: ContaAberta[] = (abertas ?? []).map((c) => ({
    id: c.id, descricao: c.descricao, valor: Number(c.valor), vencimento: c.vencimento, linha_digitavel: c.linha_digitavel,
    documento_fornecedor: (c.fornecedor as { cnpj?: string | null } | null)?.cnpj ?? null,
  }));
  const casados = casarPagamentos(pagamentos, contas);

  const usuario = comoUsuario(req);
  const resultado = [];
  for (const k of casados) {
    let baixa: string | null = null;
    if (k.conta && k.pagamento.situacao === "pago") {
      const { error } = await usuario.rpc("baixar_conta", {
        p_tabela: "contas_pagar", p_id: k.conta.id, p_data: k.pagamento.pago_em ?? hoje, p_valor: k.pagamento.valor || k.conta.valor,
        p_conta_bancaria: conexao.conta_bancaria_id, p_restante_vencimento: null,
      });
      baixa = error ? `não deu baixa: ${error.message}` : "baixada";
    }
    resultado.push({ ...k.pagamento, conta_id: k.conta?.id ?? null, conta: k.conta?.descricao ?? null, por: k.por, ambiguo: !!k.ambiguo, baixa });
  }
  return { ok: true, periodo: { de: q.get("dataInicio"), ate: q.get("dataFim") }, pagamentos: resultado };
}
