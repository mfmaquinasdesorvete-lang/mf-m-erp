// Avaliação de fornecedores (ISO 9001, item 8.4): quem fornece bem, quem precisa melhorar e quem deve ser trocado.
// O ERP sugere as notas pelo que já registrou (entregas no prazo, devoluções, baixas por defeito, não conformidades);
// a equipe confere, ajusta e grava. A classe A/B/C define a próxima reavaliação.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ClipboardCheck, Plus, ShieldCheck, Star } from "lucide-react";
import { Button, Card, Field, Modal, PageHeader } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useInvalidate, useRows } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import { usePerfil } from "@/lib/auth";
import type { Fornecedor } from "@/lib/types";
import {
  CLASSES, classe, GRAVIDADES, notaFinal, notasSugeridas, PESOS, proximaAvaliacao, situacaoAvaliacao, TIPOS_OCORRENCIA,
  type Classe, type Indicadores, type Notas,
} from "@/lib/avaliacaoFornecedor";

type Indicador = Indicadores & { fornecedor_id: string; pedidos: number; notas: number; valor_compras: number; ultima_compra: string | null };
type Ocorrencia = { id: string; fornecedor_id: string; data: string; tipo: string; gravidade: string; descricao: string; acao: string | null; resolvida_em: string | null; criado_nome: string | null };
type Avaliacao = { id: string; fornecedor_id: string; data: string; nota_prazo: number; nota_qualidade: number; nota_preco: number; nota_atendimento: number; nota_final: number; classe: Classe; observacoes: string | null; avaliado_nome: string | null };

const FILTROS = [
  { id: "compras", rotulo: "Com compras no período" },
  { id: "vencida", rotulo: "Reavaliar agora" },
  { id: "sem", rotulo: "Nunca avaliados" },
  { id: "criticos", rotulo: "Críticos" },
  { id: "C", rotulo: "Classe C" },
  { id: "todos", rotulo: "Todos" },
] as const;

import { SeloClasse } from "@/components/fornecedores/SeloClasse";

const nomeDe = (f: Pick<Fornecedor, "nome" | "nome_fantasia">) => f.nome_fantasia?.trim() || f.nome;

export default function AvaliacaoFornecedores() {
  const { tem } = usePerfil();
  const podeAvaliar = tem("compras", "financeiro");
  const invalidar = useInvalidate();
  const [inicio, setInicio] = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); });
  const [fim, setFim] = useState(hoje());
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("compras");
  const [busca, setBusca] = useState("");
  const [avaliando, setAvaliando] = useState<Fornecedor | null>(null);
  const [problema, setProblema] = useState<Fornecedor | null>(null);

  const { data: fornecedores = [] } = useRows<Fornecedor>("fornecedores", { order: "nome", ascending: true });
  const { data: ocorrencias = [] } = useRows<Ocorrencia>("fornecedor_ocorrencias", { order: "data", ascending: false });
  const ind = useQuery({
    queryKey: ["indicadores_fornecedores", inicio, fim],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("indicadores_fornecedores", { p_inicio: inicio, p_fim: fim });
      if (error) throw error;
      return (data ?? []) as Indicador[];
    },
  });
  const porForn = useMemo(() => new Map((ind.data ?? []).map((i) => [i.fornecedor_id, i])), [ind.data]);
  const abertas = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of ocorrencias) if (!o.resolvida_em) m.set(o.fornecedor_id, (m.get(o.fornecedor_id) ?? 0) + 1);
    return m;
  }, [ocorrencias]);

  const dia = hoje();
  const ativos = fornecedores.filter((f) => f.ativo !== false && !f.unificado_em && !f.bloqueado);
  const lista = ativos.filter((f) => {
    const i = porForn.get(f.id);
    const s = situacaoAvaliacao(f.proxima_avaliacao, dia);
    if (busca && !`${f.nome} ${f.nome_fantasia ?? ""}`.toLowerCase().includes(busca.toLowerCase())) return false;
    if (filtro === "compras") return !!i && (i.notas > 0 || i.pedidos > 0 || i.ocorrencias.length > 0);
    if (filtro === "vencida") return s === "vencida" || s === "em_breve";
    if (filtro === "sem") return s === "sem" && !!i?.notas;
    if (filtro === "criticos") return !!f.critico;
    if (filtro === "C") return f.avaliacao_classe === "C";
    return true;
  }).sort((a, b) => Number(porForn.get(b.id)?.valor_compras ?? 0) - Number(porForn.get(a.id)?.valor_compras ?? 0));

  const conta = (c: Classe) => ativos.filter((f) => f.avaliacao_classe === c).length;
  const vencidas = ativos.filter((f) => situacaoAvaliacao(f.proxima_avaliacao, dia) === "vencida").length;
  const semAval = ativos.filter((f) => !f.avaliacao_classe && porForn.get(f.id)?.notas).length;
  const ncAbertas = [...abertas.values()].reduce((s, n) => s + n, 0);

  async function alternarCritico(f: Fornecedor) {
    const { error } = await supabase.from("fornecedores").update({ critico: !f.critico }).eq("id", f.id);
    if (error) notifyError(error); else { invalidar("fornecedores"); notify(f.critico ? "Deixou de ser crítico" : "Marcado como crítico: reavaliação a cada 6 meses no máximo"); }
  }

  return (
    <div>
      <PageHeader title="Avaliação de fornecedores" subtitle="ISO 9001 · 8.4 — prazo, qualidade, preço e atendimento; não conformidades e reavaliação" />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Numero rotulo={CLASSES.A.rotulo} valor={conta("A")} cor="text-emerald-700" />
        <Numero rotulo={CLASSES.B.rotulo} valor={conta("B")} cor="text-amber-700" />
        <Numero rotulo={CLASSES.C.rotulo} valor={conta("C")} cor="text-red-700" />
        <Numero rotulo="Reavaliação vencida" valor={vencidas} cor={vencidas ? "text-red-700" : undefined} onClick={() => setFiltro("vencida")} />
        <Numero rotulo="Com compras e nunca avaliados" valor={semAval} onClick={() => setFiltro("sem")} />
        <Numero rotulo="Não conformidades abertas" valor={ncAbertas} cor={ncAbertas ? "text-amber-700" : undefined} />
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Field label="De" className="w-36"><input type="date" className="input" value={inicio} onChange={(e) => setInicio(e.target.value)} /></Field>
        <Field label="Até" className="w-36"><input type="date" className="input" value={fim} onChange={(e) => setFim(e.target.value)} /></Field>
        <Field label="Buscar" className="min-w-[10rem] flex-1"><input className="input" value={busca} placeholder="Nome do fornecedor" onChange={(e) => setBusca(e.target.value)} /></Field>
      </div>
      <div className="faixa-chips mb-3">
        {FILTROS.map((x) => (
          <button key={x.id} type="button" aria-pressed={filtro === x.id} onClick={() => setFiltro(x.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${filtro === x.id ? "border-brand bg-brand text-white" : "border-slate-300 bg-surface text-slate-700"}`}>{x.rotulo}</button>
        ))}
      </div>

      {ind.isError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Não consegui ler os indicadores: {(ind.error as Error).message}</p>}
      {!lista.length && <Card className="p-6 text-center text-sm text-slate-500">{ind.isLoading ? "Carregando…" : "Nenhum fornecedor neste filtro."}</Card>}
      <div className="grid gap-3 lg:grid-cols-2">
        {lista.map((f) => {
          const i = porForn.get(f.id);
          const s = situacaoAvaliacao(f.proxima_avaliacao, dia);
          const nAbertas = abertas.get(f.id) ?? 0;
          return (
            <Card key={f.id} className="p-3 sm:p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-semibold text-fg">{nomeDe(f)}</span>
                    <SeloClasse c={f.avaliacao_classe} nota={f.avaliacao_nota} />
                    {f.homologado && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-2xs font-bold text-emerald-800">homologado</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {f.avaliado_em ? `Avaliado em ${dataBR(f.avaliado_em)}` : "Nunca avaliado"}
                    {f.proxima_avaliacao && <> · próxima <b className={s === "vencida" ? "text-red-700" : s === "em_breve" ? "text-amber-700" : ""}>{dataBR(f.proxima_avaliacao)}</b></>}
                  </div>
                </div>
                <button type="button" onClick={() => alternarCritico(f)} disabled={!podeAvaliar} aria-pressed={!!f.critico}
                  title={f.critico ? "Fornecedor crítico (peça que afeta a qualidade das máquinas). Toque para tirar" : "Marcar como crítico (peça que afeta a qualidade ou a certificação das máquinas)"}
                  className={`shrink-0 rounded-lg p-1.5 ${f.critico ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`}>
                  <Star size={18} fill={f.critico ? "currentColor" : "none"} aria-hidden /><span className="sr-only">Crítico</span>
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span><b>{i?.notas ?? 0}</b> {pl(i?.notas ?? 0, "nota", "notas")} · {brl(i?.valor_compras ?? 0)}</span>
                {!!i?.entregues && <span><b>{i.no_prazo}/{i.entregues}</b> OC no prazo{i.atraso_medio ? ` · atraso médio ${i.atraso_medio} d` : ""}</span>}
                {!!(i?.devolucoes || i?.defeitos) && <span className="text-red-700">{i.devolucoes} devolução(ões) · {i.defeitos} defeito(s)</span>}
                {nAbertas > 0 && <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><AlertTriangle size={12} aria-hidden />{nAbertas} não conformidade(s) aberta(s)</span>}
              </div>
              {podeAvaliar && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={() => setAvaliando(f)}><ClipboardCheck size={15} /> Avaliar</Button>
                  <Button type="button" variant="secondary" onClick={() => setProblema(f)}><AlertTriangle size={15} /> Problema</Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {avaliando && <Avaliar f={avaliando} ind={porForn.get(avaliando.id)} inicio={inicio} fim={fim} onClose={() => setAvaliando(null)} />}
      {problema && <Problemas f={problema} ocorrencias={ocorrencias.filter((o) => o.fornecedor_id === problema.id)} onClose={() => setProblema(null)} />}
    </div>
  );
}

function Numero({ rotulo, valor, cor, onClick }: { rotulo: string; valor: number; cor?: string; onClick?: () => void }) {
  const C = onClick ? "button" : "div";
  return (
    <C type={onClick ? "button" : undefined} onClick={onClick} className="rounded-xl border border-slate-200 bg-surface px-3 py-2 text-left">
      <div className={`text-xl font-bold ${cor ?? "text-fg"}`}>{valor}</div>
      <div className="text-xs text-slate-500">{rotulo}</div>
    </C>
  );
}

const CRITERIOS: { k: keyof Notas; rotulo: string; ajuda: string }[] = [
  { k: "prazo", rotulo: "Prazo", ajuda: "Entregou na data combinada?" },
  { k: "qualidade", rotulo: "Qualidade", ajuda: "Peça certa, sem defeito, nota correta?" },
  { k: "preco", rotulo: "Preço", ajuda: "Preço e condição de pagamento comparados com os outros" },
  { k: "atendimento", rotulo: "Atendimento", ajuda: "Responde rápido, resolve problema, avisa atraso?" },
];

function Avaliar({ f, ind, inicio, fim, onClose }: { f: Fornecedor; ind?: Indicador; inicio: string; fim: string; onClose: () => void }) {
  const invalidar = useInvalidate();
  const sug = useMemo(() => notasSugeridas(ind ?? { entregues: 0, no_prazo: 0, atraso_medio: null, devolucoes: 0, defeitos: 0, ocorrencias: [] }), [ind]);
  const [notas, setNotas] = useState<Notas>({ prazo: sug.prazo, qualidade: sug.qualidade, preco: sug.preco, atendimento: sug.atendimento });
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const { data: historico = [] } = useRows<Avaliacao>("fornecedor_avaliacoes", { order: "data", ascending: false, filtro: (q) => q.eq("fornecedor_id", f.id), key: [f.id] });
  const final = notaFinal(notas);
  const c = classe(final);
  const dia = hoje();
  const proxima = proximaAvaliacao(dia, c, !!f.critico);

  async function salvar() {
    setSalvando(true);
    try {
      const { error } = await supabase.rpc("registrar_avaliacao_fornecedor", {
        p_fornecedor: f.id,
        p_avaliacao: {
          data: dia, periodo_inicio: inicio, periodo_fim: fim, nota_prazo: notas.prazo, nota_qualidade: notas.qualidade,
          nota_preco: notas.preco, nota_atendimento: notas.atendimento, nota_final: final, classe: c, proxima_avaliacao: proxima,
          indicadores: ind ?? null, observacoes: obs,
        },
      });
      if (error) throw error;
      invalidar("fornecedores", "fornecedor_avaliacoes");
      notify(`${nomeDe(f)}: ${CLASSES[c].rotulo}. Próxima avaliação em ${dataBR(proxima)}`);
      onClose();
    } catch (e) { notifyError(e); } finally { setSalvando(false); }
  }

  return (
    <Modal open onClose={onClose} title={`Avaliar · ${nomeDe(f)}`}>
      <div className="space-y-4 text-sm">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700"><b>O ERP sugeriu as notas:</b> {sug.base.join("; ")}. Ajuste se precisar.</p>
        {CRITERIOS.map(({ k, rotulo, ajuda }) => (
          <div key={k}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="font-semibold">{rotulo} <span className="text-xs font-normal text-slate-500">· peso {Math.round(PESOS[k] * 100)}%</span></span>
              <input type="number" min={0} max={10} step={0.5} inputMode="decimal" aria-label={`Nota de ${rotulo}`} className="input w-20 text-right"
                value={notas[k]} onChange={(e) => setNotas({ ...notas, [k]: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} />
            </div>
            <input type="range" min={0} max={10} step={0.5} aria-label={rotulo} className="w-full accent-brand" value={notas[k]}
              onChange={(e) => setNotas({ ...notas, [k]: Number(e.target.value) })} />
            <div className="text-xs text-slate-500">{ajuda}</div>
          </div>
        ))}
        <div className={`rounded-xl border px-3 py-2 ${CLASSES[c].cor}`}>
          <div className="text-lg font-black">Nota {final.toLocaleString("pt-BR")} · {CLASSES[c].rotulo}</div>
          <div className="text-xs">{CLASSES[c].texto}. Próxima avaliação: <b>{dataBR(proxima)}</b>{f.critico ? " (crítico: no máximo 6 meses)" : ""}.</div>
        </div>
        <Field label="Observações (o que pedir ao fornecedor, o que melhorou)">
          <textarea className="input" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
        </Field>
        {historico.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Avaliações anteriores</div>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {historico.slice(0, 6).map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs">
                  <span className="w-20">{dataBR(h.data)}</span><SeloClasse c={h.classe} nota={h.nota_final} />
                  <span className="text-slate-500">P {h.nota_prazo} · Q {h.nota_qualidade} · $ {h.nota_preco} · A {h.nota_atendimento}</span>
                  {h.avaliado_nome && <span className="text-slate-400">por {h.avaliado_nome}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={salvando} onClick={salvar}><ShieldCheck size={15} /> {salvando ? "Gravando…" : "Gravar avaliação"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function Problemas({ f, ocorrencias, onClose }: { f: Fornecedor; ocorrencias: Ocorrencia[]; onClose: () => void }) {
  const invalidar = useInvalidate();
  const { nome } = usePerfil();
  const [novo, setNovo] = useState({ data: hoje(), tipo: "qualidade", gravidade: "media", descricao: "", acao: "" });
  const [salvando, setSalvando] = useState(false);

  async function registrar() {
    if (novo.descricao.trim().length < 5) { notify("Descreva o problema (mínimo 5 letras)", "erro"); return; }
    setSalvando(true);
    const { error } = await supabase.from("fornecedor_ocorrencias").insert({
      fornecedor_id: f.id, data: novo.data, tipo: novo.tipo, gravidade: novo.gravidade, descricao: novo.descricao.trim(),
      acao: novo.acao.trim() || null, criado_nome: nome,
    });
    setSalvando(false);
    if (error) { notifyError(error); return; }
    invalidar("fornecedor_ocorrencias", "indicadores_fornecedores");
    notify("Não conformidade registrada: ela entra na próxima avaliação");
    setNovo({ ...novo, descricao: "", acao: "" });
  }
  async function resolver(o: Ocorrencia) {
    const { error } = await supabase.from("fornecedor_ocorrencias").update({ resolvida_em: hoje() }).eq("id", o.id);
    if (error) notifyError(error); else { invalidar("fornecedor_ocorrencias"); notify("Marcada como resolvida"); }
  }

  return (
    <Modal open onClose={onClose} title={`Não conformidades · ${nomeDe(f)}`}>
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="Data"><input type="date" className="input" value={novo.data} onChange={(e) => setNovo({ ...novo, data: e.target.value })} /></Field>
          <Field label="Gravidade" className="sm:col-span-1">
            <select className="input" value={novo.gravidade} onChange={(e) => setNovo({ ...novo, gravidade: e.target.value })}>
              {Object.entries(GRAVIDADES).map(([k, g]) => <option key={k} value={k}>{g.rotulo}</option>)}
            </select>
          </Field>
          <Field label="O que aconteceu" className="col-span-2">
            <select className="input" value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}>
              {Object.entries(TIPOS_OCORRENCIA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </Field>
          <Field label="Descrição (qual peça, qual nota ou OC, o que estava errado)" className="col-span-2 sm:col-span-4">
            <textarea className="input" rows={2} value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
          </Field>
          <Field label="Ação pedida ao fornecedor (troca, crédito, correção)" className="col-span-2 sm:col-span-4">
            <input className="input" value={novo.acao} onChange={(e) => setNovo({ ...novo, acao: e.target.value })} />
          </Field>
        </div>
        <div className="flex justify-end"><Button type="button" disabled={salvando} onClick={registrar}><Plus size={15} /> {salvando ? "Registrando…" : "Registrar problema"}</Button></div>
        {ocorrencias.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {ocorrencias.map((o) => (
              <li key={o.id} className="flex flex-wrap items-start gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-slate-500">{dataBR(o.data)} · {TIPOS_OCORRENCIA[o.tipo] ?? o.tipo} · {GRAVIDADES[o.gravidade]?.rotulo}{o.criado_nome ? ` · ${o.criado_nome}` : ""}</div>
                  <div>{o.descricao}</div>
                  {o.acao && <div className="text-xs text-slate-600">Ação: {o.acao}</div>}
                </div>
                {o.resolvida_em
                  ? <span className="text-xs font-semibold text-emerald-700">resolvida {dataBR(o.resolvida_em)}</span>
                  : <Button type="button" variant="secondary" onClick={() => resolver(o)}>Resolvida</Button>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
