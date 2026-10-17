// Sobre o ERP Line → Rodada (VISUALIZE): a rodada de trabalho em curso em uma página para ver de relance — onde está
// (código, banco, testes, site), os números ao vivo, o que foi pedido e o que virou, o que falta de quem, escopo,
// suposições, conflitos, o semáforo de seguir/corrigir/parar e os riscos com a prevenção. O texto vem de lib/rodada.ts;
// os números da empresa vêm do banco (o repositório é público).
import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowRight, Ban, CheckCircle2, CircleDashed, CircleDot, Code2, Database, FlaskConical, Globe, Hammer,
  HelpCircle, Lock, MessageSquare, OctagonX, ShieldCheck, Sparkles, Users, Wrench,
} from "lucide-react";
import { Card, Stat } from "@/components/ui";
import { useMarcadores } from "@/components/nfe/Marcadores";
import { useRows } from "@/lib/data";
import { brl, pl } from "@/lib/format";
import { ehMarcadorQuiosque } from "@/lib/quiosques";
import type { Sugestao } from "@/lib/sugestoesProdutos";
import { RODADA_ATUAL, type Risco, type SituacaoPedido } from "@/lib/rodada";
import type { InfoVersao } from "@/lib/atualizacoes";
import type { InicialItem } from "./ItemProjeto";

const R = RODADA_ATUAL;
const PEDIDO: Record<SituacaoPedido, { nome: string; cor: string; Icone: typeof CheckCircle2 }> = {
  feito: { nome: "Feito", cor: "bg-emerald-100 text-emerald-800 ring-emerald-200", Icone: CheckCircle2 },
  parcial: { nome: "Em parte", cor: "bg-amber-100 text-amber-800 ring-amber-200", Icone: CircleDot },
  aguarda: { nome: "Aguarda você", cor: "bg-red-100 text-red-800 ring-red-200", Icone: CircleDashed },
};
const RISCO: Record<Risco, { nome: string; borda: string; chip: string }> = {
  alto: { nome: "Risco alto", borda: "border-l-red-500", chip: "bg-red-100 text-red-800 ring-red-200" },
  medio: { nome: "Risco médio", borda: "border-l-amber-500", chip: "bg-amber-100 text-amber-800 ring-amber-200" },
  baixo: { nome: "Risco baixo", borda: "border-l-slate-400", chip: "bg-slate-100 text-slate-700 ring-slate-200" },
};
const SECOES = [
  ["pedidos", "Pedidos"], ["faltas", "O que falta"], ["escopo", "Escopo"], ["decisoes", "Decisões"],
  ["suposicoes", "Suposições"], ["conflitos", "Conflitos"], ["semaforo", "Semáforo"], ["riscos", "Riscos"],
] as const;

type Nota = { id: string; valor_total: number | null; excluida_em?: string | null; marcadores?: string[] | null };
type Desde = { cliente_id: string; desde: string; fonte: string };

function Titulo({ id, Icone, children, sub }: { id: string; Icone: typeof CheckCircle2; children: string; sub?: string }) {
  return (
    <h2 id={`rodada-${id}`} className="mb-3 flex scroll-mt-4 flex-wrap items-baseline gap-x-2 text-lg font-bold text-fg">
      <span className="inline-flex items-center gap-2"><Icone size={19} className="text-modulo" aria-hidden />{children}</span>
      {sub && <span className="text-sm font-normal text-slate-500">{sub}</span>}
    </h2>
  );
}

export function Rodada({ versao, onIdeia, onPendencia }: { versao: InfoVersao | null; onIdeia: (i: InicialItem) => void; onPendencia: (i: InicialItem) => void }) {
  // números ao vivo (nada disso fica escrito no código)
  const { data: sugestoes = [] } = useRows<Sugestao>("produto_sugestoes", { order: "criado_em", ascending: false });
  const { data: marcadores = [] } = useMarcadores();
  const { data: notas = [] } = useRows<Nota>("nfe_recebidas", { select: "id, chave, emitente_nome, emitente_cnpj, valor_total, data_emissao, unidade_id, excluida_em, marcadores", order: "data_emissao", key: ["quiosques"] });
  const { data: desde = [] } = useRows<Desde>("clientes_desde", { select: "cliente_id, desde, fonte", order: "cliente_id", key: ["rodada"] });

  const pend = sugestoes.filter((s) => s.situacao === "pendente");
  const altas = pend.filter((s) => s.confianca === "alta").length;
  const ncmContador = pend.filter((s) => s.campo === "ncm" && s.confianca !== "alta").length;
  const idQuiosque = marcadores.find((m) => ehMarcadorQuiosque(m.nome))?.id;
  const quiosques = idQuiosque ? notas.filter((n) => !n.excluida_em && (n.marcadores ?? []).includes(idQuiosque)) : [];
  const totalQuiosques = quiosques.reduce((s, n) => s + Number(n.valor_total ?? 0), 0);
  const comDataReal = desde.filter((d) => d.fonte !== "cadastro").length;
  const anoAtual = String(new Date().getFullYear());
  const antigos = desde.filter((d) => String(d.desde).slice(0, 4) < anoAtual).length;

  // no ar: esta página aberta no endereço do ERP (na demonstração e na prévia, ainda não)
  const noAr = import.meta.env.MODE !== "demo" && /(^|\.)myfrost\.ai$/.test(window.location.hostname);
  const etapas = [
    { nome: "Código", Icone: Code2, ok: true, sub: versao ? `versão ${versao.numero} · ${versao.hash}` : "enviado" },
    { nome: "Banco", Icone: Database, ok: true, sub: "migrações 91 e 92 aplicadas" },
    { nome: "Testes", Icone: FlaskConical, ok: true, sub: "tipos, testes e build sem erro" },
    { nome: "Site", Icone: Globe, ok: noAr, sub: noAr ? "no ar: é esta versão" : "aguardando \"pode publicar\"" },
  ];
  const [risco, setRisco] = useState<Risco | "">("");
  const suposicoes = useMemo(() => R.suposicoes.filter((s) => !risco || s.risco === risco), [risco]);
  const ir = (id: string) => document.getElementById(`rodada-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="space-y-6">
      {/* onde a rodada está */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-[#0f766e] via-[#1d4ed8] to-[#7c3aed] p-4 text-white sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-wider opacity-80">Rodada atual · VISUALIZE</div>
          <h2 className="text-xl font-bold [text-wrap:balance]">{R.titulo}</h2>
          <p className="mt-1 max-w-3xl text-sm opacity-90">{R.resumo}</p>
        </div>
        <ol className="grid grid-cols-2 gap-px bg-slate-100 lg:grid-cols-4">
          {etapas.map((e, i) => (
            <li key={e.nome} className="relative flex items-center gap-3 bg-surface p-4">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${e.ok ? "bg-solido-verde text-white" : "bg-amber-100 text-amber-800 ring-2 ring-amber-400"}`}><e.Icone size={19} aria-hidden /></span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-bold text-fg">{i + 1}. {e.nome} {e.ok ? <CheckCircle2 size={15} className="text-emerald-600" aria-label="pronto" /> : <CircleDashed size={15} className="text-amber-600" aria-label="pendente" />}</div>
                <div className="text-xs text-slate-500">{e.sub}</div>
              </div>
              {i < etapas.length - 1 && <ArrowRight size={16} className="absolute -right-2 top-1/2 z-[1] hidden -translate-y-1/2 text-slate-400 lg:block" aria-hidden />}
            </li>
          ))}
        </ol>
      </Card>

      {/* números ao vivo */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Correções de produtos esperando" valor={pend.length} icon={Sparkles} tom={pend.length ? "atencao" : "bom"}
          sub={pend.length ? `${altas} de confiança alta · ${ncmContador} NCM para o contador` : "nada pendente"} />
        <Stat label="Gasto com quiosques" valor={brl(totalQuiosques)} icon={Hammer} tom="info" sub={`${quiosques.length} ${pl(quiosques.length, "nota", "notas")} com o marcador`} />
        <Stat label="Clientes com a data real" valor={desde.length ? `${comDataReal} de ${desde.length}` : "—"} icon={Users} sub={`${antigos} desde antes de ${anoAtual}`} />
        <Stat label="Respostas que faltam" valor={R.faltas.length} icon={HelpCircle} tom={R.faltas.length ? "critico" : "bom"}
          sub={`${R.faltas.filter((f) => f.quem === "empresa").length} da empresa · ${R.faltas.filter((f) => f.quem === "contador").length} do contador`} onClick={() => ir("faltas")} />
      </div>

      <nav className="flex flex-wrap gap-1.5" aria-label="Partes da rodada">
        {SECOES.map(([id, nome]) => (
          <button key={id} type="button" onClick={() => ir(id)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200">{nome}</button>
        ))}
      </nav>

      {/* pedido → o que virou */}
      <section>
        <Titulo id="pedidos" Icone={MessageSquare} sub={`${R.pedidos.filter((p) => p.situacao === "feito").length} de ${R.pedidos.length} feitos`}>O que foi pedido e o que virou</Titulo>
        <ul className="space-y-2">
          {R.pedidos.map((p) => {
            const s = PEDIDO[p.situacao];
            return (
              <li key={p.pedido} className="grid items-center gap-2 rounded-xl border border-slate-200 bg-surface p-3 md:grid-cols-[1fr_auto_1fr_auto]">
                <span className="min-w-0 rounded-lg bg-slate-100 px-3 py-2 text-sm italic text-slate-700">“{p.pedido}”</span>
                <ArrowRight size={16} className="hidden text-slate-400 md:block" aria-hidden />
                <ArrowDown size={16} className="mx-auto text-slate-400 md:hidden" aria-hidden />
                <span className="min-w-0 text-sm font-semibold text-fg">{p.virou}</span>
                <span className={`inline-flex w-fit items-center gap-1 justify-self-start rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset md:justify-self-end ${s.cor}`}><s.Icone size={13} aria-hidden />{s.nome}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* o que falta e o que já dá para fazer */}
      <section className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div>
          <Titulo id="faltas" Icone={Lock} sub="cada resposta destrava uma parte">O que falta e o que fica parado</Titulo>
          <ul className="grid gap-2 sm:grid-cols-2">
            {R.faltas.map((f) => (
              <li key={f.pergunta} className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-bold text-fg">{f.pergunta}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${f.quem === "contador" ? "bg-purple-100 text-purple-800" : "bg-sky-100 text-sky-800"}`}>{f.quem === "contador" ? "Contador" : "Você"}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-600"><Lock size={12} aria-hidden /> Segura: {f.bloqueia}</div>
                <button type="button" onClick={() => onPendencia({ titulo: f.pergunta.slice(0, 160), detalhe: `Segura: ${f.bloqueia}`, responsavel: f.quem, prioridade: "alta", area: "geral" })}
                  className="mt-auto w-fit rounded-lg bg-surface px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">Anotar no Handoff</button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <Titulo id="ja" Icone={Wrench}>Já dá para fazer</Titulo>
          <ol className="space-y-2">
            {R.jaPosso.map((t, i) => (
              <li key={t} className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-fg">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-solido-verde text-xs font-bold text-white">{i + 1}</span>{t}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* escopo */}
      <section>
        <Titulo id="escopo" Icone={ShieldCheck}>Escopo: o que entrou, o que fica igual e o que pode mudar</Titulo>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {([
            ["Entrou", R.escopo.entrou, "bg-solido-verde", CheckCircle2],
            ["Continua igual", R.escopo.mantido, "bg-solido-azul", ShieldCheck],
            ["Autorizado", R.escopo.autorizado, "bg-[#7c3aed]", Sparkles],
            ["Não autorizado", R.escopo.naoAutorizado, "bg-solido-vermelho", Ban],
          ] as const).map(([nome, itens, cor, Icone]) => (
            <Card key={nome} className="overflow-hidden">
              <div className={`flex items-center gap-2 px-4 py-2.5 font-bold text-white ${cor}`}><Icone size={17} aria-hidden />{nome} <span className="ml-auto text-sm opacity-90">{itens.length}</span></div>
              <ul className="space-y-1.5 p-4 text-sm text-slate-700">{itens.map((t) => <li key={t} className="flex gap-2"><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${cor}`} aria-hidden />{t}</li>)}</ul>
            </Card>
          ))}
        </div>
      </section>

      {/* decisões anteriores */}
      <section>
        <Titulo id="decisoes" Icone={CheckCircle2} sub="valem para esta rodada">Decisões que já foram tomadas</Titulo>
        <div className="grid gap-3 md:grid-cols-2">
          {R.decisoes.map((d) => (
            <Card key={d.grupo} className="p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-modulo-texto">{d.grupo}</div>
              <div className="flex flex-wrap gap-1.5">{d.itens.map((t) => <span key={t} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{t}</span>)}</div>
            </Card>
          ))}
        </div>
      </section>

      {/* suposições */}
      <section>
        <Titulo id="suposicoes" Icone={HelpCircle} sub="o que eu supus, o que acontece se estiver errado e como conferir">Suposições</Titulo>
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Risco">
          <button type="button" aria-pressed={!risco} onClick={() => setRisco("")} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${!risco ? "bg-brand text-white ring-brand" : "bg-surface text-slate-700 ring-slate-200"}`}>Todas {R.suposicoes.length}</button>
          {(["alto", "medio", "baixo"] as const).map((r) => (
            <button key={r} type="button" aria-pressed={risco === r} onClick={() => setRisco(risco === r ? "" : r)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${risco === r ? `${RISCO[r].chip} ring-2` : "bg-surface text-slate-700 ring-slate-200"}`}>{RISCO[r].nome} {R.suposicoes.filter((s) => s.risco === r).length}</button>
          ))}
        </div>
        <ul className="space-y-2">
          {suposicoes.map((s) => (
            <li key={s.texto} className={`grid gap-2 rounded-xl border border-l-4 border-slate-200 bg-surface p-3 md:grid-cols-[2fr_1.4fr_1.4fr] ${RISCO[s.risco].borda}`}>
              <div className="min-w-0"><span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${RISCO[s.risco].chip}`}>{RISCO[s.risco].nome}</span><div className="text-sm font-semibold text-fg">{s.texto}</div></div>
              <div className="min-w-0 text-sm"><div className="text-[11px] font-bold uppercase text-red-700">Se estiver errada</div><div className="text-slate-700">{s.seErrada}</div></div>
              <div className="min-w-0 text-sm"><div className="text-[11px] font-bold uppercase text-emerald-700">Como conferir</div><div className="text-slate-700">{s.conferir}</div></div>
            </li>
          ))}
        </ul>
      </section>

      {/* conflitos */}
      <section>
        <Titulo id="conflitos" Icone={AlertTriangle} sub="pedidos que se chocam e a escolha que resolve">Conflitos</Titulo>
        <div className="grid gap-3 md:grid-cols-2">
          {R.conflitos.map((c) => (
            <Card key={c.a + c.b} className="p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <span className="rounded-lg bg-sky-100 px-2.5 py-1 text-sky-800">{c.a}</span>
                <span className="text-slate-400" aria-label="contra">⟷</span>
                <span className="rounded-lg bg-orange-100 px-2.5 py-1 text-orange-800">{c.b}</span>
              </div>
              <div className="mt-2 flex gap-2 text-sm text-fg"><ArrowRight size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden /><span><b>Escolha:</b> {c.escolha}</span></div>
            </Card>
          ))}
        </div>
      </section>

      {/* semáforo */}
      <section>
        <Titulo id="semaforo" Icone={CircleDot}>Quando continuar, corrigir ou parar</Titulo>
        <div className="grid gap-3 md:grid-cols-3">
          {([
            ["Continuar", R.semaforo.continuar, "bg-solido-verde", CheckCircle2],
            ["Corrigir", R.semaforo.corrigir, "bg-solido-ambar", Wrench],
            ["Parar e perguntar", R.semaforo.parar, "bg-solido-vermelho", OctagonX],
          ] as const).map(([nome, itens, cor, Icone]) => (
            <Card key={nome} className="p-4">
              <div className="mb-3 flex items-center gap-3">
                <span className={`grid h-11 w-11 place-items-center rounded-full text-white shadow-card ${cor}`}><Icone size={22} aria-hidden /></span>
                <span className="text-base font-bold text-fg">{nome}</span>
              </div>
              <ul className="space-y-1.5 text-sm text-slate-700">{itens.map((t) => <li key={t} className="flex gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${cor}`} aria-hidden />{t}</li>)}</ul>
            </Card>
          ))}
        </div>
      </section>

      {/* riscos → prevenção */}
      <section>
        <Titulo id="riscos" Icone={ShieldCheck} sub="o que pode dar errado e o que já evita">Riscos e prevenção</Titulo>
        <ul className="space-y-2">
          {R.riscos.map((r) => (
            <li key={r.risco} className="grid items-stretch gap-2 md:grid-cols-[1fr_auto_1.4fr]">
              <span className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 ring-1 ring-inset ring-red-200"><AlertTriangle size={15} className="shrink-0" aria-hidden />{r.risco}</span>
              <ArrowRight size={16} className="hidden self-center text-slate-400 md:block" aria-hidden />
              <span className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200"><ShieldCheck size={15} className="shrink-0" aria-hidden />{r.prevencao}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-slate-500">
        A cada rodada esta página muda. As respostas também podem ir para o Handoff (botão "Anotar no Handoff");{" "}
        <button type="button" className="font-semibold text-brand hover:underline" onClick={() => onIdeia({ titulo: "Rodada: ", area: "geral" })}>anotar uma ideia sobre a rodada</button>.
      </p>
    </div>
  );
}
