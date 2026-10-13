// Vendas por produto para os painéis das máquinas e dos produtos: pedidos do ERP + notas de venda do sistema anterior
// (as mesmas vendas do Painel gerencial), cada linha casada com o produto do cadastro. Funções puras.
import type { Venda } from "./gerencial";
import { chavesDescricao } from "./qualidadeProdutos";

// os mesmos selects do Painel gerencial (com a mesma chave): o que um painel carregou serve aos outros
export const SELECT_PEDIDOS_VENDAS = "id, numero, status, valor_total, created_at, aprovado_em, cliente_id, unidade_id, proposta_status, " +
  "itens:pedido_itens(produto_id, descricao, quantidade, valor_unitario, produto:produtos(sku)), notas:notas_fiscais(status, ambiente)";
export const SELECT_CLIENTES_VENDAS = "id, codigo, tipo_pessoa, nome, nome_fantasia, cpf_cnpj, whatsapp, telefone, email, municipio, uf, observacoes, preferencias, contribuinte_icms, inscricao_estadual";
export const SELECT_NOTAS_VENDAS = "id, numero, status, ambiente, finalidade, tipo_operacao, pedido_id, valor_total, created_at, payload, cliente_id, destinatario_nome, destinatario_doc, unidade_id";

export type ProdutoBase = { id: string; sku?: string | null; descricao: string; ativo?: boolean | null };
export type LinhaVendida = { data: string; produtoId: string | null; descricao: string; quantidade: number; valor: number; clienteId: string | null };

const nome = (d?: string | null) => { const k = chavesDescricao(String(d ?? ""))[0]; return k.length >= 4 ? k : null; };

/**
 * Cada item vendido com o produto do cadastro: pelo id (pedidos do ERP), pelo código (SKU) ou, quando o código
 * não é de produto nenhum, pela descrição. Mesmo código ou nome em ativo e inativo: fica com o ativo.
 */
export function linhasVendidas(vendas: Venda[], produtos: ProdutoBase[]): LinhaVendida[] {
  const ids = new Set(produtos.map((p) => p.id));
  const porSku = new Map<string, string>(), porNome = new Map<string, string>();
  for (const p of [...produtos].sort((a, b) => Number(a.ativo !== false) - Number(b.ativo !== false))) {
    if (p.sku?.trim()) porSku.set(p.sku.trim().toUpperCase(), p.id);
    const k = nome(p.descricao);
    if (k) porNome.set(k, p.id);
  }
  const out: LinhaVendida[] = [];
  for (const v of vendas) for (const i of v.itens) {
    if (!(i.quantidade > 0)) continue;
    const k = nome(i.descricao);
    const id = ids.has(i.chave) ? i.chave : porSku.get(i.chave.trim().toUpperCase()) ?? (k ? porNome.get(k) : undefined) ?? null;
    out.push({ data: v.data.slice(0, 10), produtoId: id, descricao: i.descricao, quantidade: i.quantidade, valor: i.valor, clienteId: v.clienteId });
  }
  return out;
}

export type Somado = { quantidade: number; valor: number; vezes: number };

/** Soma por produto (os não casados com o cadastro ficam pela descrição, com a chave "nome:…"). */
export function somarPorProduto(linhas: LinhaVendida[]) {
  const m = new Map<string, Somado>();
  for (const l of linhas) {
    const chave = l.produtoId ?? `nome:${l.descricao}`;
    const x = m.get(chave) ?? { quantidade: 0, valor: 0, vezes: 0 };
    x.quantidade += l.quantidade; x.valor += l.valor; x.vezes++;
    m.set(chave, x);
  }
  return m;
}

/** Última venda de cada produto (AAAA-MM-DD). */
export function ultimaVenda(linhas: LinhaVendida[]) {
  const m = new Map<string, string>();
  for (const l of linhas) if (l.produtoId && (m.get(l.produtoId) ?? "") < l.data) m.set(l.produtoId, l.data);
  return m;
}

/** Para quantos dias dá o estoque no ritmo de venda (`vendido` em `janela` dias); null = não vendeu. */
export const diasDeEstoque = (estoque: number, vendido: number, janela = 90) =>
  vendido > 0 ? Math.max(0, Math.floor(estoque / (vendido / janela))) : null;

/** Margem sobre o preço: (preço - custo) / preço, em %; null sem preço. */
export const margemPct = (preco: number, custo: number) => (preco > 0 ? ((preco - custo) / preco) * 100 : null);
