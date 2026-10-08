// Revisão da base de produtos: o que deixa o cadastro ambíguo, incompleto ou sem controle de custo e estoque.
// Cada problema traz o porquê; a correção é no próprio cadastro (que valida ao gravar para não voltar).
import type { Produto } from "./types";

/** Unidades de medida padronizadas (código da NF-e e descrição). */
export const UNIDADES: [string, string][] = [
  ["UN", "Unidade"], ["PC", "Peça"], ["CJ", "Conjunto"], ["KIT", "Kit"], ["PAR", "Par"], ["JG", "Jogo"],
  ["CX", "Caixa"], ["PCT", "Pacote"], ["FD", "Fardo"], ["RL", "Rolo"], ["BR", "Barra"], ["GL", "Galão"], ["BD", "Balde"],
  ["KG", "Quilo"], ["G", "Grama"], ["MT", "Metro"], ["M2", "Metro quadrado"], ["M3", "Metro cúbico"], ["L", "Litro"], ["ML", "Mililitro"],
];
/** Grafias diferentes da mesma unidade (o que causa divergência entre cadastros). */
export const SINONIMOS: Record<string, string> = {
  PCS: "PC", "PÇ": "PC", "PÇS": "PC", PECA: "PC", "PEÇA": "PC", UND: "UN", UNID: "UN", UNI: "UN", UNIDADE: "UN",
  M: "MT", MTS: "MT", METRO: "MT", LTS: "L", LITRO: "L", KGS: "KG", KILO: "KG", CXS: "CX", CAIXA: "CX", PCTE: "PCT", KT: "KIT", CONJ: "CJ",
};
const CODIGOS = new Set(UNIDADES.map(([c]) => c));

export type Movimento = { produto_id: string; tipo: string; quantidade: number; created_at: string };
export type ItemProblema = { produto: Produto; detalhe?: string };
export type Problema = {
  id: string; titulo: string; porque: string; gravidade: "alta" | "media" | "baixa"; itens: ItemProblema[];
};

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Mesma descrição escrita de outro jeito: sem acento, pontuação, espaços e ordem das palavras. */
export const chavesDescricao = (d: string) => {
  const palavras = semAcento(d).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  return [palavras.join(""), [...palavras].sort().join(" ")];
};
const dias = (a: string, b: string) => (Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 864e5;

/** Estoque mínimo sugerido: consumo diário × prazo de reposição × 1,5 (segurança). */
export function sugerirMinimo(saidas180: number, prazoDias: number | null | undefined) {
  if (saidas180 <= 0) return 0;
  return Math.ceil((saidas180 / 180) * Math.max(1, Number(prazoDias || 15)) * 1.5);
}

/** Consumo (saídas) dos últimos 180 dias e a data da última saída de cada produto. */
export function resumoMovimentos(movimentos: Movimento[], hoje: string) {
  const r = new Map<string, { saidas180: number; ultimaSaida: string | null }>();
  for (const m of movimentos) {
    if (m.tipo !== "saida") continue;
    const x = r.get(m.produto_id) ?? { saidas180: 0, ultimaSaida: null };
    if (dias(m.created_at, hoje) <= 180) x.saidas180 += Math.abs(Number(m.quantidade));
    if (!x.ultimaSaida || m.created_at > x.ultimaSaida) x.ultimaSaida = m.created_at;
    r.set(m.produto_id, x);
  }
  return r;
}

/** Produtos parecidos com o que está sendo cadastrado (mesmo SKU ou mesma descrição escrita de outro jeito). */
export function parecidos(p: { id?: string; sku?: string | null; descricao?: string | null }, todos: Produto[]) {
  const sku = String(p.sku ?? "").trim().toUpperCase();
  const [k1, k2] = chavesDescricao(String(p.descricao ?? ""));
  if (!sku && !k1) return [];
  return todos.filter((o) => o.id !== p.id && (
    (sku && String(o.sku ?? "").trim().toUpperCase() === sku) ||
    (k1.length >= 4 && (() => { const [o1, o2] = chavesDescricao(o.descricao); return o1 === k1 || o2 === k2; })())
  ));
}

export function avaliarCadastro(produtos: Produto[], opts: {
  comFornecedor: Set<string>; movimentos: Movimento[]; hoje: string;
}): Problema[] {
  const { comFornecedor, hoje } = opts;
  const mov = resumoMovimentos(opts.movimentos, hoje);
  const ativos = produtos.filter((p) => p.ativo !== false);
  const fisicos = ativos.filter((p) => !p.kit);
  const out: Problema[] = [];
  const add = (id: string, titulo: string, porque: string, gravidade: Problema["gravidade"], itens: ItemProblema[]) => out.push({ id, titulo, porque, gravidade, itens });

  // SKU
  add("sem_sku", "Sem código (SKU)", "Sem código único o item é confundido com outro na compra, na venda e no inventário.", "media",
    ativos.filter((p) => !String(p.sku ?? "").trim()).map((produto) => ({ produto })));
  const porSku = new Map<string, Produto[]>();
  for (const p of produtos) { const k = String(p.sku ?? "").trim().toUpperCase(); if (k) porSku.set(k, [...(porSku.get(k) ?? []), p]); }
  add("sku_duplicado", "Código (SKU) repetido", "O mesmo código em dois produtos mistura estoque, custo e vendas.", "alta",
    [...porSku.values()].filter((g) => g.length > 1).flatMap((g) => g.map((produto) => ({ produto, detalhe: `mesmo código de ${g.filter((o) => o.id !== produto.id).map((o) => o.descricao).join(", ")}` }))));

  // descrições iguais escritas de outro jeito (agrupa pelas duas chaves)
  const grupo = new Map<string, string>();
  const raiz = (id: string): string => { const g = grupo.get(id) ?? id; return g === id ? id : raiz(g); };
  const unir = (a: string, b: string) => { const ra = raiz(a), rb = raiz(b); if (ra !== rb) grupo.set(ra, rb); };
  const vistos = new Map<string, string>();
  for (const p of ativos) for (const k of chavesDescricao(p.descricao)) {
    if (k.length < 4) continue;
    const outro = vistos.get(k);
    if (outro) unir(p.id, outro); else vistos.set(k, p.id);
  }
  const grupos = new Map<string, Produto[]>();
  for (const p of ativos) { const r = raiz(p.id); grupos.set(r, [...(grupos.get(r) ?? []), p]); }
  add("descricao_parecida", "Descrição repetida ou quase igual", "Provável cadastro duplicado (abreviação, espaço ou ordem das palavras): una num só e inative o outro.", "alta",
    [...grupos.values()].filter((g) => g.length > 1).flatMap((g) => g.map((produto) => ({ produto, detalhe: `parecido com ${g.filter((o) => o.id !== produto.id).map((o) => o.sku ? `${o.descricao} (${o.sku})` : o.descricao).join(", ")}` }))));

  add("unidade", "Unidade de medida fora do padrão", "A mesma unidade escrita de jeitos diferentes (PC e PCS) atrapalha compra, conversão de embalagem e relatórios.", "media",
    ativos.filter((p) => !CODIGOS.has(String(p.unidade ?? "").toUpperCase())).map((produto) => {
      const u = String(produto.unidade ?? "").toUpperCase();
      return { produto, detalhe: SINONIMOS[u] ? `${u}: use ${SINONIMOS[u]}` : `${u || "vazia"}: unidade não reconhecida` };
    }));

  // custo e preço
  add("custo_zerado", "Sem custo", "Sem custo não dá para calcular margem nem valorizar o estoque.", "media",
    fisicos.filter((p) => !Number(p.preco_custo)).map((produto) => ({ produto })));
  add("preco_zerado", "Sem preço de venda", "Item vendável com preço zero entra no pedido de graça.", "alta",
    ativos.filter((p) => p.vendavel !== false && p.tipo !== "insumo" && !Number(p.preco_venda)).map((produto) => ({ produto })));
  add("abaixo_custo", "Preço abaixo do custo", "Cada venda dá prejuízo: confira o custo e o preço.", "alta",
    ativos.filter((p) => Number(p.preco_venda) > 0 && Number(p.preco_custo) > Number(p.preco_venda))
      .map((produto) => ({ produto, detalhe: `custo ${fmt(produto.preco_custo)} · venda ${fmt(produto.preco_venda)}` })));

  // fiscal, classificação e fornecedor
  add("sem_ncm", "Sem NCM válido", "Sem NCM de 8 dígitos a NF-e é rejeitada.", "alta",
    ativos.filter((p) => p.vendavel !== false && String(p.ncm ?? "").replace(/\D/g, "").length !== 8).map((produto) => ({ produto })));
  add("sem_fornecedor", "Sem fornecedor", "Peças e insumos sem fornecedor preferencial atrasam a reposição.", "baixa",
    fisicos.filter((p) => p.tipo !== "maquina" && !p.fornecedor_padrao_id && !comFornecedor.has(p.id)).map((produto) => ({ produto })));
  add("sem_categoria", "Sem categoria", "A categoria separa os relatórios e organiza a contagem cíclica.", "baixa",
    ativos.filter((p) => !String(p.categoria ?? "").trim()).map((produto) => ({ produto })));
  add("sem_localizacao", "Com estoque e sem localização", "Sem local definido a peça some na hora de separar e de contar.", "baixa",
    fisicos.filter((p) => Number(p.estoque_atual) > 0 && !String(p.localizacao ?? "").trim()).map((produto) => ({ produto })));

  // estoque
  add("estoque_negativo", "Estoque negativo", "Saiu mais do que entrou: falta lançar entrada ou houve baixa errada. Investigue antes de ajustar.", "alta",
    produtos.filter((p) => !p.kit && Number(p.estoque_atual) < 0).map((produto) => ({ produto, detalhe: `saldo ${Number(produto.estoque_atual)} ${produto.unidade}` })));
  add("inativo_com_estoque", "Inativo com saldo", "Produto inativo não aparece para venda, mas o saldo continua no inventário.", "media",
    produtos.filter((p) => p.ativo === false && !p.kit && Number(p.estoque_atual) !== 0).map((produto) => ({ produto, detalhe: `saldo ${Number(produto.estoque_atual)} ${produto.unidade}` })));
  add("parado", "Parado há mais de 180 dias", "Estoque sem saída: capital parado. Promova, devolva ou marque como fora de linha.", "baixa",
    fisicos.filter((p) => {
      if (Number(p.estoque_atual) <= 0) return false;
      const criado = (p as { created_at?: string }).created_at;
      if (criado && dias(criado, hoje) < 180) return false;
      const ult = mov.get(p.id)?.ultimaSaida;
      return !ult || dias(ult, hoje) > 180;
    }).map((produto) => {
      const ult = mov.get(produto.id)?.ultimaSaida;
      return { produto, detalhe: `${Number(produto.estoque_atual)} ${produto.unidade} · ${ult ? `última saída em ${ult.slice(0, 10).split("-").reverse().join("/")}` : "sem saída registrada"}` };
    }));
  add("minimo", "Estoque mínimo sem base no consumo", "O mínimo deve cobrir o consumo durante o prazo do fornecedor, com folga para peças críticas.", "media",
    fisicos.filter((p) => p.tipo !== "maquina" && !p.fora_de_linha).flatMap((produto) => {
      const consumo = mov.get(produto.id)?.saidas180 ?? 0;
      const sugerido = sugerirMinimo(consumo, produto.prazo_reposicao_dias);
      const atual = Number(produto.estoque_minimo);
      if (!sugerido || atual >= sugerido * 0.5) return [];
      return [{ produto, detalhe: `consumo de ${round(consumo / 6)}/mês · mínimo ${atual || "não definido"}, sugerido ${sugerido}` }];
    }));

  const peso = { alta: 0, media: 1, baixa: 2 };
  return out.sort((a, b) => peso[a.gravidade] - peso[b.gravidade]);
}

const round = (n: number) => Math.round(n * 10) / 10;
const fmt = (v: unknown) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
