// Giro do estoque por produto e por categoria: quanto saiu no período (pedidos e notas de venda sem pedido), quanto
// tem hoje, quantas vezes o estoque "girou", para quantos dias ele dá e há quanto tempo o item não vende.
// Tudo a custo do cadastro (preço de custo): é o dinheiro parado na prateleira.

export type ProdutoGiro = {
  id: string; descricao: string; sku?: string | null; categoria?: string | null; tipo?: string | null;
  marcadores?: string[] | null; preco_custo?: number | null; kit?: boolean | null; ativo?: boolean | null; unificado_em?: string | null;
};
export type Saida = { produto_id: string; quantidade: number; data: string };
export type Situacao = "parado" | "lento" | "normal" | "rapido" | "ruptura" | "sem_movimento";

export const SITUACOES: Record<Situacao, { rotulo: string; texto: string; cor: string }> = {
  ruptura: { rotulo: "Faltando", texto: "Vendeu e está sem estoque", cor: "bg-red-100 text-red-800" },
  rapido: { rotulo: "Gira rápido", texto: "Estoque dá para menos de 30 dias", cor: "bg-emerald-100 text-emerald-800" },
  normal: { rotulo: "Normal", texto: "Estoque dá para 30 a 180 dias", cor: "bg-sky-100 text-sky-800" },
  lento: { rotulo: "Lento", texto: "Estoque dá para mais de 6 meses", cor: "bg-amber-100 text-amber-800" },
  parado: { rotulo: "Parado", texto: "Tem estoque e não vendeu no período", cor: "bg-orange-100 text-orange-800" },
  sem_movimento: { rotulo: "Zerado", texto: "Sem estoque e sem venda", cor: "bg-slate-100 text-slate-600" },
};

export type LinhaGiro = {
  id: string; descricao: string; sku: string; categoria: string; tipo: string; custo: number;
  saida: number; saldo: number; valorSaida: number; valorEstoque: number;
  giro: number | null; cobertura: number | null; ultimaSaida: string | null; diasSemVenda: number | null; situacao: Situacao;
};

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const dias = (de: string, ate: string) => Math.round((Date.parse(`${ate.slice(0, 10)}T12:00:00Z`) - Date.parse(`${de.slice(0, 10)}T12:00:00Z`)) / 864e5);
export const categoriaPrincipal = (c?: string | null) => String(c ?? "").split(" > ")[0].trim() || "Sem categoria";

export function situacao(saldo: number, saida: number, cobertura: number | null): Situacao {
  if (saldo <= 0) return saida > 0 ? "ruptura" : "sem_movimento";
  if (saida <= 0) return "parado";
  if (cobertura != null && cobertura < 30) return "rapido";
  if (cobertura != null && cobertura > 180) return "lento";
  return "normal";
}

/**
 * Uma linha por produto (sem serviços, kits nem cadastros unificados). Giro = saída do período ÷ estoque de hoje;
 * cobertura = dias que o estoque de hoje dura no ritmo de saída do período.
 */
export function calcularGiro(produtos: ProdutoGiro[], saldos: Map<string, number>, saidas: Saida[], inicio: string, fim: string): LinhaGiro[] {
  const periodo = Math.max(1, dias(inicio, fim) + 1);
  const somaSaida = new Map<string, number>();
  const ultima = new Map<string, string>();
  for (const s of saidas) {
    const d = s.data.slice(0, 10);
    if (d >= inicio && d <= fim) somaSaida.set(s.produto_id, (somaSaida.get(s.produto_id) ?? 0) + n(s.quantidade));
    if (d <= fim && (!ultima.has(s.produto_id) || ultima.get(s.produto_id)! < d)) ultima.set(s.produto_id, d);
  }
  return produtos
    .filter((p) => !p.kit && !p.unificado_em && p.tipo !== "servico")
    .map((p) => {
      const custo = Math.max(0, n(p.preco_custo));
      const saida = somaSaida.get(p.id) ?? 0;
      const saldo = n(saldos.get(p.id));
      const porDia = saida / periodo;
      const cobertura = saldo > 0 && porDia > 0 ? Math.round(saldo / porDia) : null;
      const u = ultima.get(p.id) ?? null;
      return {
        id: p.id, descricao: p.descricao, sku: p.sku ?? "", categoria: categoriaPrincipal(p.categoria), tipo: p.tipo ?? "",
        custo, saida, saldo, valorSaida: saida * custo, valorEstoque: Math.max(0, saldo) * custo,
        giro: saldo > 0 ? Math.round((saida / saldo) * 10) / 10 : null,
        cobertura, ultimaSaida: u, diasSemVenda: u ? dias(u, fim) : null,
        situacao: situacao(saldo, saida, cobertura),
      };
    });
}

export type TotalGiro = { chave: string; itens: number; saida: number; valorSaida: number; valorEstoque: number; parados: number; valorParado: number; giro: number | null; cobertura: number | null };

/** Totais por categoria (ou geral, com chave fixa): giro e cobertura em valor (custo). */
export function totaisGiro(linhas: LinhaGiro[], inicio: string, fim: string, chave: (l: LinhaGiro) => string = (l) => l.categoria): TotalGiro[] {
  const periodo = Math.max(1, dias(inicio, fim) + 1);
  const m = new Map<string, TotalGiro>();
  for (const l of linhas) {
    const k = chave(l);
    const t = m.get(k) ?? { chave: k, itens: 0, saida: 0, valorSaida: 0, valorEstoque: 0, parados: 0, valorParado: 0, giro: null, cobertura: null };
    t.itens++; t.saida += l.saida; t.valorSaida += l.valorSaida; t.valorEstoque += l.valorEstoque;
    if (l.situacao === "parado") { t.parados++; t.valorParado += l.valorEstoque; }
    m.set(k, t);
  }
  for (const t of m.values()) {
    t.giro = t.valorEstoque > 0 ? Math.round((t.valorSaida / t.valorEstoque) * 10) / 10 : null;
    t.cobertura = t.valorSaida > 0 && t.valorEstoque > 0 ? Math.round(t.valorEstoque / (t.valorSaida / periodo)) : null;
  }
  return [...m.values()].sort((a, b) => b.valorEstoque - a.valorEstoque);
}
