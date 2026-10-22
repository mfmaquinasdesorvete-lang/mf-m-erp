// Peças do "estilo painel" escuro (como o "Quanto tem para pagar"): fundo azul-escuro nos dois temas, o número principal
// no centro de um anel colorido, números de apoio com ladrilho em degradê e linhas com barra de quanto cada parte pesa.
// O fundo não muda com o tema, então as cores aqui são fixas (branco e os tons "neon"), não as do tema.
import type { CSSProperties, ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";

/** Quadradinho com degradê e ícone (como nos painéis de referência). */
export const ladrilho = (de: string, ate: string): CSSProperties => ({ background: `linear-gradient(135deg, ${de}, ${ate})`, boxShadow: `0 6px 18px -6px ${ate}` });

/**
 * Caixa do painel escuro: título em caixa-alta com a parte `destaque` em degradê, ações ao lado e, com `filtro`,
 * o botão branco "Só …" para voltar a ver tudo.
 */
export function QuadroEscuro({ titulo, destaque, rotulo, acoes, filtro, className = "mb-4", children }: {
  titulo: ReactNode; destaque?: ReactNode; rotulo: string; acoes?: ReactNode;
  filtro?: { texto: string; onLimpar: () => void }; className?: string; children: ReactNode;
}) {
  return (
    <section aria-label={rotulo}
      className={`relative overflow-hidden rounded-2xl border border-[#1d3b66] bg-[radial-gradient(120%_90%_at_50%_0%,#123463_0%,#0a1f3d_45%,#06132a_100%)] p-4 text-white shadow-pop sm:p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-base font-bold uppercase tracking-[.12em] sm:text-lg">
          {titulo}{destaque && <> <span className="bg-gradient-to-r from-[#fb7185] to-[#fbbf24] bg-clip-text text-transparent">{destaque}</span></>}
        </h2>
        {acoes}
        {filtro && (
          <button type="button" onClick={filtro.onLimpar} className="ml-auto inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-bold text-[#0a1f3d]">
            Só {filtro.texto} <X size={13} aria-hidden /><span className="sr-only">(mostrar tudo)</span>
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

export type FatiaAnel<T extends string = string> = { id: T; rotulo: string; valor: number; cor: string; neon: string; dica?: string };

/** Anel com um pedaço por parte e o número principal no centro (a letra acompanha o tamanho do anel). */
export function AnelEscuro<T extends string>({ fatias, escolhida, onEscolher, centro, rotulo }: {
  fatias: FatiaAnel<T>[]; escolhida?: T | ""; onEscolher?: (id: T | "") => void;
  centro: { rotulo: string; valor: string; sub?: ReactNode }; rotulo: string;
}) {
  const raio = 84, grossura = 20, volta = 2 * Math.PI * raio, folga = fatias.length > 1 ? 4 : 0;
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  let acumulado = 0;
  return (
    <div className="relative mx-auto aspect-square w-[min(15rem,72vw)] max-w-full shrink-0 lg:w-[16.5rem]">
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" role="img" aria-label={rotulo}>
        <circle cx="100" cy="100" r={raio} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={grossura} />
        {total > 0 && fatias.map((f) => {
          const tam = (f.valor / total) * volta;
          const inicio = acumulado;
          acumulado += tam;
          return (
            <circle key={f.id} cx="100" cy="100" r={raio} fill="none" stroke={f.neon} strokeWidth={grossura}
              strokeDasharray={`${Math.max(0.5, tam - folga)} ${volta}`} strokeDashoffset={-inicio}
              className={`${onEscolher ? "cursor-pointer" : ""} transition-opacity`} opacity={escolhida && escolhida !== f.id ? 0.25 : 1}
              style={{ filter: `drop-shadow(0 0 5px ${f.cor})` }} onClick={onEscolher && (() => onEscolher(escolhida === f.id ? "" : f.id))}>
              <title>{f.dica ?? f.rotulo}</title>
            </circle>
          );
        })}
      </svg>
      <div className="cartao-fit absolute inset-[19%] flex flex-col items-center justify-center text-center">
        <span className="max-w-full truncate text-2xs font-bold uppercase tracking-[.14em] text-white/75">{centro.rotulo}</span>
        {/* valor comprido ("R$ 289.000,00") diminui para caber inteiro; curto fica no tamanho cheio */}
        <span className="num valor-fit w-full font-bold leading-tight text-white [--valor-max:2.1rem]"
          style={{ "--valor-cq": `${Math.min(14, 165 / Math.max(1, centro.valor.length)).toFixed(1)}cqi` } as CSSProperties}>{centro.valor}</span>
        {centro.sub && <span className="text-xs font-semibold text-[#5eead4]">{centro.sub}</span>}
      </div>
    </div>
  );
}

/** Número de apoio (vencido, próximos 7 dias…) com o ladrilho colorido; `aceso` quando há algo a olhar. */
export function NumeroEscuro({ icone: Icone, rotulo, valor, sub, de, ate, aceso }: {
  icone: LucideIcon; rotulo: string; valor: ReactNode; sub?: ReactNode; de: string; ate: string; aceso?: boolean;
}) {
  return (
    // celular: ícone e nome em cima, valor embaixo na largura toda (o número cabe inteiro); computador: lado a lado
    <div className={`cartao-fit grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 rounded-2xl border p-2.5 lg:gap-x-2.5
      ${aceso ? "border-white/15 bg-white/[.08]" : "border-white/[.06] bg-white/[.03]"}`}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white lg:row-span-3 lg:h-10 lg:w-10" style={ladrilho(de, ate)}><Icone size={17} aria-hidden /></span>
      <span className="min-w-0 text-2xs font-bold uppercase leading-tight tracking-wide text-white/80">{rotulo}</span>
      <span className="num valor-fit col-span-2 block font-bold leading-tight text-white [--valor-cq:14cqi] [--valor-max:1.35rem] lg:col-span-1 lg:col-start-2 lg:[--valor-cq:10cqi]">{valor}</span>
      {sub && <span className="col-span-2 block truncate text-xs text-white/75 lg:col-span-1 lg:col-start-2">{sub}</span>}
    </div>
  );
}

/** Linha de uma parte (tipo, canal, vendedor…): ladrilho, nome, valor, barra de quanto pesa e detalhes; tocar filtra. */
export function LinhaEscura({ icone: Icone, rotulo, valor, pct, cor, neon, detalhes, ativo, apagado, onClick, title }: {
  icone: LucideIcon; rotulo: string; valor: ReactNode; pct: number; cor: string; neon: string; detalhes?: ReactNode;
  ativo?: boolean; apagado?: boolean; onClick?: () => void; title?: string;
}) {
  return (
    <button type="button" aria-pressed={ativo} onClick={onClick} title={title}
      className={`flex w-full min-w-0 items-center gap-2.5 rounded-2xl border p-2 text-left transition hover:bg-white/10
        ${ativo ? "border-white/60 bg-white/[.12]" : "border-white/[.07] bg-white/[.04]"} ${apagado ? "opacity-55" : ""}`}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[#06132a]" style={ladrilho(neon, cor)}><Icone size={18} aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-bold text-white">{rotulo}</span>
          <span className="num shrink-0 whitespace-nowrap text-sm font-bold text-white">{valor}</span>
        </span>
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/10">
          <span className="block h-full rounded-full" style={{ width: `${Math.max(3, pct)}%`, background: neon, boxShadow: `0 0 8px ${cor}` }} />
        </span>
        {detalhes && <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-white/75">{detalhes}</span>}
      </span>
    </button>
  );
}
