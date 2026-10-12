// Cardápio online da sorveteria: o PDV publica um retrato do cardápio e o cliente pede pelo link.
// A conferência de preços e regras (sabores, complementos, taxa, mínimo) acontece no banco (sorv_pedir);
// a função validarPedidoOnline abaixo é a mesma regra, usada pela prévia com dados de exemplo.
import { r2, type Categoria, type Estado, type GrupoComplemento, type Pedido, type ProdutoMenu, type Sabor } from "./sorveteria";

export type Cardapio = { loja: { bairros: { nome: string; taxa: number }[] }; categorias: Categoria[]; sabores: Sabor[]; grupos: GrupoComplemento[]; produtos: ProdutoMenu[] };
export type LojaPublica = { nome: string; whatsapp: string | null; aberta: boolean; pedido_minimo: number; cardapio: Cardapio };
export type ItemOnline = { id: string; produto_id: string; nome: string; qtd: number; unit: number; sabores: string[]; complementos: { nome: string; preco: number }[]; obs: string | null };
export type PedidoOnline = {
  id: string; codigo: string; canal: "delivery" | "retirada"; status: "novo" | "aceito" | "recusado"; motivo: string | null; created_at: string;
  cliente: { nome: string; telefone: string; endereco: string; bairro: string; referencia: string };
  itens: ItemOnline[]; subtotal: number; taxa_entrega: number; total: number; pagamento: string; troco_para: number | null; observacoes: string | null;
};
export type EnvioOnline = {
  canal: "delivery" | "retirada"; pagamento: string; troco_para?: number | null; observacoes?: string;
  cliente: { nome: string; telefone: string; endereco: string; bairro: string; referencia: string };
  itens: { produto_id: string; qtd: number; sabores: string[]; complementos: string[]; obs?: string }[];
};

/** Retrato do cardápio que vai para o site: só o que o cliente pode pedir (sem os itens por peso). */
export const cardapioPublicavel = (e: Estado): Cardapio => ({
  loja: { bairros: e.loja.bairros.filter((b) => b.nome) },
  categorias: e.categorias, sabores: e.sabores, grupos: e.grupos,
  produtos: e.produtos.filter((p) => p.ativo && p.tipo === "unidade"),
});

export const enderecoCardapio = (slug: string) => `${window.location.origin}/cardapio/${slug}`;
export const slugValido = (s: string) => /^[a-z0-9][a-z0-9-]{2,39}$/.test(s);
export const slugDe = (nome: string) => nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** Mesmas regras de sorv_pedir (SQL). Devolve itens já com preço calculado; lança Error com a mensagem para o cliente. */
export function validarPedidoOnline(loja: LojaPublica, p: EnvioOnline) {
  const c = loja.cardapio;
  if (!loja.aberta) throw new Error("A loja está fechada no momento");
  if (!["delivery", "retirada"].includes(p.canal)) throw new Error("Escolha entrega ou retirada");
  if (!["dinheiro", "pix", "credito", "debito", "vale"].includes(p.pagamento)) throw new Error("Escolha a forma de pagamento");
  if ((p.cliente.nome ?? "").trim().length < 2) throw new Error("Informe seu nome");
  const tel = (p.cliente.telefone ?? "").replace(/\D/g, "");
  if (tel.length < 10 || tel.length > 13) throw new Error("Informe um telefone com DDD");
  if (p.canal === "delivery" && (p.cliente.endereco ?? "").trim().length < 5) throw new Error("Informe o endereço de entrega");
  if (!p.itens?.length) throw new Error("O carrinho está vazio");
  if (p.itens.length > 30) throw new Error("Itens demais no mesmo pedido");
  const itens: ItemOnline[] = [];
  let sub = 0;
  for (const it of p.itens) {
    const qtd = it.qtd ?? 1;
    if (qtd < 1 || qtd > 20) throw new Error("Quantidade inválida");
    const prod = c.produtos.find((x) => x.id === it.produto_id && x.ativo && x.tipo === "unidade");
    if (!prod) throw new Error("Um dos produtos não está mais no cardápio");
    if (prod.esgotado) throw new Error(`${prod.nome} está em falta`);
    let unit = prod.preco;
    if ((it.sabores?.length ?? 0) !== prod.sabores) throw new Error(`Escolha ${prod.sabores} sabor(es) em ${prod.nome}`);
    const sabores: string[] = [];
    for (const sid of it.sabores ?? []) {
      const s = c.sabores.find((x) => x.id === sid);
      if (!s) throw new Error("Sabor inválido");
      if (s.esgotado) throw new Error(`O sabor ${s.nome} está em falta`);
      unit += s.acrescimo; sabores.push(s.nome);
    }
    const sel = [...new Set(it.complementos ?? [])];
    const complementos: { nome: string; preco: number }[] = [];
    let achados = 0;
    for (const g of c.grupos.filter((x) => prod.grupos.includes(x.id))) {
      const dentro = g.itens.filter((x) => sel.includes(x.id));
      for (const x of dentro) { if (x.esgotado) throw new Error(`${x.nome} está em falta`); unit += x.preco; complementos.push({ nome: x.nome, preco: x.preco }); }
      achados += dentro.length;
      if (dentro.length < g.min) throw new Error(`Escolha pelo menos ${g.min} em "${g.nome}"`);
      if (dentro.length > g.max) throw new Error(`No máximo ${g.max} em "${g.nome}"`);
    }
    if (achados !== sel.length) throw new Error("Complemento inválido");
    unit = r2(unit); sub += unit * qtd;
    itens.push({ id: Math.random().toString(36).slice(2, 10), produto_id: prod.id, nome: prod.nome, qtd, unit, sabores, complementos, obs: (it.obs ?? "").trim().slice(0, 80) || null });
  }
  sub = r2(sub);
  let taxa = 0;
  if (p.canal === "delivery" && c.loja.bairros.length) {
    const b = c.loja.bairros.find((x) => x.nome === p.cliente.bairro);
    if (!b) throw new Error("Escolha o bairro da entrega");
    taxa = b.taxa;
  }
  if (sub < loja.pedido_minimo) throw new Error(`Pedido mínimo: R$ ${loja.pedido_minimo.toFixed(2).replace(".", ",")}`);
  return { itens, subtotal: sub, taxa_entrega: taxa, total: r2(sub + taxa), telefone: tel };
}

/** Pedido online aceito vira um pedido do PDV (delivery/retirada), cobrado na entrega e já na fila de produção. */
export function pedidoDoOnline(o: PedidoOnline, operador: string, caixaId: string | undefined): Pedido {
  const agora = new Date().toISOString();
  const pag = { dinheiro: "dinheiro", pix: "Pix", credito: "cartão de crédito", debito: "cartão de débito", vale: "vale-refeição" }[o.pagamento] ?? o.pagamento;
  return {
    id: o.id, numero: 0, canal: o.canal, cliente: o.cliente, taxaEntrega: o.taxa_entrega, descontoPct: 0, gorjeta: false,
    itens: o.itens.map((i) => ({ id: i.id, produto_id: i.produto_id, nome: i.nome, qtd: i.qtd, unit: i.unit, sabores: i.sabores, complementos: i.complementos, obs: i.obs ?? undefined })),
    situacao: "aberto", producao: null, pagarNaEntrega: true, pagamentos: [], troco: 0, criadoEm: agora, operador, caixaId,
    obs: `ONLINE ${o.codigo} · pagar ${o.canal === "delivery" ? "na entrega" : "na retirada"} em ${pag}${o.troco_para ? ` (troco para R$ ${o.troco_para.toFixed(2).replace(".", ",")})` : ""}${o.observacoes ? ` · ${o.observacoes}` : ""}`,
  };
}

/** Envia o retrato do cardápio para o site (a mesma chamada serve ao botão "Publicar" e à publicação automática). */
export async function publicarCardapio(e: Estado) {
  const { supabase } = await import("./supabase");
  const { error } = await supabase.rpc("sorv_publicar", {
    p_slug: e.loja.slug, p_nome: e.loja.nome, p_whatsapp: e.loja.telefone, p_aberta: e.loja.online, p_minimo: e.loja.pedidoMinimo, p_cardapio: cardapioPublicavel(e),
  });
  if (error) throw error;
}
