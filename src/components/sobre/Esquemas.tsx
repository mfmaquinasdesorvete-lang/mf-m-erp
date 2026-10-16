// Esquemas (Sobre o ERP Line): desenhos simples para explicar e combinar com a equipe. Processo em rascunho de
// guardanapo, fluxograma do menu com a auditoria e cadeia de causas (fatos × hipóteses).
import { GitCommitVertical, Network, PenLine } from "lucide-react";
import { usePerfil } from "@/lib/auth";
import { useAbaUrl } from "@/lib/abaUrl";
import { PROCESSOS } from "@/lib/esquemas";
import { CadeiaCausas } from "./CadeiaCausas";
import { FluxoMenu } from "./FluxoMenu";
import { Guardanapo } from "./Guardanapo";

const TIPOS = ["processos", "menu", "causas"] as const;
type Tipo = (typeof TIPOS)[number];

export function Esquemas() {
  const { tem } = usePerfil();
  const podeCausas = tem("financeiro", "contador");
  const [tipo, setTipo] = useAbaUrl<Tipo>("processos", podeCausas ? TIPOS : TIPOS.filter((t) => t !== "causas"), "esquema");
  const [processo, setProcesso] = useAbaUrl<string>(PROCESSOS[0].id, PROCESSOS.map((p) => p.id), "processo");
  const opcoes: { v: Tipo; l: string; d: string; I: typeof PenLine }[] = [
    { v: "processos", l: "Processos", d: "O passo a passo em rascunho, para explicar à equipe", I: PenLine },
    { v: "menu", l: "Fluxograma do menu", d: "Áreas e telas, com a auditoria do menu", I: Network },
    ...(podeCausas ? [{ v: "causas" as const, l: "Cadeia de causas", d: "Por que algo aconteceu: fatos, hipóteses e evidências", I: GitCommitVertical }] : []),
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Tipo de esquema">
        {opcoes.map((o) => (
          <button key={o.v} type="button" aria-pressed={tipo === o.v} onClick={() => setTipo(o.v)}
            className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${tipo === o.v ? "border-modulo bg-modulo/10 ring-1 ring-modulo" : "border-slate-200 bg-surface hover:border-slate-300"}`}>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tipo === o.v ? "bg-modulo-escuro text-white" : "bg-slate-100 text-slate-600"}`}><o.I size={18} aria-hidden /></span>
            <span className="min-w-0"><span className="block text-sm font-bold text-fg">{o.l}</span><span className="block text-[12px] leading-snug text-slate-600">{o.d}</span></span>
          </button>
        ))}
      </div>
      {tipo === "processos" && <Guardanapo processoId={processo} onProcesso={setProcesso} />}
      {tipo === "menu" && <FluxoMenu />}
      {tipo === "causas" && podeCausas && <CadeiaCausas />}
    </div>
  );
}
