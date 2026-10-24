// Painel do Financeiro: quanto tem, quanto entrou e saiu, para onde foi o dinheiro, quem deve (e há quanto tempo)
// e o que vence nos próximos dias. Tocar numa categoria filtra os maiores pagamentos; os números levam à tela certa.
// Entrou e saiu vêm dos extratos dos bancos (todo o dinheiro que passou nas contas, sem as transferências entre elas);
// sem extrato importado, vêm das contas pagas e recebidas. A saída ligada a uma conta a pagar leva a categoria dela.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, CalendarClock, ClipboardCheck, CreditCard, FileWarning, Landmark, MessageCircle, PieChart, Plus, Scale,
  ShieldAlert, Wallet,
} from "lucide-react";
import { Section } from "@/components/ui";
import { Colunas, Ranking, Rosca } from "@/components/Charts";
import { Fluxo } from "@/components/financeiro/VisaoGeral";
import { CartoesCorporativos } from "@/components/financeiro/CartaoCorporativo";
import { ResumoPagarTipos } from "@/components/financeiro/ResumoPagar";
import {
  AtalhosArea, baldes, CabecalhoPainel, CartaoPainel, dentro, FiltrosAtivos, frasePeriodo, intervalos, ListaAtencao, PERIODOS, usePeriodo, variacao,
  type Cartao, type ItemAtencao,
} from "@/components/painel/Painel";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { usePerfil } from "@/lib/auth";
import { useConfig } from "@/lib/useConfig";
import { supabase } from "@/lib/supabase";
import { brl, dataBR, hoje, somarDias, pl } from "@/lib/format";
import { rotuloCategoria } from "@/lib/dre";
import { aDecidir, type ContaDecisao } from "@/lib/programacao";
import { quemPode, regrasDe, type ContaRevisao } from "@/lib/aprovacao";
import { raizCnpj, resumoPorTipo, tipoPagar } from "@/lib/tiposPagar";
import type { ContaFin } from "@/lib/financeiro";
import { estabelecimento, ROTULO_TIPO, semRepetidos, tipoLancamento, transferenciasInternas } from "@/lib/extratoTipos";

type Receber = ContaFin & { cliente_id?: string | null; cliente?: { nome: string; nome_fantasia?: string | null } | null };
type Pagar = ContaFin & ContaDecisao & { fornecedor?: { nome: string; cnpj?: string | null } | null };
type Lanc = { id: string; conta_bancaria_id: string; data: string; valor: number; descricao: string | null; identificador: string | null; status: string; conta_pagar_id: string | null };
const CORES = ["var(--serie-2)", "var(--serie-1)", "var(--serie-3)", "var(--kpi-roxo)", "var(--kpi-rosa)", "var(--kpi-ciano)", "var(--eixo-texto)"];
const pagoValor = (c: ContaFin) => Number(c.valor_pago ?? c.valor ?? 0);
const somaPago = (l: ContaFin[]) => l.reduce((s, c) => s + pagoValor(c), 0);
const somaAberto = (l: ContaFin[]) => l.reduce((s, c) => s + Number(c.valor ?? 0), 0);
const FAIXAS_ATRASO: [string, number, number][] = [["1 a 15 dias", 1, 15], ["16 a 30", 16, 30], ["31 a 60", 31, 60], ["61 a 90", 61, 90], ["mais de 90", 91, 1e9]];
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);

export default function PainelFinanceiroArea() {
  const navigate = useNavigate();
  const { pode, papel, tem, user_id } = usePerfil();
  const vePagar = pode("contas_pagar") || papel === "contador";
  const { filtrar } = useUnidade();
  // mesmos selects do painel financeiro da tela inicial: a lista carregada serve aos dois
  const { data: recTodos = [], isLoading } = useRows<Receber>("contas_receber", { select: "*, cliente:clientes(nome, nome_fantasia, whatsapp, cpf_cnpj)", key: ["painel"] });
  const { data: pagTodos = [] } = useRows<Pagar>("contas_pagar", { select: "*, fornecedor:fornecedores(nome, cnpj, bloqueado, bloqueio_motivo)", key: ["painel"] });
  const { data: extrato = [] } = useRows<Lanc>("extrato_lancamentos", { select: "id, conta_bancaria_id, data, valor, descricao, identificador, status, conta_pagar_id", order: "data", key: ["painel"] });
  const { data: notasTodas = [] } = useRows<{ processamento: string; unidade_id: string | null }>("nfe_recebidas", { select: "processamento, unidade_id", key: ["painel"] });
  const { data: saldosTodos = [] } = useQuery({
    queryKey: ["saldos_bancarios"],
    queryFn: async () => { const { data, error } = await supabase.rpc("saldos_bancarios"); if (error) throw error; return (data ?? []) as { conta_id: string; nome: string; unidade_id: string; saldo: number }[]; },
  });
  // quanto tem para pagar por tipo (a transportadora pelo CNPJ do cadastro) e o que espera o seu ok
  const { data: transportadoras = [] } = useRows<{ id: string; cnpj: string | null }>("transportadoras", { select: "id, cnpj", order: "nome", ascending: true, key: ["cnpj"] });
  const { data: cfg } = useConfig();
  const [periodo, setPeriodo] = usePeriodo("financeiro");
  const [fCategoria, setFCategoria] = useState<string | null>(null);
  const per = PERIODOS.find((p) => p.id === periodo)!;
  const dia = hoje();

  const rec = useMemo(() => filtrar(recTodos).filter((c) => c.status !== "cancelado").map((c) => ({ ...c, terceiro: c.cliente?.nome_fantasia?.trim() || c.cliente?.nome || null })), [recTodos, filtrar]);
  const pag = useMemo(() => vePagar ? filtrar(pagTodos).filter((c) => c.status !== "cancelado").map((c) => ({ ...c, terceiro: c.fornecedor?.nome ?? null })) : [], [pagTodos, filtrar, vePagar]);
  const saldos = filtrar(saldosTodos);
  // extratos das contas ativas da unidade escolhida; o mesmo lançamento em duas contas conta uma vez; transferência entre contas não é entrada nem saída
  const mov = useMemo(() => {
    const ids = new Set(filtrar(saldosTodos).map((x) => x.conta_id));
    const daqui = semRepetidos(extrato.filter((l) => ids.has(l.conta_bancaria_id) && l.status !== "transferencia"));
    const internas = transferenciasInternas(daqui);
    return daqui.filter((l) => !internas.has(l.id));
  }, [extrato, saldosTodos, filtrar]);
  const usaExtrato = mov.length > 0;
  const nomeConta = (id: string) => saldosTodos.find((x) => x.conta_id === id)?.nome ?? "";

  const k = useMemo(() => {
    const { atual, anterior } = intervalos(periodo);
    const pagos = <T extends ContaFin>(l: T[], f: [string, string]) => l.filter((c) => c.status === "pago" && dentro(c.data_pagamento, f));
    const bs = baldes(periodo);
    const contasRecebido = somaPago(pagos(rec, atual)), contasPago = somaPago(pagos(pag, atual));
    // dinheiro que passou nos bancos (extratos) ou, sem extrato, as contas pagas e recebidas
    const movDe = (f: [string, string]) => mov.filter((l) => dentro(l.data, f));
    const entrouExt = (f: [string, string]) => movDe(f).reduce((t, l) => t + Math.max(0, Number(l.valor)), 0);
    const saiuExt = (f: [string, string]) => movDe(f).reduce((t, l) => t + Math.max(0, -Number(l.valor)), 0);
    const entrou = (f: [string, string]) => usaExtrato ? entrouExt(f) : somaPago(pagos(rec, f));
    const saiu = (f: [string, string]) => usaExtrato ? saiuExt(f) : somaPago(pagos(pag, f));
    const recebido = entrou(atual), recebidoAnt = entrou(anterior);
    const pago = saiu(atual), pagoAnt = saiu(anterior);
    const ar = rec.filter((c) => c.status === "aberto"), ap = pag.filter((c) => c.status === "aberto");
    // parcela no cartão quem paga é a maquininha: não entra como vencida para cobrar
    const vencidas = ar.filter((c) => c.vencimento < dia && (c as { forma_pagamento?: string | null }).forma_pagamento !== "cartao");

    // para onde foi o dinheiro: saídas do período por categoria (a da conta a pagar ligada, senão o tipo do extrato)
    const contaPag = new Map(pag.map((c) => [c.id, c]));
    type Saida = { rotulo: string; valor: number; data: string; categoria: string; detalhe: string };
    const saidas: Saida[] = usaExtrato
      ? movDe(atual).filter((l) => Number(l.valor) < 0).map((l) => {
        const c = l.conta_pagar_id ? contaPag.get(l.conta_pagar_id) : undefined;
        return { rotulo: c ? c.terceiro || c.descricao : estabelecimento(l.descricao), valor: -Number(l.valor), data: l.data,
          categoria: c ? rotuloCategoria(c.categoria) : ROTULO_TIPO[tipoLancamento(l.descricao, Number(l.valor))], detalhe: nomeConta(l.conta_bancaria_id) };
      })
      : pagos(pag, atual).map((c) => ({ rotulo: c.terceiro || c.descricao, valor: pagoValor(c), data: c.data_pagamento ?? "", categoria: rotuloCategoria(c.categoria), detalhe: c.terceiro ? c.descricao : "" }));
    const porCategoria = new Map<string, number>();
    for (const x of saidas) porCategoria.set(x.categoria, (porCategoria.get(x.categoria) ?? 0) + x.valor);
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
      recebido, pago, resultado: recebido - pago, contasRecebido, contasPago,
      dRecebido: variacao(recebido, recebidoAnt), dPago: variacao(pago, pagoAnt),
      serie: bs.map((b) => ({ rotulo: b.rotulo, valores: [entrou(b.atual), saiu(b.atual)] })),
      tendRec: bs.map((b) => entrou(b.atual)), tendPag: bs.map((b) => saiu(b.atual)),
      porConta: saldos.map((x) => {
        const l = mov.filter((m) => m.conta_bancaria_id === x.conta_id && dentro(m.data, atual));
        return { nome: x.nome, saldo: Number(x.saldo), entrou: l.reduce((t, m) => t + Math.max(0, Number(m.valor)), 0), saiu: l.reduce((t, m) => t + Math.max(0, -Number(m.valor)), 0), n: l.length };
      }),
      aReceber: somaAberto(ar), vencido: somaAberto(vencidas), qtdVencidas: vencidas.length,
      pctVencido: somaAberto(ar) ? (somaAberto(vencidas) / somaAberto(ar)) * 100 : 0,
      categorias: outras > 0 ? [...principais, ["Outras", outras] as [string, number]] : principais,
      maiores: saidas.filter((x) => !fCategoria || (fCategoria === "Outras" ? !principais.some(([n]) => n === x.categoria) : x.categoria === fCategoria))
        .sort((a, b) => b.valor - a.valor).slice(0, 6),
      devedores: [...devedores.values()].sort((a, b) => b.valor - a.valor).slice(0, 6),
      atraso: FAIXAS_ATRASO.map(([rotulo, de, ate]) => ({ rotulo, valores: [somaAberto(vencidas.filter((c) => { const n = diasEntre(c.vencimento, dia); return n >= de && n <= ate; }))] })),
      proximos, entra7: proximos.reduce((s, d) => s + d.valores[0], 0), sai7: proximos.reduce((s, d) => s + d.valores[1], 0),
      pagVencidas: ap.filter((c) => c.vencimento < dia && (c as { decisao?: string | null }).decisao !== "nao_pagar"), decidir: aDecidir(ap),
    };
  }, [periodo, rec, pag, dia, fCategoria, mov, usaExtrato, saldos]); // eslint-disable-line react-hooks/exhaustive-deps

  const aPagar = useMemo(() => {
    const raizes = new Set(transportadoras.map((t) => raizCnpj(t.cnpj)).filter(Boolean));
    const regras = regrasDe(cfg);
    const minhaVez = tem("financeiro") ? pag.filter((c) => c.status === "aberto" && quemPode(c as unknown as ContaRevisao, { id: user_id, admin: papel === "admin" }, regras).pode) : [];
    return { resumo: resumoPorTipo(pag, (c) => tipoPagar(c, raizes), dia), minhaVez };
  }, [pag, transportadoras, cfg, dia, user_id, papel]); // eslint-disable-line react-hooks/exhaustive-deps
  const saldoBancos = saldos.reduce((s, x) => s + Number(x.saldo), 0);
  const extratoPendente = useMemo(() => { const ids = new Set(saldos.map((x) => x.conta_id)); return extrato.filter((l) => l.status === "pendente" && ids.has(l.conta_bancaria_id)).length; }, [extrato, saldos]);
  const notasLancar = filtrar(notasTodas).filter((n) => ["aguardando_vinculo", "revisao"].includes(n.processamento)).length;

  const cartoes: Cartao[] = [
    { id: "saldo", rotulo: "Saldo nos bancos", valor: saldos.length ? brl(saldoBancos) : "—", icone: Landmark, cor: "var(--kpi-azul)",
      sub: saldos.length ? `${saldos.length} ${pl(saldos.length, "conta", "contas")} ${pl(saldos.length, "bancária", "bancárias")}` : "cadastre as contas em Bancos e conciliação", onClick: () => navigate("/conciliacao") },
    { id: "rec", rotulo: usaExtrato ? "Entrou nas contas" : "Recebido", valor: brl(k.recebido), icone: ArrowDownCircle, cor: "var(--kpi-verde)", delta: k.dRecebido, tendencia: k.tendRec,
      sub: usaExtrato ? `extratos · contas recebidas no ERP: ${brl(k.contasRecebido)}` : `${brl(k.aReceber)} ainda a receber`,
      onClick: () => navigate(usaExtrato ? "/conciliacao" : "/financeiro", { state: { aba: "receber" } }) },
    ...(vePagar ? [{ id: "pag", rotulo: usaExtrato ? "Saiu das contas" : "Pago", valor: brl(k.pago), icone: ArrowUpCircle, cor: "var(--kpi-laranja)", delta: k.dPago, bomCair: true, tendencia: k.tendPag,
      sub: `resultado ${k.resultado >= 0 ? "+" : "−"} ${brl(Math.abs(k.resultado))}${usaExtrato ? ` · contas pagas no ERP: ${brl(k.contasPago)}` : ""}`,
      onClick: () => navigate(usaExtrato ? "/conciliacao" : "/financeiro", { state: { aba: "pagar" } }) } as Cartao] : []),
    { id: "venc", rotulo: "Vencido a receber", valor: brl(k.vencido), icone: AlertTriangle, cor: "var(--kpi-rosa)",
      sub: k.qtdVencidas ? `${k.qtdVencidas} ${pl(k.qtdVencidas, "parcela", "parcelas")} · ${Math.round(k.pctVencido)}% do que há para receber` : "ninguém atrasado", onClick: () => navigate("/financeiro", { state: { aba: "cobranca" } }) },
  ];

  const atencao: ItemAtencao[] = [
    aPagar.minhaVez.length > 0 && { icone: ClipboardCheck, cor: "var(--kpi-roxo)", texto: `${aPagar.minhaVez.length} ${pl(aPagar.minhaVez.length, "conta", "contas")} a pagar esperando o seu ok: ${brl(aPagar.minhaVez.reduce((s, c) => s + Number(c.valor), 0))}`,
      sub: "Aprovar ou não, em Contas a pagar", to: "/financeiro", state: { aba: "pagar" } },
    vePagar && k.pagVencidas.length > 0 && { icone: AlertTriangle, cor: "var(--kpi-rosa)", texto: `${k.pagVencidas.length} ${pl(k.pagVencidas.length, "conta", "contas")} a pagar ${pl(k.pagVencidas.length, "vencida", "vencidas")}: ${brl(k.pagVencidas.reduce((s, c) => s + Number(c.valor), 0))}`, to: "/financeiro", state: { aba: "pagar" } },
    vePagar && k.decidir.length > 0 && { icone: CalendarClock, cor: "var(--kpi-laranja)", texto: `${k.decidir.length} ${pl(k.decidir.length, "conta", "contas")} a pagar esperando decisão`, sub: "pagar, agendar ou não pagar", to: "/financeiro", state: { aba: "pagar" } },
    k.qtdVencidas > 0 && { icone: MessageCircle, cor: "var(--kpi-rosa)", texto: `${k.qtdVencidas} ${pl(k.qtdVencidas, "parcela", "parcelas")} ${pl(k.qtdVencidas, "vencida", "vencidas")} para cobrar: ${brl(k.vencido)}`, to: "/financeiro", state: { aba: "cobranca" } },
    extratoPendente > 0 && { icone: Scale, cor: "var(--kpi-roxo)", texto: `${extratoPendente} ${pl(extratoPendente, "lançamento", "lançamentos")} do extrato para conciliar`, to: "/conciliacao" },
    vePagar && notasLancar > 0 && { icone: FileWarning, cor: "var(--kpi-ciano)", texto: `${notasLancar} ${pl(notasLancar, "nota", "notas")} de fornecedor para conferir e lançar`, to: "/notas", state: { aba: "recebidas" } },
  ].filter(Boolean) as ItemAtencao[];

  const resumo = isLoading ? "Carregando…" : vePagar
    ? <>Entrou {brl(k.recebido)} e saiu {brl(k.pago)}{usaExtrato ? " nas contas" : ""}: resultado de <b>{k.resultado >= 0 ? "+" : "−"} {brl(Math.abs(k.resultado))}</b>{frasePeriodo(k.dRecebido, periodo, "a mais recebido", "a menos recebido") ? ` · ${frasePeriodo(k.dRecebido, periodo, "a mais recebido", "a menos recebido")}` : ""}.</>
    : <>Entrou {brl(k.recebido)}{frasePeriodo(k.dRecebido, periodo) ? ` · ${frasePeriodo(k.dRecebido, periodo)}` : ""}.</>;

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPainel icone={Wallet} area="Financeiro" titulo="Como está o dinheiro" resumo={resumo} periodo={periodo} onPeriodo={setPeriodo}
        acoes={vePagar && pode("editar_financeiro") && (
          <button type="button" onClick={() => navigate("/financeiro", { state: { aba: "pagar", nova: true } })}
            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-white px-4 text-sm font-bold text-modulo-texto shadow hover:bg-white/90">
            <Plus size={16} /> Conta a pagar
          </button>
        )} />
      <div className={`grid grid-cols-2 gap-3 lg:gap-4 ${cartoes.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {cartoes.map((c) => <CartaoPainel key={c.id} c={c} anterior={per.anterior} />)}
      </div>

      {vePagar && <ResumoPagarTipos r={aPagar.resumo} className="" onTipo={(t) => navigate("/financeiro", { state: { aba: "pagar", tipo: t || undefined } })}
        acoes={<span className="text-xs text-white/70">toque num tipo para ver as contas</span>} />}
      {/* cartões corporativos logo abaixo de "Quanto tem para pagar" (pedido de 19/10) */}
      <CartoesCorporativos className="" />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Section title={`${periodo === "ano" ? "Entradas e saídas mês a mês" : periodo === "hoje" ? "Entradas e saídas dos últimos 7 dias" : "Entradas e saídas dia a dia"}${usaExtrato ? " · extratos" : ""}`} className="xl:col-span-3">
          <Colunas dados={vePagar ? k.serie : k.serie.map((s) => ({ ...s, valores: [s.valores[0]] }))} altura={250} vazio="Nada entrou nem saiu no período."
            series={vePagar ? [{ nome: usaExtrato ? "Entrou" : "Recebido", cor: "var(--serie-3)" }, { nome: usaExtrato ? "Saiu" : "Pago", cor: "var(--serie-2)" }] : [{ nome: usaExtrato ? "Entrou" : "Recebido", cor: "var(--serie-3)" }]} />
        </Section>
        <Section title="Próximos 7 dias" className="xl:col-span-2">
          <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
            <div className="cartao-fit min-w-0 rounded-xl bg-emerald-50 p-2.5"><span className="block text-xs font-semibold text-emerald-800">Vai entrar</span><span className="num valor-fit block font-bold text-emerald-700 [--valor-max:1.125rem]">+ {brl(k.entra7)}</span></div>
            {vePagar && <div className="cartao-fit min-w-0 rounded-xl bg-orange-50 p-2.5"><span className="block text-xs font-semibold text-orange-800">Vai sair</span><span className="num valor-fit block font-bold text-orange-700 [--valor-max:1.125rem]">− {brl(k.sai7)}</span></div>}
          </div>
          <Colunas dados={vePagar ? k.proximos : k.proximos.map((s) => ({ ...s, valores: [s.valores[0]] }))} altura={190} vazio="Nada vence nos próximos 7 dias."
            series={vePagar ? [{ nome: "A receber", cor: "var(--serie-3)" }, { nome: "A pagar", cor: "var(--serie-2)" }] : [{ nome: "A receber", cor: "var(--serie-3)" }]} />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {vePagar && (
          <Section title="Para onde foi o dinheiro" actions={<span className="text-xs text-slate-500">toque para ver as contas</span>}>
            {k.categorias.length
              ? <Rosca total={usaExtrato ? "Saiu" : "Pago"} ativo={fCategoria} onClicar={(i) => { const c = k.categorias[i][0]; setFCategoria(fCategoria === c ? null : c); }}
                  fatias={k.categorias.map(([rotulo, valor], i) => ({ rotulo, valor, cor: CORES[i % CORES.length] }))} />
              : <p className="py-10 text-center text-sm text-slate-500">Nada pago no período.</p>}
          </Section>
        )}
        {vePagar && (
          <Section title={fCategoria ? `Maiores pagamentos · ${fCategoria}` : "Maiores pagamentos"}>
            {fCategoria && <div className="mb-3"><FiltrosAtivos filtros={[{ rotulo: "Categoria", valor: fCategoria, limpar: () => setFCategoria(null) }]} onLimpar={() => setFCategoria(null)} /></div>}
            <Ranking cor="var(--serie-2)" vazio="Nada pago no período."
              itens={k.maiores.map((x) => ({ rotulo: x.rotulo, valor: x.valor, detalhe: `${dataBR(x.data)} · ${x.categoria}${x.detalhe ? ` · ${x.detalhe}` : ""}` }))} />
          </Section>
        )}
        <Section title="Precisa de atenção" className={vePagar ? "md:col-span-2 xl:col-span-1" : ""}>
          <ListaAtencao itens={atencao} vazio="Nada pendente no financeiro" />
        </Section>
      </div>

      {k.porConta.length > 0 && (
        <Section title="Contas bancárias" actions={<button type="button" onClick={() => navigate("/conciliacao")} className="link-modulo text-sm">Abrir bancos</button>}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 pr-3">Conta</th><th className="py-1 pr-3 text-right">Entrou · {per.rotulo.toLowerCase()}</th>{vePagar && <th className="py-1 pr-3 text-right">Saiu</th>}<th className="py-1 text-right">Saldo</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {k.porConta.map((c) => (
                  <tr key={c.nome}>
                    <td className="py-1.5 pr-3 font-semibold text-fg">{c.nome}<span className="block text-xs font-normal text-slate-500">{c.n} {pl(c.n, "lançamento", "lançamentos")} no período</span></td>
                    <td className="num whitespace-nowrap py-1.5 pr-3 text-right text-emerald-700">{brl(c.entrou)}</td>
                    {vePagar && <td className="num whitespace-nowrap py-1.5 pr-3 text-right text-orange-700">{brl(c.saiu)}</td>}
                    <td className="num whitespace-nowrap py-1.5 text-right font-bold">{brl(c.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Section title="Quem está devendo" actions={<button type="button" onClick={() => navigate("/financeiro", { state: { aba: "cobranca" } })} className="link-modulo text-sm">Cobrar</button>}>
          <Ranking cor="var(--kpi-rosa)" vazio="Nenhum cliente com parcela vencida."
            onClicar={() => navigate("/financeiro", { state: { aba: "cobranca" } })}
            itens={k.devedores.map((d) => ({ rotulo: d.nome, valor: d.valor, detalhe: `${d.qtd} ${pl(d.qtd, "parcela", "parcelas")} · a mais antiga venceu há ${diasEntre(d.maisAntiga, dia)} ${pl(diasEntre(d.maisAntiga, dia), "dia", "dias")}` }))} />
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
