// Relatório de vendas por período + histórico de pedidos (reimprimir e cancelar com motivo).
import { useMemo, useState } from "react";
import { Ban, Printer } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { brl } from "@/lib/format";
import { notify } from "@/lib/notify";
import { imprimirCupom } from "@/lib/sorveteriaCupom";
import {
  inicioDoDia, relatorio, rotuloCanal, rotuloMeio, somaDias, totalPedido, type Estado, type Meio, type Pedido,
} from "@/lib/sorveteria";

const PERIODOS = [
  { id: "hoje", rotulo: "Hoje", de: () => inicioDoDia(), ate: () => somaDias(inicioDoDia(), 1) },
  { id: "ontem", rotulo: "Ontem", de: () => somaDias(inicioDoDia(), -1), ate: () => inicioDoDia() },
  { id: "7", rotulo: "7 dias", de: () => somaDias(inicioDoDia(), -6), ate: () => somaDias(inicioDoDia(), 1) },
  { id: "30", rotulo: "30 dias", de: () => somaDias(inicioDoDia(), -29), ate: () => somaDias(inicioDoDia(), 1) },
] as const;

export function Relatorio({ estado, mudar }: { estado: Estado; mudar: (f: (e: Estado) => Estado) => void }) {
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]["id"]>("hoje");
  const [cancelar, setCancelar] = useState<Pedido | null>(null);
  const [motivo, setMotivo] = useState("");
  const p = PERIODOS.find((x) => x.id === periodo)!;
  const de = p.de(), ate = p.ate();
  const r = useMemo(() => relatorio(estado, de, ate), [estado, periodo]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxHora = Math.max(1, ...r.horas);
  const horasComVenda = r.horas.map((v, h) => ({ h, v })).filter((x) => x.v > 0);
  const lista = estado.pedidos.filter((x) => x.numero && x.situacao !== "aberto" && new Date(x.pagoEm ?? x.criadoEm) >= de && new Date(x.pagoEm ?? x.criadoEm) < ate)
    .sort((a, b) => b.numero - a.numero);

  const confirmarCancelamento = () => {
    if (!cancelar) return;
    if (!motivo.trim()) return notify("Informe o motivo do cancelamento.", "erro");
    mudar((e) => ({ ...e, pedidos: e.pedidos.map((x) => x.id === cancelar.id ? { ...x, situacao: "cancelado" as const, producao: null, motivoCancelamento: motivo.trim() } : x) }));
    setCancelar(null); setMotivo("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Período">
        {PERIODOS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={periodo === x.id} onClick={() => setPeriodo(x.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${periodo === x.id ? "border-modulo bg-modulo text-white" : "border-slate-200 hover:border-modulo"}`}>{x.rotulo}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Faturamento", brl(r.total)], ["Pedidos", String(r.pedidos)], ["Ticket médio", brl(r.ticket)], ["Cancelados", String(r.cancelados)]].map(([t, v]) => (
          <Card key={t} className="p-4"><p className="text-xs font-semibold text-slate-500">{t}</p><p className="num text-2xl font-extrabold">{v}</p></Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-bold">Vendas por hora</h3>
          {horasComVenda.length === 0 ? <p className="text-sm text-slate-500">Sem vendas no período.</p> : (
            <div className="flex h-36 items-end gap-1" role="img" aria-label="Gráfico de vendas por hora">
              {r.horas.map((v, h) => (h < 8 && v === 0) || (h > 22 && v === 0) ? null : (
                <div key={h} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${h}h: ${brl(v)}`}>
                  <div className="w-full rounded-t bg-modulo" style={{ height: `${(v / maxHora) * 100}%`, minHeight: v ? 3 : 0 }} />
                  <span className="text-[10px] text-slate-500">{h}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-bold">Canais e formas de pagamento</h3>
          <ul className="num space-y-1 text-sm">
            {Object.entries(r.canais).map(([c, v]) => <li key={c} className="flex justify-between"><span>{rotuloCanal(c as any)} <span className="text-slate-400">({v.qtd})</span></span><b>{brl(v.valor)}</b></li>)}
            {Object.keys(r.canais).length === 0 && <li className="text-slate-500">—</li>}
          </ul>
          <hr className="my-3 border-slate-100" />
          <ul className="num space-y-1 text-sm">
            {Object.entries(r.meios).map(([m, v]) => <li key={m} className="flex justify-between"><span>{rotuloMeio(m as Meio)}</span><b>{brl(v)}</b></li>)}
          </ul>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-bold">Mais vendidos</h3>
        {r.top.length === 0 ? <p className="text-sm text-slate-500">Sem vendas no período.</p> : (
          <ol className="num grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            {r.top.slice(0, 10).map((t, i) => <li key={t.nome} className="flex justify-between gap-3"><span>{i + 1}. {t.nome} <span className="text-slate-400">× {t.qtd}</span></span><b>{brl(t.valor)}</b></li>)}
          </ol>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-bold">Pedidos do período</h3>
        {lista.length === 0 ? <p className="text-sm text-slate-500">Nenhum pedido.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {lista.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <b className="w-12">#{x.numero}</b>
                <span className="w-24 text-slate-500">{new Date(x.pagoEm ?? x.criadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {rotuloCanal(x.canal)}</span>
                <span className="min-w-0 flex-1 truncate text-slate-600">{x.itens.map((i) => i.nome).join(", ")}</span>
                {x.situacao === "cancelado" ? <span className="text-xs font-bold text-red-600" title={x.motivoCancelamento}>CANCELADO</span> : <b className="num">{brl(totalPedido(x, estado.loja.gorjetaPct))}</b>}
                <Button type="button" variant="ghost" className="!px-2" aria-label={`Reimprimir pedido ${x.numero}`} onClick={() => imprimirCupom(x, estado.loja)}><Printer size={16} aria-hidden /></Button>
                {x.situacao === "fechado" && <Button type="button" variant="ghost" className="!px-2 text-red-600" aria-label={`Cancelar pedido ${x.numero}`} onClick={() => setCancelar(x)}><Ban size={16} aria-hidden /></Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={!!cancelar} onClose={() => setCancelar(null)} title={`Cancelar pedido #${cancelar?.numero ?? ""}`}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">O valor sai do faturamento e do caixa. Se o cliente pagou em dinheiro, devolva e registre uma sangria.</p>
          <Field label="Motivo"><input className="input" autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setCancelar(null)}>Voltar</Button><Button type="button" variant="danger" onClick={confirmarCancelamento}>Cancelar pedido</Button></div>
        </div>
      </Modal>
    </div>
  );
}
