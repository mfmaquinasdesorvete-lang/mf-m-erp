// Painel do Financeiro: quanto tem, quanto entrou e saiu, para onde foi o dinheiro, quem deve (e há quanto tempo)
// e o que vence nos próximos dias. Tocar numa categoria filtra os maiores pagamentos; os números levam à tela certa.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, CalendarClock, CreditCard, FileWarning, Landmark, MessageCircle, PieChart, Plus, Scale,
  ShieldAlert, Wallet,
} from "lucide-react";
import { Section } from "@/components/ui";
import { Colunas, Ranking, Rosca } from "@/components/Charts";
import { Fluxo } from "@/components/financeiro/VisaoGeral";
import {
  AtalhosArea, baldes, CabecalhoPainel, CartaoPainel, dentro, FiltrosAtivos, frasePeriodo, intervalos, ListaAtencao, PERIODOS, usePeriodo, variacao,
  type Cartao, type ItemAtencao,
} from "@/components/painel/Painel";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { usePerfil } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { brl, dataBR, hoje, somarDias } from "@/lib/format";
import { rotuloCategoria } from "@/lib/dre";
import { aDecidir, type ContaDecisao } from "@/lib/programacao";
import type { ContaFin } from "@/lib/financeiro";

type Receber = ContaFin & { cliente_id?: string | null; cliente?: { nome: string; nome_fantasia?: string | null } | null };
type Pagar = ContaFin & ContaDecisao & { fornecedor?: { nome: string } | null };
const CORES = ["var(--serie-2)", "var(--serie-1)", "var(--serie-3)", "var(--kpi-roxo)", "var(--kpi-rosa)", "var(--kpi-ciano)", "var(--eixo-texto)"];
const pagoValor = (c: ContaFin) => Number(c.valor_pago ?? c.valor ?? 0);
const somaPago = (l: ContaFin[]) => l.reduce((s, c) => s + pagoValor(c), 0);
const somaAberto = (l: ContaFin[]) => l.reduce((s, c) => s + Number(c.valor ?? 0), 0);
const FAIXAS_ATRASO: [string, number, number][] = [["1 a 15 dias", 1, 15], ["16 a 30", 16, 30], ["31 a 60", 31, 60], ["61 a 90", 61, 90], ["mais de 90", 91, 1e9]];
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);

export default function PainelFinanceiroArea() {
  const navigate = useNavigate();
  const { pode, papel } = usePerfil();
  const vePagar = pode("contas_pagar") || papel === "contador";
  const { filtrar } = useUnidade();
  // mesmos selects do painel financeiro da tela inicial: a lista carregada serve aos dois
  const { data: recTodos = [], isLoading } = useRows<Receber>("contas_receber", { select: "*, cliente:clientes(nome, nome_fantasia, whatsapp, cpf_cnpj)", key: ["painel"] });
  const { data: pagTodos = [] } = useRows<Pagar>("contas_pagar", { select: "*, fornecedor:fornecedores(nome, cnpj)", key: ["painel"] });
  const { data: extrato = [] } = useRows<{ status: string }>("extrato_lancamentos", { select: "status", order: "status", key: ["painel"] });
  const { data: notasTodas = [] } = useRows<{ processamento: string; unidade_id: string | null }>("nfe_recebidas", { select: "processamento, unidade_id", key: ["painel"] });
  const { data: saldosTodos = [] } = useQuery({
    queryKey: ["saldos_bancarios"],
    queryFn: async () => { const { data, error } = await supabase.rpc("saldos_bancarios"); if (error) throw error; return (data ?? []) as { conta_id: string; nome: string; unidade_id: string; saldo: number }[]; },
  });
  const [periodo, setPeriodo] = usePeriodo("financeiro");
  const [fCategoria, setFCategoria] = useState<string | null>(null);
  const per = PERIODOS.find((p) => p.id === periodo)!;
  const dia = hoje();

  const rec = useMemo(() => filtrar(recTodos).filter((c) => c.status !== "cancelado").map((c) => ({ ...c, terceiro: c.cliente?.nome_fantasia?.trim() || c.cliente?.nome || null })), [recTodos, filtrar]);
  const pag = useMemo(() => vePagar ? filtrar(pagTodos).filter((c) => c.status !== "cancelado").map((c) => ({ ...c, terceiro: c.fornecedor?.nome ?? null })) : [], [pagTodos, filtrar, vePagar]);
  const saldos = filtrar(saldosTodos);

  const k = useMemo(() => {
    const { atual, anterior } = intervalos(periodo);
    const pagos = <T extends ContaFin>(l: T[], f: [string, string]) => l.filter((c) => c.status === "pago" && dentro(c.data_pagamento, f));
    const bs = baldes(periodo);
    const recebido = somaPago(pagos(rec, atual)), recebidoAnt = somaPago(pagos(rec, anterior));
    const pago = somaPago(pagos(pag, atual)), pagoAnt = somaPago(pagos(pag, anterior));
    const ar = rec.filter((c) => c.status === "aberto"), ap = pag.filter((c) => c.status === "aberto");
    const vencidas = ar.filter((c) => c.vencimento < dia);

    // para onde foi o dinheiro: pagamentos do período por categoria
    const porCategoria = new Map<string, number>();
    for (const c of pagos(pag, atual)) { const n = rotuloCategoria(c.categoria); porCategoria.set(n, (porCategoria.get(n) ?? 0) + pagoValor(c)); }
    const categorias = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]);
    const principais = categorias.slice(0, 6);
    const outras = categorias.slice(6).reduce((s, [, v]) => s + v, 0);

    // quem deve: vencidas por cliente
    const devedores = new Map<string, { nome: string; valor: number; qtd: number; maisAntiga: string }>();
    for (const c of vencidas) {
      const chave = c.cliente_id ?? c.terceiro ?? c.descricao;
      const d = devedores.get(chave) ?? { nome: c.terceiro || c.descricao, valor: 0, qtd: 0, maisAntiga: c.vencimento };
      d.valor += Number(c.valor); d.qtd++; if (c.vencimento < d.maisAntiga) d.maisAntiga = c.vencimento;
      devedores.set(chave, d);
    }
    const proximos = Array.from({ length: 7 }, (_, i) => somarDias(i)).map((d, i) => ({
      rotulo: i === 0 ? "hoje" : i === 1 ? "amanhã" : `${d.slice(8, 10)}/${d.slice(5, 7)}`,
      valores: [somaAberto(ar.filter((c) => c.vencimento === d)), somaAberto(ap.filter((c) => c.vencimento === d))],
    }));

    return {
      recebido, pago, resultado: recebido - pago,
      dRecebido: variacao(recebido, recebidoAnt), dPago: variacao(pago, pagoAnt),
      serie: bs.map((b) => ({ rotulo: b.rotulo, valores: [somaPago(pagos(rec, b.atual)), somaPago(pagos(pag, b.atual))] })),
      tendRec: bs.map((b) => somaPago(pagos(rec, b.atual))), tendPag: bs.map((b) => somaPago(pagos(pag, b.atual))),
      aReceber: somaAberto(ar), vencido: somaAberto(vencidas), qtdVencidas: vencidas.length,
      pctVencido: somaAberto(ar) ? (somaAberto(vencidas) / somaAberto(ar)) * 100 : 0,
      categorias: outras > 0 ? [...principais, ["Outras", outras] as [string, number]] : principais,
      maiores: pagos(pag, atual).filter((c) => !fCategoria || (fCategoria === "Outras" ? !principais.some(([n]) => n === rotuloCategoria(c.categoria)) : rotuloCategoria(c.categoria) === fCategoria))
        .sort((a, b) => pagoValor(b) - pagoValor(a)).slice(0, 6),
      devedores: [...devedores.values()].sort((a, b) => b.valor - a.valor).slice(0, 6),
      atraso: FAIXAS_ATRASO.map(([rotulo, de, ate]) => ({ rotulo, valores: [somaAberto(vencidas.filter((c) => { const n = diasEntre(c.vencimento, dia); return n >= de && n <= ate; }))] })),
      proximos, entra7: proximos.reduce((s, d) => s + d.valores[0], 0), sai7: proximos.reduce((s, d) => s + d.valores[1], 0),
      pagVencidas: ap.filter((c) => c.vencimento < dia), decidir: aDecidir(ap),
    };
  }, [periodo, rec, pag, dia, fCategoria]);

  const saldoBancos = saldos.reduce((s, x) => s + Number(x.saldo), 0);
  const extratoPendente = extrato.filter((l) => l.status === "pendente").length;
  const notasLancar = filtrar(notasTodas).filter((n) => ["aguardando_vinculo", "revisao"].includes(n.processamento)).length;

  const cartoes: Cartao[] = [
    { id: "saldo", rotulo: "Saldo nos bancos", valor: saldos.length ? brl(saldoBancos) : "—", icone: Landmark, cor: "var(--kpi-azul)",
      sub: saldos.length ? `${saldos.length} conta(s) bancária(s)` : "cadastre as contas em Bancos e conciliação", onClick: () => navigate("/conciliacao") },
    { id: "rec", rotulo: "Recebido", valor: brl(k.recebido), icone: ArrowDownCircle, cor: "var(--kpi-verde)", delta: k.dRecebido, tendencia: k.tendRec,
      sub: `${brl(k.aReceber)} ainda a receber`, onClick: () => navigate("/financeiro", { state: { aba: "receber" } }) },
    ...(vePagar ? [{ id: "pag", rotulo: "Pago", valor: brl(k.pago), icone: ArrowUpCircle, cor: "var(--kpi-laranja)", delta: k.dPago, bomCair: true, tendencia: k.tendPag,
      sub: `resultado ${k.resultado >= 0 ? "+" : "−"} ${brl(Math.abs(k.resultado))}`, onClick: () => navigate("/financeiro", { state: { aba: "pagar" } }) } as Cartao] : []),
    { id: "venc", rotulo: "Vencido a receber", valor: brl(k.vencido), icone: AlertTriangle, cor: "var(--kpi-rosa)",
      sub: k.qtdVencidas ? `${k.qtdVencidas} parcela(s) · ${Math.round(k.pctVencido)}% do que há para receber` : "ninguém atrasado", onClick: () => navigate("/financeiro", { state: { aba: "cobranca" } }) },
  ];

  const atencao: ItemAtencao[] = [
    vePagar && k.pagVencidas.length > 0 && { icone: AlertTriangle, cor: "var(--kpi-rosa)", texto: `${k.pagVencidas.length} conta(s) a pagar vencida(s): ${brl(k.pagVencidas.reduce((s, c) => s + Number(c.valor), 0))}`, to: "/financeiro", state: { aba: "pagar" } },
    vePagar && k.decidir.length > 0 && { icone: CalendarClock, cor: "var(--kpi-laranja)", texto: `${k.decidir.length} conta(s) a pagar esperando decisão`, sub: "pagar, agendar ou não pagar", to: "/financeiro", state: { aba: "pagar" } },
    k.qtdVencidas > 0 && { icone: MessageCircle, cor: "var(--kpi-rosa)", texto: `${k.qtdVencidas} parcela(s) vencida(s) para cobrar: ${brl(k.vencido)}`, to: "/financeiro", state: { aba: "cobranca" } },
    extratoPendente > 0 && { icone: Scale, cor: "var(--kpi-roxo)", texto: `${extratoPendente} lançamento(s) do extrato para conciliar`, to: "/conciliacao" },
    vePagar && notasLancar > 0 && { icone: FileWarning, cor: "var(--kpi-ciano)", texto: `${notasLancar} nota(s) de fornecedor para conferir e lançar`, to: "/notas" },
  ].filter(Boolean) as ItemAtencao[];

  const resumo = isLoading ? "Carregando…" : vePagar
    ? <>Entrou {brl(k.recebido)} e saiu {brl(k.pago)}: resultado de <b>{k.resultado >= 0 ? "+" : "−"} {brl(Math.abs(k.resultado))}</b>{frasePeriodo(k.dRecebido, periodo, "a mais recebido", "a menos recebido") ? ` · ${frasePeriodo(k.dRecebido, periodo, "a mais recebido", "a menos recebido")}` : ""}.</>
    : <>Entrou {brl(k.recebido)}{frasePeriodo(k.dRecebido, periodo) ? ` · ${frasePeriodo(k.dRecebido, periodo)}` : ""}.</>;

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPainel icone={Wallet} area="Financeiro" titulo="Como está o dinheiro" resumo={resumo} periodo={periodo} onPeriodo={setPeriodo}
        acoes={vePagar && pode("editar_financeiro") && (
          <button type="button" onClick={() => navigate("/financeiro", { state: { aba: "pagar", nova: true } })}
            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-white px-3.5 text-sm font-bold text-modulo-texto shadow hover:bg-white/90">
            <Plus size={16} /> Conta a pagar
          </button>
        )} />

      <div className={`grid grid-cols-2 gap-3 lg:gap-4 ${cartoes.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {cartoes.map((c) => <CartaoPainel key={c.id} c={c} anterior={per.anterior} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Section title={periodo === "ano" ? "Entradas e saídas mês a mês" : periodo === "hoje" ? "Entradas e saídas dos últimos 7 dias" : "Entradas e saídas dia a dia"} className="xl:col-span-3">
          <Colunas dados={vePagar ? k.serie : k.serie.map((s) => ({ ...s, valores: [s.valores[0]] }))} altura={250} vazio="Nada recebido nem pago no período."
            series={vePagar ? [{ nome: "Recebido", cor: "var(--serie-3)" }, { nome: "Pago", cor: "var(--serie-2)" }] : [{ nome: "Recebido", cor: "var(--serie-3)" }]} />
        </Section>
        <Section title="Próximos 7 dias" className="xl:col-span-2">
          <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-emerald-50 p-2.5"><span className="block text-xs font-semibold text-emerald-800">Vai entrar</span><span className="num text-lg font-bold text-emerald-700">+ {brl(k.entra7)}</span></div>
            {vePagar && <div className="rounded-xl bg-orange-50 p-2.5"><span className="block text-xs font-semibold text-orange-800">Vai sair</span><span className="num text-lg font-bold text-orange-700">− {brl(k.sai7)}</span></div>}
          </div>
          <Colunas dados={vePagar ? k.proximos : k.proximos.map((s) => ({ ...s, valores: [s.valores[0]] }))} altura={190} vazio="Nada vence nos próximos 7 dias."
            series={vePagar ? [{ nome: "A receber", cor: "var(--serie-3)" }, { nome: "A pagar", cor: "var(--serie-2)" }] : [{ nome: "A receber", cor: "var(--serie-3)" }]} />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {vePagar && (
          <Section title="Para onde foi o dinheiro" actions={<span className="text-xs text-slate-500">toque para ver as contas</span>}>
            {k.categorias.length
              ? <Rosca total="Pago" ativo={fCategoria} onClicar={(i) => { const c = k.categorias[i][0]; setFCategoria(fCategoria === c ? null : c); }}
                  fatias={k.categorias.map(([rotulo, valor], i) => ({ rotulo, valor, cor: CORES[i % CORES.length] }))} />
              : <p className="py-10 text-center text-sm text-slate-500">Nada pago no período.</p>}
          </Section>
        )}
        {vePagar && (
          <Section title={fCategoria ? `Maiores pagamentos · ${fCategoria}` : "Maiores pagamentos"}>
            {fCategoria && <div className="mb-3"><FiltrosAtivos filtros={[{ rotulo: "Categoria", valor: fCategoria, limpar: () => setFCategoria(null) }]} onLimpar={() => setFCategoria(null)} /></div>}
            <Ranking cor="var(--serie-2)" vazio="Nada pago no período."
              itens={k.maiores.map((c) => ({ rotulo: c.terceiro || c.descricao, valor: pagoValor(c), detalhe: `${dataBR(c.data_pagamento)} · ${rotuloCategoria(c.categoria)}${c.terceiro ? ` · ${c.descricao}` : ""}` }))} />
          </Section>
        )}
        <Section title="Precisa de atenção" className={vePagar ? "md:col-span-2 xl:col-span-1" : ""}>
          <ListaAtencao itens={atencao} vazio="Nada pendente no financeiro" />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Section title="Quem está devendo" actions={<button type="button" onClick={() => navigate("/financeiro", { state: { aba: "cobranca" } })} className="text-sm font-semibold text-modulo-texto hover:underline">Cobrar</button>}>
          <Ranking cor="var(--kpi-rosa)" vazio="Nenhum cliente com parcela vencida."
            onClicar={() => navigate("/financeiro", { state: { aba: "cobranca" } })}
            itens={k.devedores.map((d) => ({ rotulo: d.nome, valor: d.valor, detalhe: `${d.qtd} parcela(s) · a mais antiga venceu há ${diasEntre(d.maisAntiga, dia)} dia(s)` }))} />
        </Section>
        <Section title="Há quanto tempo está atrasado">
          {k.qtdVencidas
            ? <Colunas dados={k.atraso} series={[{ nome: "Vencido", cor: "var(--kpi-rosa)" }]} altura={220} />
            : <p className="py-10 text-center text-sm text-slate-500">Nenhuma parcela vencida. ✅</p>}
          <p className="mt-2 text-xs text-slate-500">Quanto mais antigo o atraso, mais difícil receber: comece a cobrança pelos da direita.</p>
        </Section>
      </div>

      <Fluxo receber={rec} pagar={pag} dia={dia} />

      <div className="space-y-3">
        <h2 className="flex items-center gap-2 px-1 text-sm font-bold text-fg"><span className="h-4 w-1 rounded-full bg-modulo" aria-hidden />Ir para</h2>
        <AtalhosArea itens={[
          { rotulo: "Contas a pagar e receber", icone: Wallet, to: "/financeiro", aviso: vePagar ? k.pagVencidas.length : 0 },
          { rotulo: "Cobrança", icone: MessageCircle, to: "/financeiro", state: { aba: "cobranca" }, aviso: k.qtdVencidas },
          { rotulo: "Bancos e conciliação", icone: Landmark, to: "/conciliacao", aviso: extratoPendente, tela: "conciliacao" as const },
          ...(vePagar ? [{ rotulo: "DRE", icone: PieChart, to: "/financeiro", state: { aba: "dre" } }] : []),
          { rotulo: "Formas de pagamento", icone: CreditCard, to: "/formas-pagamento" },
          ...(vePagar ? [{ rotulo: "Auditoria financeira", icone: ShieldAlert, to: "/auditoria", tela: "auditoria" as const }] : []),
        ]} />
      </div>
    </div>
  );
}
