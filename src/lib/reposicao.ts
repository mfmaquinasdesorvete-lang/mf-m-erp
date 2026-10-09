// Reposição de estoque: o que comprar, quanto e de quem, pelo consumo real (saídas dos últimos 90 dias),
// prazo do fornecedor, estoque mínimo/máximo e o que já está a caminho em pedidos de compra.
//
// Ponto de reposição = maior entre o estoque mínimo e consumo diário × prazo × 1,5 (folga de segurança).
// Repor até: estoque máximo (se cadastrado) ou ponto + 30 dias de consumo. Respeita a compra mínima.
import type { Produto } from "./types";

export type MovimentoRep = { produto_id: string; tipo: string; quantidade: number; created_at: string; referencia_tipo?: string | null };
export type AbertoCompra = { produto_id: string; quantidade: number; quantidade_recebida?: number | null };
export type VinculoFornecedor = { produto_id: string; fornecedor_id: string };

export type Sugestao = {
  produto: Produto; consumoDia: number; saidas90: number; prazo: number; ponto: number; alvo: number;
  aCaminho: number; disponivel: number; sugerido: number; coberturaDias: number | null;
  motivo: "zerado" | "abaixo_minimo" | "ponto_reposicao"; critico: boolean; fornecedor_id: string | null; custo: number; valor: number;
};

const dias = (a: string, b: string) => (Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 864e5;
const r2 = (n: number) => Math.round(n * 100) / 100;
export const PRAZO_PADRAO = 15;
export const COBERTURA_DIAS = 30;

export function sugerirReposicao(produtos: Produto[], opc: {
  movimentos: MovimentoRep[]; abertos: AbertoCompra[]; vinculos: VinculoFornecedor[]; hoje: string; coberturaDias?: number;
}): Sugestao[] {
  const cobertura = opc.coberturaDias ?? COBERTURA_DIAS;
  const saidas = new Map<string, number>();
  for (const m of opc.movimentos) {
    // transferência entre unidades não é consumo
    if (m.tipo !== "saida" || m.referencia_tipo === "transferencia" || dias(m.created_at, opc.hoje) > 90) continue;
    saidas.set(m.produto_id, (saidas.get(m.produto_id) ?? 0) + Math.abs(Number(m.quantidade)));
  }
  const caminho = new Map<string, number>();
  for (const a of opc.abertos) caminho.set(a.produto_id, (caminho.get(a.produto_id) ?? 0) + Math.max(0, Number(a.quantidade) - Number(a.quantidade_recebida ?? 0)));
  const fornecedorDe = new Map<string, string>();
  for (const v of opc.vinculos) if (!fornecedorDe.has(v.produto_id)) fornecedorDe.set(v.produto_id, v.fornecedor_id);

  const out: Sugestao[] = [];
  for (const p of produtos) {
    // máquina é produzida (ordem de produção); kit baixa os componentes; sob encomenda só se compra com pedido
    if (p.ativo === false || p.kit || p.fora_de_linha || p.sob_encomenda || p.tipo === "maquina") continue;
    const saidas90 = saidas.get(p.id) ?? 0;
    const consumoDia = saidas90 / 90;
    const minimo = Math.max(0, Number(p.estoque_minimo) || 0);
    if (!minimo && !consumoDia) continue;
    const prazo = Math.max(1, Number(p.prazo_reposicao_dias) || PRAZO_PADRAO);
    const ponto = Math.max(minimo, Math.ceil(consumoDia * prazo * 1.5));
    const estoque = Number(p.estoque_atual) || 0;
    const aCaminho = caminho.get(p.id) ?? 0;
    const disponivel = estoque + aCaminho;
    if (disponivel > ponto) continue;
    const maximo = Number(p.estoque_maximo) || 0;
    const alvo = maximo > ponto ? maximo : ponto + Math.max(Math.ceil(consumoDia * cobertura), consumoDia ? 0 : minimo);
    const sugerido = Math.max(Math.ceil(alvo - disponivel), Number(p.compra_minima) || 0, 1);
    const coberturaDias = consumoDia > 0 ? Math.max(0, Math.floor(estoque / consumoDia)) : null;
    const motivo = estoque <= 0 ? "zerado" : estoque < minimo ? "abaixo_minimo" : "ponto_reposicao";
    const custo = Number(p.preco_custo) || 0;
    out.push({
      produto: p, consumoDia, saidas90, prazo, ponto, alvo, aCaminho, disponivel, sugerido, coberturaDias, motivo,
      critico: estoque <= 0 || (coberturaDias !== null && coberturaDias < prazo),
      fornecedor_id: p.fornecedor_padrao_id ?? fornecedorDe.get(p.id) ?? null, custo, valor: r2(custo * sugerido),
    });
  }
  const peso = { zerado: 0, abaixo_minimo: 1, ponto_reposicao: 2 };
  return out.sort((a, b) => Number(b.critico) - Number(a.critico) || peso[a.motivo] - peso[b.motivo] || a.produto.descricao.localeCompare(b.produto.descricao));
}

/** Agrupa as sugestões por fornecedor (um pedido de compra por fornecedor). */
export function porFornecedor(sugestoes: Sugestao[]) {
  const g = new Map<string, Sugestao[]>();
  for (const s of sugestoes) g.set(s.fornecedor_id ?? "", [...(g.get(s.fornecedor_id ?? "") ?? []), s]);
  return [...g].map(([fornecedor_id, itens]) => ({ fornecedor_id: fornecedor_id || null, itens, valor: r2(itens.reduce((t, i) => t + i.valor, 0)) }))
    .sort((a, b) => Number(!a.fornecedor_id) - Number(!b.fornecedor_id) || b.itens.filter((i) => i.critico).length - a.itens.filter((i) => i.critico).length);
}
