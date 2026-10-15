// Resumo do extrato da conta escolhida: quantos Pix entraram, vendas no cartão, Pix enviados, combustível…
// Cada quadro filtra a lista de lançamentos. Sem mês escolhido, mostra também mês a mês.
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Fuel } from "lucide-react";
import { Card, nomeMes } from "@/components/ui";
import { brl, pl } from "@/lib/format";
import { resumoPorMes, resumoPorTipo, TIPOS_LANC, type LancResumo, type TipoLanc } from "@/lib/extratoTipos";

export function ResumoExtrato({ lancs, titulo, mes, tipo, onTipo, onMes }: {
  lancs: LancResumo[]; titulo: string; mes: string; tipo: TipoLanc | ""; onTipo: (t: TipoLanc | "") => void; onMes: (m: string) => void;
}) {
  if (!lancs.length) return null;
  const r = resumoPorTipo(lancs);
  const meses = mes ? [] : resumoPorMes(lancs).slice(0, 12);
  const datas = lancs.map((l) => l.data).sort();
  const quadro = (t: (typeof TIPOS_LANC)[number]) => {
    const x = r[t.id];
    const ativo = tipo === t.id;
    return (
      <button key={t.id} type="button" aria-pressed={ativo} onClick={() => onTipo(ativo ? "" : t.id)} disabled={!x.n}
        title={x.n ? `Mostrar só ${t.rotulo.toLowerCase()} na lista` : undefined}
        className={`min-w-0 rounded-lg border px-3 py-2 text-left transition disabled:opacity-50 ${ativo ? "border-brand ring-2 ring-brand/30" : "border-slate-200 hover:border-slate-300"}`}>
        <div className="flex items-center gap-1 text-xs text-slate-500">{t.id === "combustivel" && <Fuel size={12} aria-hidden />}{t.rotulo}</div>
        <div className={`text-lg font-bold ${t.entrada ? "text-emerald-700" : "text-red-600"}`}>{x.n}</div>
        <div className="text-xs font-semibold text-slate-600">{brl(Math.abs(x.total))}</div>
      </button>
    );
  };
  return (
    <Card className="mb-4 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-fg">Resumo · {titulo}</h2>
        <span className="text-xs text-slate-500">{mes ? nomeMes(mes) : `${datas[0].split("-").reverse().join("/")} a ${datas[datas.length - 1].split("-").reverse().join("/")}`} · lançamento repetido em duas contas conta uma vez</span>
      </div>
      <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-emerald-700"><ArrowDownLeft size={13} /> Entraram</div>
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">{TIPOS_LANC.filter((t) => t.entrada).map(quadro)}</div>
      <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-red-600"><ArrowUpRight size={13} /> Saíram</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{TIPOS_LANC.filter((t) => !t.entrada).map(quadro)}</div>
      {r.combustivel.n > 0 && (
        <p className="mt-2 text-xs text-slate-500"><Link to="/combustivel" className="font-semibold text-brand hover:underline">Ver gastos com combustível</Link> por mês e por posto.</p>
      )}
      {meses.length > 1 && (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500">
              <th className="py-1 pr-3 font-semibold">Mês</th><th className="py-1 pr-3 text-right font-semibold">Pix recebidos</th>
              <th className="py-1 pr-3 text-right font-semibold">Vendas no cartão</th><th className="py-1 pr-3 text-right font-semibold">Entradas</th><th className="py-1 text-right font-semibold">Saídas</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {meses.map((m) => (
                <tr key={m.mes}>
                  <td className="py-1.5 pr-3"><button type="button" className="font-semibold text-brand hover:underline" onClick={() => onMes(m.mes)}>{nomeMes(m.mes)}</button></td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-right">{m.pix_n} {pl(m.pix_n, "Pix", "Pix")} · {brl(m.pix)}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-right">{brl(m.vendas)}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-right text-emerald-700">{brl(m.entradas)}</td>
                  <td className="whitespace-nowrap py-1.5 text-right text-red-600">{brl(m.saidas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Aviso: o mesmo extrato está em duas contas (o arquivo foi importado duas vezes). */
export function AvisoContasRepetidas({ pares, nome, onEditar }: {
  pares: { a: string; b: string; iguais: number }[]; nome: (id: string) => string; onEditar?: (id: string) => void;
}) {
  if (!pares.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {pares.map((p) => (
        <div key={`${p.a}${p.b}`} role="alert" className="flex flex-wrap items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <b>As contas “{nome(p.a)}” e “{nome(p.b)}” têm o mesmo extrato</b> ({p.iguais} {pl(p.iguais, "lançamento igual", "lançamentos iguais")}): o mesmo arquivo foi importado nas duas,
            e os saldos e totais ficam em dobro. Fique com uma só: abra a que sobra no lápis e desmarque <b>Conta ativa</b>.
          </div>
          {onEditar && (
            <div className="flex shrink-0 gap-1">
              <button type="button" className="rounded-lg border border-amber-300 bg-surface px-2 py-1 text-xs font-semibold hover:bg-amber-100" onClick={() => onEditar(p.a)}>Abrir “{nome(p.a)}”</button>
              <button type="button" className="rounded-lg border border-amber-300 bg-surface px-2 py-1 text-xs font-semibold hover:bg-amber-100" onClick={() => onEditar(p.b)}>Abrir “{nome(p.b)}”</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
