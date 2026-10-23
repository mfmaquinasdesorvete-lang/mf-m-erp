// Vitrine dos tokens do design system (src/design/tokens.js): os valores do visual com o nome de cada um, para
// quem faz tela nova escolher pelo nome em vez de inventar um valor solto.
import type { ReactNode } from "react";
import { BORDA, CAMADA, ESPACO, ESPACO_LETRAS, RAIO, SOMBRA, TEXTO } from "@/design/tokens.js";

function Grupo({ titulo, uso, children }: { titulo: string; uso: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="mb-2 text-xs text-slate-500">{uso}</p>
      {children}
    </div>
  );
}

const Nome = ({ children }: { children: ReactNode }) => <code className="text-2xs text-slate-500">{children}</code>;

export function TokensDesign() {
  const usoDoRaio = (k: string) => Object.entries(RAIO.uso).filter(([, x]) => x === k).map(([u]) => u);
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      <Grupo titulo="Cantos" uso="rounded-… (o nome de uso diz onde vale; a escolha “Cantos” da aparência muda todos)">
        <div className="flex flex-wrap gap-3">
          {(["md", "lg", "xl", "2xl"] as const).map((k) => (
            <div key={k} className="text-center">
              <div className="h-12 w-16 border-2 border-modulo bg-modulo/10" style={{ borderRadius: `var(--raio-${k})` }} aria-hidden />
              <Nome>rounded-{k}</Nome>
              {usoDoRaio(k).map((u) => <p key={u} className="text-2xs font-semibold text-modulo-texto">rounded-{u}</p>)}
            </div>
          ))}
        </div>
      </Grupo>

      <Grupo titulo="Letras" uso="text-… (tamanho e altura da linha; a fonte vem da aparência)">
        <ul className="space-y-0.5">
          {Object.entries(TEXTO).map(([k, [tam]]) => (
            <li key={k} className="flex items-baseline justify-between gap-2">
              <span className="truncate text-fg" style={{ fontSize: `var(--texto-${k})` }}>Sorvete</span>
              <Nome>text-{k} · {tam}</Nome>
            </li>
          ))}
        </ul>
      </Grupo>

      <Grupo titulo="Espaços" uso="p-, m-, gap- da escala (1 = 4px) e os nomes de uso">
        <ul className="space-y-1">
          {[["1", "4px"], ["2", "8px"], ["3", "12px"], ["4", "16px"], ["6", "24px"]].map(([k, px]) => (
            <li key={k} className="flex items-center gap-2"><span className="h-3 rounded-sm bg-modulo" style={{ width: px }} aria-hidden /><Nome>p-{k} · {px}</Nome></li>
          ))}
          {Object.entries(ESPACO).map(([k, x]) => <li key={k}><Nome>p-{k} / min-h-{k} · {x}</Nome></li>)}
        </ul>
      </Grupo>

      <Grupo titulo="Espaço entre letras" uso="tracking-… das caixas-altas pequenas">
        <ul className="space-y-1">
          {Object.entries(ESPACO_LETRAS).map(([k, x]) => (
            <li key={k} className="flex items-baseline justify-between gap-2">
              <span className="text-2xs font-bold uppercase text-fg" style={{ letterSpacing: x }}>Vendas do ano</span>
              <Nome>tracking-{k} · {x}</Nome>
            </li>
          ))}
        </ul>
      </Grupo>

      <Grupo titulo="Bordas e sombras" uso="border, border-2, border-4 · shadow-card, shadow-pop">
        <div className="flex flex-wrap gap-3">
          {Object.entries(BORDA).map(([k, x]) => (
            <div key={k} className="text-center"><div className="h-10 w-14 rounded-cartao border-slate-400" style={{ borderWidth: x }} aria-hidden /><Nome>{k} · {x}</Nome></div>
          ))}
          {Object.keys(SOMBRA).map((k) => (
            <div key={k} className="text-center"><div className={`h-10 w-14 rounded-cartao bg-surface ${k === "pop" ? "shadow-pop" : "shadow-card"}`} aria-hidden /><Nome>shadow-{k}</Nome></div>
          ))}
        </div>
      </Grupo>

      <Grupo titulo="Camadas" uso="z-… (o que fica por cima de quê)">
        <ul className="space-y-0.5">
          {Object.entries(CAMADA).map(([k, x]) => <li key={k} className="flex justify-between gap-2 text-xs text-fg"><span>z-{k}</span><Nome>{x}</Nome></li>)}
        </ul>
      </Grupo>
    </div>
  );
}
