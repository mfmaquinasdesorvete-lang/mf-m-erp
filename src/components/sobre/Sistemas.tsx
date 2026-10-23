// Sobre o ERP Line → Sistemas: o ERP visto como sistemas (finance-os, analytics-os, ops-os, innovation-os), módulo a
// módulo, com o que já tem, o que tem em parte e o que falta (e as telas onde está). No alto, a linha de comando do ECL,
// a linguagem de domínio (DSL) da empresa: VERBO + alvo (AUDIT financeiro, MONITOR backup, ANALYZE erp…). Cada comando
// mostra a entrega que se pode cobrar e o administrador registra a execução em 6 etapas (vai para Sobre → Monitor).
// A caixa do comando é escura nos dois temas (cores fixas: as "slate" do Tailwind se invertem no tema escuro).
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { ResultadosBusca } from "@/components/BuscaGeral";
import { ArrowRight, CheckCircle2, CircleDashed, CircleDot, ClipboardPlus, Layers, Lightbulb, PackageCheck, Terminal } from "lucide-react";
import { Card, Stat } from "@/components/ui";
import { dataBR, pl } from "@/lib/format";
import { usePerfil } from "@/lib/auth";
import { ETAPAS } from "@/lib/monitor";
import { CICLO_INOVACAO, DIMENSOES_ANALISE, ECL, interpretarEcl, SISTEMAS, SITUACOES, type Interpretacao, type Situacao } from "@/lib/sistemas";
import type { InicialItem } from "./ItemProjeto";
import { ExecucaoModal, type InicialExecucao } from "./Execucoes";

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

/** TRACE maquina <série>: a máquina com quem comprou, garantia e preventiva, e as OS com esse nº de série. */
function RastroMaquina({ serie }: { serie: string }) {
  const navigate = useNavigate();
  const termo = serie.trim();
  const q = useQuery({
    queryKey: ["ecl_trace_maquina", termo],
    enabled: termo.length >= 3,
    queryFn: async () => {
      const [eq, os] = await Promise.all([
        supabase.from("equipamentos").select("id, descricao, numero_serie, data_venda, garantia_ate, proxima_preventiva, origem, cliente:clientes(nome)").ilike("numero_serie", `%${termo}%`).limit(5),
        supabase.from("ordens_servico").select("id, numero, status, data_entrada, defeito_relatado").ilike("numero_serie", `%${termo}%`).order("numero", { ascending: false }).limit(8),
      ]);
      if (eq.error) throw eq.error;
      if (os.error) throw os.error;
      return { maquinas: (eq.data ?? []) as any[], oss: (os.data ?? []) as any[] };
    },
  });
  if (termo.length < 3) return <p className="mb-2 text-xs text-fixo-amber-300">Escreva pelo menos 3 letras ou números do nº de série.</p>;
  if (q.isLoading) return <p className="mb-2 text-xs text-fixo-slate-400">Procurando a máquina…</p>;
  if (q.isError) return <p className="mb-2 text-xs text-fixo-red-300">Não deu para procurar: {(q.error as Error).message}</p>;
  const { maquinas = [], oss = [] } = q.data ?? {};
  return (
    <div className="mb-2 space-y-1.5 rounded-lg bg-white/[0.04] p-2 ring-1 ring-white/10">
      {!maquinas.length && <p className="text-xs text-fixo-slate-400">Nenhuma máquina com o nº de série "{termo}".</p>}
      {maquinas.map((m) => (
        <div key={m.id} className="text-fixo-slate-200">
          <b className="text-white">{m.descricao}</b> <span className="font-mono text-xs text-fixo-slate-400">{m.numero_serie}</span>
          <div className="text-xs text-fixo-slate-300">{[m.cliente?.nome ?? "sem cliente", m.data_venda ? `comprada em ${dataBR(m.data_venda)}` : "sem data da compra",
            m.garantia_ate ? `garantia até ${dataBR(m.garantia_ate)}` : "sem garantia marcada", m.proxima_preventiva ? `preventiva ${dataBR(m.proxima_preventiva)}` : "sem preventiva", m.origem].filter(Boolean).join(" · ")}</div>
        </div>
      ))}
      {oss.length > 0 && <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-fixo-slate-400">Ordens de serviço</div>}
      {oss.map((o) => (
        <button key={o.id} type="button" onClick={() => navigate("/assistencia", { state: { abrir: o.id } })} className="block w-full rounded px-1 py-0.5 text-left text-xs text-fixo-slate-200 hover:bg-white/5">
          <b>OS #{o.numero}</b> · {String(o.status).replace(/_/g, " ")}{o.data_entrada ? ` · ${dataBR(o.data_entrada)}` : ""}{o.defeito_relatado ? ` · ${o.defeito_relatado}` : ""}
        </button>
      ))}
    </div>
  );
}

/** Enterprise Command Language: VERBO + alvo, e o ERP mostra onde fazer. */
function LinhaDeComando() {
  const ehAdmin = usePerfil().papel === "admin";
  const [texto, setTexto] = useState("");
  const [res, setRes] = useState<Interpretacao | null>(null);
  const [execucao, setExecucao] = useState<InicialExecucao | null>(null);
  const rodar = (t: string) => { setTexto(t); setRes(interpretarEcl(t)); };
  const enviar = (e: FormEvent) => { e.preventDefault(); rodar(texto); };

  return (
    <Card className="overflow-hidden">
      <div className="bg-fixo-slate-900 p-4 text-fixo-slate-100 sm:p-5">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fixo-emerald-300"><Terminal size={14} aria-hidden /> Enterprise Command Language (ECL) <span className="rounded bg-fixo-emerald-400/15 px-1.5 py-0.5 normal-case tracking-normal text-fixo-emerald-200">linguagem de domínio (DSL)</span></div>
        <p className="mb-2 text-sm text-fixo-slate-300">A linguagem da MF para mandar no ERP: um verbo e o alvo, como numa ordem, com as palavras da empresa. O ERP mostra onde aquilo é feito e a entrega de cada comando.</p>
        <p className="mb-2 overflow-x-auto whitespace-nowrap font-mono text-xs text-fixo-slate-400"><span className="text-fixo-slate-500">cada execução registra:</span> {ETAPAS.map((x) => x.nome.toLowerCase()).join(" → ")}</p>
        <p className="mb-3 overflow-x-auto whitespace-nowrap font-mono text-xs text-fixo-slate-400">
          <span className="text-fixo-slate-500">gramática:</span> <span className="text-fixo-emerald-300">VERBO</span> <span className="text-fixo-sky-300">alvo</span>
          <span className="text-fixo-slate-500"> · verbos:</span> {ECL.map((c) => c.verbo).join(" | ")}
          <span className="text-fixo-slate-500"> · alvos:</span> {[...new Set(ECL.flatMap((c) => c.alvos.map((a) => a.alvo)))].join(" | ")}
        </p>
        <p className="mb-3 text-xs text-fixo-slate-400"><span className="text-fixo-slate-500">no chat do Claude, o comando vira o trabalho feito (auditoria, análise ou rastreio completo):</span>{" "}
          {["AUDIT pedidos", "ANALYZE erp", "TRACE cliente <nome>"].map((c) => <code key={c} className="mr-1.5 rounded bg-fixo-slate-800 px-1.5 py-0.5 font-mono text-fixo-emerald-200">{c}</code>)}</p>
        <form onSubmit={enviar} className="flex items-center gap-2 rounded-lg bg-fixo-slate-800 px-3 ring-1 ring-fixo-slate-700 focus-within:ring-fixo-emerald-400">
          <span className="font-mono text-fixo-emerald-400" aria-hidden>&gt;</span>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="AUDIT financeiro" aria-label="Comando ECL" autoComplete="off" spellCheck={false}
            className="h-11 min-w-0 flex-1 bg-transparent font-mono text-sm text-white placeholder:text-fixo-slate-500 focus:outline-none" />
          <button type="submit" className="rounded-md bg-fixo-emerald-500 px-3 py-1.5 text-sm font-bold text-fixo-slate-900 hover:bg-fixo-emerald-400">Rodar</button>
        </form>
        {res && (
          <div className="mt-3 text-sm" role="status">
            {res.ok ? (
              <>
                <div className="mb-2 text-fixo-slate-300"><b className="font-mono text-fixo-emerald-300">{res.comando.verbo}</b> · {res.comando.nome}{res.alvo ? ` · ${res.alvo}` : " · em todas as áreas"}</div>
                <p className="mb-2 flex items-start gap-1.5 text-fixo-slate-200"><PackageCheck size={16} className="mt-0.5 shrink-0 text-fixo-emerald-300" aria-hidden /><span><b className="text-fixo-emerald-200">Entrega:</b> {res.comando.entrega}</span></p>
                {res.comando.verbo === "ANALYZE" && <Passos titulo="Os 6 pontos" itens={DIMENSOES_ANALISE.map((d) => ({ nome: d.nome, texto: d.pergunta }))} />}
                {res.comando.verbo === "INNOVATE" && <Passos titulo="O ciclo" itens={CICLO_INOVACAO} />}
                {res.comando.verbo === "TRACE" && (res.argumento
                  ? (res.alvo === "maquina" ? <RastroMaquina serie={res.argumento} /> : <div className="mb-2"><ResultadosBusca termo={res.argumento} onIr={() => undefined} /></div>)
                  : <p className="mb-2 text-xs text-fixo-amber-300">Escreva o que procurar depois do alvo, por exemplo: TRACE maquina 050626366-01, TRACE pedido 554 ou TRACE cliente padaria.</p>)}
                <div className="flex flex-wrap gap-2">
                  {res.destinos.map((d) => (
                    <Link key={d.to + d.rotulo} to={d.to} className="inline-flex items-center gap-1 rounded-lg bg-fixo-emerald-500/15 px-3 py-1.5 font-semibold text-fixo-emerald-200 ring-1 ring-fixo-emerald-400/40 hover:bg-fixo-emerald-500/25">
                      {d.rotulo} <ArrowRight size={14} aria-hidden />
                    </Link>
                  ))}
                  {ehAdmin && (
                    <button type="button" onClick={() => setExecucao({ comando: res.comando.verbo, alvo: res.alvo, situacao: "em_andamento", entrada: texto.trim() })}
                      className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 font-semibold text-fixo-slate-900 hover:bg-fixo-slate-200">
                      <ClipboardPlus size={14} aria-hidden /> Registrar execução
                    </button>
                  )}
                </div>
              </>
            ) : <span className="text-fixo-amber-300">{res.motivo}</span>}
          </div>
        )}
      </div>
      <ul className="grid gap-px bg-slate-100 sm:grid-cols-2">
        {ECL.map((c) => (
          <li key={c.verbo} className="bg-surface p-4">
            <div className="flex flex-wrap items-baseline gap-2"><span className="font-mono text-base font-bold text-violet-700">{c.verbo}</span><span className="font-semibold text-fg">{c.nome}</span></div>
            <p className="mt-1 text-sm text-slate-600">{c.texto}</p>
            <p className="mt-1 text-sm text-fg"><b>Entrega:</b> {c.entrega}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.alvos.map((a) => (
                <button key={a.alvo} type="button" onClick={() => rodar(`${c.verbo} ${a.alvo}`)}
                  className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-700 hover:bg-violet-100 hover:text-violet-800">{c.verbo} {a.alvo}</button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {execucao && <ExecucaoModal inicial={execucao} onClose={() => setExecucao(null)} />}
    </Card>
  );
}

/** As etapas de um comando (os 6 pontos do ANALYZE, o ciclo do INNOVATE), numeradas, na caixa escura. */
function Passos({ titulo, itens }: { titulo: string; itens: { nome: string; texto: string }[] }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-fixo-slate-400">{titulo}</div>
      <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {itens.map((x, i) => (
          <li key={x.nome} className="rounded-md bg-fixo-slate-800 px-2.5 py-1.5 ring-1 ring-fixo-slate-700">
            <b className="text-fixo-sky-300">{i + 1}. {x.nome}</b> <span className="text-xs text-fixo-slate-300">{x.texto}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
