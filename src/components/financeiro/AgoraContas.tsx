// Topo das contas a pagar e a receber (pedido de 26/10): quatro cartões "o que fazer agora" (tocar filtra a lista,
// tocar de novo volta) e a escolha da lista (em aberto, pagas ou todas). Mesma cara nas duas telas.
import { AlertTriangle, CalendarDays, ClipboardCheck, Sun } from "lucide-react";
import { brl } from "@/lib/format";
import type { CartaoAgora, EstadoLista } from "@/lib/agoraContas";

const CARTOES: { id: CartaoAgora; rotulo: string; icone: typeof Sun; cor: string }[] = [
  { id: "vencidas", rotulo: "Vencidas", icone: AlertTriangle, cor: "text-red-700" },
  { id: "hoje", rotulo: "Hoje", icone: Sun, cor: "text-amber-700" },
  { id: "semana", rotulo: "Esta semana", icone: CalendarDays, cor: "text-sky-700" },
  { id: "decidir", rotulo: "Para decidir", icone: ClipboardCheck, cor: "text-violet-700" },
];

export function CartoesAgora({ resumo, ativo, onEscolher, rotuloDecidir }: {
  resumo: Record<CartaoAgora, { n: number; total: number }>; ativo: CartaoAgora | null; onEscolher: (c: CartaoAgora | null) => void;
  /** a receber: "Para conferir" */
  rotuloDecidir?: string;
}) {
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {CARTOES.map(({ id, rotulo, icone: Icone, cor }) => {
        const r = resumo[id];
        const marcado = ativo === id;
        return (
          <button key={id} type="button" aria-pressed={marcado} onClick={() => onEscolher(marcado ? null : id)}
            className={`cartao flex min-w-0 flex-col items-start gap-0.5 p-3 text-left transition hover:border-slate-400 ${marcado ? "!border-fg ring-2 ring-fg/20" : ""}`}>
            <span className={`flex items-center gap-1.5 text-xs font-semibold ${r.n ? cor : "text-slate-500"}`}>
              <Icone size={15} aria-hidden /> {id === "decidir" && rotuloDecidir ? rotuloDecidir : rotulo}
            </span>
            <span className="num text-2xl font-bold leading-tight text-fg">{r.n}</span>
            <span className="num text-xs text-slate-500">{r.n ? brl(r.total) : "nada"}</span>
          </button>
        );
      })}
    </div>
  );
}

export function EscolhaEstado({ valor, onMudar, rotuloPagas = "Pagas" }: { valor: EstadoLista; onMudar: (e: EstadoLista) => void; rotuloPagas?: string }) {
  const op: [EstadoLista, string][] = [["aberto", "Em aberto"], ["pagas", rotuloPagas], ["todas", "Todas"]];
  return (
    <div className="inline-flex rounded-lg border border-slate-300 bg-surface p-0.5" role="group" aria-label="Quais contas mostrar">
      {op.map(([v, r]) => (
        <button key={v} type="button" aria-pressed={valor === v} onClick={() => onMudar(v)}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold ${valor === v ? "bg-fg text-surface" : "text-slate-600 hover:bg-slate-100"}`}>{r}</button>
      ))}
    </div>
  );
}

/** Faixa "Mostrando: Vencidas · ver todas" quando um cartão está escolhido. */
export function FaixaCartao({ cartao, rotuloDecidir, onLimpar, children }: { cartao: CartaoAgora; rotuloDecidir?: string; onLimpar: () => void; children?: React.ReactNode }) {
  const r = cartao === "decidir" && rotuloDecidir ? rotuloDecidir : CARTOES.find((c) => c.id === cartao)?.rotulo;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-600">Mostrando: <b className="text-fg">{r}</b></span>
      <button type="button" className="link-modulo font-semibold" onClick={onLimpar}>ver a lista toda</button>
      {children}
    </div>
  );
}
