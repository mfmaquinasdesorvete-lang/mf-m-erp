// Financeiro → DRE: lucro do mês e dos meses anteriores pelo plano de contas, por competência ou por caixa,
// com filtro por centro de custo, detalhe por categoria e exportação para Excel.
// O gráfico escolhe o mês em foco. Celular: só esse mês, em linhas com % da receita e comparação com o mês
// anterior. Computador: a tabela com todos os meses, o mês em foco destacado.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, FileDown } from "lucide-react";
import { Button, Card, Tabs } from "@/components/ui";
import { brl, hoje } from "@/lib/format";
import { baixarPlanilha } from "@/lib/exportar";
import { notifyError } from "@/lib/notify";
import { dre, mesesAte, rotuloCategoria, type LancDre, type LinhaDre, type Regime } from "@/lib/dre";
import { useCategorias, useCentros } from "./CategoriaRateio";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const rotuloMes = (am: string) => `${MESES[Number(am.slice(5)) - 1]}/${am.slice(2, 4)}`;
const rotuloMesLongo = (am: string) => `${MESES_LONGOS[Number(am.slice(5)) - 1]} de ${am.slice(0, 4)}`;
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const valor = (v: number) => (v < 0 ? `(${brl(-v)})` : brl(v));
const corLucro = (v: number) => (v >= 0 ? "text-emerald-700" : "text-red-700");

export function Dre({ lancamentos }: { lancamentos: LancDre[] }) {
  const dia = hoje();
  const [regime, setRegime] = useState<Regime>("competencia");
  const [periodo, setPeriodo] = useState<"6" | "12" | "ano">("6");
  const [centro, setCentro] = useState("");
  const [foco, setFoco] = useState<string | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const { data: cats = [] } = useCategorias();
  const { data: centros = [] } = useCentros();
  const meses = periodo === "ano" ? mesesAte(dia, Number(dia.slice(5, 7))) : mesesAte(dia, Number(periodo));
  const d = useMemo(() => dre(lancamentos, cats, meses, regime, centro || null), [lancamentos, cats, meses.join(), regime, centro]); // eslint-disable-line react-hooks/exhaustive-deps
  const i = foco && meses.includes(foco) ? meses.indexOf(foco) : meses.length - 1;
  const mes = meses[i];
  const atual = d.resumo(i);
  const anterior = i > 0 ? d.resumo(i - 1) : null;
  const linha = (chave: string) => d.linhas.find((l) => l.chave === chave)!;
  const receitas = linha("receita").valores;
  const lucros = linha("liquido").valores;
  const temDados = meses.map((_, k) => d.linhas.some((l) => l.valores[k]));
  const nomeCentro = centro ? centros.find((c) => c.id === centro)?.nome ?? "sem centro de custo" : "todos os centros de custo";
  const caixa = useRef<HTMLDivElement>(null);
  // computador: a tabela é mais larga que a tela; rola até o mês em foco (o último mostra também o total)
  useEffect(() => {
    const c = caixa.current, th = c?.querySelector<HTMLElement>(`th[data-mes="${mes}"]`);
    if (!c || !th) return;
    if (i === meses.length - 1) { c.scrollLeft = c.scrollWidth; return; }
    const r = th.getBoundingClientRect(), cr = c.getBoundingClientRect();
    if (r.right > cr.right) c.scrollLeft += r.right - cr.right + 16;
    else if (r.left < cr.left + 208) c.scrollLeft -= cr.left + 208 - r.left;
  }, [mes, meses.length, i]);
  const alternar = (k: string) => setAbertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  function exportar() {
    const linhas = d.linhas.flatMap((l) => [
      { Linha: l.rotulo, ...Object.fromEntries(meses.map((m, k) => [rotuloMes(m), l.valores[k]])), Total: l.total },
      ...l.detalhes.map((x) => ({ Linha: `   ${rotuloCategoria(x.categoria)}`, ...Object.fromEntries(meses.map((m, k) => [rotuloMes(m), x.valores[k]])), Total: x.total })),
    ]);
    linhas.push({ Linha: "Margem líquida", ...Object.fromEntries(meses.map((m, k) => [rotuloMes(m), d.margem[k] === null ? "" : Math.round(d.margem[k]! * 1000) / 10])), Total: d.margemTotal === null ? "" : Math.round(d.margemTotal * 1000) / 10 } as any);
    baixarPlanilha(`dre-${regime}-${meses[0]}-a-${meses[meses.length - 1]}`, [{ nome: "DRE", linhas }]).catch(notifyError);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-2">
        <Tabs value={regime} onChange={setRegime} options={[{ value: "competencia", label: "Competência" }, { value: "caixa", label: "Caixa" }]} />
        <Tabs value={periodo} onChange={setPeriodo} options={[{ value: "6", label: "6 meses" }, { value: "12", label: "12 meses" }, { value: "ano", label: `Ano ${dia.slice(0, 4)}` }]} />
        <select className="input mb-4 w-full sm:w-auto" value={centro} onChange={(e) => setCentro(e.target.value)} aria-label="Centro de custo">
          <option value="">Todos os centros de custo</option>
          {centros.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          {centros.length > 0 && <option value="sem">Sem centro de custo</option>}
        </select>
        <Button variant="secondary" className="mb-4 ml-auto" onClick={exportar}><FileDown size={16} aria-hidden /> Exportar</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
            <b className="first-letter:uppercase">{rotuloMesLongo(mes)}</b>
            <span className="text-xs text-slate-500">{nomeCentro}</span>
          </div>
          <dl className="num space-y-1 text-sm">
            <div className="flex justify-between"><dt>Receita bruta</dt><dd className="font-semibold">{brl(atual.receita)}</dd></div>
            <div className="flex justify-between"><dt>(−) Custos e impostos</dt><dd className="font-semibold text-red-700">{brl(-atual.custos)}</dd></div>
            <div className="flex justify-between"><dt>(−) Despesas</dt><dd className="font-semibold text-red-700">{brl(-atual.despesas)}</dd></div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base"><dt className="font-bold">(=) Lucro líquido</dt>
              <dd className={`font-bold ${corLucro(atual.lucro)}`}>{brl(atual.lucro)}</dd></div>
          </dl>
          {atual.margem !== null && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${atual.margem >= 0 ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, Math.abs(atual.margem) * 100)}%` }} /></div>
              <span className={`text-xs font-semibold ${corLucro(atual.margem)}`}>margem {pct(atual.margem)}</span>
            </div>
          )}
          {anterior && <Comparacao agora={atual.lucro} antes={anterior.lucro} mes={meses[i - 1]} />}
        </Card>

        <Card className="p-4 lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <b>Mês a mês</b>
            <span className="flex items-center gap-3 text-xs text-slate-500" aria-hidden>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-sky-400" /> receita</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> lucro</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> prejuízo</span>
            </span>
          </div>
          <Grafico meses={meses} receitas={receitas} lucros={lucros} temDados={temDados} foco={i} onFoco={setFoco} />
          <p className="mt-1 text-xs text-slate-500">Toque num mês para ver o DRE dele.</p>
        </Card>
      </div>

      <details className="rounded-xl border border-slate-200 bg-surface px-4 py-2.5 text-sm">
        <summary className="cursor-pointer font-semibold">Como ler o DRE</summary>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-slate-600">
          <li>{regime === "competencia" ? "Competência: cada conta entra no mês do vencimento (contas fixas: no mês de referência), paga ou não."
            : "Caixa: cada conta entra no mês em que o dinheiro entrou ou saiu, pelo valor pago."}</li>
          <li>Cada conta entra na linha da categoria dela (Financeiro → <b>Plano de contas</b>). Categoria sem cadastro conta como despesa operacional.</li>
          <li>Toque numa linha com seta para ver as categorias que a compõem. Valores entre parênteses são saídas.</li>
          <li>Investimentos e distribuição de lucros aparecem embaixo, fora do resultado; transferências entre contas não entram.</li>
        </ul>
      </details>

      {/* celular: um mês por vez */}
      <Card className="md:hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-2 py-2">
          <Button variant="ghost" aria-label="Mês anterior" disabled={i === 0} onClick={() => setFoco(meses[i - 1])}><ChevronLeft size={18} aria-hidden /></Button>
          <h3 className="flex-1 text-center font-bold first-letter:uppercase" aria-live="polite">{rotuloMesLongo(mes)}</h3>
          <Button variant="ghost" aria-label="Próximo mês" disabled={i === meses.length - 1} onClick={() => setFoco(meses[i + 1])}><ChevronRight size={18} aria-hidden /></Button>
        </div>
        {!temDados[i] ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            Nenhuma conta {regime === "caixa" ? "paga ou recebida" : "com vencimento"} em {rotuloMesLongo(mes)}.
            {temDados.some(Boolean) && " Escolha no gráfico um mês com barras."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {d.linhas.map((l) => <LinhaMes key={l.chave} l={l} i={i} receita={receitas[i]} aberto={abertos.has(l.chave)} alternar={alternar} />)}
            <li className="flex items-center justify-between px-4 py-2.5 text-sm text-slate-600">
              <span className="font-semibold">Margem líquida</span><span className="num font-semibold">{pct(d.margem[i])}</span>
            </li>
          </ul>
        )}
      </Card>

      {/* computador: todos os meses */}
      <Card className="hidden md:block">
        <div ref={caixa} className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50/80">
            <tr>
              <th className="th sticky left-0 z-10 min-w-[13rem] bg-slate-50">Linha</th>
              {meses.map((m, k) => (
                <th key={m} data-mes={m} className={`th text-right ${k === i ? "bg-modulo/15" : ""}`}>
                  <button type="button" className="uppercase hover:underline" aria-pressed={k === i} onClick={() => setFoco(m)}>{rotuloMes(m)}</button>
                </th>
              ))}
              <th className="th text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {d.linhas.map((l) => {
              if (l.tipo === "info" && !l.valores.some(Boolean)) return null;
              const aberto = abertos.has(l.chave);
              const forte = l.tipo === "resultado";
              const cor = (v: number) => (l.chave === "liquido" ? corLucro(v) : v < 0 ? "text-slate-700" : "");
              return (
                <Fragment key={l.chave}>
                  <tr className={`${forte ? "bg-slate-50/70 font-bold" : ""} ${l.chave === "liquido" ? "text-base" : ""} ${l.tipo === "info" ? "text-slate-500" : ""}`}>
                    <td className={`sticky left-0 z-10 whitespace-nowrap px-4 py-2 ${forte ? "bg-slate-50" : "bg-surface"}`}>
                      {l.detalhes.length ? (
                        <button type="button" onClick={() => alternar(l.chave)} className="inline-flex items-center gap-1 text-left font-semibold hover:text-modulo-texto" aria-expanded={aberto}>
                          {aberto ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />} {l.rotulo}
                        </button>
                      ) : <span className={forte ? "" : "pl-5"}>{l.rotulo}</span>}
                    </td>
                    {l.valores.map((v, k) => <td key={k} className={`num whitespace-nowrap px-4 py-2 text-right ${cor(v)} ${k === i ? "bg-modulo/5" : ""}`}>{v ? valor(v) : "—"}</td>)}
                    <td className={`num whitespace-nowrap px-4 py-2 text-right font-semibold ${l.chave === "liquido" ? corLucro(l.total) : ""}`}>{l.total ? valor(l.total) : "—"}</td>
                  </tr>
                  {aberto && l.detalhes.map((x) => (
                    <tr key={l.chave + x.categoria} className="text-slate-600">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-surface py-1.5 pl-10 pr-4">{rotuloCategoria(x.categoria)}</td>
                      {x.valores.map((v, k) => <td key={k} className={`num whitespace-nowrap px-4 py-1.5 text-right ${k === i ? "bg-modulo/5" : ""}`}>{v ? valor(v) : "—"}</td>)}
                      <td className="num whitespace-nowrap px-4 py-1.5 text-right">{valor(x.total)}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            <tr className="text-slate-600">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-4 py-2 font-semibold">Margem líquida</td>
              {d.margem.map((m, k) => <td key={k} className={`num px-4 py-2 text-right ${k === i ? "bg-modulo/5" : ""}`}>{pct(m)}</td>)}
              <td className="num px-4 py-2 text-right font-semibold">{pct(d.margemTotal)}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}

/** Barras de receita e lucro por mês; cada mês é um botão que põe o DRE dele em foco. */
function Grafico({ meses, receitas, lucros, temDados, foco, onFoco }: {
  meses: string[]; receitas: number[]; lucros: number[]; temDados: boolean[]; foco: number; onFoco: (m: string) => void;
}) {
  const max = Math.max(1, ...receitas.map(Math.abs), ...lucros.map(Math.abs));
  const altura = (v: number) => (v ? `${Math.max(4, (Math.abs(v) / max) * 100)}%` : "0");
  return (
    <div role="group" aria-label="Escolha o mês" className="-mx-1 flex items-end gap-1 overflow-x-auto px-1 pb-1">
      {meses.map((m, k) => (
        <button key={m} type="button" aria-pressed={k === foco} onClick={() => onFoco(m)}
          aria-label={`${rotuloMesLongo(m)}: ${temDados[k] ? `receita ${brl(receitas[k])}, ${lucros[k] >= 0 ? "lucro" : "prejuízo"} ${brl(Math.abs(lucros[k]))}` : "sem contas"}`}
          className={`flex min-w-[2.75rem] flex-1 flex-col items-center gap-1 rounded-lg px-1 pb-1 pt-2 transition ${k === foco ? "bg-modulo/15 ring-2 ring-modulo" : "hover:bg-slate-100"}`}>
          <span className="flex h-20 items-end gap-0.5" aria-hidden>
            {temDados[k] ? (
              <>
                <span className="w-2.5 rounded-t bg-sky-400" style={{ height: altura(receitas[k]) }} />
                <span className={`w-2.5 rounded-t ${lucros[k] >= 0 ? "bg-emerald-500" : "bg-red-500"}`} style={{ height: altura(lucros[k]) }} />
              </>
            ) : <span className="h-0.5 w-5 rounded bg-slate-200" />}
          </span>
          <span className={`text-[11px] font-semibold ${k === foco ? "text-modulo-texto" : "text-slate-500"}`}>{rotuloMes(m)}</span>
        </button>
      ))}
    </div>
  );
}

/** Uma linha do DRE no celular: valor do mês, % da receita e, nas linhas com categorias, o detalhe ao tocar. */
function LinhaMes({ l, i, receita, aberto, alternar }: { l: LinhaDre; i: number; receita: number; aberto: boolean; alternar: (k: string) => void }) {
  const v = l.valores[i];
  if (l.tipo === "info" && !v) return null;
  const forte = l.tipo === "resultado";
  const final = l.chave === "liquido";
  const dets = l.detalhes.filter((x) => x.valores[i]);
  const av = v && receita > 0 && l.chave !== "receita" && l.tipo !== "info" ? Math.abs(v) / receita : null;
  return (
    <li className={`${forte ? "bg-slate-50/70" : ""} ${l.tipo === "info" ? "text-slate-500" : ""}`}>
      <div className={`flex items-center gap-2 px-4 ${final ? "py-3" : "py-2.5"}`}>
        {dets.length ? (
          <button type="button" onClick={() => alternar(l.chave)} aria-expanded={aberto} className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm font-semibold">
            {aberto ? <ChevronDown size={15} className="shrink-0" aria-hidden /> : <ChevronRight size={15} className="shrink-0" aria-hidden />}
            <span>{l.rotulo}</span>
          </button>
        ) : <span className={`min-w-0 flex-1 text-sm ${forte ? "font-bold" : "pl-5"} ${final ? "text-base" : ""}`}>{l.rotulo}</span>}
        <span className="shrink-0 text-right">
          <span className={`num block whitespace-nowrap ${forte ? "font-bold" : "font-semibold"} ${final ? `text-base ${corLucro(v)}` : ""}`}>{v ? valor(v) : "—"}</span>
          {av !== null && <span className="block text-[11px] text-slate-500">{pct(av)} da receita</span>}
        </span>
      </div>
      {aberto && dets.length > 0 && (
        <ul className="pb-2">
          {dets.map((x) => (
            <li key={x.categoria} className="flex justify-between gap-2 py-1 pl-10 pr-4 text-sm text-slate-600">
              <span className="min-w-0">{rotuloCategoria(x.categoria)}</span><span className="num shrink-0">{valor(x.valores[i])}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Comparacao({ agora, antes, mes }: { agora: number; antes: number; mes: string }) {
  const dif = Math.round((agora - antes) * 100) / 100;
  if (!agora && !antes) return null;
  return (
    <p className="mt-2 text-xs text-slate-600">
      {dif === 0 ? "Lucro igual ao" : <>Lucro <b className={corLucro(dif)}>{dif > 0 ? "▲" : "▼"} {brl(Math.abs(dif))}</b> {dif > 0 ? "acima do" : "abaixo do"}</>} mês anterior ({rotuloMes(mes)}: {brl(antes)}).
    </p>
  );
}
