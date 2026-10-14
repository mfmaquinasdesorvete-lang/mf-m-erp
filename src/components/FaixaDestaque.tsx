// Faixa acima de uma lista aberta "em destaque" (só os registros apontados por outra tela).
import { Filter, X } from "lucide-react";
import type { Destaque } from "@/lib/destaque";

export function FaixaDestaque({ destaque, mostrando, onLimpar }: { destaque: Destaque; mostrando: number; onLimpar: () => void }) {
  return (
    <div role="status" className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
      <Filter size={16} aria-hidden className="shrink-0" />
      <span className="min-w-0 flex-1">
        <b>{destaque.origem}:</b> {destaque.titulo || "itens apontados"} · mostrando {mostrando} de {destaque.ids.length}
      </span>
      <button type="button" onClick={onLimpar} className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
        <X size={14} aria-hidden /> Ver todos
      </button>
    </div>
  );
}
