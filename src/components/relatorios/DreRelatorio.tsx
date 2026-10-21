// Relatórios → DRE: o DRE visual do Financeiro (notas, contas e extratos; SC, SP e consolidado) numa aba só dele, com as
// observações de cada mês logo acima: quem lê anota o que explica o número (compra grande, 13º, mês fraco…).
import { useMemo, useState, type FormEvent } from "react";
import { MessageSquareText, Trash2 } from "lucide-react";
import { Button, Section } from "@/components/ui";
import { DreComExtratos } from "@/components/financeiro/Dre";
import { useGastosAdiantamento } from "@/components/financeiro/Adiantamento";
import { confirmar } from "@/components/Dialogos";
import { gastosParaDre } from "@/lib/adiantamento";
import { usePerfil } from "@/lib/auth";
import { useInvalidate, useRows } from "@/lib/data";
import { dataHoraBR, hoje } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { useUnidade } from "@/lib/unidade";
import type { LancDre } from "@/lib/dre";

type Obs = { id: string; mes: string; unidade_id: string | null; texto: string; autor: string; autor_nome: string | null; created_at: string };
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeMes = (am: string) => `${MESES[Number(am.slice(5, 7)) - 1]} de ${am.slice(0, 4)}`;

/** Os últimos n meses (AAAA-MM), do atual para trás. */
export function mesesRecentes(dia: string, n: number) {
  const a = Number(dia.slice(0, 4)), m = Number(dia.slice(5, 7)) - 1;
  return Array.from({ length: n }, (_, i) => { const d = new Date(a, m - i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
}

export function DreRelatorio() {
  const { data: receber = [] } = useRows<LancDre>("contas_receber", { key: ["dre-relatorio"] });
  const { data: pagar = [] } = useRows<LancDre>("contas_pagar", { key: ["dre-relatorio"] });
  const { data: gastos = [] } = useGastosAdiantamento();
  const lancamentos = useMemo<LancDre[]>(() => [
    ...receber.map((c) => ({ ...c, tipo: "receber" as const })),
    ...pagar.map((c) => ({ ...c, tipo: "pagar" as const })),
    ...gastosParaDre(gastos, pagar as any),
  ], [receber, pagar, gastos]);
  return (
    <div className="space-y-4">
      <Observacoes />
      <DreComExtratos lancamentos={lancamentos} />
    </div>
  );
}

function Observacoes() {
  const perfil = usePerfil();
  const { unidades, atual } = useUnidade();
  const invalidar = useInvalidate();
  const meses = mesesRecentes(hoje(), 12);
  const [mes, setMes] = useState(meses[0]);
  const [texto, setTexto] = useState("");
  const [gravando, setGravando] = useState(false);
  const { data: obs = [] } = useRows<Obs>("dre_observacoes", { order: "created_at", ascending: false });
  const nomeUnidade = (id: string | null) => (id ? unidades.find((u) => u.id === id)?.codigo || unidades.find((u) => u.id === id)?.nome : null) ?? "Todas";
  const doMes = obs.filter((o) => o.mes === mes);
  const outros = obs.filter((o) => o.mes !== mes).slice(0, 6);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setGravando(true);
    try {
      const { error } = await supabase.from("dre_observacoes").insert({ mes, unidade_id: atual ?? null, texto: texto.trim(), autor_nome: perfil.nome });
      if (error) throw error;
      setTexto("");
      notify("Observação guardada");
      invalidar("dre_observacoes");
    } catch (err) { notifyError(err); } finally { setGravando(false); }
  }
  async function apagar(o: Obs) {
    if (!(await confirmar("Apagar esta observação?"))) return;
    const { error } = await supabase.from("dre_observacoes").delete().eq("id", o.id);
    if (error) return notifyError(error);
    invalidar("dre_observacoes");
  }

  const Item = ({ o }: { o: Obs }) => (
    <li className="flex gap-2 rounded-lg border border-slate-200 bg-surface p-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap text-fg">{o.texto}</p>
        <p className="mt-1 text-2xs text-slate-500">{nomeMes(o.mes)} · {nomeUnidade(o.unidade_id)} · {o.autor_nome ?? "usuário do ERP"} · {dataHoraBR(o.created_at)}</p>
      </div>
      {(o.autor === perfil.user_id || perfil.papel === "admin") && (
        <button type="button" onClick={() => apagar(o)} className="self-start rounded p-1 text-red-600 hover:bg-red-50" aria-label="Apagar observação"><Trash2 size={15} /></button>
      )}
    </li>
  );

  return (
    <Section title="Observações do DRE" actions={<MessageSquareText size={18} className="text-modulo-texto" aria-hidden />}>
      <form onSubmit={salvar} className="mb-3 flex flex-wrap gap-2">
        <select className="input w-full sm:w-48" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês da observação">
          {meses.map((m) => <option key={m} value={m}>{nomeMes(m)}</option>)}
        </select>
        <input className="input min-w-0 flex-1 basis-60" value={texto} maxLength={2000} onChange={(e) => setTexto(e.target.value)}
          placeholder="O que explica o número deste mês? (ex.: compra grande de compressores)" aria-label="Observação" />
        <Button type="submit" disabled={gravando || !texto.trim()}>{gravando ? "Guardando…" : "Guardar"}</Button>
      </form>
      {doMes.length ? <ul className="space-y-2">{doMes.map((o) => <Item key={o.id} o={o} />)}</ul>
        : <p className="text-sm text-slate-500">Nenhuma observação em {nomeMes(mes)}.</p>}
      {outros.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-600">Outros meses ({outros.length} mais recentes)</summary>
          <ul className="mt-2 space-y-2">{outros.map((o) => <Item key={o.id} o={o} />)}</ul>
        </details>
      )}
    </Section>
  );
}
