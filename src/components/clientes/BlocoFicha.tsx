// Bloco colorido das abas da Ficha 360: o mesmo brilho dos cartões de número do ERP (borda, fundo em degradê e o
// ícone na cor do assunto), para achar cada parte da ficha de relance. As cores acompanham o tema claro e o escuro.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { COR_ATALHO, estiloBrilho } from "@/components/ui";

export type CorBloco = keyof typeof COR_ATALHO;

export function BlocoFicha({ titulo, icone: Icone, cor, n, extra, children }: {
  titulo: string; icone: LucideIcon; cor: CorBloco;
  /** quantos itens tem (aparece no selo ao lado do título) */
  n?: number; extra?: ReactNode; children: ReactNode;
}) {
  const c = COR_ATALHO[cor];
  return (
    <section className="min-w-0 rounded-cartao border p-3 sm:p-4" style={estiloBrilho(c)}>
      <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-bold text-fg">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c }} aria-hidden>
          <Icone size={17} />
        </span>
        {titulo}
        {n != null && (
          <span className="num rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }}>{n}</span>
        )}
        {extra}
      </h3>
      {children}
    </section>
  );
}
