// Campos do plano de contas nos formulários do financeiro: categoria (receita ou despesa) e a divisão do
// lançamento entre centros de custo (percentuais somando 100%).
import { Plus, X } from "lucide-react";
import { Button, Field } from "@/components/ui";
import { useRows } from "@/lib/data";
import type { CategoriaFin, GrupoDre, Rateio } from "@/lib/dre";

export type Categoria = CategoriaFin & { id: string; ativo: boolean; ordem: number };
export type CentroCusto = { id: string; nome: string; descricao: string | null; ativo: boolean };

export const useCategorias = () => useRows<Categoria>("categorias_financeiras", { order: "ordem", ascending: true });
export const useCentros = () => useRows<CentroCusto>("centros_custo", { order: "nome", ascending: true });

export const GRUPOS: { value: GrupoDre; label: string; tipo: "receita" | "despesa" | "ambos" }[] = [
  { value: "receita", label: "Receita bruta", tipo: "receita" },
  { value: "receita_financeira", label: "Receita financeira", tipo: "receita" },
  { value: "deducao", label: "Impostos e deduções", tipo: "despesa" },
  { value: "custo", label: "Custos", tipo: "despesa" },
  { value: "despesa_operacional", label: "Despesas operacionais", tipo: "despesa" },
  { value: "despesa_financeira", label: "Despesas financeiras", tipo: "despesa" },
  { value: "outros", label: "Outras receitas e despesas", tipo: "ambos" },
  { value: "investimento", label: "Investimento (fora do resultado)", tipo: "despesa" },
  { value: "retirada", label: "Distribuição de lucros (fora do resultado)", tipo: "despesa" },
  { value: "transferencia", label: "Transferência (não entra no DRE)", tipo: "ambos" },
];

export function CampoCategoria({ tipo, value, onChange, className = "" }: {
  tipo: "receita" | "despesa"; value: string | null | undefined; onChange: (v: string) => void; className?: string;
}) {
  const { data: cats = [] } = useCategorias();
  const lista = cats.filter((c) => c.tipo === tipo && (c.ativo || c.nome === value));
  const conhecida = !value || lista.some((c) => c.nome === value);
  return (
    <Field label="Categoria (plano de contas)" className={className}>
      <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Escolha…</option>
        {lista.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
        {!conhecida && <option value={value!}>{value}</option>}
      </select>
    </Field>
  );
}

export function CampoRateio({ value, onChange, disabled }: { value: Rateio | null | undefined; onChange: (v: Rateio) => void; disabled?: boolean }) {
  const { data: centros = [] } = useCentros();
  const rat = value ?? [];
  const ativos = centros.filter((c) => c.ativo || rat.some((r) => r.centro_custo_id === c.id));
  const soma = Math.round(rat.reduce((s, r) => s + Number(r.percentual || 0), 0) * 100) / 100;
  if (!centros.length) {
    return <p className="text-xs text-slate-500">Centros de custo: cadastre em <b>Financeiro → Plano de contas</b> para dividir os lançamentos (ex.: fábrica, loja, assistência).</p>;
  }
  const muda = (i: number, patch: Partial<Rateio[number]>) => onChange(rat.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-slate-600">Centro de custo {rat.length > 1 && <span className={soma === 100 ? "text-emerald-700" : "text-red-700"}>· soma {soma.toLocaleString("pt-BR")}%{soma !== 100 && " (precisa dar 100%)"}</span>}</div>
      {rat.map((r, i) => (
        <div key={i} className="flex gap-2">
          <select className="input" value={r.centro_custo_id} disabled={disabled} required onChange={(e) => muda(i, { centro_custo_id: e.target.value })} aria-label="Centro de custo">
            <option value="">Escolha…</option>
            {ativos.filter((c) => c.id === r.centro_custo_id || !rat.some((x) => x.centro_custo_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <div className="relative w-28 shrink-0">
            <input className="input pr-7" type="number" min={0.01} max={100} step="0.01" value={r.percentual} disabled={disabled} required aria-label="Percentual"
              onChange={(e) => muda(i, { percentual: Number(e.target.value) })} />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-500">%</span>
          </div>
          {!disabled && <Button type="button" variant="ghost" title="Tirar este centro" onClick={() => onChange(rat.filter((_, k) => k !== i))}><X size={15} /></Button>}
        </div>
      ))}
      {!disabled && rat.length < ativos.length && (
        <Button type="button" variant="secondary" onClick={() => onChange([...rat, { centro_custo_id: "", percentual: Math.max(0, Math.round((100 - soma) * 100) / 100) || 100 }])}>
          <Plus size={15} /> {rat.length ? "Dividir com outro centro" : "Escolher centro de custo"}
        </Button>
      )}
    </div>
  );
}

/** A divisão está completa? (vazia vale: o lançamento fica "sem centro de custo") */
export const rateioOk = (r: Rateio | null | undefined) =>
  !r?.length || (r.every((x) => x.centro_custo_id && Number(x.percentual) > 0) && Math.round(r.reduce((s, x) => s + Number(x.percentual), 0) * 100) / 100 === 100);
