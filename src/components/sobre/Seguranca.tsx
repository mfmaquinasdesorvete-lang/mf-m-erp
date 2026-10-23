// Sobre → Segurança (só o administrador): a lista do que é auditado na segurança do ERP Line — banco, login, funções,
// site, código, integrações e contas dos serviços —, com a situação de cada item, o resultado da última verificação e
// quando conferir de novo. O resultado pode descrever uma falha: fica só no banco (seguranca_auditoria), nunca no código.
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Hourglass, RefreshCw, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button, Card, Stat } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { dataBR, dataHoraBR } from "@/lib/format";
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

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const hoje = () => new Date().toISOString().slice(0, 10);

export function Seguranca() {
  const invalidar = useInvalidate();
  const { data: itens = [], isLoading, isError, error } = useRows<ItemSeguranca>("seguranca_auditoria", { order: "ordem", ascending: true });
  const [situacao, setSituacao] = useState<Situacao | "">("");
  const [busca, setBusca] = useState("");

  const conta = (s: Situacao) => itens.filter((i) => i.situacao === s).length;
  const vencidos = itens.filter((i) => i.rever_em && i.rever_em <= hoje()).length;
  const termo = semAcento(busca.trim());
  const visiveis = itens.filter((i) => (!situacao || i.situacao === situacao)
    && (!termo || semAcento(`${i.area} ${i.item} ${i.como_verificar ?? ""} ${i.resultado ?? ""} ${i.pedido ?? ""}`).includes(termo)));
  const areas = useMemo(() => {
    const m = new Map<string, ItemSeguranca[]>();
    for (const i of visiveis) m.set(i.area, [...(m.get(i.area) ?? []), i]);
    return [...m.entries()];
  }, [visiveis]);
  const filtrar = (s: Situacao) => setSituacao(situacao === s ? "" : s);

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
      <Card className="flex items-start gap-3 p-4 text-sm text-slate-600">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-modulo" aria-hidden />
        <p>O que é auditado na segurança do ERP e como está cada item. As verificações só leem: não mudam dados nem
          sobrecarregam o sistema. O resultado fica só aqui, para o administrador — nunca no código, que é público.</p>
      </Card>

      <Vigia />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat label="Itens auditados" valor={itens.length} icon={ShieldCheck} sub={vencidos ? `${vencidos} para conferir de novo` : undefined} onClick={() => setSituacao("")} />
        <Stat label="Risco" valor={conta("risco")} icon={ShieldAlert} tom={conta("risco") ? "critico" : "neutro"} onClick={() => filtrar("risco")} />
        <Stat label="Atenção" valor={conta("atencao")} icon={AlertTriangle} tom={conta("atencao") ? "atencao" : "neutro"} onClick={() => filtrar("atencao")} />
        <Stat label="A verificar" valor={conta("a_verificar") + conta("verificando")} icon={Hourglass} onClick={() => filtrar("a_verificar")}
          sub={conta("verificando") ? `${conta("verificando")} verificando agora` : undefined} />
        <Stat label="OK" valor={conta("ok")} icon={CheckCircle2} tom="bom" onClick={() => filtrar("ok")} />
      </div>

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

      {isLoading && <p className="py-6 text-center text-slate-500">Carregando…</p>}
      {isError && <Card className="p-4 text-sm text-red-800">Não deu para ler a lista de segurança: {(error as Error).message}</Card>}
      {!isLoading && !isError && !visiveis.length && <p className="py-6 text-center text-slate-500">Nenhum item {termo || situacao ? "com esse filtro" : "cadastrado ainda"}.</p>}
      {areas.map(([area, lista]) => (
        <Card key={area} className="p-4">
          <h3 className="mb-1 font-semibold text-fg">{area}</h3>
          <ul className="divide-y divide-slate-100">
            {lista.map((i) => (
              <li key={i.id} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 py-2.5">
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

/** Vigia automático: todo dia o banco confere a segurança e avisa no sino o que mudou ou está errado. */
function Vigia() {
  const invalidar = useInvalidate();
  const { data: ultimas = [] } = useRows<Conferencia>("seguranca_vigia", { order: "conferido_em", ascending: false, filtro: (q) => q.limit(1) });
  const [ocupado, setOcupado] = useState(false);
  const ultima = ultimas[0];

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

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {ultima?.problemas ? <ShieldAlert size={20} className="text-rose-600" aria-hidden /> : <ShieldCheck size={20} className="text-emerald-600" aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-fg">Vigia automático</p>
          <p className="text-xs text-slate-500">
            Todo dia às 9h41 o banco confere a segurança sozinho e avisa no sino o que mudou ou está errado.
            {ultima ? ` Última conferência: ${dataHoraBR(ultima.conferido_em)}.` : " Ainda não conferiu."}
          </p>
        </div>
        <Button variant="secondary" disabled={ocupado} onClick={conferir}><RefreshCw size={15} aria-hidden /> {ocupado ? "Conferindo…" : "Conferir agora"}</Button>
      </div>
      {ultima && !ultima.problemas && <p className="mt-2 text-sm font-medium text-emerald-700">Tudo certo na última conferência.</p>}
      {ultima && ultima.achados.length > 0 && (
        <ul className="mt-3 space-y-2">
          {ultima.achados.map((a) => (
            <li key={a.chave} className={`rounded-lg px-3 py-2 text-sm ${a.gravidade === "risco" ? "bg-rose-50 text-rose-900" : "bg-amber-50 text-amber-900"}`}>
              <div className="flex flex-wrap items-start gap-2">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{a.gravidade === "risco" ? "Risco: " : "Atenção: "}{a.titulo}</span>
                  {a.itens.length > 0 && <span className="block text-xs">{a.itens.join(", ")}</span>}
                </span>
                {ACEITAVEIS.has(a.chave) && (
                  <button type="button" disabled={ocupado} onClick={() => aceitar(a)}
                    className="shrink-0 rounded-md bg-white/70 px-2 py-1 text-xs font-semibold hover:bg-white disabled:opacity-50">Está certo, aceitar</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
