// Analista fiscal: o "escritório fiscal" dentro do ERP. Confere notas, compras, contas e cadastro dos últimos
// 12 meses, aponta o que está errado (com o que fazer e quem faz), mostra a apuração estimada do mês e as
// estratégias legais para pagar menos imposto, e compara Lucro Real x Presumido. Regras em lib/analistaFiscal.ts.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, BadgeCheck, CheckCircle2, ClipboardCopy, FileDown, Lightbulb, Receipt, Scale, ShieldAlert, XCircle,
} from "lucide-react";
import { Button, CampoMes, Card, Indicador, PageHeader, Tabs } from "@/components/ui";
import { useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { useUnidade } from "@/lib/unidade";
import { brl, hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { baixarPlanilha } from "@/lib/exportar";
import { dre, type LancDre } from "@/lib/dre";
import { useCategorias } from "@/components/financeiro/CategoriaRateio";
import {
  analisar, apuracao, creditosEntradas, despesasComCredito, impostosDasNotas, mesesAte, saidaDeVenda, totaisXml,
  type Achado, type ContaPagarF, type Estrategia, type NotaEntrada, type NotaSaida, type PedidoF, type ProdutoF, type TotaisXml,
} from "@/lib/analistaFiscal";
import { useAbaUrl } from "@/lib/abaUrl";
import { DeducoesFiscais } from "@/components/fiscal/DeducoesFiscais";

type Aba = "auditoria" | "deducoes" | "economia" | "apuracao" | "regime" | "rotina";
type ContaReceberF = { categoria?: string | null; valor: number; valor_pago?: number | null; status: string; vencimento: string; data_pagamento?: string | null; competencia?: string | null; unidade_id?: string | null };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMes = (am: string) => `${MESES[Number(am.slice(5)) - 1]} de ${am.slice(0, 4)}`;
const proximoMes = (am: string) => { const [a, m] = am.split("-").map(Number); return new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 7); };

export default function AnalistaFiscal() {
  const navigate = useNavigate();
  const { unidades, atual, filtrar } = useUnidade();
  const [aba, setAba] = useAbaUrl<Aba>("auditoria", ["auditoria", "deducoes", "economia", "apuracao", "regime", "rotina"] as const);
  const [mes, setMes] = useState(hoje().slice(0, 7));
  const meses = useMemo(() => mesesAte(mes, 12), [mes]);

  const { data: notasT = [], isLoading: l1 } = useRows<NotaSaida>("notas_fiscais", { select: "id, unidade_id, status, ambiente, valor_total, created_at, transferencia_id, finalidade, tipo_operacao, excluida_em, pedido_id, payload" });
  const { data: entradasT = [], isLoading: l2 } = useRows<NotaEntrada>("nfe_recebidas", { select: "id, unidade_id, valor_total, data_emissao, emitente_nome, manifestacao, situacao, excluida_em, origem, processamento, itens" });
  const { data: pagarT = [] } = useRows<ContaPagarF>("contas_pagar", { select: "id, descricao, categoria, valor, valor_pago, status, vencimento, competencia, unidade_id" });
  const { data: receberT = [] } = useRows<ContaReceberF>("contas_receber", { select: "categoria, valor, valor_pago, status, vencimento, data_pagamento, competencia, unidade_id" });
  const { data: produtos = [] } = useRows<ProdutoF>("produtos", { select: "id, descricao, tipo, ncm, ipi_aliquota, ativo, vendavel, kit" });
  const { data: pedidosT = [] } = useRows<PedidoF>("pedidos", { select: "id, numero, status, created_at, valor_total, unidade_id" });
  const { data: categorias = [] } = useCategorias();
  const notas = filtrar(notasT), entradas = filtrar(entradasT), pagar = filtrar(pagarT), receber = filtrar(receberT), pedidos = filtrar(pedidosT);
  const unids = atual ? unidades.filter((u) => u.id === atual) : unidades;

  // XML das compras do mês em foco: o ICMS e o IPI destacados vêm de lá
  const { data: xmls = new Map<string, TotaisXml | null>() } = useQuery({
    queryKey: ["analista_xml", mes],
    queryFn: async () => {
      const { data, error } = await supabase.from("nfe_recebidas").select("id, xml").gte("data_emissao", `${mes}-01`).lt("data_emissao", `${proximoMes(mes)}-01`);
      if (error) throw error;
      return new Map((data ?? []).map((r: { id: string; xml: string | null }) => [r.id, totaisXml(r.xml)]));
    },
  });

  const lucroMeses = useMemo(() => {
    const lancs: LancDre[] = [...receber.map((c) => ({ ...c, tipo: "receber" as const })), ...pagar.map((c) => ({ ...c, tipo: "pagar" as const }))];
    return dre(lancs, categorias as any, meses, "competencia", null).linhas.find((l) => l.chave === "liquido")?.valores ?? meses.map(() => 0);
  }, [receber, pagar, categorias, meses]);

  const a = useMemo(() => analisar({
    hoje: hoje(), meses, mesFoco: mes, unidades: unids as any, produtos, saidas: notas, entradas, contas: pagar,
    categorias, pedidos, lucroMeses, xmlsMes: xmls,
  }), [meses, mes, unids, produtos, notas, entradas, pagar, categorias, pedidos, lucroMeses, xmls]);

  const doMes = useMemo(() => {
    const s = impostosDasNotas(notas.filter((n) => saidaDeVenda(n) && n.created_at.startsWith(mes)));
    const c = creditosEntradas(entradas.filter((n) => (n.data_emissao ?? "").startsWith(mes)), xmls);
    const d = despesasComCredito(pagar, [mes]);
    // IRPJ/CSLL só com o financeiro completo (o lucro do mês vem das contas lançadas)
    return { s, c, d, ap: apuracao(s, c, d, a.dadosFinanceiros ? lucroMeses[lucroMeses.length - 1] ?? null : null), semIr: !a.dadosFinanceiros };
  }, [notas, entradas, pagar, xmls, mes, lucroMeses, a.dadosFinanceiros]);

  const carregando = l1 || l2;
  const nomeUnid = atual ? unidades.find((u) => u.id === atual)?.nome : "SC e SP";
  const contasPagar12 = pagar.filter((c) => meses.includes((c.competencia ?? c.vencimento).slice(0, 7))).length;

  function textoResumo() {
    const linhas = [
      `*Analista fiscal · MF Máquinas (${nomeUnid}) · 12 meses até ${nomeMes(mes)}*`,
      `${a.resumo.problemas} ${pl(a.resumo.problemas, "problema", "problemas")}, ${a.resumo.alertas} ${pl(a.resumo.alertas, "alerta", "alertas")}, ${a.resumo.oportunidades} ${pl(a.resumo.oportunidades, "oportunidade", "oportunidades")}.`,
      "", "*Para corrigir:*",
      ...a.achados.filter((x) => x.nivel !== "ok").map((x) => `• ${x.titulo}${x.acao ? ` → ${x.acao}` : ""}`),
      "", "*Para conversar com o contador (economia):*",
      ...a.estrategias.filter((e) => e.situacao !== "ja_aplica").map((e) => `• ${e.titulo}${e.economia ? ` (≈ ${brl(e.economia)}/ano)` : ""} · ${e.base}`),
      "", `Imposto estimado de ${nomeMes(mes)}: ${brl(doMes.ap.total)}.`,
    ];
    return linhas.join("\n");
  }

  function exportar() {
    baixarPlanilha(`analista-fiscal-${mes}`, [
      { nome: "Auditoria", linhas: a.achados.map((x) => ({ Situação: x.nivel, Item: x.titulo, Detalhe: x.detalhe, "O que fazer": x.acao ?? "", Quem: x.quem ?? "", "Valor (R$)": x.valor ?? "" })) },
      { nome: "Economia", linhas: a.estrategias.map((e) => ({ Estratégia: e.titulo, Situação: rotuloSituacao[e.situacao], "Economia estimada/ano (R$)": e.economia ?? "", Observação: e.economiaTexto ?? "", "Por quê": e.porque, "Como fazer": e.como.join(" | "), Quem: e.quem, "Base legal": e.base, Atenção: e.atencao ?? "" })) },
      { nome: `Apuração ${mes}`, linhas: doMes.ap.linhas.map((l) => ({ Imposto: l.imposto, "Débito (vendas)": l.debito, "Crédito (compras e despesas)": l.credito, "A pagar estimado": Math.max(0, l.saldo), "Saldo credor": l.saldo < 0 ? -l.saldo : 0, Observação: l.nota ?? "" })) },
      { nome: "Regime", linhas: [
        { Regime: "Lucro Real", IRPJ: a.regimes.real.irpj, CSLL: a.regimes.real.csll, "PIS/COFINS": a.regimes.real.pisCofins, Total: a.regimes.real.total },
        { Regime: "Lucro Presumido", IRPJ: a.regimes.presumido.irpj, CSLL: a.regimes.presumido.csll, "PIS/COFINS": a.regimes.presumido.pisCofins, Total: a.regimes.presumido.total },
      ] },
    ]).catch(notifyError);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Analista fiscal" subtitle="Seu escritório fiscal dentro do ERP: confere tudo, simplifica a rotina e mostra onde dá para pagar menos imposto, dentro da lei." />

      {/* o "funcionário" */}
      <Card className="relative overflow-hidden p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-modulo to-modulo-escuro text-white shadow-card" aria-hidden><Scale size={24} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-fg">Olá! Sou o analista fiscal da MF.</p>
            <p className="mt-0.5 text-sm text-slate-600">
              {carregando ? "Conferindo as notas e as contas…" : <>
                Conferi <b>{a.vendas.length}</b> {pl(a.vendas.length, "nota", "notas")} de venda, <b>{a.c12.notas}</b> {pl(a.c12.notas, "compra", "compras")} com nota e <b>{contasPagar12}</b> {pl(contasPagar12, "conta", "contas")} a pagar
                dos últimos 12 meses ({nomeUnid}). Achei <b>{a.resumo.problemas}</b> {pl(a.resumo.problemas, "problema", "problemas")}, <b>{a.resumo.alertas}</b> {pl(a.resumo.alertas, "alerta", "alertas")} e <b>{a.resumo.oportunidades}</b> {pl(a.resumo.oportunidades, "oportunidade", "oportunidades")} de economia.
              </>}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-sm text-slate-600">Até
            <CampoMes value={mes} max={new Date().toISOString().slice(0, 7)} onChange={(v) => v && setMes(v)} rotulo="Mês final da análise" />
          </div>
          <Button variant="secondary" onClick={() => navigator.clipboard.writeText(textoResumo()).then(() => notify("Resumo copiado: cole no WhatsApp ou no e-mail do contador"))}>
            <ClipboardCopy size={16} aria-hidden /> Copiar para o contador
          </Button>
          <Button variant="secondary" onClick={exportar}><FileDown size={16} aria-hidden /> Baixar relatório</Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Indicador rotulo="Problemas" icon={XCircle} cor={a.resumo.problemas ? "vermelho" : "verde"} valor={String(a.resumo.problemas)} sub="corrigir logo" />
        <Indicador rotulo="Alertas" icon={AlertTriangle} cor={a.resumo.alertas ? "ambar" : "verde"} valor={String(a.resumo.alertas)} sub="conferir" />
        <Indicador rotulo="Economia possível" icon={Lightbulb} cor="verde" valor={a.resumo.economia ? brl(a.resumo.economia) : `${a.resumo.oportunidades} ideias`} sub={a.resumo.economia ? "por ano, estimada (confirmar com o contador)" : "para avaliar com o contador"} />
        <Indicador rotulo={`Imposto de ${MESES[Number(mes.slice(5)) - 1]}`} icon={Receipt} cor="azul" valor={brl(doMes.ap.total)} sub="estimativa da apuração" />
      </div>

      <Tabs value={aba} onChange={setAba} options={[
        { value: "auditoria", label: "Conferência fiscal" }, { value: "deducoes", label: "Deduções (modo avançado)" }, { value: "economia", label: "Pagar menos imposto" }, { value: "apuracao", label: "Apuração do mês" },
        { value: "regime", label: "Real x Presumido" }, { value: "rotina", label: "Rotina simples" },
      ]} />

      {aba === "auditoria" && <Auditoria achados={a.achados} abrir={navigate} />}
      {aba === "deducoes" && <DeducoesFiscais />}
      {aba === "economia" && <Economia estrategias={a.estrategias} />}
      {aba === "apuracao" && <Apuracao mes={mes} m={doMes} />}
      {aba === "regime" && <Regime a={a} />}
      {aba === "rotina" && <Rotina abrir={navigate} />}

      <p className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />
        <span>Sou um assistente automático: os valores são estimativas a partir do que está no ERP, para orientar a conversa com o contador (a apuração oficial, o SPED e o LALUR são dele).
          Só sugiro caminhos previstos em lei, com a base legal de cada um.</span>
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- abas --------------------------------------------------------------- */

const ICONE_NIVEL = {
  problema: { Icon: XCircle, cor: "text-red-600", caixa: "border-l-red-500", rotulo: "Problema" },
  alerta: { Icon: AlertTriangle, cor: "text-amber-600", caixa: "border-l-amber-500", rotulo: "Alerta" },
  ok: { Icon: CheckCircle2, cor: "text-emerald-600", caixa: "border-l-emerald-500", rotulo: "Certo" },
};

function Auditoria({ achados, abrir }: { achados: Achado[]; abrir: (to: string, opcoes?: { state?: unknown }) => void }) {
  const ordem = { problema: 0, alerta: 1, ok: 2 };
  const lista = [...achados].sort((x, y) => ordem[x.nivel] - ordem[y.nivel]);
  const pend = lista.filter((x) => x.nivel !== "ok"), oks = lista.filter((x) => x.nivel === "ok");
  return (
    <div className="space-y-3">
      {!pend.length && <Card className="p-6 text-center text-sm text-slate-600"><BadgeCheck className="mx-auto mb-2 text-emerald-600" aria-hidden /> Nada de errado nos últimos 12 meses.</Card>}
      <ul className="space-y-3">
        {pend.map((x) => {
          const n = ICONE_NIVEL[x.nivel];
          return (
            <li key={x.id} className={`rounded-2xl border border-l-4 border-slate-200 bg-surface p-4 shadow-card ${n.caixa}`}>
              <div className="flex items-start gap-3">
                <n.Icon size={20} className={`mt-0.5 shrink-0 ${n.cor}`} aria-label={n.rotulo} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-fg">{x.titulo}</p>
                  <p className="mt-0.5 text-sm text-slate-600">{x.detalhe}</p>
                  {x.acao && (
                    <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm">
                      <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">O que fazer{x.quem ? ` · ${x.quem}` : ""}</span>
                      <span className="text-slate-700">{x.acao}</span>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {x.valor ? <span className="num rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{brl(x.valor)}</span> : null}
                    {x.link && <Button variant="secondary" onClick={() => abrir(x.link!, x.estado ? { state: x.estado } : undefined)}>Abrir <ArrowRight size={15} aria-hidden /></Button>}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {oks.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-bold text-fg">Está certo</p>
          <ul className="space-y-1.5">
            {oks.map((x) => <li key={x.id} className="flex gap-2 text-sm"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden /><span><b>{x.titulo}.</b> <span className="text-slate-600">{x.detalhe}</span></span></li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}

const rotuloSituacao: Record<Estrategia["situacao"], string> = { aplicar: "Aplicar", avaliar: "Avaliar com o contador", ja_aplica: "Já aplica" };
const corSituacao: Record<Estrategia["situacao"], string> = {
  aplicar: "bg-emerald-100 text-emerald-800", avaliar: "bg-sky-100 text-sky-800", ja_aplica: "bg-slate-100 text-slate-600",
};

function Economia({ estrategias }: { estrategias: Estrategia[] }) {
  const ordem = { aplicar: 0, avaliar: 1, ja_aplica: 2 };
  const lista = [...estrategias].sort((x, y) => ordem[x.situacao] - ordem[y.situacao] || (y.economia ?? 0) - (x.economia ?? 0));
  return (
    <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {lista.map((e) => (
        <li key={e.id} className={`rounded-2xl border border-l-4 border-slate-200 bg-surface p-4 shadow-card ${e.situacao === "ja_aplica" ? "border-l-slate-300" : "border-l-emerald-500"}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="min-w-0 flex-1 font-bold text-fg">{e.titulo}</p>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${corSituacao[e.situacao]}`}>{rotuloSituacao[e.situacao]}</span>
          </div>
          {(e.economia || e.economiaTexto) && (
            <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-2">
              {e.economia ? <span className="num block text-lg font-bold text-emerald-700">≈ {brl(e.economia)}<span className="text-sm font-semibold">/ano</span></span> : null}
              {e.economiaTexto && <span className="block text-xs text-slate-600">{e.economiaTexto}</span>}
            </div>
          )}
          <p className="mt-2 text-sm text-slate-600">{e.porque}</p>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-slate-700">{e.como.map((c) => <li key={c}>{c}</li>)}</ol>
          {e.atencao && <p className="mt-2 text-xs font-semibold text-amber-700">Atenção: {e.atencao}</p>}
          <p className="mt-2 text-xs text-slate-500">Quem faz: <b>{e.quem}</b> · Base: {e.base}</p>
        </li>
      ))}
    </ul>
  );
}

function Apuracao({ mes, m }: { mes: string; m: { s: ReturnType<typeof impostosDasNotas>; c: ReturnType<typeof creditosEntradas>; d: ReturnType<typeof despesasComCredito>; ap: ReturnType<typeof apuracao>; semIr: boolean } }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        <b className="first-letter:uppercase">{nomeMes(mes)}</b>{mes === hoje().slice(0, 7) && " (mês em andamento: os números ainda vão mudar)"}: {m.s.notas} {pl(m.s.notas, "nota", "notas")} de venda ({brl(m.s.receita)}), {m.c.notas} {pl(m.c.notas, "compra", "compras")} com nota
        {m.c.semXml ? <>, <b className="text-amber-700">{m.c.semXml} sem o XML completo</b> (ICMS/IPI delas fora dos créditos)</> : null}.
      </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {m.ap.linhas.map((l) => (
          <li key={l.imposto} className="rounded-2xl border border-slate-200 bg-surface p-3.5 shadow-card">
            <p className="font-bold text-fg">{l.imposto}</p>
            <dl className="num mt-1 space-y-0.5 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-slate-600">Débito (vendas)</dt><dd className="whitespace-nowrap">{brl(l.debito)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-600">(−) Crédito</dt><dd className="whitespace-nowrap text-emerald-700">{brl(l.credito)}</dd></div>
              <div className="flex justify-between gap-2 border-t border-slate-200 pt-1 font-bold">
                <dt>{l.saldo < 0 ? "Saldo credor" : "A pagar"}</dt>
                <dd className={`whitespace-nowrap ${l.saldo < 0 ? "text-emerald-700" : "text-fg"}`}>{brl(Math.abs(l.saldo))}</dd>
              </div>
            </dl>
            {l.nota && <p className="mt-1 text-[11px] text-slate-500">{l.nota}</p>}
          </li>
        ))}
      </ul>
      <Card className="p-4">
        <p className="mb-1 flex items-baseline justify-between gap-2 font-bold text-fg"><span>Total estimado do mês</span><span className="num">{brl(m.ap.total)}</span></p>
        <p className="text-xs text-slate-500">Saldo credor fica para o mês seguinte. {m.semIr
          ? "IRPJ/CSLL fora da conta: o financeiro do ERP ainda não tem 10 dos últimos 12 meses lançados (o lucro sairia errado)."
          : "IRPJ/CSLL pelo lucro do DRE (estimativa por balancete)."}</p>
        {(m.s.ibs || m.s.cbs) ? <p className="mt-2 text-xs text-slate-600">IBS/CBS de teste destacados: {brl(m.s.ibs + m.s.cbs)}. Em 2026 eles são compensados com o PIS/COFINS (não aumentam o custo).</p> : null}
      </Card>
      {m.d.linhas.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-bold text-fg">Despesas do mês que dão crédito de PIS/COFINS</p>
          <ul className="space-y-1 text-sm">
            {m.d.linhas.map((l) => <li key={l.chave} className="flex justify-between gap-2"><span className="min-w-0 text-slate-600">{l.rotulo} <span className="text-xs text-slate-400">({l.base})</span></span><span className="num whitespace-nowrap">{brl(l.valor)}</span></li>)}
            <li className="flex justify-between gap-2 border-t border-slate-200 pt-1 font-semibold"><span>Crédito (9,25%)</span><span className="num text-emerald-700">{brl(m.d.credito)}</span></li>
          </ul>
        </Card>
      )}
    </div>
  );
}

function Regime({ a }: { a: ReturnType<typeof analisar> }) {
  const r = a.regimes;
  const col = (nome: string, v: typeof r.real, melhor: boolean) => (
    <div className={`rounded-2xl border p-4 shadow-card ${melhor ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-surface"}`}>
      <p className="flex items-center justify-between gap-2 font-bold text-fg">{nome}{melhor && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] text-white">mais barato</span>}</p>
      <dl className="num mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-2"><dt className="text-slate-600">IRPJ</dt><dd>{brl(v.irpj)}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-slate-600">CSLL</dt><dd>{brl(v.csll)}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-slate-600">PIS/COFINS</dt><dd>{brl(v.pisCofins)}</dd></div>
        <div className="flex justify-between gap-2 border-t border-slate-200 pt-1 text-base font-bold"><dt>Total no ano</dt><dd>{brl(v.total)}</dd></div>
      </dl>
    </div>
  );
  if (!a.dadosFinanceiros) return (
    <Card className="space-y-2 border-l-4 border-l-amber-500 p-4 text-sm text-slate-600">
      <p className="font-bold text-fg">Ainda não dá para comparar com segurança</p>
      <p>O lucro do ano vem do financeiro do ERP (contas a pagar e a receber), que tem contas lançadas em só <b>{a.mesesComContas} dos últimos 12 meses</b>.
        Com isso o lucro sairia errado e a comparação poderia indicar o regime errado.</p>
      <p>Quando o financeiro tiver 10 meses ou mais, a conta aparece aqui sozinha. Até lá, peça ao contador a comparação pelo balancete (a opção é feita em janeiro).</p>
      <p className="text-xs text-slate-500">Receita de venda dos últimos 12 meses pelas NF-e: {brl(a.s12.receita)} (sem transferências e remessas).</p>
    </Card>
  );
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Com os últimos 12 meses do ERP: receita de <b>{brl(a.s12.receita)}</b>, lucro (DRE) de <b className={a.lucro12 < 0 ? "text-red-700" : ""}>{brl(a.lucro12)}</b> e
        créditos de PIS/COFINS estimados de <b>{brl(a.c12.pis + a.c12.cofins + a.d12.credito)}</b>. ICMS e IPI são iguais nos dois regimes e ficam de fora.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {col("Lucro Real (hoje)", r.real, r.melhor === "real")}
        {col("Lucro Presumido", r.presumido, r.melhor === "presumido")}
      </div>
      <Card className="space-y-1.5 p-4 text-sm text-slate-600">
        <p><b className="text-fg">{r.melhor === "real" ? `O Lucro Real sai ${brl(r.diferenca)} mais barato.` : `O Presumido sairia ${brl(r.diferenca)} mais barato.`}</b> A escolha vale o ano todo e é feita no primeiro pagamento de janeiro.</p>
        <p>No Real o imposto de renda segue o lucro (prejuízo não paga) e o PIS/COFINS tem créditos; no Presumido o IR é sobre 8% (IRPJ) e 12% (CSLL) do faturamento (10% a mais na parte acima de R$ 5 milhões no ano, pela LC 224/2025), e o PIS/COFINS é de 3,65% sem crédito.</p>
        <p>A partir de 2027 o PIS/COFINS vira CBS com crédito para todos: aí a diferença entre os regimes passa a ser só o IRPJ/CSLL.</p>
        <p className="text-xs text-slate-500">Estimativa com o lucro do DRE gerencial; o contador refaz com o lucro contábil e as adições e exclusões do LALUR. Assistência técnica (serviço) tem presunção de 32% no Presumido e não está separada aqui.</p>
      </Card>
    </div>
  );
}

const ROTINA: { titulo: string; texto: string; link: string; botao: string }[] = [
  { titulo: "Confirmar as compras na SEFAZ toda semana", texto: "Com a confirmação o XML completo chega sozinho e o crédito de ICMS/IPI entra na apuração.", link: "/notas?aba=recebidas", botao: "Notas recebidas" },
  { titulo: "Categoria certa em toda conta a pagar", texto: "Energia, aluguel, frete e manutenção dão crédito de PIS/COFINS. Impostos e folha ficam separados.", link: "/financeiro?aba=pagar", botao: "Contas a pagar" },
  { titulo: "Regras de tributação em vez de ajustar nota a nota", texto: "Cada operação (venda, revenda, outro estado, consumidor final) com a sua regra: o ERP calcula sozinho.", link: "/notas?aba=regras", botao: "Regras" },
  { titulo: "Conferência fiscal antes de emitir", texto: "O Compliance fiscal mostra NCM, IE e endereço errados antes de a nota ser rejeitada.", link: "/notas?aba=compliance", botao: "Compliance" },
  { titulo: "Fechamento do mês automático para o contador", texto: "O pacote com XML e planilhas vai sozinho; a conversa fica registrada no Painel do contador.", link: "/contador", botao: "Painel do contador" },
  { titulo: "Uma conversa por trimestre com este relatório", texto: "Baixe o relatório desta tela e revise com o contador as oportunidades marcadas \"Avaliar\".", link: "/analista-fiscal", botao: "Baixar relatório acima" },
];

function Rotina({ abrir }: { abrir: (to: string) => void }) {
  return (
    <ol className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {ROTINA.map((r, k) => (
        <li key={r.titulo} className="flex gap-3 rounded-2xl border border-slate-200 bg-surface p-4 shadow-card">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-modulo/15 text-sm font-bold text-modulo-texto">{k + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-fg">{r.titulo}</p>
            <p className="mt-0.5 text-sm text-slate-600">{r.texto}</p>
            {r.link !== "/analista-fiscal" && <Button variant="ghost" className="mt-1 !px-0 text-brand" onClick={() => abrir(r.link)}>{r.botao} <ArrowRight size={15} aria-hidden /></Button>}
          </div>
        </li>
      ))}
    </ol>
  );
}
