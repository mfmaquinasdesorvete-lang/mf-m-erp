// Minhas comissões: extrato por mês (base, %, valor e situação), totais e exportar para Excel.
import { useMemo, useState } from "react";
import { FileDown, HandCoins, Wallet, CalendarCheck } from "lucide-react";
import { Button, Card, Stat, nomeMes } from "@/components/ui";
import { brl, dataBR } from "@/lib/format";
import { baixarPlanilha, celula } from "@/lib/exportar";
import { notifyError } from "@/lib/notify";
import {
  AJUDA_COMISSAO, anosDoExtrato, extratoPorMes, mesDaComissao, planilhaComissoes, ROTULO_COMISSAO, totaisComissoes,
  type ComissaoPortal, type SituacaoComissao,
} from "@/lib/portal";
import { usePortal } from "./dados";

const COR: Record<SituacaoComissao, string> = {
  prevista: "bg-slate-100 text-slate-700", liberada: "bg-amber-50 text-amber-800", paga: "bg-emerald-50 text-emerald-700",
};
const Selo = ({ s }: { s: SituacaoComissao }) => <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${COR[s]}`}>{ROTULO_COMISSAO[s]}</span>;

export function PortalComissoes() {
  const { data: linhas = [], isLoading, error } = usePortal<ComissaoPortal[]>("portal_comissoes");
  const anos = anosDoExtrato(linhas);
  const anoAtual = new Date().getFullYear().toString();
  const [ano, setAno] = useState<string>(anoAtual);
  const vistas = useMemo(() => (ano ? linhas.filter((l) => mesDaComissao(l).startsWith(ano)) : linhas), [linhas, ano]);
  const meses = extratoPorMes(vistas);
  const total = totaisComissoes(linhas);
  const doAno = totaisComissoes(vistas);

  function exportar() {
    const rows = planilhaComissoes(vistas).map((r) => ({ ...r, Data: celula(r.Data), "Paga em": celula(r["Paga em"]) }));
    baixarPlanilha(`minhas-comissoes${ano ? "-" + ano : ""}`, [{ nome: "Comissões", linhas: rows }]).catch(notifyError);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-xl font-bold text-fg">Minhas comissões</h1>
        <Button variant="secondary" onClick={exportar} disabled={!vistas.length}><FileDown size={16} aria-hidden /> Excel</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="A receber" valor={brl(total.liberada)} sub="liberadas, ainda não pagas" icon={Wallet} tom="atencao" />
        <Stat label="Previstas" valor={brl(total.prevista)} sub="dos pedidos aprovados" icon={HandCoins} />
        <Stat label={ano ? `Pagas em ${ano}` : "Pagas"} valor={brl(doAno.paga)} icon={CalendarCheck} tom="bom" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-slate-600" htmlFor="ano-comissoes">Ano</label>
        <select id="ano-comissoes" className="input w-auto" value={ano} onChange={(e) => setAno(e.target.value)}>
          {[...new Set([anoAtual, ...anos])].sort().reverse().map((a) => <option key={a} value={a}>{a}</option>)}
          <option value="">Todos</option>
        </select>
      </div>
      <ul className="space-y-1 text-xs text-slate-600">
        {(Object.keys(AJUDA_COMISSAO) as SituacaoComissao[]).map((s) => <li key={s}><Selo s={s} /> {AJUDA_COMISSAO[s]}</li>)}
      </ul>
      {isLoading && <p className="py-8 text-center text-slate-500">Carregando…</p>}
      {error && <p className="py-8 text-center text-red-700" role="alert">{(error as Error).message}</p>}
      {!isLoading && !error && !meses.length && <p className="py-8 text-center text-sm text-slate-500">Nenhuma comissão {ano ? `em ${ano}` : "ainda"}.</p>}
      {meses.map((m) => (
        <Card key={m.mes}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
            <h2 className="text-sm font-bold capitalize text-fg">{nomeMes(m.mes)}</h2>
            <span className="flex flex-wrap gap-2 text-xs">
              {(["prevista", "liberada", "paga"] as const).filter((s) => m[s] > 0).map((s) => <span key={s} className={`rounded-full px-2 py-0.5 font-semibold ${COR[s]}`}>{ROTULO_COMISSAO[s]} {brl(m[s])}</span>)}
            </span>
          </div>
          <ul className="divide-y divide-slate-100">
            {m.linhas.map((l, k) => (
              <li key={k} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block font-semibold text-fg">{l.pedido_numero ? `#${l.pedido_numero} · ` : ""}{l.cliente ?? "—"}</span>
                  <span className="block text-xs text-slate-500">{l.descricao} · {dataBR(l.dia)}{l.pago_em ? ` · paga em ${dataBR(l.pago_em)}` : ""}</span>
                  <span className="num block text-xs text-slate-500">base {brl(l.base)} × {Number(l.percentual).toLocaleString("pt-BR")}%</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1"><span className="num font-bold">{brl(l.valor)}</span><Selo s={l.situacao} /></span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
