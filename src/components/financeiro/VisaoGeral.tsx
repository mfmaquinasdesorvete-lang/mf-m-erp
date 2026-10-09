// Financeiro → Visão geral (pensada também para o celular): contas de hoje, da semana ou do mês, com o que já
// entrou e saiu e o que falta; saldo de hoje, entradas e saídas previstas, saldo previsto e o gráfico realizado x previsto.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info, Landmark, XCircle } from "lucide-react";
import { Card, Tabs } from "@/components/ui";
import { SaldoPrevisto } from "@/components/Charts";
import { BaixaModal } from "./BaixaModal";
import { supabase } from "@/lib/supabase";
import { brl, dataBR, hoje } from "@/lib/format";
import { useUnidade } from "@/lib/unidade";
import { contasDoPeriodo, fluxoDoPeriodo, intervalo, situacao, somarDias, type ContaFin, type Periodo } from "@/lib/financeiro";
import { paraFluxo, type ContaDecisao } from "@/lib/programacao";

type Saldo = { conta_id: string; nome: string; unidade_id: string; saldo: number; data_base: string; origem: "extrato" | "cadastro" };
type Horizonte = "mes" | "30" | "90";

const CHIP: Record<string, string> = {
  pago: "border-emerald-300 bg-emerald-50 text-emerald-800", vence_hoje: "border-amber-300 bg-amber-50 text-amber-900",
  vencida: "border-red-300 bg-red-50 text-red-800", aberta: "border-slate-300 bg-slate-50 text-slate-700",
};
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const FORMA: Record<string, string> = { boleto: "Boleto", pix: "Pix", cartao: "Cartão", cartao_credito: "Cartão de crédito", cartao_debito: "Cartão de débito", dinheiro: "Dinheiro", transferencia: "Transferência", debito: "Débito" };

export function VisaoGeral({ receber, pagar, vePagar, veSaldo, podeBaixar }: {
  receber: ContaFin[]; pagar: ContaFin[]; vePagar: boolean; veSaldo: boolean; podeBaixar: boolean;
}) {
  const dia = hoje();
  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const [baixa, setBaixa] = useState<{ conta: ContaFin; tabela: "contas_receber" | "contas_pagar" } | null>(null);
  const iv = intervalo(periodo, dia);
  const rec = useMemo(() => contasDoPeriodo(receber, iv.de, iv.ate, dia), [receber, iv.de, iv.ate, dia]);
  const pag = useMemo(() => contasDoPeriodo(pagar, iv.de, iv.ate, dia), [pagar, iv.de, iv.ate, dia]);
  const saldoPeriodo = rec.total - (vePagar ? pag.total : 0);

  return (
    <div className="space-y-5">
      {baixa && <BaixaModal conta={baixa.conta} tabela={baixa.tabela} onClose={() => setBaixa(null)} />}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="font-bold text-fg">Contas {iv.rotulo}</h2>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm">
            {(["hoje", "semana", "mes"] as const).map((p) => (
              <button key={p} type="button" onClick={() => setPeriodo(p)}
                className={`rounded-md px-3 py-1 font-semibold ${periodo === p ? "bg-surface text-fg shadow-sm" : "text-slate-600"}`}>
                {p === "hoje" ? "Hoje" : p === "semana" ? "Semana" : "Mês"}
              </button>
            ))}
          </div>
        </div>
        <div className={`grid ${vePagar ? "md:grid-cols-2 md:divide-x" : ""} divide-slate-100`}>
          <Coluna titulo="A receber" r={rec} tipo="receber" dia={dia} onBaixa={podeBaixar ? (c) => setBaixa({ conta: c, tabela: "contas_receber" }) : undefined} />
          {vePagar && <Coluna titulo="A pagar" r={pag} tipo="pagar" dia={dia} onBaixa={podeBaixar ? (c) => setBaixa({ conta: c, tabela: "contas_pagar" }) : undefined} />}
        </div>
        {vePagar && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-sm">
            <span className="text-slate-600">Saldo previsto {iv.rotulo} (a receber − a pagar)</span>
            <span className={`num shrink-0 whitespace-nowrap text-base font-bold ${saldoPeriodo >= 0 ? "text-emerald-700" : "text-red-700"}`}>{saldoPeriodo >= 0 ? "+ " : "− "}{brl(Math.abs(saldoPeriodo))}</span>
          </div>
        )}
      </Card>
      {veSaldo && <Fluxo receber={receber} pagar={pagar} dia={dia} />}
    </div>
  );
}

function Coluna({ titulo, r, tipo, dia, onBaixa }: {
  titulo: string; r: ReturnType<typeof contasDoPeriodo>; tipo: "receber" | "pagar"; dia: string; onBaixa?: (c: ContaFin) => void;
}) {
  const [todas, setTodas] = useState(false);
  const cor = tipo === "receber" ? { texto: "text-emerald-700", barra: "bg-emerald-500" } : { texto: "text-red-700", barra: "bg-red-500" };
  const lista = todas ? r.itens : r.itens.slice(0, 6);
  const rotulo = { pago: tipo === "receber" ? "Recebido" : "Pago", vence_hoje: "Vence hoje", vencida: "Vencida", aberta: tipo === "receber" ? "A receber" : "A pagar" };
  return (
    <div className="p-4">
      <div className="text-sm text-slate-500">{titulo}</div>
      <div className={`num text-2xl font-bold ${cor.texto}`}>{brl(r.total)}</div>
      <div className="my-2 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(r.pct * 100)} aria-valuemin={0} aria-valuemax={100}
        aria-label={`${Math.round(r.pct * 100)}% ${tipo === "receber" ? "recebido" : "pago"}`}>
        <div className={`h-full rounded-full ${cor.barra}`} style={{ width: `${r.pct * 100}%` }} />
      </div>
      <div className="text-xs text-slate-500">{brl(r.realizado)} {tipo === "receber" ? "recebidos" : "pagos"} · {brl(r.aberto)} {tipo === "receber" ? "a receber" : "a pagar"}</div>
      {!r.itens.length ? <p className="mt-4 text-sm text-slate-500">Nada vence neste período.</p> : (
        <ul className="mt-3 divide-y divide-slate-100">
          {lista.map((c) => {
            const s = situacao(c, dia);
            const sub = s === "vencida" ? `Venceu ${dataBR(c.vencimento)}` : s === "vence_hoje" ? "Vence hoje" : s === "pago" && c.data_pagamento ? `${FORMA[c.forma_pagamento ?? ""] ?? (tipo === "receber" ? "Recebido" : "Pago")} · ${dm(c.data_pagamento)}`
              : `${FORMA[c.forma_pagamento ?? ""] ? FORMA[c.forma_pagamento!] + " · " : ""}vence ${dm(c.vencimento)}`;
            const clicavel = !!onBaixa && c.status === "aberto";
            const Tag = clicavel ? "button" : "div";
            return (
              <li key={c.id}>
                <Tag type={clicavel ? "button" : undefined} onClick={clicavel ? () => onBaixa!(c) : undefined}
                  title={clicavel ? `Registrar ${tipo === "receber" ? "recebimento" : "pagamento"}` : undefined}
                  className={`flex w-full items-start justify-between gap-3 py-2.5 text-left ${clicavel ? "hover:bg-slate-50" : ""}`}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-fg">{c.terceiro || c.descricao}</span>
                    <span className={`block text-xs ${s === "vencida" ? "font-semibold text-red-700" : s === "vence_hoje" ? "font-semibold text-amber-800" : "text-slate-500"}`}>{sub}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block font-semibold text-fg">{brl(c.status === "pago" ? c.valor_pago ?? c.valor : c.valor)}</span>
                    <span className={`mt-0.5 inline-block rounded border px-1.5 py-px text-[11px] font-semibold ${CHIP[s]}`}>{rotulo[s]}</span>
                  </span>
                </Tag>
              </li>
            );
          })}
        </ul>
      )}
      {r.itens.length > 6 && <button type="button" onClick={() => setTodas(!todas)} className="mt-1 text-sm font-semibold text-brand hover:underline">{todas ? "Mostrar menos" : `Ver todas (${r.itens.length})`}</button>}
      {r.vencidasAntes.qtd > 0 && (
        <p className="mt-2 text-xs font-semibold text-red-700">+ {r.vencidasAntes.qtd} conta(s) vencida(s) antes deste período: {brl(r.vencidasAntes.valor)}</p>
      )}
    </div>
  );
}

export function Fluxo({ receber, pagar, dia }: { receber: ContaFin[]; pagar: ContaFin[]; dia: string }) {
  const [hz, setHz] = useState<Horizonte>("mes");
  const { filtrar } = useUnidade();
  const de = hz === "mes" ? `${dia.slice(0, 7)}-01` : somarDias(dia, hz === "30" ? -14 : -30);
  const ate = hz === "mes" ? intervalo("mes", dia).ate : somarDias(dia, Number(hz));
  const { data: saldosTodos = [], isLoading } = useQuery({
    queryKey: ["saldos_bancarios"],
    queryFn: async () => { const { data, error } = await supabase.rpc("saldos_bancarios"); if (error) throw error; return (data ?? []) as Saldo[]; },
  });
  const saldos = filtrar(saldosTodos);
  const ids = new Set(saldos.map((s) => s.conta_id));
  const { data: movTodos = [] } = useQuery({
    queryKey: ["movimentos_realizados", de, dia],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("movimentos_realizados", { p_de: de, p_ate: dia });
      if (error) throw error;
      return (data ?? []) as { conta_bancaria_id: string; dia: string; entradas: number; saidas: number }[];
    },
  });
  // a pagar entra na data escolhida (agendada/aprovada); as marcadas "não pagar" ficam fora da previsão
  const pagarFluxo = useMemo(() => paraFluxo(pagar as (ContaFin & ContaDecisao)[]), [pagar]);
  const segurado = useMemo(() => (pagar as (ContaFin & ContaDecisao)[]).filter((c) => c.status === "aberto" && c.decisao === "nao_pagar"), [pagar]);
  const f = useMemo(() => fluxoDoPeriodo({
    saldoHoje: saldos.reduce((s, x) => s + Number(x.saldo), 0),
    movimentos: movTodos.filter((m) => ids.has(m.conta_bancaria_id)), receber, pagar: pagarFluxo, hoje: dia, de, ate,
  }), [saldos, movTodos, receber, pagarFluxo, dia, de, ate]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-fg">Saldo e fluxo de caixa</h2>
        <Tabs value={hz} onChange={setHz} options={[{ value: "mes", label: "Este mês" }, { value: "30", label: "Próximos 30 dias" }, { value: "90", label: "Próximos 90 dias" }]} />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Saldo hoje" valor={brl(f.saldoHoje)} tom={f.saldoHoje < 0 ? "ruim" : undefined} />
        <Kpi rotulo="Entradas previstas" valor={`+ ${brl(f.entradasPrevistas)}`} tom="bom" />
        <Kpi rotulo="Saídas previstas" valor={`− ${brl(f.saidasPrevistas)}`} tom="ruim" />
        <Kpi rotulo={`Saldo previsto em ${dm(ate)}`} valor={brl(f.saldoFim)} tom={f.saldoFim < 0 ? "ruim" : "bom"} />
      </div>
      {!isLoading && !saldos.length && (
        <p className="mb-3 flex gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-900"><Info size={16} className="mt-0.5 shrink-0" />
          Cadastre as contas bancárias com o saldo inicial em <b>Bancos e conciliação</b> para o saldo de hoje sair certo. Por enquanto o gráfico parte de zero.</p>
      )}
      <SaldoPrevisto dados={f.dias} hoje={dia} />
      <ul className="mt-3 space-y-1.5 text-sm">
        {f.primeiroNegativo && (
          <li className="flex gap-2 text-red-800"><XCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>O saldo previsto fica negativo em <b>{dataBR(f.primeiroNegativo.dia)}</b> ({brl(f.primeiroNegativo.saldo)}): antecipe recebimentos ou negocie pagamentos.</span></li>
        )}
        {f.maiorSaida && (
          <li className="flex gap-2 text-slate-700"><Info size={16} className="mt-0.5 shrink-0 text-sky-600" aria-hidden />
            <span>Maior saída prevista: {f.maiorSaida.descricao} · dia {dm(f.maiorSaida.dia)} · <b>− {brl(f.maiorSaida.valor)}</b></span></li>
        )}
        {(f.vencidosReceber > 0 || f.vencidosPagar > 0) && (
          <li className="flex gap-2 text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>Fora da previsão (vencidas e ainda em aberto): {[f.vencidosReceber > 0 && `${brl(f.vencidosReceber)} a receber`, f.vencidosPagar > 0 && `${brl(f.vencidosPagar)} a pagar`].filter(Boolean).join(" e ")}.</span></li>
        )}
        {segurado.length > 0 && (
          <li className="flex gap-2 text-slate-700"><Info size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />
            <span>{segurado.length} conta(s) marcada(s) para não pagar ({brl(segurado.reduce((s, c) => s + Number(c.valor), 0))}) ficam fora da previsão.</span></li>
        )}
      </ul>
      {saldos.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Landmark size={16} /> Saldo por conta</h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {saldos.map((s) => (
              <li key={s.conta_id} className="rounded-lg border border-slate-200 p-2.5 text-sm">
                <div className="flex justify-between gap-2"><span className="font-medium">{s.nome}</span><span className={`num font-semibold ${s.saldo < 0 ? "text-red-700" : "text-fg"}`}>{brl(s.saldo)}</span></div>
                <div className="text-xs text-slate-500">{s.origem === "extrato" ? `saldo do extrato de ${dataBR(s.data_base)}` : `saldo inicial de ${dataBR(s.data_base)}`} + lançamentos depois</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Kpi({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: "bom" | "ruim" }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="text-xs font-semibold uppercase text-slate-500">{rotulo}</div>
      <div className={`num mt-0.5 whitespace-nowrap text-base font-bold sm:text-lg ${tom === "bom" ? "text-emerald-700" : tom === "ruim" ? "text-red-700" : "text-fg"}`}>{valor}</div>
    </div>
  );
}
