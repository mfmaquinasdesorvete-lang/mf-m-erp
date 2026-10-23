// Agendamento de coleta no envio (como no portal da Rodonaves): data entre os próximos dias de coleta, período manhã
// ou tarde, a frequência de coleta da transportadora no endereço da unidade e o pedido por WhatsApp. Grava pela
// função agendar_coleta (mesma regra de src/lib/coleta.ts). FrequenciaColeta edita os dias e períodos por unidade.
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Check, ClipboardCopy, ExternalLink, MapPin, MessageCircle, Sun, Sunset, X } from "lucide-react";
import { Button, Field, chip } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { hoje, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { useUnidade } from "@/lib/unidade";
import type { Envio } from "@/lib/fretes";
import type { Transportadora } from "@/lib/types";
import {
  conferirAgendamento, enderecoColeta, FREQUENCIA_PADRAO, frequenciaDe, mensagemColeta, PERIODOS, proximosDiasColeta, resumoFrequencia, rotuloColeta, SIGLAS,
  type FrequenciaColeta, type PeriodoColeta,
} from "@/lib/coleta";

const ICONE: Record<PeriodoColeta, typeof Sun> = { manha: Sun, tarde: Sunset };

export function AgendarColeta({ envio, transportadoras, podeAgendar, pendente, nomeUsuario, onMudou }: {
  envio: Envio; transportadoras: Transportadora[]; podeAgendar: boolean;
  /** a transportadora ou a unidade mudaram na tela e ainda não foram salvas */
  pendente: boolean; nomeUsuario: (u?: string | null) => string; onMudou: () => void;
}) {
  const dia = hoje();
  const { unidades } = useUnidade();
  const { data: frequencias = [] } = useRows<FrequenciaColeta>("coleta_frequencias", { order: "atualizado_em" });
  const transp = transportadoras.find((t) => t.id === envio.transportadora_id) ?? null;
  const marca = transp?.matriz_id ? transportadoras.find((t) => t.id === transp.matriz_id) ?? null : null;
  const unidade = unidades.find((u) => u.id === envio.unidade_id) ?? null;
  const freq = frequenciaDe(frequencias, transp, envio.unidade_id);
  const agendada = !!envio.coleta_prevista && !!envio.coleta_agendada_em;
  const [abrir, setAbrir] = useState(!agendada);
  const [data, setData] = useState<string>(envio.coleta_prevista && envio.coleta_prevista >= dia ? envio.coleta_prevista : "");
  const [periodo, setPeriodo] = useState<PeriodoColeta | null>(envio.coleta_periodo ?? null);
  const [urgente, setUrgente] = useState(!!envio.coleta_urgente);
  const [protocolo, setProtocolo] = useState(envio.coleta_protocolo ?? "");
  const [obs, setObs] = useState(envio.coleta_obs ?? "");
  const [gravando, setGravando] = useState(false);
  const invalidar = useInvalidate();

  const dias = useMemo(() => proximosDiasColeta(dia, urgente ? { ...freq, dias: [0, 1, 2, 3, 4, 5, 6], antecedencia_dias: 0 } : freq, urgente ? 6 : 5), [dia, freq, urgente]);
  const problema = conferirAgendamento(data, periodo, dia, freq, urgente);
  const endereco = enderecoColeta(unidade);
  const contato = [transp, marca].find((t) => t?.whatsapp) ?? null;
  const telefone = [transp, marca].map((t) => t?.telefone || t?.sac_telefone).find(Boolean);
  const portal = transp?.portal_url || marca?.portal_url;
  const msg = data && periodo ? mensagemColeta(envio, { data, periodo, endereco, urgente, obs }) : "";
  const nomeTransp = transp ? transp.nome_fantasia || transp.nome : envio.transportadora_nome;

  async function agendar() {
    if (problema) return notify(problema, "erro");
    setGravando(true);
    const { error } = await supabase.rpc("agendar_coleta", { p_envio: envio.id, p_data: data, p_periodo: periodo, p_protocolo: protocolo.trim() || null, p_urgente: urgente, p_obs: obs.trim() || null });
    setGravando(false);
    if (error) return notifyError(error);
    notify(`Coleta agendada: ${rotuloColeta(data, periodo)}`);
    setAbrir(false);
    invalidar("envios");
    onMudou();
  }

  if (envio.coletado_em || envio.status === "entregue" || envio.status === "cancelado") return null;

  return (
    <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarClock size={18} className="text-sky-700" aria-hidden />
        <h4 className="font-bold text-fg">Agendamento da coleta</h4>
        {agendada && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${envio.coleta_urgente ? "bg-red-100 text-red-800" : "bg-sky-100 text-sky-800"}`}>
            {rotuloColeta(envio.coleta_prevista, envio.coleta_periodo)}{envio.coleta_urgente ? " · urgência" : ""}{envio.coleta_protocolo ? ` · coleta nº ${envio.coleta_protocolo}` : ""}
          </span>
        )}
        {agendada && !abrir && podeAgendar && <Button type="button" variant="ghost" className="ml-auto !min-h-0 !py-1 text-xs" onClick={() => setAbrir(true)}>Remarcar</Button>}
      </div>
      {agendada && <p className="mt-1 text-xs text-slate-500">Agendada por {nomeUsuario(envio.coleta_agendada_por)} em {new Date(envio.coleta_agendada_em!).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{envio.coleta_obs ? ` · ${envio.coleta_obs}` : ""}</p>}

      {abrir && (
        <div className="mt-3 space-y-3">
          {!nomeTransp && <p className="text-sm text-amber-800">Escolha a transportadora (acima) e salve o envio para agendar a coleta.</p>}
          {pendente && <p className="text-sm text-amber-800">Salve o envio antes: a transportadora ou a unidade mudaram.</p>}

          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Data da coleta</div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Data da coleta">
              {dias.map((d) => (
                <button key={d.data} type="button" role="radio" aria-checked={data === d.data} disabled={!d.disponivel}
                  title={d.disponivel ? undefined : d.motivo} onClick={() => setData(d.data)}
                  className={`grid min-w-[4.25rem] place-items-center rounded-xl border px-3 py-2 text-center transition ${data === d.data
                    ? "border-brand bg-brand text-brand-fg shadow-sm" : d.disponivel ? "border-slate-300 bg-surface text-fg hover:border-brand/60" : "cursor-not-allowed border-dashed border-slate-200 text-slate-400"}`}>
                  <span className="text-2xs font-semibold tracking-wide">{d.sigla}</span>
                  <span className="text-base font-bold leading-tight">{d.dia}</span>
                  {!d.disponivel && <span className="text-2xs leading-tight">{d.motivo === "não coleta" ? "não coleta" : "feriado"}</span>}
                </button>
              ))}
              <label className="grid min-w-32 content-center rounded-xl border border-slate-300 bg-surface px-2 py-1 text-2xs font-semibold text-slate-500">
                Outra data
                <input type="date" className="bg-transparent text-sm text-fg outline-none" min={dia} value={dias.some((d) => d.data === data) ? "" : data} onChange={(x) => setData(x.target.value)} />
              </label>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Período</div>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Período da coleta">
              {(Object.keys(PERIODOS) as PeriodoColeta[]).map((p) => {
                const I = ICONE[p];
                const fora = !urgente && freq && !freq[p];
                return (
                  <button key={p} type="button" role="radio" aria-checked={periodo === p} disabled={!!fora} onClick={() => setPeriodo(p)}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${periodo === p ? "border-brand bg-brand/10 ring-1 ring-brand" : fora ? "cursor-not-allowed border-dashed border-slate-200 text-slate-400" : "border-slate-300 bg-surface hover:border-brand/60"}`}>
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${periodo === p ? "border-brand" : "border-slate-300"}`}>{periodo === p && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}</span>
                    <span className="min-w-0 flex-1"><b className="block text-fg">{PERIODOS[p].rotulo}</b><span className="text-sm text-slate-600">{PERIODOS[p].faixa}</span></span>
                    <I size={20} className="text-amber-500" aria-hidden />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="cartao p-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Frequência de coleta{nomeTransp ? ` · ${nomeTransp}` : ""}</div>
            {endereco && <p className="mb-2 flex gap-1.5 text-sm text-slate-700"><MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" aria-hidden />{endereco}</p>}
            <div className="flex flex-wrap gap-1.5">
              {SIGLAS.map((s, i) => {
                const ok = (freq?.dias ?? FREQUENCIA_PADRAO.dias).includes(i);
                return (
                  <span key={s} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${ok ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                    {ok ? <Check size={12} aria-hidden /> : <X size={12} aria-hidden />}{s}<span className="sr-only">{ok ? " coleta" : " não coleta"}</span>
                  </span>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {freq ? `${resumoFrequencia(freq)}${freq.antecedencia_dias ? ` · pedir com ${freq.antecedencia_dias} dia(s) de antecedência` : ""}${freq.observacao ? ` · ${freq.observacao}` : ""}`
                : "Frequência não cadastrada para este endereço: considerando segunda a sexta, manhã e tarde. Cadastre em Transportadoras → Coleta."}
            </p>
          </div>

          <div className={`rounded-xl border p-3 text-sm ${urgente ? "border-red-200 bg-red-50 text-red-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={urgente} onChange={(x) => setUrgente(x.target.checked)} /> Coleta de urgência (fora da frequência)</label>
            <p className="mt-1 flex gap-1.5 text-xs"><AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
              Calendário conforme o atendimento da região. Para coleta de urgência, fale antes com a unidade de atendimento da transportadora{telefone ? ` (${telefone})` : ""}.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nº da coleta (protocolo)"><input className="input" value={protocolo} onChange={(x) => setProtocolo(x.target.value)} placeholder="o número que a transportadora passar" /></Field>
            <Field label="Observação para a coleta" className="sm:col-span-2"><input className="input" value={obs} onChange={(x) => setObs(x.target.value)} placeholder="Ex.: máquina em palete, precisa de plataforma; procurar a expedição" /></Field>
          </div>

          {data && periodo && problema && <p className="flex gap-1.5 text-sm text-red-700"><AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />{problema}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {podeAgendar && <Button type="button" onClick={agendar} disabled={gravando || pendente || !nomeTransp || !!problema}><CalendarClock size={15} /> {gravando ? "Gravando…" : agendada ? "Remarcar coleta" : "Agendar coleta"}</Button>}
            {msg && contato?.whatsapp && (
              <a href={whatsappLink(contato.whatsapp, msg)} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"><MessageCircle size={15} /> Pedir pelo WhatsApp</a>
            )}
            {msg && <Button type="button" variant="ghost" onClick={() => navigator.clipboard?.writeText(msg).then(() => notify("Mensagem copiada"), () => notify("Não deu para copiar", "erro"))}><ClipboardCopy size={15} /> Copiar pedido</Button>}
            {portal && <a href={portal} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"><ExternalLink size={15} /> Portal da transportadora</a>}
            {agendada && <Button type="button" variant="ghost" onClick={() => setAbrir(false)}>Fechar</Button>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Frequência de coleta da transportadora em cada unidade da MF (aba "Coleta" do cartão). */
export function FrequenciaColetaEditor({ transportadora, podeEditar }: { transportadora: Transportadora; podeEditar: boolean }) {
  const { unidades } = useUnidade();
  const { data: frequencias = [], refetch } = useRows<FrequenciaColeta>("coleta_frequencias", { order: "atualizado_em" });
  const invalidar = useInvalidate();
  const ativas = unidades.filter((u) => u.ativo !== false);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Dias e períodos em que a transportadora passa para coletar em cada endereço da MF. O agendamento do envio só oferece esses dias; fora deles, só como urgência.</p>
      {ativas.map((u) => {
        const f = frequencias.find((x) => x.transportadora_id === transportadora.id && x.unidade_id === u.id);
        return <LinhaFrequencia key={`${u.id}-${f?.atualizado_em ?? ""}`} unidade={u} transportadoraId={transportadora.id} atual={f ?? null} podeEditar={podeEditar}
          onSalvo={() => { refetch(); invalidar("coleta_frequencias"); }} />;
      })}
    </div>
  );
}

function LinhaFrequencia({ unidade, transportadoraId, atual, podeEditar, onSalvo }: {
  unidade: { id: string; nome: string } & Parameters<typeof enderecoColeta>[0]; transportadoraId: string; atual: FrequenciaColeta | null; podeEditar: boolean; onSalvo: () => void;
}) {
  const [f, setF] = useState(() => ({ ...FREQUENCIA_PADRAO, observacao: "", ...atual }));
  const [gravando, setGravando] = useState(false);
  const mudou = !atual || JSON.stringify([f.dias, f.manha, f.tarde, f.antecedencia_dias, f.observacao ?? ""]) !== JSON.stringify([atual.dias, atual.manha, atual.tarde, atual.antecedencia_dias, atual.observacao ?? ""]);
  const alternar = (d: number) => setF((x) => ({ ...x, dias: x.dias.includes(d) ? x.dias.filter((y) => y !== d) : [...x.dias, d].sort() }));

  async function salvar() {
    if (!f.dias.length) return notify("Escolha pelo menos um dia", "erro");
    if (!f.manha && !f.tarde) return notify("Escolha manhã, tarde ou os dois", "erro");
    setGravando(true);
    const dados = { dias: f.dias, manha: f.manha, tarde: f.tarde, antecedencia_dias: Number(f.antecedencia_dias) || 0, observacao: f.observacao?.trim() || null, atualizado_em: new Date().toISOString() };
    const r = atual?.id
      ? await supabase.from("coleta_frequencias").update(dados).eq("id", atual.id)
      : await supabase.from("coleta_frequencias").insert({ ...dados, transportadora_id: transportadoraId, unidade_id: unidade.id });
    setGravando(false);
    if (r.error) return notifyError(r.error);
    notify(`Frequência de coleta salva: ${unidade.nome}`);
    onSalvo();
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <b className="text-fg">{unidade.nome}</b>
        <span className="text-xs text-slate-500">{atual ? resumoFrequencia(atual) : "não cadastrada (padrão: SEG a SEX, manhã e tarde)"}</span>
      </div>
      {enderecoColeta(unidade) && <p className="mt-0.5 flex gap-1 text-xs text-slate-500"><MapPin size={12} className="mt-0.5 shrink-0" aria-hidden />{enderecoColeta(unidade)}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`Dias de coleta em ${unidade.nome}`}>
        {SIGLAS.map((s, i) => (
          <button key={s} type="button" disabled={!podeEditar} aria-pressed={f.dias.includes(i)} onClick={() => alternar(i)}
            className={chip(f.dias.includes(i), "border-emerald-600 bg-emerald-50 text-emerald-800")}>{s}</button>
        ))}
        <span className="mx-1 w-px self-stretch bg-slate-200" aria-hidden />
        {(Object.keys(PERIODOS) as PeriodoColeta[]).map((p) => (
          <button key={p} type="button" disabled={!podeEditar} aria-pressed={f[p]} onClick={() => setF((x) => ({ ...x, [p]: !x[p] }))}
            className={chip(f[p], "border-amber-500 bg-amber-50 text-amber-900")}>{PERIODOS[p].rotulo} {PERIODOS[p].faixa}</button>
        ))}
      </div>
      {podeEditar && (
        <div className="mt-2 grid gap-2 sm:grid-cols-[9rem_1fr_auto] sm:items-end">
          <Field label="Antecedência (dias)"><input className="input" inputMode="numeric" value={f.antecedencia_dias} onChange={(x) => setF({ ...f, antecedencia_dias: Number(x.target.value.replace(/\D/g, "").slice(0, 2)) || 0 })} /></Field>
          <Field label="Observação"><input className="input" value={f.observacao ?? ""} onChange={(x) => setF({ ...f, observacao: x.target.value })} placeholder="Ex.: pedir até 11h para coletar à tarde" /></Field>
          <Button type="button" variant="secondary" disabled={gravando || !mudou} onClick={salvar}>{gravando ? "Salvando…" : "Salvar"}</Button>
        </div>
      )}
    </div>
  );
}
