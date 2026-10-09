// Financeiro → DRE: lucro do mês e dos meses anteriores pelo plano de contas, por competência ou por caixa,
// com filtro por centro de custo, detalhe por categoria e exportação para Excel.
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileDown } from "lucide-react";
import { Button, Card, Tabs } from "@/components/ui";
import { brl, hoje } from "@/lib/format";
import { baixarPlanilha } from "@/lib/exportar";
import { notifyError } from "@/lib/notify";
import { dre, mesesAte, type LancDre, type Regime } from "@/lib/dre";
import { useCategorias, useCentros } from "./CategoriaRateio";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const rotuloMes = (am: string) => `${MESES[Number(am.slice(5)) - 1]}/${am.slice(2, 4)}`;
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const valor = (v: number) => (v < 0 ? `(${brl(-v)})` : brl(v));

export function Dre({ lancamentos }: { lancamentos: LancDre[] }) {
  const dia = hoje();
  const [regime, setRegime] = useState<Regime>("competencia");
  const [periodo, setPeriodo] = useState<"6" | "12" | "ano">("6");
  const [centro, setCentro] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const { data: cats = [] } = useCategorias();
  const { data: centros = [] } = useCentros();
  const meses = periodo === "ano" ? mesesAte(dia, Number(dia.slice(5, 7))) : mesesAte(dia, Number(periodo));
  const d = useMemo(() => dre(lancamentos, cats, meses, regime, centro || null), [lancamentos, cats, meses.join(), regime, centro]); // eslint-disable-line react-hooks/exhaustive-deps
  const atual = d.resumo(meses.length - 1);
  const alternar = (k: string) => setAbertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  function exportar() {
    const linhas = d.linhas.flatMap((l) => [
      { Linha: l.rotulo, ...Object.fromEntries(meses.map((m, i) => [rotuloMes(m), l.valores[i]])), Total: l.total },
      ...l.detalhes.map((x) => ({ Linha: `   ${x.categoria}`, ...Object.fromEntries(meses.map((m, i) => [rotuloMes(m), x.valores[i]])), Total: x.total })),
    ]);
    linhas.push({ Linha: "Margem líquida", ...Object.fromEntries(meses.map((m, i) => [rotuloMes(m), d.margem[i] === null ? "" : Math.round(d.margem[i]! * 1000) / 10])), Total: d.margemTotal === null ? "" : Math.round(d.margemTotal * 1000) / 10 } as any);
    baixarPlanilha(`dre-${regime}-${meses[0]}-a-${meses[meses.length - 1]}`, [{ nome: "DRE", linhas }]).catch(notifyError);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Tabs value={regime} onChange={setRegime} options={[{ value: "competencia", label: "Competência" }, { value: "caixa", label: "Caixa" }]} />
        <Tabs value={periodo} onChange={setPeriodo} options={[{ value: "6", label: "6 meses" }, { value: "12", label: "12 meses" }, { value: "ano", label: `Ano ${dia.slice(0, 4)}` }]} />
        <select className="input mb-4 w-auto" value={centro} onChange={(e) => setCentro(e.target.value)} aria-label="Centro de custo">
          <option value="">Todos os centros de custo</option>
          {centros.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          {centros.length > 0 && <option value="sem">Sem centro de custo</option>}
        </select>
        <Button variant="secondary" className="mb-4 ml-auto" onClick={exportar}><FileDown size={16} /> Exportar</Button>
      </div>
      <p className="-mt-2 text-xs text-slate-500">
        {regime === "competencia" ? "Competência: cada conta entra no mês do vencimento (contas fixas: no mês de referência), paga ou não."
          : "Caixa: cada conta entra no mês em que o dinheiro entrou ou saiu, pelo valor pago."} Valores entre parênteses são saídas.
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <div className="mb-2 flex justify-between text-sm"><b>DRE · {MESES_LONGOS[Number(dia.slice(5, 7)) - 1]}</b><span className="text-slate-500">{centro ? centros.find((c) => c.id === centro)?.nome ?? "sem centro" : "todos os centros"}</span></div>
          <dl className="num space-y-1 text-sm">
            <div className="flex justify-between"><dt>Receita bruta</dt><dd className="font-semibold">{brl(atual.receita)}</dd></div>
            <div className="flex justify-between"><dt>(−) Custos e impostos</dt><dd className="font-semibold text-red-700">{brl(-atual.custos)}</dd></div>
            <div className="flex justify-between"><dt>(−) Despesas</dt><dd className="font-semibold text-red-700">{brl(-atual.despesas)}</dd></div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base"><dt className="font-bold">(=) Lucro líquido</dt>
              <dd className={`font-bold ${atual.lucro >= 0 ? "text-emerald-700" : "text-red-700"}`}>{brl(atual.lucro)}</dd></div>
          </dl>
          {atual.margem !== null && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${atual.margem >= 0 ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, Math.abs(atual.margem) * 100)}%` }} /></div>
              <span className={`text-xs font-semibold ${atual.margem >= 0 ? "text-emerald-700" : "text-red-700"}`}>margem {pct(atual.margem)}</span>
            </div>
          )}
        </Card>
        <Card className="p-4 text-sm lg:col-span-2">
          <b>Como ler</b>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600">
            <li>Cada conta entra na linha da categoria dela (Financeiro → <b>Plano de contas</b>). Categoria sem cadastro conta como despesa operacional.</li>
            <li>Toque numa linha para ver as categorias que a compõem.</li>
            <li>Investimentos e distribuição de lucros aparecem embaixo, fora do resultado; transferências entre contas não entram.</li>
          </ul>
        </Card>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50/80">
            <tr>
              <th className="th sticky left-0 z-10 min-w-[14rem] bg-slate-50">Linha</th>
              {meses.map((m) => <th key={m} className="th text-right">{rotuloMes(m)}</th>)}
              <th className="th text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {d.linhas.map((l) => {
              if (l.tipo === "info" && !l.valores.some(Boolean)) return null;
              const aberto = abertos.has(l.chave);
              const forte = l.tipo === "resultado";
              return (
                <Fragment key={l.chave}>
                  <tr className={`${forte ? "bg-slate-50/70 font-bold" : ""} ${l.chave === "liquido" ? "text-base" : ""} ${l.tipo === "info" ? "text-slate-500" : ""}`}>
                    <td className={`sticky left-0 z-10 whitespace-nowrap px-4 py-2 ${forte ? "bg-slate-50" : "bg-surface"}`}>
                      {l.detalhes.length ? (
                        <button type="button" onClick={() => alternar(l.chave)} className="inline-flex items-center gap-1 text-left font-semibold hover:text-brand" aria-expanded={aberto}>
                          {aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {l.rotulo}
                        </button>
                      ) : <span className={forte ? "" : "pl-5"}>{l.rotulo}</span>}
                    </td>
                    {l.valores.map((v, i) => <td key={i} className={`num whitespace-nowrap px-4 py-2 text-right ${l.chave === "liquido" ? (v >= 0 ? "text-emerald-700" : "text-red-700") : v < 0 ? "text-slate-700" : ""}`}>{v ? valor(v) : "—"}</td>)}
                    <td className={`num whitespace-nowrap px-4 py-2 text-right font-semibold ${l.chave === "liquido" ? (l.total >= 0 ? "text-emerald-700" : "text-red-700") : ""}`}>{l.total ? valor(l.total) : "—"}</td>
                  </tr>
                  {aberto && l.detalhes.map((x) => (
                    <tr key={l.chave + x.categoria} className="text-slate-600">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-surface py-1.5 pl-10 pr-4">{x.categoria}</td>
                      {x.valores.map((v, i) => <td key={i} className="num whitespace-nowrap px-4 py-1.5 text-right">{v ? valor(v) : "—"}</td>)}
                      <td className="num whitespace-nowrap px-4 py-1.5 text-right">{valor(x.total)}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            <tr className="text-slate-600">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-4 py-2 font-semibold">Margem líquida</td>
              {d.margem.map((m, i) => <td key={i} className="num px-4 py-2 text-right">{pct(m)}</td>)}
              <td className="num px-4 py-2 text-right font-semibold">{pct(d.margemTotal)}</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}
