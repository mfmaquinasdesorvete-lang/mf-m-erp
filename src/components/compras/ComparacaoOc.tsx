// Nota × ordem de compra, produto a produto: quantidade (a mais, a menos, fora da OC, não veio), quanto baixa em cada
// OC e o preço da nota × o da OC (diferença acima de 2% em vermelho). Usada na nota (aba Ordem de compra) e na OC.
import { brl } from "@/lib/format";
import { ROTULO_SITUACAO_OC, type LinhaOc, type SituacaoOc } from "@/lib/notaFornecedor";

const qtd = (v: number | null | undefined) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 }));
const COR: Record<SituacaoOc, string> = {
  confere: "bg-emerald-50 text-emerald-700 ring-emerald-200", a_mais: "bg-amber-50 text-amber-800 ring-amber-200",
  a_menos: "bg-amber-50 text-amber-800 ring-amber-200", fora_da_oc: "bg-sky-50 text-sky-700 ring-sky-200", nao_veio: "bg-red-50 text-red-700 ring-red-200",
};

export function ComparacaoOc({ linhas }: { linhas: LinhaOc[] }) {
  const comPreco = linhas.some((l) => l.preco_nota != null);
  return (
    <>
      <ul className="space-y-2">
        {linhas.map((l) => (
          <li key={l.produto_id} className="rounded-xl border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="min-w-0 flex-1 font-semibold text-fg [overflow-wrap:anywhere]">{l.descricao}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${COR[l.situacao]}`}>
                {ROTULO_SITUACAO_OC[l.situacao]}{l.situacao === "a_mais" || l.situacao === "a_menos" ? ` (${l.diferenca > 0 ? "+" : ""}${qtd(l.diferenca)})` : ""}
              </span>
            </div>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
              <div><dt className="text-slate-500">Na nota</dt><dd className="font-semibold tabular-nums">{qtd(l.qtd_nota)}</dd></div>
              <div><dt className="text-slate-500">Falta na OC</dt><dd className="font-semibold tabular-nums">{qtd(l.qtd_pendente)}</dd></div>
              <div><dt className="text-slate-500">Baixa</dt><dd className="font-semibold tabular-nums">{qtd(l.qtd_baixa)}{l.baixas.length > 0 && <span className="font-normal text-slate-500"> ({l.baixas.map((b) => `#${b.numero}`).join(", ")})</span>}</dd></div>
              {comPreco && (
                <div>
                  <dt className="text-slate-500">Preço nota × OC</dt>
                  <dd className={`tabular-nums ${l.alerta_preco ? "font-bold text-red-600" : "font-semibold"}`}>
                    {l.preco_nota != null ? brl(l.preco_nota) : "—"} × {l.preco_oc != null ? brl(l.preco_oc) : "—"}
                    {l.dif_preco_pct != null && ` (${l.dif_preco_pct > 0 ? "+" : ""}${l.dif_preco_pct.toLocaleString("pt-BR")}%)`}
                  </dd>
                </div>
              )}
            </dl>
          </li>
        ))}
      </ul>
      {comPreco && <p className="mt-2 text-xs text-slate-500">Preço da nota: valor do produto por unidade do ERP, sem impostos. Diferença acima de 2% fica em vermelho.</p>}
    </>
  );
}
