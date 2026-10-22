// "Quanto tem para pagar", no estilo de painel: fundo azul-escuro, o total no centro de um anel colorido (cada cor é um
// tipo de conta), à esquerda vencido / próximos 7 dias / falta aprovar / não pagar e à direita cada tipo (transportadoras,
// fornecedores, folha, impostos…) com valor e quanto pesa. Tocar num tipo mostra só as contas dele.
// As peças do painel escuro ficam em components/painel/PainelEscuro (as mesmas da vitrine do design system).
import type { ReactNode } from "react";
import { AlertTriangle, Ban, CalendarClock, ClipboardCheck, Ellipsis, Home, Landmark, Package, Truck, Users, Wrench, type LucideIcon } from "lucide-react";
import { AnelEscuro, LinhaEscura, NumeroEscuro, QuadroEscuro, type FatiaAnel } from "@/components/painel/PainelEscuro";
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

export function ResumoPagarTipos({ r, tipo, onTipo, className = "mb-4", acoes }: {
  r: ResumoPagar; tipo?: TipoPagar | ""; onTipo: (t: TipoPagar | "") => void; className?: string; acoes?: ReactNode;
}) {
  if (!r.n && !r.nSeguradas) return null;
  const fatias: FatiaAnel<TipoPagar>[] = r.linhas.map((l) => ({
    id: l.tipo, rotulo: TIPOS_PAGAR[l.tipo].rotulo, valor: l.total, cor: TIPOS_PAGAR[l.tipo].cor, neon: TIPOS_PAGAR[l.tipo].neon,
    dica: `${TIPOS_PAGAR[l.tipo].rotulo}: ${brl(l.total)}`,
  }));
  const daVez = tipo ? r.linhas.find((l) => l.tipo === tipo) : undefined;
  return (
    <QuadroEscuro rotulo="Quanto tem para pagar" titulo="Quanto tem" destaque="para pagar" acoes={acoes} className={className}
      filtro={tipo ? { texto: TIPOS_PAGAR[tipo].rotulo, onLimpar: () => onTipo("") } : undefined}>
      <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,15.5rem)_auto_minmax(0,1fr)] lg:gap-6">
        {/* celular: o anel primeiro, no centro */}
        <div className="order-1 min-w-0 lg:order-2">
          <AnelEscuro fatias={fatias} escolhida={tipo} onEscolher={onTipo}
            rotulo={`Para pagar ${brl(r.total)}: ${r.linhas.map((l) => `${TIPOS_PAGAR[l.tipo].rotulo} ${brl(l.total)}`).join(", ")}`}
            centro={{
              rotulo: daVez ? TIPOS_PAGAR[daVez.tipo].rotulo : "Para pagar", valor: brl(daVez ? daVez.total : r.total),
              sub: daVez ? `${daVez.n} ${pl(daVez.n, "conta", "contas")}` : `${r.n} ${pl(r.n, "conta", "contas")} em aberto`,
            }} />
        </div>

        <div className="order-2 grid min-w-0 grid-cols-2 gap-2 lg:order-1 lg:grid-cols-1">
          <NumeroEscuro icone={AlertTriangle} rotulo="Vencido" valor={brl(r.vencido)} sub={r.nVencidas ? `${r.nVencidas} ${pl(r.nVencidas, "conta atrasada", "contas atrasadas")}` : "nada atrasado"} de="#fb7185" ate="#e11d48" aceso={r.vencido > 0} />
          <NumeroEscuro icone={CalendarClock} rotulo="Próximos 7 dias" valor={brl(r.semana)} sub="vai sair esta semana" de="#fbbf24" ate="#d97706" aceso={r.semana > 0} />
          <NumeroEscuro icone={ClipboardCheck} rotulo="Falta aprovar" valor={brl(r.aprovar)} sub={r.nAprovar ? `${r.nAprovar} esperando o ok` : "tudo aprovado"} de="#c084fc" ate="#7c3aed" aceso={r.nAprovar > 0} />
          <NumeroEscuro icone={Ban} rotulo="Não pagar" valor={brl(r.seguradas)} sub={r.nSeguradas ? `${r.nSeguradas} ${pl(r.nSeguradas, "segurada", "seguradas")}, fora do total` : "nenhuma segurada"} de="#94a3b8" ate="#475569" />
        </div>

        <ul className="order-3 grid min-w-0 gap-1.5 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2" aria-label="Por tipo de conta">
          {r.linhas.map((l) => {
            const t = TIPOS_PAGAR[l.tipo], ativo = tipo === l.tipo;
            const pct = r.total ? Math.round((l.total / r.total) * 100) : 0;
            return (
              <li key={l.tipo} className="min-w-0">
                <LinhaEscura icone={ICONE_TIPO[l.tipo]} rotulo={t.rotulo} valor={brl(l.total)} pct={pct} cor={t.cor} neon={t.neon}
                  ativo={ativo} apagado={!!tipo && !ativo} onClick={() => onTipo(ativo ? "" : l.tipo)} title={`${t.dica} · toque para ver só estas contas`}
                  detalhes={<>
                    <span>{pct}% · {l.n} {pl(l.n, "conta", "contas")}</span>
                    {l.vencido > 0 && <span className="font-semibold text-[#fda4af]">{brl(l.vencido)} vencido</span>}
                    {l.nAprovar > 0 && <span className="font-semibold text-[#d8b4fe]">{l.nAprovar} falta aprovar</span>}
                  </>} />
              </li>
            );
          })}
        </ul>
      </div>
    </QuadroEscuro>
  );
}
