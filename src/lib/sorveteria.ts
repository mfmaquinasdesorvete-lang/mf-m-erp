// PDV de sorveteria: cardápio (sabores, complementos, itens por peso), canais (balcão, comanda/mesa, delivery,
// retirada), fila de produção, caixa (abertura, sangria, suprimento, fechamento) e relatório do dia.
// Os dados ficam no navegador do caixa (localStorage, uma cópia por unidade) e a tela de produção em outra aba
// ou monitor acompanha ao vivo (evento "storage"). Toda a regra de conta fica aqui, em funções puras.
import { useSyncExternalStore } from "react";

export type Canal = "balcao" | "mesa" | "delivery" | "retirada" | "mkt";
export type Meio = "dinheiro" | "pix" | "credito" | "debito" | "vale" | "app";
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
  /** comissão do iFood/app, em % do pedido */
  comMkt: number;
  fid: { ativo: boolean; pts: number; resgatePts: number; resgateR: number };
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
  cupom?: string | null; resgate?: boolean; entregador?: string | null; semEntregador?: boolean; acertado?: boolean;
  origem?: string; totem?: boolean; pediuConta?: boolean;
  /** insumos baixados (ficha técnica) e custo da venda */
  baixa?: { i: string; q: number }[] | null; cmv?: number;
  clienteId?: string; pontosGanhos?: number;
};
export type Insumo = { id: string; nome: string; un: "g" | "ml" | "un"; estoque: number; min: number; custo: number };
export type LinhaFicha = { i: string; q: number };
export type Entregador = { id: string; nome: string; tel: string; repasse: number; ativo: boolean };
export type ClienteCrm = { id: string; nome: string; tel: string; end: string; bairro: string; ref: string; nasc: string; pontos: number; gasto: number; pedidos: number; ultimo: string | null; obs: string };
export type Cupom = { id: string; cod: string; tipo: "%" | "R$"; valor: number; min: number; validade: string; limite: number; usos: number; ativo: boolean };
export type Conta = { id: string; tipo: "pagar" | "receber"; desc: string; valor: number; venc: string; pago: boolean; pagoEm?: string; cat?: string };
export type Movimento = { id: string; tipo: "sangria" | "suprimento"; valor: number; motivo: string; em: string };
export type Caixa = {
  id: string; abertoEm: string; operador: string; fundo: number; movimentos: Movimento[];
  fechadoEm?: string; contado?: Partial<Record<Meio, number>>;
};
export type Estado = {
  versao: 1; loja: Loja; categorias: Categoria[]; sabores: Sabor[]; grupos: GrupoComplemento[]; produtos: ProdutoMenu[];
  pedidos: Pedido[]; caixas: Caixa[]; proximoNumero: number; ativoId: string | null;
  insumos: Insumo[]; /** ficha técnica: "p:<produto>", "s:<sabor>", "c:<complemento>" ou "canal" → linhas */ receitas: Record<string, LinhaFicha[]>;
  entregadores: Entregador[]; clientes: ClienteCrm[]; cupons: Cupom[]; contas: Conta[];
};

export const CANAIS: { id: Canal; rotulo: string }[] = [
  { id: "balcao", rotulo: "Balcão" }, { id: "mesa", rotulo: "Comanda" },
  { id: "delivery", rotulo: "Delivery" }, { id: "retirada", rotulo: "Retirada" }, { id: "mkt", rotulo: "iFood/App" },
];
export const MEIOS: { id: Meio; rotulo: string }[] = [
  { id: "dinheiro", rotulo: "Dinheiro" }, { id: "pix", rotulo: "Pix" }, { id: "credito", rotulo: "Crédito" },
  { id: "debito", rotulo: "Débito" }, { id: "vale", rotulo: "Vale-refeição" }, { id: "app", rotulo: "Pago no app" },
];
/** formas que o caixa recebe (o "Pago no app" só existe no canal iFood/App) */
export const MEIOS_PAG = MEIOS.filter((m) => m.id !== "app");
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
      nome: "Minha Sorveteria", telefone: "", endereco: "", comandas: 20, taraG: 0, gorjetaPct: 10, imprimirAuto: false, producaoBalcao: false, slug: "", online: true, pedidoMinimo: 0, comMkt: 12, fid: { ativo: true, pts: 1, resgatePts: 100, resgateR: 10 },
      bairros: [{ nome: "Centro", taxa: 5 }, { nome: "Bairro vizinho", taxa: 8 }],
    },
    categorias: cats, sabores, grupos: [cobertura, adicionais, casca], produtos,
    pedidos: [], caixas: [], proximoNumero: 1, ativoId: null,
    entregadores: [{ id: novoId(), nome: "Carlos Moto", tel: "", repasse: 4, ativo: true }], clientes: [],
    cupons: [{ id: novoId(), cod: "BEMVINDO10", tipo: "%", valor: 10, min: 15, validade: "", limite: 0, usos: 0, ativo: true }], contas: [],
    ...fichaDeExemplo(produtos, sabores, [cobertura, adicionais, casca]),
  };
}

/** insumos e fichas técnicas de exemplo (ligados aos produtos pelo nome) */
export function fichaDeExemplo(produtos: ProdutoMenu[], sabores: Sabor[], grupos: GrupoComplemento[]): Pick<Estado, "insumos" | "receitas"> {
  const ins = (nome: string, un: Insumo["un"], estoque: number, min: number, custo: number): Insumo => ({ id: novoId(), nome, un, estoque, min, custo });
  const base = ins("Base de sorvete", "g", 20000, 5000, 0.012), leite = ins("Leite", "ml", 15000, 4000, 0.0045), polpa = ins("Polpa de açaí", "g", 12000, 3000, 0.025),
    calda = ins("Caldas e coberturas", "ml", 4000, 800, 0.015), gran = ins("Granola", "g", 3000, 500, 0.02), fruta = ins("Frutas e adicionais", "g", 4000, 800, 0.03),
    cas = ins("Casquinha", "un", 200, 50, 0.45), copo = ins("Copo / pote", "un", 400, 100, 0.25), emb = ins("Embalagem delivery", "un", 300, 60, 0.6),
    beb = ins("Bebidas prontas", "un", 60, 24, 3.2), pic = ins("Picolés", "un", 120, 40, 2.1);
  const L = (i: Insumo, q: number): LinhaFicha => ({ i: i.id, q });
  const receitas: Record<string, LinhaFicha[]> = {};
  for (const p of produtos) {
    const n = p.nome, ml = Number(n.match(/(\d+)/)?.[1] ?? 0);
    let l: LinhaFicha[] = [];
    if (/^Copo|Sundae/.test(n)) l = [L(copo, 1)]; else if (/^Casquinha/.test(n)) l = [L(cas, 1)];
    else if (/^Açaí/.test(n)) l = [L(polpa, ml), L(copo, 1)]; else if (/^Milkshake/.test(n)) l = [L(leite, ml * 0.6), L(copo, 1)];
    else if (/^Picolé/.test(n)) l = [L(pic, 1)]; else if (/Água|Refri|Suco/.test(n)) l = [L(beb, 1)]; else if (p.tipo === "peso") l = [L(base, 1), L(copo, 1 / 350)];
    if (l.length) receitas["p:" + p.id] = l;
  }
  for (const s of sabores) receitas["s:" + s.id] = [L(base, 90)];
  for (const g of grupos) for (const i of g.itens) receitas["c:" + i.id] = g.nome === "Cobertura" ? [L(calda, 20)] : i.nome === "Granola" ? [L(gran, 30)] : g.nome === "Adicionais" ? [L(fruta, 30)] : [];
  receitas.canal = [L(emb, 1)];
  return { insumos: [base, leite, polpa, calda, gran, fruta, cas, copo, emb, beb, pic], receitas };
}

// ---------------------------------------------------------------------
// Armazenamento: uma cópia por unidade no navegador, com atualização ao vivo entre abas
// ---------------------------------------------------------------------
const chave = (loja: string) => `sorveteria:v1:${loja}`;
let lojaAtual = "padrao";
let bruto: string | null | undefined;
let cache: Estado | null = null;
const ouvintes = new Set<() => void>();

/** dados salvos por versões anteriores ganham o que veio depois (fidelidade, estoque, entregadores…) */
function completar(e: Estado): Estado {
  const base = estadoInicial();
  const r: Estado = { ...base, ...e, loja: { ...base.loja, ...e.loja, fid: { ...base.loja.fid, ...(e.loja?.fid ?? {}) } } };
  if (!e.insumos?.length) Object.assign(r, fichaDeExemplo(r.produtos, r.sabores, r.grupos));
  return r;
}

function ler(): Estado {
  let txt: string | null = null;
  try { txt = localStorage.getItem(chave(lojaAtual)); } catch { /* navegador bloqueou o armazenamento */ }
  if (cache && txt === bruto) return cache;
  bruto = txt;
  let estado: Estado | null = null;
  try { estado = txt ? (JSON.parse(txt) as Estado) : null; } catch { estado = null; }
  cache = estado && estado.versao === 1 ? completar(estado) : (cache && !txt ? cache : estadoInicial());
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

/** Pedido em edição: cada aba/aparelho tem o seu (o celular do garçom não mexe no pedido do caixa). */
export const ativoIdAtual = () => { try { return sessionStorage.getItem("sorv-ativo"); } catch { return null; } };
export function definirAtivo(id: string | null) {
  try { if (id) sessionStorage.setItem("sorv-ativo", id); else sessionStorage.removeItem("sorv-ativo"); } catch { /* sem armazenamento */ }
  cache = { ...ler() }; // nova identidade: faz a tela perceber a troca do pedido em edição
  ouvintes.forEach((f) => f());
}

// ---------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------
export const totalItem = (i: ItemPedido) => r2(i.pesoG != null ? i.unit : i.qtd * i.unit);
export const subtotalPedido = (p: Pedido) => r2(p.itens.reduce((s, i) => s + totalItem(i), 0));
export const cupomDe = (cod: string | null | undefined) => (cod ? ler().cupons.find((c) => c.cod === cod.toUpperCase()) : undefined);
export const cupomValor = (p: Pedido) => {
  const c = cupomDe(p.cupom); if (!c || !c.ativo) return 0;
  return r2(c.tipo === "%" ? (subtotalPedido(p) * c.valor) / 100 : c.valor);
};
export const resgateValor = (p: Pedido) => (p.resgate ? ler().loja.fid.resgateR : 0);
export const descontoPedido = (p: Pedido) =>
  r2(Math.min(subtotalPedido(p), (subtotalPedido(p) * Math.min(100, Math.max(0, p.descontoPct))) / 100 + cupomValor(p) + resgateValor(p)));
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
export const pedidoAtivo = (e: Estado) => e.pedidos.find((p) => p.id === ativoIdAtual() && p.situacao === "aberto") ?? null;

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
  const por: Record<Meio, number> = { dinheiro: 0, pix: 0, credito: 0, debito: 0, vale: 0, app: 0 };
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


// ---------------------------------------------------------------------
// Estoque (ficha técnica), clientes, fidelidade e cupons
// ---------------------------------------------------------------------
export const insumoDe = (e: Estado, id: string) => e.insumos.find((i) => i.id === id);
export const custoFicha = (e: Estado, chave: string) => (e.receitas[chave] ?? []).reduce((t, l) => t + l.q * (insumoDe(e, l.i)?.custo ?? 0), 0);

/** o que o pedido consome de cada insumo, pela ficha técnica do produto, dos sabores e dos complementos */
export function consumo(e: Estado, p: Pedido): Record<string, number> {
  const m: Record<string, number> = {};
  const soma = (chave: string, mult: number) => (e.receitas[chave] ?? []).forEach((l) => { m[l.i] = (m[l.i] ?? 0) + l.q * mult; });
  for (const i of p.itens) {
    soma("p:" + i.produto_id, i.pesoG != null ? i.pesoG : i.qtd);
    (i.saborIds ?? []).forEach((id) => soma("s:" + id, i.qtd)); (i.complementoIds ?? []).forEach((id) => soma("c:" + id, i.qtd));
  }
  if (p.canal === "delivery" || p.canal === "retirada" || p.canal === "mkt") soma("canal", 1);
  return m;
}
/** dá baixa nos insumos uma única vez por pedido e guarda o custo (CMV) */
export function baixarEstoque(e: Estado, p: Pedido): [Estado, Pedido] {
  if (p.baixa) return [e, p];
  const m = consumo(e, p); let cmv = 0;
  const insumos = e.insumos.map((x) => { const q = m[x.id]; if (!q) return x; cmv += q * x.custo; return { ...x, estoque: r2(x.estoque - q) }; });
  return [{ ...e, insumos }, { ...p, baixa: Object.entries(m).map(([i, q]) => ({ i, q })), cmv: r2(cmv) }];
}
export function devolverEstoque(e: Estado, p: Pedido): [Estado, Pedido] {
  if (!p.baixa) return [e, p];
  const m = Object.fromEntries(p.baixa.map((b) => [b.i, b.q]));
  return [{ ...e, insumos: e.insumos.map((x) => (m[x.id] ? { ...x, estoque: r2(x.estoque + m[x.id]) } : x)) }, { ...p, baixa: null, cmv: 0 }];
}
export const insumosBaixos = (e: Estado) => e.insumos.filter((i) => i.estoque <= i.min);

const dig = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
export const clientePorTel = (e: Estado, tel: string | null | undefined) => { const t = dig(tel); return t.length >= 10 ? e.clientes.find((c) => dig(c.tel) === t) : undefined; };

/** cria/atualiza o cadastro do cliente a partir do telefone do pedido */
export function upsertCliente(e: Estado, p: Pedido): [Estado, ClienteCrm | null] {
  const c0 = p.cliente; if (!c0 || dig(c0.telefone).length < 10) return [e, null];
  const ex = clientePorTel(e, c0.telefone);
  const c: ClienteCrm = ex
    ? { ...ex, nome: c0.nome || ex.nome, end: c0.endereco || ex.end, bairro: c0.endereco ? c0.bairro || ex.bairro : ex.bairro, ref: c0.referencia || ex.ref }
    : { id: novoId(), nome: c0.nome || "Cliente", tel: dig(c0.telefone), end: c0.endereco ?? "", bairro: c0.bairro ?? "", ref: c0.referencia ?? "", nasc: "", pontos: 0, gasto: 0, pedidos: 0, ultimo: null, obs: "" };
  return [{ ...e, clientes: ex ? e.clientes.map((x) => (x.id === c.id ? c : x)) : [...e.clientes, c] }, c];
}
/** ao pagar: histórico do cliente, pontos ganhos e gastos, uso do cupom */
export function fidelizar(e: Estado, p: Pedido): [Estado, Pedido] {
  let [e2, c] = upsertCliente(e, p); const t = totalPedido(p, e.loja.gorjetaPct);
  if (p.cupom) e2 = { ...e2, cupons: e2.cupons.map((x) => (x.cod === p.cupom ? { ...x, usos: x.usos + 1 } : x)) };
  if (!c) return [e2, p];
  const ganhos = e.loja.fid.ativo ? Math.floor(t * e.loja.fid.pts) : 0;
  const pontos = Math.max(0, c.pontos - (p.resgate ? e.loja.fid.resgatePts : 0)) + ganhos;
  const novo = { ...c, pedidos: c.pedidos + 1, gasto: r2(c.gasto + t), ultimo: p.pagoEm ?? null, pontos };
  return [{ ...e2, clientes: e2.clientes.map((x) => (x.id === novo.id ? novo : x)) }, { ...p, clienteId: novo.id, pontosGanhos: ganhos }];
}
export function desfidelizar(e: Estado, p: Pedido): Estado {
  let r = e;
  if (p.cupom) r = { ...r, cupons: r.cupons.map((x) => (x.cod === p.cupom ? { ...x, usos: Math.max(0, x.usos - 1) } : x)) };
  if (!p.clienteId) return r;
  const t = totalPedido(p, e.loja.gorjetaPct);
  return { ...r, clientes: r.clientes.map((c) => (c.id === p.clienteId
    ? { ...c, pedidos: Math.max(0, c.pedidos - 1), gasto: r2(Math.max(0, c.gasto - t)), pontos: Math.max(0, c.pontos - (p.pontosGanhos ?? 0)) + (p.resgate ? e.loja.fid.resgatePts : 0) } : c)) };
}
export function cupomValida(e: Estado, cod: string, sub: number): { erro: string } | { c: Cupom } {
  const c = e.cupons.find((x) => x.cod === cod.trim().toUpperCase());
  if (!c || !c.ativo) return { erro: "Cupom inválido" };
  if (c.validade && c.validade < new Date().toISOString().slice(0, 10)) return { erro: "Cupom vencido" };
  if (c.limite && c.usos >= c.limite) return { erro: "Cupom esgotado" };
  if (sub < c.min) return { erro: `Cupom vale para pedidos a partir de R$ ${c.min.toFixed(2).replace(".", ",")}` };
  return { c };
}
/** segmentos do CRM */
export function segmentos(c: ClienteCrm) {
  const dias = c.ultimo ? (Date.now() - new Date(c.ultimo).getTime()) / 864e5 : 999;
  return { vip: c.pedidos >= 5, inativo: c.pedidos > 0 && dias > 30, niver: !!c.nasc && new Date(c.nasc + "T12:00:00").getMonth() === new Date().getMonth() };
}

// ---------------------------------------------------------------------
// Financeiro (resultado do período)
// ---------------------------------------------------------------------
export function resultado(e: Estado, de: Date, ate: Date) {
  const no = (d?: string) => !!d && new Date(d) >= de && new Date(d) < ate;
  const vend = e.pedidos.filter((p) => p.situacao === "fechado" && no(p.pagoEm));
  const bruto = r2(vend.reduce((t, p) => t + totalPedido(p, e.loja.gorjetaPct), 0));
  const comissao = r2((vend.filter((p) => p.canal === "mkt").reduce((t, p) => t + totalPedido(p, e.loja.gorjetaPct), 0) * e.loja.comMkt) / 100);
  const cmv = r2(vend.reduce((t, p) => t + (p.cmv ?? 0), 0));
  const despesas = e.contas.filter((c) => c.pago && c.tipo === "pagar" && c.cat !== "Estoque" && no(c.pagoEm));
  const porCat: Record<string, number> = {};
  despesas.forEach((c) => { const k = c.cat || "Outras"; porCat[k] = r2((porCat[k] ?? 0) + c.valor); });
  const desp = r2(despesas.reduce((t, c) => t + c.valor, 0));
  const lucroBruto = r2(bruto - comissao - cmv);
  const entradas: Record<string, number> = {};
  vend.forEach((p) => p.pagamentos.forEach((x) => { entradas[x.meio] = r2((entradas[x.meio] ?? 0) + x.valor); }));
  const saidas = r2(e.contas.filter((c) => c.pago && c.tipo === "pagar" && no(c.pagoEm)).reduce((t, c) => t + c.valor, 0));
  const outras = r2(e.contas.filter((c) => c.pago && c.tipo === "receber" && no(c.pagoEm)).reduce((t, c) => t + c.valor, 0));
  return { bruto, comissao, cmv, lucroBruto, porCat, desp, resultado: r2(lucroBruto - desp), entradas, saidas, outras, vendas: vend.length };
}

/** Curva ABC: A até 80% do faturamento, B até 95%, C o resto. */
export function curvaAbc(top: { nome: string; valor: number }[]) {
  const total = top.reduce((t, x) => t + x.valor, 0) || 1; let ac = 0;
  return top.map((x) => { const antes = ac / total; ac += x.valor; return { ...x, classe: antes < 0.8 ? "A" : antes < 0.95 ? "B" : "C", acumulado: (ac / total) * 100 }; });
}
