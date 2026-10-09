// Conferências de um pedido (aba Auditoria do pedido): total, desconto, preço praticado, vendedor,
// parcelas, estoque, NF-e e comissão. Cada linha diz o que foi conferido e o que achou.

export type NivelConferencia = "ok" | "info" | "alerta" | "erro";
export type Conferencia = { id: string; titulo: string; nivel: NivelConferencia; detalhe: string };

export type PedidoAuditado = {
  status: string; valor_total: number; desconto: number; frete: number; vendedor_id?: string | null; origem?: string | null;
  itens: { produto_id: string; descricao: string; quantidade: number; valor_unitario: number }[];
};
export type DadosPedido = {
  produtos: { id: string; descricao: string; preco_venda?: number | null; preco_custo?: number | null; kit?: boolean | null }[];
  parcelas: { status: string; valor: number; valor_pago?: number | null }[];
  notas: { status: string; ambiente?: string | null; valor_total?: number | null; numero?: string | null }[];
  movimentos: { produto_id: string; tipo: string; quantidade: number }[];
  comissoes: { status: string; valor: number }[];
  /** base da comissão do vendedor do pedido */
  baseComissao?: "recebimento" | "faturamento" | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const APROVADO = ["aprovado", "faturado", "entregue"];

export function conferirVenda(p: PedidoAuditado, d: DadosPedido): Conferencia[] {
  const out: Conferencia[] = [];
  const add = (id: string, titulo: string, nivel: NivelConferencia, detalhe: string) => out.push({ id, titulo, nivel, detalhe });
  const subtotal = r2(p.itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valor_unitario), 0));
  const desconto = Number(p.desconto || 0), frete = Number(p.frete || 0), total = Number(p.valor_total || 0);
  const aprovado = APROVADO.includes(p.status);

  // total
  const calculado = r2(Math.max(subtotal - desconto + frete, 0));
  add("total", "Total do pedido", Math.abs(calculado - total) <= 0.01 ? "ok" : "erro",
    `Itens ${brl(subtotal)}${desconto ? ` − desconto ${brl(desconto)}` : ""}${frete ? ` + frete ${brl(frete)}` : ""} = ${brl(calculado)}` +
    (Math.abs(calculado - total) <= 0.01 ? "." : `, mas o pedido está com ${brl(total)}.`));

  // desconto
  if (desconto > 0 && subtotal > 0) {
    const pct = (desconto / subtotal) * 100;
    add("desconto", "Desconto", pct > 20 ? "alerta" : "ok", `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% sobre os itens (${brl(desconto)})${pct > 20 ? ": acima de 20%, confira quem autorizou." : "."}`);
  }

  // preço praticado x cadastro
  const abaixoCusto: string[] = [], abaixoTabela: string[] = [];
  for (const i of p.itens) {
    const prod = d.produtos.find((x) => x.id === i.produto_id);
    if (!prod) continue;
    const v = Number(i.valor_unitario), custo = Number(prod.preco_custo || 0), tabela = Number(prod.preco_venda || 0);
    if (custo > 0 && v < custo) abaixoCusto.push(`${i.descricao} (${brl(v)}, custo ${brl(custo)})`);
    else if (tabela > 0 && v < tabela * 0.9) abaixoTabela.push(`${i.descricao} (${brl(v)}, tabela ${brl(tabela)})`);
  }
  add("preco", "Preço praticado", abaixoCusto.length ? "erro" : abaixoTabela.length ? "alerta" : "ok",
    abaixoCusto.length ? `Abaixo do custo: ${abaixoCusto.join("; ")}.` + (abaixoTabela.length ? ` Mais de 10% abaixo da tabela: ${abaixoTabela.join("; ")}.` : "")
      : abaixoTabela.length ? `Mais de 10% abaixo da tabela: ${abaixoTabela.join("; ")}.` : "Todos os itens no preço de tabela ou perto dele.");

  // vendedor
  add("vendedor", "Vendedor", p.vendedor_id ? "ok" : p.origem === "loja" ? "info" : "alerta",
    p.vendedor_id ? "Informado (a comissão segue o cadastro do vendedor)." : p.origem === "loja" ? "Venda da loja virtual, sem vendedor." : "Pedido sem vendedor: sem comissão e sem dono da venda nos relatórios.");

  if (!aprovado) {
    if (p.status === "orcamento") add("situacao", "Situação", "info", "Orçamento: ainda não baixou estoque nem gerou parcelas.");
    return out;
  }

  // parcelas
  const validas = d.parcelas.filter((c) => c.status !== "cancelado");
  const soma = r2(validas.reduce((s, c) => s + Number(c.valor), 0));
  const recebido = r2(validas.filter((c) => c.status === "pago").reduce((s, c) => s + Number(c.valor_pago ?? c.valor), 0));
  add("parcelas", "Parcelas no contas a receber", !validas.length ? "erro" : Math.abs(soma - total) <= 0.05 ? "ok" : "erro",
    !validas.length ? "Nenhuma parcela gerada." : `${validas.length} parcela(s) somando ${brl(soma)}${Math.abs(soma - total) <= 0.05 ? "" : ` (pedido de ${brl(total)})`}; recebido ${brl(recebido)}.`);

  // estoque (itens que não são kit; kit baixa os componentes)
  const esperado = new Map<string, { q: number; nome: string }>();
  let temKit = false;
  for (const i of p.itens) {
    if (d.produtos.find((x) => x.id === i.produto_id)?.kit) { temKit = true; continue; }
    const e = esperado.get(i.produto_id) ?? { q: 0, nome: i.descricao };
    e.q += Number(i.quantidade);
    esperado.set(i.produto_id, e);
  }
  const saiu = new Map<string, number>();
  for (const m of d.movimentos) saiu.set(m.produto_id, (saiu.get(m.produto_id) ?? 0) + (m.tipo === "saida" ? Math.abs(Number(m.quantidade)) : -Math.abs(Number(m.quantidade))));
  const difs = [...esperado].filter(([id, e]) => Math.abs((saiu.get(id) ?? 0) - e.q) > 0.0001).map(([id, e]) => `${e.nome}: pedido ${e.q}, saiu ${saiu.get(id) ?? 0}`);
  add("estoque", "Baixa de estoque", difs.length ? "erro" : "ok",
    difs.length ? difs.join("; ") + "." : `Saída igual aos itens${temKit ? " (kits baixam os componentes)" : ""}.`);

  // nota fiscal
  const reais = d.notas.filter((n) => n.ambiente !== "homologacao");
  const autorizada = reais.find((n) => n.status === "autorizada");
  const pendente = reais.find((n) => ["processando", "contingencia"].includes(n.status));
  const teste = d.notas.some((n) => n.ambiente === "homologacao");
  if (autorizada) {
    const v = Number(autorizada.valor_total ?? 0);
    add("nfe", "NF-e", Math.abs(v - total) <= 0.05 ? "ok" : "alerta", `NF ${autorizada.numero ?? ""} autorizada${Math.abs(v - total) <= 0.05 ? " no valor do pedido." : ` de ${brl(v)} (pedido de ${brl(total)}).`}`);
  } else if (pendente) {
    add("nfe", "NF-e", "info", "NF-e em processamento na SEFAZ.");
  } else {
    const saiuSemNota = ["faturado", "entregue"].includes(p.status);
    add("nfe", "NF-e", saiuSemNota ? "erro" : "alerta",
      (saiuSemNota ? "Pedido entregue sem NF-e válida." : "Pedido aprovado ainda sem NF-e.") + (teste ? " Só há nota de teste (homologação), sem valor fiscal." : ""));
  }

  // comissão
  if (p.vendedor_id) {
    const ativas = d.comissoes.filter((c) => c.status !== "cancelada");
    const valor = r2(ativas.reduce((s, c) => s + Number(c.valor), 0));
    const devia = d.baseComissao === "faturamento" || validas.some((c) => c.status === "pago");
    add("comissao", "Comissão", !ativas.length && devia ? "alerta" : "ok",
      ativas.length ? `${ativas.length} lançamento(s), ${brl(valor)} (${ativas.filter((c) => c.status === "paga").length} pago(s)).`
        : devia ? "Vendedor informado, mas nenhuma comissão lançada." : "Lançada quando as parcelas forem recebidas.");
  }
  return out;
}
