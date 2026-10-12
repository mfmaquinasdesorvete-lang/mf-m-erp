// PDV de sorveteria: cardápio (sabores, complementos, itens por peso), canais (balcão, comanda/mesa, delivery,
// retirada), fila de produção, caixa (abertura, sangria, suprimento, fechamento) e relatório do dia.
// Os dados ficam no navegador do caixa (localStorage, uma cópia por unidade) e a tela de produção em outra aba
// ou monitor acompanha ao vivo (evento "storage"). Toda a regra de conta fica aqui, em funções puras.
import { useSyncExternalStore } from "react";

export type Canal = "balcao" | "mesa" | "delivery" | "retirada";
export type Meio = "dinheiro" | "pix" | "credito" | "debito" | "vale";
export type Producao = "novo" | "preparando" | "pronto" | "entregue";

export type Sabor = { id: string; nome: string; acrescimo: number; esgotado: boolean };
export type Complemento = { id: string; nome: string; preco: number; esgotado: boolean };
export type GrupoComplemento = { id: string; nome: string; min: number; max: number; itens: Complemento[] };
export type Categoria = { id: string; nome: string; emoji: string };
export type ProdutoMenu = {
  id: string; categoria_id: string; nome: string;
  /** "unidade": preço fixo; "peso": preço por kg (self-service) */
  tipo: "unidade" | "peso";
  preco: number;
  /** quantos sabores o cliente escolhe (0 = não pergunta) */
  sabores: number;
  grupos: string[];
  ativo: boolean; esgotado: boolean;
};
export type Bairro = { nome: string; taxa: number };
export type Loja = {
  nome: string; telefone: string; endereco: string;
  comandas: number; taraG: number; gorjetaPct: number; imprimirAuto: boolean; producaoBalcao: boolean; bairros: Bairro[];
  /** cardápio online (/cardapio/<slug>) */
  slug: string; online: boolean; pedidoMinimo: number;
};

export type ItemPedido = {
  id: string; produto_id: string; nome: string; qtd: number;
  /** preço de uma unidade já com sabores premium e complementos; nos itens por peso, o total do prato */
  unit: number;
  sabores: string[]; complementos: { nome: string; preco: number }[];
  pesoG?: number; obs?: string;
  /** ids escolhidos (usados no pedido online, onde o banco recalcula o preço) */
  saborIds?: string[]; complementoIds?: string[];
};
export type Pagamento = { meio: Meio; valor: number; recebido?: number };
export type Cliente = { nome: string; telefone: string; endereco: string; bairro: string; referencia: string };
export type Pedido = {
  id: string; numero: number; canal: Canal; mesa?: string; cliente?: Cliente;
  itens: ItemPedido[]; descontoPct: number; taxaEntrega: number; gorjeta: boolean;
  situacao: "aberto" | "fechado" | "cancelado";
  producao: Producao | null; pagarNaEntrega?: boolean;
  /** ids dos itens já enviados à produção */
  enviados?: string[];
  pagamentos: Pagamento[]; troco: number;
  criadoEm: string; enviadoEm?: string; prontoEm?: string; pagoEm?: string; entregueEm?: string;
  operador: string; caixaId?: string; motivoCancelamento?: string; obs?: string;
};
export type Movimento = { id: string; tipo: "sangria" | "suprimento"; valor: number; motivo: string; em: string };
export type Caixa = {
  id: string; abertoEm: string; operador: string; fundo: number; movimentos: Movimento[];
  fechadoEm?: string; contado?: Partial<Record<Meio, number>>;
};
export type Estado = {
  versao: 1; loja: Loja; categorias: Categoria[]; sabores: Sabor[]; grupos: GrupoComplemento[]; produtos: ProdutoMenu[];
  pedidos: Pedido[]; caixas: Caixa[]; proximoNumero: number; ativoId: string | null;
};

export const CANAIS: { id: Canal; rotulo: string }[] = [
  { id: "balcao", rotulo: "Balcão" }, { id: "mesa", rotulo: "Comanda" },
  { id: "delivery", rotulo: "Delivery" }, { id: "retirada", rotulo: "Retirada" },
];
export const MEIOS: { id: Meio; rotulo: string }[] = [
  { id: "dinheiro", rotulo: "Dinheiro" }, { id: "pix", rotulo: "Pix" }, { id: "credito", rotulo: "Crédito" },
  { id: "debito", rotulo: "Débito" }, { id: "vale", rotulo: "Vale-refeição" },
];
export const rotuloCanal = (c: Canal) => CANAIS.find((x) => x.id === c)?.rotulo ?? c;
export const rotuloMeio = (m: Meio) => MEIOS.find((x) => x.id === m)?.rotulo ?? m;

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const novoId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---------------------------------------------------------------------
// Cardápio de exemplo (editável na aba Cardápio)
// ---------------------------------------------------------------------
export function estadoInicial(): Estado {
  const s = (nome: string, acrescimo = 0): Sabor => ({ id: novoId(), nome, acrescimo, esgotado: false });
  const c = (nome: string, preco: number): Complemento => ({ id: novoId(), nome, preco, esgotado: false });
  const sabores = [
    s("Chocolate"), s("Morango"), s("Creme"), s("Flocos"), s("Napolitano"), s("Doce de leite"), s("Maracujá"), s("Limão"),
    s("Coco"), s("Abacaxi com hortelã"), s("Brigadeiro"), s("Pistache", 2), s("Ninho com Nutella", 3), s("Cookies", 2),
  ];
  const cobertura: GrupoComplemento = { id: novoId(), nome: "Cobertura", min: 0, max: 1, itens: [c("Chocolate", 0), c("Morango", 0), c("Caramelo", 0), c("Leite condensado", 0), c("Goiabada", 1)] };
  const adicionais: GrupoComplemento = { id: novoId(), nome: "Adicionais", min: 0, max: 6, itens: [c("Granola", 2), c("Leite em pó", 2.5), c("Paçoca", 2), c("Banana", 2), c("Morango", 3.5), c("Confete", 2), c("Chantilly", 2), c("Calda extra", 1.5)] };
  const casca: GrupoComplemento = { id: novoId(), nome: "Casquinha", min: 1, max: 1, itens: [c("Simples", 0), c("Crocante", 2), c("Cascão", 3)] };
  const cats: Categoria[] = [
    { id: novoId(), nome: "Sorvetes", emoji: "🍨" }, { id: novoId(), nome: "Casquinhas", emoji: "🍦" },
    { id: novoId(), nome: "Açaí", emoji: "🫐" }, { id: novoId(), nome: "Milkshakes", emoji: "🥤" },
    { id: novoId(), nome: "Picolés", emoji: "🍡" }, { id: novoId(), nome: "Bebidas", emoji: "🧃" },
  ];
  const [cSorv, cCasq, cAcai, cShake, cPicole, cBebida] = cats.map((x) => x.id);
  const p = (categoria_id: string, nome: string, preco: number, extra: Partial<ProdutoMenu> = {}): ProdutoMenu =>
    ({ id: novoId(), categoria_id, nome, tipo: "unidade", preco, sabores: 0, grupos: [], ativo: true, esgotado: false, ...extra });
  const produtos = [
    p(cSorv, "Copo 1 bola", 8, { sabores: 1, grupos: [cobertura.id, adicionais.id] }),
    p(cSorv, "Copo 2 bolas", 14, { sabores: 2, grupos: [cobertura.id, adicionais.id] }),
    p(cSorv, "Copo 3 bolas", 19, { sabores: 3, grupos: [cobertura.id, adicionais.id] }),
    p(cSorv, "Sundae", 18, { sabores: 2, grupos: [cobertura.id, adicionais.id] }),
    p(cSorv, "Self-service (por kg)", 69.9, { tipo: "peso", grupos: [cobertura.id] }),
    p(cCasq, "Casquinha 1 sabor", 7, { sabores: 1, grupos: [casca.id] }),
    p(cCasq, "Casquinha 2 sabores", 10, { sabores: 2, grupos: [casca.id] }),
    p(cAcai, "Açaí 300 ml", 16, { grupos: [adicionais.id, cobertura.id] }),
    p(cAcai, "Açaí 500 ml", 22, { grupos: [adicionais.id, cobertura.id] }),
    p(cAcai, "Açaí 700 ml", 28, { grupos: [adicionais.id, cobertura.id] }),
    p(cShake, "Milkshake 400 ml", 16, { sabores: 1, grupos: [cobertura.id] }),
    p(cShake, "Milkshake 500 ml", 19, { sabores: 1, grupos: [cobertura.id] }),
    p(cPicole, "Picolé de fruta", 5), p(cPicole, "Picolé cremoso", 7), p(cPicole, "Picolé de água", 3.5),
    p(cBebida, "Água mineral", 4), p(cBebida, "Refrigerante lata", 6), p(cBebida, "Suco natural", 9),
  ];
  return {
    versao: 1,
    loja: {
      nome: "Minha Sorveteria", telefone: "", endereco: "", comandas: 20, taraG: 0, gorjetaPct: 10, imprimirAuto: false, producaoBalcao: false, slug: "", online: true, pedidoMinimo: 0,
      bairros: [{ nome: "Centro", taxa: 5 }, { nome: "Bairro vizinho", taxa: 8 }],
    },
    categorias: cats, sabores, grupos: [cobertura, adicionais, casca], produtos,
    pedidos: [], caixas: [], proximoNumero: 1, ativoId: null,
  };
}

// ---------------------------------------------------------------------
// Armazenamento: uma cópia por unidade no navegador, com atualização ao vivo entre abas
// ---------------------------------------------------------------------
const chave = (loja: string) => `sorveteria:v1:${loja}`;
let lojaAtual = "padrao";
let bruto: string | null | undefined;
let cache: Estado | null = null;
const ouvintes = new Set<() => void>();

function ler(): Estado {
  let txt: string | null = null;
  try { txt = localStorage.getItem(chave(lojaAtual)); } catch { /* navegador bloqueou o armazenamento */ }
  if (cache && txt === bruto) return cache;
  bruto = txt;
  let estado: Estado | null = null;
  try { estado = txt ? (JSON.parse(txt) as Estado) : null; } catch { estado = null; }
  cache = estado && estado.versao === 1 ? { ...estado, loja: { ...estadoInicial().loja, ...estado.loja } } : (cache && !txt ? cache : estadoInicial());
  return cache;
}

function gravar(estado: Estado) {
  cache = estado;
  try { bruto = JSON.stringify(estado); localStorage.setItem(chave(lojaAtual), bruto); } catch { /* sem armazenamento: segue só em memória */ }
  ouvintes.forEach((f) => f());
}

export function usarLoja(id: string) {
  if (id !== lojaAtual) { lojaAtual = id; cache = null; bruto = undefined; ouvintes.forEach((f) => f()); }
}

function assinar(f: () => void) {
  ouvintes.add(f);
  const aoMudar = (e: StorageEvent) => { if (e.key === chave(lojaAtual) || e.key === null) f(); };
  window.addEventListener("storage", aoMudar);
  return () => { ouvintes.delete(f); window.removeEventListener("storage", aoMudar); };
}

/** Estado da sorveteria e `mudar`, que recebe uma função pura (estado → estado) e grava. */
export function useSorveteria() {
  const estado = useSyncExternalStore(assinar, ler, ler);
  return { estado, mudar: (f: (e: Estado) => Estado) => gravar(f(ler())) };
}
export const apagarTudo = () => gravar(estadoInicial());

// ---------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------
export const totalItem = (i: ItemPedido) => r2(i.pesoG != null ? i.unit : i.qtd * i.unit);
export const subtotalPedido = (p: Pedido) => r2(p.itens.reduce((s, i) => s + totalItem(i), 0));
export const descontoPedido = (p: Pedido) => r2((subtotalPedido(p) * Math.min(100, Math.max(0, p.descontoPct))) / 100);
export const gorjetaPedido = (p: Pedido, pct: number) => (p.gorjeta ? r2(((subtotalPedido(p) - descontoPedido(p)) * pct) / 100) : 0);
export const totalPedido = (p: Pedido, pct = 0) =>
  r2(subtotalPedido(p) - descontoPedido(p) + (p.canal === "delivery" ? p.taxaEntrega : 0) + gorjetaPedido(p, pct));
export const qtdItens = (p: Pedido) => p.itens.reduce((s, i) => s + (i.pesoG != null ? 1 : i.qtd), 0);

/** Valor ainda sem pagamento (pagamentos em dinheiro que passaram do total viram troco). */
export const faltaPagar = (p: Pedido, total: number) => r2(Math.max(0, total - p.pagamentos.reduce((s, x) => s + x.valor, 0)));

/** Preço de um prato: base do produto + sabores premium + complementos (o por peso: peso líquido × preço do kg + complementos). */
export function precoItem(prod: ProdutoMenu, sabores: Sabor[], complementos: { preco: number }[], pesoLiquidoG?: number) {
  const extras = sabores.reduce((s, x) => s + x.acrescimo, 0) + complementos.reduce((s, x) => s + x.preco, 0);
  return r2((prod.tipo === "peso" ? ((pesoLiquidoG ?? 0) / 1000) * prod.preco : prod.preco) + extras);
}

export function novoPedido(e: Estado, operador: string, canal: Canal = "balcao"): Pedido {
  return {
    id: novoId(), numero: 0, canal, itens: [], descontoPct: 0, taxaEntrega: 0, gorjeta: false,
    situacao: "aberto", producao: null, pagamentos: [], troco: 0, criadoEm: new Date().toISOString(), operador,
    caixaId: caixaAberto(e)?.id,
  };
}

export const caixaAberto = (e: Estado) => e.caixas.find((c) => !c.fechadoEm) ?? null;
export const pedidoAtivo = (e: Estado) => e.pedidos.find((p) => p.id === e.ativoId && p.situacao === "aberto") ?? null;

/** Substitui um pedido pelo id (ou o inclui). */
export const salvarPedido = (e: Estado, p: Pedido): Estado =>
  ({ ...e, pedidos: e.pedidos.some((x) => x.id === p.id) ? e.pedidos.map((x) => (x.id === p.id ? p : x)) : [...e.pedidos, p] });

/** O número do pedido nasce quando ele é enviado ou pago (rascunhos vazios não gastam número). */
export function numerar(e: Estado, p: Pedido): [Estado, Pedido] {
  if (p.numero) return [e, p];
  const n = { ...p, numero: e.proximoNumero };
  return [{ ...e, proximoNumero: e.proximoNumero + 1 }, n];
}

export function abrirCaixa(e: Estado, operador: string, fundo: number): Estado {
  if (caixaAberto(e)) return e;
  return { ...e, caixas: [...e.caixas, { id: novoId(), abertoEm: new Date().toISOString(), operador, fundo: r2(fundo), movimentos: [] }] };
}

/** Entradas por forma de pagamento dos pedidos de um caixa (dinheiro já líquido do troco). */
export function totaisCaixa(e: Estado, c: Caixa) {
  const por: Record<Meio, number> = { dinheiro: 0, pix: 0, credito: 0, debito: 0, vale: 0 };
  let vendas = 0, qtd = 0;
  for (const p of e.pedidos) {
    if (p.caixaId !== c.id || p.situacao !== "fechado") continue;
    qtd++; vendas += totalPedido(p, e.loja.gorjetaPct);
    for (const x of p.pagamentos) por[x.meio] += x.valor;
  }
  const suprimentos = r2(c.movimentos.filter((m) => m.tipo === "suprimento").reduce((s, m) => s + m.valor, 0));
  const sangrias = r2(c.movimentos.filter((m) => m.tipo === "sangria").reduce((s, m) => s + m.valor, 0));
  const dinheiroEsperado = r2(c.fundo + por.dinheiro + suprimentos - sangrias);
  return { por, vendas: r2(vendas), qtd, suprimentos, sangrias, dinheiroEsperado };
}

// ---------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------
export function relatorio(e: Estado, de: Date, ate: Date) {
  const lista = e.pedidos.filter((p) => p.situacao === "fechado" && p.pagoEm && new Date(p.pagoEm) >= de && new Date(p.pagoEm) < ate);
  const cancelados = e.pedidos.filter((p) => p.situacao === "cancelado" && new Date(p.criadoEm) >= de && new Date(p.criadoEm) < ate && p.numero).length;
  const total = r2(lista.reduce((s, p) => s + totalPedido(p, e.loja.gorjetaPct), 0));
  const canais: Record<string, { qtd: number; valor: number }> = {};
  const meios: Record<string, number> = {};
  const produtos: Record<string, { qtd: number; valor: number }> = {};
  const horas = Array.from({ length: 24 }, () => 0);
  for (const p of lista) {
    const t = totalPedido(p, e.loja.gorjetaPct);
    const c = (canais[p.canal] ??= { qtd: 0, valor: 0 }); c.qtd++; c.valor = r2(c.valor + t);
    for (const x of p.pagamentos) meios[x.meio] = r2((meios[x.meio] ?? 0) + x.valor);
    horas[new Date(p.pagoEm!).getHours()] += t;
    for (const i of p.itens) { const q = (produtos[i.nome.replace(/ \d+g$/, "")] ??= { qtd: 0, valor: 0 }); q.qtd += i.pesoG != null ? 1 : i.qtd; q.valor = r2(q.valor + totalItem(i)); }
  }
  return {
    pedidos: lista.length, total, ticket: lista.length ? r2(total / lista.length) : 0, cancelados, canais, meios, horas,
    top: Object.entries(produtos).map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.valor - a.valor),
  };
}

export const inicioDoDia = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const somaDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
