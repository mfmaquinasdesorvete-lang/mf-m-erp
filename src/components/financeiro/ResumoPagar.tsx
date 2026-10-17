// "Quanto tem para pagar", no estilo de painel: fundo azul-escuro, o total no centro de um anel colorido (cada cor é um
// tipo de conta), à esquerda vencido / próximos 7 dias / falta aprovar / não pagar e à direita cada tipo (transportadoras,
// fornecedores, folha, impostos…) com valor e quanto pesa. Tocar num tipo mostra só as contas dele.
// O fundo é escuro nos dois temas, então aqui as cores são fixas (branco e os tons "neon"), não as do tema.
import type { CSSProperties, ReactNode } from "react";
import { AlertTriangle, Ban, CalendarClock, ClipboardCheck, Ellipsis, Home, Landmark, Package, Truck, Users, Wrench, X, type LucideIcon } from "lucide-react";
import { brl, pl } from "@/lib/format";
import { TIPOS_PAGAR, type ResumoPagar, type TipoPagar } from "@/lib/tiposPagar";

export const ICONE_TIPO: Record<TipoPagar, LucideIcon> = {
  transportadora: Truck, fornecedor: Package, pessoal: Users, imposto: Landmark, casa: Home, servico: Wrench, outros: Ellipsis,
};

export function ChipTipo({ tipo, className = "" }: { tipo: TipoPagar; className?: string }) {
  const t = TIPOS_PAGAR[tipo], Icone = ICONE_TIPO[tipo];
  return (
    <span title={t.dica} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${t.chip} ${className}`}>
      <Icone size={12} aria-hidden /> {t.rotulo}
    </span>
  );
}

/** Quadradinho com degradê e ícone (como nos painéis de referência). */
const ladrilho = (de: string, ate: string): CSSProperties => ({ background: `linear-gradient(135deg, ${de}, ${ate})`, boxShadow: `0 6px 18px -6px ${ate}` });

/** Anel com um pedaço por tipo; o total fica no centro. */
function Anel({ r, tipo, onTipo }: { r: ResumoPagar; tipo?: TipoPagar | ""; onTipo: (t: TipoPagar | "") => void }) {
  const raio = 84, grossura = 20, volta = 2 * Math.PI * raio, folga = r.linhas.length > 1 ? 4 : 0;
  const daVez = tipo ? r.linhas.find((l) => l.tipo === tipo) : undefined;
  let acumulado = 0;
  return (
    <div className="relative mx-auto aspect-square w-[min(15rem,72vw)] max-w-full shrink-0 lg:w-[16.5rem]">
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" role="img"
        aria-label={`Para pagar ${brl(r.total)}: ${r.linhas.map((l) => `${TIPOS_PAGAR[l.tipo].rotulo} ${brl(l.total)}`).join(", ")}`}>
        <circle cx="100" cy="100" r={raio} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={grossura} />
        {r.total > 0 && r.linhas.map((l) => {
          const tam = (l.total / r.total) * volta;
          const inicio = acumulado;
          acumulado += tam;
          const t = TIPOS_PAGAR[l.tipo];
          return (
            <circle key={l.tipo} cx="100" cy="100" r={raio} fill="none" stroke={t.neon} strokeWidth={grossura}
              strokeDasharray={`${Math.max(0.5, tam - folga)} ${volta}`} strokeDashoffset={-inicio}
              className="cursor-pointer transition-opacity" opacity={tipo && tipo !== l.tipo ? 0.25 : 1}
              style={{ filter: `drop-shadow(0 0 5px ${t.cor})` }} onClick={() => onTipo(tipo === l.tipo ? "" : l.tipo)}>
              <title>{`${t.rotulo}: ${brl(l.total)}`}</title>
            </circle>
          );
        })}
      </svg>
      {/* centro: o total (a letra acompanha o tamanho do anel) */}
      <div className="cartao-fit absolute inset-[19%] flex flex-col items-center justify-center text-center">
        <span className="max-w-full truncate text-[11px] font-bold uppercase tracking-[.14em] text-white/75">{daVez ? TIPOS_PAGAR[daVez.tipo].rotulo : "Para pagar"}</span>
        <span className="num valor-fit w-full font-extrabold leading-tight text-white [--valor-cq:14cqi] [--valor-max:2.1rem]">{brl(daVez ? daVez.total : r.total)}</span>
        <span className="text-[13px] font-semibold text-[#5eead4]">{daVez ? `${daVez.n} ${pl(daVez.n, "conta", "contas")}` : `${r.n} ${pl(r.n, "conta", "contas")} em aberto`}</span>
      </div>
    </div>
  );
}

/** Um número do lado esquerdo (vencido, 7 dias…), com o ladrilho colorido. */
function Situacao({ icone: Icone, rotulo, valor, sub, de, ate, aceso }: { icone: LucideIcon; rotulo: string; valor: number; sub: string; de: string; ate: string; aceso: boolean }) {
  return (
    // celular: ícone e nome em cima, valor embaixo na largura toda (o número cabe inteiro); computador: lado a lado
    <div className={`cartao-fit grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 rounded-2xl border p-2.5 lg:gap-x-2.5
      ${aceso ? "border-white/15 bg-white/[.08]" : "border-white/[.06] bg-white/[.03]"}`}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white lg:row-span-3 lg:h-10 lg:w-10" style={ladrilho(de, ate)}><Icone size={17} aria-hidden /></span>
      <span className="min-w-0 text-[11px] font-bold uppercase leading-tight tracking-wide text-white/80">{rotulo}</span>
      <span className="num valor-fit col-span-2 block font-extrabold leading-tight text-white [--valor-cq:14cqi] [--valor-max:1.35rem] lg:col-span-1 lg:col-start-2 lg:[--valor-cq:10cqi]">{brl(valor)}</span>
      <span className="col-span-2 block truncate text-xs text-white/75 lg:col-span-1 lg:col-start-2">{sub}</span>
    </div>
  );
}

export function ResumoPagarTipos({ r, tipo, onTipo, className = "mb-4", acoes }: {
  r: ResumoPagar; tipo?: TipoPagar | ""; onTipo: (t: TipoPagar | "") => void; className?: string; acoes?: ReactNode;
}) {
  if (!r.n && !r.nSeguradas) return null;
  return (
    <section aria-label="Quanto tem para pagar"
      className={`relative overflow-hidden rounded-3xl border border-[#1d3b66] bg-[radial-gradient(120%_90%_at_50%_0%,#123463_0%,#0a1f3d_45%,#06132a_100%)] p-4 text-white shadow-pop sm:p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-base font-extrabold uppercase tracking-[.12em] sm:text-lg">
          Quanto tem <span className="bg-gradient-to-r from-[#fb7185] to-[#fbbf24] bg-clip-text text-transparent">para pagar</span>
        </h2>
        {acoes}
        {tipo && (
          <button type="button" onClick={() => onTipo("")} className="ml-auto inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-bold text-[#0a1f3d]">
            Só {TIPOS_PAGAR[tipo].rotulo} <X size={13} aria-hidden /><span className="sr-only">(mostrar todos os tipos)</span>
          </button>
        )}
      </div>

      <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,15.5rem)_auto_minmax(0,1fr)] lg:gap-6">
        {/* celular: o anel primeiro, no centro */}
        <div className="order-1 min-w-0 lg:order-2"><Anel r={r} tipo={tipo} onTipo={onTipo} /></div>

        <div className="order-2 grid min-w-0 grid-cols-2 gap-2 lg:order-1 lg:grid-cols-1">
          <Situacao icone={AlertTriangle} rotulo="Vencido" valor={r.vencido} sub={r.nVencidas ? `${r.nVencidas} ${pl(r.nVencidas, "conta atrasada", "contas atrasadas")}` : "nada atrasado"} de="#fb7185" ate="#e11d48" aceso={r.vencido > 0} />
          <Situacao icone={CalendarClock} rotulo="Próximos 7 dias" valor={r.semana} sub="vai sair esta semana" de="#fbbf24" ate="#d97706" aceso={r.semana > 0} />
          <Situacao icone={ClipboardCheck} rotulo="Falta aprovar" valor={r.aprovar} sub={r.nAprovar ? `${r.nAprovar} esperando o ok` : "tudo aprovado"} de="#c084fc" ate="#7c3aed" aceso={r.nAprovar > 0} />
          <Situacao icone={Ban} rotulo="Não pagar" valor={r.seguradas} sub={r.nSeguradas ? `${r.nSeguradas} ${pl(r.nSeguradas, "segurada", "seguradas")}, fora do total` : "nenhuma segurada"} de="#94a3b8" ate="#475569" aceso={false} />
        </div>

        <ul className="order-3 grid min-w-0 gap-1.5 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2" aria-label="Por tipo de conta">
          {r.linhas.map((l) => {
            const t = TIPOS_PAGAR[l.tipo], Icone = ICONE_TIPO[l.tipo], ativo = tipo === l.tipo;
            const pct = r.total ? Math.round((l.total / r.total) * 100) : 0;
            return (
              <li key={l.tipo} className="min-w-0">
                <button type="button" aria-pressed={ativo} onClick={() => onTipo(ativo ? "" : l.tipo)} title={`${t.dica} · toque para ver só estas contas`}
                  className={`flex w-full min-w-0 items-center gap-2.5 rounded-2xl border p-2 text-left transition hover:bg-white/10
                    ${ativo ? "border-white/60 bg-white/[.12]" : "border-white/[.07] bg-white/[.04]"} ${tipo && !ativo ? "opacity-55" : ""}`}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[#06132a]" style={ladrilho(t.neon, t.cor)}><Icone size={18} aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-bold text-white">{t.rotulo}</span>
                      <span className="num shrink-0 whitespace-nowrap text-[15px] font-extrabold text-white">{brl(l.total)}</span>
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/10">
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(3, pct)}%`, background: t.neon, boxShadow: `0 0 8px ${t.cor}` }} />
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-white/75">
                      <span>{pct}% · {l.n} {pl(l.n, "conta", "contas")}</span>
                      {l.vencido > 0 && <span className="font-semibold text-[#fda4af]">{brl(l.vencido)} vencido</span>}
                      {l.nAprovar > 0 && <span className="font-semibold text-[#d8b4fe]">{l.nAprovar} falta aprovar</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
