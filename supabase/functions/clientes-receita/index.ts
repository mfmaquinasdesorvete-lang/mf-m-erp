// Confere clientes e fornecedores com CNPJ na Receita (dados públicos): situação do CNPJ, inscrição estadual,
// endereço, telefone e e-mail. Preenche o que está vazio e marca as diferenças (ver _shared/receita.ts).
// POST { acao: "lote" }                                  -> agendamento (a cada minuto): clientes, depois fornecedores
// POST { acao: "um", cliente_id | fornecedor_id }        -> botão da ficha: confere um agora
// POST { acao: "situacao", tabela? }                     -> quantos já foram conferidos
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, onlyDigits, requireErpUser } from "../_shared/supabase.ts";
import { chamadaDoAgendamento } from "../_shared/cron.ts";
import { conciliarCliente, daBrasilApi, type DadosReceita, doCnpjWs } from "../_shared/receita.ts";

const POR_LOTE = 3;          // a consulta pública do CNPJ.ws aceita 3 por minuto
const ESPERA_MS = 20_000;

async function buscar(url: string) {
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (r.status === 429) throw new HttpError(429, "limite de consultas da Receita atingido; continua no próximo minuto");
  return r.ok ? await r.json() : null;
}

/** CNPJ.ws (com inscrição estadual) e, se não responder, BrasilAPI (sem inscrição estadual). */
export async function consultar(cnpj: string): Promise<DadosReceita | null> {
  let dados: DadosReceita | null = null;
  try { dados = doCnpjWs(await buscar(`https://publica.cnpj.ws/cnpj/${cnpj}`)); } catch (e) { if ((e as HttpError).status === 429) throw e; }
  if (!dados) {
    try { dados = daBrasilApi(await buscar(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)); } catch { /* sem resposta */ }
  }
  return dados ? { ...dados, consultado_em: new Date().toISOString() } : null;
}

type Tabela = "clientes" | "fornecedores";

async function conferir(db: ReturnType<typeof adminClient>, c: any, tabela: Tabela = "clientes") {
  const cnpj = onlyDigits(tabela === "clientes" ? c.cpf_cnpj : c.cnpj);
  const r = await consultar(cnpj);
  if (!r) {
    // CNPJ que a Receita não conhece: marca a consulta para não tentar toda hora
    await db.from(tabela).update({ receita_em: new Date().toISOString(), receita_situacao: "NAO_ENCONTRADO" }).eq("id", c.id);
    return { id: c.id, situacao: "NAO_ENCONTRADO" };
  }
  const x = conciliarCliente(c, r);
  const atualizar = { ...x.atualizar } as Record<string, unknown>;
  if (tabela === "fornecedores") delete atualizar.contribuinte_icms; // fornecedor não tem esse campo
  const { error } = await db.from(tabela).update({
    ...atualizar, tags: x.tags, receita: r, receita_situacao: x.receita_situacao, ie_situacao: x.ie_situacao, receita_em: new Date().toISOString(),
  }).eq("id", c.id);
  if (error) throw new HttpError(400, error.message);
  return { id: c.id, situacao: x.receita_situacao, ie: x.ie_situacao, preenchidos: Object.keys(x.atualizar), etiquetas: x.tags };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();
  try {
    const body = await req.json().catch(() => ({}));
    const agendamento = await chamadaDoAgendamento(req);
    if (!agendamento) await requireErpUser(req, ["vendas", "financeiro"]);
    const campos = "id, nome, nome_fantasia, cpf_cnpj, email, telefone, whatsapp, inscricao_estadual, contribuinte_icms, cep, logradouro, numero, complemento, bairro, municipio, uf, tags";

    const camposForn = "id, nome, nome_fantasia, cnpj, email, telefone, whatsapp, inscricao_estadual, cep, logradouro, numero, complemento, bairro, municipio, uf, tags";

    if (body.acao === "um") {
      if (body.fornecedor_id) {
        const { data: f } = await db.from("fornecedores").select(camposForn).eq("id", body.fornecedor_id).maybeSingle();
        if (!f) throw new HttpError(404, "fornecedor não encontrado");
        if (onlyDigits(f.cnpj).length !== 14) throw new HttpError(400, "só dá para conferir na Receita quem tem CNPJ");
        return json({ ok: true, resultado: await conferir(db, f, "fornecedores") });
      }
      const { data: c } = await db.from("clientes").select(campos).eq("id", body.cliente_id).maybeSingle();
      if (!c) throw new HttpError(404, "cliente não encontrado");
      if (onlyDigits(c.cpf_cnpj).length !== 14) throw new HttpError(400, "só dá para conferir na Receita quem tem CNPJ");
      return json({ ok: true, resultado: await conferir(db, c) });
    }

    if (body.acao === "situacao") {
      const forn = body.tabela === "fornecedores";
      const { data } = await db.from(forn ? "fornecedores" : "clientes").select(`${forn ? "cnpj" : "cpf_cnpj"}, receita_em, receita_situacao, ie_situacao, tags`);
      const comCnpj = (data ?? []).filter((c: any) => onlyDigits(forn ? c.cnpj : c.cpf_cnpj).length === 14);
      return json({
        ok: true, com_cnpj: comCnpj.length, conferidos: comCnpj.filter((c: any) => c.receita_em).length,
        irregulares: comCnpj.filter((c: any) => (c.tags ?? []).includes("cnpj_irregular")).length,
        ie_baixada: comCnpj.filter((c: any) => (c.tags ?? []).includes("ie_baixada")).length,
        endereco_diferente: comCnpj.filter((c: any) => (c.tags ?? []).includes("endereco_receita")).length,
      });
    }

    // lote: os que nunca foram conferidos primeiro, depois os mais antigos
    // clientes primeiro; sobrando vaga no lote, fornecedores
    const { data: filaCli, error: erroFila } = await db.rpc("clientes_para_receita", { p_limite: POR_LOTE });
    if (erroFila) throw new HttpError(400, erroFila.message);
    const fila: { tabela: Tabela; reg: any }[] = (filaCli ?? []).map((reg: any) => ({ tabela: "clientes" as Tabela, reg }));
    if (fila.length < POR_LOTE) {
      const { data: filaForn } = await db.rpc("fornecedores_para_receita", { p_limite: POR_LOTE - fila.length });
      fila.push(...(filaForn ?? []).map((reg: any) => ({ tabela: "fornecedores" as Tabela, reg })));
    }
    const feitos = [];
    for (let i = 0; i < fila.length; i++) {
      if (i) await new Promise((r) => setTimeout(r, ESPERA_MS));
      try { feitos.push({ tabela: fila[i].tabela, ...(await conferir(db, fila[i].reg, fila[i].tabela)) }); } catch (e) {
        if ((e as HttpError).status === 429) break;
        feitos.push({ tabela: fila[i].tabela, id: fila[i].reg.id, erro: (e as Error).message });
      }
    }
    return json({ ok: true, conferidos: feitos.length, feitos });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
