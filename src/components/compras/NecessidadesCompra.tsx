// Compras → Necessidades de compra (como a do Tiny, com mais): cada produto com o estoque físico, o que vai entrar,
// o que já está prometido, o estoque virtual, as saídas do período, a cobertura em dias e quanto comprar.
// Mínimo e máximo se mudam na própria linha (grava no produto ao sair do campo). Os marcados viram ordens de compra
// em cotação, uma por fornecedor, na unidade escolhida. Imprimir e Excel levam a lista com os filtros aplicados.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpFromLine, Banknote, Barcode, CalendarClock, CheckCircle2, ChevronsDown, ChevronsUp, CircleDollarSign,
  FileDown, Hash, History, Info, Package, PackageCheck, PackageX, Printer, Ruler, Save, Scale, ShoppingCart, SlidersHorizontal, Sparkles, Timer, TrendingDown, Truck, X,
  type LucideIcon,
} from "lucide-react";
import { Button, Card, Field, MaisAcoes, Modal, Stat, Table } from "@/components/ui";
import { PdfViewer } from "@/components/PdfViewer";
import { confirmar } from "@/components/Dialogos";
import { useInvalidate, useRows, semUnificados } from "@/lib/data";
import { criarComItens, desfazerCompra } from "@/lib/itens";
import { supabase } from "@/lib/supabase";
import { brl, hoje, pl, somarDias } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { CampoUnidade, useUnidade } from "@/lib/unidade";
import { usePerfil } from "@/lib/auth";
import { useConfig } from "@/lib/useConfig";
import { comUnidade, pdfNecessidadesCompra } from "@/lib/pdf";
import { baixarPlanilha } from "@/lib/exportar";
import { combinaBusca } from "@/lib/buscaCliente";
import type { LinhaFicha } from "@/lib/estrutura";
import type { VinculoFornecedor } from "@/lib/reposicao";
import type { Fornecedor, KitComponente, Produto } from "@/lib/types";
import {
  OP_ABERTA, OS_ABERTA, PERIODOS, calcularNecessidades, gruposDeCompra, ordenarNecessidades, sugerirMinMax,
  type ChaveOrdem, type CompraNec, type EstoqueUnidade, type ItemEscolhido, type LinhaNecessidade, type Motivo, type MovimentoNec,
  type OpNec, type OsNec, type TipoDoc, type VendaNec,
} from "@/lib/necessidadesCompra";

const TIPOS: Record<string, string> = { peca: "Peças de reposição", acessorio: "Acessórios", insumo: "Componentes de produção", maquina: "Máquinas" };
const MOTIVO: Record<Motivo, string> = {
  negativo: "estoque negativo", zerado: "sem estoque", pedidos: "para atender pedidos", abaixo_minimo: "abaixo do mínimo", ponto_reposicao: "no ponto de reposição",
};
const DOC: Record<TipoDoc, string> = { pedido: "Venda", op: "Peças da OP", os: "Peças da OS", compra: "Pedido de compra", cotacao: "Em cotação", producao: "Ordem de produção" };

/** Uma frase por coluna: aparece no ⓘ do cabeçalho e no "Como cada número é calculado". */
const DICAS: Record<string, [string, string]> = {
  produto: ["Produto", "Nome do cadastro. O aviso vermelho marca o crítico: sem estoque ou acaba antes de a compra chegar."],
  sku: ["Código (SKU)", "Código interno do produto."],
  gtin: ["GTIN/EAN", "Código de barras do cadastro."],
  fornecedor: ["Fornecedor padrão", "O do cadastro do produto. Sem ele, o primeiro fornecedor ligado ao produto (aparece \"ligado\")."],
  unidade: ["Un", "Unidade de medida (UN, KG, M…)."],
  custo: ["Custo médio", "Média do que foi pago nos pedidos de compra recebidos nos últimos 12 meses. Sem compra recebida no ERP, vale o custo do cadastro (última compra)."],
  entradas: ["Entradas previstas", "Pedidos de compra confirmados e ainda não recebidos, mais ordens de produção abertas deste item. Cotação ainda não confirmada aparece embaixo e não conta aqui."],
  saidasPrevistas: ["Saídas previstas", "O que já foi prometido e ainda não saiu do estoque: vendas aprovadas sem baixa, peças das ordens de produção abertas e das OS aprovadas. Toque no número para ver os documentos."],
  fisico: ["Estoque físico", "O que há hoje no estoque (da unidade escolhida ou de todas). Fica negativo quando saiu mais do que entrou."],
  virtual: ["Estoque virtual", "Estoque físico + entradas previstas − saídas previstas: o que sobra depois de entregar o que foi prometido."],
  minimo: ["Estoque mínimo", "Mínimo do cadastro. Mude aqui e saia do campo para gravar."],
  maximo: ["Estoque máximo", "Máximo do cadastro: a compra sugerida enche até ele. Mude aqui e saia do campo para gravar."],
  saidasPeriodo: ["Saídas do período", "Quanto saiu no período dos filtros (vendas, OS, produção e baixas). Transferência entre unidades não conta; venda cancelada volta."],
  consumo: ["Média de saídas", "Média por mês no período (embaixo, por dia)."],
  cobertura: ["Cobertura", "Quantos dias o estoque virtual dura no ritmo das saídas do período. Em vermelho: acaba antes do prazo do fornecedor."],
  prazo: ["Prazo", "Dias que o fornecedor leva para entregar (cadastro do produto; sem ele, 15 dias)."],
  necessidade: ["Comprar", "Quanto comprar para chegar ao máximo (ou ao mínimo + 30 dias de saídas), descontando o que já está em cotação. Respeita a compra mínima. Dá para mudar antes de gerar a ordem."],
  valor: ["Valor estimado", "Quantidade a comprar × custo médio."],
};

/** Cabeçalho curto (ícone + palavra) para as colunas não ficarem largas; o nome inteiro e a explicação aparecem ao passar o mouse. */
const CURTO: Partial<Record<string, [LucideIcon, string]>> = {
  sku: [Hash, "SKU"], gtin: [Barcode, "EAN"], fornecedor: [Truck, "Forn."], unidade: [Ruler, "Un"], custo: [CircleDollarSign, "Custo"],
  entradas: [ArrowDownToLine, "Entra"], saidasPrevistas: [ArrowUpFromLine, "Sai"], fisico: [Package, "Físico"], virtual: [PackageCheck, "Virtual"],
  minimo: [ChevronsDown, "Mín"], maximo: [ChevronsUp, "Máx"], saidasPeriodo: [History, "Saídas"], consumo: [TrendingDown, "Média"],
  cobertura: [CalendarClock, "Cobre"], prazo: [Timer, "Prazo"], necessidade: [ShoppingCart, "Comprar"], valor: [Banknote, "Valor"],
};

type Campo = "estoque_minimo" | "estoque_maximo";
type Rascunho = Partial<Record<Campo, { valor: string; manual: boolean }>>;
type Filtros = { categoria: string; tipo: string; fornecedor: string; soPrecisa: boolean; zerados: boolean; inativos: boolean; criticos: boolean };
const FILTROS_PADRAO: Filtros = { categoria: "", tipo: "", fornecedor: "", soPrecisa: true, zerados: false, inativos: false, criticos: false };
const PERIODO_PADRAO = 90;
// a caixinha e o nome do produto ficam parados ao rolar a tabela para o lado (as colunas de compra ficam à direita)
const FIXA_SEL = "sticky left-0 z-[1] w-10 min-w-[2.5rem] max-w-[2.5rem] !px-3";
const FIXA_PROD = "sticky left-10 z-[1] shadow-[1px_0_0_rgb(var(--slate-200))]";
const POR_VEZ = 200;

const fmt = (v: number, casas = 2) => v.toLocaleString("pt-BR", { maximumFractionDigits: casas });
const num = (v: string) => Number(String(v).trim().replace(",", "."));
/** número no campo do jeito brasileiro (2,5) */
const noCampo = (v: number) => String(v).replace(".", ",");

export function NecessidadesCompra({ podeComprar, aoGerar, aoCotar }: {
  podeComprar: boolean;
  /** depois de gerar as ordens: "Ver pedidos de compra" */
  aoGerar: () => void;
  aoCotar?: (itens: { produto_id: string; quantidade: number }[]) => void;
}) {
  const { pode, tem } = usePerfil();
  // o perfil Marketplaces edita produto, mas o banco não deixa mudar estoque mínimo e máximo; o Compras muda (só esses campos)
  const podeMinMax = (pode("editar_produtos") && tem("financeiro")) || tem("compras");
  const { unidades, atual, padrao, nome: nomeUnidade } = useUnidade();
  const { data: cfg } = useConfig();
  const invalidate = useInvalidate();
  const dia = hoje();

  // ---- filtros (a unidade começa na escolhida no topo do ERP)
  const [busca, setBusca] = useState("");
  const [painel, setPainel] = useState(false);
  const [f, setF] = useState<Filtros>(FILTROS_PADRAO);
  const [unidade, setUnidade] = useState<string | null>(atual);
  useEffect(() => setUnidade(atual), [atual]);
  const [periodo, setPeriodo] = useState<number>(PERIODO_PADRAO);
  const [ordem, setOrdem] = useState<{ chave: ChaveOrdem; asc: boolean }>({ chave: "prioridade", asc: true });

  // ---- dados (o que já tem baixa no estoque fica de fora das saídas previstas)
  const desde = somarDias(-periodo - 1);
  const umAno = somarDias(-366);
  const { data: produtos = [], isLoading } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: estoqueUnidade = [] } = useRows<EstoqueUnidade>("estoque_unidade", { select: "produto_id, unidade_id, quantidade", order: "produto_id" });
  const { data: movimentos = [] } = useRows<MovimentoNec>("estoque_movimentos", {
    select: "produto_id, tipo, quantidade, created_at, referencia_tipo, unidade_id", key: ["necessidades", desde],
    filtro: (q) => q.in("tipo", ["saida", "entrada"]).gte("created_at", desde),
  });
  const selCompra = "id, numero, status, unidade_id, created_at, enviado_em, fornecedor:fornecedores(nome), itens:pedido_compra_itens(produto_id, quantidade, quantidade_recebida, custo_unitario)";
  const { data: comprasAbertas = [] } = useRows<CompraNec>("pedidos_compra", { select: selCompra, key: ["necessidades", "abertas"], filtro: (q) => q.in("status", ["cotacao", "enviado", "parcial"]) });
  const { data: comprasRecebidas = [] } = useRows<CompraNec>("pedidos_compra", {
    select: selCompra, key: ["necessidades", "recebidas", umAno], filtro: (q) => q.in("status", ["parcial", "recebido"]).gte("created_at", umAno),
  });
  const { data: vendas = [] } = useRows<VendaNec>("pedidos", {
    select: "id, numero, unidade_id, cliente:clientes(nome), itens:pedido_itens(produto_id, quantidade, kit_escolha)", key: ["necessidades"],
    filtro: (q) => q.eq("status", "aprovado").eq("estoque_baixado", false),
  });
  const { data: ops = [] } = useRows<OpNec>("ordens_producao", {
    select: "id, numero, status, unidade_id, produto_id, quantidade, produto:produtos(descricao)", key: ["necessidades"], filtro: (q) => q.in("status", OP_ABERTA),
  });
  const { data: oss = [] } = useRows<OsNec>("ordens_servico", {
    select: "id, numero, status, unidade_id, equipamento, orcamento_aprovado_em, estoque_baixado, itens:os_itens(produto_id, quantidade)", key: ["necessidades"],
    filtro: (q) => q.eq("estoque_baixado", false).in("status", OS_ABERTA),
  });
  const { data: fichas = [] } = useRows<LinhaFicha>("produto_componentes", { select: "produto_id, componente_id, quantidade", order: "produto_id" });
  const { data: kits = [] } = useRows<KitComponente>("kit_componentes", { order: "kit_id" });
  const { data: vinculos = [] } = useRows<VinculoFornecedor>("produto_fornecedor", { select: "produto_id, fornecedor_id", order: "produto_id" });
  const { data: fornecedoresTodos = [] } = useRows<Fornecedor>("fornecedores", { order: "nome", ascending: true });
  const fornecedores = semUnificados(fornecedoresTodos);
  const nomeForn = (id: string | null) => (id ? fornecedoresTodos.find((x) => x.id === id)?.nome ?? "Fornecedor" : "");

  // ---- mínimo/máximo digitados (rascunho) e os já gravados nesta tela (até a lista do servidor voltar)
  const [mm, setMm] = useState<Record<string, Rascunho>>({});
  const [salvos, setSalvos] = useState<Record<string, Partial<Record<Campo, number>>>>({});
  const [gravando, setGravando] = useState(false);
  const produtosAtuais = useMemo(() => (Object.keys(salvos).length ? produtos.map((p) => (salvos[p.id] ? { ...p, ...salvos[p.id] } : p)) : produtos), [produtos, salvos]);
  const salvo = (p: Produto, c: Campo) => Number(p[c] ?? 0) || 0;
  const pendente = (p: Produto, c: Campo) => {
    const r = mm[p.id]?.[c];
    return !!r && r.valor.trim() !== "" && num(r.valor) !== salvo(p, c);
  };
  const ajustes = useMemo(() => {
    const a: Record<string, { minimo?: number; maximo?: number }> = {};
    for (const [id, r] of Object.entries(mm)) {
      const mi = r.estoque_minimo && num(r.estoque_minimo.valor), ma = r.estoque_maximo && num(r.estoque_maximo.valor);
      a[id] = { ...(typeof mi === "number" && mi >= 0 ? { minimo: mi } : {}), ...(typeof ma === "number" && ma >= 0 ? { maximo: ma } : {}) };
    }
    return a;
  }, [mm]);

  const compras = useMemo(() => [...new Map([...comprasAbertas, ...comprasRecebidas].map((c) => [c.id, c])).values()], [comprasAbertas, comprasRecebidas]);
  const linhas = useMemo(() => calcularNecessidades({
    produtos: produtosAtuais, hoje: dia, periodoDias: periodo, unidade, estoqueUnidade, movimentos, compras, vendas, ops, oss, fichas, kits, vinculos, ajustes,
  }), [produtosAtuais, dia, periodo, unidade, estoqueUnidade, movimentos, compras, vendas, ops, oss, fichas, kits, vinculos, ajustes]);

  // ---- seleção e quantidade a comprar (editável)
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const quant = (l: LinhaNecessidade) => (qtd[l.produto.id] !== undefined ? Math.max(0, num(qtd[l.produto.id]) || 0) : l.necessidade);

  // recorte pelos filtros (sem "só o que precisa" e "só críticos": os indicadores contam sobre ele)
  const recorte = useMemo(() => linhas.filter((l) => {
    const p = l.produto;
    if (!f.inativos && p.ativo === false) return false;
    if (!f.zerados && l.semMovimento) return false;
    if (f.categoria && (p.categoria ?? "").trim() !== f.categoria) return false;
    if (f.tipo && p.tipo !== f.tipo) return false;
    if (f.fornecedor && (f.fornecedor === "-" ? !!l.fornecedor_id : l.fornecedor_id !== f.fornecedor)) return false;
    return !busca.trim() || combinaBusca([p.descricao, p.sku, p.codigo_barras, p.codigo_fabricante, p.codigos_alternativos], busca);
  }), [linhas, f, busca]);
  const visiveis = useMemo(() => {
    // linha marcada ou com mínimo/máximo sendo mudado não some no meio da edição
    const fica = (l: LinhaNecessidade) => sel.has(l.produto.id) || !!mm[l.produto.id];
    const lista = recorte.filter((l) => (!f.soPrecisa || l.necessidade > 0 || fica(l)) && (!f.criticos || l.critico || fica(l)));
    return ordem.chave === "prioridade" && ordem.asc ? lista : ordenarNecessidades(lista, ordem.chave, ordem.asc, nomeForn);
  }, [recorte, f.soPrecisa, f.criticos, sel, mm, ordem, fornecedoresTodos]); // eslint-disable-line react-hooks/exhaustive-deps
  const [limite, setLimite] = useState(POR_VEZ);
  useEffect(() => setLimite(POR_VEZ), [f, busca, ordem, unidade, periodo]);
  // a seleção só guarda o que está na lista
  useEffect(() => {
    const ids = new Set(visiveis.map((l) => l.produto.id));
    setSel((s) => ([...s].every((id) => ids.has(id)) ? s : new Set([...s].filter((id) => ids.has(id)))));
  }, [visiveis]);

  const marcados = visiveis.filter((l) => sel.has(l.produto.id));
  const todosMarcados = visiveis.length > 0 && marcados.length === visiveis.length;
  const marcar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const marcarTodos = () => setSel(todosMarcados ? new Set() : new Set(visiveis.map((l) => l.produto.id)));
  const valorMarcados = marcados.reduce((s, l) => s + (l.acao === "comprar" ? quant(l) * l.custo : 0), 0);

  // ---- indicadores
  const precisam = recorte.filter((l) => l.necessidade > 0 && l.acao === "comprar");
  const criticos = recorte.filter((l) => l.critico);
  const negativos = recorte.filter((l) => l.fisico < 0);

  // ---- listas dos filtros
  const categorias = useMemo(() => [...new Set(produtos.map((p) => (p.categoria ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [produtos]);
  const fornecedoresLista = useMemo(() => [...new Set(linhas.map((l) => l.fornecedor_id).filter((x): x is string => !!x))]
    .map((id) => ({ id, nome: nomeForn(id) })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), [linhas, fornecedoresTodos]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtrosAtivos = [f.categoria, f.tipo, f.fornecedor, f.criticos, f.zerados, f.inativos, !f.soPrecisa, periodo !== PERIODO_PADRAO, unidade !== atual].filter(Boolean).length;
  const textoFiltros = () => [
    unidade ? nomeUnidade(unidade) : unidades.length > 1 ? "todas as unidades" : "",
    `saídas dos últimos ${periodo} dias`, f.soPrecisa && "só o que precisa comprar", f.criticos && "só críticos",
    f.categoria && `categoria ${f.categoria}`, f.tipo && (TIPOS[f.tipo] ?? f.tipo).toLowerCase(),
    f.fornecedor && (f.fornecedor === "-" ? "sem fornecedor" : nomeForn(f.fornecedor)), f.inativos && "com inativos", f.zerados && "com zerados e sem movimento",
    busca.trim() && `busca "${busca.trim()}"`,
  ].filter(Boolean).join(" · ");

  // ---- mínimo e máximo: grava no produto
  async function gravarProduto(p: Produto, campos: Partial<Record<Campo, number>>) {
    const { error } = await supabase.from("produtos").update(campos).eq("id", p.id);
    if (error) throw error;
    setSalvos((s) => ({ ...s, [p.id]: { ...s[p.id], ...campos } }));
    setMm((m) => {
      const r = { ...m[p.id] };
      for (const c of Object.keys(campos) as Campo[]) delete r[c];
      const n = { ...m };
      if (Object.keys(r).length) n[p.id] = r; else delete n[p.id];
      return n;
    });
  }
  function mudarCampo(p: Produto, c: Campo, valor: string) {
    setMm((m) => ({ ...m, [p.id]: { ...m[p.id], [c]: { valor, manual: true } } }));
  }
  /** Saiu do campo: grava o que a pessoa digitou (sugestão só grava pelo botão). */
  async function sairDoCampo(p: Produto, c: Campo) {
    const r = mm[p.id]?.[c];
    if (!r?.manual) return;
    if (r.valor.trim() === "" || !pendente(p, c)) {
      setMm((m) => { const x = { ...m[p.id] }; delete x[c]; const n = { ...m }; if (Object.keys(x).length) n[p.id] = x; else delete n[p.id]; return n; });
      return;
    }
    const v = num(r.valor);
    if (!Number.isFinite(v) || v < 0) return notify("Digite um número igual ou maior que zero", "erro");
    try {
      await gravarProduto(p, { [c]: v });
      const outro = c === "estoque_minimo" ? salvo(p, "estoque_maximo") : salvo(p, "estoque_minimo");
      const [mi, ma] = c === "estoque_minimo" ? [v, outro] : [outro, v];
      notify(`${c === "estoque_minimo" ? "Mínimo" : "Máximo"} de ${p.descricao} gravado: ${fmt(v)}${ma > 0 && mi > ma ? ". Atenção: o máximo está menor que o mínimo" : ""}`);
      invalidate("produtos");
    } catch (e) {
      notifyError(e);
    }
  }
  const comPendencia = linhas.filter((l) => pendente(l.produto, "estoque_minimo") || pendente(l.produto, "estoque_maximo"));
  function sugerir() {
    const alvo = marcados.length ? marcados : visiveis;
    const novos: Record<string, Rascunho> = {};
    for (const l of alvo) {
      const s = sugerirMinMax(l.consumoDia, l.prazo);
      if (!s) continue;
      const p = l.produto;
      const r: Rascunho = {};
      if (s.minimo !== salvo(p, "estoque_minimo")) r.estoque_minimo = { valor: String(s.minimo), manual: false };
      if (s.maximo !== salvo(p, "estoque_maximo")) r.estoque_maximo = { valor: String(s.maximo), manual: false };
      if (Object.keys(r).length) novos[p.id] = r;
    }
    const n = Object.keys(novos).length;
    if (!n) return notify(`Nenhum ${marcados.length ? "produto marcado" : "produto da lista"} com saídas no período para sugerir (ou já está igual).`, "erro");
    setMm((m) => ({ ...m, ...novos }));
    notify(`Sugestão preenchida em ${n} ${pl(n, "produto", "produtos")}. Revise e toque em "Gravar mínimo e máximo".`);
  }
  async function gravarPendentes() {
    const lista = marcados.length ? comPendencia.filter((l) => sel.has(l.produto.id)) : comPendencia;
    if (!lista.length) return notify("Nenhum dos produtos marcados tem mínimo ou máximo para gravar", "erro");
    if (!(await confirmar(`Gravar o mínimo e o máximo de ${lista.length} ${pl(lista.length, "produto", "produtos")} no cadastro?`, { ok: "Gravar" }))) return;
    setGravando(true);
    let ok = 0;
    const erros: string[] = [];
    try {
      for (let i = 0; i < lista.length; i += 8) {
        await Promise.all(lista.slice(i, i + 8).map(async (l) => {
          const campos: Partial<Record<Campo, number>> = {};
          for (const c of ["estoque_minimo", "estoque_maximo"] as Campo[]) if (pendente(l.produto, c)) campos[c] = num(mm[l.produto.id]![c]!.valor);
          try { await gravarProduto(l.produto, campos); ok++; } catch (e) { erros.push(`${l.produto.descricao}: ${(e as Error).message ?? e}`); }
        }));
      }
    } finally {
      setGravando(false);
      invalidate("produtos");
    }
    if (erros.length) notify(`${ok} ${pl(ok, "gravado", "gravados")}. Não gravou: ${erros.slice(0, 3).join("; ")}${erros.length > 3 ? "…" : ""}`, "erro");
    else notify(`Mínimo e máximo gravados em ${ok} ${pl(ok, "produto", "produtos")}`);
  }

  // ---- ordens de compra
  const [gerar, setGerar] = useState<ItemEscolhido[] | null>(null);
  const [criadas, setCriadas] = useState<{ numero: number | string | null | undefined; fornecedor: string }[] | null>(null);
  const escolhidos = () => marcados.map((l) => ({ linha: l, quantidade: quant(l) }));

  // ---- detalhe das entradas e saídas previstas
  const [detalhe, setDetalhe] = useState<LinhaNecessidade | null>(null);

  // ---- imprimir e Excel (os marcados ou a lista toda, como está na tela)
  const [pdf, setPdf] = useState<Blob | null>(null);
  const paraRelatorio = () => (marcados.length ? marcados : visiveis);
  async function imprimir() {
    if (!cfg) return;
    try {
      setPdf(await pdfNecessidadesCompra({
        filtros: `${textoFiltros()}${marcados.length ? ` · ${marcados.length} marcados` : ""}`, periodo,
        linhas: paraRelatorio().map((l) => ({
          produto: l.produto.descricao, codigos: [l.produto.sku, l.produto.codigo_barras].filter(Boolean).join(" · "), fornecedor: nomeForn(l.fornecedor_id),
          unidade: l.produto.unidade, custo: l.custo, entradas: l.entradas, saidas: l.saidasPrevistas, fisico: l.fisico, virtual: l.virtual,
          minimo: l.minimo, maximo: l.maximo, saidasPeriodo: l.saidasPeriodo, mediaMes: l.consumoMes, cobertura: l.coberturaDias, prazo: l.prazo,
          comprar: quant(l), valor: l.acao === "comprar" ? quant(l) * l.custo : 0, critico: l.critico, produzir: l.acao === "produzir",
        })),
      }, comUnidade(cfg, unidades.find((u) => u.id === unidade))));
    } catch (e) { notifyError(e); }
  }
  function exportar() {
    const r1 = (v: number) => Math.round(v * 1000) / 1000;
    baixarPlanilha("necessidades-de-compra", [{ nome: "Necessidades de compra", linhas: paraRelatorio().map((l) => ({
      Produto: l.produto.descricao, "Código (SKU)": l.produto.sku ?? "", "GTIN/EAN": l.produto.codigo_barras ?? "", "Fornecedor padrão": nomeForn(l.fornecedor_id),
      Un: l.produto.unidade, "Custo médio": l.custo, "Origem do custo": l.origemCusto === "compras" ? "compras dos últimos 12 meses" : "cadastro",
      "Entradas previstas": l.entradas, "Em cotação": l.emCotacao, "Saídas previstas": l.saidasPrevistas, "Estoque físico": l.fisico,
      "Estoque virtual": l.virtual, "Estoque mínimo": l.minimo, "Estoque máximo": l.maximo, [`Saídas (${periodo} dias)`]: l.saidasPeriodo,
      "Média por dia": r1(l.consumoDia), "Média por mês": r1(l.consumoMes), "Cobertura (dias)": l.coberturaDias ?? "", "Prazo (dias)": l.prazo,
      "Comprar": quant(l), "Valor estimado": l.acao === "comprar" ? Math.round(quant(l) * l.custo * 100) / 100 : "",
      Situação: [l.critico && "crítico", l.motivo && MOTIVO[l.motivo], l.acao === "produzir" && "fazer OP", l.acao === "nao_compra" && "fora de linha"].filter(Boolean).join(", "),
      Categoria: l.produto.categoria ?? "", Tipo: TIPOS[l.produto.tipo] ?? l.produto.tipo, Unidade: unidade ? nomeUnidade(unidade) : "Todas",
    })) }]).catch(notifyError);
  }

  const ordenarPor = (chave: ChaveOrdem) => setOrdem((o) => (o.chave === chave ? { chave, asc: !o.asc } : { chave, asc: true }));
  /** Cabeçalho curto que ordena ao tocar; ao passar o mouse (ou focar), um aviso com o nome inteiro e como o número é calculado.
   *  (função, não componente: o aviso aberto não fecha a cada tecla) */
  const th = (id: ChaveOrdem, direita = false, extra = "") => {
    const ativo = ordem.chave === id;
    const nome = id === "saidasPeriodo" ? `Saídas (${periodo} dias)` : DICAS[id][0];
    const curto = CURTO[id];
    const Icone = curto?.[0];
    return (
      <th className={`th whitespace-nowrap ${direita ? "text-right" : ""} ${extra}`} aria-sort={ativo ? (ordem.asc ? "ascending" : "descending") : undefined}>
        <span className={`group relative inline-flex items-center ${direita ? "justify-end" : ""}`}>
          <button type="button" onClick={() => ordenarPor(id)} aria-label={`${nome}: ordenar por esta coluna`}
            className={`inline-flex items-center gap-1 uppercase hover:text-fg ${ativo ? "text-fg" : ""}`}>
            {Icone && <Icone size={14} aria-hidden className="shrink-0" />}
            {curto ? (id === "saidasPeriodo" ? `${periodo}d` : curto[1]) : nome}
            {ativo && (ordem.asc ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
          </button>
          <span role="tooltip" className={`pointer-events-none absolute top-full z-30 mt-1.5 hidden w-64 whitespace-normal rounded-lg border-l-4 border-amber-400 bg-surface p-2.5 text-left text-xs font-normal normal-case tracking-normal text-slate-700 shadow-card ring-1 ring-slate-200 group-hover:block group-focus-within:block ${direita ? "right-0" : "left-0"}`}>
            <b className="mb-0.5 flex items-center gap-1 text-fg"><Info size={13} aria-hidden className="text-amber-500" />{nome}</b>
            {DICAS[id][1]}
          </span>
        </span>
      </th>
    );
  };

  const campoMinMax = (l: LinhaNecessidade, c: Campo, classe = "w-[4.5rem]") => {
    const p = l.produto;
    const r = mm[p.id]?.[c];
    const valor = r?.valor ?? noCampo(c === "estoque_minimo" ? l.minimo : l.maximo);
    if (!podeMinMax) return <span className="num">{fmt(c === "estoque_minimo" ? l.minimo : l.maximo)}</span>;
    const pend = pendente(p, c);
    return (
      <input className={`input ${classe} py-1 text-right ${pend ? "!border-amber-500 bg-amber-50" : ""}`} inputMode="decimal" value={valor}
        aria-label={`${c === "estoque_minimo" ? "Estoque mínimo" : "Estoque máximo"} de ${p.descricao}`}
        title={pend && !r?.manual ? "Sugestão ainda não gravada" : undefined}
        onChange={(e) => mudarCampo(p, c, e.target.value)} onBlur={() => sairDoCampo(p, c)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
    );
  };
  const campoQtd = (l: LinhaNecessidade, classe = "w-20") => (podeComprar && l.acao === "comprar" ? (
    <input className={`input ${classe} py-1 text-right font-semibold`} inputMode="decimal" value={qtd[l.produto.id] ?? noCampo(l.necessidade)}
      aria-label={`Quantidade a comprar de ${l.produto.descricao}`} onChange={(e) => setQtd({ ...qtd, [l.produto.id]: e.target.value })} />
  ) : <span className="num font-semibold">{l.necessidade ? fmt(l.necessidade) : "—"}</span>);
  const selos = (l: LinhaNecessidade) => (
    <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] font-semibold">
      {l.motivo && <span className={`inline-flex items-center gap-1 ${l.critico ? "text-red-600" : "text-amber-700"}`}>{l.critico && <AlertTriangle size={12} aria-hidden />}{MOTIVO[l.motivo]}{l.critico && l.motivo !== "zerado" && l.motivo !== "negativo" ? " · acaba antes de chegar" : ""}</span>}
      {l.acao === "produzir" && <span className="rounded-full bg-purple-100 px-1.5 text-purple-800">fazer OP</span>}
      {l.acao === "nao_compra" && <span className="rounded-full bg-slate-100 px-1.5 text-slate-600">fora de linha</span>}
      {l.produto.sob_encomenda && <span className="rounded-full bg-sky-100 px-1.5 text-sky-800">sob encomenda</span>}
      {l.produto.ativo === false && <span className="rounded-full bg-slate-100 px-1.5 text-slate-600">inativo</span>}
    </span>
  );
  const botaoNumero = (l: LinhaNecessidade, v: number, cor: string, rotulo: string) => (v ? (
    <button type="button" onClick={() => setDetalhe(l)} className={`num font-semibold underline decoration-dotted underline-offset-2 ${cor}`} title={`Ver de onde vêm as ${rotulo}`}>{fmt(v)}</button>
  ) : <span className="num text-slate-400">0</span>);
  const corVirtual = (l: LinhaNecessidade) => (l.virtual < 0 ? "text-red-600" : l.minimo > 0 && l.virtual < l.minimo ? "text-amber-700" : "text-fg");
  const corCobertura = (l: LinhaNecessidade) => (l.coberturaDias !== null && l.coberturaDias < l.prazo ? "font-semibold text-red-600" : "");
  const notaOutras = (l: LinhaNecessidade) => (l.emOutras > 0 && l.necessidade > 0
    ? <span className="block text-[11px] text-sky-700">outra unidade tem {fmt(l.emOutras)}: dá para transferir</span> : null);
  const fornecedorTexto = (l: LinhaNecessidade) => (l.fornecedor_id
    ? <>{nomeForn(l.fornecedor_id)}{l.fornecedorVinculo && <span className="block text-[11px] text-slate-500">ligado (sem padrão)</span>}</>
    : <span className="text-amber-700">sem fornecedor</span>);

  const lista = visiveis.slice(0, limite);
  const vazio = !isLoading && !visiveis.length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={ShoppingCart} tom={precisam.length ? "atencao" : "neutro"} label="Precisam de compra" valor={precisam.length}
          sub={`de ${recorte.length} ${pl(recorte.length, "produto", "produtos")} no filtro`} onClick={() => setF((x) => ({ ...x, soPrecisa: true, criticos: false }))} />
        <Stat icon={AlertTriangle} tom={criticos.length ? "critico" : "neutro"} label="Críticos" valor={criticos.length}
          sub={f.criticos ? "mostrando só eles · tocar volta" : "zerados ou acabam antes de chegar"} onClick={() => setF((x) => ({ ...x, criticos: !x.criticos }))} />
        <Stat icon={TrendingDown} label="Compra sugerida" valor={brl(precisam.reduce((s, l) => s + quant(l) * l.custo, 0))} sub="pelo custo médio" />
        <Stat icon={PackageX} tom={negativos.length ? "critico" : "neutro"} label="Estoque negativo" valor={negativos.length} sub="saiu mais do que entrou: confira" />
      </div>

      {criadas && (
        <Card className="flex flex-wrap items-center gap-3 border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 size={18} className="shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            {pl(criadas.length, "Ordem de compra criada", "Ordens de compra criadas")} em cotação: {criadas.map((c) => `#${c.numero ?? "?"}${c.fornecedor ? ` (${c.fornecedor})` : ""}`).join(", ")}.
          </span>
          <Button variant="secondary" onClick={aoGerar}>Ver pedidos de compra</Button>
          <button type="button" className="rounded-lg p-1.5 hover:bg-emerald-100" aria-label="Fechar aviso" onClick={() => setCriadas(null)}><X size={16} aria-hidden /></button>
        </Card>
      )}

      {/* busca, filtros e ações; no celular as secundárias ficam em "Mais" */}
      <div className="flex flex-wrap items-center gap-2">
        <input className="input min-w-0 flex-1 basis-56 md:max-w-md" placeholder="Buscar por descrição, SKU ou GTIN…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar produto" />
        <button type="button" onClick={() => setPainel((a) => !a)} aria-expanded={painel}
          className={`inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold ${painel || filtrosAtivos ? "border-brand text-brand" : "border-slate-300 text-fg"}`}>
          <SlidersHorizontal size={16} aria-hidden /> {painel ? "Fechar filtros" : "Filtros"}
          {filtrosAtivos > 0 && <span className="rounded-full bg-brand px-1.5 text-xs leading-5 text-white">{filtrosAtivos}</span>}
        </button>
        <div className="hidden flex-1 md:block" />
        <MaisAcoes>
          <Button variant="secondary" onClick={sugerir} disabled={!podeMinMax} title={podeMinMax ? "Preenche mínimo e máximo pelo consumo (sem gravar), nos marcados ou na lista toda" : "Seu perfil não muda o cadastro de produtos"}>
            <Sparkles size={16} aria-hidden /> Sugerir mínimo e máximo pelo consumo
          </Button>
          <Button variant="secondary" onClick={imprimir} disabled={!visiveis.length}><Printer size={16} aria-hidden /> Imprimir</Button>
          <Button variant="secondary" onClick={exportar} disabled={!visiveis.length}><FileDown size={16} aria-hidden /> Baixar Excel</Button>
        </MaisAcoes>
        {podeComprar && (
          <Button disabled={!marcados.length} onClick={() => setGerar(escolhidos())} title={marcados.length ? undefined : "Marque os produtos na lista"}>
            <ShoppingCart size={16} aria-hidden /> <span className="sm:hidden">Gerar OC</span><span className="hidden sm:inline">Gerar ordem de compra dos selecionados</span>
            {marcados.length > 0 && <span className="rounded-full bg-white/25 px-1.5 text-xs leading-5">{marcados.length}</span>}
          </Button>
        )}
      </div>

      {painel && (
        <Card className="p-3">
          <div className="grid grid-cols-2 gap-x-2 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="Categoria">
              <select className="input" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
                <option value="">Todas</option>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Tipo">
              <select className="input" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
                <option value="">Todos</option>
                {Object.entries(TIPOS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select>
            </Field>
            <Field label="Fornecedor padrão">
              <select className="input" value={f.fornecedor} onChange={(e) => setF({ ...f, fornecedor: e.target.value })}>
                <option value="">Todos</option>
                <option value="-">Sem fornecedor</option>
                {fornecedoresLista.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </Field>
            {unidades.length > 1 && (
              <Field label="Estoque da unidade">
                <select className="input" value={unidade ?? ""} onChange={(e) => setUnidade(e.target.value || null)}>
                  <option value="">Todas (soma)</option>
                  {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </Field>
            )}
            <Field label="Saídas do período">
              <select className="input" value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))}>
                {PERIODOS.map((p) => <option key={p} value={p}>Últimos {p} dias</option>)}
              </select>
            </Field>
            <Field label="Ordenar por">
              <span className="flex gap-1">
                <select className="input min-w-0" value={ordem.chave} onChange={(e) => setOrdem({ chave: e.target.value as ChaveOrdem, asc: true })}>
                  <option value="prioridade">Prioridade (críticos primeiro)</option>
                  {(Object.keys(DICAS) as ChaveOrdem[]).map((k) => <option key={k} value={k}>{DICAS[k][0]}</option>)}
                </select>
                <button type="button" className="shrink-0 rounded-lg border border-slate-300 px-2 text-slate-600 hover:bg-slate-50" onClick={() => setOrdem((o) => ({ ...o, asc: !o.asc }))}
                  aria-label={ordem.asc ? "Ordem crescente: trocar para decrescente" : "Ordem decrescente: trocar para crescente"}>
                  {ordem.asc ? <ArrowUp size={16} aria-hidden /> : <ArrowDown size={16} aria-hidden />}
                </button>
              </span>
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-700">
            {([["soPrecisa", "Só o que precisa comprar"], ["criticos", "Só os críticos"], ["zerados", "Incluir zerados e sem movimento"], ["inativos", "Incluir inativos"]] as const).map(([k, r]) => (
              <label key={k} className="flex min-h-[32px] items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} /> {r}
              </label>
            ))}
            {filtrosAtivos > 0 && (
              <button type="button" className="text-sm font-semibold text-brand hover:underline" onClick={() => { setF(FILTROS_PADRAO); setPeriodo(PERIODO_PADRAO); setUnidade(atual); }}>Limpar filtros</button>
            )}
          </div>
        </Card>
      )}
      {!painel && <p className="text-xs text-slate-500">{textoFiltros()}</p>}

      {(marcados.length > 0 || comPendencia.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-light px-3 py-2 text-sm text-fg">
          {marcados.length > 0 && <>
            <b>{marcados.length} {pl(marcados.length, "marcado", "marcados")} · {brl(valorMarcados)}</b>
            {podeComprar && aoCotar && (
              <Button variant="ghost" title="Pedir preço a vários fornecedores antes de comprar" onClick={() => {
                const itens = marcados.filter((l) => l.acao === "comprar" && quant(l) > 0).map((l) => ({ produto_id: l.produto.id, quantidade: quant(l) }));
                if (!itens.length) return notify("Nenhum marcado para comprar (com quantidade)", "erro");
                aoCotar(itens);
              }}><Scale size={15} aria-hidden /> Cotar com vários fornecedores</Button>
            )}
            <Button variant="ghost" onClick={() => setSel(new Set())}><X size={15} aria-hidden /> Limpar seleção</Button>
          </>}
          {comPendencia.length > 0 && podeMinMax && <>
            <span className="text-amber-800">{comPendencia.length} {pl(comPendencia.length, "produto", "produtos")} com mínimo/máximo sugerido e não gravado</span>
            <Button variant="ghost" disabled={gravando} onClick={gravarPendentes}><Save size={15} aria-hidden /> {gravando ? "Gravando…" : `Gravar mínimo e máximo${marcados.length ? " dos marcados" : ""}`}</Button>
            <Button variant="ghost" disabled={gravando} onClick={() => setMm({})}>Descartar</Button>
          </>}
        </div>
      )}

      {isLoading && <p className="py-6 text-center text-sm text-slate-500">Carregando…</p>}
      {vazio && <Card className="p-5 text-sm text-slate-600">{f.soPrecisa ? "Nada para comprar pelas regras atuais. Desmarque \"Só o que precisa comprar\" nos filtros para ver todos." : "Nenhum produto encontrado."}</Card>}

      {/* computador: tabela com todas as colunas (rola para o lado) */}
      {!vazio && !isLoading && (
        <div className="hidden md:block">
          <Table head={<>
            <th className={`th bg-slate-50 ${FIXA_SEL}`}><input type="checkbox" className="h-4 w-4" checked={todosMarcados} onChange={marcarTodos} aria-label="Marcar todos" title={`Marcar os ${visiveis.length} da lista`} /></th>
            {th("produto", false, `bg-slate-50 ${FIXA_PROD}`)}{th("sku")}{th("gtin")}{th("fornecedor")}{th("unidade")}{th("custo", true)}
            {th("entradas", true)}{th("saidasPrevistas", true)}{th("fisico", true)}{th("virtual", true)}
            {th("minimo", true)}{th("maximo", true)}{th("saidasPeriodo", true)}{th("consumo", true)}
            {th("cobertura", true)}{th("prazo", true)}{th("necessidade", true)}{th("valor", true)}
          </>}>
            {lista.map((l) => {
              const p = l.produto;
              return (
                <tr key={p.id} className={sel.has(p.id) ? "bg-brand-light" : "bg-surface hover:bg-slate-50"}>
                  <td className={`td bg-inherit ${FIXA_SEL}`}><input type="checkbox" className="h-4 w-4" checked={sel.has(p.id)} onChange={() => marcar(p.id)} aria-label={`Marcar ${p.descricao}`} /></td>
                  <td className={`td min-w-[14rem] max-w-[20rem] bg-inherit ${FIXA_PROD}`}><span className={`font-medium ${l.critico ? "text-red-700" : "text-fg"}`}>{p.descricao}</span>{selos(l)}</td>
                  <td className="td whitespace-nowrap text-xs text-slate-600">{p.sku || "—"}</td>
                  <td className="td whitespace-nowrap text-xs text-slate-600">{p.codigo_barras || "—"}</td>
                  <td className="td max-w-[12rem] text-xs">{fornecedorTexto(l)}</td>
                  <td className="td text-xs text-slate-600">{p.unidade}</td>
                  <td className="td num whitespace-nowrap text-right">{brl(l.custo)}<span className="block text-[11px] text-slate-500">{l.origemCusto === "compras" ? "compras 12 meses" : "cadastro"}</span></td>
                  <td className="td num text-right">{botaoNumero(l, l.entradas, "text-emerald-700", "entradas")}
                    {l.emCotacao > 0 && <button type="button" onClick={() => setDetalhe(l)} className="block w-full text-right text-[11px] text-purple-700 hover:underline">+{fmt(l.emCotacao)} em cotação</button>}</td>
                  <td className="td num text-right">{botaoNumero(l, l.saidasPrevistas, "text-sky-700", "saídas")}</td>
                  <td className={`td num text-right ${l.fisico < 0 ? "font-semibold text-red-600" : ""}`}>{fmt(l.fisico)}</td>
                  <td className={`td num text-right font-bold ${corVirtual(l)}`}>{fmt(l.virtual)}</td>
                  <td className="td text-right">{campoMinMax(l, "estoque_minimo")}</td>
                  <td className="td text-right">{campoMinMax(l, "estoque_maximo")}</td>
                  <td className="td num text-right">{fmt(l.saidasPeriodo)}</td>
                  <td className="td num whitespace-nowrap text-right">{fmt(l.consumoMes, 1)}/mês<span className="block text-[11px] text-slate-500">{fmt(l.consumoDia)}/dia</span></td>
                  <td className={`td num whitespace-nowrap text-right ${corCobertura(l)}`}>{l.coberturaDias === null ? "—" : `${l.coberturaDias} ${pl(l.coberturaDias, "dia", "dias")}`}</td>
                  <td className="td num whitespace-nowrap text-right">{l.prazo} d{l.prazoPadrao && <span className="block text-[11px] text-slate-500">padrão</span>}</td>
                  <td className="td text-right">{campoQtd(l)}{notaOutras(l)}</td>
                  <td className="td num whitespace-nowrap text-right font-semibold">{quant(l) && l.acao === "comprar" ? brl(quant(l) * l.custo) : "—"}</td>
                </tr>
              );
            })}
          </Table>
        </div>
      )}

      {/* celular: um cartão por produto, com os números principais lado a lado (nada sai da tela) */}
      {!vazio && !isLoading && (
        <div className="space-y-2 md:hidden">
          <label className="flex items-center gap-2 px-1 text-sm text-slate-600">
            <input type="checkbox" className="h-5 w-5" checked={todosMarcados} onChange={marcarTodos} /> Marcar os {visiveis.length} da lista
          </label>
          <ul className="space-y-2">
            {lista.map((l) => {
              const p = l.produto;
              const item = (rotulo: string, valor: ReactNode, cor = "") => (
                <div className="min-w-0"><dt className="text-[11px] text-slate-500">{rotulo}</dt><dd className={`num font-semibold ${cor}`}>{valor}</dd></div>
              );
              return (
                <li key={p.id} className={`relative rounded-2xl border border-l-4 bg-surface p-3 shadow-card ${sel.has(p.id) ? "border-brand bg-brand-light/40" : l.critico ? "border-slate-200 border-l-red-500" : "border-slate-200 border-l-modulo"}`}>
                  <input type="checkbox" className="absolute right-3 top-3 h-5 w-5" checked={sel.has(p.id)} onChange={() => marcar(p.id)} aria-label={`Marcar ${p.descricao}`} />
                  <div className="pr-8">
                    <div className={`font-bold [overflow-wrap:anywhere] ${l.critico ? "text-red-700" : "text-fg"}`}>{p.descricao}</div>
                    <div className="text-xs text-slate-500 [overflow-wrap:anywhere]">{[p.sku, p.codigo_barras, p.unidade].filter(Boolean).join(" · ")}</div>
                    {selos(l)}
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5 text-sm">
                    {item("Físico", fmt(l.fisico), l.fisico < 0 ? "text-red-600" : "")}
                    {item("Entradas", botaoNumero(l, l.entradas, "text-emerald-700", "entradas"))}
                    {item("Saídas prev.", botaoNumero(l, l.saidasPrevistas, "text-sky-700", "saídas"))}
                    {item("Virtual", fmt(l.virtual), corVirtual(l))}
                    {item("Média/mês", fmt(l.consumoMes, 1))}
                    {item("Cobertura", l.coberturaDias === null ? "—" : `${l.coberturaDias} d`, corCobertura(l))}
                    {item(`Saídas ${periodo}d`, fmt(l.saidasPeriodo))}
                    {item("Prazo", `${l.prazo} d`)}
                    {item("Custo médio", brl(l.custo))}
                  </dl>
                  {l.emCotacao > 0 && <button type="button" onClick={() => setDetalhe(l)} className="mt-1 text-xs text-purple-700 underline">+{fmt(l.emCotacao)} em cotação</button>}
                  <div className="mt-1 text-xs text-slate-600">Fornecedor: {fornecedorTexto(l)}</div>
                  <div className="mt-2 grid grid-cols-3 items-end gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                    <label className="flex min-w-0 flex-col gap-0.5">Mínimo{campoMinMax(l, "estoque_minimo", "w-full")}</label>
                    <label className="flex min-w-0 flex-col gap-0.5">Máximo{campoMinMax(l, "estoque_maximo", "w-full")}</label>
                    <label className="flex min-w-0 flex-col gap-0.5">Comprar{campoQtd(l, "w-full")}</label>
                  </div>
                  {notaOutras(l)}
                  {l.acao === "comprar" && quant(l) > 0 && <div className="mt-1 text-right text-sm font-semibold text-fg">{brl(quant(l) * l.custo)}</div>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {visiveis.length > limite && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => setLimite((x) => x + POR_VEZ)}>Mostrar mais ({visiveis.length - limite} restantes)</Button>
        </div>
      )}

      <details className="rounded-xl border border-slate-200 bg-surface p-3 text-sm text-slate-700">
        <summary className="cursor-pointer font-semibold text-fg">Como cada número é calculado</summary>
        <dl className="mt-2 space-y-1.5">
          {Object.entries(DICAS).map(([k, [rotulo, texto]]) => <div key={k}><dt className="inline font-semibold text-fg">{rotulo}: </dt><dd className="inline">{texto}</dd></div>)}
          <div><dt className="inline font-semibold text-fg">Crítico: </dt><dd className="inline">precisa comprar e está zerado, negativo ou acaba antes do prazo do fornecedor.</dd></div>
          <div><dt className="inline font-semibold text-fg">Fazer OP: </dt><dd className="inline">máquina e peça fabricada aqui entram pela ordem de produção, não por compra.</dd></div>
        </dl>
      </details>

      {detalhe && <DetalheOrigens linha={detalhe} onClose={() => setDetalhe(null)} />}
      {gerar && (
        <GerarOrdens itens={gerar} fornecedores={fornecedores} nomeForn={nomeForn} periodo={periodo} unidadeInicial={unidade ?? padrao} onClose={() => setGerar(null)}
          onFeito={(feitas, ids) => {
            setCriadas(feitas);
            setGerar(null);
            setSel(new Set());
            setQtd((q) => Object.fromEntries(Object.entries(q).filter(([id]) => !ids.includes(id))));
            invalidate("pedidos_compra", "pedido_compra_itens", "necessidade_producao");
          }} />
      )}
      {pdf && <PdfViewer blob={pdf} nome={`necessidades-de-compra-${dia}.pdf`} titulo="Necessidades de compra" onClose={() => setPdf(null)} />}
    </div>
  );
}

/** De onde vêm as entradas e saídas previstas de um produto (documento, número e quantidade). */
function DetalheOrigens({ linha: l, onClose }: { linha: LinhaNecessidade; onClose: () => void }) {
  const bloco = (titulo: string, lista: LinhaNecessidade["origensSaida"], vazio: string) => (
    <section>
      <h3 className="mb-1.5 text-sm font-bold text-fg">{titulo}</h3>
      {!lista.length ? <p className="text-sm text-slate-500">{vazio}</p> : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {lista.map((o) => (
            <li key={`${o.tipo}-${o.id}`} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <b className="text-fg">{DOC[o.tipo]} #{o.numero ?? "?"}</b>
                {o.detalhe && <span className="block text-xs text-slate-500 [overflow-wrap:anywhere]">{o.detalhe}</span>}
              </span>
              <span className="num shrink-0 font-semibold">{fmt(o.quantidade)} {l.produto.unidade}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
  return (
    <Modal open onClose={onClose} title={l.produto.descricao}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Físico {fmt(l.fisico)} + entradas {fmt(l.entradas)} − saídas previstas {fmt(l.saidasPrevistas)} = <b className="text-fg">virtual {fmt(l.virtual)}</b>
          {l.emOutras > 0 && <> · a outra unidade tem {fmt(l.emOutras)}</>}
        </p>
        {bloco("Saídas previstas", l.origensSaida, "Nada prometido.")}
        {bloco("Entradas previstas", l.origensEntrada.filter((o) => o.tipo !== "cotacao"), "Nenhuma compra confirmada nem OP aberta.")}
        {l.emCotacao > 0 && bloco("Em cotação (não entra no estoque virtual)", l.origensEntrada.filter((o) => o.tipo === "cotacao"), "")}
        <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Fechar</Button></div>
      </div>
    </Modal>
  );
}

/** Confirma e cria as ordens de compra em cotação: uma por fornecedor; os itens sem fornecedor podem ganhar um aqui. */
function GerarOrdens({ itens, fornecedores, nomeForn, periodo, unidadeInicial, onClose, onFeito }: {
  itens: ItemEscolhido[]; fornecedores: Fornecedor[]; nomeForn: (id: string | null) => string; periodo: number; unidadeInicial: string | null;
  onClose: () => void; onFeito: (criadas: { numero: number | string | null | undefined; fornecedor: string }[], produtos: string[]) => void;
}) {
  const { unidades } = useUnidade();
  const [unidadeId, setUnidadeId] = useState<string | null>(unidadeInicial);
  const [fornSem, setFornSem] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const { grupos, fora } = useMemo(() => gruposDeCompra(itens), [itens]);
  const semFornecedor = grupos.find((g) => !g.fornecedor_id);
  // o fornecedor escolhido para os "sem fornecedor" pode já ter uma OC aqui: junta na mesma
  const finais = useMemo(() => {
    const m = new Map<string, { fornecedor_id: string | null; itens: ItemEscolhido[]; prazo: number; valor: number }>();
    for (const g of grupos) {
      const id = g.fornecedor_id ?? (fornSem || null);
      const atual = m.get(id ?? "");
      if (atual) m.set(id ?? "", { ...atual, itens: [...atual.itens, ...g.itens], prazo: Math.max(atual.prazo, g.prazo), valor: atual.valor + g.valor });
      else m.set(id ?? "", { ...g, fornecedor_id: id });
    }
    return [...m.values()];
  }, [grupos, fornSem]);
  const deFora = fora.produzir.length + fora.naoCompra.length + fora.semQuantidade.length;

  async function gerar() {
    setOcupado(true);
    const feitas: { numero: number | string | null | undefined; fornecedor: string }[] = [];
    const ids: string[] = [];
    try {
      for (const g of finais) {
        // cabeçalho e itens juntos: se os itens não gravarem, o pedido vazio é desfeito
        const pc = await criarComItens("pedidos_compra", {
          fornecedor_id: g.fornecedor_id, status: "cotacao", previsao_entrega: somarDias(g.prazo), ...(unidadeId ? { unidade_id: unidadeId } : {}),
          observacoes: `Necessidades de compra do ERP (${g.itens.length} ${pl(g.itens.length, "item", "itens")}, saídas dos últimos ${periodo} dias)`,
        }, "pedido_compra_itens", "pedido_compra_id", g.itens.map((i) => ({
          produto_id: i.linha.produto.id, descricao: i.linha.produto.descricao, quantidade: i.quantidade, custo_unitario: i.linha.custo,
        })), desfazerCompra);
        feitas.push({ numero: pc.numero, fornecedor: nomeForn(g.fornecedor_id) });
        ids.push(...g.itens.map((i) => i.linha.produto.id));
      }
      notify(`${pl(feitas.length, "Ordem de compra criada", "Ordens de compra criadas")} em cotação: ${feitas.map((x) => `#${x.numero ?? "?"}`).join(", ")}`);
    } catch (e) {
      notifyError(e);
      if (feitas.length) notify(`Antes do erro foram criadas: ${feitas.map((x) => `#${x.numero ?? "?"}`).join(", ")}`, "erro");
    } finally {
      setOcupado(false);
      if (feitas.length) onFeito(feitas, ids);
    }
  }

  return (
    <Modal open onClose={onClose} title="Gerar ordens de compra">
      <div className="space-y-4">
        {!finais.length ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Nenhum dos marcados vira compra: confira as quantidades.</p>
        ) : (
          <p className="text-sm text-slate-600">Uma ordem de compra <b>em cotação</b> para cada fornecedor, com a quantidade e o custo médio de cada item. Depois é só conferir e mandar ao fornecedor.</p>
        )}
        {finais.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {finais.map((g) => (
              <li key={g.fornecedor_id ?? "sem"} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <b className={g.fornecedor_id ? "text-fg" : "text-amber-700"}>{g.fornecedor_id ? nomeForn(g.fornecedor_id) : "Sem fornecedor (escolha depois na OC)"}</b>
                  <span className="block text-xs text-slate-500">{g.itens.length} {pl(g.itens.length, "item", "itens")} · entrega em {g.prazo} dias</span>
                </span>
                <span className="num shrink-0 font-semibold">{brl(g.valor)}</span>
              </li>
            ))}
          </ul>
        )}
        {semFornecedor && (
          <Field label={`Fornecedor para ${pl(semFornecedor.itens.length, "o item", `os ${semFornecedor.itens.length} itens`)} sem fornecedor`}>
            <select className="input" value={fornSem} onChange={(e) => setFornSem(e.target.value)}>
              <option value="">Deixar sem fornecedor (escolho depois)</option>
              {fornecedores.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
            <span className="mt-1 block text-xs text-slate-500">{semFornecedor.itens.map((i) => i.linha.produto.descricao).slice(0, 4).join(", ")}{semFornecedor.itens.length > 4 ? "…" : ""}</span>
          </Field>
        )}
        {unidades.length > 1 && <CampoUnidade label="Comprar para (recebe a mercadoria e a nota)" value={unidadeId} onChange={setUnidadeId} />}
        {deFora > 0 && (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            Ficam de fora: {[
              fora.produzir.length && `${fora.produzir.length} de fabricação (fazem OP)`,
              fora.naoCompra.length && `${fora.naoCompra.length} fora de linha`,
              fora.semQuantidade.length && `${fora.semQuantidade.length} com quantidade zero`,
            ].filter(Boolean).join(", ")}.
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
          <Button variant="secondary" onClick={onClose}>Voltar</Button>
          <Button disabled={ocupado || !finais.length || (unidades.length > 1 && !unidadeId)} onClick={gerar}>
            <ShoppingCart size={16} aria-hidden /> {ocupado ? "Gerando…" : `Gerar ${finais.length} ${pl(finais.length, "ordem", "ordens")} de compra`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
