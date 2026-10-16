// Resumo do representante: meta do mês, vendas, comissões e pedidos em aberto.
import { Link } from "react-router-dom";
import { CalendarClock, ChevronRight, ClipboardList, HandCoins, Plus, ShoppingCart, Target, TrendingUp, Wallet } from "lucide-react";
import { Badge, Card, Stat, nomeMes } from "@/components/ui";
import { brl, dataBR, pl } from "@/lib/format";
import { COR_FAIXA } from "@/lib/metas";
import { metaDoMes, type PedidoPortal, type ResumoPortal } from "@/lib/portal";
import { usePortal } from "./dados";

export function PortalResumo({ nome }: { nome: string }) {
  const { data: r, isLoading, error } = usePortal<ResumoPortal>("portal_resumo");
  const { data: pedidos = [] } = usePortal<PedidoPortal[]>("portal_pedidos");
  if (isLoading) return <p className="py-10 text-center text-slate-500">Carregando…</p>;
  if (error || !r) return <p className="py-10 text-center text-red-700" role="alert">{(error as Error)?.message ?? "Não foi possível carregar o resumo."}</p>;
  const m = metaDoMes(r);
  const cor = COR_FAIXA[m.faixa];
  const largura = Math.min(100, Math.max(0, m.pct ?? 0));
  const abertos = r.pedidos.orcamentos + r.pedidos.aprovados + r.pedidos.faturados;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-500">{nomeMes(r.mes.slice(0, 7))}</p>
        <h1 className="text-xl font-bold text-fg">Olá, {nome.split(" ")[0]}!</h1>
      </div>

      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-600"><Target size={16} aria-hidden /> Meta do mês</p>
            <p className="num mt-1 text-2xl font-bold text-fg">{brl(m.realizado)}</p>
            <p className="text-sm text-slate-600">{m.meta != null ? <>de {brl(m.meta)}</> : "Sem meta cadastrada para este mês"}</p>
          </div>
          {m.pct != null && <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-bold ${cor.selo}`}>{m.pct.toLocaleString("pt-BR")}%</span>}
        </div>
        {m.meta != null && (
          <>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(largura)} aria-label="Meta atingida">
              <div className={`h-full rounded-full ${cor.barra}`} style={{ width: `${largura}%` }} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              {m.projecao != null && <div><dt className="text-slate-500">Projeção do mês</dt><dd className="num font-semibold text-fg">{brl(m.projecao)}</dd></div>}
              <div><dt className="text-slate-500">{m.falta ? "Falta" : "Meta batida"}</dt><dd className="num font-semibold text-fg">{m.falta ? brl(m.falta) : "✓"}</dd></div>
              {!!m.faltaPorDia && <div className="col-span-2 text-slate-600">≈ <b className="num">{brl(m.faltaPorDia)}</b> por dia útil ({m.diasRestantes} {pl(m.diasRestantes, "dia útil", "dias úteis")} pela frente)</div>}
            </dl>
          </>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Vendas do mês" valor={brl(r.vendas.mes)} sub={`${r.vendas.pedidos_mes} ${pl(r.vendas.pedidos_mes, "venda", "vendas")}`} icon={TrendingUp} tom="bom" />
        <Stat label="Vendas do ano" valor={brl(r.vendas.ano)} icon={CalendarClock} tom="info" />
        <Link to="/portal/comissoes" className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><Stat label="Comissões a receber" valor={brl(r.comissoes.a_receber)} sub="liberadas" icon={Wallet} tom="atencao" /></Link>
        <Link to="/portal/comissoes" className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><Stat label="Comissões previstas" valor={brl(r.comissoes.previstas)} sub={`recebidas no ano: ${brl(r.comissoes.recebidas_ano)}`} icon={HandCoins} /></Link>
      </div>

      <Link to="/portal/pedidos" className="block">
        <Card className="flex items-center gap-3 p-4 hover:border-brand">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-700"><ClipboardList size={20} aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-600">Pedidos em aberto</span>
            <span className="num block text-lg font-bold text-fg">{abertos}</span>
            <span className="block text-xs text-slate-600">
              {r.pedidos.orcamentos} {pl(r.pedidos.orcamentos, "orçamento", "orçamentos")} ({brl(r.pedidos.orcamentos_valor)}) · {r.pedidos.aprovados} {pl(r.pedidos.aprovados, "aprovado", "aprovados")} · {r.pedidos.faturados} {pl(r.pedidos.faturados, "faturado", "faturados")}
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-slate-400" aria-hidden />
        </Card>
      </Link>

      <Link to="/portal/novo" className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-base font-bold text-brand-fg shadow-sm hover:bg-brand-dark">
        <Plus size={20} aria-hidden /> Novo orçamento
      </Link>

      {pedidos.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg"><ShoppingCart size={16} aria-hidden /> Últimos pedidos</h2>
          <Card>
            <ul className="divide-y divide-slate-100">
              {pedidos.slice(0, 5).map((p) => (
                <li key={p.id}>
                  <Link to={`/portal/pedidos/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-fg">#{p.numero} · {p.cliente}</span>
                      <span className="block text-xs text-slate-500">{dataBR(p.criado_em)}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1"><span className="num text-sm font-bold">{brl(p.total)}</span><Badge value={p.status} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}
