// Perguntar à IA: a busca no banco a partir dos filtros que a IA devolveu (ver ia-busca.ts). Roda com o cliente do
// Supabase com o login de quem perguntou. Sem imports do Deno, para os testes conferirem as consultas.
import type { FiltrosBusca } from "./ia-busca.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
const LIMITE = 50;
export type Achado = { tipo: string; id: string; titulo: string; sub: string | null; valor: number | null; data: string | null };

export const hojeISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const somarDias = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** texto seguro dentro de um filtro "or" do PostgREST (sem vírgula, parênteses nem curingas) */
const limpo = (t: string) => t.replace(/[,()%*\\]/g, " ").replace(/\s+/g, " ").trim();
const nomeDe = (c: { nome?: string | null; nome_fantasia?: string | null } | null | undefined) => c?.nome_fantasia || c?.nome || "—";
const ondeDe = (c: { municipio?: string | null; uf?: string | null } | null | undefined) => [c?.municipio, c?.uf].filter(Boolean).join("/") || null;
const juntar = (...p: (string | null | undefined | false)[]) => p.filter(Boolean).join(" · ") || null;

/** ids pelo nome (cliente ou fornecedor), para filtrar as tabelas que só guardam o id */
async function idsPorNome(db: Db, tabela: "clientes" | "fornecedores", t: string): Promise<string[]> {
  const { data } = await db.from(tabela).select("id").or(`nome.ilike.%${t}%,nome_fantasia.ilike.%${t}%`).limit(200);
  return (data ?? []).map((r: { id: string }) => r.id);
}

function ordenar(q: any, f: FiltrosBusca, data: string, valor: string | null) {
  if (f.ordem === "maior_valor" && valor) return q.order(valor, { ascending: false, nullsFirst: false });
  if (f.ordem === "menor_valor" && valor) return q.order(valor, { ascending: true, nullsFirst: false });
  return q.order(data, { ascending: f.ordem === "antigos", nullsFirst: false });
}
const periodo = (q: any, f: FiltrosBusca, col: string, dataHora = false) => {
  if (f.de) q = q.gte(col, f.de);
  if (f.ate) q = dataHora ? q.lt(col, somarDias(f.ate, 1)) : q.lte(col, f.ate);
  return q;
};
const faixa = (q: any, f: FiltrosBusca, col: string) => {
  if (f.valor_min !== null) q = q.gte(col, f.valor_min);
  if (f.valor_max !== null) q = q.lte(col, f.valor_max);
  return q;
};

/** Colunas que a Perguntar à IA lê: nunca CPF/CNPJ, telefone, e-mail, salário nem a carteira pessoal (conferido nos testes). */
export const SEM_DADOS_PESSOAIS = /cpf|cnpj|telefone|whatsapp|email|salario|pessoal/i;

/**
 * unidadeId: a unidade da MF (Matriz SC ou Filial SP) que vale nesta busca, a pedida na pergunta ou a escolhida na tela;
 * null = todas. Vale para o que tem unidade (vendas, OS, contas, notas e máquinas); clientes e produtos são das duas.
 */
export async function buscar(db: Db, f: FiltrosBusca, unidadeId: string | null = null): Promise<Achado[]> {
  const hoje = hojeISO();
  const daUnidade = (q: any) => (unidadeId ? q.eq("unidade_id", unidadeId) : q);
  const t = f.texto ? limpo(f.texto) : "";
  const local = !!(f.uf || f.cidade);
  const doLocal = (q: any, rel: string) => {
    if (f.uf) q = q.eq(`${rel}.uf`, f.uf);
    if (f.cidade) q = q.ilike(`${rel}.municipio`, `%${limpo(f.cidade)}%`);
    return q;
  };

  if (f.entidade === "vendas") {
    let q = db.from("pedidos").select(`id, numero, status, valor_total, created_at, cliente:clientes${t || local ? "!inner" : ""}(nome, nome_fantasia, municipio, uf)`).is("excluida_em", null);
    q = daUnidade(q);
    if (t) q = q.or(`nome.ilike.%${t}%,nome_fantasia.ilike.%${t}%`, { referencedTable: "cliente" });
    q = doLocal(q, "cliente");
    if (f.situacao) q = q.eq("status", f.situacao);
    q = faixa(periodo(q, f, "created_at", true), f, "valor_total");
    const { data, error } = await ordenar(q, f, "created_at", "valor_total").limit(LIMITE);
    if (error) throw error;
    return (data ?? []).map((p: any) => ({ tipo: "venda", id: p.id, titulo: `Venda #${p.numero} · ${nomeDe(p.cliente)}`, sub: juntar(p.status, ondeDe(p.cliente)), valor: Number(p.valor_total), data: p.created_at }));
  }

  if (f.entidade === "clientes") {
    let q = db.from("clientes").select("id, codigo, nome, nome_fantasia, municipio, uf, created_at").is("arquivado_em", null);
    if (t) q = q.or(`nome.ilike.%${t}%,nome_fantasia.ilike.%${t}%`);
    if (f.uf) q = q.eq("uf", f.uf);
    if (f.cidade) q = q.ilike("municipio", `%${limpo(f.cidade)}%`);
    if (f.sem_compra_desde) {
      // compraram antes e não compraram desde a data
      const vendas = async (op: "gte" | "lt") => {
        const ids = new Set<string>();
        for (let de = 0; ; de += 1000) {
          const { data } = await db.from("pedidos").select("cliente_id").is("excluida_em", null).not("status", "in", "(orcamento,cancelado)")
            .not("cliente_id", "is", null)[op]("created_at", f.sem_compra_desde!).range(de, de + 999);
          (data ?? []).forEach((r: { cliente_id: string }) => ids.add(r.cliente_id));
          if ((data?.length ?? 0) < 1000) return ids;
        }
      };
      const [depois, antes] = await Promise.all([vendas("gte"), vendas("lt")]);
      const parados = [...antes].filter((id) => !depois.has(id)).slice(0, 300);
      if (!parados.length) return [];
      q = q.in("id", parados);
    }
    const { data, error } = await q.order("nome").limit(LIMITE);
    if (error) throw error;
    return (data ?? []).map((c: any) => ({ tipo: "cliente", id: c.id, titulo: nomeDe(c), sub: juntar(c.codigo && `cód. ${c.codigo}`, ondeDe(c)), valor: null, data: null }));
  }

  if (f.entidade === "maquinas") {
    let q = daUnidade(db.from("equipamentos").select(`id, descricao, numero_serie, data_venda, garantia_ate, proxima_preventiva, origem, cliente:clientes${local ? "!inner" : ""}(nome, nome_fantasia, municipio, uf)`));
    if (f.empresa === "my_frost") q = q.eq("origem", "My Frost");
    if (f.empresa === "mf") q = q.or("origem.is.null,origem.neq.My Frost");
    if (t) {
      const ids = await idsPorNome(db, "clientes", t);
      q = q.or([`descricao.ilike.%${t}%`, `numero_serie.ilike.%${t}%`, ids.length ? `cliente_id.in.(${ids.join(",")})` : ""].filter(Boolean).join(","));
    }
    q = doLocal(q, "cliente");
    if (f.garantia === "vigente") q = q.gte("garantia_ate", hoje);
    if (f.garantia === "vencida") q = q.lt("garantia_ate", hoje);
    if (f.garantia === "vence_30") q = q.gte("garantia_ate", hoje).lte("garantia_ate", somarDias(hoje, 30));
    if (f.preventiva === "vencida") q = q.lt("proxima_preventiva", hoje);
    if (f.preventiva === "sem") q = q.is("proxima_preventiva", null);
    if (f.preventiva === "proximos_30") q = q.gte("proxima_preventiva", hoje).lte("proxima_preventiva", somarDias(hoje, 30));
    q = periodo(q, f, "data_venda");
    const { data, error } = await ordenar(q, f, "data_venda", null).limit(LIMITE);
    if (error) throw error;
    return (data ?? []).map((e: any) => ({
      tipo: "maquina", id: e.id, titulo: `${e.descricao}${e.numero_serie ? ` · nº ${e.numero_serie}` : ""}`,
      sub: juntar(e.origem === "My Frost" && "My Frost", nomeDe(e.cliente), ondeDe(e.cliente), e.garantia_ate && `garantia até ${e.garantia_ate.split("-").reverse().join("/")}`,
        e.proxima_preventiva ? `preventiva ${e.proxima_preventiva.split("-").reverse().join("/")}` : "sem preventiva"),
      valor: null, data: e.data_venda,
    }));
  }

  if (f.entidade === "os") {
    let q = db.from("ordens_servico").select(`id, numero, status, equipamento, numero_serie, data_entrada, valor_total, cliente:clientes${local ? "!inner" : ""}(nome, nome_fantasia, municipio, uf)`).is("excluida_em", null);
    q = daUnidade(q);
    if (t) {
      const ids = await idsPorNome(db, "clientes", t);
      q = q.or([`equipamento.ilike.%${t}%`, `numero_serie.ilike.%${t}%`, ids.length ? `cliente_id.in.(${ids.join(",")})` : ""].filter(Boolean).join(","));
    }
    q = doLocal(q, "cliente");
    if (f.situacao) q = q.eq("status", f.situacao);
    q = faixa(periodo(q, f, "data_entrada"), f, "valor_total");
    const { data, error } = await ordenar(q, f, "data_entrada", "valor_total").limit(LIMITE);
    if (error) throw error;
    return (data ?? []).map((o: any) => ({ tipo: "os", id: o.id, titulo: `OS #${o.numero} · ${nomeDe(o.cliente)}`, sub: juntar(o.equipamento, String(o.status ?? "").replace(/_/g, " ")), valor: o.valor_total ? Number(o.valor_total) : null, data: o.data_entrada }));
  }

  if (f.entidade === "receber" || f.entidade === "pagar") {
    const receber = f.entidade === "receber";
    const rel = receber ? "cliente:clientes(nome, nome_fantasia)" : "fornecedor:fornecedores(nome, nome_fantasia)";
    let q = daUnidade(db.from(receber ? "contas_receber" : "contas_pagar").select(`id, descricao, valor, vencimento, status, data_pagamento, ${rel}`));
    if (t) {
      const ids = await idsPorNome(db, receber ? "clientes" : "fornecedores", t);
      q = q.or([`descricao.ilike.%${t}%`, ids.length ? `${receber ? "cliente_id" : "fornecedor_id"}.in.(${ids.join(",")})` : ""].filter(Boolean).join(","));
    }
    if (f.situacao === "vencido" || f.situacao === "vencida") q = q.eq("status", "aberto").lt("vencimento", hoje);
    else if (f.situacao) q = q.eq("status", f.situacao === "aberta" ? "aberto" : f.situacao === "paga" ? "pago" : f.situacao);
    q = faixa(periodo(q, f, "vencimento"), f, "valor");
    const { data, error } = await ordenar(q, f, "vencimento", "valor").limit(LIMITE);
    if (error) throw error;
    return (data ?? []).map((c: any) => ({
      tipo: f.entidade, id: c.id, titulo: c.descricao || "(sem descrição)",
      sub: juntar(nomeDe(receber ? c.cliente : c.fornecedor), c.status, c.vencimento && `vence ${c.vencimento.split("-").reverse().join("/")}`), valor: Number(c.valor), data: c.vencimento,
    }));
  }

  if (f.entidade === "notas") {
    let q = db.from("notas_fiscais").select(`id, numero, status, valor_total, created_at, destinatario_nome, cliente:clientes${local ? "!inner" : ""}(nome, municipio, uf)`).is("excluida_em", null);
    q = daUnidade(q);
    if (t) q = q.ilike("destinatario_nome", `%${t}%`);
    q = doLocal(q, "cliente");
    if (f.situacao) q = q.eq("status", f.situacao);
    q = faixa(periodo(q, f, "created_at", true), f, "valor_total");
    const { data, error } = await ordenar(q, f, "created_at", "valor_total").limit(LIMITE);
    if (error) throw error;
    return (data ?? []).map((n: any) => ({ tipo: "nota", id: n.id, titulo: `NF-e ${n.numero ?? "(sem número)"} · ${n.destinatario_nome ?? nomeDe(n.cliente)}`, sub: juntar(n.status, ondeDe(n.cliente)), valor: Number(n.valor_total), data: n.created_at }));
  }

  // produtos
  let q = db.from("produtos").select("id, sku, descricao, tipo, estoque_atual, estoque_minimo, preco_venda, ativo").eq("ativo", true);
  if (t) q = q.or(`descricao.ilike.%${t}%,sku.ilike.%${t}%`);
  if (f.estoque === "zerado") q = q.lte("estoque_atual", 0);
  if (f.estoque === "abaixo_minimo") q = q.gt("estoque_minimo", 0);
  q = faixa(q, f, "preco_venda");
  const { data, error } = await q.order("descricao").limit(f.estoque === "abaixo_minimo" ? 1000 : LIMITE);
  if (error) throw error;
  return (data ?? [])
    .filter((p: any) => f.estoque !== "abaixo_minimo" || Number(p.estoque_atual) <= Number(p.estoque_minimo))
    .slice(0, LIMITE)
    .map((p: any) => ({ tipo: "produto", id: p.id, titulo: p.descricao, sub: juntar(p.sku, p.tipo, `estoque ${Number(p.estoque_atual).toLocaleString("pt-BR")}`, Number(p.estoque_minimo) > 0 && `mínimo ${Number(p.estoque_minimo).toLocaleString("pt-BR")}`), valor: p.preco_venda ? Number(p.preco_venda) : null, data: null }));
}

