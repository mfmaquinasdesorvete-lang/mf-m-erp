// Prestação de contas do adiantamento para funcionário: quanto foi em cada coisa (combustível, correios…), o troco que
// voltou e os comprovantes (anexos da própria conta). Os gastos entram no DRE; a conta do adiantamento fica fora.
import { useEffect, useMemo, useState } from "react";
import { Fuel, Package, Plus, Receipt, Trash2 } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { Anexos } from "@/components/Anexos";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, hoje } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { ehAdiantamento, resumoPrestacao, type GastoAdiantamento } from "@/lib/adiantamento";
import { rotuloCategoria } from "@/lib/dre";
import { useCategorias } from "./CategoriaRateio";

export type Prestacao = { conta_pagar_id: string; troco: number; observacao: string | null; prestado_em: string; prestado_por_nome: string | null };
type Linha = { categoria: string; valor: string; descricao: string; data: string };

const num = (s: string) => { const t = s.trim(); const v = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); return Number.isFinite(v) ? v : NaN; };
const ATALHOS = [{ rotulo: "Combustível", categoria: "combustível", Icon: Fuel }, { rotulo: "Correios", categoria: "correios", Icon: Package }];

export const usePrestacoes = () => useRows<Prestacao>("adiantamento_prestacoes", { order: "prestado_em", ascending: false });
export const useGastosAdiantamento = () => useRows<GastoAdiantamento & { id: string }>("adiantamento_gastos", { order: "data", ascending: true });

/** Selo na lista: o que falta no adiantamento (prestar contas) ou como ficou. */
export function SeloAdiantamento({ conta }: { conta: { id: string; categoria?: string | null; status: string } }) {
  const { data: prest = [] } = usePrestacoes();
  if (!ehAdiantamento(conta.categoria)) return null;
  const p = prest.find((x) => x.conta_pagar_id === conta.id);
  return p ? <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-2xs font-bold text-emerald-800">Contas prestadas</span>
    : <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-2xs font-bold text-amber-800">{conta.status === "pago" ? "Falta prestar contas" : "Adiantamento"}</span>;
}

export function PrestarContas({ conta, onClose }: { conta: { id: string; valor: number; valor_pago?: number | null; status: string; descricao: string; fornecedor?: { nome?: string | null } | null }; onClose: () => void }) {
  const invalidar = useInvalidate();
  const { nome } = usePerfil();
  const { data: cats = [] } = useCategorias();
  const { data: prest = [] } = usePrestacoes();
  const { data: todos = [], isSuccess } = useGastosAdiantamento();
  const anterior = prest.find((p) => p.conta_pagar_id === conta.id);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [troco, setTroco] = useState("");
  const [obs, setObs] = useState("");
  const [carregou, setCarregou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const adiantado = Number(conta.valor_pago ?? conta.valor);
  const despesas = cats.filter((c) => c.tipo === "despesa" && c.ativo && !ehAdiantamento(c.nome));

  useEffect(() => {
    if (carregou || !isSuccess) return;
    const meus = todos.filter((g) => g.conta_pagar_id === conta.id);
    setLinhas(meus.length ? meus.map((g) => ({ categoria: g.categoria, valor: String(g.valor).replace(".", ","), descricao: g.descricao ?? "", data: g.data }))
      : [{ categoria: "", valor: "", descricao: "", data: hoje() }]);
    setTroco(anterior ? String(anterior.troco).replace(".", ",") : "");
    setObs(anterior?.observacao ?? "");
    setCarregou(true);
  }, [isSuccess, todos, carregou, conta.id, anterior]);

  const validas = linhas.filter((l) => l.categoria && num(l.valor) > 0);
  const r = useMemo(() => resumoPrestacao(adiantado, validas.map((l) => ({ valor: num(l.valor) })), troco.trim() ? num(troco) : 0), [adiantado, validas, troco]);
  const set = (i: number, p: Partial<Linha>) => setLinhas((ls) => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const atalho = (categoria: string) => setLinhas((ls) => {
    const vazia = ls.findIndex((l) => !l.categoria && !l.valor);
    const nova = { categoria, valor: "", descricao: "", data: hoje() };
    return vazia >= 0 ? ls.map((l, k) => (k === vazia ? nova : l)) : [...ls, nova];
  });

  async function salvar() {
    if (linhas.some((l) => (l.categoria || l.valor) && !(l.categoria && num(l.valor) > 0))) return notify("Cada gasto precisa de tipo e valor", "erro");
    if (!validas.length) return notify("Lance pelo menos um gasto", "erro");
    const t = troco.trim() ? num(troco) : 0;
    if (!Number.isFinite(t) || t < 0) return notify("Troco inválido", "erro");
    if (r.diferencaTroco !== 0 && !obs.trim()) return notify(`O troco deveria ser ${brl(r.trocoEsperado)}: explique a diferença na observação`, "erro");
    setSalvando(true);
    try {
      const del = await supabase.from("adiantamento_gastos").delete().eq("conta_pagar_id", conta.id);
      if (del.error) throw del.error;
      const ins = await supabase.from("adiantamento_gastos").insert(validas.map((l) => ({ conta_pagar_id: conta.id, categoria: l.categoria, valor: num(l.valor), descricao: l.descricao.trim() || null, data: l.data || hoje() })));
      if (ins.error) throw ins.error;
      const up = await supabase.from("adiantamento_prestacoes").upsert({ conta_pagar_id: conta.id, troco: t, observacao: obs.trim() || null, prestado_em: new Date().toISOString(), prestado_por_nome: nome || null });
      if (up.error) throw up.error;
      invalidar("adiantamento_gastos", "adiantamento_prestacoes");
      notify("Prestação de contas salva");
      onClose();
    } catch (e) { notifyError(e); } finally { setSalvando(false); }
  }

  return (
    <Modal open onClose={onClose} title="Prestar contas do adiantamento" wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
          <span className="text-sm"><b>{conta.fornecedor?.nome ?? conta.descricao}</b> levou <b className="num">{brl(adiantado)}</b>{conta.status !== "pago" && <span className="ml-1 text-xs text-amber-700">(o pagamento ainda não foi registrado)</span>}</span>
          <span className="text-sm">Gastou <b className="num">{brl(r.gasto)}</b> · {r.aReembolsar ? <>a empresa deve <b className="num text-red-700">{brl(r.aReembolsar)}</b></> : <>troco <b className="num">{brl(r.trocoEsperado)}</b></>}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {ATALHOS.map((a) => <Button key={a.categoria} type="button" variant="secondary" className="!min-h-0 !py-1.5 text-sm" onClick={() => atalho(a.categoria)}><a.Icon size={14} /> {a.rotulo}</Button>)}
          <Button type="button" variant="ghost" className="!min-h-0 !py-1.5 text-sm" onClick={() => setLinhas((l) => [...l, { categoria: "", valor: "", descricao: "", data: hoje() }])}><Plus size={14} /> Outro gasto</Button>
        </div>

        <ul className="space-y-2">
          {linhas.map((l, i) => (
            <li key={i} className="grid grid-cols-2 gap-2 rounded-xl p-2 ring-1 ring-slate-200 sm:grid-cols-[1.3fr_0.8fr_0.9fr_1.6fr_auto]">
              <select className="input" value={l.categoria} onChange={(e) => set(i, { categoria: e.target.value })} aria-label="Tipo do gasto">
                <option value="">Tipo do gasto…</option>
                {despesas.map((c) => <option key={c.id} value={c.nome}>{rotuloCategoria(c.nome)}</option>)}
              </select>
              <input className="input num" inputMode="decimal" placeholder="Valor" value={l.valor} onChange={(e) => set(i, { valor: e.target.value })} aria-label="Valor" />
              <input className="input" type="date" value={l.data} onChange={(e) => set(i, { data: e.target.value })} aria-label="Data" />
              <input className="input" maxLength={200} placeholder="O quê (ex.: postagem de 12 caixas)" value={l.descricao} onChange={(e) => set(i, { descricao: e.target.value })} aria-label="Descrição" />
              <Button type="button" variant="ghost" className="!min-h-0 justify-self-end" aria-label="Tirar este gasto" onClick={() => setLinhas((ls) => ls.filter((_, k) => k !== i))}><Trash2 size={15} /></Button>
            </li>
          ))}
        </ul>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`Troco devolvido (esperado ${brl(r.trocoEsperado)})`}><input className="input num" inputMode="decimal" placeholder="0,00" value={troco} onChange={(e) => setTroco(e.target.value)} /></Field>
          <Field label={r.diferencaTroco ? "Observação (obrigatória: o troco não bate)" : "Observação"}><input className="input" maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
        </div>

        <div className="rounded-xl p-3 ring-1 ring-slate-200">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Receipt size={15} /> Comprovantes (fotos dos recibos do posto e dos Correios)</p>
          <Anexos entidade="conta_pagar" id={conta.id} titulo="Comprovantes do adiantamento" />
        </div>

        {anterior && <p className="text-xs text-slate-500">Prestado em {new Date(anterior.prestado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{anterior.prestado_por_nome ? ` por ${anterior.prestado_por_nome}` : ""}. Salvar de novo substitui.</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
          <Button type="button" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar prestação de contas"}</Button>
        </div>
      </div>
    </Modal>
  );
}
