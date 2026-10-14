// Etiquetas coloridas das máquinas do cliente: modelo + mês/ano da venda (e "usada"), para ver de relance na lista
// de clientes e na ficha. Cada modelo tem a sua cor; vale para as vendidas pela MF e pela My Frost (empresa anterior).
import { useMemo } from "react";
import { Snowflake } from "lucide-react";
import { useRows } from "@/lib/data";
import { dataBR, pl } from "@/lib/format";
import { modeloMaquina } from "@/lib/legadoMyFrost";

export type MaquinaResumo = {
  id: string; cliente_id: string; descricao: string; data_venda: string | null; usada?: boolean | null; origem?: string | null;
};

// só as cores que mudam com o tema (claro/escuro): cheia para os modelos mais comuns, contorno para os outros
const CHEIA = {
  sky: "border-sky-200 bg-sky-100 text-sky-800", purple: "border-purple-200 bg-purple-100 text-purple-800",
  emerald: "border-emerald-200 bg-emerald-100 text-emerald-800", amber: "border-amber-200 bg-amber-100 text-amber-800",
  indigo: "border-indigo-200 bg-indigo-100 text-indigo-800", orange: "border-orange-200 bg-orange-100 text-orange-800",
  red: "border-red-200 bg-red-100 text-red-800", slate: "border-slate-200 bg-slate-100 text-slate-700",
} as const;
const CONTORNO = {
  sky: "border-sky-500 bg-surface text-sky-700", purple: "border-purple-500 bg-surface text-purple-700",
  emerald: "border-emerald-500 bg-surface text-emerald-700", amber: "border-amber-500 bg-surface text-amber-700",
  indigo: "border-indigo-500 bg-surface text-indigo-700", orange: "border-orange-500 bg-surface text-orange-700",
} as const;
const POR_MODELO: Record<string, string> = {
  "Top 300": CHEIA.sky, "A 200": CHEIA.purple, Slim: CHEIA.emerald, Queen: CHEIA.amber, "Top 200": CHEIA.indigo, Prime: CHEIA.orange,
  "P 765": CONTORNO.sky, "P 313": CONTORNO.amber, "A 200 Plus": CONTORNO.purple, "A 100": CONTORNO.indigo,
  "P 386": CONTORNO.emerald, "S 430": CONTORNO.orange, SB: CHEIA.slate, Unic: CHEIA.slate,
};
const OUTRAS = [CHEIA.sky, CHEIA.purple, CHEIA.emerald, CHEIA.amber, CHEIA.indigo, CHEIA.orange, CHEIA.red, CHEIA.slate];

/** "My Frost Top 300 - Máquina de Sorvete…" -> "Top 300"; "Máquina de Sorvete Soft MF-300 (3 bicos)" -> "Soft MF-300". */
export function rotuloMaquina(descricao: string) {
  const m = modeloMaquina(descricao);
  if (m) return m;
  const s = String(descricao ?? "").replace(/^\s*(m[aá]quina\s+(de\s+)?(sorvete\s+|a[cç]a[ií]\s+)?)/i, "").split(/\s+[-–(]\s*|\s*\(/)[0].trim();
  return (s || String(descricao ?? "")).slice(0, 22);
}

export function corMaquina(rotulo: string) {
  if (POR_MODELO[rotulo]) return POR_MODELO[rotulo];
  let h = 0;
  for (const ch of rotulo) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return OUTRAS[h % OUTRAS.length];
}

const mesAno = (d: string | null) => (d ? `${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

export function MaquinasCliente({ maquinas, max = 4 }: { maquinas: MaquinaResumo[]; max?: number }) {
  if (!maquinas.length) return null;
  const ordem = [...maquinas].sort((a, b) => (b.data_venda ?? "").localeCompare(a.data_venda ?? ""));
  const resto = ordem.length - max;
  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {ordem.slice(0, max).map((m) => {
        const r = rotuloMaquina(m.descricao);
        const quando = mesAno(m.data_venda);
        const titulo = [m.descricao, m.origem ? `vendida pela ${m.origem}` : "vendida pela MF", m.data_venda ? `em ${dataBR(m.data_venda)}` : "data não informada", m.usada ? "máquina usada" : ""]
          .filter(Boolean).join(" · ");
        return (
          <span key={m.id} title={titulo} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[11px] font-semibold ${corMaquina(r)}`}>
            <Snowflake size={11} aria-hidden /> {r}{m.usada ? " usada" : ""}{quando ? ` · ${quando}` : ""}
          </span>
        );
      })}
      {resto > 0 && <span className="whitespace-nowrap rounded-full border border-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600" title={`mais ${resto} ${pl(resto, "máquina", "máquinas")}`}>+{resto}</span>}
    </div>
  );
}

/** Máquinas de todos os clientes, agrupadas por cliente (uma consulta só para a lista inteira). */
export function useMaquinasPorCliente() {
  const { data = [] } = useRows<MaquinaResumo>("equipamentos", { select: "id, cliente_id, descricao, data_venda, usada, origem", order: "data_venda", key: ["etiquetas"] });
  return useMemo(() => {
    const m = new Map<string, MaquinaResumo[]>();
    for (const e of data) m.set(e.cliente_id, [...(m.get(e.cliente_id) ?? []), e]);
    return m;
  }, [data]);
}
