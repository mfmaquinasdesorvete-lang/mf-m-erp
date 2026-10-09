import { lazy, Suspense, useMemo, useState, type CSSProperties } from "react";
import { PainelFinanceiro } from "@/components/financeiro/PainelFinanceiro";
import { Link, useNavigate } from "react-router-dom";
import {
  AlarmClock, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BellRing, Boxes, ClipboardList, Factory, FileWarning, PackageSearch, Plus,
  ShieldCheck, ShieldOff, ShoppingBag, Truck, TrendingUp, Wallet, Wrench, type LucideIcon,
} from "lucide-react";
import { Section } from "@/components/ui";
import { Area, Rosca } from "@/components/Charts";
import { useUnidade, EtiquetaUnidade, CampoUnidade } from "@/lib/unidade";
import { useRows } from "@/lib/data";
import { brl, hoje, somarDias } from "@/lib/format";
import { situacaoGarantia, situacaoPreventiva } from "@/lib/garantia";
import { usePerfil } from "@/lib/auth";
import type { Equipamento, Necessidade, OrdemProducao, OrdemServico, Pedido, PedidoCompra, Produto } from "@/lib/types";

const Fluxo = lazy(() => import("@/pages/Fluxo"));

type Conta = { valor: number; vencimento: string; status: string; data_pagamento: string | null; valor_pago: number | null };
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

type Periodo = "hoje" | "7d" | "30d" | "mes";
const PERIODOS: { id: Periodo; rotulo: string; anterior: string }[] = [
  { id: "hoje", rotulo: "Hoje", anterior: "ontem" },
  { id: "7d", rotulo: "7 dias", anterior: "7 dias antes" },
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
  const n = p === "hoje" ? 1 : p === "7d" ? 7 : 30;
  return { atual: [somarDias(-(n - 1)), fim], anterior: [somarDias(-(2 * n - 1)), somarDias(-n)] };
}
const dentro = (data: string | null | undefined, [a, b]: string[]) => !!data && data.slice(0, 10) >= a && data.slice(0, 10) <= b;

type Acao = { label: string; icon: LucideIcon; to: string; state?: unknown; cor: string; aviso?: number };
type Kpi = { id: string; label: string; valor: string | number; sub?: string; icon: LucideIcon; cor: string; delta?: number | null; to: string; state?: unknown };

type Visao = "geral" | "financeiro" | "fluxo";
const VISOES: Record<Visao, [string, string]> = { geral: ["Painel geral", "Geral"], financeiro: ["Painel financeiro", "Financeiro"], fluxo: ["Fluxo de pedidos", "Fluxo"] };

/**
 * Início: vendas já entra no fluxo de pedidos, o financeiro no painel financeiro (feito para o celular);
 * cada um pode trocar e a escolha fica lembrada (por papel, para quem divide o computador).
 */
export default function Dashboard() {
  const { papel, podeVer } = usePerfil();
  const opcoes: Visao[] = papel === "vendas" ? ["fluxo", "geral"]
    : [ "geral" as const, ...(papel === "admin" || papel === "financeiro" ? ["financeiro" as const] : []), ...(podeVer("fluxo") ? ["fluxo" as const] : [])];
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
      {opcoes.length > 1 && (
        <div className="mb-4 inline-flex max-w-full rounded-xl border border-slate-200 bg-surface p-1 shadow-card" role="tablist" aria-label="O que ver no início">
          {opcoes.map((v) => (
            <button key={v} type="button" role="tab" aria-selected={atual === v} onClick={() => escolher(v)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition sm:px-3.5 ${atual === v ? "bg-brand text-brand-fg shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
              {opcoes.length > 2 ? <><span className="sm:hidden">{VISOES[v][1]}</span><span className="hidden sm:inline">{VISOES[v][0]}</span></> : VISOES[v][0]}
            </button>
          ))}
        </div>
      )}
      {atual === "financeiro" ? <PainelFinanceiro />
        : atual === "fluxo" ? <Suspense fallback={<div className="p-8 text-slate-500">Carregando…</div>}><Fluxo /></Suspense>
        : <PainelGeral />}
    </>
  );
}

function PainelGeral() {
  const { nome, pode, podeVer } = usePerfil();
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState<Periodo>(() => {
    try { return (localStorage.getItem("mf-erp-periodo") as Periodo) || "mes"; } catch { return "mes"; }
  });
  const escolher = (p: Periodo) => { setPeriodo(p); try { localStorage.setItem("mf-erp-periodo", p); } catch { /* sem armazenamento */ } };

  const { filtrar } = useUnidade();
  const { data: pedidosTodos = [] } = useRows<Pedido>("pedidos");
  const pedidos = filtrar(pedidosTodos);
  const { data: ordensTodos = [] } = useRows<OrdemServico>("ordens_servico");
  const ordens = filtrar(ordensTodos);
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: receberTodos = [] } = useRows<Conta>("contas_receber");
  const receber = filtrar(receberTodos);
  const { data: pagarTodos = [] } = useRows<Conta>("contas_pagar");
  const pagar = filtrar(pagarTodos);
  const { data: equipamentos = [] } = useRows<Equipamento>("equipamentos", { order: "data_venda" });
  const { data: recebidasTodos = [] } = useRows<{ processamento: string }>("nfe_recebidas", { select: "processamento" });
  const recebidas = filtrar(recebidasTodos);
  const { data: lembretes = [] } = useRows<{ id: string }>("lembretes_manutencao", { select: "id", order: "id" });
  const { data: opsTodos = [] } = useRows<OrdemProducao>("ordens_producao");
  const ops = filtrar(opsTodos);
  const { data: comprasTodos = [] } = useRows<PedidoCompra>("pedidos_compra");
  const compras = filtrar(comprasTodos);
  const { data: necessidade = [] } = useRows<Necessidade>("necessidade_producao", { order: "descricao" });

  const k = useMemo(() => {
    const { atual, anterior } = intervalos(periodo);
    const h = hoje();
    const soma = (l: Conta[], f: (c: Conta) => boolean, campo: "valor" | "valor_pago" = "valor") =>
      l.filter(f).reduce((s, c) => s + Number(c[campo] ?? 0), 0);
    const validos = pedidos.filter((p) => !["orcamento", "cancelado"].includes(p.status));
    const vendas = (r: string[]) => validos.filter((p) => dentro(p.created_at, r));
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
          validos.filter((p) => p.created_at.startsWith(am)).reduce((s, p) => s + Number(p.valor_total), 0),
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
      receberVencido: soma(abertos, (c) => c.vencimento < h),
      qtdReceberVencido: abertos.filter((c) => c.vencimento < h).length,
      receber30: soma(abertos, (c) => c.vencimento >= h && c.vencimento <= somarDias(30)),
      receberDepois: soma(abertos, (c) => c.vencimento > somarDias(30)),
      pagarVencido: soma(pagar, (c) => c.status === "aberto" && c.vencimento < h),
      pagar7: soma(pagar, (c) => c.status === "aberto" && c.vencimento >= h && c.vencimento <= somarDias(7)),
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
  }, [periodo, pedidos, ordens, produtos, receber, pagar, equipamentos, recebidas, ops, compras, necessidade]);

  const per = PERIODOS.find((p) => p.id === periodo)!;

  // Cartões coloridos: os 4 primeiros que o papel pode ver
  const kpis = ([
    podeVer("pedidos") && { id: "vendas", label: "Vendas", valor: brl(k.vendas), sub: `${k.qtdVendas} pedido(s)`, icon: TrendingUp, cor: "var(--kpi-ciano)", delta: k.dVendas, to: "/pedidos" },
    podeVer("financeiro") && { id: "recebido", label: "Recebido", valor: brl(k.recebido), sub: `${brl(k.receber30)} a receber em 30 dias`, icon: Wallet, cor: "var(--kpi-verde)", delta: k.dRecebido, to: "/financeiro" },
    { id: "os", label: "OS em andamento", valor: k.osAbertas, sub: `${k.osNovas} entrou(aram) · ${k.osProntas} pronta(s)`, icon: Wrench, cor: "var(--kpi-laranja)", to: "/assistencia" },
    podeVer("financeiro") && { id: "vencido", label: "Cobranças vencidas", valor: brl(k.receberVencido), sub: k.qtdReceberVencido ? `${k.qtdReceberVencido} cliente(s) para cobrar` : "ninguém atrasado", icon: AlertTriangle, cor: "var(--kpi-rosa)", to: "/financeiro" },
    podeVer("pedidos") && { id: "orc", label: "Orçamentos abertos", valor: k.orcamentos, sub: `${k.aEntregar} pedido(s) a entregar`, icon: ClipboardList, cor: "var(--kpi-roxo)", to: "/pedidos" },
    podeVer("producao") && { id: "prod", label: "Em produção", valor: `${k.maquinasEmProducao} máq.`, sub: k.opsComFalta ? `${k.opsComFalta} OP com peça faltando` : "peças ok", icon: Factory, cor: "var(--kpi-azul)", to: "/producao" },
    { id: "garantia", label: "Em garantia", valor: k.emGarantia, sub: `${k.garantiaVence} vencem em 30 dias`, icon: ShieldCheck, cor: "var(--kpi-verde)", to: "/garantias" },
    podeVer("garantias") && { id: "prev", label: "Preventivas a lembrar", valor: lembretes.length, sub: `${k.prevAtrasada} atrasada(s)`, icon: BellRing, cor: "var(--kpi-rosa)", to: "/garantias", state: { lembretes: true } },
  ].filter(Boolean) as Kpi[]).slice(0, 4);

  // Atalhos estilo "app": o que cada papel mais faz
  const acoes = ([
    pode("editar_pedidos") && { label: "Novo orçamento", icon: Plus, to: "/pedidos", state: { novo: true }, cor: "var(--kpi-ciano)" },
    pode("editar_os") && { label: "Nova OS", icon: Wrench, to: "/assistencia", state: { novaOS: {} }, cor: "var(--kpi-laranja)" },
    podeVer("garantias") && { label: "Lembrar clientes", icon: BellRing, to: "/garantias", state: { lembretes: true }, cor: "var(--kpi-rosa)", aviso: lembretes.length },
    pode("editar_producao") && { label: "Pedir peças", icon: ShoppingBag, to: "/producao", state: { aba: "compras", novaCompra: true }, cor: "var(--kpi-roxo)" },
    podeVer("financeiro") && { label: "Contas", icon: Wallet, to: "/financeiro", cor: "var(--kpi-verde)", aviso: k.qtdReceberVencido },
    podeVer("producao") && { label: "Produção", icon: Factory, to: "/producao", cor: "var(--kpi-azul)" },
    podeVer("estoque") && { label: "Estoque", icon: Boxes, to: "/estoque", cor: "var(--kpi-ciano)", aviso: k.estoqueBaixo.length },
    pode("nfe_recebidas") && { label: "Notas", icon: FileWarning, to: "/notas", cor: "var(--kpi-laranja)", aviso: k.nfeConferir },
  ].filter(Boolean) as Acao[]).slice(0, 8);

  const atencao = [
    podeVer("financeiro") && k.qtdReceberVencido > 0 && { icon: Wallet, cor: "var(--kpi-rosa)", texto: `${k.qtdReceberVencido} cobrança(s) vencida(s): ${brl(k.receberVencido)}`, to: "/financeiro" },
    pode("contas_pagar") && k.pagarVencido > 0 && { icon: AlertTriangle, cor: "var(--kpi-rosa)", texto: `${brl(k.pagarVencido)} em contas a pagar vencidas`, to: "/financeiro" },
    k.osAtrasadas > 0 && { icon: Wrench, cor: "var(--kpi-laranja)", texto: `${k.osAtrasadas} OS com a entrega atrasada`, to: "/assistencia" },
    lembretes.length > 0 && { icon: BellRing, cor: "var(--kpi-laranja)", texto: `${lembretes.length} cliente(s) para lembrar da preventiva`, to: "/garantias", state: { lembretes: true } },
    podeVer("producao") && k.opsComFalta > 0 && { icon: PackageSearch, cor: "var(--kpi-rosa)", texto: `${k.opsComFalta} ordem(ns) de produção com peça faltando`, to: "/producao" },
    pode("editar_producao") && k.comprasAtrasadas > 0 && { icon: Truck, cor: "var(--kpi-laranja)", texto: `${k.comprasAtrasadas} pedido(s) de compra com entrega atrasada`, to: "/producao", state: { aba: "compras" } },
    k.garantiaVence > 0 && { icon: ShieldCheck, cor: "var(--kpi-laranja)", texto: `${k.garantiaVence} garantia(s) vencendo em 30 dias`, to: "/garantias" },
    pode("nfe_recebidas") && k.nfeConferir > 0 && { icon: FileWarning, cor: "var(--kpi-roxo)", texto: `${k.nfeConferir} nota(s) de fornecedor para conferir`, to: "/notas" },
    k.estoqueBaixo.length > 0 && { icon: Boxes, cor: "var(--kpi-laranja)", texto: `${k.estoqueBaixo.length} item(ns) no estoque mínimo`, to: "/estoque" },
    podeVer("pedidos") && k.orcamentos > 0 && { icon: ClipboardList, cor: "var(--kpi-ciano)", texto: `${k.orcamentos} orçamento(s) esperando resposta`, to: "/pedidos" },
  ].filter(Boolean) as { icon: LucideIcon; cor: string; texto: string; to: string; state?: unknown }[];

  const h = new Date().getHours();
  const saudacao = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Cabeçalho + período */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">{saudacao}, {nome.split(" ")[0]} 👋</h1>
          <p className="mt-0.5 text-[15px] text-slate-500">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
            {" · "}{atencao.length ? <span className="font-semibold text-red-600">{atencao.length} assunto(s) pedem atenção</span> : "tudo em dia"}
          </p>
        </div>
        <div role="tablist" aria-label="Período" className="grid grid-cols-4 gap-1 rounded-2xl border border-slate-200 bg-surface p-1 shadow-card sm:inline-grid">
          {PERIODOS.map((p) => (
            <button key={p.id} role="tab" aria-selected={periodo === p.id} onClick={() => escolher(p.id)}
              className={`min-h-[40px] rounded-xl px-3 text-sm font-semibold transition sm:px-4 ${
                periodo === p.id ? "bg-brand text-brand-fg shadow" : "text-slate-500 hover:bg-slate-50 hover:text-fg"}`}>
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>

      {/* Indicadores coloridos */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {kpis.map((c) => <KpiCard key={c.id} c={c} anterior={per.anterior} onClick={() => navigate(c.to, { state: c.state })} />)}
      </div>
      {kpis.some((c) => c.delta !== undefined) && <p className="-mt-3 text-xs text-slate-500 sm:hidden">% comparado com {per.anterior}</p>}

      {/* Atalhos */}
      {acoes.length > 0 && (
        <div className="grid grid-cols-4 gap-2 rounded-2xl border border-slate-200 bg-surface p-3 shadow-card sm:gap-3 sm:p-4 lg:grid-cols-8">
          {acoes.map((a) => (
            <button key={a.label} onClick={() => navigate(a.to, { state: a.state })}
              className="group flex flex-col items-center gap-1.5 rounded-xl p-1.5 text-center transition hover:bg-slate-50">
              <span className="relative grid h-12 w-12 place-items-center rounded-2xl transition group-hover:scale-105 sm:h-14 sm:w-14"
                style={{ background: `color-mix(in srgb, ${a.cor} 18%, transparent)`, color: a.cor, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${a.cor} 35%, transparent)` }}>
                <a.icon size={24} />
                {!!a.aviso && (
                  <span className="num absolute -right-1.5 -top-1.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-[rgb(var(--surface))]">{a.aviso}</span>
                )}
              </span>
              <span className="text-xs font-semibold leading-tight text-slate-700 sm:text-[13px]">{a.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {podeVer("pedidos") && (
          <Section title="Vendas x Recebido · 6 meses" className="xl:col-span-3"
            actions={podeVer("relatorios") && <Link to="/relatorios" className="text-sm font-semibold text-brand hover:underline">Relatórios</Link>}>
            <Area dados={k.serie} series={podeVer("financeiro")
              ? [{ nome: "Vendas", cor: "var(--serie-1)" }, { nome: "Recebido", cor: "var(--serie-3)" }]
              : [{ nome: "Vendas", cor: "var(--serie-1)" }]}
              altura={230} />
          </Section>
        )}

        {podeVer("financeiro") ? (
          <Section title="Contas a receber" className="xl:col-span-2"
            actions={<Link to="/financeiro" className="text-sm font-semibold text-brand hover:underline">Abrir</Link>}>
            <Rosca total="Em aberto" fatias={[
              { rotulo: "Vence em 30 dias", valor: k.receber30, cor: "var(--serie-1)" },
              { rotulo: "Depois de 30 dias", valor: k.receberDepois, cor: "var(--serie-3)" },
              { rotulo: "Vencido", valor: k.receberVencido, cor: "rgb(var(--red-500))" },
            ]} />
          </Section>
        ) : (
          <Section title="Assistência técnica agora" className={podeVer("pedidos") ? "xl:col-span-2" : "xl:col-span-5"}
            actions={<Link to="/assistencia" className="text-sm font-semibold text-brand hover:underline">Abrir</Link>}>
            <Rosca total="Ordens" fatias={k.osPorSituacao} formatar={(v) => `${v} OS`} />
          </Section>
        )}

        {/* Precisa de atenção */}
        <Section title="Precisa de atenção" className="xl:col-span-2">
          {atencao.length ? (
            <ul className="space-y-2">
              {atencao.map((a) => (
                <li key={a.texto}>
                  <Link to={a.to} state={a.state} className="group flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-slate-200 hover:bg-slate-50">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${a.cor} 16%, transparent)`, color: a.cor }}><a.icon size={18} /></span>
                    <span className="flex-1 text-[15px] leading-snug text-slate-700">{a.texto}</span>
                    <ArrowRight size={16} className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="py-10 text-center text-slate-500">Tudo em dia por aqui. ✅</p>}
        </Section>

        <div className="space-y-4 xl:col-span-3">
          {podeVer("producao") && (
            <Section title="Fábrica" actions={<Link to="/producao" className="text-sm font-semibold text-brand hover:underline">Abrir produção</Link>}>
              <div className="grid grid-cols-2 gap-2">
                <Mini icon={Factory} cor="var(--kpi-azul)" label="OPs abertas" valor={k.opsAbertas} sub={`${k.maquinasEmProducao} máquina(s)`} onClick={() => navigate("/producao")} />
                <Mini icon={PackageSearch} cor={k.opsComFalta ? "var(--kpi-rosa)" : "var(--kpi-verde)"} label="Peça faltando" valor={k.opsComFalta} onClick={() => navigate("/producao")} />
                <Mini icon={ClipboardList} cor="var(--kpi-roxo)" label="Em cotação" valor={k.comprasCotacao} onClick={() => navigate("/producao", { state: { aba: "compras" } })} />
                <Mini icon={Truck} cor="var(--kpi-laranja)" label="A caminho" valor={k.comprasCaminho} sub={k.comprasAtrasadas ? `${k.comprasAtrasadas} atrasada(s)` : "no prazo"} onClick={() => navigate("/producao", { state: { aba: "compras" } })} />
              </div>
            </Section>
          )}
          <Section title="Garantias das máquinas vendidas" actions={<Link to="/garantias" className="text-sm font-semibold text-brand hover:underline">Ver todas</Link>}>
            <div className="grid grid-cols-2 gap-2">
              <Mini icon={ShieldCheck} cor="var(--kpi-verde)" label="Em garantia" valor={k.emGarantia} onClick={() => navigate("/garantias")} />
              <Mini icon={ShieldCheck} cor="var(--kpi-laranja)" label="Vencem em 30 dias" valor={k.garantiaVence} onClick={() => navigate("/garantias")} />
              <Mini icon={ShieldOff} cor="var(--kpi-roxo)" label="Fora da garantia" valor={k.foraGarantia} onClick={() => navigate("/garantias")} />
              <Mini icon={AlarmClock} cor="var(--kpi-rosa)" label="Preventiva atrasada" valor={k.prevAtrasada} onClick={() => navigate("/garantias", { state: { lembretes: true } })} />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

/** Cartão de indicador colorido: fundo tingido com a cor, ícone grande e variação vs período anterior. */
function KpiCard({ c, anterior, onClick }: { c: Kpi; anterior: string; onClick: () => void }) {
  const estilo: CSSProperties = {
    background: `linear-gradient(140deg, color-mix(in srgb, ${c.cor} 20%, rgb(var(--surface))) 0%, rgb(var(--surface)) 70%)`,
    borderColor: `color-mix(in srgb, ${c.cor} 38%, transparent)`,
    boxShadow: `0 12px 28px -20px ${c.cor}`,
  };
  const subiu = (c.delta ?? 0) >= 0;
  return (
    <button onClick={onClick} style={estilo}
      className="group relative flex min-h-[132px] flex-col overflow-hidden rounded-2xl border p-3.5 text-left transition hover:-translate-y-0.5 sm:p-5">
      <span className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-25 blur-2xl" style={{ background: c.cor }} aria-hidden />
      <span className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-semibold leading-tight text-slate-600 sm:text-sm">{c.label}</span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-11 sm:w-11"
          style={{ background: `color-mix(in srgb, ${c.cor} 22%, transparent)`, color: c.cor }}>
          <c.icon size={20} />
        </span>
      </span>
      <span className="num mt-auto block pt-2 text-[22px] font-extrabold leading-none tracking-tight text-fg sm:text-[28px]">{c.valor}</span>
      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
        {c.delta !== undefined && (
          c.delta === null
            ? <span className="font-semibold text-emerald-600">novo</span>
            : <span className={`inline-flex items-center font-bold ${subiu ? "text-emerald-600" : "text-red-600"}`} title={`comparado a ${anterior}`}>
                {subiu ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(Math.round(c.delta))}%<span className="ml-1 hidden font-normal text-slate-500 sm:inline">vs {anterior}</span>
              </span>
        )}
        {c.sub && <span className="line-clamp-2 w-full">{c.sub}</span>}
      </span>
    </button>
  );
}

function Mini({ icon: Icon, cor, label, valor, sub, onClick }: { icon: LucideIcon; cor: string; label: string; valor: number | string; sub?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 text-left transition hover:border-slate-200 hover:bg-slate-50">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${cor} 16%, transparent)`, color: cor }}><Icon size={19} /></span>
      <span className="min-w-0">
        <span className="num block text-xl font-bold leading-none text-fg">{valor}</span>
        <span className="mt-1 block text-xs leading-tight text-slate-500">{label}{sub ? ` · ${sub}` : ""}</span>
      </span>
    </button>
  );
}
