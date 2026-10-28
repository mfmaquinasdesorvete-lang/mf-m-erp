// Auditor financeiro: rodada diária (agendamento às 07:03 de Brasília) ou "Rodar agora" (financeiro).
// Só leitura dos dados da empresa: lê contas, extratos, pedidos e formas de pagamento, faz as mesmas conferências da tela
// (_shared/auditor.ts) e grava só em auditor_rodadas e auditor_achados (achado novo = chave que nunca apareceu).
// Sem IA e sem aviso externo: o resumo fica na última linha de auditor_rodadas, que o FAZ lê para o aviso da manhã.
// POST {} -> { rodada, total, novos, principal }
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { chamadaDoAgendamento } from "../_shared/cron.ts";
import { conferenciasAuditor, CORTE_AUDITOR, resumoRodada, type AchadoAuditor } from "../_shared/auditor.ts";

type Db = ReturnType<typeof adminClient>;
const PAGINA = 1000;

/** Todas as linhas (o Supabase devolve no máximo 1000 por consulta). */
async function todas<T>(db: Db, tabela: string, select: string, filtro?: (q: any) => any, ordem = "id"): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    let q = db.from(tabela).select(select).order(ordem).range(de, de + PAGINA - 1);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new HttpError(500, `${tabela}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGINA) return out;
  }
}

const hojeBrasilia = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const mesesAntes = (dia: string, n: number) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 10); };

async function rodar(db: Db, origem: string) {
  const { data: rodada, error: e0 } = await db.from("auditor_rodadas").insert({ origem }).select("id").single();
  if (e0) throw new HttpError(500, e0.message);
  try {
    const hoje = hojeBrasilia();
    // despesa fora do padrão compara com os 6 meses anteriores ao corte
    const desde = mesesAntes(CORTE_AUDITOR, 7);
    const [receber, pagar, lancamentos, bancos, importacoes, pedidos, formas, fornecedores] = await Promise.all([
      todas<any>(db, "contas_receber", "id, descricao, valor, vencimento, status, data_pagamento, valor_pago, pedido_id, forma_pagamento, conta_bancaria_id"),
      todas<any>(db, "contas_pagar", "id, descricao, valor, vencimento, status, data_pagamento, valor_pago, fornecedor_id, categoria, conta_bancaria_id",
        (q) => q.or(`vencimento.gte.${desde},data_pagamento.gte.${desde}`)),
      todas<any>(db, "extrato_lancamentos", "id, conta_bancaria_id, data, valor, status, descricao, conta_receber_id, conta_pagar_id, par_transferencia_id, observacao, origem, importacao_id"),
      todas<any>(db, "contas_bancarias", "id, nome, ativo, banco"),
      todas<any>(db, "extrato_importacoes", "id, conta_bancaria_id, periodo_inicio, periodo_fim, arquivo, created_at"),
      todas<any>(db, "pedidos", "id, numero, status, valor_total, origem, created_at, nf_outra_numero"),
      todas<any>(db, "formas_pagamento", "id, meio, taxa_percentual, tarifa_fixa, conta_bancaria_id, ativo"),
      todas<any>(db, "fornecedores", "id, nome"),
    ]);
    const achados = conferenciasAuditor({ receber, pagar, lancamentos, bancos, importacoes, pedidos, formas, fornecedores, hoje });

    const vistas = new Set((await todas<{ chave: string }>(db, "auditor_achados", "chave", undefined, "chave")).map((a) => a.chave));
    const r = resumoRodada(achados, vistas);
    const agora = new Date().toISOString();
    const linha = (a: AchadoAuditor) => ({
      chave: a.chave, tipo: a.tipo, gravidade: a.gravidade, titulo: a.titulo, detalhe: a.detalhe, valor: a.valor ?? null,
      data: a.data ?? null, link: a.link, ultima_vez: agora, ultima_rodada: rodada.id, ativo: true,
    });
    const novos = new Set(r.novos.map((a) => a.chave));
    const inserir = achados.filter((a) => novos.has(a.chave)).map((a) => ({ ...linha(a), primeira_vez: agora, primeira_rodada: rodada.id }));
    const atualizar = achados.filter((a) => !novos.has(a.chave)).map(linha);
    for (let i = 0; i < inserir.length; i += 500) {
      const { error } = await db.from("auditor_achados").insert(inserir.slice(i, i + 500));
      if (error) throw new HttpError(500, error.message);
    }
    for (let i = 0; i < atualizar.length; i += 500) {
      const { error } = await db.from("auditor_achados").upsert(atualizar.slice(i, i + 500), { onConflict: "chave" });
      if (error) throw new HttpError(500, error.message);
    }
    // o que não apareceu nesta rodada sumiu (foi corrigido ou deixou de valer)
    const { error: e2 } = await db.from("auditor_achados").update({ ativo: false }).eq("ativo", true).neq("ultima_rodada", rodada.id);
    if (e2) throw new HttpError(500, e2.message);

    const fim = {
      terminada_em: new Date().toISOString(), total: r.total, novos: r.novos.length, principal: r.principal,
      novos_alta: r.novosPorGravidade.alta, novos_media: r.novosPorGravidade.media, novos_baixa: r.novosPorGravidade.baixa,
    };
    await db.from("auditor_rodadas").update(fim).eq("id", rodada.id);
    return { rodada: rodada.id, total: r.total, novos: r.novos.length, principal: r.principal };
  } catch (e) {
    await db.from("auditor_rodadas").update({ terminada_em: new Date().toISOString(), erro: e instanceof Error ? e.message : String(e) }).eq("id", rodada.id);
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const agendamento = await chamadaDoAgendamento(req);
    if (!agendamento) await requireErpUser(req, ["financeiro"]);
    return json(await rodar(adminClient(), agendamento ? "agendamento" : "manual"));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: e instanceof Error ? e.message : String(e) }, status);
  }
});
