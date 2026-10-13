// Financeiro: resultado (DRE) com comissão e CMV, fluxo de caixa e contas a pagar e receber.
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { brl } from "@/lib/format";
import { notify } from "@/lib/notify";
import { novoId, r2, resultado, rotuloMeio, type Conta, type Estado, type Meio } from "@/lib/sorveteria";

type Mudar = (f: (e: Estado) => Estado) => void;
const num = (s: string) => { const v = Number(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) && v > 0 ? v : 0; };
const hojeISO = () => new Date().toISOString().slice(0, 10);
const dataBR = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
const SUBS = [["dre", "Resultado (DRE)"], ["fluxo", "Fluxo de caixa"], ["contas", "Contas a pagar/receber"]] as const;
const PERIODOS = [["hoje", "Hoje"], ["7", "7 dias"], ["mes", "Este mês"]] as const;

function periodo(p: "hoje" | "7" | "mes"): [Date, Date] {
  const h0 = new Date(); h0.setHours(0, 0, 0, 0);
  const de = p === "hoje" ? h0 : p === "7" ? new Date(h0.getTime() - 6 * 864e5) : new Date(h0.getFullYear(), h0.getMonth(), 1);
  return [de, new Date(h0.getTime() + 864e5)];
}

export function Financeiro({ estado, mudar }: { estado: Estado; mudar: Mudar }) {
  const [sub, setSub] = useState<(typeof SUBS)[number][0]>("dre");
  const [per, setPer] = useState<(typeof PERIODOS)[number][0]>("mes");
  const [de, ate] = periodo(per), r = resultado(estado, de, ate);
  const Abas = ({ lista, valor, onChange, rotulo }: { lista: readonly (readonly [string, string])[]; valor: string; onChange: (v: never) => void; rotulo: string }) => (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label={rotulo}>
      {lista.map(([id, r]) => (
        <button key={id} type="button" role="tab" aria-selected={valor === id} onClick={() => onChange(id as never)}
          className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${valor === id ? "border-modulo bg-modulo text-white" : "border-slate-200 hover:border-modulo"}`}>{r}</button>
      ))}
    </div>
  );
  const linha = (rot: string, v: number, o: { b?: boolean; neg?: boolean; i?: boolean; m?: boolean } = {}) => (
    <div key={rot} className={`flex justify-between border-t border-slate-100 py-1.5 ${o.b ? "text-base font-extrabold" : "text-sm"}`}>
      <span className={`${o.i ? "pl-4" : ""} ${o.m ? "text-slate-500" : ""}`}>{rot}</span>
      <span className={`num ${o.neg ? "text-red-600" : ""}`}>{o.neg && v ? "− " : ""}{brl(v)}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Abas lista={SUBS} valor={sub} onChange={setSub as (v: never) => void} rotulo="Financeiro" />
      {sub !== "contas" && <Abas lista={PERIODOS} valor={per} onChange={setPer as (v: never) => void} rotulo="Período" />}

      {sub === "dre" && (
        <Card className="p-4">
          {linha("Vendas (receita bruta, já com descontos)", r.bruto, { b: true })}
          {linha(`Comissão marketplace (${estado.loja.comMkt}%)`, r.comissao, { neg: true, i: true })}
          {linha("CMV — custo dos insumos vendidos", r.cmv, { neg: true, i: true })}
          {linha("Lucro bruto", r.lucroBruto, { b: true })}
          {Object.entries(r.porCat).map(([k, v]) => linha(k, v, { neg: true, i: true, m: true }))}
          {linha("Despesas pagas", r.desp, { neg: true })}
          {linha("Resultado do período", r.resultado, { b: true })}
          <p className="mt-2 text-xs text-slate-500">Margem bruta {r.bruto ? ((r.lucroBruto / r.bruto) * 100).toFixed(1) : 0}% · compras de estoque não entram como despesa (entram pelo CMV quando vendidas).</p>
        </Card>
      )}

      {sub === "fluxo" && <Fluxo estado={estado} r={r} />}
      {sub === "contas" && <Contas estado={estado} mudar={mudar} />}
    </div>
  );
}

function Fluxo({ estado, r }: { estado: Estado; r: ReturnType<typeof resultado> }) {
  const entradas = r2(Object.values(r.entradas).reduce((t, v) => t + v, 0));
  const limite = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const prox = estado.contas.filter((c) => !c.pago && c.venc <= limite).sort((a, b) => (a.venc > b.venc ? 1 : -1));
  const kpi = (t: string, v: number, cor = "") => <Card className="p-4"><p className="text-xs font-semibold text-slate-500">{t}</p><p className={`num text-2xl font-extrabold ${cor}`}>{brl(v)}</p></Card>;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpi("Entradas (vendas)", entradas, "text-emerald-700")}{kpi("Outras entradas", r.outras)}{kpi("Saídas pagas", r.saidas, "text-red-600")}{kpi("Saldo do período", r2(entradas + r.outras - r.saidas))}
      </div>
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-bold">Entradas por forma</h3>
        {Object.entries(r.entradas).map(([k, v]) => <div key={k} className="num flex justify-between py-0.5 text-sm"><span>{rotuloMeio(k as Meio)}</span><b>{brl(v)}</b></div>)}
        {entradas === 0 && <p className="text-sm text-slate-500">Sem vendas.</p>}
      </Card>
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-bold">Vencendo em até 7 dias (e atrasadas)</h3>
        {prox.map((c) => <div key={c.id} className="flex justify-between py-0.5 text-sm"><span>{c.desc} <span className="text-slate-500">· {dataBR(c.venc)}</span></span><b className={`num ${c.tipo === "pagar" ? "text-red-600" : "text-emerald-700"}`}>{c.tipo === "pagar" ? "−" : "+"} {brl(c.valor)}</b></div>)}
        {prox.length === 0 && <p className="text-sm text-slate-500">Nada vencendo.</p>}
      </Card>
    </>
  );
}

function Contas({ estado, mudar }: { estado: Estado; mudar: Mudar }) {
  const [f, setF] = useState<"pagar" | "receber">("pagar");
  const [nova, setNova] = useState<Partial<Conta> & { valorTxt?: string } | null>(null);
  const lista = estado.contas.filter((c) => c.tipo === f).sort((a, b) => (a.venc > b.venc ? 1 : -1));
  const aberto = r2(lista.filter((c) => !c.pago).reduce((t, c) => t + c.valor, 0));
  function salvar() {
    const v = num(nova?.valorTxt ?? ""), d = nova?.desc?.trim();
    if (!d || !v) return notify("Informe a descrição e o valor.", "erro");
    mudar((e) => ({ ...e, contas: [...e.contas, { id: novoId(), tipo: nova?.tipo ?? "pagar", desc: d, valor: r2(v), venc: nova?.venc || hojeISO(), pago: false, cat: nova?.cat?.trim() }] }));
    setF(nova?.tipo ?? "pagar"); setNova(null);
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">{(["pagar", "receber"] as const).map((k) => <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${f === k ? "border-modulo bg-modulo text-white" : "border-slate-200"}`}>{k === "pagar" ? "A pagar" : "A receber"}</button>)}</div>
        <span className="num flex-1 text-right text-sm">Em aberto: <b>{brl(aberto)}</b></span>
        <Button type="button" onClick={() => setNova({ tipo: f, venc: hojeISO() })}><Plus size={16} aria-hidden /> Conta</Button>
      </div>
      <Card className="divide-y divide-slate-100">
        {lista.map((c) => {
          const vencida = !c.pago && c.venc < hojeISO();
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1"><b className="text-sm">{c.desc}</b><p className="text-xs text-slate-500">{c.cat} · vence {dataBR(c.venc)}</p></div>
              <b className="num">{brl(c.valor)}</b>
              {c.pago ? <span className="rounded-full bg-emerald-100 px-2 text-xs font-bold text-emerald-800">{f === "pagar" ? "pago" : "recebido"} {c.pagoEm ? new Date(c.pagoEm).toLocaleDateString("pt-BR") : ""}</span> : (
                <>
                  {vencida && <span className="rounded-full bg-red-100 px-2 text-xs font-bold text-red-700">vencida</span>}
                  <Button type="button" variant="secondary" onClick={() => mudar((e) => ({ ...e, contas: e.contas.map((x) => (x.id === c.id ? { ...x, pago: true, pagoEm: new Date().toISOString() } : x)) }))}>{f === "pagar" ? "Pagar" : "Receber"}</Button>
                </>
              )}
              <button type="button" aria-label="Excluir conta" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => { if (window.confirm("Excluir esta conta?")) mudar((e) => ({ ...e, contas: e.contas.filter((x) => x.id !== c.id) })); }}><Trash2 size={16} aria-hidden /></button>
            </div>
          );
        })}
        {lista.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Nenhuma conta.</p>}
      </Card>
      <Modal open={!!nova} onClose={() => setNova(null)} title="Nova conta">
        {nova && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo"><select className="input" value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value as Conta["tipo"] })}><option value="pagar">A pagar</option><option value="receber">A receber</option></select></Field>
              <Field label="Categoria"><input className="input" list="cats-fin" placeholder="Aluguel, Energia…" onChange={(e) => setNova({ ...nova, cat: e.target.value })} /><datalist id="cats-fin">{["Aluguel", "Energia", "Água", "Salários", "Marketing", "Manutenção", "Impostos"].map((c) => <option key={c} value={c} />)}</datalist></Field>
            </div>
            <Field label="Descrição"><input className="input" autoFocus onChange={(e) => setNova({ ...nova, desc: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Valor (R$)"><input className="input" inputMode="decimal" onChange={(e) => setNova({ ...nova, valorTxt: e.target.value })} /></Field>
              <Field label="Vencimento"><input className="input" type="date" value={nova.venc} onChange={(e) => setNova({ ...nova, venc: e.target.value })} /></Field>
            </div>
            <div className="flex justify-end"><Button type="button" onClick={salvar}>Salvar</Button></div>
          </div>
        )}
      </Modal>
    </>
  );
}
