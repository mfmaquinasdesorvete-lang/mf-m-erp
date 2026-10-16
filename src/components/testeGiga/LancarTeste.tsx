// Lançamento rápido do teste do giga, para a bancada (celular ou tablet): máquina e NS (sugere os NS das OPs da
// máquina), operador, três botões grandes Aprovado/Reprovado, medidas opcionais (o ERP sugere pelo limite) e
// observação. Salvar já abre o próximo, com a mesma máquina, OP, operador e giga.
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, CircleDashed, Info, RotateCcw, Save, XCircle } from "lucide-react";
import { Button, Field } from "@/components/ui";
import { CampoUnidade, useUnidade } from "@/lib/unidade";
import { usePerfil } from "@/lib/auth";
import { useInvalidate } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import {
  aprovada, dataHoraBR, divergencias, falhas, fmtNum, historicoPorNs, lerNumero, normalizarNs, nsDaOp, parametrosDoModelo, resultadoGeral,
  rotuloTipo, situacaoMaquina, sugerirAterramento, sugerirTensao, type Resultado, type Sugestao,
} from "@/lib/testeGiga";
import { CHAVES_GIGA, lancarTesteGiga, useOperadoresGiga, type RespostaLancamento } from "@/lib/testeGigaDados";
import type { ContextoGiga, OpGiga } from "./tipos";

type Form = {
  produto_id: string; numero_serie: string; ordem_producao_id: string; unidade_id: string;
  /** "" = quem está lançando · "f:<id>" funcionário · "u:<id>" usuário · "outro" nome escrito */
  operador: string; operador_nome: string; giga: string;
  funcional: Resultado | null; aterramento: Resultado | null; tensao: Resultado | null;
  /** o resultado veio da sugestão pelo limite (muda sozinho se a medida mudar) */
  autoA: boolean; autoT: boolean;
  aterramento_resistencia_ohm: string; aterramento_corrente_a: string; tensao_aplicada_v: string; tensao_tempo_s: string; tensao_fuga_ma: string;
  observacoes: string;
  /** "" = agora · data e hora do papel (datetime-local) */
  testado_em: string;
};
const DO_TESTE = {
  numero_serie: "", funcional: null, aterramento: null, tensao: null, autoA: false, autoT: false,
  aterramento_resistencia_ohm: "", aterramento_corrente_a: "", tensao_aplicada_v: "", tensao_tempo_s: "", tensao_fuga_ma: "", observacoes: "",
} satisfies Partial<Form>;
const LEMBRAR = "erp.giga.ultimo";
type Lembrado = Pick<Form, "produto_id" | "operador" | "operador_nome" | "giga" | "unidade_id">;

function lerLembrado(): Partial<Lembrado> {
  try { return JSON.parse(localStorage.getItem(LEMBRAR) ?? "{}") as Partial<Lembrado>; } catch { return {}; }
}
function lembrar(f: Form) {
  try {
    const l: Lembrado = { produto_id: f.produto_id, operador: f.operador, operador_nome: f.operador_nome, giga: f.giga, unidade_id: f.unidade_id };
    localStorage.setItem(LEMBRAR, JSON.stringify(l));
  } catch { /* sem armazenamento: só não lembra */ }
}
/** "agora" no formato do campo datetime-local (horário do aparelho). */
const agoraLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };

export type Preenchido = { produto_id?: string | null; ordem_producao_id?: string | null; numero_serie?: string | null };
type Ultimo = RespostaLancamento & { produto_id: string; ordem_producao_id: string };

export function LancarTeste({ ctx, inicial, onVerRegistros }: { ctx: ContextoGiga; inicial?: Preenchido | null; onVerRegistros: () => void }) {
  const { nome: meuNome } = usePerfil();
  const { padrao } = useUnidade();
  const invalidar = useInvalidate();
  const { data: operadores = [] } = useOperadoresGiga();
  const nsRef = useRef<HTMLInputElement>(null);
  const [salvando, setSalvando] = useState(false);
  const [outraData, setOutraData] = useState(false);
  const [ultimo, setUltimo] = useState<Ultimo | null>(null);
  const [f, setF] = useState<Form>(() => {
    const l = lerLembrado();
    const produto = inicial?.produto_id || (l.produto_id && ctx.maquinas.some((m) => m.id === l.produto_id) ? l.produto_id : "");
    return {
      ...DO_TESTE, produto_id: produto ?? "", ordem_producao_id: inicial?.ordem_producao_id ?? "", unidade_id: l.unidade_id || padrao || "",
      operador: l.operador ?? "", operador_nome: l.operador_nome ?? "", giga: l.giga ?? "", testado_em: "",
      numero_serie: normalizarNs(inicial?.numero_serie),
    };
  });
  // máquinas carregam depois: a última usada volta quando a lista chega
  useEffect(() => {
    if (f.produto_id || !ctx.maquinas.length) return;
    const l = lerLembrado();
    if (l.produto_id && ctx.maquinas.some((m) => m.id === l.produto_id)) setF((x) => ({ ...x, produto_id: l.produto_id! }));
  }, [ctx.maquinas]); // eslint-disable-line react-hooks/exhaustive-deps

  const par = useMemo(() => parametrosDoModelo(ctx.parametros, f.produto_id), [ctx.parametros, f.produto_id]);
  const historico = useMemo(() => historicoPorNs(ctx.testes), [ctx.testes]);
  const ns = normalizarNs(f.numero_serie);
  const sit = ns && historico.get(ns) ? situacaoMaquina(ns, historico.get(ns)!) : null;
  const outroModelo = !!sit && !!f.produto_id && sit.ultimo.produto_id !== f.produto_id;

  // OPs da máquina (abertas ou concluídas há até 60 dias) e os NS delas que ainda não têm teste aprovado
  const opsDaMaquina = useMemo(() => {
    const limite = Date.now() - 60 * 864e5;
    return ctx.ops.filter((o) => o.produto_id === f.produto_id
      && (["planejada", "em_producao"].includes(o.status) || (o.status === "concluida" && Date.parse(o.concluida_em ?? "") >= limite)))
      .sort((a, b) => b.numero - a.numero);
  }, [ctx.ops, f.produto_id]);
  const sugestoesNs = useMemo(() => opsDaMaquina.flatMap((o) => nsDaOp(o.numeros_serie).map((n) => ({ ns: n, op: o, h: historico.get(n) })))
    .filter((s) => !s.h?.some(aprovada)).slice(0, 24), [opsDaMaquina, historico]);

  const num = {
    res: lerNumero(f.aterramento_resistencia_ohm), cor: lerNumero(f.aterramento_corrente_a),
    vol: lerNumero(f.tensao_aplicada_v), tempo: lerNumero(f.tensao_tempo_s), fuga: lerNumero(f.tensao_fuga_ma),
  };
  const sugA = sugerirAterramento(num.res, num.cor, par.valores);
  const sugT = sugerirTensao(num.vol, num.tempo, num.fuga, par.valores);
  const div = divergencias({ aterramento: f.aterramento, tensao: f.tensao, aterramento_resistencia_ohm: num.res, tensao_fuga_ma: num.fuga }, par.valores);
  const geral = resultadoGeral(f);
  const invalida = Object.values(num).some((v) => v != null && Number.isNaN(v));

  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  /** Medida digitada: se o resultado ainda não foi escolhido (ou veio da sugestão), segue a sugestão pelo limite. */
  function medida(campo: keyof Form, valor: string) {
    setF((x) => {
      const n = { ...x, [campo]: valor } as Form;
      const sA = sugerirAterramento(lerNumero(n.aterramento_resistencia_ohm), lerNumero(n.aterramento_corrente_a), par.valores).sugestao;
      const sT = sugerirTensao(lerNumero(n.tensao_aplicada_v), lerNumero(n.tensao_tempo_s), lerNumero(n.tensao_fuga_ma), par.valores).sugestao;
      if (sA && (n.autoA || !n.aterramento)) { n.aterramento = sA; n.autoA = true; } else if (!sA && n.autoA) { n.aterramento = null; n.autoA = false; }
      if (sT && (n.autoT || !n.tensao)) { n.tensao = sT; n.autoT = true; } else if (!sT && n.autoT) { n.tensao = null; n.autoT = false; }
      return n;
    });
  }
  function escolherNs(n: string, op: OpGiga) {
    set({ numero_serie: n, ordem_producao_id: op.id, ...(op.unidade_id ? { unidade_id: op.unidade_id } : {}) });
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const erro = !f.produto_id ? "Escolha a máquina testada."
      : !ns ? "Informe o número de série (NS)."
      : sit?.aprovado ? `O NS ${ns} já tem teste aprovado (nº ${sit.aprovado.numero}).`
      : outroModelo ? `O NS ${ns} já foi testado como outro modelo: confira o número.`
      : !f.funcional || !f.aterramento || !f.tensao ? "Marque Aprovado ou Reprovado nos três testes."
      : invalida ? "Confira as medidas: há número inválido."
      : div.length && !f.observacoes.trim() ? "Medida fora do limite marcada como aprovada: explique nas observações."
      : f.operador === "outro" && !f.operador_nome.trim() ? "Escreva o nome do operador."
      : null;
    if (erro) return notifyError(new Error(erro));
    setSalvando(true);
    try {
      const [tipo, id] = f.operador.split(":");
      const r = await lancarTesteGiga({
        produto_id: f.produto_id, numero_serie: ns, ordem_producao_id: f.ordem_producao_id || null, unidade_id: f.unidade_id || null,
        testado_em: outraData && f.testado_em ? new Date(f.testado_em).toISOString() : null,
        operador_funcionario_id: tipo === "f" ? id : null, operador_user_id: tipo === "u" ? id : null,
        operador_nome: f.operador === "outro" ? f.operador_nome.trim() : null,
        funcional: f.funcional!, aterramento: f.aterramento!, tensao: f.tensao!,
        aterramento_resistencia_ohm: num.res, aterramento_corrente_a: num.cor, tensao_aplicada_v: num.vol, tensao_tempo_s: num.tempo, tensao_fuga_ma: num.fuga,
        giga: f.giga.trim() || null, observacoes: f.observacoes.trim() || null,
      });
      setUltimo({ ...r, numero: Number(r.numero), produto_id: f.produto_id, ordem_producao_id: f.ordem_producao_id });
      notify(`Teste nº ${r.numero} gravado: ${r.numero_serie} ${r.resultado === "aprovada" ? "APROVADA" : "REPROVADA"}${r.tentativa > 1 ? ` (${r.tentativa}ª tentativa)` : ""}`);
      invalidar(...CHAVES_GIGA);
      lembrar(f);
      setF((x) => ({ ...x, ...DO_TESTE }));
      setTimeout(() => nsRef.current?.focus(), 50);
    } catch (err) {
      notifyError(err);
    } finally {
      setSalvando(false);
    }
  }

  const maquina = (id: string) => ctx.nomeMaquina(id);
  const funcionarios = operadores.filter((o) => o.tipo === "funcionario");
  const usuarios = operadores.filter((o) => o.tipo === "usuario");

  return (
    <form onSubmit={salvar} className="mx-auto max-w-3xl space-y-4">
      {ultimo && (
        <div role="status" className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm ${ultimo.resultado === "aprovada" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {ultimo.resultado === "aprovada" ? <CheckCircle2 size={18} aria-hidden /> : <XCircle size={18} aria-hidden />}
          <span className="min-w-0 flex-1">
            Último: <b>nº {ultimo.numero}</b> · {maquina(ultimo.produto_id)} · <b>{ultimo.numero_serie}</b> · {ultimo.resultado === "aprovada" ? "aprovada" : "reprovada"}
            {ultimo.tentativa > 1 && ` (${ultimo.tentativa}ª tentativa)`}
          </span>
          {ultimo.resultado === "reprovada" && (
            <button type="button" className="inline-flex items-center gap-1 font-semibold underline"
              onClick={() => set({ numero_serie: ultimo.numero_serie, produto_id: ultimo.produto_id, ordem_producao_id: ultimo.ordem_producao_id })}>
              <RotateCcw size={14} aria-hidden /> Reteste deste NS
            </button>
          )}
          <button type="button" className="font-semibold underline" onClick={onVerRegistros}>Ver registros</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-surface p-3 shadow-card sm:grid-cols-2 sm:p-4">
        <Field label="Máquina (modelo)" className="sm:col-span-2">
          <select className="input text-base font-semibold" value={f.produto_id} required
            onChange={(e) => set({ produto_id: e.target.value, ordem_producao_id: "" })}>
            <option value="">Escolha a máquina…</option>
            {ctx.maquinas.filter((m) => m.ativo !== false || m.id === f.produto_id).map((m) => <option key={m.id} value={m.id}>{ctx.nomeMaquina(m.id)}</option>)}
          </select>
        </Field>

        <div className="sm:col-span-2">
          <Field label="Número de série (NS)">
            <input ref={nsRef} className="input num text-lg font-bold uppercase tracking-wide placeholder:font-normal placeholder:normal-case" value={f.numero_serie} autoComplete="off" autoCapitalize="characters"
              spellCheck={false} placeholder="Ex.: MF-0001" onChange={(e) => set({ numero_serie: e.target.value })} aria-describedby="giga-ns-situacao" />
          </Field>
          {sugestoesNs.length > 0 && (
            <div className="mt-2">
              <span className="mb-1 block text-xs font-semibold text-slate-500">NS das OPs desta máquina (toque para usar)</span>
              <div className="flex flex-wrap gap-1.5">
                {sugestoesNs.map((s) => (
                  <button key={`${s.op.id}-${s.ns}`} type="button" onClick={() => escolherNs(s.ns, s.op)} aria-pressed={ns === s.ns}
                    className={`num inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${ns === s.ns ? "border-transparent bg-modulo-escuro text-white" : "border-slate-300 bg-surface text-fg hover:bg-slate-50"}`}>
                    {s.ns} <span className={`text-[11px] font-normal ${ns === s.ns ? "text-white/80" : "text-slate-500"}`}>OP #{s.op.numero}{s.h?.length ? " · reteste" : ""}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div id="giga-ns-situacao" aria-live="polite">
            {sit?.aprovado && (
              <Aviso tom="erro" icone={XCircle}>
                O NS <b>{ns}</b> já tem teste aprovado (nº {sit.aprovado.numero}, {dataHoraBR(sit.aprovado.testado_em)}, {sit.aprovado.operador_nome}). Não dá para lançar de novo.
                Se foi engano, anule aquele lançamento em Registros.
              </Aviso>
            )}
            {sit && !sit.aprovado && !outroModelo && (
              <Aviso tom="atencao" icone={RotateCcw}>
                <b>Reteste: {sit.tentativas + 1}ª tentativa.</b> Último teste nº {sit.ultimo.numero} em {dataHoraBR(sit.ultimo.testado_em)}, reprovado em{" "}
                {falhas(sit.ultimo).map(rotuloTipo).join(", ").toLowerCase()}. O novo teste fica ligado a ele.
              </Aviso>
            )}
            {outroModelo && sit && (
              <Aviso tom="erro" icone={AlertTriangle}>O NS <b>{ns}</b> já foi testado como <b>{maquina(sit.ultimo.produto_id)}</b>. Confira o número ou a máquina.</Aviso>
            )}
          </div>
        </div>

        <Field label="Ordem de produção (opcional)">
          <select className="input" value={f.ordem_producao_id} onChange={(e) => set({ ordem_producao_id: e.target.value })}>
            <option value="">Sem OP</option>
            {opsDaMaquina.map((o) => <option key={o.id} value={o.id}>OP #{o.numero} · {o.status === "concluida" ? "concluída" : o.status === "em_producao" ? "em produção" : "planejada"}</option>)}
            {f.ordem_producao_id && !opsDaMaquina.some((o) => o.id === f.ordem_producao_id) && (
              <option value={f.ordem_producao_id}>OP #{ctx.ops.find((o) => o.id === f.ordem_producao_id)?.numero ?? "?"}</option>
            )}
          </select>
        </Field>
        <Field label="Operador">
          <select className="input" value={f.operador} onChange={(e) => set({ operador: e.target.value })}>
            <option value="">Eu ({meuNome})</option>
            {funcionarios.length > 0 && <optgroup label="Funcionários">{funcionarios.map((o) => <option key={o.id} value={`f:${o.id}`}>{o.nome}{o.detalhe ? ` · ${o.detalhe}` : ""}</option>)}</optgroup>}
            {usuarios.length > 0 && <optgroup label="Usuários do ERP">{usuarios.map((o) => <option key={o.id} value={`u:${o.id}`}>{o.nome}</option>)}</optgroup>}
            <option value="outro">Outro (escrever o nome)</option>
          </select>
        </Field>
        {f.operador === "outro" && (
          <Field label="Nome do operador" className="sm:col-span-2">
            <input className="input" value={f.operador_nome} maxLength={120} onChange={(e) => set({ operador_nome: e.target.value })} />
          </Field>
        )}
        <Field label="Giga usada (nº, opcional)">
          <input className="input" value={f.giga} maxLength={60} placeholder="Ex.: Giga 1" onChange={(e) => set({ giga: e.target.value })} />
        </Field>
        <div className="min-w-0">
          <CampoUnidade value={f.unidade_id} onChange={(id) => set({ unidade_id: id })} label="Unidade" />
        </div>
      </div>

      {!par.temAlgum && f.produto_id && (
        <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-surface p-3 text-xs text-slate-600">
          <Info size={15} className="mt-0.5 shrink-0" aria-hidden />
          Sem limites cadastrados para esta máquina: o ERP não sugere aprovado/reprovado pelas medidas. O administrador cadastra em Parâmetros.
        </p>
      )}

      <Escolha rotulo="Funcional" valor={f.funcional} onChange={(v) => set({ funcional: v })} />

      <Escolha rotulo="Continuidade do aterramento" valor={f.aterramento} onChange={(v) => set({ aterramento: v, autoA: false })} sugestao={sugA} auto={f.autoA}>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Medida rotulo="Resistência medida" unidade="Ω" valor={f.aterramento_resistencia_ohm} onChange={(v) => medida("aterramento_resistencia_ohm", v)}
            limite={par.valores.aterramento_resistencia_max_ohm != null ? `limite ${fmtNum(par.valores.aterramento_resistencia_max_ohm)} Ω` : undefined} />
          <Medida rotulo="Corrente de teste" unidade="A" valor={f.aterramento_corrente_a} onChange={(v) => medida("aterramento_corrente_a", v)}
            limite={par.valores.aterramento_corrente_a != null ? `ensaio ${fmtNum(par.valores.aterramento_corrente_a)} A` : undefined} />
        </div>
      </Escolha>

      <Escolha rotulo="Tensão suportável" valor={f.tensao} onChange={(v) => set({ tensao: v, autoT: false })} sugestao={sugT} auto={f.autoT}>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Medida rotulo="Tensão" unidade="V" valor={f.tensao_aplicada_v} onChange={(v) => medida("tensao_aplicada_v", v)}
            limite={par.valores.tensao_v != null ? `ensaio ${fmtNum(par.valores.tensao_v)} V` : undefined} />
          <Medida rotulo="Tempo" unidade="s" valor={f.tensao_tempo_s} onChange={(v) => medida("tensao_tempo_s", v)}
            limite={par.valores.tensao_tempo_s != null ? `ensaio ${fmtNum(par.valores.tensao_tempo_s)} s` : undefined} />
          <Medida rotulo="Fuga" unidade="mA" valor={f.tensao_fuga_ma} onChange={(v) => medida("tensao_fuga_ma", v)}
            limite={par.valores.tensao_fuga_max_ma != null ? `máx. ${fmtNum(par.valores.tensao_fuga_max_ma)} mA` : undefined} />
        </div>
      </Escolha>

      {div.length > 0 && (
        <Aviso tom="atencao" icone={AlertTriangle}>
          <b>Medida fora do limite marcada como aprovada.</b> {div.join("; ")}. Explique nas observações (fica registrado no REG-006).
        </Aviso>
      )}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-surface p-3 shadow-card sm:p-4">
        <Field label={div.length ? "Observações (obrigatório: medida fora do limite)" : "Observações"}>
          <textarea className="input" rows={2} maxLength={1000} value={f.observacoes} required={div.length > 0}
            placeholder={geral === "reprovada" ? "O que falhou e o que foi feito (ex.: cabo terra solto, reapertado)" : "Opcional"}
            onChange={(e) => set({ observacoes: e.target.value })} />
        </Field>
        {outraData ? (
          <Field label="Data e hora do teste (do papel)">
            <span className="flex flex-wrap items-center gap-2">
              <input type="datetime-local" className="input w-auto" value={f.testado_em} max={agoraLocal()} required onChange={(e) => set({ testado_em: e.target.value })} />
              <button type="button" className="text-sm font-semibold text-brand hover:underline" onClick={() => { setOutraData(false); set({ testado_em: "" }); }}>Usar agora</button>
            </span>
          </Field>
        ) : (
          <button type="button" onClick={() => { setOutraData(true); set({ testado_em: agoraLocal() }); }}
            className="inline-flex items-center gap-1.5 justify-self-start text-sm font-semibold text-brand hover:underline">
            <CalendarClock size={15} aria-hidden /> Lançar com outra data (teste anotado no papel)
          </button>
        )}
      </div>

      <div className="sticky bottom-20 z-10 flex items-center gap-2 rounded-2xl border border-slate-200 bg-surface/95 p-2.5 shadow-pop backdrop-blur md:bottom-4">
        <ResultadoGeral geral={geral} />
        <Button type="submit" className="min-h-[52px] shrink-0 whitespace-nowrap px-4 text-base sm:px-6" disabled={salvando || !!sit?.aprovado || outroModelo}>
          <Save size={18} /> {salvando ? "Salvando…" : "Salvar e próximo"}
        </Button>
      </div>
    </form>
  );
}

function ResultadoGeral({ geral }: { geral: "aprovada" | "reprovada" | null }) {
  // no celular o texto é curto: o botão de salvar fica ao lado, numa linha só
  const cfg = geral === "aprovada" ? { cor: "bg-emerald-50 text-emerald-800 border-emerald-200", Icone: CheckCircle2, texto: "Máquina APROVADA", curto: "APROVADA" }
    : geral === "reprovada" ? { cor: "bg-red-50 text-red-700 border-red-200", Icone: XCircle, texto: "Máquina REPROVADA", curto: "REPROVADA" }
    : { cor: "bg-slate-50 text-slate-600 border-slate-200", Icone: CircleDashed, texto: "Marque os três testes", curto: "Marque os 3" };
  return (
    <span className={`flex min-h-[52px] min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 text-sm font-bold ${cfg.cor}`} aria-live="polite">
      <cfg.Icone size={20} aria-hidden className="shrink-0" />
      <span className="truncate sm:hidden">{cfg.curto}</span><span className="hidden truncate sm:inline">{cfg.texto}</span>
    </span>
  );
}

/** Um teste: dois botões grandes (Aprovado / Reprovado), a sugestão pelo limite e as medidas. */
function Escolha({ rotulo, valor, onChange, sugestao, auto, children }: {
  rotulo: string; valor: Resultado | null; onChange: (v: Resultado) => void; sugestao?: Sugestao; auto?: boolean; children?: ReactNode;
}) {
  return (
    <fieldset className="rounded-2xl border border-slate-200 bg-surface p-3 shadow-card sm:p-4">
      <legend className="sr-only">{rotulo}</legend>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[15px] font-bold text-fg" aria-hidden>{rotulo}</span>
        {sugestao?.sugestao && (
          <span className={`text-xs font-semibold ${sugestao.sugestao === "aprovado" ? "text-emerald-700" : "text-red-700"}`}>
            {auto ? "Marcado pela medida" : "Sugestão pelo limite"}: {sugestao.sugestao} ({sugestao.motivo})
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={rotulo}>
        <BotaoResultado tipo="aprovado" ativo={valor === "aprovado"} onClick={() => onChange("aprovado")} />
        <BotaoResultado tipo="reprovado" ativo={valor === "reprovado"} onClick={() => onChange("reprovado")} />
      </div>
      {children}
      {!!sugestao?.alertas.length && (
        <ul className="mt-2 space-y-0.5 text-xs font-semibold text-amber-700">
          {sugestao.alertas.map((a) => <li key={a} className="flex items-start gap-1"><AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden /> {a}</li>)}
        </ul>
      )}
    </fieldset>
  );
}

function BotaoResultado({ tipo, ativo, onClick }: { tipo: Resultado; ativo: boolean; onClick: () => void }) {
  const ap = tipo === "aprovado";
  const cor = ativo
    ? `border-transparent text-white shadow-pop ${ap ? "bg-solido-verde" : "bg-solido-vermelho"}`
    : ap ? "border-emerald-200 bg-surface text-emerald-700 hover:bg-emerald-50" : "border-red-200 bg-surface text-red-700 hover:bg-red-50";
  return (
    <button type="button" role="radio" aria-checked={ativo} onClick={onClick}
      className={`flex min-h-[60px] items-center justify-center gap-2 rounded-xl border-2 px-2 text-base font-bold transition active:scale-[0.98] ${cor}`}>
      {ap ? <CheckCircle2 size={22} aria-hidden /> : <XCircle size={22} aria-hidden />} {ap ? "Aprovado" : "Reprovado"}
    </button>
  );
}

function Medida({ rotulo, unidade, valor, onChange, limite }: { rotulo: string; unidade: string; valor: string; onChange: (v: string) => void; limite?: string }) {
  const invalido = Number.isNaN(lerNumero(valor));
  return (
    <label className="block min-w-0">
      <span className="mb-1 block truncate text-xs font-semibold text-slate-600">{rotulo}</span>
      <span className="relative block">
        <input className={`input num pr-9 ${invalido ? "!border-red-400" : ""}`} inputMode="decimal" value={valor} autoComplete="off"
          aria-invalid={invalido} onChange={(e) => onChange(e.target.value)} />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{unidade}</span>
      </span>
      {invalido ? <span className="mt-0.5 block text-[11px] font-semibold text-red-600">número inválido</span>
        : limite && <span className="mt-0.5 block truncate text-[11px] text-slate-500">{limite}</span>}
    </label>
  );
}

function Aviso({ tom, icone: Icone, children }: { tom: "erro" | "atencao"; icone: typeof Info; children: ReactNode }) {
  return (
    <p className={`mt-2 flex items-start gap-2 rounded-xl border p-3 text-sm ${tom === "erro" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
      <Icone size={16} className="mt-0.5 shrink-0" aria-hidden /> <span className="min-w-0">{children}</span>
    </p>
  );
}
