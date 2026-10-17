// Sobre o ERP Line → Sistemas: o ERP visto como sistemas (finance-os, analytics-os), módulo a módulo, com o que já tem,
// o que tem em parte e o que falta (e as telas onde está). No alto, a linha de comando do ECL, a linguagem de domínio
// (DSL) da empresa: VERBO + alvo (AUDIT financeiro, IMPROVE produtos…). A caixa do comando é escura nos dois temas
// (cores fixas: as "slate" do Tailwind se invertem no tema escuro).
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, CircleDashed, CircleDot, Layers, Lightbulb, Terminal } from "lucide-react";
import { Card, Stat } from "@/components/ui";
import { pl } from "@/lib/format";
import { ECL, interpretarEcl, SISTEMAS, SITUACOES, type Interpretacao, type Situacao } from "@/lib/sistemas";
import type { InicialItem } from "./ItemProjeto";

const SIT = Object.fromEntries(SITUACOES.map((s) => [s.id, s])) as Record<Situacao, (typeof SITUACOES)[number]>;

export function Sistemas({ onIdeia }: { onIdeia: (i: InicialItem) => void }) {
  const [filtro, setFiltro] = useState<Situacao | "">("");
  const modulos = SISTEMAS.flatMap((s) => s.modulos);
  const conta = (x: Situacao) => modulos.filter((m) => m.situacao === x).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sistemas" valor={SISTEMAS.length} icon={Layers} sub={`${modulos.length} módulos · ${ECL.length} comandos ECL`} />
        <Stat label="Já tem" valor={conta("tem")} icon={CheckCircle2} tom="bom" onClick={() => setFiltro(filtro === "tem" ? "" : "tem")} sub="funcionando no ERP" />
        <Stat label="Em parte" valor={conta("parcial")} icon={CircleDot} tom="atencao" onClick={() => setFiltro(filtro === "parcial" ? "" : "parcial")} sub="falta um pedaço" />
        <Stat label="Falta" valor={conta("falta")} icon={CircleDashed} tom={conta("falta") ? "critico" : "bom"} onClick={() => setFiltro(filtro === "falta" ? "" : "falta")} sub="vira ideia com um toque" />
      </div>

      <LinhaDeComando />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Situação do módulo">
        <button type="button" aria-pressed={!filtro} onClick={() => setFiltro("")}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${!filtro ? "bg-brand text-white ring-brand" : "bg-surface text-slate-700 ring-slate-200 hover:ring-slate-300"}`}>Todos</button>
        {SITUACOES.map((s) => (
          <button key={s.id} type="button" aria-pressed={filtro === s.id} onClick={() => setFiltro(filtro === s.id ? "" : s.id)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${filtro === s.id ? `${s.cor} ring-2` : "bg-surface text-slate-700 ring-slate-200 hover:ring-slate-300"}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${s.ponto}`} aria-hidden />{s.nome} <span className="text-xs opacity-70">{conta(s.id)}</span>
          </button>
        ))}
      </div>

      {SISTEMAS.map((s) => {
        const lista = s.modulos.filter((m) => !filtro || m.situacao === filtro);
        if (!lista.length) return null;
        const prontos = s.modulos.filter((m) => m.situacao === "tem").length;
        return (
          <Card key={s.id} className="overflow-hidden">
            <div className={`flex flex-wrap items-center gap-3 bg-gradient-to-r ${s.cor} p-4 text-white sm:p-5`}>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs font-semibold uppercase tracking-wider opacity-80">{s.id}</div>
                <h2 className="text-lg font-bold">{s.nome}</h2>
                <p className="text-sm opacity-90">{s.texto}</p>
              </div>
              <div className="shrink-0 text-right">
                <div className="num text-2xl font-bold">{Math.round((prontos / s.modulos.length) * 100)}%</div>
                <div className="text-xs opacity-90">{prontos} de {s.modulos.length} {pl(s.modulos.length, "módulo", "módulos")} completos</div>
              </div>
            </div>
            <ul className="grid gap-px bg-slate-100 sm:grid-cols-2">
              {lista.map((m) => {
                const st = SIT[m.situacao];
                return (
                  <li key={m.nome} className="flex min-w-0 flex-col gap-2 bg-surface p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-fg">{m.nome}</h3>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${st.cor}`}><span className={`h-2 w-2 rounded-full ${st.ponto}`} aria-hidden />{st.nome}</span>
                    </div>
                    <p className="text-sm text-slate-600">{m.texto}</p>
                    <div className="mt-auto flex flex-wrap gap-1.5">
                      {m.telas.map((t) => (
                        <Link key={t.to} to={t.to} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                          {t.rotulo} <ArrowRight size={12} aria-hidden />
                        </Link>
                      ))}
                      {m.situacao !== "tem" && (
                        <button type="button" onClick={() => onIdeia({ titulo: `${s.id} · ${m.nome}: `, detalhe: m.texto, area: "geral" })}
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
                          <Lightbulb size={12} aria-hidden /> Anotar o que falta
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

/** Enterprise Command Language: VERBO + alvo, e o ERP mostra onde fazer. */
function LinhaDeComando() {
  const [texto, setTexto] = useState("");
  const [res, setRes] = useState<Interpretacao | null>(null);
  const rodar = (t: string) => { setTexto(t); setRes(interpretarEcl(t)); };
  const enviar = (e: FormEvent) => { e.preventDefault(); rodar(texto); };

  return (
    <Card className="overflow-hidden">
      <div className="bg-[#0f172a] p-4 text-[#f1f5f9] sm:p-5">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#6ee7b7]"><Terminal size={14} aria-hidden /> Enterprise Command Language (ECL) <span className="rounded bg-[#34d399]/15 px-1.5 py-0.5 normal-case tracking-normal text-[#a7f3d0]">linguagem de domínio (DSL)</span></div>
        <p className="mb-2 text-sm text-[#cbd5e1]">A linguagem da MF para mandar no ERP: um verbo e o alvo, como numa ordem, com as palavras da empresa. O ERP mostra onde aquilo é feito.</p>
        <p className="mb-3 overflow-x-auto whitespace-nowrap font-mono text-xs text-[#94a3b8]">
          <span className="text-[#64748b]">gramática:</span> <span className="text-[#6ee7b7]">VERBO</span> <span className="text-[#7dd3fc]">alvo</span>
          <span className="text-[#64748b]"> · verbos:</span> {ECL.map((c) => c.verbo).join(" | ")}
          <span className="text-[#64748b]"> · alvos:</span> {[...new Set(ECL.flatMap((c) => c.alvos.map((a) => a.alvo)))].join(" | ")}
        </p>
        <form onSubmit={enviar} className="flex items-center gap-2 rounded-lg bg-[#1e293b] px-3 ring-1 ring-[#334155] focus-within:ring-[#34d399]">
          <span className="font-mono text-[#34d399]" aria-hidden>&gt;</span>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="AUDIT financeiro" aria-label="Comando ECL" autoComplete="off" spellCheck={false}
            className="h-11 min-w-0 flex-1 bg-transparent font-mono text-sm text-[#ffffff] placeholder:text-[#64748b] focus:outline-none" />
          <button type="submit" className="rounded-md bg-[#10b981] px-3 py-1.5 text-sm font-bold text-[#0f172a] hover:bg-[#34d399]">Rodar</button>
        </form>
        {res && (
          <div className="mt-3 text-sm" role="status">
            {res.ok ? (
              <>
                <div className="mb-2 text-[#cbd5e1]"><b className="font-mono text-[#6ee7b7]">{res.comando.verbo}</b> · {res.comando.nome}{res.alvo ? ` · ${res.alvo}` : " · em todas as áreas"}</div>
                <div className="flex flex-wrap gap-2">
                  {res.destinos.map((d) => (
                    <Link key={d.to + d.rotulo} to={d.to} className="inline-flex items-center gap-1 rounded-lg bg-[#10b981]/15 px-3 py-1.5 font-semibold text-[#a7f3d0] ring-1 ring-[#34d399]/40 hover:bg-[#10b981]/25">
                      {d.rotulo} <ArrowRight size={14} aria-hidden />
                    </Link>
                  ))}
                </div>
              </>
            ) : <span className="text-[#fcd34d]">{res.motivo}</span>}
          </div>
        )}
      </div>
      <ul className="grid gap-px bg-slate-100 sm:grid-cols-2">
        {ECL.map((c) => (
          <li key={c.verbo} className="bg-surface p-4">
            <div className="flex flex-wrap items-baseline gap-2"><span className="font-mono text-base font-bold text-violet-700">{c.verbo}</span><span className="font-semibold text-fg">{c.nome}</span></div>
            <p className="mt-1 text-sm text-slate-600">{c.texto}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.alvos.map((a) => (
                <button key={a.alvo} type="button" onClick={() => rodar(`${c.verbo} ${a.alvo}`)}
                  className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-700 hover:bg-violet-100 hover:text-violet-800">{c.verbo} {a.alvo}</button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
