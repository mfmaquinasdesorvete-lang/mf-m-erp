// Sobre → Segurança (só o administrador): a lista do que é auditado na segurança do ERP Line — banco, login, funções,
// site, código, integrações e contas dos serviços —, com a situação de cada item, o resultado da última verificação e
// quando conferir de novo, num painel escuro (anel com a situação dos itens, números do vigia e uma barra por área).
// O resultado pode descrever uma falha: fica só no banco (seguranca_auditoria), nunca no código.
import { useMemo, useState } from "react";
import { AlertTriangle, Code2, Database, Globe, Hourglass, KeyRound, Plug, RefreshCw, Search, Server, ShieldAlert, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { AnelEscuro, LinhaEscura, NumeroEscuro, QuadroEscuro, type FatiaAnel } from "@/components/painel/PainelEscuro";
import { useInvalidate, useRows } from "@/lib/data";
import { dataBR, dataHoraBR, pl } from "@/lib/format";
import { notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";

type Situacao = "a_verificar" | "verificando" | "ok" | "atencao" | "risco" | "nao_se_aplica";
type Prioridade = "alta" | "media" | "baixa";
type ItemSeguranca = {
  id: string; area: string; item: string; como_verificar: string | null; prioridade: Prioridade; situacao: Situacao;
  resultado: string | null; pedido: string | null; verificado_em: string | null; rever_em: string | null; ordem: number;
};

const SITUACOES: Record<Situacao, { rotulo: string; classe: string }> = {
  risco: { rotulo: "Risco", classe: "bg-rose-100 text-rose-800" },
  atencao: { rotulo: "Atenção", classe: "bg-amber-100 text-amber-800" },
  verificando: { rotulo: "Verificando", classe: "bg-sky-100 text-sky-800" },
  a_verificar: { rotulo: "A verificar", classe: "bg-slate-200 text-slate-700" },
  ok: { rotulo: "OK", classe: "bg-emerald-100 text-emerald-800" },
  nao_se_aplica: { rotulo: "Não se aplica", classe: "bg-slate-100 text-slate-500" },
};
const PRIORIDADES: Record<Prioridade, string> = { alta: "prioridade alta", media: "prioridade média", baixa: "prioridade baixa" };
/** cores no painel escuro (tom forte e o "neon") e na bolinha de cada item */
const COR: Record<Situacao, { cor: string; neon: string }> = {
  risco: { cor: "#e11d48", neon: "#fb7185" },
  atencao: { cor: "#d97706", neon: "#fbbf24" },
  verificando: { cor: "#0284c7", neon: "#38bdf8" },
  a_verificar: { cor: "#475569", neon: "#94a3b8" },
  ok: { cor: "#059669", neon: "#34d399" },
  nao_se_aplica: { cor: "#334155", neon: "#64748b" },
};
const ORDEM_ANEL: Situacao[] = ["ok", "atencao", "risco", "verificando", "a_verificar", "nao_se_aplica"];
/** a pior situação da área dá a cor da linha */
const PIOR: Situacao[] = ["risco", "atencao", "verificando", "a_verificar"];
const ICONE_AREA: Record<string, LucideIcon> = {
  "Banco de dados": Database, "Login e acesso": KeyRound, "Funções (Supabase)": Server, "Site (Hostinger)": Globe,
  "Código e GitHub": Code2, "Integrações": Plug, "Contas dos serviços": Users,
};

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const hoje = () => new Date().toISOString().slice(0, 10);

export function Seguranca() {
  const invalidar = useInvalidate();
  const { data: itens = [], isLoading, isError, error } = useRows<ItemSeguranca>("seguranca_auditoria", { order: "ordem", ascending: true });
  const vigia = useVigia();
  const [situacao, setSituacao] = useState<Situacao | "">("");
  const [area, setArea] = useState("");
  const [busca, setBusca] = useState("");

  const conta = (s: Situacao, lista = itens) => lista.filter((i) => i.situacao === s).length;
  const vencidos = itens.filter((i) => i.rever_em && i.rever_em <= hoje()).length;
  const aplicaveis = itens.length - conta("nao_se_aplica");
  const pctOk = aplicaveis ? Math.round((conta("ok") / aplicaveis) * 100) : 0;
  const termo = semAcento(busca.trim());
  const visiveis = itens.filter((i) => (!situacao || i.situacao === situacao) && (!area || i.area === area)
    && (!termo || semAcento(`${i.area} ${i.item} ${i.como_verificar ?? ""} ${i.resultado ?? ""} ${i.pedido ?? ""}`).includes(termo)));
  const porArea = useMemo(() => {
    const m = new Map<string, ItemSeguranca[]>();
    for (const i of itens) m.set(i.area, [...(m.get(i.area) ?? []), i]);
    return [...m.entries()];
  }, [itens]);
  const areas = useMemo(() => {
    const m = new Map<string, ItemSeguranca[]>();
    for (const i of visiveis) m.set(i.area, [...(m.get(i.area) ?? []), i]);
    return [...m.entries()];
  }, [visiveis]);
  const filtrar = (s: Situacao) => setSituacao(situacao === s ? "" : s);
  const fatias: FatiaAnel<Situacao>[] = ORDEM_ANEL.map((s) => ({ id: s, rotulo: SITUACOES[s].rotulo, valor: conta(s), cor: COR[s].cor, neon: COR[s].neon,
    dica: `${SITUACOES[s].rotulo}: ${conta(s)} ${pl(conta(s), "item", "itens")}` })).filter((f) => f.valor > 0);
  const filtroTexto = [situacao && SITUACOES[situacao].rotulo, area].filter(Boolean).join(" · ");
  const ultima = vigia.ultima;

  async function mudarSituacao(i: ItemSeguranca, nova: Situacao) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const conferido = nova !== "a_verificar" && nova !== "verificando";
      const { error } = await supabase.from("seguranca_auditoria").update({
        situacao: nova,
        ...(conferido ? { verificado_em: new Date().toISOString(), verificado_por: user?.id ?? null } : {}),
      }).eq("id", i.id);
      if (error) throw error;
      invalidar("seguranca_auditoria");
    } catch (e) { notifyError(e); }
  }

  return (
    <div className="space-y-5">
      <QuadroEscuro rotulo="Segurança do ERP" titulo="Segurança" destaque="do ERP" className=""
        filtro={filtroTexto ? { texto: filtroTexto, onLimpar: () => { setSituacao(""); setArea(""); } } : undefined}
        acoes={!filtroTexto && (
          <button type="button" disabled={vigia.ocupado} onClick={vigia.conferir}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#0a1f3d] hover:bg-white/90 disabled:opacity-60">
            <RefreshCw size={13} aria-hidden className={vigia.ocupado ? "animate-spin" : ""} /> {vigia.ocupado ? "Conferindo…" : "Conferir agora"}
          </button>
        )}>
        <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,15.5rem)_auto_minmax(0,1fr)] lg:gap-6">
          {/* celular: o anel primeiro, no centro */}
          <div className="order-1 min-w-0 lg:order-2">
            <AnelEscuro fatias={fatias} escolhida={situacao} onEscolher={(id) => setSituacao(id)}
              rotulo={`${pctOk}% dos itens de segurança OK: ${fatias.map((f) => `${f.rotulo} ${f.valor}`).join(", ")}`}
              centro={situacao
                ? { rotulo: SITUACOES[situacao].rotulo, valor: String(conta(situacao)), sub: `de ${itens.length} itens` }
                : { rotulo: "Itens OK", valor: `${pctOk}%`, sub: `${conta("ok")} de ${aplicaveis} conferidos` }} />
          </div>

          <div className="order-2 grid min-w-0 grid-cols-2 gap-2 lg:order-1 lg:grid-cols-1">
            <NumeroEscuro icone={ultima?.problemas ? ShieldAlert : ShieldCheck} rotulo="Vigia automático"
              valor={!ultima ? "—" : ultima.problemas ? `${ultima.problemas} ${pl(ultima.problemas, "alerta", "alertas")}` : "Tudo certo"}
              sub={ultima ? `conferido ${dataHoraBR(ultima.conferido_em)}` : "ainda não conferiu"}
              de={ultima?.problemas ? "#fb7185" : "#34d399"} ate={ultima?.problemas ? "#e11d48" : "#059669"} aceso
              title="Todo dia às 9h41 o banco confere a segurança sozinho e avisa no sino o que mudou ou está errado" />
            <NumeroEscuro icone={ShieldAlert} rotulo="Risco" valor={conta("risco")} sub={conta("risco") ? "resolver primeiro" : "nenhum"}
              de="#fb7185" ate="#e11d48" aceso={conta("risco") > 0} onClick={() => filtrar("risco")} title="Toque para ver só os itens em risco" />
            <NumeroEscuro icone={AlertTriangle} rotulo="Atenção" valor={conta("atencao")} sub={conta("atencao") ? "pontos a melhorar" : "nenhum"}
              de="#fbbf24" ate="#d97706" aceso={conta("atencao") > 0} onClick={() => filtrar("atencao")} title="Toque para ver só os itens de atenção" />
            <NumeroEscuro icone={Hourglass} rotulo="A verificar" valor={conta("a_verificar") + conta("verificando")}
              sub={vencidos ? `${vencidos} para conferir de novo` : conta("verificando") ? `${conta("verificando")} verificando agora` : "na fila da auditoria"}
              de="#94a3b8" ate="#475569" aceso={conta("a_verificar") + conta("verificando") > 0} onClick={() => filtrar("a_verificar")} title="Toque para ver só os que faltam verificar" />
          </div>

          <ul className="order-3 grid min-w-0 gap-1.5 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2" aria-label="Por área">
            {porArea.map(([nome, lista]) => {
              const ok = conta("ok", lista) + conta("nao_se_aplica", lista);
              const pior = PIOR.find((s) => conta(s, lista) > 0) ?? "ok";
              const ativo = area === nome;
              return (
                <li key={nome} className="min-w-0">
                  <LinhaEscura icone={ICONE_AREA[nome] ?? ShieldCheck} rotulo={nome} valor={`${ok}/${lista.length}`} pct={lista.length ? (ok / lista.length) * 100 : 0}
                    cor={COR[pior].cor} neon={COR[pior].neon} ativo={ativo} apagado={!!area && !ativo}
                    onClick={() => setArea(ativo ? "" : nome)} title="Toque para ver só esta área"
                    detalhes={PIOR.filter((s) => conta(s, lista) > 0).map((s) => <span key={s}>{conta(s, lista)} {SITUACOES[s].rotulo.toLowerCase()}</span>)} />
                </li>
              );
            })}
          </ul>
        </div>
      </QuadroEscuro>

      <AlertasVigia vigia={vigia} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item (ex.: login, backup, #284)" aria-label="Buscar item de segurança" />
        </div>
        <select className="input w-auto" value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao | "")} aria-label="Situação">
          <option value="">Todas as situações</option>
          {(Object.keys(SITUACOES) as Situacao[]).map((s) => <option key={s} value={s}>{SITUACOES[s].rotulo}</option>)}
        </select>
      </div>
      <p className="text-xs text-slate-500">As verificações só leem: não mudam dados nem sobrecarregam o sistema. O resultado fica só aqui, para o
        administrador — nunca no código, que é público.</p>

      {isLoading && <p className="py-6 text-center text-slate-500">Carregando…</p>}
      {isError && <Card className="p-4 text-sm text-red-800">Não deu para ler a lista de segurança: {(error as Error).message}</Card>}
      {!isLoading && !isError && !visiveis.length && <p className="py-6 text-center text-slate-500">Nenhum item {termo || situacao || area ? "com esse filtro" : "cadastrado ainda"}.</p>}
      {areas.map(([nome, lista]) => (
        <Card key={nome} className="p-4">
          <h3 className="mb-1 font-semibold text-fg">{nome}</h3>
          <ul className="divide-y divide-slate-100">
            {lista.map((i) => (
              <li key={i.id} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 py-2.5">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR[i.situacao].cor }} aria-hidden />
                <div className="min-w-0 flex-1 basis-64">
                  <span className="text-sm font-medium text-fg">{i.item}</span>
                  {i.como_verificar && <span className="block text-xs text-slate-500">{i.como_verificar}</span>}
                  {i.resultado && <span className="mt-1 block whitespace-pre-line rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-700">{i.resultado}</span>}
                  <span className="mt-0.5 flex flex-wrap gap-x-3 text-2xs text-slate-500">
                    <span className={i.prioridade === "alta" ? "font-semibold text-rose-700" : ""}>{PRIORIDADES[i.prioridade]}</span>
                    {i.pedido && <span>pedido {i.pedido}</span>}
                    {i.verificado_em && <span>verificado em {dataBR(i.verificado_em)}</span>}
                    {i.rever_em && <span className={i.rever_em <= hoje() ? "font-semibold text-amber-700" : ""}>conferir de novo em {dataBR(i.rever_em)}</span>}
                  </span>
                </div>
                <select value={i.situacao} onChange={(e) => mudarSituacao(i, e.target.value as Situacao)} aria-label={`Situação: ${i.item}`}
                  className={`shrink-0 cursor-pointer rounded-md border-0 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide ${SITUACOES[i.situacao].classe}`}>
                  {(Object.keys(SITUACOES) as Situacao[]).map((s) => <option key={s} value={s}>{SITUACOES[s].rotulo}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

type Achado = { chave: string; gravidade: "risco" | "atencao"; titulo: string; itens: string[] };
type Conferencia = { id: number; conferido_em: string; achados: Achado[]; problemas: number; origem: string };
/** o que vem da comparação com a base aceita (dá para aceitar); o resto é conferência de quantidade */
const ACEITAVEIS = new Set(["tabelas_sem_rls", "visitante_tabelas", "regras_abertas", "visitante_funcoes", "funcoes_sem_conferir",
  "funcoes_sem_caminho", "visoes_sem_invoker", "arquivos_publicos", "administradores"]);

type Vigia = ReturnType<typeof useVigia>;

/** Vigia automático: todo dia o banco confere a segurança e avisa no sino o que mudou ou está errado. */
function useVigia() {
  const invalidar = useInvalidate();
  const { data: ultimas = [] } = useRows<Conferencia>("seguranca_vigia", { order: "conferido_em", ascending: false, filtro: (q) => q.limit(1) });
  const [ocupado, setOcupado] = useState(false);

  async function rodar(acao: () => PromiseLike<{ error: unknown }>) {
    setOcupado(true);
    try { const { error } = await acao(); if (error) throw error; invalidar("seguranca_vigia"); }
    catch (e) { notifyError(e); }
    finally { setOcupado(false); }
  }
  const conferir = () => rodar(() => supabase.rpc("vigiar_seguranca", { p_manual: true }));
  const aceitar = (a: Achado) => {
    if (!window.confirm(`Confirma que esta mudança está certa?\n\n${a.titulo}: ${a.itens.join(", ")}\n\nO vigia para de avisar sobre ela.`)) return;
    void rodar(async () => {
      const r = await supabase.rpc("seguranca_aceitar", { p_chave: a.chave });
      if (r.error) return r;
      return supabase.rpc("vigiar_seguranca", { p_manual: true });
    });
  };
  return { ultima: ultimas[0] as Conferencia | undefined, ocupado, conferir, aceitar };
}

/** Os alertas da última conferência do vigia (só aparece quando há algum). */
function AlertasVigia({ vigia }: { vigia: Vigia }) {
  const achados = vigia.ultima?.achados ?? [];
  if (!achados.length) return null;
  return (
    <Card className="p-4">
      <p className="mb-2 flex items-center gap-2 font-semibold text-fg"><ShieldAlert size={18} className="text-rose-600" aria-hidden /> Alertas do vigia automático</p>
      <ul className="space-y-2">
        {achados.map((a) => (
          <li key={a.chave} className={`rounded-lg px-3 py-2 text-sm ${a.gravidade === "risco" ? "bg-rose-50 text-rose-900" : "bg-amber-50 text-amber-900"}`}>
            <div className="flex flex-wrap items-start gap-2">
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{a.gravidade === "risco" ? "Risco: " : "Atenção: "}{a.titulo}</span>
                {a.itens.length > 0 && <span className="block text-xs">{a.itens.join(", ")}</span>}
              </span>
              {ACEITAVEIS.has(a.chave) && (
                <Button type="button" variant="secondary" disabled={vigia.ocupado} onClick={() => vigia.aceitar(a)}>Está certo, aceitar</Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
