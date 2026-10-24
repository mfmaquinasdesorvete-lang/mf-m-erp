// Etiquetas coloridas das máquinas do cliente: modelo + mês/ano da venda (e "usada"), em letra maior e forte para
// ver de relance na lista de clientes e na ficha. Cada modelo tem a sua cor; vale para as vendidas pela MF e pela
// My Frost (empresa anterior).
import { useMemo } from "react";
import { Snowflake } from "lucide-react";
import { useRows } from "@/lib/data";
import { dataBR, pl } from "@/lib/format";
import { modeloMaquina } from "@/lib/legadoMyFrost";
import { mesAnoCompra } from "../../../supabase/functions/_shared/compra-maquina";
import { TOM_ESCURO } from "@/components/painel/PainelEscuro";

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

// a mesma cor do modelo no painel escuro da ficha: tom forte e o "neon" que aparece sobre o fundo azul-escuro
const HEX: Record<string, { cor: string; neon: string }> = {
  sky: TOM_ESCURO.azul, purple: TOM_ESCURO.roxo, emerald: TOM_ESCURO.verde,
  amber: TOM_ESCURO.ambar, indigo: TOM_ESCURO.indigo, orange: TOM_ESCURO.laranja,
  red: TOM_ESCURO.vermelho, slate: TOM_ESCURO.cinza,
};
export function corMaquinaHex(rotulo: string) {
  return HEX[/text-(\w+)-/.exec(corMaquina(rotulo))?.[1] ?? "slate"] ?? HEX.slate;
}

const mesAno = (d: string | null) => (d ? `${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

/**
 * compra: data de compra da máquina guardada no cadastro do cliente (no Tiny ficava no "Código"); vira uma etiqueta
 * quando nenhuma máquina registrada é daquele mês.
 */
// tamanho das etiquetas: "lista" na lista de clientes e no alto da ficha, "grande" dentro das abas da ficha
const TAMANHO = {
  lista: { caixa: "gap-1 px-2.5 py-1 text-sm", icone: 15 },
  grande: { caixa: "gap-1.5 px-3 py-1.5 text-base", icone: 17 },
} as const;
type Tamanho = keyof typeof TAMANHO;

/** Uma máquina: modelo na cor dele, "usada" e o mês/ano da venda. */
export function EtiquetaMaquina({ m, tamanho = "lista" }: { m: Pick<MaquinaResumo, "descricao" | "data_venda" | "usada" | "origem">; tamanho?: Tamanho }) {
  const r = rotuloMaquina(m.descricao), t = TAMANHO[tamanho];
  const quando = mesAno(m.data_venda);
  const titulo = [m.descricao, m.origem ? `vendida pela ${m.origem}` : "vendida pela MF", m.data_venda ? `em ${dataBR(m.data_venda)}` : "data não informada", m.usada ? "máquina usada" : ""]
    .filter(Boolean).join(" · ");
  return (
    <span title={titulo} className={`inline-flex items-center whitespace-nowrap rounded-lg border font-bold leading-tight shadow-sm ${t.caixa} ${corMaquina(r)}`}>
      <Snowflake size={t.icone} aria-hidden /> {r}{m.usada ? " usada" : ""}{quando ? <span className="font-semibold opacity-80"> · {quando}</span> : ""}
    </span>
  );
}

export function MaquinasCliente({ maquinas, compra, max = 4 }: { maquinas: MaquinaResumo[]; compra?: string | null; max?: number }) {
  const soCadastro = !!compra && !maquinas.some((m) => (m.data_venda ?? "").slice(0, 7) === compra.slice(0, 7));
  if (!maquinas.length && !soCadastro) return null;
  const ordem = [...maquinas].sort((a, b) => (b.data_venda ?? "").localeCompare(a.data_venda ?? ""));
  const resto = ordem.length - max;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {soCadastro && (
        <span title={`Comprou máquina em ${mesAnoCompra(compra)} (data do cadastro do cliente; modelo não informado)`}
          className={`inline-flex items-center whitespace-nowrap rounded-lg border border-slate-300 bg-surface font-bold leading-tight text-slate-700 ${TAMANHO.lista.caixa}`}>
          <Snowflake size={TAMANHO.lista.icone} aria-hidden /> Máquina · {mesAnoCompra(compra)}
        </span>
      )}
      {ordem.slice(0, max).map((m) => <EtiquetaMaquina key={m.id} m={m} />)}
      {resto > 0 && <span className={`whitespace-nowrap rounded-lg border border-slate-200 font-bold leading-tight text-slate-600 ${TAMANHO.lista.caixa}`} title={`mais ${resto} ${pl(resto, "máquina", "máquinas")}`}>+{resto}</span>}
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
