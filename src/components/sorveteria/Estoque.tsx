// Estoque de insumos e ficha técnica: o que cada produto, sabor e complemento consome. A venda baixa sozinha e o custo vira CMV.
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { brl } from "@/lib/format";
import { notify } from "@/lib/notify";
import { custoFicha, insumosBaixos, insumoDe, novoId, r2, type Estado, type Insumo, type LinhaFicha } from "@/lib/sorveteria";

type Mudar = (f: (e: Estado) => Estado) => void;
const num = (s: string) => { const v = Number(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) && v >= 0 ? v : 0; };
const numPonto = (s: string) => { const v = Number(s.replace(",", ".")); return Number.isFinite(v) && v >= 0 ? v : 0; };
const fmtQ = (q: number, u: string) => `${q.toLocaleString("pt-BR", { maximumFractionDigits: Math.abs(q) < 1 ? 4 : 1 })} ${u}`;
const hoje = () => new Date().toISOString().slice(0, 10);

export function Estoque({ estado, mudar }: { estado: Estado; mudar: Mudar }) {
  const [sub, setSub] = useState<"insumos" | "ficha">("insumos");
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {([["insumos", "Insumos"], ["ficha", "Ficha técnica"]] as const).map(([id, r]) => (
          <button key={id} type="button" role="tab" aria-selected={sub === id} onClick={() => setSub(id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${sub === id ? "border-modulo bg-modulo text-white" : "border-slate-200 hover:border-modulo"}`}>{r}</button>
        ))}
      </div>
      {sub === "insumos" ? <Insumos estado={estado} mudar={mudar} /> : <Ficha estado={estado} mudar={mudar} />}
    </div>
  );
}

function Insumos({ estado, mudar }: { estado: Estado; mudar: Mudar }) {
  const [novo, setNovo] = useState<Partial<Insumo> | null>(null);
  const [entrada, setEntrada] = useState<{ ins: Insumo; q: string; v: string; forn: string; pagar: boolean; venc: string } | null>(null);
  const [ajuste, setAjuste] = useState<{ ins: Insumo; q: string } | null>(null);
  const baixos = insumosBaixos(estado);

  function salvarNovo() {
    if (!novo?.nome?.trim()) return notify("Dê um nome ao insumo.", "erro");
    mudar((e) => ({ ...e, insumos: [...e.insumos, { id: novoId(), nome: novo.nome!.trim(), un: novo.un ?? "g", estoque: novo.estoque ?? 0, min: novo.min ?? 0, custo: novo.custo ?? 0 }] }));
    setNovo(null);
  }
  function registrarEntrada() {
    if (!entrada) return;
    const q = num(entrada.q), v = num(entrada.v);
    if (!q) return notify("Informe a quantidade.", "erro");
    mudar((e) => {
      const ins = insumoDe(e, entrada.ins.id)!, base = Math.max(0, ins.estoque);
      const custo = v ? Math.round(((base * ins.custo + v) / (base + q)) * 1e6) / 1e6 : ins.custo; // custo médio
      return {
        ...e, insumos: e.insumos.map((x) => (x.id === ins.id ? { ...x, estoque: r2(x.estoque + q), custo } : x)),
        contas: v && entrada.pagar ? [...e.contas, { id: novoId(), tipo: "pagar" as const, desc: `Compra de ${ins.nome}${entrada.forn ? " · " + entrada.forn : ""}`, valor: r2(v), venc: entrada.venc || hoje(), pago: false, cat: "Estoque" }] : e.contas,
      };
    });
    setEntrada(null); notify("Entrada registrada.");
  }
  function ajustar() {
    if (!ajuste || !ajuste.q.trim()) return;
    mudar((e) => ({ ...e, insumos: e.insumos.map((x) => (x.id === ajuste.ins.id ? { ...x, estoque: r2(num(ajuste.q)) } : x)) }));
    setAjuste(null);
  }

  return (
    <>
      {baixos.length > 0 && <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">⚠ Estoque baixo: {baixos.map((b) => b.nome).join(", ")}</p>}
      <div className="flex justify-end"><Button type="button" onClick={() => setNovo({ un: "g" })}><Plus size={16} aria-hidden /> Insumo</Button></div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-500"><th className="p-3">Insumo</th><th className="p-3 text-right">Saldo</th><th className="p-3 text-right">Mínimo</th><th className="p-3 text-right">Custo/un</th><th className="p-3" /></tr></thead>
          <tbody>
            {estado.insumos.map((i) => (
              <tr key={i.id} className="border-b border-slate-50">
                <td className="p-3 font-semibold">{i.nome} {i.estoque <= i.min && <span className="ml-1 rounded-full bg-red-100 px-2 text-xs font-bold text-red-700">baixo</span>}</td>
                <td className="num p-3 text-right">{fmtQ(i.estoque, i.un)}</td><td className="num p-3 text-right text-slate-500">{fmtQ(i.min, i.un)}</td><td className="num p-3 text-right">{brl(i.custo)}</td>
                <td className="whitespace-nowrap p-3 text-right">
                  <Button type="button" variant="secondary" className="!min-h-0 !px-2 !py-1 text-xs" onClick={() => setEntrada({ ins: i, q: "", v: "", forn: "", pagar: true, venc: hoje() })}>＋ Entrada</Button>{" "}
                  <Button type="button" variant="ghost" className="!min-h-0 !px-2 !py-1 text-xs" onClick={() => setAjuste({ ins: i, q: "" })}>Ajuste</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={!!novo} onClose={() => setNovo(null)} title="Novo insumo">
        {novo && (
          <div className="space-y-3">
            <Field label="Nome"><input className="input" autoFocus value={novo.nome ?? ""} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Unidade"><select className="input" value={novo.un} onChange={(e) => setNovo({ ...novo, un: e.target.value as Insumo["un"] })}><option>g</option><option>ml</option><option>un</option></select></Field>
              <Field label="Estoque inicial"><input className="input" inputMode="decimal" onChange={(e) => setNovo({ ...novo, estoque: num(e.target.value) })} /></Field>
              <Field label="Mínimo"><input className="input" inputMode="decimal" onChange={(e) => setNovo({ ...novo, min: num(e.target.value) })} /></Field>
            </div>
            <Field label="Custo por unidade (R$)"><input className="input" inputMode="decimal" placeholder="Ex.: 0,012 por g" onChange={(e) => setNovo({ ...novo, custo: numPonto(e.target.value) })} /></Field>
            <div className="flex justify-end"><Button type="button" onClick={salvarNovo}>Salvar</Button></div>
          </div>
        )}
      </Modal>

      <Modal open={!!entrada} onClose={() => setEntrada(null)} title={`Entrada de ${entrada?.ins.nome ?? ""}`}>
        {entrada && (
          <div className="space-y-3">
            <Field label={`Quantidade (${entrada.ins.un})`}><input className="input" inputMode="decimal" autoFocus value={entrada.q} onChange={(e) => setEntrada({ ...entrada, q: e.target.value })} /></Field>
            <Field label="Valor total da compra (R$)"><input className="input" inputMode="decimal" value={entrada.v} onChange={(e) => setEntrada({ ...entrada, v: e.target.value })} /></Field>
            <Field label="Fornecedor / observação"><input className="input" value={entrada.forn} onChange={(e) => setEntrada({ ...entrada, forn: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={entrada.pagar} onChange={(e) => setEntrada({ ...entrada, pagar: e.target.checked })} /> Lançar em contas a pagar</label>
            {entrada.pagar && <Field label="Vencimento"><input className="input" type="date" value={entrada.venc} onChange={(e) => setEntrada({ ...entrada, venc: e.target.value })} /></Field>}
            <div className="flex justify-end"><Button type="button" onClick={registrarEntrada}>Registrar entrada</Button></div>
          </div>
        )}
      </Modal>

      <Modal open={!!ajuste} onClose={() => setAjuste(null)} title={`Ajuste de ${ajuste?.ins.nome ?? ""}`}>
        {ajuste && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Saldo atual: {fmtQ(ajuste.ins.estoque, ajuste.ins.un)}. Informe o saldo contado (perda, quebra, inventário).</p>
            <Field label={`Saldo contado (${ajuste.ins.un})`}><input className="input" inputMode="decimal" autoFocus value={ajuste.q} onChange={(e) => setAjuste({ ...ajuste, q: e.target.value })} /></Field>
            <div className="flex justify-end"><Button type="button" onClick={ajustar}>Ajustar</Button></div>
          </div>
        )}
      </Modal>
    </>
  );
}

function Ficha({ estado, mudar }: { estado: Estado; mudar: Mudar }) {
  const [k, setK] = useState<"p" | "s" | "c">("p");
  const [edit, setEdit] = useState<{ chave: string; nome: string; linhas: LinhaFicha[] } | null>(null);
  const tipos = [["p", "Produtos"], ["s", "Sabores (por bola)"], ["c", "Complementos"]] as const;
  const lista: { id: string; nome: string; preco?: number; peso?: boolean; sabores?: number }[] =
    k === "p" ? estado.produtos.map((p) => ({ id: p.id, nome: p.nome, preco: p.preco, peso: p.tipo === "peso", sabores: p.sabores }))
      : k === "s" ? estado.sabores.map((s) => ({ id: s.id, nome: s.nome })) : estado.grupos.flatMap((g) => g.itens.map((i) => ({ id: i.id, nome: `${i.nome} (${g.nome})` })));
  const mediaSabor = estado.sabores.length ? estado.sabores.reduce((t, s) => t + custoFicha(estado, "s:" + s.id), 0) / estado.sabores.length : 0;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {tipos.map(([id, r]) => <button key={id} type="button" aria-pressed={k === id} onClick={() => setK(id)} className={`rounded-full border px-3 py-1 text-sm font-semibold ${k === id ? "border-modulo bg-modulo text-white" : "border-slate-200"}`}>{r}</button>)}
      </div>
      <p className="text-sm text-slate-600">A ficha diz o que cada item consome. Ao vender, o estoque baixa sozinho e o custo (CMV) entra no resultado.</p>
      <Card className="divide-y divide-slate-100">
        {lista.map((x) => {
          const chave = `${k}:${x.id}`, c = custoFicha(estado, chave), custo = k === "p" ? c * (x.peso ? 1000 : 1) + (x.sabores ?? 0) * mediaSabor : c;
          const margem = k === "p" && x.preco ? ((x.preco - custo) / x.preco) * 100 : null;
          return (
            <div key={chave} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
              <b className="min-w-0 flex-1 text-sm">{x.nome}</b>
              <span className="text-xs text-slate-500">{(estado.receitas[chave] ?? []).map((l) => `${fmtQ(l.q, insumoDe(estado, l.i)?.un ?? "")} ${insumoDe(estado, l.i)?.nome ?? "?"}`).join(" · ") || "sem ficha"}</span>
              <span className="num text-sm">{k === "p" ? "custo " : ""}{brl(custo)}{x.peso ? "/kg" : ""}</span>
              {margem != null && <span className={`rounded-full px-2 text-xs font-bold ${margem < 40 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"}`}>{margem.toFixed(0)}% margem</span>}
              <Button type="button" variant="secondary" className="!min-h-0 !px-3 !py-1 text-xs" onClick={() => setEdit({ chave, nome: x.nome, linhas: (estado.receitas[chave] ?? []).map((l) => ({ ...l })) })}>Editar</Button>
            </div>
          );
        })}
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Ficha técnica · ${edit?.nome ?? ""}`}>
        {edit && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Quantidade consumida por {edit.chave.startsWith("s:") ? "bola" : edit.chave.startsWith("p:") && estado.produtos.find((p) => p.id === edit.chave.slice(2))?.tipo === "peso" ? "grama vendida" : "unidade vendida"}.</p>
            {edit.linhas.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <select className="input flex-1" value={l.i} onChange={(e) => setEdit({ ...edit, linhas: edit.linhas.map((x, n) => (n === i ? { ...x, i: e.target.value } : x)) })}>
                  {estado.insumos.map((x) => <option key={x.id} value={x.id}>{x.nome} ({x.un})</option>)}
                </select>
                <input className="input w-28 text-right" inputMode="decimal" aria-label="Quantidade" defaultValue={String(l.q).replace(".", ",")} onChange={(e) => setEdit({ ...edit, linhas: edit.linhas.map((x, n) => (n === i ? { ...x, q: numPonto(e.target.value) } : x)) })} />
                <button type="button" aria-label="Remover" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setEdit({ ...edit, linhas: edit.linhas.filter((_, n) => n !== i) })}><Trash2 size={16} aria-hidden /></button>
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={() => estado.insumos[0] && setEdit({ ...edit, linhas: [...edit.linhas, { i: estado.insumos[0].id, q: 0 }] })}><Plus size={14} aria-hidden /> Insumo</Button>
            <div className="flex justify-end"><Button type="button" onClick={() => { mudar((e) => ({ ...e, receitas: { ...e.receitas, [edit.chave]: edit.linhas.filter((l) => l.q > 0) } })); setEdit(null); }}>Salvar ficha</Button></div>
          </div>
        )}
      </Modal>
    </>
  );
}
