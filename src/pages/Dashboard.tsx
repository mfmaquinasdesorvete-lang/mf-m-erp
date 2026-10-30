import { lazy, Suspense, useMemo, useState } from "react";
import { PainelFinanceiro } from "@/components/financeiro/PainelFinanceiro";
import { AtalhoGastoPessoal } from "@/components/pessoal/AtalhoGastoPessoal";
import { Link, useNavigate } from "react-router-dom";
import {
  AlarmClock, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BellRing, Boxes, ClipboardList, Factory, FileWarning, PackageSearch,
  ShieldCheck, ShieldOff, Truck, TrendingUp, Wallet, Wrench, type LucideIcon,
} from "lucide-react";
import { estiloBrilho, Luz, Section } from "@/components/ui";
import { Area, Rosca } from "@/components/Charts";
import { useUnidade, EtiquetaUnidade, CampoUnidade } from "@/lib/unidade";
import { useRows } from "@/lib/data";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { cobraDoCliente } from "@/lib/cobranca";
import { brl, hoje, somarDias, pl } from "@/lib/format";
import { diaDaVenda } from "@/lib/filtroLista";
import { situacaoGarantia, situacaoPreventiva } from "@/lib/garantia";
import { usePerfil } from "@/lib/auth";
import type { Equipamento, Necessidade, OrdemProducao, OrdemServico, Pedido, PedidoCompra, Produto } from "@/lib/types";
import { vendasDasNotas, type NotaVenda } from "@/lib/vendasNotas";
import { ordenarAtencao, type ItemAtencao } from "@/lib/prioridadeInicio";
import { AcessoRapido } from "@/components/painel/AcessoRapido";
import { Secoes } from "@/components/Secoes";
import { ResumoDono, veResumoDono } from "@/components/painel/ResumoDono";
import { EquipeOnline } from "@/components/painel/EquipeOnline";
import { Contagem } from "@/components/Animar";

const Fluxo = lazy(() => import("@/pages/Fluxo"));

type Conta = {
  id: string; valor: number; vencimento: string; status: string; data_pagamento: string | null; valor_pago: number | null;
  cliente_id?: string | null; forma_pagamento?: string | null; decisao?: string | null;
};
/** Valor curto para o resumo dos blocos fechados no celular ("R$ 40,4 mil") */
const brlCurto = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(v);
/** Número curto sem o "R$" ("14,5 mil"), para o resumo azul do celular, onde o "R$" vai pequeno na frente */
const numCurto = (v: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(v);
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

type Periodo = "hoje" | "semana" | "7d" | "30d" | "mes";
const PERIODOS: { id: Periodo; rotulo: string; anterior: string }[] = [
  { id: "hoje", rotulo: "Hoje", anterior: "ontem" },
  { id: "semana", rotulo: "Semana", anterior: "semana passada" },
  { id: "30d", rotulo: "30 dias", anterior: "30 dias antes" },
  { id: "mes", rotulo: "Mês", anterior: "mês passado" },
];

/** Intervalo [início, fim] do período escolhido e do período anterior de mesmo tamanho (datas AAAA-MM-DD). */
function intervalos(p: Periodo) {
  const fim = hoje();
  if (p === "mes") {
    const d = new Date(fim + "T12:00:00Z");
    const ini = `${fim.slice(0, 7)}-01`;
    const ant = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1, 12));
    const ultimoAnt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0, 12)).getUTCDate();
    const diaAnt = Math.min(d.getUTCDate(), ultimoAnt);
    const iniAnt = ant.toISOString().slice(0, 10);
    return { atual: [ini, fim], anterior: [iniAnt, `${iniAnt.slice(0, 8)}${String(diaAnt).padStart(2, "0")}`] };
  }
  if (p === "semana") {
    // de segunda até hoje, comparada com os mesmos dias da semana passada
    const dow = new Date(fim + "T12:00:00Z").getUTCDay();
    const ini = somarDias(-((dow + 6) % 7));
    return { atual: [ini, fim], anterior: [somarDias(-((dow + 6) % 7) - 7), somarDias(-7)] };
  }
  const n = p === "hoje" ? 1 : p === "7d" ? 7 : 30;
  return { atual: [somarDias(-(n - 1)), fim], anterior: [somarDias(-(2 * n - 1)), somarDias(-n)] };
}
const dentro = (data: string | null | undefined, [a, b]: string[]) => !!data && data.slice(0, 10) >= a && data.slice(0, 10) <= b;
/** 1º dia do 6º mês para trás: cobre o gráfico de 6 meses e o período anterior de todos os filtros (com folga). */
function desde6Meses() {
  const d = new Date(hoje() + "T12:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 6, 1)).toISOString().slice(0, 10);
}
const SELECT_CONTAS_INICIO = "id, status, valor, valor_pago, vencimento, data_pagamento, unidade_id";
/** a receber: quem e como paga (cartão e pedido sem NF não se cobram do cliente); a pagar: a decisão ("não pagar" fica fora) */
const SELECT_RECEBER_INICIO = `${SELECT_CONTAS_INICIO}, cliente_id, forma_pagamento`;
const SELECT_PAGAR_INICIO = `${SELECT_CONTAS_INICIO}, decisao`;
/** Só o que a venda pela nota precisa para valor e data (sem o cliente). */
const SELECT_NOTAS_INICIO = "id, created_at, status, ambiente, pedido_id, unidade_id, tipo_operacao, finalidade, excluida_em, payload, valor_total, chave, chave_referenciada, nota_referenciada_id";

type Kpi = { id: string; label: string; valor: string | number; curto?: string | number; moeda?: boolean; sub?: string; icon: LucideIcon; cor: string; delta?: number | null; to: string; state?: unknown };

type Visao = "geral" | "financeiro" | "fluxo";
const VISOES: Record<Visao, [string, string]> = { geral: ["Painel geral", "Geral"], financeiro: ["Painel financeiro", "Financeiro"], fluxo: ["Fluxo de pedidos", "Fluxo"] };

/**
 * Início: vendas já entra no fluxo de pedidos, o financeiro no painel financeiro (feito para o celular);
 * cada um pode trocar e a escolha fica lembrada (por papel, para quem divide o computador).
 */
export default function Dashboard() {
  const { papel, podeVer, tem, master, nome } = usePerfil();
  const opcoes: Visao[] = papel === "vendas" ? ["fluxo", "geral"]
    : [ "geral" as const, ...(tem("financeiro") ? ["financeiro" as const] : []), ...(podeVer("fluxo") ? ["fluxo" as const] : [])];
  const padrao: Visao = papel === "vendas" ? "fluxo" : papel === "financeiro" ? "financeiro" : "geral";
  const chave = `erp.painel.visao.${papel}`;
  const [visao, setVisao] = useState<Visao>(() => {
    try {
      // "erp.painel.visao" era a chave única de antes (admin e financeiro)
      const v = (localStorage.getItem(chave) ?? (papel !== "vendas" ? localStorage.getItem("erp.painel.visao") : null)) as Visao | null;
      return v && opcoes.includes(v) ? v : padrao;
    } catch { return padrao; }
  });
  const escolher = (v: Visao) => { setVisao(v); try { localStorage.setItem(chave, v); } catch { /* sem armazenamento */ } };
  const atual = opcoes.includes(visao) ? visao : padrao;
  return (
    <>
      {/* só a conta master: quem da equipe está com o ERP aberto e há quanto tempo */}
      {master && <EquipeOnline />}
      {(opcoes.length > 1 || papel === "admin") && <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      {opcoes.length > 1 && (
        <div className="cartao inline-flex max-w-full p-1" role="tablist" aria-label="O que ver no início">
          {opcoes.map((v) => (
            <button key={v} type="button" role="tab" aria-selected={atual === v} onClick={() => escolher(v)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition sm:px-4 ${atual === v ? "bg-brand text-brand-fg shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
              {opcoes.length > 2 ? <><span className="sm:hidden">{VISOES[v][1]}</span><span className="hidden sm:inline">{VISOES[v][0]}</span></> : VISOES[v][0]}
            </button>
          ))}
        </div>
      )}
      {master && <AtalhoGastoPessoal />}
      </div>}
      {/* entrada do Fabiano: o resumo do dono no alto, em qualquer painel */}
      {veResumoDono(nome) && <ResumoDono />}
      {atual === "financeiro" ? <PainelFinanceiro />
        : atual === "fluxo" ? <Suspense fallback={<div className="p-8 text-slate-500">Carregando…</div>}><Fluxo /></Suspense>
        : <PainelGeral />}
    </>
  );
}

function PainelGeral() {
  const { nome, pode, podeVer } = usePerfil();
  const navigate = useNavigate();
  // a tela inicial sempre abre na semana (pedido de 27/10); trocar vale só até sair da tela
  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const escolher = setPeriodo;

  const { filtrar } = useUnidade();
  // O Início baixa só as colunas que usa e só o que entra nas contas (os 6 meses do gráfico, o que está aberto e o que
  // ainda vai ser entregue), não as tabelas inteiras: era o que deixava a primeira tela pesada.
  const corte = desde6Meses();
  const { data: pedidosTodos = [], isLoading: carregandoPedidos } = useRows<Pedido>("pedidos", {
    select: "id, status, created_at, aprovado_em, valor_total, unidade_id", key: ["inicio", corte],
    filtro: (q) => q.or(`status.in.(orcamento,aprovado,faturado),created_at.gte.${corte},aprovado_em.gte.${corte}`) });
  const pedidos = filtrar(pedidosTodos);
  const { data: ordensTodos = [] } = useRows<OrdemServico>("ordens_servico", {
    select: "id, status, data_entrada, previsao, unidade_id", key: ["inicio", corte],
    filtro: (q) => q.or(`status.not.in.(entregue,cancelada),data_entrada.gte.${corte}`) });
  const ordens = filtrar(ordensTodos);
  const { data: produtos = [] } = useRows<Produto>("produtos", {
    select: "id, ativo, estoque_minimo, estoque_atual", order: "descricao", ascending: true, key: ["inicio"],
    filtro: (q) => q.eq("ativo", true).gt("estoque_minimo", 0) });
  // vendas que só têm a nota fiscal (emitidas no Tiny ou direto, sem pedido no ERP) também contam, como nos Relatórios;
  // aqui só entram o valor e a data (o custo dos itens não aparece no Início, por isso sem a lista de produtos)
  const { data: notasTodas = [] } = useRows<NotaVenda>("notas_fiscais", {
    select: SELECT_NOTAS_INICIO, key: ["inicio", corte], filtro: (q) => q.gte("created_at", corte) });
  const vendasNotas = useMemo(() => filtrar(vendasDasNotas(notasTodas, []).pedidos) as unknown as Pedido[], [notasTodas, filtrar]);
  const { data: receberTodos = [], isLoading: carregandoReceber } = useRows<Conta>("contas_receber", {
    select: SELECT_RECEBER_INICIO, key: ["inicio", corte],
    filtro: (q) => q.or(`status.eq.aberto,data_pagamento.gte.${corte}`) });
  const receber = filtrar(receberTodos);
  const { data: pagarTodos = [], isLoading: carregandoPagar } = useRows<Conta>("contas_pagar", {
    select: SELECT_PAGAR_INICIO, key: ["inicio", corte],
    filtro: (q) => q.or(`status.eq.aberto,data_pagamento.gte.${corte}`) });
  const pagar = filtrar(pagarTodos);
  // pedido cancelado ou sem NF de venda: o banco diz quais contas em aberto não se cobram do cliente (como na Cobrança)
  const { data: foraCobranca } = useQuery({
    queryKey: ["contas_receber", "fora_cobranca"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contas_receber_fora_cobranca");
      if (error) throw error;
      return new Set(((data ?? []) as unknown[]).map((x) => String(x && typeof x === "object" ? Object.values(x)[0] : x)));
    },
  });
  // enquanto carrega não dá para dizer "tudo em dia" (falha de leitura aparece no aviso vermelho)
  const carregando = carregandoPedidos || carregandoReceber || carregandoPagar;
  const { data: equipamentos = [] } = useRows<Equipamento>("equipamentos", {
    select: "id, data_venda, garantia_ate, proxima_preventiva", order: "data_venda", key: ["inicio"] });
  const { data: recebidasTodos = [] } = useRows<{ processamento: string }>("nfe_recebidas", {
    select: "id, processamento, unidade_id", key: ["inicio"], filtro: (q) => q.in("processamento", ["aguardando_vinculo", "revisao"]) });
  const recebidas = filtrar(recebidasTodos);
  const { data: lembretes = [] } = useRows<{ id: string }>("lembretes_manutencao", { select: "id", order: "id" });
  const { data: opsTodos = [] } = useRows<OrdemProducao>("ordens_producao", {
    select: "id, status, quantidade, unidade_id", key: ["inicio"], filtro: (q) => q.in("status", ["planejada", "em_producao"]) });
  const ops = filtrar(opsTodos);
  const { data: comprasTodos = [] } = useRows<PedidoCompra>("pedidos_compra", {
    select: "id, status, previsao_entrega, unidade_id", key: ["inicio"], filtro: (q) => q.in("status", ["cotacao", "enviado", "parcial"]) });
  const compras = filtrar(comprasTodos);
  const { data: necessidade = [] } = useRows<Necessidade>("necessidade_producao", { order: "descricao" });

  const k = useMemo(() => {
    const { atual, anterior } = intervalos(periodo);
    const h = hoje();
    const soma = (l: Conta[], f: (c: Conta) => boolean, campo: "valor" | "valor_pago" = "valor") =>
      l.filter(f).reduce((s, c) => s + Number(c[campo] ?? 0), 0);
    const validos = [...pedidos.filter((p) => !["orcamento", "cancelado"].includes(p.status)), ...vendasNotas];
    // pelo dia da venda (aprovação), não do lançamento: venda antiga lançada agora não entra na semana
    const vendas = (r: string[]) => validos.filter((p) => dentro(diaDaVenda(p), r));
    const recebido = (r: string[]) => soma(receber, (c) => c.status === "pago" && dentro(c.data_pagamento, r), "valor_pago");
    const pago = (r: string[]) => soma(pagar, (c) => c.status === "pago" && dentro(c.data_pagamento, r), "valor_pago");
    const variacao = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : a > 0 ? null : 0);

    const d = new Date();
    const serie = Array.from({ length: 6 }, (_, i) => {
      const x = new Date(d.getFullYear(), d.getMonth() - 5 + i, 1);
      const am = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
      return {
        rotulo: `${MESES[x.getMonth()]}/${String(x.getFullYear()).slice(2)}`,
        valores: [
          validos.filter((p) => diaDaVenda(p).startsWith(am)).reduce((s, p) => s + Number(p.valor_total), 0),
          soma(receber, (c) => c.status === "pago" && (c.data_pagamento ?? "").startsWith(am), "valor_pago"),
        ],
      };
    });

    const osAbertas = ordens.filter((o) => !["concluida", "entregue", "cancelada"].includes(o.status));
    const opsAbertas = ops.filter((o) => ["planejada", "em_producao"].includes(o.status));
    const opsComFalta = new Set(necessidade
      .filter((n) => Number(n.necessario) > Math.max(0, Number(n.estoque_atual) - Number(n.reservado_outras_op)) + Number(n.a_caminho))
      .map((n) => n.ordem_id));
    const vAtual = vendas(atual), vAnt = vendas(anterior);
    const valor = (l: Pedido[]) => l.reduce((s, p) => s + Number(p.valor_total), 0);
    const osNovas = (r: string[]) => ordens.filter((o) => dentro(o.data_entrada, r)).length;
    const abertos = receber.filter((c) => c.status === "aberto");
    // cobrança vencida: só o que se cobra do cliente (sem cartão, pedido cancelado ou sem NF de venda)
    const vencidasCobrar = abertos.filter((c) => c.vencimento < h && cobraDoCliente({ forma_pagamento: c.forma_pagamento ?? null, fora_da_cobranca: !!foraCobranca?.has(c.id) }));
    // a pagar: a marcada "não pagar" não é dívida em atraso
    const pagarAberto = (c: Conta) => c.status === "aberto" && c.decisao !== "nao_pagar";

    return {
      serie,
      vendas: valor(vAtual), qtdVendas: vAtual.length, dVendas: variacao(valor(vAtual), valor(vAnt)),
      recebido: recebido(atual), dRecebido: variacao(recebido(atual), recebido(anterior)),
      pago: pago(atual),
      osNovas: osNovas(atual), dOs: variacao(osNovas(atual), osNovas(anterior)),
      orcamentos: pedidos.filter((p) => p.status === "orcamento").length,
      aEntregar: pedidos.filter((p) => ["aprovado", "faturado"].includes(p.status)).length,
      osAbertas: osAbertas.length,
      osAtrasadas: osAbertas.filter((o) => o.previsao && o.previsao < h).length,
      osProntas: ordens.filter((o) => o.status === "concluida").length,
      receberVencido: soma(vencidasCobrar, () => true),
      qtdReceberVencido: vencidasCobrar.length,
      clientesVencidos: new Set(vencidasCobrar.map((c) => c.cliente_id ?? c.id)).size,
      receber30: soma(abertos, (c) => c.vencimento >= h && c.vencimento <= somarDias(30)),
      receberDepois: soma(abertos, (c) => c.vencimento > somarDias(30)),
      pagarVencido: soma(pagar, (c) => pagarAberto(c) && c.vencimento < h),
      pagar7: soma(pagar, (c) => pagarAberto(c) && c.vencimento >= h && c.vencimento <= somarDias(7)),
      estoqueBaixo: produtos.filter((p) => p.ativo && Number(p.estoque_minimo) > 0 && Number(p.estoque_atual) <= Number(p.estoque_minimo)),
      emGarantia: equipamentos.filter((e) => situacaoGarantia(e.garantia_ate) !== "fora_garantia").length,
      garantiaVence: equipamentos.filter((e) => situacaoGarantia(e.garantia_ate) === "vence_logo").length,
      foraGarantia: equipamentos.filter((e) => situacaoGarantia(e.garantia_ate) === "fora_garantia").length,
      prevAtrasada: equipamentos.filter((e) => situacaoPreventiva(e.proxima_preventiva) === "atrasada").length,
      nfeConferir: recebidas.filter((n) => ["aguardando_vinculo", "revisao"].includes(n.processamento)).length,
      opsAbertas: opsAbertas.length,
      maquinasEmProducao: opsAbertas.reduce((s, o) => s + Number(o.quantidade), 0),
      opsComFalta: opsAbertas.filter((o) => opsComFalta.has(o.id)).length,
      comprasCotacao: compras.filter((c) => c.status === "cotacao").length,
      comprasCaminho: compras.filter((c) => ["enviado", "parcial"].includes(c.status)).length,
      comprasAtrasadas: compras.filter((c) => ["enviado", "parcial"].includes(c.status) && c.previsao_entrega && c.previsao_entrega < h).length,
      osPorSituacao: [
        { rotulo: "Na bancada", valor: osAbertas.filter((o) => ["aberta", "em_diagnostico", "em_reparo"].includes(o.status)).length, cor: "var(--serie-1)" },
        { rotulo: "Esperando peça/cliente", valor: osAbertas.filter((o) => ["aguardando_peca", "aguardando_aprovacao"].includes(o.status)).length, cor: "var(--serie-2)" },
        { rotulo: "Pronta p/ retirar", valor: ordens.filter((o) => o.status === "concluida").length, cor: "var(--serie-3)" },
      ],
    };
  }, [periodo, pedidos, vendasNotas, ordens, produtos, receber, pagar, equipamentos, recebidas, ops, compras, necessidade, foraCobranca]);

  const per = PERIODOS.find((p) => p.id === periodo)!;

  // Cartões coloridos: os 4 primeiros que o papel pode ver
  const kpis = ([
    podeVer("pedidos") && { id: "vendas", label: "Vendas", valor: brl(k.vendas), curto: numCurto(k.vendas), moeda: true, sub: `${k.qtdVendas} ${pl(k.qtdVendas, "venda", "vendas")} (pedidos e notas)`, icon: TrendingUp, cor: "var(--kpi-ciano)", delta: k.dVendas, to: "/pedidos" },
    podeVer("financeiro") && { id: "recebido", label: "Recebido", valor: brl(k.recebido), curto: numCurto(k.recebido), moeda: true, sub: `${brl(k.receber30)} a receber em 30 dias`, icon: Wallet, cor: "var(--kpi-verde)", delta: k.dRecebido, to: "/financeiro" },
    { id: "os", label: "OS abertas", valor: k.osAbertas, sub: `${k.osNovas} ${pl(k.osNovas, "entrou", "entraram")} · ${k.osProntas} ${pl(k.osProntas, "pronta", "prontas")}`, icon: Wrench, cor: "var(--kpi-laranja)", to: "/assistencia" },
    podeVer("financeiro") && { id: "vencido", label: "Cobranças vencidas", valor: brl(k.receberVencido), curto: numCurto(k.receberVencido), moeda: true, sub: k.clientesVencidos ? `${k.clientesVencidos} ${pl(k.clientesVencidos, "cliente", "clientes")} para cobrar` : "ninguém atrasado", icon: AlertTriangle, cor: "var(--kpi-rosa)", to: "/financeiro", state: { aba: "cobranca" } },
    podeVer("pedidos") && { id: "orc", label: "Orçamentos abertos", valor: k.orcamentos, sub: `${k.aEntregar} ${pl(k.aEntregar, "pedido", "pedidos")} a entregar`, icon: ClipboardList, cor: "var(--kpi-roxo)", to: "/pedidos", state: { status: "orcamento" } },
    podeVer("producao") && { id: "prod", label: "Em produção", valor: `${k.maquinasEmProducao} máq.`, sub: k.opsComFalta ? `${k.opsComFalta} OP com peça faltando` : "peças ok", icon: Factory, cor: "var(--kpi-azul)", to: "/producao" },
    { id: "garantia", label: "Em garantia", valor: k.emGarantia, sub: `${k.garantiaVence} vencem em 30 dias`, icon: ShieldCheck, cor: "var(--kpi-verde)", to: "/garantias" },
    podeVer("garantias") && { id: "prev", label: "Preventivas a lembrar", valor: lembretes.length, sub: `${k.prevAtrasada} ${pl(k.prevAtrasada, "atrasada", "atrasadas")}`, icon: BellRing, cor: "var(--kpi-rosa)", to: "/garantias", state: { lembretes: true } },
  ].filter(Boolean) as Kpi[]).slice(0, 4);


  const atencao = [
    podeVer("financeiro") && k.qtdReceberVencido > 0 && { nivel: "urgente", icon: Wallet, cor: "var(--kpi-rosa)", texto: `${k.qtdReceberVencido} ${pl(k.qtdReceberVencido, "cobrança", "cobranças")} ${pl(k.qtdReceberVencido, "vencida", "vencidas")}: ${brl(k.receberVencido)}`, to: "/financeiro", state: { aba: "cobranca" } },
    pode("contas_pagar") && k.pagarVencido > 0 && { nivel: "urgente", icon: AlertTriangle, cor: "var(--kpi-rosa)", texto: `${brl(k.pagarVencido)} em contas a pagar vencidas`, to: "/financeiro" },
    k.osAtrasadas > 0 && { nivel: "urgente", icon: Wrench, cor: "var(--kpi-laranja)", texto: `${k.osAtrasadas} OS com a entrega atrasada`, to: "/assistencia" },
    lembretes.length > 0 && { nivel: "acompanhar", icon: BellRing, cor: "var(--kpi-laranja)", texto: `${lembretes.length} ${pl(lembretes.length, "cliente", "clientes")} para lembrar da preventiva`, to: "/garantias", state: { lembretes: true } },
    podeVer("producao") && k.opsComFalta > 0 && { nivel: "urgente", icon: PackageSearch, cor: "var(--kpi-rosa)", texto: `${k.opsComFalta} ${pl(k.opsComFalta, "ordem", "ordens")} de produção com peça faltando`, to: "/producao" },
    pode("editar_producao") && k.comprasAtrasadas > 0 && { nivel: "urgente", icon: Truck, cor: "var(--kpi-laranja)", texto: `${k.comprasAtrasadas} ${pl(k.comprasAtrasadas, "pedido", "pedidos")} de compra com entrega atrasada`, to: "/compras", state: { aba: "compras" } },
    k.garantiaVence > 0 && { nivel: "acompanhar", icon: ShieldCheck, cor: "var(--kpi-laranja)", texto: `${k.garantiaVence} ${pl(k.garantiaVence, "garantia", "garantias")} vencendo em 30 dias`, to: "/garantias" },
    pode("nfe_recebidas") && k.nfeConferir > 0 && { nivel: "acompanhar", icon: FileWarning, cor: "var(--kpi-roxo)", texto: `${k.nfeConferir} ${pl(k.nfeConferir, "nota", "notas")} de fornecedor para conferir`, to: "/notas", state: { aba: "recebidas" } },
    k.estoqueBaixo.length > 0 && { nivel: "acompanhar", icon: Boxes, cor: "var(--kpi-laranja)", texto: `${k.estoqueBaixo.length} ${pl(k.estoqueBaixo.length, "item", "itens")} no estoque mínimo`, to: "/estoque" },
    podeVer("pedidos") && k.orcamentos > 0 && { nivel: "acompanhar", icon: ClipboardList, cor: "var(--kpi-ciano)", texto: `${k.orcamentos} ${pl(k.orcamentos, "orçamento", "orçamentos")} esperando resposta`, to: "/pedidos", state: { status: "orcamento" } },
  ].filter(Boolean) as (ItemAtencao & { icon: LucideIcon; cor: string; to: string; state?: unknown })[];
  const fila = ordenarAtencao(atencao);
  const [verTudo, setVerTudo] = useState(false);

  const h = new Date().getHours();
  const saudacao = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";

  // Mapa de atenção (23/10): a tela segue a ordem do que a pessoa precisa ao abrir o ERP —
  // acesso rápido às telas; 1) o que resolver agora; 2) como estão os números do período; 4) a tendência; 5) os detalhes.
  // Só o bloco "Para resolver agora" usa vermelho; o resto fica um degrau abaixo para não disputar o olhar.
  const temAtencao = atencao.length > 0;
  const periodoTabs = (
    <div role="tablist" aria-label="Período dos números" className="cartao grid grid-cols-4 gap-1 p-1 sm:inline-grid">
      {PERIODOS.map((p) => (
        <button key={p.id} role="tab" aria-selected={periodo === p.id} onClick={() => escolher(p.id)}
          className={`min-h-10 rounded-botao px-3 text-sm font-semibold transition sm:px-4 ${
            periodo === p.id ? "bg-brand text-brand-fg shadow" : "text-slate-500 hover:bg-slate-50 hover:text-fg"}`}>
          {p.rotulo}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 0. Saudação e o resumo em uma linha */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-fg sm:text-3xl">{saudacao}, {nome.split(" ")[0]} 👋</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          {" · "}{carregando ? "conferindo…" : temAtencao
            ? <a href="#resolver" className="font-semibold text-red-600 hover:underline">{fila.urgentes ? `${fila.urgentes} ${pl(fila.urgentes, "assunto urgente", "assuntos urgentes")}` : `${atencao.length} ${pl(atencao.length, "assunto", "assuntos")} para acompanhar`}</a>
            : "tudo em dia ✅"}
        </p>
      </div>

      {/* 1-5 (27/10): as seções do Início em <Secoes>: a pessoa pode mudar a ordem no "Organizar" (fica no perfil dela).
          A ordem padrão segue o mapa de atenção: acesso rápido, o que resolver agora, os números, a tendência, os detalhes. */}
      <Secoes pagina="inicio" secoes={[
        { id: "resumo", titulo: "Resumo (celular)", largo: true, soCelular: true, conteudo: !veResumoDono(nome) && (
          <ResumoCelular titulo={`Resumo ${per.id === "hoje" ? "de hoje" : per.id === "mes" ? "do mês" : per.id === "semana" ? "da semana" : "de 30 dias"}`}
            periodo={periodo} onPeriodo={escolher} itens={kpis} onAbrir={(c) => navigate(c.to, { state: c.state })} />
        ) },
        { id: "acesso", titulo: "Acesso rápido", largo: true, conteudo: (
          <AcessoRapido avisos={{ "/notas": k.nfeConferir, "/financeiro": k.qtdReceberVencido, "/estoque": k.estoqueBaixo.length, "/garantias": lembretes.length, "/assistencia": k.osAtrasadas }} />
        ) },
        { id: "resolver", titulo: "Para resolver agora", conteudo: temAtencao && (
          <section id="resolver" aria-label="Para resolver agora" className="cartao h-full scroll-mt-20 p-3 sm:p-5"
            style={fila.urgentes ? { borderColor: "rgb(var(--red-200))" } : undefined}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
                <span className={`h-4 w-1 rounded-full ${fila.urgentes ? "bg-solido-vermelho" : "bg-modulo"}`} aria-hidden />Para resolver agora
              </h2>
              <span className="num text-xs font-semibold text-slate-500">{atencao.length}</span>
            </div>
            <ul className="space-y-1.5">
              {(verTudo ? fila.ordem : fila.visiveis).map((a) => (
                <li key={a.texto}>
                  <Link to={a.to} state={a.state}
                    className={`group flex items-center gap-2.5 rounded-cartao border px-2.5 py-2 transition hover:bg-slate-50 active:scale-[.99] sm:gap-3 sm:p-3 ${a.nivel === "urgente" ? "border-red-200 border-l-4 border-l-[rgb(var(--red-500))]" : "border-slate-100 hover:border-slate-200"}`}>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-cartao sm:h-9 sm:w-9" style={{ background: `color-mix(in srgb, ${a.cor} 16%, transparent)`, color: a.cor }}><a.icon size={16} /></span>
                    <span className={`flex-1 text-xs leading-snug sm:text-sm ${a.nivel === "urgente" ? "font-semibold text-fg" : "text-slate-700"}`}>{a.texto}</span>
                    <ArrowRight size={16} className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand" />
                  </Link>
                </li>
              ))}
            </ul>
            {fila.escondidos.length > 0 && (
              <button type="button" onClick={() => setVerTudo((v) => !v)} className="link-acao mt-3 text-sm max-md:-mb-1.5 max-md:py-1.5">
                {verTudo ? "Mostrar menos" : `Ver mais ${fila.escondidos.length}`}
              </button>
            )}
          </section>
        ) },
        { id: "numeros", titulo: "Números do período (computador)", soComputador: true, conteudo: (
        <section aria-label="Números do período" className="max-sm:hidden">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-fg"><span className="h-4 w-1 rounded-full bg-modulo" aria-hidden />Números {per.id === "hoje" ? "de hoje" : per.id === "mes" ? "do mês" : per.id === "semana" ? "da semana" : "dos últimos 30 dias"}</h2>
            {periodoTabs}
          </div>
          <div className={"grid grid-cols-2 gap-2 sm:gap-3 lg:gap-4"}>
            {kpis.map((c) => <KpiCard key={c.id} c={c} anterior={per.anterior} onClick={() => navigate(c.to, { state: c.state })} />)}
          </div>
          {kpis.some((c) => c.delta !== undefined) && <p className="mt-2 text-xs text-slate-500 sm:hidden">% comparado com {per.anterior}</p>}
        </section>
        ) },
        { id: "vendas", titulo: "Vendas x Recebido", conteudo: podeVer("pedidos") && (
          <Section title="Vendas x Recebido" recolhivel resumo={brlCurto(k.serie[5]?.valores[0] ?? 0)}
            actions={podeVer("relatorios") && <Link to="/relatorios" className="link-acao text-sm max-md:-my-1.5 max-md:inline-block max-md:py-1.5">Relatórios</Link>}>
            <Area dados={k.serie} series={podeVer("financeiro")
              ? [{ nome: "Vendas", cor: "var(--serie-1)" }, { nome: "Recebido", cor: "var(--serie-3)" }]
              : [{ nome: "Vendas", cor: "var(--serie-1)" }]}
              altura={230} />
          </Section>
        ) },
        { id: "contas", titulo: podeVer("financeiro") ? "Contas a receber" : "Assistência técnica agora", conteudo: (
podeVer("financeiro") ? (
          <Section title="Contas a receber" recolhivel resumo={brlCurto(k.receber30 + k.receberDepois + k.receberVencido)}
            actions={<Link to="/financeiro" className="link-acao text-sm max-md:-my-1.5 max-md:inline-block max-md:py-1.5">Abrir</Link>}>
            <Rosca total="Em aberto" fatias={[
              { rotulo: "Vence em 30 dias", valor: k.receber30, cor: "var(--serie-1)" },
              { rotulo: "Depois de 30 dias", valor: k.receberDepois, cor: "var(--serie-3)" },
              { rotulo: "Vencido", valor: k.receberVencido, cor: "rgb(var(--red-500))" },
            ]} />
          </Section>
        ) : (
          <Section title="Assistência técnica agora" recolhivel resumo={`${k.osAbertas} OS`}
            actions={<Link to="/assistencia" className="link-acao text-sm max-md:-my-1.5 max-md:inline-block max-md:py-1.5">Abrir</Link>}>
            <Rosca total="Ordens" fatias={k.osPorSituacao} formatar={(v) => `${v} OS`} />
          </Section>
        )
        ) },
        { id: "fabrica", titulo: "Fábrica", conteudo: podeVer("producao") && (
          <Section title="Fábrica" actions={<Link to="/producao" className="link-acao text-sm max-md:-my-1.5 max-md:inline-block max-md:py-1.5">Abrir produção</Link>}>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-2 sm:gap-2">
              <Mini icon={Factory} cor="var(--kpi-azul)" label="OPs abertas" valor={k.opsAbertas} sub={`${k.maquinasEmProducao} ${pl(k.maquinasEmProducao, "máquina", "máquinas")}`} onClick={() => navigate("/producao")} />
              <Mini icon={PackageSearch} cor={k.opsComFalta ? "var(--kpi-rosa)" : "var(--kpi-verde)"} label="Peça faltando" valor={k.opsComFalta} onClick={() => navigate("/producao")} />
              <Mini icon={ClipboardList} cor="var(--kpi-roxo)" label="Em cotação" valor={k.comprasCotacao} onClick={() => navigate("/compras", { state: { aba: "compras" } })} />
              <Mini icon={Truck} cor="var(--kpi-laranja)" label="A caminho" valor={k.comprasCaminho} sub={k.comprasAtrasadas ? `${k.comprasAtrasadas} ${pl(k.comprasAtrasadas, "atrasada", "atrasadas")}` : "no prazo"} onClick={() => navigate("/compras", { state: { aba: "compras" } })} />
            </div>
          </Section>
        ) },
        { id: "garantias", titulo: "Garantias das máquinas vendidas", conteudo: (
        <Section title="Garantias das máquinas vendidas" actions={<Link to="/garantias" className="link-acao text-sm max-md:-my-1.5 max-md:inline-block max-md:py-1.5">Ver todas</Link>}>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-2 sm:gap-2">
            <Mini icon={ShieldCheck} cor="var(--kpi-verde)" label="Em garantia" valor={k.emGarantia} onClick={() => navigate("/garantias")} />
            <Mini icon={ShieldCheck} cor="var(--kpi-laranja)" label="Vencem em 30 dias" valor={k.garantiaVence} onClick={() => navigate("/garantias")} />
            <Mini icon={ShieldOff} cor="var(--kpi-roxo)" label="Fora da garantia" valor={k.foraGarantia} onClick={() => navigate("/garantias")} />
            <Mini icon={AlarmClock} cor="var(--kpi-rosa)" label="Preventiva atrasada" valor={k.prevAtrasada} onClick={() => navigate("/garantias", { state: { lembretes: true } })} />
          </div>
        </Section>
        ) },
      ]} />
    </div>
  );
}

/** Resumo do celular: cartão azul de cor lisa (sem degradê nem sombra forte, diretrizes de design), 4 números lado a lado com divisórias e a escolha do período. */
function ResumoCelular({ titulo, periodo, onPeriodo, itens, onAbrir }: {
  titulo: string; periodo: Periodo; onPeriodo: (p: Periodo) => void; itens: Kpi[]; onAbrir: (c: Kpi) => void;
}) {
  if (!itens.length) return null;
  return (
    <section aria-label={titulo} className="rounded-painel bg-fixo-blue-700 p-3 text-white shadow-card sm:hidden">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <select value={periodo} onChange={(e) => onPeriodo(e.target.value as Periodo)} aria-label="Período"
          className="rounded-full border-0 bg-white/15 py-1 pl-3 pr-7 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-white/60">
          {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
        </select>
      </div>
      <div className="grid grid-flow-col auto-cols-fr divide-x divide-white/15">
        {itens.map((c) => (
          <button key={c.id} type="button" onClick={() => onAbrir(c)} title={c.sub ? `${c.label}: ${c.valor} · ${c.sub}` : `${c.label}: ${c.valor}`}
            className="botao-toque flex min-w-0 flex-col items-center gap-1 rounded-cartao px-1 py-1.5 text-center active:bg-white/10">
            <c.icon size={19} className="text-white/85" aria-hidden />
            <span className="num max-w-full truncate text-base font-bold leading-tight">{c.moeda && <span className="mr-0.5 text-2xs font-semibold text-white/80">R$</span>}<Contagem>{c.curto ?? c.valor}</Contagem></span>
            <span className="line-clamp-2 text-2xs leading-tight text-white/85">{c.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Cartão de indicador colorido (o brilho é a peça comum estiloBrilho/Luz). Compacto no celular (24/10): ícone pequeno
 *  ao lado do nome, número e uma linha de apoio; tocar abre a tela do número. */
function KpiCard({ c, anterior, onClick }: { c: Kpi; anterior: string; onClick: () => void }) {
  const subiu = (c.delta ?? 0) >= 0;
  return (
    <button onClick={onClick} style={estiloBrilho(c.cor)}
      className="botao-toque group relative flex min-w-0 flex-col overflow-hidden rounded-cartao border p-3 text-left hover:-translate-y-0.5 sm:min-h-[132px] sm:rounded-2xl sm:p-5">
      <Luz cor={c.cor} />
      <span className="flex items-center gap-2 sm:items-start sm:justify-between">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg sm:order-2 sm:h-11 sm:w-11 sm:rounded-xl"
          style={{ background: `color-mix(in srgb, ${c.cor} 22%, transparent)`, color: c.cor }}>
          <c.icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
        <span className="min-w-0 truncate text-xs font-semibold leading-tight text-slate-600 sm:whitespace-normal sm:text-sm">{c.label}</span>
      </span>
      <span className="num mt-2 block truncate text-lg font-bold leading-none tracking-tight text-fg sm:mt-auto sm:pt-2 sm:text-2xl"><Contagem>{c.valor}</Contagem></span>
      <span className="mt-1 flex min-w-0 items-center gap-x-1.5 text-2xs text-slate-500 sm:mt-1.5 sm:flex-wrap sm:gap-y-0.5 sm:text-xs">
        {c.delta !== undefined && (
          c.delta === null
            ? <span className="shrink-0 font-semibold text-emerald-600">novo</span>
            : <span className={`inline-flex shrink-0 items-center font-bold ${subiu ? "text-emerald-600" : "text-red-600"}`} title={`comparado a ${anterior}`}>
                {subiu ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(Math.round(c.delta))}%<span className="ml-1 hidden font-normal text-slate-500 sm:inline">vs {anterior}</span>
              </span>
        )}
        {c.sub && <span className="min-w-0 truncate sm:line-clamp-2 sm:w-full sm:whitespace-normal">{c.sub}</span>}
      </span>
    </button>
  );
}

/** Quadradinho de número (Fábrica, Garantias): no celular 4 por linha, ícone em cima, número e nome curto embaixo. */
function Mini({ icon: Icon, cor, label, valor, sub, onClick }: { icon: LucideIcon; cor: string; label: string; valor: number | string; sub?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={sub ? `${label} · ${sub}` : label}
      className="botao-toque flex min-w-0 flex-col items-center gap-1 rounded-cartao border border-slate-100 px-1 py-2 text-center hover:border-slate-200 hover:bg-slate-50 sm:grid sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-x-2.5 sm:gap-y-1 sm:p-3 sm:text-left">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg sm:h-9 sm:w-9 sm:rounded-xl" style={{ background: `color-mix(in srgb, ${cor} 16%, transparent)`, color: cor }}><Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" /></span>
      <span className="num block max-w-full truncate text-base font-bold leading-none text-fg sm:text-xl">{valor}</span>
      <span className="line-clamp-2 block text-2xs leading-tight text-slate-600 sm:col-span-2 sm:text-xs sm:leading-snug">{label}<span className="hidden sm:inline">{sub ? ` · ${sub}` : ""}</span></span>
    </button>
  );
}
