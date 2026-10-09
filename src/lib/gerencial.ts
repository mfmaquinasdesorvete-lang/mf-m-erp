// Painel gerencial: vendas do ERP e do sistema anterior (notas do Tiny) juntas, comparadas com o mês e o ano anteriores,
// curva ABC de produtos e clientes, clientes parados, tendências e os pontos em que a operação está travando.
import { compraDaNota, compraDoPedido, resumoCliente, type CompraCliente, type NotaFicha, type PedidoFicha } from "./fichaCliente";

export type Venda = CompraCliente & { cliente: string; clienteNome: string; clienteId: string | null; unidade_id?: string | null };
type ClienteG = { id: string; nome: string; nome_fantasia?: string | null; cpf_cnpj?: string | null };
type PedidoG = PedidoFicha & { cliente_id: string; unidade_id?: string | null };
type NotaG = NotaFicha & { cliente_id?: string | null; destinatario_nome?: string | null; destinatario_doc?: string | null; unidade_id?: string | null };

const r2 = (n: number) => Math.round(n * 100) / 100;
const dia = (d: string) => d.slice(0, 10);
const dias = (a: string, b: string) => Math.round((Date.parse(dia(b)) - Date.parse(dia(a))) / 864e5);
const somarDias = (d: string, n: number) => new Date(Date.parse(dia(d)) + n * 864e5).toISOString().slice(0, 10);
const nomeCliente = (c: ClienteG) => c.nome_fantasia?.trim() || c.nome;

/** Todas as vendas: pedidos aprovados + notas de venda que não vieram de pedido, com o cliente identificado. */
export function vendasDaEmpresa(pedidos: PedidoG[], notas: NotaG[], clientes: ClienteG[]): Venda[] {
  const porId = new Map(clientes.map((c) => [c.id, c]));
  const porDoc = new Map(clientes.filter((c) => (c.cpf_cnpj ?? "").length >= 11).map((c) => [String(c.cpf_cnpj).replace(/\D/g, ""), c]));
  const out: Venda[] = [];
  for (const p of pedidos) {
    const v = compraDoPedido(p);
    const c = porId.get(p.cliente_id);
    if (v) out.push({ ...v, cliente: p.cliente_id, clienteId: p.cliente_id, clienteNome: c ? nomeCliente(c) : "Cliente", unidade_id: p.unidade_id });
  }
  for (const n of notas) {
    const v = compraDaNota(n);
    if (!v) continue;
    const doc = (n.destinatario_doc ?? "").replace(/\D/g, "");
    const c = (n.cliente_id && porId.get(n.cliente_id)) || (doc && porDoc.get(doc)) || null;
    out.push({
      ...v, cliente: c?.id ?? (doc ? `doc:${doc}` : `nome:${(n.destinatario_nome ?? "").toLowerCase()}`), clienteId: c?.id ?? null,
      clienteNome: c ? nomeCliente(c) : n.destinatario_nome || "Sem destinatário", unidade_id: n.unidade_id,
    });
  }
  return out.sort((a, b) => b.data.localeCompare(a.data));
}

/** Mesmo dia `k` meses antes/depois (31/03 → 28/02). */
export function mesmoDia(d: string, k: number) {
  const [y, m, dd] = dia(d).split("-").map(Number);
  const alvo = new Date(Date.UTC(y, m - 1 + k, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return `${alvo.getUTCFullYear()}-${String(alvo.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(dd, ultimo)).padStart(2, "0")}`;
}
const inicioMes = (d: string) => `${dia(d).slice(0, 7)}-01`;
/** Meses AAAA-MM terminando no mês de `hoje`, do mais antigo ao atual. */
export const mesesAte = (hoje: string, n: number) => Array.from({ length: n }, (_, i) => mesmoDia(inicioMes(hoje), i - n + 1).slice(0, 7));

const entre = (vendas: Venda[], de: string, ate: string) => vendas.filter((v) => dia(v.data) >= de && dia(v.data) <= ate);
const soma = (vendas: Venda[]) => r2(vendas.reduce((s, v) => s + v.valor, 0));
const variacao = (atual: number, anterior: number) => (anterior > 0 ? Math.round(((atual - anterior) / anterior) * 1000) / 10 : null);

export type Comparacao = { atual: number; anterior: number; variacao: number | null };
const comparar = (atual: number, anterior: number): Comparacao => ({ atual, anterior, variacao: variacao(atual, anterior) });

/** Indicadores com o período equivalente anterior (mês até hoje, ano até hoje, últimos 12 meses). */
export function indicadores(vendas: Venda[], hoje: string) {
  const mes = entre(vendas, inicioMes(hoje), hoje);
  const ano = `${hoje.slice(0, 4)}-01-01`;
  const anoAnt = `${Number(hoje.slice(0, 4)) - 1}-01-01`;
  const v12 = entre(vendas, somarDias(hoje, -364), hoje);
  const v12ant = entre(vendas, somarDias(hoje, -729), somarDias(hoje, -365));
  const clientes = (l: Venda[]) => new Set(l.map((v) => v.cliente)).size;
  // novo = primeira compra dentro da janela
  const primeira = new Map<string, string>();
  for (const v of vendas) if (!primeira.has(v.cliente) || dia(v.data) < primeira.get(v.cliente)!) primeira.set(v.cliente, dia(v.data));
  const novos = (de: string, ate: string) => [...primeira.values()].filter((d) => d >= de && d <= ate).length;
  const ticket = (l: Venda[]) => (l.length ? r2(soma(l) / l.length) : 0);
  return {
    mes: comparar(soma(mes), soma(entre(vendas, mesmoDia(inicioMes(hoje), -1), mesmoDia(hoje, -1)))),
    mesAnoAnterior: comparar(soma(mes), soma(entre(vendas, mesmoDia(inicioMes(hoje), -12), mesmoDia(hoje, -12)))),
    ano: comparar(soma(entre(vendas, ano, hoje)), soma(entre(vendas, anoAnt, mesmoDia(hoje, -12)))),
    doze: comparar(soma(v12), soma(v12ant)),
    vendas: comparar(v12.length, v12ant.length),
    ticket: comparar(ticket(v12), ticket(v12ant)),
    clientes: comparar(clientes(v12), clientes(v12ant)),
    novos: comparar(novos(somarDias(hoje, -364), hoje), novos(somarDias(hoje, -729), somarDias(hoje, -365))),
  };
}

/** Faturamento por mês nos últimos `n` meses, com o mesmo mês do ano anterior. */
export function serieMensal(vendas: Venda[], hoje: string, n = 12) {
  const porMes = new Map<string, number>();
  for (const v of vendas) porMes.set(v.data.slice(0, 7), (porMes.get(v.data.slice(0, 7)) ?? 0) + v.valor);
  return mesesAte(hoje, n).map((m) => ({ mes: m, atual: r2(porMes.get(m) ?? 0), anoAnterior: r2(porMes.get(mesmoDia(`${m}-01`, -12).slice(0, 7)) ?? 0) }));
}

export type LinhaABC = { chave: string; rotulo: string; valor: number; quantidade: number; vezes: number; pct: number; acumulado: number; classe: "A" | "B" | "C" };

/** Curva ABC: A = itens que somam os primeiros 80% do valor, B = até 95%, C = o resto. */
export function curvaABC(itens: { chave: string; rotulo: string; valor: number; quantidade?: number; vezes?: number }[]): LinhaABC[] {
  const total = itens.reduce((s, i) => s + i.valor, 0);
  let acum = 0;
  return [...itens].filter((i) => i.valor > 0).sort((a, b) => b.valor - a.valor).map((i) => {
    const antes = total ? acum / total : 0;
    acum += i.valor;
    return {
      chave: i.chave, rotulo: i.rotulo, valor: r2(i.valor), quantidade: i.quantidade ?? 0, vezes: i.vezes ?? 0,
      pct: total ? Math.round((i.valor / total) * 1000) / 10 : 0, acumulado: total ? Math.round((acum / total) * 1000) / 10 : 0,
      classe: antes < 0.8 ? "A" : antes < 0.95 ? "B" : "C",
    };
  });
}

export function resumoABC(linhas: LinhaABC[]) {
  const total = linhas.reduce((s, l) => s + l.valor, 0);
  return (["A", "B", "C"] as const).map((classe) => {
    const l = linhas.filter((x) => x.classe === classe);
    const valor = r2(l.reduce((s, x) => s + x.valor, 0));
    return { classe, itens: l.length, pctItens: linhas.length ? Math.round((l.length / linhas.length) * 100) : 0, valor, pctValor: total ? Math.round((valor / total) * 100) : 0 };
  });
}

export function produtosVendidos(vendas: Venda[]) {
  const m = new Map<string, { chave: string; rotulo: string; valor: number; quantidade: number; vezes: number }>();
  for (const v of vendas) for (const i of v.itens) {
    const x = m.get(i.chave) ?? { chave: i.chave, rotulo: i.descricao, valor: 0, quantidade: 0, vezes: 0 };
    x.valor += i.valor; x.quantidade += i.quantidade; x.vezes++;
    m.set(i.chave, x);
  }
  return [...m.values()];
}

export function clientesCompradores(vendas: Venda[]) {
  const m = new Map<string, { chave: string; rotulo: string; valor: number; vezes: number }>();
  for (const v of vendas) {
    const x = m.get(v.cliente) ?? { chave: v.cliente, rotulo: v.clienteNome, valor: 0, vezes: 0 };
    x.valor += v.valor; x.vezes++;
    m.set(v.cliente, x);
  }
  return [...m.values()];
}

/** Situação de cada cliente que já comprou (mesma regra da ficha do cliente). */
export function carteira(vendas: Venda[], hoje: string) {
  const grupos = new Map<string, Venda[]>();
  for (const v of vendas) grupos.set(v.cliente, [...(grupos.get(v.cliente) ?? []), v]);
  return [...grupos.entries()].map(([cliente, l]) => {
    const r = resumoCliente(l, [], hoje);
    return { cliente, clienteId: l[0].clienteId, nome: l[0].clienteNome, total: r.total, compras: r.compras, ultima: r.ultima, semComprar: r.semComprar, intervaloMedio: r.intervaloMedio, situacao: r.situacao, ultimos12m: r.ultimos12m };
  }).sort((a, b) => b.total - a.total);
}

/** Produtos que mais cresceram e mais caíram: últimos `janela` dias contra os `janela` dias anteriores. */
export function tendencias(vendas: Venda[], hoje: string, janela = 90, limite = 8) {
  const atual = produtosVendidos(entre(vendas, somarDias(hoje, -(janela - 1)), hoje));
  const ant = produtosVendidos(entre(vendas, somarDias(hoje, -(2 * janela - 1)), somarDias(hoje, -janela)));
  const chaves = new Set([...atual, ...ant].map((p) => p.chave));
  const linhas = [...chaves].map((k) => {
    const a = atual.find((p) => p.chave === k), b = ant.find((p) => p.chave === k);
    return { chave: k, rotulo: (a ?? b)!.rotulo, atual: r2(a?.valor ?? 0), anterior: r2(b?.valor ?? 0), variacao: variacao(a?.valor ?? 0, b?.valor ?? 0) };
  });
  return {
    subindo: linhas.filter((l) => l.atual > l.anterior).sort((x, y) => (y.atual - y.anterior) - (x.atual - x.anterior)).slice(0, limite),
    caindo: linhas.filter((l) => l.anterior > l.atual).sort((x, y) => (y.anterior - y.atual) - (x.anterior - x.atual)).slice(0, limite),
  };
}

type ProdutoG = { id: string; sku: string | null; descricao: string; ativo: boolean; kit?: boolean; fora_de_linha?: boolean; sob_encomenda?: boolean; estoque_atual: number; estoque_minimo: number; preco_custo: number; created_at?: string };

/** Estoque sem venda há `diasSemVenda` dias (produto cadastrado antes disso), pelo valor parado a custo. */
export function estoqueParado(produtos: ProdutoG[], vendas: Venda[], hoje: string, diasSemVenda = 180) {
  const corte = somarDias(hoje, -diasSemVenda);
  const vendidos = new Set(produtosVendidos(entre(vendas, corte, hoje)).map((p) => p.chave));
  return produtos
    .filter((p) => p.ativo && !p.kit && Number(p.estoque_atual) > 0 && !vendidos.has(p.sku ?? "") && !vendidos.has(p.id) && (!p.created_at || dia(p.created_at) < corte))
    .map((p) => {
      const ultima = vendas.find((v) => v.itens.some((i) => i.chave === p.sku || i.chave === p.id))?.data ?? null;
      return { id: p.id, sku: p.sku, descricao: p.descricao, estoque: Number(p.estoque_atual), valor: r2(Number(p.estoque_atual) * Number(p.preco_custo || 0)), ultimaVenda: ultima };
    })
    .sort((a, b) => b.valor - a.valor);
}

export type Gargalo = { chave: string; titulo: string; qtd: number; valor?: number; detalhe: string; rota: string; nivel: "erro" | "alerta" | "info" };
type DadosGargalo = {
  pedidos: { id: string; numero: number; status: string; valor_total: number; created_at: string; aprovado_em?: string | null; proposta_status?: string | null; notas?: { status: string; ambiente?: string | null }[] }[];
  expedicoes: { status: string; created_at: string }[];
  oss: { status: string; data_entrada: string }[];
  compras: { status: string; created_at: string; previsao_entrega?: string | null; valor_total?: number }[];
  receber: { status: string; vencimento: string; valor: number }[];
  pagar: { status: string; vencimento: string; valor: number }[];
  produtos: ProdutoG[];
  parado: ReturnType<typeof estoqueParado>;
};

const OS_FECHADA = ["concluida", "entregue", "cancelada"];
const EXPEDICAO_ABERTA = ["separar", "separando", "conferido", "embalado"];

/** Onde a operação está travando: cada ponto com quantidade, valor e a tela para resolver. */
export function gargalos(d: DadosGargalo, hoje: string): Gargalo[] {
  const out: Gargalo[] = [];
  const add = (g: Gargalo) => g.qtd > 0 && out.push(g);
  const total = (l: { valor_total?: number; valor?: number }[]) => r2(l.reduce((s, x) => s + Number(x.valor_total ?? x.valor ?? 0), 0));

  const orc = d.pedidos.filter((p) => p.status === "orcamento" && dias(p.created_at, hoje) > 7 && !["rejeitada", "expirada"].includes(p.proposta_status ?? ""));
  add({ chave: "orcamentos", titulo: "Orçamentos parados há mais de 7 dias", qtd: orc.length, valor: total(orc), rota: "/pedidos", nivel: "alerta",
    detalhe: "Sem resposta do cliente: ligue ou mande mensagem antes que esfriem." });

  const notaValida = (p: DadosGargalo["pedidos"][number]) => (p.notas ?? []).some((n) => n.status === "autorizada" && n.ambiente !== "homologacao");
  const semNf = d.pedidos.filter((p) => p.status === "aprovado" && !notaValida(p) && dias(p.aprovado_em ?? p.created_at, hoje) > 2);
  add({ chave: "sem_nf", titulo: "Vendas aprovadas sem nota fiscal há mais de 2 dias", qtd: semNf.length, valor: total(semNf), rota: "/fluxo", nivel: "erro",
    detalhe: "Venda parada antes do faturamento: emita a NF-e ou veja o que está faltando." });

  const exp = d.expedicoes.filter((e) => EXPEDICAO_ABERTA.includes(e.status) && dias(e.created_at, hoje) > 3);
  add({ chave: "expedicao", titulo: "Pedidos na expedição há mais de 3 dias", qtd: exp.length, rota: "/fluxo", nivel: "alerta",
    detalhe: "Separar, conferir ou embalar está atrasado." });

  const osVelhas = d.oss.filter((o) => !OS_FECHADA.includes(o.status) && dias(o.data_entrada, hoje) > 15);
  add({ chave: "os", titulo: "OS abertas há mais de 15 dias", qtd: osVelhas.length, rota: "/assistencia", nivel: "alerta",
    detalhe: `${osVelhas.filter((o) => o.status === "aguardando_peca").length} aguardando peça, ${osVelhas.filter((o) => o.status === "aguardando_aprovacao").length} aguardando aprovação do cliente.` });

  const atrasadas = d.compras.filter((c) => ["enviado", "parcial"].includes(c.status) && c.previsao_entrega && c.previsao_entrega < hoje);
  add({ chave: "compras", titulo: "Compras com entrega atrasada", qtd: atrasadas.length, valor: total(atrasadas), rota: "/producao", nivel: "alerta",
    detalhe: "Cobre o fornecedor: a falta pode travar produção e vendas." });
  const cotacoes = d.compras.filter((c) => c.status === "cotacao" && dias(c.created_at, hoje) > 5);
  add({ chave: "cotacoes", titulo: "Cotações de compra paradas há mais de 5 dias", qtd: cotacoes.length, valor: total(cotacoes), rota: "/producao", nivel: "info",
    detalhe: "Feche ou cancele a cotação." });

  const rec = d.receber.filter((c) => c.status === "aberto" && c.vencimento < hoje);
  add({ chave: "receber", titulo: "Contas a receber vencidas", qtd: rec.length, valor: total(rec), rota: "/financeiro", nivel: "erro", detalhe: "Cobrança atrasada." });
  const pag = d.pagar.filter((c) => c.status === "aberto" && c.vencimento < hoje);
  add({ chave: "pagar", titulo: "Contas a pagar vencidas", qtd: pag.length, valor: total(pag), rota: "/financeiro", nivel: "erro", detalhe: "Pague ou registre o pagamento para evitar juros." });

  const abaixo = d.produtos.filter((p) => p.ativo && !p.kit && !p.fora_de_linha && !p.sob_encomenda && Number(p.estoque_minimo) > 0 && Number(p.estoque_atual) < Number(p.estoque_minimo));
  add({ chave: "minimo", titulo: "Produtos abaixo do estoque mínimo", qtd: abaixo.length, rota: "/producao", nivel: "alerta",
    detalhe: "Veja a sugestão de compra em Produção e compras → Reposição de estoque." });

  add({ chave: "parado", titulo: "Estoque sem venda há 6 meses", qtd: d.parado.length, valor: r2(d.parado.reduce((s, p) => s + p.valor, 0)), rota: "/estoque", nivel: "info",
    detalhe: "Dinheiro parado: faça promoção, kit ou pare de comprar." });

  const peso = { erro: 0, alerta: 1, info: 2 };
  return out.sort((a, b) => peso[a.nivel] - peso[b.nivel]);
}
