// Peças da busca da auditoria: caixa de busca, botão de filtro (pílula), etiqueta de filtro ativo e o destaque do que foi achado.
import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { destacar, type Termo } from "@/lib/auditoriaBusca";
import { chip } from "@/components/ui";

/** Texto com o que a busca achou marcado em amarelo (sem acento e maiúscula; valor e documento de qualquer jeito). */
export function Destaque({ texto, termos }: { texto: string | null | undefined; termos: Termo[] }) {
  const s = texto ?? "";
  if (!s || !termos.length) return <>{s}</>;
  return (
    <>
      {destacar(s, termos).map((t, i) => (t.achou
        ? <mark key={i} className="rounded-sm bg-amber-200 text-fg [box-decoration-break:clone]">{t.texto}</mark>
        : <span key={i}>{t.texto}</span>))}
    </>
  );
}

/** Caixa de busca com lupa e botão para apagar. */
export function CampoBusca({ value, onChange, placeholder, rotulo = "Buscar" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rotulo?: string;
}) {
  return (
    <div className="relative min-w-0">
      <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
      <input type="text" inputMode="search" enterKeyHint="search" autoComplete="off" spellCheck={false} className="input pl-10 pr-11"
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={rotulo}
        onKeyDown={(e) => e.key === "Escape" && value && (e.preventDefault(), onChange(""))} />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Apagar a busca" title="Apagar a busca"
          className="botao-icone absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

/** Botão redondo de escolha (período, gravidade, tipo). */
export function Pilula({ ativo, onClick, children, title }: { ativo: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo} title={title}
      className={chip(ativo)}>
      {children}
    </button>
  );
}

/** Filtro em uso, com o X para tirar só ele. */
export function FiltroAtivo({ children, onRemover }: { children: ReactNode; onRemover: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-surface py-0.5 pl-2.5 pr-1 text-xs text-slate-700">
      <span className="min-w-0 truncate">{children}</span>
      <button type="button" onClick={onRemover} aria-label="Tirar este filtro" title="Tirar este filtro"
        className="botao-icone h-6 w-6 p-0"><X size={13} /></button>
    </span>
  );
}
