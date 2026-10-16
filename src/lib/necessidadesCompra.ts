// Necessidades de compra (Compras → Necessidades de compra): para cada produto, o estoque físico, o que vai entrar
// (compras confirmadas e ordens de produção abertas), o que já está prometido (vendas aprovadas que ainda não baixaram
// o estoque, peças das OPs abertas e das OS aprovadas), o estoque virtual, o consumo do período e quanto comprar.
//
// Mesma regra da reposição (lib/reposicao): ponto de reposição = maior entre o mínimo e consumo diário × prazo × 1,5;
// repor até o máximo (se for maior que o ponto) ou ponto + 30 dias de consumo; respeita a compra mínima.
// Aqui o ponto é comparado com o estoque virtual mais o que já está em cotação (para não pedir duas vezes).
import { consumoEstrutura, type LinhaFicha } from "./estrutura";
import { ehKitAberto, pecasDoKit } from "./kits";
import { COBERTURA_DIAS, PRAZO_PADRAO, type VinculoFornecedor } from "./reposicao";
import type { EscolhaKit, KitComponente, Produto } from "./types";

export const PERIODOS = [30, 60, 90, 180] as const;
/** OC confirmada com o fornecedor e ainda não recebida toda: entra no estoque virtual. */
export const COMPRA_A_CAMINHO = ["enviado", "parcial"];
/** OS ainda aberta (o estoque das peças só baixa ao concluir). */
export const OS_ABERTA = ["aberta", "em_diagnostico", "aguardando_aprovacao", "aguardando_peca", "em_reparo"];
export const OP_ABERTA = ["planejada", "em_producao"];
/** Custo médio: compras recebidas nos últimos 12 meses. */
export const DIAS_CUSTO_MEDIO = 365;

export type TipoDoc = "pedido" | "op" | "os" | "compra" | "cotacao" | "producao";
/** Documento por trás dos números de "entradas" e "saídas previstas" (para mostrar de onde vem cada um). */
export type Origem = { tipo: TipoDoc; id: string; numero: number | string | null; quantidade: number; detalhe?: string | null };

export type MovimentoNec = { produto_id: string; tipo: string; quantidade: number; created_at: string; referencia_tipo?: string | null; unidade_id?: string | null };
export type EstoqueUnidade = { produto_id: string; unidade_id: string; quantidade: number };
export type CompraNec = {
  id: string; numero: number | null; status: string; unidade_id?: string | null; created_at?: string | null; enviado_em?: string | null;
  fornecedor?: { nome: string } | null;
  itens?: { produto_id: string; quantidade: number; quantidade_recebida?: number | null; custo_unitario?: number | null }[] | null;
};
export type VendaNec = {
  id: string; numero: number | null; unidade_id?: string | null; cliente?: { nome: string } | null;
  itens?: { produto_id: string; quantidade: number; kit_escolha?: EscolhaKit | null }[] | null;
};
export type OpNec = { id: string; numero: number | null; status: string; unidade_id?: string | null; produto_id: string; quantidade: number; produto?: { descricao: string } | null };
export type OsNec = {
  id: string; numero: number | null; status: string; unidade_id?: string | null; equipamento?: string | null;
  orcamento_aprovado_em?: string | null; estoque_baixado?: boolean | null; itens?: { produto_id: string; quantidade: number }[] | null;
};

export type Motivo = "negativo" | "zerado" | "pedidos" | "abaixo_minimo" | "ponto_reposicao";
/** comprar = vira OC; produzir = máquina e peça fabricada (vai por OP); nao_compra = fora de linha. */
export type Acao = "comprar" | "produzir" | "nao_compra";

export type LinhaNecessidade = {
  produto: Produto;
  /** estoque físico (da unidade escolhida ou o total) e o que há nas outras unidades (para transferir em vez de comprar) */
  fisico: number; emOutras: number;
  /** entradas previstas: compras confirmadas + OPs abertas deste produto; em cotação fica separado */
  entradas: number; emCotacao: number; origensEntrada: Origem[];
  saidasPrevistas: number; origensSaida: Origem[];
  virtual: number;
  saidasPeriodo: number; consumoDia: number; consumoMes: number; coberturaDias: number | null;
  prazo: number; prazoPadrao: boolean; minimo: number; maximo: number; ponto: number; alvo: number;
  necessidade: number; custo: number; origemCusto: "compras" | "cadastro"; valor: number;
  motivo: Motivo | null; critico: boolean; acao: Acao;
  fornecedor_id: string | null; fornecedorVinculo: boolean;
  /** nada no estoque, nada entrando ou saindo e sem mínimo: fica fora da lista, a não ser que peça para ver */
  semMovimento: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** arredonda para cima sem pegar o resto da conta do computador (2,0000000001 vira 2, não 3) */
const teto = (n: number) => Math.ceil(n - 1e-9);
const dias = (a: string, b: string) => (Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 864e5;
const n = (v: unknown) => Number(v) || 0;

/** OS que já tem as peças prometidas: aguardando peça, em reparo ou com o orçamento aprovado (e o estoque ainda não baixou). */
export function osComprometida(os: OsNec) {
  if (os.estoque_baixado || !OS_ABERTA.includes(os.status)) return false;
  return os.status === "aguardando_peca" || os.status === "em_reparo" || !!os.orcamento_aprovado_em;
}

/** Máquina, subconjunto com estoque próprio e peça fabricada aqui vão por ordem de produção, não por compra. */
export function acaoDoProduto(p: Produto): Acao {
  if (p.fora_de_linha) return "nao_compra";
  if (p.tipo === "maquina" || p.subconjunto_estocado || p.origem_producao === "fabricado" || p.origem_producao === "terceirizado") return "produzir";
  return "comprar";
}

/** Produto que não tem estoque próprio (kit sai pelas peças; serviço não tem estoque) ou é cadastro repetido arquivado. */
export const foraDaLista = (p: Produto) => !!p.kit || p.tipo === "servico" || !!p.unificado_em;

/** Mínimo = consumo diário × prazo × 1,5; máximo = mínimo + 30 dias de consumo. Sem consumo, não há o que sugerir. */
export function sugerirMinMax(consumoDia: number, prazo: number) {
  if (!(consumoDia > 0)) return null;
  const minimo = teto(consumoDia * Math.max(1, prazo) * 1.5);
  return { minimo, maximo: minimo + teto(consumoDia * COBERTURA_DIAS) };
}

/** Custo médio ponderado das compras recebidas (pedidos de compra) desde `desde`; por produto. */
export function custoMedioCompras(compras: CompraNec[], desde: string) {
  const soma = new Map<string, { q: number; v: number }>();
  for (const pc of compras) {
    if (!["parcial", "recebido"].includes(pc.status)) continue;
    const data = String(pc.enviado_em ?? pc.created_at ?? "").slice(0, 10);
    if (!data || data < desde) continue;
    for (const i of pc.itens ?? []) {
      // pedido antigo marcado como recebido sem a quantidade conferida: vale a quantidade pedida
      const q = n(i.quantidade_recebida) > 0 ? n(i.quantidade_recebida) : pc.status === "recebido" ? n(i.quantidade) : 0;
      if (q <= 0 || n(i.custo_unitario) <= 0) continue;
      const s = soma.get(i.produto_id) ?? { q: 0, v: 0 };
      s.q += q; s.v += q * n(i.custo_unitario);
      soma.set(i.produto_id, s);
    }
  }
  return new Map([...soma].map(([id, s]) => [id, r2(s.v / s.q)]));
}

export type DadosNecessidade = {
  produtos: Produto[]; hoje: string; periodoDias: number;
  /** null = todas as unidades (estoque total) */
  unidade: string | null;
  estoqueUnidade?: EstoqueUnidade[]; movimentos?: MovimentoNec[]; compras?: CompraNec[];
  vendas?: VendaNec[]; ops?: OpNec[]; oss?: OsNec[]; fichas?: LinhaFicha[]; kits?: KitComponente[]; vinculos?: VinculoFornecedor[];
  /** mínimo e máximo digitados na tela (ainda não gravados): a conta já usa os novos */
  ajustes?: Record<string, { minimo?: number; maximo?: number }>;
};

export function calcularNecessidades(d: DadosNecessidade): LinhaNecessidade[] {
  const kits = d.kits ?? [];
  const daUnidade = (u: string | null | undefined) => !d.unidade || !u || u === d.unidade;
  const produto = new Map(d.produtos.map((p) => [p.id, p]));

  // documentos somados por produto (o mesmo documento com o produto em duas linhas vira uma origem só)
  const juntar = (mapa: Map<string, Origem[]>, produtoId: string, o: Origem) => {
    const lista = mapa.get(produtoId) ?? [];
    const igual = lista.find((x) => x.tipo === o.tipo && x.id === o.id);
    if (igual) igual.quantidade = r3(igual.quantidade + o.quantidade); else lista.push({ ...o, quantidade: r3(o.quantidade) });
    mapa.set(produtoId, lista);
  };

  // ---- saídas previstas: o kit sai pelas peças, como na baixa do estoque
  const saidas = new Map<string, Origem[]>();
  const saida = (produtoId: string, qtd: number, o: Omit<Origem, "quantidade">, escolha?: EscolhaKit | null) => {
    if (!(qtd > 0)) return;
    if (produto.get(produtoId)?.kit && ehKitAberto(produtoId, kits)) {
      for (const c of pecasDoKit(produtoId, kits, escolha)) saida(c.componente_id, qtd * c.quantidade, o);
      return;
    }
    juntar(saidas, produtoId, { ...o, quantidade: qtd });
  };
  for (const v of d.vendas ?? []) {
    if (!daUnidade(v.unidade_id)) continue;
    for (const i of v.itens ?? []) saida(i.produto_id, n(i.quantidade), { tipo: "pedido", id: v.id, numero: v.numero, detalhe: v.cliente?.nome ?? null }, i.kit_escolha);
  }
  const entradas = new Map<string, Origem[]>();
  for (const op of d.ops ?? []) {
    if (!OP_ABERTA.includes(op.status) || !daUnidade(op.unidade_id)) continue;
    const nome = op.produto?.descricao ?? produto.get(op.produto_id)?.descricao ?? null;
    // peças da OP (todos os níveis da ficha técnica): só baixam ao concluir a produção
    for (const [comp, q] of consumoEstrutura(d.fichas ?? [], d.produtos, op.produto_id, n(op.quantidade), kits)) {
      saida(comp, q, { tipo: "op", id: op.id, numero: op.numero, detalhe: nome });
    }
    // o que a OP produz entra no estoque
    if (n(op.quantidade) > 0) juntar(entradas, op.produto_id, { tipo: "producao", id: op.id, numero: op.numero, quantidade: n(op.quantidade), detalhe: nome });
  }
  for (const os of d.oss ?? []) {
    if (!osComprometida(os) || !daUnidade(os.unidade_id)) continue;
    for (const i of os.itens ?? []) saida(i.produto_id, n(i.quantidade), { tipo: "os", id: os.id, numero: os.numero, detalhe: os.equipamento ?? null });
  }

  // ---- entradas previstas: o que falta receber das compras (cotação fica separada: ainda não foi confirmada)
  for (const pc of d.compras ?? []) {
    const cotacao = pc.status === "cotacao";
    if ((!cotacao && !COMPRA_A_CAMINHO.includes(pc.status)) || !daUnidade(pc.unidade_id)) continue;
    for (const i of pc.itens ?? []) {
      const falta = Math.max(0, n(i.quantidade) - n(i.quantidade_recebida));
      if (falta > 0) juntar(entradas, i.produto_id, { tipo: cotacao ? "cotacao" : "compra", id: pc.id, numero: pc.numero, quantidade: falta, detalhe: pc.fornecedor?.nome ?? null });
    }
  }

  // ---- saídas do período (consumo): transferência entre unidades e unificação de cadastro não são consumo;
  // venda cancelada ou OS excluída devolve ao estoque (entrada ligada ao pedido/OS) e sai da conta
  const consumo = new Map<string, number>();
  for (const m of d.movimentos ?? []) {
    if (!daUnidade(m.unidade_id) || dias(m.created_at, d.hoje) > d.periodoDias || dias(m.created_at, d.hoje) < 0) continue;
    const q = Math.abs(n(m.quantidade));
    if (m.tipo === "saida" && m.referencia_tipo !== "transferencia" && m.referencia_tipo !== "unificacao") consumo.set(m.produto_id, (consumo.get(m.produto_id) ?? 0) + q);
    else if (m.tipo === "entrada" && (m.referencia_tipo === "pedido" || m.referencia_tipo === "os")) consumo.set(m.produto_id, (consumo.get(m.produto_id) ?? 0) - q);
  }

  // ---- estoque por unidade
  const porUnidade = new Map<string, EstoqueUnidade[]>();
  for (const e of d.estoqueUnidade ?? []) porUnidade.set(e.produto_id, [...(porUnidade.get(e.produto_id) ?? []), e]);

  const desde = new Date(Date.parse(d.hoje.slice(0, 10)) - DIAS_CUSTO_MEDIO * 864e5).toISOString().slice(0, 10);
  const custos = custoMedioCompras(d.compras ?? [], desde);
  const fornecedorDe = new Map<string, string>();
  for (const v of d.vinculos ?? []) if (!fornecedorDe.has(v.produto_id)) fornecedorDe.set(v.produto_id, v.fornecedor_id);

  const out: LinhaNecessidade[] = [];
  for (const p of d.produtos) {
    if (foraDaLista(p)) continue;
    const linhasUn = porUnidade.get(p.id) ?? [];
    const fisico = d.unidade ? n(linhasUn.find((e) => e.unidade_id === d.unidade)?.quantidade) : n(p.estoque_atual);
    const emOutras = d.unidade ? linhasUn.filter((e) => e.unidade_id !== d.unidade).reduce((s, e) => s + Math.max(0, n(e.quantidade)), 0) : 0;
    const origensEntrada = entradas.get(p.id) ?? [];
    const entra = r3(origensEntrada.filter((o) => o.tipo !== "cotacao").reduce((s, o) => s + o.quantidade, 0));
    const emCotacao = r3(origensEntrada.filter((o) => o.tipo === "cotacao").reduce((s, o) => s + o.quantidade, 0));
    const origensSaida = saidas.get(p.id) ?? [];
    const saidasPrevistas = r3(origensSaida.reduce((s, o) => s + o.quantidade, 0));
    const virtual = r3(fisico + entra - saidasPrevistas);
    const saidasPeriodo = r3(Math.max(0, consumo.get(p.id) ?? 0));
    const consumoDia = saidasPeriodo / Math.max(1, d.periodoDias);
    const prazoPadrao = !(n(p.prazo_reposicao_dias) > 0);
    const prazo = Math.max(1, n(p.prazo_reposicao_dias) || PRAZO_PADRAO);
    const aj = d.ajustes?.[p.id];
    const minimo = Math.max(0, n(aj?.minimo ?? p.estoque_minimo));
    const maximo = Math.max(0, n(aj?.maximo ?? p.estoque_maximo));
    const ponto = Math.max(minimo, teto(consumoDia * prazo * 1.5));
    const alvo = maximo > ponto ? maximo : ponto + Math.max(teto(consumoDia * COBERTURA_DIAS), consumoDia ? 0 : minimo);
    const disponivel = virtual + emCotacao;
    const acao = acaoDoProduto(p);
    const compraMinima = Math.max(0, n(p.compra_minima));

    let necessidade = 0;
    if (acao !== "nao_compra") {
      // sob encomenda: só compra para atender o que já foi vendido/prometido
      if (p.sob_encomenda) { if (disponivel < 0) necessidade = Math.max(teto(-disponivel), compraMinima); }
      else if (disponivel < 0 || ((minimo > 0 || consumoDia > 0) && disponivel <= ponto)) necessidade = Math.max(teto(alvo - disponivel), compraMinima, 1);
    }
    const coberturaDias = consumoDia > 0 ? Math.max(0, Math.floor(Math.max(0, virtual) / consumoDia + 1e-9)) : null;
    const motivo: Motivo | null = !necessidade ? null
      : fisico < 0 ? "negativo" : fisico <= 0 ? "zerado" : disponivel < 0 || p.sob_encomenda ? "pedidos" : virtual < minimo ? "abaixo_minimo" : "ponto_reposicao";
    const custoCompras = custos.get(p.id);
    const custo = custoCompras ?? r2(n(p.preco_custo));
    const vinculo = !p.fornecedor_padrao_id ? fornecedorDe.get(p.id) ?? null : null;

    out.push({
      produto: p, fisico, emOutras, entradas: entra, emCotacao, origensEntrada, saidasPrevistas, origensSaida, virtual,
      saidasPeriodo, consumoDia, consumoMes: consumoDia * 30, coberturaDias, prazo, prazoPadrao, minimo, maximo, ponto, alvo,
      necessidade, custo, origemCusto: custoCompras !== undefined ? "compras" : "cadastro", valor: r2(custo * necessidade),
      motivo, critico: necessidade > 0 && (fisico <= 0 || virtual <= 0 || (coberturaDias !== null && coberturaDias < prazo)), acao,
      fornecedor_id: p.fornecedor_padrao_id ?? vinculo, fornecedorVinculo: !!vinculo,
      semMovimento: fisico === 0 && !entra && !emCotacao && !saidasPrevistas && !saidasPeriodo && !minimo,
    });
  }
  return ordenarNecessidades(out, "prioridade", true);
}

// ---------------------------------------------------------------------
// Ordenação (clicar no cabeçalho da coluna)
// ---------------------------------------------------------------------
export type ChaveOrdem =
  | "prioridade" | "produto" | "sku" | "gtin" | "fornecedor" | "unidade" | "custo" | "entradas" | "saidasPrevistas" | "fisico" | "virtual"
  | "minimo" | "maximo" | "saidasPeriodo" | "consumo" | "cobertura" | "prazo" | "necessidade" | "valor";

const txt = (a?: string | null, b?: string | null) => (a ?? "").localeCompare(b ?? "", "pt-BR", { sensitivity: "base", numeric: true });
const PESO_MOTIVO: Record<Motivo, number> = { negativo: 0, zerado: 1, pedidos: 2, abaixo_minimo: 3, ponto_reposicao: 4 };

/** Prioridade: crítico, depois o que precisa comprar (pelo motivo), menor cobertura e nome. */
function prioridade(a: LinhaNecessidade, b: LinhaNecessidade) {
  return Number(b.critico) - Number(a.critico) || Number(b.necessidade > 0) - Number(a.necessidade > 0)
    || (a.motivo && b.motivo ? PESO_MOTIVO[a.motivo] - PESO_MOTIVO[b.motivo] : 0)
    || (a.coberturaDias ?? Infinity) - (b.coberturaDias ?? Infinity) || txt(a.produto.descricao, b.produto.descricao);
}

/** Ordena pela coluna; vazio (sem SKU, sem fornecedor…) fica sempre no fim. */
export function ordenarNecessidades(linhas: LinhaNecessidade[], chave: ChaveOrdem, asc: boolean, nomeFornecedor: (id: string | null) => string = () => "") {
  if (chave === "prioridade") return [...linhas].sort((a, b) => (asc ? prioridade(a, b) : prioridade(b, a)));
  const texto: Partial<Record<ChaveOrdem, (l: LinhaNecessidade) => string>> = {
    produto: (l) => l.produto.descricao, sku: (l) => l.produto.sku ?? "", gtin: (l) => l.produto.codigo_barras ?? "",
    fornecedor: (l) => (l.fornecedor_id ? nomeFornecedor(l.fornecedor_id) : ""), unidade: (l) => l.produto.unidade ?? "",
  };
  const numero: Partial<Record<ChaveOrdem, (l: LinhaNecessidade) => number | null>> = {
    custo: (l) => l.custo, entradas: (l) => l.entradas, saidasPrevistas: (l) => l.saidasPrevistas, fisico: (l) => l.fisico, virtual: (l) => l.virtual,
    minimo: (l) => l.minimo, maximo: (l) => l.maximo, saidasPeriodo: (l) => l.saidasPeriodo, consumo: (l) => l.consumoDia, cobertura: (l) => l.coberturaDias,
    prazo: (l) => l.prazo, necessidade: (l) => l.necessidade, valor: (l) => l.valor,
  };
  const sinal = asc ? 1 : -1;
  return [...linhas].sort((a, b) => {
    const t = texto[chave];
    if (t) {
      const x = t(a).trim(), y = t(b).trim();
      if (!x !== !y) return x ? -1 : 1;
      return sinal * txt(x, y) || txt(a.produto.descricao, b.produto.descricao);
    }
    const f = numero[chave]!;
    const x = f(a), y = f(b);
    if ((x === null) !== (y === null)) return x === null ? 1 : -1;
    return sinal * ((x ?? 0) - (y ?? 0)) || txt(a.produto.descricao, b.produto.descricao);
  });
}

// ---------------------------------------------------------------------
// Ordens de compra: uma por fornecedor, com a quantidade (que a pessoa pode ter mudado) e o custo
// ---------------------------------------------------------------------
export type ItemEscolhido = { linha: LinhaNecessidade; quantidade: number };

/** Separa o que vira OC (por fornecedor) do que fica de fora (fabricado, fora de linha ou quantidade zero). */
export function gruposDeCompra(itens: ItemEscolhido[]) {
  const fora = { produzir: [] as ItemEscolhido[], naoCompra: [] as ItemEscolhido[], semQuantidade: [] as ItemEscolhido[] };
  const g = new Map<string, ItemEscolhido[]>();
  for (const i of itens) {
    if (i.linha.acao === "produzir") fora.produzir.push(i);
    else if (i.linha.acao === "nao_compra") fora.naoCompra.push(i);
    else if (!(i.quantidade > 0)) fora.semQuantidade.push(i);
    else g.set(i.linha.fornecedor_id ?? "", [...(g.get(i.linha.fornecedor_id ?? "") ?? []), i]);
  }
  const grupos = [...g].map(([fornecedor_id, lista]) => ({
    fornecedor_id: fornecedor_id || null, itens: lista,
    valor: r2(lista.reduce((s, i) => s + i.quantidade * i.linha.custo, 0)),
    prazo: Math.max(...lista.map((i) => i.linha.prazo)),
  })).sort((a, b) => Number(!a.fornecedor_id) - Number(!b.fornecedor_id) || b.valor - a.valor);
  return { grupos, fora };
}
