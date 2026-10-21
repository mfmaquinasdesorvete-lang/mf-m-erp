// Financeiro → Visão geral → Torre de controle do caixa: prazo médio de recebimento (PMR) e de pagamento (PMP),
// inadimplência e o raio-X do que passou pelo banco nos últimos 90 dias sem conta no ERP (o furo do previsto).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, ChevronDown, Landmark, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui";
import { ler } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { brl, hoje } from "@/lib/format";
import { furoDoCaixa, inadimplencia, pontualidade, prazoMedio } from "@/lib/caixa";

const antes = (d: number) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);

export function TorreCaixa() {
  const [aberto, setAberto] = useState(false);
  const desde12 = antes(365), desde90 = antes(90);
  const { data } = useQuery({
    queryKey: ["contas_receber", "contas_pagar", "extrato_lancamentos", "torre-caixa", desde12],
    queryFn: async () => {
      const [rec, pag, ext] = await Promise.all([
        ler(supabase.from("contas_receber").select("valor, valor_pago, vencimento, status, data_pagamento, pedido:pedidos(created_at)").gte("vencimento", desde12)),
        ler(supabase.from("contas_pagar").select("valor, valor_pago, vencimento, status, data_pagamento, emissao, nfe:nfe_recebidas!contas_pagar_nfe_fk(data_emissao)").gte("vencimento", desde12)),
        ler(supabase.from("extrato_lancamentos").select("valor, descricao, status").gte("data", desde90)
          .is("conta_pagar_id", null).is("conta_receber_id", null).is("par_transferencia_id", null)),
      ]);
      return { rec: (rec ?? []) as any[], pag: (pag ?? []) as any[], ext: (ext ?? []) as any[] };
    },
  });

  const r = useMemo(() => {
    if (!data) return null;
    const pagas = (l: any[]) => l.filter((c) => c.status === "pago" && c.data_pagamento);
    return {
      pmr: prazoMedio(pagas(data.rec).map((c) => ({ inicio: c.pedido?.created_at, fim: c.data_pagamento, valor: Number(c.valor_pago ?? c.valor) }))),
      pmp: prazoMedio(pagas(data.pag).map((c) => ({ inicio: c.emissao ?? c.nfe?.data_emissao, fim: c.data_pagamento, valor: Number(c.valor_pago ?? c.valor) }))),
      emDia: pontualidade(data.pag),
      inad: inadimplencia(data.rec.map((c) => ({ valor: Number(c.valor), vencimento: c.vencimento, status: c.status })), hoje(), desde12),
      furo: furoDoCaixa(data.ext.map((l) => ({ valor: Number(l.valor), descricao: l.descricao, status: l.status }))),
    };
  }, [data, desde12]);
  if (!r) return null;

  // com poucas contas ligadas à nota o prazo médio engana: só mostra a partir de 10
  const pmpOk = r.pmp.dias != null && r.pmp.contas >= 10;
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="flex items-center gap-1.5 font-bold text-fg"><Landmark size={18} className="text-brand" /> Torre de controle do caixa</h2>
        <p className="text-xs text-slate-500">Últimos 12 meses. Prazos contados da venda (ou da nota do fornecedor) até o dinheiro entrar ou sair.</p>
      </div>
      <div className="grid grid-cols-2 gap-px bg-slate-100 lg:grid-cols-4">
        <Numero titulo="Prazo médio de recebimento" valor={r.pmr.dias == null ? "—" : `${r.pmr.dias} dias`} cor="text-emerald-700" detalhe={`${r.pmr.contas} recebimentos com a venda ligada`} />
        <Numero titulo="Prazo médio de pagamento" valor={pmpOk ? `${r.pmp.dias} dias` : "—"} cor="text-sky-700"
          detalhe={pmpOk ? `${r.pmp.contas} pagamentos com a nota ligada` : `${r.pmp.contas === 0 ? "nenhuma conta tem" : `só ${r.pmp.contas} ${r.pmp.contas === 1 ? "conta tem" : "contas têm"}`} a nota do fornecedor ligada; ao lançar pela nota, passa a medir`} />
        <Numero titulo="Contas pagas em dia" valor={r.emDia.pct == null ? "—" : `${r.emDia.pct}%`} cor={r.emDia.pct != null && r.emDia.pct < 90 ? "text-amber-700" : "text-emerald-700"}
          detalhe={`${r.emDia.emDia} de ${r.emDia.pagas} pagas até o vencimento`} />
        <Numero titulo="Inadimplência" valor={r.inad.pct == null ? "—" : `${r.inad.pct.toLocaleString("pt-BR")}%`} cor={r.inad.pct != null && r.inad.pct > 5 ? "text-red-700" : "text-emerald-700"}
          detalhe={`${brl(r.inad.atraso)} vencidos sem receber`} />
      </div>

      <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto}
        className="flex w-full items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-left hover:bg-slate-50">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <TriangleAlert size={16} className="shrink-0 text-amber-600" />
          <span><b>No banco sem lançamento (90 dias):</b> {r.furo.saidas.n} saídas ({brl(r.furo.saidas.total)}) e {r.furo.entradas.n} entradas ({brl(r.furo.entradas.total)})</span>
        </span>
        <ChevronDown size={18} className={`shrink-0 text-slate-400 transition ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <div className="space-y-4 border-t border-slate-100 px-4 py-3 text-sm">
          <p className="text-slate-600">É o que apareceu no extrato sem estar previsto no ERP. Enquanto não for lançado (ou ligado a uma conta), o fluxo de caixa previsto erra por esse valor.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <h3 className="mb-1 flex items-center gap-1 font-bold text-red-700"><ArrowUpRight size={15} /> Saídas por tipo</h3>
              <ul className="space-y-1">{r.furo.grupos.map((g) => (
                <li key={g.grupo} className="flex justify-between gap-2"><span>{g.grupo} <span className="text-slate-400">· {g.n}</span></span><b className="num">{brl(g.total)}</b></li>
              ))}</ul>
            </div>
            <div>
              <h3 className="mb-1 flex items-center gap-1 font-bold text-amber-700"><CalendarClock size={15} /> Repetem: viram conta fixa</h3>
              {r.furo.repetidos.length ? <ul className="space-y-1">{r.furo.repetidos.map((x) => (
                <li key={x.tipo} className="flex justify-between gap-2"><span className="min-w-0 truncate">{x.tipo} <span className="text-slate-400">· {x.n}×</span></span><b className="num shrink-0">{brl(x.total)}</b></li>
              ))}</ul> : <p className="text-slate-500">Nada se repete.</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/conciliacao" className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 font-semibold text-brand-fg"><ArrowDownLeft size={15} /> Conciliar o extrato</Link>
            <Link to="/financeiro?aba=pagar" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold">Criar contas fixas</Link>
          </div>
        </div>
      )}
    </Card>
  );
}

function Numero({ titulo, valor, detalhe, cor }: { titulo: string; valor: string; detalhe: string; cor: string }) {
  return (
    <div className="bg-surface p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{titulo}</div>
      <div className={`num mt-1 text-2xl font-extrabold ${cor}`}>{valor}</div>
      <div className="mt-0.5 text-xs text-slate-500">{detalhe}</div>
    </div>
  );
}
