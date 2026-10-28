// Vendas que só existem como NF-e (importadas do Tiny ou emitidas direto, sem pedido no ERP). Entram nos relatórios
// e na margem como um pedido faturado: só os itens com CFOP de venda (remessa, transferência, conserto, garantia e
// devolução ficam de fora), no dia da emissão, com os impostos destacados na própria nota. O custo é o do cadastro,
// achado pelo código do item (SKU, código do fabricante ou alternativo) ou pela descrição igual.
// Venda devolvida (NF-e de devolução que aponta para ela pela chave ou pelo id) sai inteira; devolução parcial
// reduz a venda na proporção do valor devolvido.
import type { Item, Pedido, Produto } from "./types";

/** 5101–5125, 5401–5405 (e os mesmos em 6 e 7): venda de produção, de mercadoria e com ST. Transferência (x15x) não. */
export const CFOP_VENDA = /^[567](10\d|11\d|12[0-5]|40[1-5])$/;

export type ItemNota = {
  /** produto do ERP, quando a nota foi emitida aqui */
  produto_id?: string | null;
  codigo_produto?: string | null; descricao?: string | null; cfop?: string | number | null; quantidade_comercial?: number | string | null;
  valor_bruto?: number | string | null; icms_valor?: number | string | null; pis_valor?: number | string | null; cofins_valor?: number | string | null;
  ipi_valor?: number | string | null;
};
export type NotaVenda = {
  id: string; numero?: string | null; created_at: string; status: string; ambiente?: string | null; pedido_id: string | null;
  unidade_id?: string | null; cliente_id?: string | null; tipo_operacao?: string | null; finalidade?: string | null; excluida_em?: string | null;
  destinatario_nome?: string | null; payload?: { items?: ItemNota[] } | null;
  valor_total?: number | string | null; chave?: string | null; chave_referenciada?: string | null; nota_referenciada_id?: string | null;
  cliente?: { id: string; nome: string; municipio?: string | null; uf?: string | null } | null;
};
/** Pedido montado a partir da nota (id "nf:<id da nota>"); origem "nfe". */
export type PedidoDaNota = Pedido & { itens: (Item & { produto?: Pick<Produto, "preco_custo" | "tipo"> | null })[]; de_nota: true; numero_nota: string | null };

export const SELECT_NOTAS_VENDA =
  "id, numero, created_at, status, ambiente, pedido_id, unidade_id, cliente_id, tipo_operacao, finalidade, excluida_em, destinatario_nome, payload, valor_total, chave, chave_referenciada, nota_referenciada_id, cliente:clientes(id, nome, municipio, uf, tipo_pessoa, contribuinte_icms)";

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const chaveTexto = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Descrição sem o que muda entre o Tiny antigo e o cadastro de hoje: "My Frost", "Compatível com Máquinas My Frost",
 * acentos e pontuação (28/10: ~R$ 60 mil de vendas não achavam produto e entravam sem custo no DRE). */
export const descricaoLimpa = (s: string | null | undefined) => chaveTexto(s)
  .replace(/-?\s*compat[ií]vel com (as )?m[aá]quinas? my ?frost/g, " ")
  .replace(/\bmy ?frost\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

/** Acha o produto do item da nota: produto do ERP, código (SKU, fabricante, alternativos) ou descrição (igual ou limpa). */
export function indiceProdutos(produtos: Produto[]) {
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const porCodigo = new Map<string, Produto>();
  const porTexto = new Map<string, Produto>();
  const porLimpa = new Map<string, Produto>();
  // os unificados e os inativos só servem se não houver outro com o mesmo código
  const ordem = [...produtos].sort((a, b) => Number(!!a.unificado_em) - Number(!!b.unificado_em) || Number(b.ativo) - Number(a.ativo));
  for (const p of ordem) {
    const alvo = p.unificado_em ? produtos.find((x) => x.id === p.unificado_em) ?? p : p;
    const codigos = [p.sku, p.codigo_fabricante, ...(p.codigos_alternativos ?? "").split(/[,;\s]+/)].map((c) => (c ?? "").trim().toLowerCase()).filter(Boolean);
    for (const c of codigos) if (!porCodigo.has(c)) porCodigo.set(c, alvo);
    const t = chaveTexto(p.descricao);
    if (t && !porTexto.has(t)) porTexto.set(t, alvo);
    // a descrição limpa do produto e a de cada código alternativo (o PRD cadastra ali o nome antigo do Tiny,
    // ex.: "My Frost Prime" na máquina Prime), separados por vírgula ou ponto e vírgula
    for (const l of [p.descricao, ...(p.codigos_alternativos ?? "").split(/[,;]/)].map(descricaoLimpa)) {
      if (l.length >= 4 && !porLimpa.has(l)) porLimpa.set(l, alvo);
    }
  }
  const ativo = (p: Produto | undefined) => (p?.unificado_em ? porId.get(p.unificado_em) ?? p : p);
  return (it: ItemNota) => ativo(it.produto_id ? porId.get(it.produto_id) : undefined)
    ?? porCodigo.get(String(it.codigo_produto ?? "").trim().toLowerCase())
    ?? porTexto.get(chaveTexto(it.descricao))
    ?? porLimpa.get(descricaoLimpa(it.descricao));
}

/** É venda que ainda não está em pedido nenhum do ERP (nota autorizada de produção, saída normal, com item de venda). */
export function notaEhVendaSemPedido(nf: NotaVenda) {
  return nf.status === "autorizada" && nf.ambiente !== "homologacao" && !nf.pedido_id && !nf.excluida_em
    && (nf.tipo_operacao ?? "saida") === "saida" && (nf.finalidade ?? "normal") === "normal"
    && (nf.payload?.items ?? []).some((i) => CFOP_VENDA.test(String(i.cfop ?? "").replace(/\D/g, "")));
}

/** Valor devolvido de cada nota (pelo id): NF-e de devolução autorizada que aponta para ela pelo id ou pela chave. */
export function devolvidoPorNota(notas: NotaVenda[]) {
  const porChave = new Map(notas.filter((nf) => nf.chave).map((nf) => [nf.chave as string, nf.id]));
  const devolvido = new Map<string, number>();
  for (const d of notas) {
    if (d.finalidade !== "devolucao" || d.status !== "autorizada" || d.excluida_em || d.ambiente === "homologacao") continue;
    const alvo = d.nota_referenciada_id ?? (d.chave_referenciada ? porChave.get(d.chave_referenciada) : undefined);
    if (alvo && alvo !== d.id) devolvido.set(alvo, (devolvido.get(alvo) ?? 0) + n(d.valor_total));
  }
  return devolvido;
}

/**
 * Pedidos "faturados" montados das notas de venda sem pedido + as notas correspondentes (só os itens de venda),
 * para a margem usar os impostos reais destacados (ICMS, PIS e COFINS de cada item).
 */
export function vendasDasNotas(notas: NotaVenda[], produtos: Produto[]) {
  const achar = indiceProdutos(produtos);
  const pedidos: PedidoDaNota[] = [];
  const notasDosPedidos: { pedido_id: string; status: string; ambiente: string; payload: { items: Record<string, number>[] } }[] = [];
  const devolvido = devolvidoPorNota(notas);
  let semProduto = 0, devolvidas = 0;
  for (const nf of notas) {
    if (!notaEhVendaSemPedido(nf)) continue;
    const todos = nf.payload?.items ?? [];
    // devolução: a parte devolvida sai da venda (valor da nota inteira, porque a devolução também leva frete e IPI)
    const valorNota = n(nf.valor_total) || todos.reduce((s, i) => s + n(i.valor_bruto), 0);
    const fator = valorNota > 0 ? Math.max(0, 1 - (devolvido.get(nf.id) ?? 0) / valorNota) : 1;
    if (fator < 0.005) { devolvidas++; continue; }
    const vendas = todos.filter((i) => CFOP_VENDA.test(String(i.cfop ?? "").replace(/\D/g, ""))).map((i) => fator === 1 ? i : {
      ...i, valor_bruto: n(i.valor_bruto) * fator, quantidade_comercial: n(i.quantidade_comercial) * fator,
      icms_valor: n(i.icms_valor) * fator, pis_valor: n(i.pis_valor) * fator, cofins_valor: n(i.cofins_valor) * fator,
    });
    const id = `nf:${nf.id}`;
    const itens = vendas.map((i, k) => {
      const p = achar(i);
      if (!p) semProduto++;
      const qtd = n(i.quantidade_comercial) || 1;
      return {
        id: `${id}:${k}`, produto_id: p?.id ?? `nf-item:${chaveTexto(i.descricao) || k}`, descricao: p?.descricao ?? String(i.descricao ?? "Item da nota"),
        quantidade: qtd, valor_unitario: n(i.valor_bruto) / qtd, produto: p ? { preco_custo: p.preco_custo, tipo: p.tipo } : null,
      };
    });
    const total = vendas.reduce((s, i) => s + n(i.valor_bruto), 0);
    pedidos.push({
      id, numero: 0, numero_nota: nf.numero ?? null, de_nota: true, cliente_id: nf.cliente_id ?? "", origem: "nfe", status: "faturado",
      vendedor: null, vendedor_id: null, forma_pagamento: "", parcelas: 1, primeiro_vencimento: null, intervalo_dias: 0, modalidade_frete: 9,
      valor_produtos: total, desconto: 0, frete: 0, valor_total: total, observacoes: null, created_at: nf.created_at, aprovado_em: nf.created_at,
      unidade_id: nf.unidade_id ?? null,
      cliente: (nf.cliente ?? (nf.destinatario_nome ? { id: "", nome: nf.destinatario_nome } : undefined)) as Pedido["cliente"],
      itens,
    });
    notasDosPedidos.push({
      pedido_id: id, status: "autorizada", ambiente: "producao",
      payload: { items: vendas.map((i) => ({ icms_valor: n(i.icms_valor), pis_valor: n(i.pis_valor), cofins_valor: n(i.cofins_valor) })) },
    });
  }
  return { pedidos, notas: notasDosPedidos, semProduto, devolvidas };
}

/** Rótulo da venda na lista: "#123" (pedido) ou "NF 294" (venda que só tem a nota). */
export const rotuloVenda = (p: { numero: number; de_nota?: boolean; numero_nota?: string | null }) =>
  p.de_nota ? `NF ${p.numero_nota ?? "s/nº"}` : `#${p.numero}`;
