// Calendário de obrigações do Lucro Real: o que vence no mês (guias e declarações federais da empresa e as estaduais
// e municipais de cada unidade), com a situação de cada uma — feita, não se aplica, atrasada, vence hoje, próxima.
// Fica no Painel do contador (aba Calendário) e, resumido, no Painel fiscal.
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Ban, CalendarDays, Check, ChevronLeft, ChevronRight, CircleAlert, FileText, Receipt, RotateCcw, Settings2 } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { pedirTexto } from "@/components/Dialogos";
import { useInvalidate, useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { usePerfil } from "@/lib/auth";
import { useConfig } from "@/lib/useConfig";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { brl, dataBR, pl } from "@/lib/format";
import { diaLocal } from "@/lib/filtroLista";
import {
  chaveRegistro, configDaUnidade, CPR_SP, iso, ocorrenciasNoPeriodo, rotuloCompetencia, ROTULO_SITUACAO, situacaoDe, somarMes,
  type ConfigCalendario, type ConfigUnidade, type Ocorrencia, type RegistroObrigacao, type Situacao, type UnidadeCal,
} from "@/lib/obrigacoes";

const hojeBR = () => diaLocal(new Date().toISOString());
const fimDoMes = (mes: string) => { const [a, m] = mes.split("-").map(Number); return iso(a, m + 1, 0); };
const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeDoMes = (mes: string) => { const [a, m] = mes.split("-").map(Number); const t = NOMES_MES[m - 1]; return `${t[0].toUpperCase()}${t.slice(1)} de ${a}`; };
const diaSemana = (dia: string) => new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "");

const COR: Record<Situacao, string> = {
  feito: "bg-emerald-100 text-emerald-800", nao_se_aplica: "bg-slate-100 text-slate-600", atrasada: "bg-red-100 text-red-800",
  hoje: "bg-amber-200 text-amber-900", proxima: "bg-amber-100 text-amber-800", futura: "bg-sky-100 text-sky-800", sem_data: "bg-violet-100 text-violet-800",
};
const PONTO: Record<Situacao, string> = {
  feito: "bg-emerald-500", nao_se_aplica: "bg-slate-400", atrasada: "bg-red-500", hoje: "bg-amber-500", proxima: "bg-amber-400", futura: "bg-sky-500", sem_data: "bg-violet-500",
};

/** Ocorrências do período com o registro e a situação de hoje. */
export function useObrigacoes(de: string, ate: string) {
  const { unidades } = useUnidade();
  const { data: cfgErp } = useConfig();
  const cfg = (cfgErp?.calendario_fiscal ?? {}) as ConfigCalendario;
  const { tem, papel } = usePerfil();
  const pode = tem("financeiro") || papel === "contador";
  const { data: registros = [] } = useRows<RegistroObrigacao>("obrigacoes_cumpridas", { order: "atualizado_em" });
  const ativas = useMemo(() => unidades.filter((u) => u.ativo !== false) as UnidadeCal[], [unidades]);
  const chaveCfg = JSON.stringify(cfg);
  const porChave = useMemo(() => new Map(registros.map((r) => [chaveRegistro(r.chave, r.competencia, r.unidade_id), r])), [registros]);
  const hoje = hojeBR();
  const lista = useMemo(() => ocorrenciasNoPeriodo(de, ate, ativas, cfg).map((o) => {
    const reg = porChave.get(chaveRegistro(o.regra.chave, o.competencia, o.unidade?.id ?? null));
    return { ...o, reg, situacao: situacaoDe(o, reg, hoje) };
  }), [de, ate, ativas, chaveCfg, porChave, hoje]); // eslint-disable-line react-hooks/exhaustive-deps
  return { lista, cfg, unidades: ativas, pode, hoje, semInicio: !cfg.inicio };
}
export type ItemCalendario = ReturnType<typeof useObrigacoes>["lista"][number];

export function CalendarioObrigacoes() {
  const hoje = hojeBR();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [filtro, setFiltro] = useState<string>("todas");
  const [ajustar, setAjustar] = useState(false);
  const [feito, setFeito] = useState<ItemCalendario | null>(null);
  const de = `${mes}-01`, ate = fimDoMes(mes);
  const { lista, cfg, unidades, pode, semInicio } = useObrigacoes(de, ate);
  // atrasadas dos 6 meses anteriores ao mês aberto (só quando o mês aberto é o atual ou depois)
  const antes = somarMes(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), -6);
  const ontemDoMes = iso(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0);
  const { lista: anteriores } = useObrigacoes(iso(antes.ano, antes.mes, 1), ontemDoMes);
  const passa = (o: ItemCalendario) => filtro === "todas" || (filtro === "empresa" ? !o.unidade : o.unidade?.id === filtro);
  const doMes = lista.filter(passa);
  const atrasadasAntes = mes >= hoje.slice(0, 7) ? anteriores.filter((o) => passa(o) && o.situacao === "atrasada") : [];
  const conta = (s: Situacao[]) => doMes.filter((o) => s.includes(o.situacao)).length;
  const porDia = useMemo(() => {
    const m = new Map<string, ItemCalendario[]>();
    for (const o of doMes) { const k = o.vencimento ?? "sem-data"; m.set(k, [...(m.get(k) ?? []), o]); }
    return m;
  }, [doMes]);
  const mudarMes = (k: number) => { const n = somarMes(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), k); setMes(`${n.ano}-${String(n.mes).padStart(2, "0")}`); };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => mudarMes(-1)} aria-label="Mês anterior" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 hover:bg-slate-50"><ChevronLeft size={18} /></button>
            <h2 className="min-w-[11rem] text-center text-lg font-bold text-fg">{nomeDoMes(mes)}</h2>
            <button type="button" onClick={() => mudarMes(1)} aria-label="Próximo mês" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 hover:bg-slate-50"><ChevronRight size={18} /></button>
            {mes !== hoje.slice(0, 7) && <button type="button" onClick={() => setMes(hoje.slice(0, 7))} className="ml-1 px-2 text-sm font-semibold text-brand">Hoje</button>}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar">
            {[["todas", "Tudo"], ["empresa", "Empresa"], ...unidades.map((u) => [u.id, u.codigo || u.nome])].map(([v, r]) => (
              <button key={v} type="button" aria-pressed={filtro === v} onClick={() => setFiltro(v)}
                className={`rounded-full border px-3 py-1 text-sm font-semibold ${filtro === v ? "border-brand bg-brand text-brand-fg" : "border-slate-200 bg-surface text-slate-600"}`}>{r}</button>
            ))}
          </div>
          {pode && <Button variant="secondary" className="ml-auto" onClick={() => setAjustar(true)}><Settings2 size={16} /> Ajustar prazos</Button>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {([["atrasada", "atrasadas"], ["hoje", "vencem hoje"], ["proxima", "nos próximos 7 dias"], ["futura", "a vencer"], ["feito", "feitas"], ["sem_data", "sem data"]] as [Situacao, string][])
            .map(([s, r]) => { const n = conta([s]); return n ? <span key={s} className={`rounded-full px-2.5 py-0.5 font-semibold ${COR[s]}`}>{n} {r}</span> : null; })}
          <span className="text-slate-500">{doMes.length} {pl(doMes.length, "obrigação", "obrigações")} no mês</span>
        </div>
      </Card>

      {semInicio && (
        <Card className="border-violet-200 p-4 text-sm text-slate-700">
          <b className="text-fg">Começando a usar o calendário?</b> Em "Ajustar prazos", escolha o mês a partir do qual o ERP acompanha as
          obrigações: o que venceu antes fica de fora (já cuidado pelo contador) e não aparece como atrasado.
          {pode && <button type="button" onClick={() => setAjustar(true)} className="ml-1 font-semibold text-brand">Definir agora</button>}
        </Card>
      )}
      {atrasadasAntes.length > 0 && (
        <Card className="border-red-200 p-4">
          <details>
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-red-800">
              <CircleAlert size={16} /> {atrasadasAntes.length} {pl(atrasadasAntes.length, "atrasada", "atrasadas")} de meses anteriores
              <span className="text-xs font-semibold text-slate-500">(tocar para ver)</span>
            </summary>
            <ul className="mt-2 divide-y divide-slate-100">{atrasadasAntes.map((o) => <Linha key={o.id} o={o} pode={pode} onFeito={setFeito} />)}</ul>
          </details>
        </Card>
      )}

      <Grade mes={mes} hoje={hoje} porDia={porDia} />

      <div className="space-y-3">
        {[...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, itens]) => (
          <Card key={dia} className="scroll-mt-20 p-4" >
            <div id={`obrig-${dia}`} className="mb-1 flex items-baseline gap-2">
              <h3 className={`text-sm font-bold capitalize ${dia === hoje ? "text-amber-700" : "text-fg"}`}>
                {dia === "sem-data" ? "Sem data definida" : diaSemana(dia)}{dia === hoje ? " · hoje" : ""}
              </h3>
              {dia === "sem-data" && <span className="text-xs text-slate-500">o dia depende do estado ou do município: defina em "Ajustar prazos"</span>}
            </div>
            <ul className="divide-y divide-slate-100">{itens.map((o) => <Linha key={o.id} o={o} pode={pode} onFeito={setFeito} />)}</ul>
          </Card>
        ))}
        {!doMes.length && <p className="text-sm text-slate-500">Nada vence neste mês com o filtro escolhido.</p>}
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        Prazos gerais da legislação federal e de SC e SP para empresa do Lucro Real, com os feriados nacionais (e Carnaval, Sexta-feira Santa,
        Corpus Christi e 31/12, sem expediente bancário); feriados estaduais e municipais não entram. Os itens com "confirmar" dependem do
        estado, do município ou de regra recente: o contador confirma e ajusta em "Ajustar prazos". Estimativa de calendário, não substitui o contador.
      </p>

      {feito && <MarcarFeito o={feito} onClose={() => setFeito(null)} />}
      {ajustar && <AjustarPrazos cfg={cfg} unidades={unidades} onClose={() => setAjustar(false)} />}
    </div>
  );
}

/** Mês em grade (computador): cada dia com as obrigações coloridas pela situação; tocar leva à lista do dia. */
function Grade({ mes, hoje, porDia }: { mes: string; hoje: string; porDia: Map<string, ItemCalendario[]> }) {
  const [a, m] = mes.split("-").map(Number);
  const primeiro = new Date(Date.UTC(a, m - 1, 1)).getUTCDay();
  const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const celulas = [...Array(primeiro).fill(null), ...Array.from({ length: dias }, (_, i) => iso(a, m, i + 1))];
  return (
    <Card className="hidden p-3 md:block">
      <div className="grid grid-cols-7 gap-1 text-center text-2xs font-bold uppercase tracking-wide text-slate-500">
        {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {celulas.map((dia, i) => {
          if (!dia) return <div key={`v${i}`} />;
          const itens = porDia.get(dia) ?? [];
          const conteudo = (
            <>
              <span className={`self-start text-xs font-bold ${dia === hoje ? "rounded-full bg-amber-500 px-1.5 text-white" : "text-slate-600"}`}>{Number(dia.slice(8))}</span>
              {itens.slice(0, 3).map((o) => (
                <span key={o.id} className="flex min-w-0 items-center gap-1 text-left text-2xs leading-tight text-fg">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PONTO[o.situacao]}`} aria-hidden />
                  <span className="truncate">{o.regra.nome}{o.unidade ? ` ${o.unidade.codigo ?? ""}` : ""}</span>
                </span>
              ))}
              {itens.length > 3 && <span className="text-2xs font-semibold text-slate-500">+{itens.length - 3}</span>}
            </>
          );
          return itens.length ? (
            <a key={dia} href={`#obrig-${dia}`} className="flex min-h-[4.5rem] min-w-0 flex-col gap-0.5 rounded-lg border border-slate-200 p-1.5 hover:border-brand hover:bg-slate-50">{conteudo}</a>
          ) : <div key={dia} className="flex min-h-[4.5rem] flex-col rounded-lg border border-transparent p-1.5">{conteudo}</div>;
        })}
      </div>
    </Card>
  );
}

function Linha({ o, pode, onFeito }: { o: ItemCalendario; pode: boolean; onFeito: (o: ItemCalendario) => void }) {
  const invalidar = useInvalidate();
  const Icone = o.regra.tipo === "guia" ? Receipt : FileText;
  async function marcar(situacao: "nao_se_aplica" | "pendente") {
    let obs: string | null = null;
    if (situacao === "nao_se_aplica") {
      obs = await pedirTexto(`Por que "${o.regra.nome}" de ${rotuloCompetencia(o.competencia)} não se aplica?`, "", { minimo: 5, ok: "Marcar" });
      if (obs === null) return;
    }
    const { error } = await supabase.rpc("marcar_obrigacao", { p_chave: o.regra.chave, p_competencia: o.competencia, p_unidade: o.unidade?.id ?? null, p_situacao: situacao, p_observacao: obs });
    if (error) return notifyError(error);
    notify(situacao === "pendente" ? "Voltou para pendente" : "Marcada como não se aplica");
    invalidar("obrigacoes_cumpridas");
  }
  const r = o.reg;
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-2 py-2.5">
      <Icone size={18} className="mt-0.5 shrink-0 text-modulo" aria-label={o.regra.tipo === "guia" ? "guia de pagamento" : "declaração"} />
      <div className="min-w-0 flex-1 basis-60">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-fg">{o.regra.nome}</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-2xs font-bold text-slate-600">{o.unidade ? `${o.unidade.codigo ?? o.unidade.nome}` : "Empresa"}</span>
          <span className="text-xs text-slate-500">competência {rotuloCompetencia(o.competencia)}</span>
          <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ${COR[o.situacao]}`}>{ROTULO_SITUACAO[o.situacao]}</span>
          {o.regra.conferir && <span className="rounded-full border border-violet-200 px-2 py-0.5 text-2xs font-semibold text-violet-700">confirmar com o contador</span>}
        </div>
        {r && r.situacao !== "pendente" && (
          <p className="mt-0.5 text-xs text-slate-600">
            {r.situacao === "feito" ? `Feito em ${dataBR(r.feito_em)}` : "Não se aplica"}
            {r.registrado_nome ? ` · ${r.registrado_nome}` : ""}{r.recibo ? ` · ${r.recibo}` : ""}{r.valor != null ? ` · ${brl(r.valor)}` : ""}{r.observacao ? ` · ${r.observacao}` : ""}
          </p>
        )}
        <details className="mt-0.5 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-500">Prazo e base legal</summary>
          <p className="mt-1">Prazo: {o.quando}.</p>
          <p>Base: {o.base}.</p>
          {o.regra.dica && <p className="mt-1">{o.regra.dica}</p>}
        </details>
      </div>
      {pode && (
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {o.situacao === "feito" || o.situacao === "nao_se_aplica" ? (
            <Button variant="ghost" onClick={() => marcar("pendente")}><RotateCcw size={15} /> Desfazer</Button>
          ) : (
            <>
              <Button onClick={() => onFeito(o)}><Check size={15} /> {o.regra.tipo === "guia" ? "Paga" : "Entregue"}</Button>
              <Button variant="ghost" onClick={() => marcar("nao_se_aplica")} title="Não se aplica neste mês"><Ban size={15} /> Não se aplica</Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function MarcarFeito({ o, onClose }: { o: ItemCalendario; onClose: () => void }) {
  const invalidar = useInvalidate();
  const hoje = hojeBR();
  const [data, setData] = useState(o.vencimento && o.vencimento < hoje ? o.vencimento : hoje);
  const [valor, setValor] = useState("");
  const [recibo, setRecibo] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const guia = o.regra.tipo === "guia";
  async function salvar(e: FormEvent) {
    e.preventDefault();
    const v = valor.trim() ? Number(valor.replace(/\./g, "").replace(",", ".")) : null;
    if (v != null && !(v >= 0)) return notifyError(new Error("Valor inválido"));
    setSalvando(true);
    const { error } = await supabase.rpc("marcar_obrigacao", {
      p_chave: o.regra.chave, p_competencia: o.competencia, p_unidade: o.unidade?.id ?? null, p_situacao: "feito",
      p_feito_em: data, p_valor: v, p_recibo: recibo || null, p_observacao: obs || null,
    });
    setSalvando(false);
    if (error) return notifyError(error);
    notify(guia ? "Guia marcada como paga" : "Declaração marcada como entregue");
    invalidar("obrigacoes_cumpridas");
    onClose();
  }
  return (
    <Modal open onClose={onClose} title={`${o.regra.nome} · ${rotuloCompetencia(o.competencia)}${o.unidade ? ` · ${o.unidade.codigo ?? o.unidade.nome}` : ""}`}>
      <form onSubmit={salvar} className="space-y-3 p-4 sm:p-5">
        <p className="text-sm text-slate-600">{o.vencimento ? `Vence em ${dataBR(o.vencimento)}.` : "Sem data definida."} Prazo: {o.quando}.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={guia ? "Pago em" : "Entregue em"}><input className="input" type="date" required max={hoje} value={data} onChange={(e) => setData(e.target.value)} /></Field>
          {guia && <Field label="Valor pago (opcional)"><input className="input" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} /></Field>}
          <Field label={guia ? "Número da guia ou do DARF (opcional)" : "Número do recibo de entrega (opcional)"}>
            <input className="input" maxLength={120} value={recibo} onChange={(e) => setRecibo(e.target.value)} />
          </Field>
          <Field label="Observação (opcional)" className="sm:col-span-2"><input className="input" maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
        </div>
        <p className="text-xs text-slate-500">O comprovante pode ir em "Documentos do fechamento" na aba Fechamento do mês.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvando}><Check size={16} /> {salvando ? "Salvando…" : "Salvar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function AjustarPrazos({ cfg, unidades, onClose }: { cfg: ConfigCalendario; unidades: UnidadeCal[]; onClose: () => void }) {
  const invalidar = useInvalidate();
  const [irpj, setIrpj] = useState<"anual" | "trimestral">(cfg.irpj ?? "anual");
  const [folha, setFolha] = useState(cfg.folha !== false);
  const [inicio, setInicio] = useState(cfg.inicio ?? hojeBR().slice(0, 7));
  const [porUnidade, setPorUnidade] = useState<Record<string, ConfigUnidade>>(() =>
    Object.fromEntries(unidades.map((u) => [u.id, configDaUnidade(cfg, u)])));
  const [salvando, setSalvando] = useState(false);
  const mudar = (id: string, campo: keyof ConfigUnidade, v: unknown) => setPorUnidade((p) => ({ ...p, [id]: { ...p[id], [campo]: v } }));
  const diaOuNada = (s: string) => { const n = Math.trunc(Number(s)); return s.trim() && n >= 1 && n <= 31 ? n : null; };
  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const { error } = await supabase.rpc("salvar_calendario_fiscal", { p: { irpj, folha, inicio: inicio || null, unidades: porUnidade } });
    setSalvando(false);
    if (error) return notifyError(error);
    notify("Prazos ajustados");
    invalidar("configuracoes");
    onClose();
  }
  return (
    <Modal open onClose={onClose} title="Ajustar prazos do calendário" wide>
      <form onSubmit={salvar} className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Acompanhar a partir de">
            <input className="input" type="month" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </Field>
          <Field label="IRPJ e CSLL">
            <select className="input" value={irpj} onChange={(e) => setIrpj(e.target.value as "anual" | "trimestral")}>
              <option value="anual">Lucro Real anual (estimativa mensal + ajuste em março)</option>
              <option value="trimestral">Lucro Real trimestral</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-fg">
            <input type="checkbox" checked={folha} onChange={(e) => setFolha(e.target.checked)} /> Tem funcionários (eSocial, INSS, FGTS)
          </label>
        </div>
        {unidades.map((u) => {
          const c = porUnidade[u.id] ?? {};
          return (
            <fieldset key={u.id} className="rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-sm font-bold text-fg">{u.nome}{u.uf ? ` (${u.uf})` : ""}</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {u.uf === "SP" && (
                  <Field label="ICMS: código de recolhimento (CPR)">
                    <select className="input" value={c.icms_cpr ?? ""} onChange={(e) => mudar(u.id, "icms_cpr", e.target.value || null)}>
                      <option value="">Sem CPR (usar o dia ao lado)</option>
                      {Object.entries(CPR_SP).map(([cpr, x]) => <option key={cpr} value={cpr}>CPR {cpr}: {x.regra} ({x.atividades})</option>)}
                    </select>
                  </Field>
                )}
                <Field label="Dia do ICMS no mês seguinte"><input className="input" type="number" min={1} max={31} placeholder={u.uf === "SP" && c.icms_cpr ? "pelo CPR" : "sem data"} disabled={u.uf === "SP" && !!c.icms_cpr} value={u.uf === "SP" && c.icms_cpr ? "" : c.icms_dia ?? ""} onChange={(e) => mudar(u.id, "icms_dia", diaOuNada(e.target.value))} /></Field>
                <Field label="Dia da EFD ICMS/IPI"><input className="input" type="number" min={1} max={31} placeholder="sem data" value={c.efd_dia ?? ""} onChange={(e) => mudar(u.id, "efd_dia", diaOuNada(e.target.value))} /></Field>
                <Field label="Dia do ISS (prefeitura)"><input className="input" type="number" min={1} max={31} placeholder="sem data" disabled={!c.iss} value={c.iss_dia ?? ""} onChange={(e) => mudar(u.id, "iss_dia", diaOuNada(e.target.value))} /></Field>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-fg">
                <label className="flex items-center gap-2"><input type="checkbox" checked={c.ipi !== false} onChange={(e) => mudar(u.id, "ipi", e.target.checked)} /> Recolhe IPI</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={!!c.iss} onChange={(e) => mudar(u.id, "iss", e.target.checked)} /> Tem ISS (presta serviço)</label>
                {u.uf === "SP" && c.icms_cpr && (
                  <label className="flex items-center gap-2"><input type="checkbox" checked={c.icms_cpr_confirmado !== false} onChange={(e) => mudar(u.id, "icms_cpr_confirmado", e.target.checked)} /> CPR confirmado (CADESP ou contador)</label>
                )}
                {c.iss && c.iss_dia && (
                  <label className="flex items-center gap-2"><input type="checkbox" checked={c.iss_confirmado !== false} onChange={(e) => mudar(u.id, "iss_confirmado", e.target.checked)} /> Dia do ISS confirmado na prefeitura</label>
                )}
              </div>
            </fieldset>
          );
        })}
        <p className="text-xs text-slate-500">
          Padrões: SC com ICMS no dia 10 e EFD no dia 20; SP com EFD no dia 20 e o dia do ICMS pelo código de recolhimento (CPR) do CNAE principal
          (Anexo IV do RICMS/SP): o ERP calcula a data de cada mês como na Agenda Tributária Paulista. O CPR está no cadastro do CADESP.
          Confirme com o contador antes de salvar.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar prazos"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Resumo para o Painel fiscal: atrasadas e o que vence nos próximos 15 dias. */
export function ProximasObrigacoes() {
  const hoje = hojeBR();
  const [a, m, d] = hoje.split("-").map(Number);
  const ate = iso(a, m, d + 15), desde = iso(a, m - 3, 1);
  const { lista, semInicio } = useObrigacoes(desde, ate);
  // sem o mês de início definido, o passado não conta como atrasado (ainda não foi acompanhado no ERP)
  const itens = lista.filter((o) => (o.situacao === "atrasada" && !semInicio) || ((o.situacao === "hoje" || o.situacao === "proxima" || o.situacao === "futura") && (o.vencimento ?? "") <= ate));
  const atrasadas = itens.filter((o) => o.situacao === "atrasada").length;
  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-fg"><CalendarDays size={16} className="text-modulo" /> Obrigações do Lucro Real</h2>
        {atrasadas > 0 && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${COR.atrasada}`}>{atrasadas} {pl(atrasadas, "atrasada", "atrasadas")}</span>}
        <Link to="/contador?aba=calendario" className="ml-auto text-sm font-semibold text-brand">Ver o calendário →</Link>
      </div>
      {itens.length ? (
        <ul className="divide-y divide-slate-100">
          {itens.slice(0, 8).map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-sm">
              <span className="num w-20 shrink-0 font-semibold text-slate-600">{o.vencimento ? dataBR(o.vencimento).slice(0, 5) : "—"}</span>
              <span className="min-w-0 flex-1 truncate text-fg">{o.regra.nome}{o.unidade ? ` · ${o.unidade.codigo ?? o.unidade.nome}` : ""} <span className="text-xs text-slate-500">({rotuloCompetencia(o.competencia)})</span></span>
              <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ${COR[o.situacao]}`}>{ROTULO_SITUACAO[o.situacao]}</span>
            </li>
          ))}
          {itens.length > 8 && <li className="py-1.5 text-xs text-slate-500">e mais {itens.length - 8} no calendário</li>}
        </ul>
      ) : <p className="text-sm text-emerald-700">Nada atrasado e nada vencendo nos próximos 15 dias.</p>}
    </Card>
  );
}
