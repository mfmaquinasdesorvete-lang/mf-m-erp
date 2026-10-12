// Montar o prato: escolher os sabores (com acréscimo dos premium), os complementos de cada grupo e, nos itens por peso, o peso da balança.
import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { brl } from "@/lib/format";
import { novoId, precoItem, r2, type Estado, type ItemPedido, type ProdutoMenu } from "@/lib/sorveteria";

const num = (s: string) => { const v = Number(s.replace(",", ".")); return Number.isFinite(v) && v > 0 ? v : 0; };

export function MontarItem({ produto, estado, inicial, onConfirmar, onClose }: {
  produto: ProdutoMenu; estado: Estado; inicial?: ItemPedido; onConfirmar: (i: ItemPedido) => void; onClose: () => void;
}) {
  const grupos = produto.grupos.map((id) => estado.grupos.find((g) => g.id === id)).filter((g) => !!g);
  const [sabores, setSabores] = useState<Record<string, number>>(() =>
    Object.fromEntries(estado.sabores.map((s) => [s.id, inicial ? inicial.sabores.filter((n) => n === s.nome).length : 0]).filter(([, n]) => n)));
  const [comp, setComp] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(grupos.flatMap((g) => g!.itens.map((c) => [c.id, !!inicial?.complementos.some((x) => x.nome === c.nome)]))));
  const [qtd, setQtd] = useState(inicial?.qtd ?? 1);
  const [brutoTxt, setBrutoTxt] = useState(inicial?.pesoG != null ? String(inicial.pesoG + estado.loja.taraG) : "");
  const [obs, setObs] = useState(inicial?.obs ?? "");

  const nSabores = Object.values(sabores).reduce((s, n) => s + n, 0);
  const escolhidos = estado.sabores.flatMap((s) => Array(sabores[s.id] ?? 0).fill(s));
  const compEscolhidos = grupos.flatMap((g) => g!.itens.filter((c) => comp[c.id]));
  const pesoG = Math.max(0, Math.round(num(brutoTxt) - estado.loja.taraG));
  const unit = precoItem(produto, escolhidos, compEscolhidos, pesoG);

  const erros: string[] = [];
  if (produto.sabores > 0 && nSabores !== produto.sabores) erros.push(`Escolha ${produto.sabores} ${produto.sabores === 1 ? "sabor" : "sabores"} (${nSabores}/${produto.sabores})`);
  for (const g of grupos) {
    const n = g!.itens.filter((c) => comp[c.id]).length;
    if (n < g!.min) erros.push(`${g!.nome}: escolha pelo menos ${g!.min}`);
  }
  if (produto.tipo === "peso" && pesoG <= 0) erros.push("Informe o peso da balança");

  const somaSabor = (id: string, d: number) => setSabores((m) => {
    const n = Math.max(0, (m[id] ?? 0) + d);
    return nSabores + d > produto.sabores && d > 0 ? m : { ...m, [id]: n };
  });
  const alternar = (g: NonNullable<(typeof grupos)[number]>, id: string) => setComp((m) => {
    if (m[id]) return { ...m, [id]: false };
    const usados = g.itens.filter((c) => m[c.id]).length;
    if (usados >= g.max) {
      // grupo de escolha única troca a opção; nos demais o limite vale
      return g.max === 1 ? { ...m, ...Object.fromEntries(g.itens.map((c) => [c.id, c.id === id])) } : m;
    }
    return { ...m, [id]: true };
  });

  const confirmar = () => {
    onConfirmar({
      id: inicial?.id ?? novoId(), produto_id: produto.id, nome: produto.nome, qtd: produto.tipo === "peso" ? 1 : qtd, unit,
      sabores: escolhidos.map((s) => s.nome), complementos: compEscolhidos.map((c) => ({ nome: c.nome, preco: c.preco })),
      pesoG: produto.tipo === "peso" ? pesoG : undefined, obs: obs.trim() || undefined,
      saborIds: escolhidos.map((s) => s.id), complementoIds: compEscolhidos.map((c) => c.id),
    });
  };

  const porTotal = useMemo(() => r2(unit * (produto.tipo === "peso" ? 1 : qtd)), [unit, qtd, produto.tipo]);

  return (
    <Modal open onClose={onClose} title={produto.nome} wide>
      <div className="grid gap-5 md:grid-cols-[1fr_16rem]">
        <div className="space-y-5">
          {produto.tipo === "peso" && (
            <section>
              <h3 className="mb-2 text-sm font-bold">Peso na balança</h3>
              <div className="flex flex-wrap items-center gap-2">
                <input className="input w-36 text-right text-lg font-bold" inputMode="decimal" autoFocus placeholder="0" value={brutoTxt}
                  aria-label="Peso em gramas" onChange={(e) => setBrutoTxt(e.target.value.replace(/[^\d,.]/g, ""))} />
                <span className="text-sm text-slate-500">gramas</span>
                {estado.loja.taraG > 0 && <span className="text-sm text-slate-500">− pote {estado.loja.taraG} g = <b className="text-fg">{pesoG} g</b></span>}
              </div>
              <p className="mt-1 text-xs text-slate-500">{brl(produto.preco)} por kg{pesoG > 0 && ` · ${brl(r2((pesoG / 1000) * produto.preco))} de sorvete`}</p>
            </section>
          )}

          {produto.sabores > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-bold">Sabores <span className="font-normal text-slate-500">({nSabores}/{produto.sabores})</span></h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {estado.sabores.map((s) => {
                  const n = sabores[s.id] ?? 0;
                  return (
                    <div key={s.id} className={`flex items-center gap-1 rounded-xl border p-1.5 ${n ? "border-modulo bg-modulo/10" : "border-slate-200"} ${s.esgotado ? "opacity-40" : ""}`}>
                      <button type="button" disabled={s.esgotado} onClick={() => somaSabor(s.id, 1)} className="min-w-0 flex-1 px-1 py-1.5 text-left text-sm font-semibold leading-tight disabled:cursor-not-allowed">
                        {s.nome}
                        {s.acrescimo > 0 && <span className="block text-[11px] font-normal text-slate-500">+ {brl(s.acrescimo)}</span>}
                        {s.esgotado && <span className="block text-[11px] font-normal text-red-600">em falta</span>}
                      </button>
                      {n > 0 && (
                        <>
                          <button type="button" aria-label={`Menos ${s.nome}`} onClick={() => somaSabor(s.id, -1)} className="rounded-lg p-2 hover:bg-slate-100"><Minus size={14} aria-hidden /></button>
                          <b className="w-4 text-center text-sm">{n}</b>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {grupos.map((g) => g && (
            <section key={g.id}>
              <h3 className="mb-2 text-sm font-bold">
                {g.nome} <span className="font-normal text-slate-500">{g.min > 0 ? `obrigatório · ` : ""}{g.max === 1 ? "escolha 1" : `até ${g.max}`}</span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {g.itens.map((c) => (
                  <button key={c.id} type="button" disabled={c.esgotado} aria-pressed={!!comp[c.id]} onClick={() => alternar(g, c.id)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${comp[c.id] ? "border-modulo bg-modulo text-white" : "border-slate-200 hover:border-modulo"}`}>
                    {c.nome}{c.preco > 0 && <span className="ml-1 font-normal opacity-80">+ {brl(c.preco)}</span>}{c.esgotado && " (em falta)"}
                  </button>
                ))}
              </div>
            </section>
          ))}

          <Field label="Observação (ex.: sem canudo, separar a calda)">
            <input className="input" value={obs} maxLength={80} onChange={(e) => setObs(e.target.value)} />
          </Field>
        </div>

        <aside className="space-y-3 md:sticky md:top-0 md:self-start">
          {produto.tipo !== "peso" && (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 p-2">
              <button type="button" aria-label="Diminuir" className="rounded-lg p-2.5 hover:bg-slate-100" onClick={() => setQtd((q) => Math.max(1, q - 1))}><Minus size={18} aria-hidden /></button>
              <span className="text-2xl font-extrabold" aria-live="polite">{qtd}</span>
              <button type="button" aria-label="Aumentar" className="rounded-lg p-2.5 hover:bg-slate-100" onClick={() => setQtd((q) => q + 1)}><Plus size={18} aria-hidden /></button>
            </div>
          )}
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <div className="flex justify-between"><span>Valor do item</span><b>{brl(unit)}</b></div>
            <div className="mt-1 flex items-baseline justify-between border-t border-slate-200 pt-2"><span className="font-bold">Total</span><b className="text-xl">{brl(porTotal)}</b></div>
          </div>
          {erros.length > 0 && <ul className="space-y-0.5 text-xs text-amber-800">{erros.map((e) => <li key={e}>• {e}</li>)}</ul>}
          <Button type="button" className="w-full !py-3 text-base" disabled={erros.length > 0} onClick={confirmar}>{inicial ? "Salvar item" : "Adicionar"}</Button>
        </aside>
      </div>
    </Modal>
  );
}
