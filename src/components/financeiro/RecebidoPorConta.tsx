// Contas a receber → Recebidas (pedido de 31/10): quanto entrou no período e em qual conta (banco, maquininha, caixa).
// Tocar numa conta mostra só os recebimentos dela; tocar de novo volta para todas.
import { Landmark } from "lucide-react";
import { brl, pl } from "@/lib/format";

export type RecebidoConta = { id: string; nome: string; total: number; n: number };

/** Soma o que foi recebido por conta (sem conta = ""). Pago usa o valor pago (o que entrou de fato). */
export function recebidoPorConta(contas: { status: string; valor: number | string; valor_pago?: number | string | null; conta_bancaria_id?: string | null }[],
  nomeConta: (id: string) => string): { total: number; n: number; contas: RecebidoConta[] } {
  const m = new Map<string, RecebidoConta>();
  let total = 0, n = 0;
  for (const c of contas) {
    if (c.status !== "pago") continue;
    const v = Number(c.valor_pago ?? c.valor) || 0, id = c.conta_bancaria_id ?? "";
    const x = m.get(id) ?? { id, nome: id ? nomeConta(id) || "Conta apagada" : "Sem conta informada", total: 0, n: 0 };
    x.total += v; x.n++; total += v; n++;
    m.set(id, x);
  }
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { total: r2(total), n, contas: [...m.values()].map((x) => ({ ...x, total: r2(x.total) })).sort((a, b) => b.total - a.total) };
}

export function RecebidoPorConta({ dados, periodo, ativa, onConta }: {
  dados: ReturnType<typeof recebidoPorConta>; periodo: string; ativa: string | null; onConta: (id: string | null) => void;
}) {
  if (!dados.n) return null;
  return (
    <section aria-label="Recebido por conta" className="cartao mb-3 p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><Landmark size={15} aria-hidden /> Recebido · {periodo.toLowerCase()}</span>
        <span className="num text-2xl font-bold leading-tight text-fg">{brl(dados.total)}</span>
        <span className="text-xs text-slate-500">{dados.n} {pl(dados.n, "recebimento", "recebimentos")} · onde entrou:</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Filtrar pela conta onde entrou">
        {dados.contas.map((c) => {
          const marcada = ativa === c.id;
          return (
            <button key={c.id || "sem"} type="button" aria-pressed={marcada} onClick={() => onConta(marcada ? null : c.id)}
              className={`chip h-auto flex-col items-start gap-0 px-3 py-1.5 text-left ${marcada ? "!border-fg ring-2 ring-fg/20" : ""}`}>
              <span className="text-xs font-semibold text-slate-600">{c.nome}</span>
              <span className="num text-sm font-bold text-fg">{brl(c.total)} <span className="text-xs font-normal text-slate-500">· {c.n}</span></span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
