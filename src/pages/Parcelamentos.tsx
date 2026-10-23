// Parcelamentos de impostos (Fiscal → Parcelamentos): o que está parcelado na Receita Federal, na PGFN, nas SEFAZ de SC
// e SP e na prefeitura; em quantas vezes, o que já foi pago, quem pagou (a MF, outra empresa, conta pessoal, o contador)
// com o comprovante, o que vence e o risco de o parcelamento ser cancelado. O financeiro grava; o contador e o
// administrador veem. Avisos automáticos antes do vencimento e no atraso (pg_cron avisar_parcelamentos).
// Nada é apagado: parcela que sobra fica anulada; parcelamento encerrado muda de situação.
import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, CalendarClock, ClipboardCopy, Download, HandCoins, Landmark, MessageSquareText, Pencil, Plus, ShieldAlert, Wallet } from "lucide-react";
import { Button, Card, Field, MaisAcoes, Modal, PageHeader, Stat } from "@/components/ui";
import { ChipsSituacao } from "@/components/filtros/BarraFiltros";
import { Anexos } from "@/components/Anexos";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { numeroBR } from "@/lib/fichaCadastral";
import { usePerfil } from "@/lib/auth";
import { CampoUnidade, useUnidade } from "@/lib/unidade";
import { baixarPlanilha } from "@/lib/exportar";
import {
  COR_PARCELA, LISTA_ORGAOS, LISTA_PAGO_POR, MENSAGEM_CONTADOR, ORGAOS, PAGO_POR, RISCO, ROTULO_PARCELA, SITUACOES_PARCELAMENTO,
  aVencer, diasEntre, gerarParcelas, resumoParcelamento, situacaoParcela, somarDiasIso,
  type Orgao, type PagoPor, type Parcela, type Parcelamento, type RegraVencimento, type Risco, type SituacaoParcelamento,
} from "@/lib/parcelamentos";

type Filtro = "ativos" | "risco" | "encerrados" | "todos";
const GRAVIDADE: Record<Risco, number> = { rescisao: 0, alto: 1, atencao: 2, ok: 3, encerrado: 4 };
const quando = (dia: string, venc: string) => {
  const d = diasEntre(dia, venc);
  return d === 0 ? "hoje" : d === 1 ? "amanhã" : d > 0 ? `em ${d} dias` : `há ${-d} ${pl(-d, "dia", "dias")}`;
};
const texto = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

/** embutido: dentro de Documentos → Parcelamentos (sem o título da tela; os botões ficam numa linha à direita). */
export default function Parcelamentos({ embutido }: { embutido?: boolean } = {}) {
  const { tem } = usePerfil();
  const podeGravar = tem("financeiro");
  const { filtrar, codigo, unidades } = useUnidade();
  const invalidar = useInvalidate();
  const { data: todos = [], isLoading } = useRows<Parcelamento>("parcelamentos", { order: "primeira_parcela", ascending: true });
  const { data: parcelas = [] } = useRows<Parcela>("parcelamento_parcelas", { order: "numero", ascending: true });
  const [filtro, setFiltro] = useState<Filtro>("ativos");
  const [orgao, setOrgao] = useState<Orgao | "">("");
  const [edit, setEdit] = useState<Partial<Parcelamento> | null>(null);
  const [parcela, setParcela] = useState<Parcela | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState(false);
  const dia = hoje();

  const porParc = useMemo(() => {
    const m = new Map<string, Parcela[]>();
    for (const x of parcelas) m.set(x.parcelamento_id, [...(m.get(x.parcelamento_id) ?? []), x]);
    return m;
  }, [parcelas]);
  const resumos = useMemo(() => new Map(todos.map((p) => [p.id, resumoParcelamento(p, porParc.get(p.id) ?? [], dia)])), [todos, porParc, dia]);
  const daUnidade = filtrar(todos);
  const ativos = daUnidade.filter((p) => p.situacao === "ativo");
  const res = (p: Parcelamento) => resumos.get(p.id)!;
  const deParc = (id: string) => todos.find((p) => p.id === id);

  const saldo = ativos.reduce((t, p) => t + res(p).saldo, 0);
  const atrasadas = ativos.flatMap((p) => res(p).atrasadas);
  const valorAtrasado = atrasadas.reduce((t, x) => t + Number(x.valor ?? 0), 0);
  const emRisco = ativos.filter((p) => ["rescisao", "alto"].includes(res(p).risco));
  const terceiros = daUnidade.reduce((t, p) => t + res(p).pagoTerceiros, 0);
  const idsAtivos = new Set(ativos.map((p) => p.id));
  const proximas = aVencer(parcelas.filter((x) => idsAtivos.has(x.parcelamento_id)), somarDiasIso(dia, 60));
  const proxima = proximas.find((x) => x.vencimento >= dia);

  const conta = (f: Filtro) => daUnidade.filter((p) => (f === "ativos" ? p.situacao === "ativo" : f === "risco" ? ["rescisao", "alto", "atencao"].includes(res(p).risco)
    : f === "encerrados" ? p.situacao !== "ativo" : true));
  const lista = conta(filtro).filter((p) => !orgao || p.orgao === orgao)
    .sort((a, b) => GRAVIDADE[res(a).risco] - GRAVIDADE[res(b).risco] || (res(a).proxima?.vencimento ?? "9").localeCompare(res(b).proxima?.vencimento ?? "9"));

  async function gravarParcela(linha: Record<string, unknown>) {
    const { id, ...resto } = linha;
    const { error } = await supabase.from("parcelamento_parcelas").update({ ...resto, atualizado_em: new Date().toISOString() }).eq("id", id as string);
    if (error) { notifyError(error); return false; }
    notify(resto.situacao === "pago" ? "Pagamento registrado" : "Parcela salva");
    invalidar("parcelamento_parcelas");
    return true;
  }

  function exportar() {
    const nome = (p: Parcelamento) => [ORGAOS[p.orgao].curto, p.modalidade, p.numero && `nº ${p.numero}`].filter(Boolean).join(" · ");
    baixarPlanilha("parcelamentos", [
      { nome: "Parcelamentos", linhas: daUnidade.map((p) => { const r = res(p); return {
        Órgão: ORGAOS[p.orgao].nome, Unidade: codigo(p.unidade_id), Modalidade: p.modalidade ?? "", Número: p.numero ?? "", Adesão: p.data_adesao ?? "",
        "Valor consolidado": p.valor_consolidado ?? "", Parcelas: p.qtd_parcelas, Pagas: r.pagas, Atrasadas: r.atrasadas.length, "Saldo em aberto": r.saldo,
        "Pago por terceiros": r.pagoTerceiros, Situação: SITUACOES_PARCELAMENTO[p.situacao], Risco: RISCO[r.risco].nome,
      }; }) },
      { nome: "Parcelas", linhas: parcelas.filter((x) => daUnidade.some((p) => p.id === x.parcelamento_id)).map((x) => ({
        Parcelamento: nome(deParc(x.parcelamento_id)!), Parcela: x.numero, Vencimento: x.vencimento, Valor: x.valor ?? "", Situação: ROTULO_PARCELA[situacaoParcela(x, dia)],
        "Pago em": x.pago_em ?? "", "Valor pago": x.valor_pago ?? "", "Pago por": x.pago_por ? PAGO_POR[x.pago_por].nome : "", Quem: x.pago_por_nome ?? "", Observação: x.observacao ?? "",
      })) },
    ]);
  }

  const novo = () => setEdit({ orgao: "receita_federal", situacao: "ativo" });

  const acoes = (<>
    <MaisAcoes>
      <Button variant="secondary" onClick={() => setMensagem(true)}><MessageSquareText size={16} /> Pedir a lista ao contador</Button>
      <Button variant="secondary" onClick={exportar} disabled={!daUnidade.length}><Download size={16} /> Exportar (Excel)</Button>
    </MaisAcoes>
    {podeGravar && <Button onClick={novo}><Plus size={16} /> Novo parcelamento</Button>}
  </>);
  return (
    <div>
      {embutido ? <div className="mb-3 flex flex-wrap items-center justify-end gap-2">{acoes}</div> : (
        <PageHeader title="Parcelamentos de impostos" subtitle="Receita, PGFN, SEFAZ e prefeitura: o que vence, o que atrasou e quem pagou" actions={acoes} />
      )}

      {emRisco.some((p) => res(p).risco === "rescisao") && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl bg-solido-vermelho p-4 text-white shadow-card" role="alert">
          <ShieldAlert size={22} className="mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0 text-sm">
            <b className="block text-base">Risco de cancelar o parcelamento</b>
            {emRisco.filter((p) => res(p).risco === "rescisao").map((p) => `${ORGAOS[p.orgao].curto} · ${p.modalidade ?? "parcelamento"}${p.numero ? ` nº ${p.numero}` : ""}`).join("; ")}:
            {" "}já tem parcelas sem pagar no limite em que o órgão pode cancelar. Pagar as atrasadas e falar com o contador hoje.
          </div>
        </div>
      )}

      {!isLoading && !todos.length ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#1d4ed8] text-white"><Landmark size={28} aria-hidden /></span>
          <h2 className="text-lg font-bold text-fg">Nenhum parcelamento cadastrado ainda</h2>
          <p className="max-w-xl text-sm text-slate-600">
            Peça ao contador a lista de todos os parcelamentos (ativos e antigos) com o PDF do recibo de adesão e o extrato de cada um.
            Com isso cadastrado, o ERP mostra o que vence, avisa o financeiro 7 e 2 dias antes, no dia e no atraso, e guarda quem pagou cada parcela.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => setMensagem(true)}><MessageSquareText size={16} /> Mensagem para o contador</Button>
            {podeGravar && <Button onClick={novo}><Plus size={16} /> Cadastrar o primeiro</Button>}
          </div>
        </Card>
      ) : <>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Saldo em aberto" valor={brl(saldo)} icon={Wallet} tom="info" sub={`${ativos.length} ${pl(ativos.length, "parcelamento ativo", "parcelamentos ativos")} · valor das parcelas, sem Selic`} />
          <Stat label="Próximo vencimento" valor={proxima ? dataBR(proxima.vencimento) : "—"} icon={CalendarClock} tom={proxima && diasEntre(dia, proxima.vencimento) <= 7 ? "atencao" : "neutro"}
            sub={proxima ? `${brl(proxima.valor)} · ${ORGAOS[deParc(proxima.parcelamento_id)!.orgao].curto} · ${quando(dia, proxima.vencimento)}` : "nada a vencer"}
            onClick={proxima ? () => setParcela(proxima) : undefined} />
          <Stat label="Parcelas atrasadas" valor={String(atrasadas.length)} icon={AlertTriangle} tom={atrasadas.length ? "critico" : "bom"}
            sub={atrasadas.length ? `${brl(valorAtrasado)} · ${emRisco.length} ${pl(emRisco.length, "parcelamento", "parcelamentos")} em risco` : "nenhuma"}
            onClick={atrasadas.length ? () => setFiltro("risco") : undefined} />
          <Stat label="Pago por fora da MF" valor={brl(terceiros)} icon={HandCoins} tom={terceiros ? "atencao" : "neutro"}
            sub={terceiros ? "outra empresa, conta pessoal ou contador: combinar com o contador como lançar" : "todas pagas pela conta da MF"} />
        </div>

        {proximas.length > 0 && (
          <Card className="mb-4 p-4">
            <h2 className="mb-2 flex items-center gap-2 font-bold text-fg"><CalendarClock size={18} aria-hidden /> Para pagar <span className="text-sm font-normal text-slate-500">· atrasadas e próximos 60 dias</span></h2>
            <ul className="divide-y divide-slate-100">
              {proximas.slice(0, 12).map((x) => {
                const p = deParc(x.parcelamento_id)!;
                const s = situacaoParcela(x, dia);
                return (
                  <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <span className="w-20 shrink-0 text-xs font-semibold text-slate-500">{dataBR(x.vencimento)}</span>
                    <span className="shrink-0 rounded-md px-2 py-0.5 text-xs font-bold text-white" style={{ background: ORGAOS[p.orgao].cor }}>{ORGAOS[p.orgao].curto}{unidades.length > 1 && p.unidade_id && !ORGAOS[p.orgao].curto.endsWith(codigo(p.unidade_id)) ? ` · ${codigo(p.unidade_id)}` : ""}</span>
                    <span className="min-w-0 flex-1 basis-40 truncate text-fg">{p.modalidade ?? "Parcelamento"} · parcela {x.numero}/{p.qtd_parcelas}</span>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: COR_PARCELA[s] }}>{s === "atrasada" ? `atrasada ${quando(dia, x.vencimento)}` : quando(dia, x.vencimento)}</span>
                    <span className="num w-28 shrink-0 text-right font-bold text-fg">{x.valor != null ? brl(x.valor) : "—"}</span>
                    <Button variant="secondary" onClick={() => setParcela(x)}>{podeGravar ? "Registrar pagamento" : "Ver"}</Button>
                  </li>
                );
              })}
            </ul>
            {proximas.length > 12 && <p className="mt-1 text-xs text-slate-500">e mais {proximas.length - 12} nos cartões abaixo.</p>}
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <ChipsSituacao<Filtro> rotulo="Quais parcelamentos" valor={filtro} onChange={setFiltro}
            opcoes={([["ativos", "Ativos"], ["risco", "Atrasados ou vencendo"], ["encerrados", "Quitados e encerrados"], ["todos", "Todos"]] as const).map(([value, label]) => ({ value, label, n: conta(value).length }))}
            cores={{ ativos: { ponto: "bg-solido-azul", ativo: "bg-solido-azul" }, risco: { ponto: "bg-solido-vermelho", ativo: "bg-solido-vermelho" }, encerrados: { ponto: "bg-solido-cinza", ativo: "bg-solido-cinza" } }} />
          <select className="input mb-3 w-auto max-w-[14rem] py-1 text-xs" value={orgao} onChange={(e) => setOrgao(e.target.value as Orgao | "")} aria-label="Órgão">
            <option value="">Todos os órgãos</option>
            {LISTA_ORGAOS.filter((o) => daUnidade.some((p) => p.orgao === o)).map((o) => <option key={o} value={o}>{ORGAOS[o].nome}</option>)}
          </select>
        </div>

        {!lista.length ? <Card className="p-6 text-center text-sm text-slate-500">Nenhum parcelamento neste filtro.</Card> : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {lista.map((p) => (
              <CartaoParcelamento key={p.id} p={p} parcelas={(porParc.get(p.id) ?? []).slice().sort((a, b) => a.numero - b.numero)} dia={dia}
                unidade={unidades.length > 1 ? codigo(p.unidade_id) : ""} aberto={aberto === p.id} onAbrir={() => setAberto(aberto === p.id ? null : p.id)}
                onParcela={setParcela} onEditar={podeGravar ? () => setEdit(p) : undefined} podeGravar={podeGravar} />
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-slate-500">
          Avisos automáticos para o financeiro: 7 e 2 dias antes, no dia, 1 dia depois e a cada semana de atraso (urgente quando há risco de cancelar).
          As guias saem no e-CAC, no Regularize e na SEFAZ — quem gera é o contador. Regras de cancelamento: conferir com o contador.
        </p>
      </>}

      {edit && <ParcelamentoModal inicial={edit} existentes={edit.id ? porParc.get(edit.id) ?? [] : []} onClose={() => setEdit(null)}
        onSalvo={() => { invalidar("parcelamentos", "parcelamento_parcelas"); setEdit(null); }} />}
      {parcela && deParc(parcela.parcelamento_id) && <ParcelaModal parcela={parcela} p={deParc(parcela.parcelamento_id)!} podeGravar={podeGravar} dia={dia}
        onClose={() => setParcela(null)} onGravar={async (l) => (await gravarParcela(l)) && setParcela(null)} />}
      {mensagem && <MensagemContador onClose={() => setMensagem(false)} />}
    </div>
  );
}

function CartaoParcelamento({ p, parcelas, dia, unidade, aberto, onAbrir, onParcela, onEditar, podeGravar }: {
  p: Parcelamento; parcelas: Parcela[]; dia: string; unidade: string; aberto: boolean; onAbrir: () => void;
  onParcela: (x: Parcela) => void; onEditar?: () => void; podeGravar: boolean;
}) {
  const o = ORGAOS[p.orgao];
  const r = resumoParcelamento(p, parcelas, dia);
  const rk = RISCO[r.risco];
  const pct = r.total ? Math.round((r.pagas / r.total) * 100) : 0;
  const valorParcela = p.valor_parcela ?? r.proxima?.valor ?? null;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 p-4 text-white" style={{ background: `linear-gradient(135deg, ${o.cor}, #0f172a)` }}>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-85">{o.nome}{unidade && ` · ${unidade}`}</div>
          <div className="truncate text-lg font-bold">{p.modalidade || "Parcelamento"}</div>
          <div className="text-xs opacity-85">{[p.numero && `nº ${p.numero}`, p.data_adesao && `adesão em ${dataBR(p.data_adesao)}`, `${p.qtd_parcelas} parcelas`, p.situacao !== "ativo" && SITUACOES_PARCELAMENTO[p.situacao]].filter(Boolean).join(" · ")}</div>
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-white shadow-card ring-1 ring-white/40" style={{ background: rk.cor }} title={rk.texto}>{rk.nome}</span>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <div className="mb-1 flex justify-between gap-2 text-xs font-semibold text-slate-600"><span>{r.pagas} de {r.total} pagas</span><span className="num">{pct}%</span></div>
          <div className="h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-solido-verde" style={{ width: `${pct}%` }} /></div>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-slate-500">Saldo em aberto</dt><dd className="num font-bold text-fg">{brl(r.saldo)}</dd></div>
          <div><dt className="text-xs text-slate-500">Parcela</dt><dd className="num font-bold text-fg">{valorParcela != null ? brl(valorParcela) : "—"}{p.corrige_selic && <span className="block text-2xs font-normal text-slate-500">+ Selic</span>}</dd></div>
          <div><dt className="text-xs text-slate-500">Próxima</dt><dd className="font-bold text-fg">{r.proxima ? dataBR(r.proxima.vencimento) : "—"}{r.proxima && <span className="block text-2xs font-normal text-slate-500">{quando(dia, r.proxima.vencimento)}</span>}</dd></div>
          <div><dt className="text-xs text-slate-500">Termina em</dt><dd className="font-bold text-fg">{r.fim ? dataBR(r.fim) : "—"}<span className="block text-2xs font-normal text-slate-500">faltam {r.abertas}</span></dd></div>
        </dl>
        {r.atrasadas.length > 0 && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
            {r.atrasadas.length} {pl(r.atrasadas.length, "parcela atrasada", "parcelas atrasadas")} ({brl(r.valorAtrasado)}) · cancela com {p.max_atrasos}{p.rescinde_ultima ? " ou com a última sem pagar" : ""}
          </p>
        )}
        {r.pagoTerceiros > 0 && <p className="rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-900">{brl(r.pagoTerceiros)} pagos por outra empresa, conta pessoal ou contador: mandar os comprovantes ao contador para lançar (mútuo, adiantamento ou aporte).</p>}

        {/* uma casinha por parcela, na cor da situação */}
        <div>
          <div className="flex flex-wrap gap-1" role="list" aria-label="Parcelas">
            {parcelas.map((x) => {
              const s = situacaoParcela(x, dia);
              return (
                <button key={x.id} type="button" role="listitem" onClick={() => onParcela(x)}
                  title={`Parcela ${x.numero} · ${dataBR(x.vencimento)} · ${ROTULO_PARCELA[s]}${x.pago_por ? ` · ${PAGO_POR[x.pago_por].nome}` : ""}`}
                  aria-label={`Parcela ${x.numero}, ${dataBR(x.vencimento)}, ${ROTULO_PARCELA[s]}`}
                  className={`num grid h-7 min-w-7 place-items-center rounded-md px-1 text-2xs font-bold text-white hover:opacity-80 ${s === "anulada" ? "line-through opacity-60" : ""}`}
                  style={{ background: x.situacao === "pago" && x.pago_por && PAGO_POR[x.pago_por].terceiro ? PAGO_POR[x.pago_por].cor : COR_PARCELA[s] }}>{x.numero}</button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-slate-500">
            {(["paga", "atrasada", "vence_logo", "a_vencer"] as const).map((s) => <span key={s} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_PARCELA[s] }} aria-hidden />{ROTULO_PARCELA[s]}</span>)}
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: PAGO_POR.outra_empresa.cor }} aria-hidden />Paga por outra empresa</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: PAGO_POR.pessoal.cor }} aria-hidden />Paga por conta pessoal</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onAbrir} aria-expanded={aberto}>{aberto ? "Fechar a lista" : "Ver as parcelas"}</Button>
          {onEditar && <Button variant="secondary" onClick={onEditar}><Pencil size={15} /> Editar</Button>}
        </div>
        {aberto && (
          <div className="max-h-[28rem] overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2">Nº</th><th className="px-3 py-2">Vencimento</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2">Pagamento</th><th className="px-3 py-2" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {parcelas.map((x) => {
                  const s = situacaoParcela(x, dia);
                  return (
                    <tr key={x.id} className={s === "anulada" ? "opacity-50" : ""}>
                      <td className="num px-3 py-2 font-semibold">{x.numero}</td>
                      <td className="whitespace-nowrap px-3 py-2">{dataBR(x.vencimento)}</td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right">{x.valor != null ? brl(x.valor) : "—"}</td>
                      <td className="px-3 py-2"><span className="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: COR_PARCELA[s] }}>{ROTULO_PARCELA[s]}</span></td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {x.situacao === "pago" && <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span className="whitespace-nowrap">{dataBR(x.pago_em)}</span><span className="num whitespace-nowrap">{brl(x.valor_pago ?? x.valor)}</span>
                          {x.pago_por && <span className="whitespace-nowrap rounded px-1.5 text-2xs font-semibold text-white" style={{ background: PAGO_POR[x.pago_por].cor }} title={x.pago_por_nome ?? PAGO_POR[x.pago_por].nome}>{PAGO_POR[x.pago_por].curto}</span>}
                        </span>}
                      </td>
                      <td className="px-3 py-2 text-right"><button type="button" className="link-acao whitespace-nowrap text-xs" onClick={() => onParcela(x)}>{podeGravar && x.situacao === "a_pagar" ? "Pagar" : "Abrir"}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-500">{o.nota}</p>
        {p.observacoes && <p className="whitespace-pre-line text-xs text-slate-600"><b>Observações:</b> {p.observacoes}</p>}
      </div>
    </Card>
  );
}

function ParcelaModal({ parcela, p, podeGravar, dia, onClose, onGravar }: {
  parcela: Parcela; p: Parcelamento; podeGravar: boolean; dia: string; onClose: () => void; onGravar: (l: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({
    vencimento: parcela.vencimento, valor_txt: texto(parcela.valor), pago: parcela.situacao === "pago", anulada: parcela.situacao === "anulada",
    pago_em: parcela.pago_em ?? dia, valor_pago_txt: texto(parcela.valor_pago ?? parcela.valor), pago_por: (parcela.pago_por ?? "mf") as PagoPor,
    pago_por_nome: parcela.pago_por_nome ?? "", observacao: parcela.observacao ?? "",
  });
  const set = (k: keyof typeof f, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const so = !podeGravar;
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const pago = f.pago && !f.anulada;
    onGravar({
      id: parcela.id, vencimento: f.vencimento, valor: numeroBR(f.valor_txt), situacao: f.anulada ? "anulada" : pago ? "pago" : "a_pagar",
      pago_em: pago ? f.pago_em : null, valor_pago: pago ? numeroBR(f.valor_pago_txt) : null, pago_por: pago ? f.pago_por : null,
      pago_por_nome: pago && f.pago_por !== "mf" ? f.pago_por_nome.trim() || null : null, observacao: f.observacao.trim() || null,
    });
  };
  const s = situacaoParcela(parcela, dia);
  return (
    <Modal open onClose={onClose} title={`${ORGAOS[p.orgao].curto} · ${p.modalidade ?? "Parcelamento"} · parcela ${parcela.numero}/${p.qtd_parcelas}`}>
      <form onSubmit={enviar} className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: COR_PARCELA[s] }}>{ROTULO_PARCELA[s]}</span>
          {p.numero && <span className="text-slate-600">nº {p.numero}</span>}
          {s === "atrasada" && <span className="font-semibold text-red-700">venceu {quando(dia, parcela.vencimento)}</span>}
        </div>
        <fieldset disabled={so} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Vencimento"><input className="input" type="date" value={f.vencimento} onChange={(e) => set("vencimento", e.target.value)} required /></Field>
          <Field label="Valor da parcela (R$)"><input className="input" inputMode="decimal" value={f.valor_txt} onChange={(e) => set("valor_txt", e.target.value)} placeholder="0,00" /></Field>
        </fieldset>
        {p.corrige_selic && <p className="-mt-2 text-xs text-slate-500">Na Receita e na PGFN a parcela é corrigida pela Selic: a guia do mês costuma vir maior. No pagamento, lance o valor da guia.</p>}

        <div className={`rounded-xl border p-3 ${f.pago ? "border-emerald-300 bg-emerald-50" : "border-slate-200"}`}>
          <label className="flex items-center gap-2 text-sm font-semibold text-fg">
            <input type="checkbox" checked={f.pago} disabled={so || f.anulada} onChange={(e) => set("pago", e.target.checked)} /> Parcela paga
          </label>
          {f.pago && (
            <fieldset disabled={so} className="mt-3 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Pago em"><input className="input" type="date" value={f.pago_em} onChange={(e) => set("pago_em", e.target.value)} required /></Field>
                <Field label="Valor pago (R$, o da guia)"><input className="input" inputMode="decimal" value={f.valor_pago_txt} onChange={(e) => set("valor_pago_txt", e.target.value)} placeholder="0,00" /></Field>
              </div>
              <Field label="Quem pagou">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quem pagou">
                  {LISTA_PAGO_POR.map((k) => (
                    <button key={k} type="button" aria-pressed={f.pago_por === k} onClick={() => set("pago_por", k)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${f.pago_por === k ? "text-white shadow-card" : "bg-slate-100 text-slate-600"}`}
                      style={f.pago_por === k ? { background: PAGO_POR[k].cor } : undefined}>{PAGO_POR[k].nome}</button>
                  ))}
                </div>
              </Field>
              {f.pago_por !== "mf" && <>
                <Field label={f.pago_por === "outra_empresa" ? "Qual empresa" : f.pago_por === "pessoal" ? "De quem (sem CPF)" : "Quem"}>
                  <input className="input" value={f.pago_por_nome} onChange={(e) => set("pago_por_nome", e.target.value)} maxLength={120} placeholder={f.pago_por === "outra_empresa" ? "Ex.: o nome curto da empresa" : "Ex.: sócio, contador"} />
                </Field>
                {PAGO_POR[f.pago_por].terceiro && <p className="rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-900">Imposto da MF pago por outra empresa ou por conta pessoal: anexe o comprovante abaixo e mande ao contador. Ele define como lançar (empréstimo/mútuo, adiantamento ou aporte) — confirmar com o contador.</p>}
              </>}
            </fieldset>
          )}
        </div>

        <fieldset disabled={so} className="space-y-3">
          <Field label="Observação"><input className="input" value={f.observacao} onChange={(e) => set("observacao", e.target.value)} maxLength={500} placeholder="Ex.: guia reemitida, pago com juros" /></Field>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={f.anulada} onChange={(e) => set("anulada", e.target.checked)} /> Parcela não existe mais (anulada: fica no histórico, fora das contas)</label>
        </fieldset>

        {podeGravar ? <Anexos entidade="conta_pagar" id={parcela.id} titulo="Comprovante e guia (DARF, DAE, DARE)" />
          : <p className="text-xs text-slate-500">O comprovante fica com o financeiro; aqui aparecem a data, o valor e quem pagou.</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>{so ? "Fechar" : "Cancelar"}</Button>
          {!so && <Button type="submit">Salvar</Button>}
        </div>
      </form>
    </Modal>
  );
}

function ParcelamentoModal({ inicial, existentes, onClose, onSalvo }: {
  inicial: Partial<Parcelamento>; existentes: Parcela[]; onClose: () => void; onSalvo: () => void;
}) {
  const { padrao, unidades } = useUnidade();
  const novo = !inicial.id;
  const unidadeDoOrgao = (o: Orgao) => (o === "sefaz_sc" || o === "sefaz_sp" ? unidades.find((u) => u.uf === (o === "sefaz_sc" ? "SC" : "SP"))?.id : undefined);
  const padraoDo = (o: Orgao) => ORGAOS[o];
  const [f, setF] = useState(() => {
    const o = (inicial.orgao ?? "receita_federal") as Orgao;
    return {
      orgao: o, modalidade: inicial.modalidade ?? "", numero: inicial.numero ?? "", descricao: inicial.descricao ?? "", data_adesao: inicial.data_adesao ?? "",
      unidade_id: inicial.unidade_id ?? padrao ?? "", consolidado_txt: texto(inicial.valor_consolidado), qtd: String(inicial.qtd_parcelas ?? 60),
      parcela_txt: texto(inicial.valor_parcela), primeira_parcela: inicial.primeira_parcela ?? hoje(),
      vencimento_regra: (inicial.vencimento_regra ?? padraoDo(o).regra) as RegraVencimento, dia_vencimento: String(inicial.dia_vencimento ?? ""),
      corrige_selic: inicial.corrige_selic ?? padraoDo(o).corrige_selic, max_atrasos: String(inicial.max_atrasos ?? padraoDo(o).max_atrasos),
      rescinde_ultima: inicial.rescinde_ultima ?? padraoDo(o).rescinde_ultima, situacao: (inicial.situacao ?? "ativo") as SituacaoParcelamento,
      observacoes: inicial.observacoes ?? "", ja_pagas: "0", ja_pagas_por: "outro" as PagoPor, recalcular: false,
    };
  });
  const [gravando, setGravando] = useState(false);
  const set = (k: keyof typeof f, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const trocarOrgao = (o: Orgao) => setF((x) => ({
    ...x, orgao: o, unidade_id: (novo && unidadeDoOrgao(o)) || x.unidade_id, ...(novo ? { vencimento_regra: padraoDo(o).regra, corrige_selic: padraoDo(o).corrige_selic, max_atrasos: String(padraoDo(o).max_atrasos), rescinde_ultima: padraoDo(o).rescinde_ultima } : {}),
  }));

  const qtd = Math.min(240, Math.max(1, Math.round(Number(f.qtd) || 1)));
  const linha = {
    orgao: f.orgao, modalidade: f.modalidade.trim() || null, numero: f.numero.trim() || null, descricao: f.descricao.trim() || null,
    data_adesao: f.data_adesao || null, unidade_id: f.unidade_id || null, valor_consolidado: numeroBR(f.consolidado_txt), qtd_parcelas: qtd,
    valor_parcela: numeroBR(f.parcela_txt), primeira_parcela: f.primeira_parcela, vencimento_regra: f.vencimento_regra,
    dia_vencimento: f.vencimento_regra === "dia" ? Math.min(31, Math.max(1, Number(f.dia_vencimento) || Number(f.primeira_parcela.slice(8, 10)))) : null,
    corrige_selic: f.corrige_selic, max_atrasos: Math.min(12, Math.max(1, Number(f.max_atrasos) || 3)), rescinde_ultima: f.rescinde_ultima,
    situacao: f.situacao, observacoes: f.observacoes.trim() || null,
  };
  const previa = f.primeira_parcela ? gerarParcelas(linha) : [];
  const pagasAntes = novo ? Math.min(qtd, Math.max(0, Math.round(Number(f.ja_pagas) || 0))) : 0;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setGravando(true);
    try {
      let id = inicial.id;
      if (id) {
        const { error } = await supabase.from("parcelamentos").update({ ...linha, atualizado_em: new Date().toISOString() }).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("parcelamentos").insert(linha).select("id").single();
        if (error) throw error;
        id = (data as { id: string }).id;
      }
      const tem = new Map(existentes.map((x) => [x.numero, x]));
      const novas = previa.filter((a) => !tem.has(a.numero)).map((a) => {
        const paga = a.numero <= pagasAntes;
        return {
          parcelamento_id: id, numero: a.numero, vencimento: a.vencimento, valor: a.valor, situacao: paga ? "pago" : "a_pagar",
          pago_em: paga ? a.vencimento : null, valor_pago: paga ? a.valor : null, pago_por: paga ? f.ja_pagas_por : null, pago_por_nome: null,
          observacao: paga ? "Paga antes do cadastro no ERP (conferir no extrato do órgão)" : null,
        };
      });
      if (novas.length) {
        const { error } = await supabase.from("parcelamento_parcelas").upsert(novas, { onConflict: "parcelamento_id,numero", ignoreDuplicates: true });
        if (error) throw error;
      }
      const agora = new Date().toISOString();
      if (!novo && f.recalcular) {
        // só as que não foram pagas: datas e valores pela regra nova (e as anuladas que voltaram para dentro do número de parcelas)
        for (const a of previa) {
          const x = tem.get(a.numero);
          if (!x || x.situacao === "pago") continue;
          if (x.situacao === "anulada" || x.vencimento !== a.vencimento || Number(x.valor ?? -1) !== Number(a.valor ?? -1)) {
            const { error } = await supabase.from("parcelamento_parcelas").update({ vencimento: a.vencimento, valor: a.valor, situacao: "a_pagar", atualizado_em: agora }).eq("id", x.id);
            if (error) throw error;
          }
        }
      }
      const sobras = existentes.filter((x) => x.numero > qtd && x.situacao === "a_pagar").map((x) => x.id);
      if (sobras.length) {
        const { error } = await supabase.from("parcelamento_parcelas").update({ situacao: "anulada", atualizado_em: agora }).in("id", sobras);
        if (error) throw error;
      }
      notify(novo ? `Parcelamento cadastrado com ${qtd} ${pl(qtd, "parcela", "parcelas")}` : `Parcelamento salvo${sobras.length ? ` · ${sobras.length} ${pl(sobras.length, "parcela anulada", "parcelas anuladas")}` : ""}`);
      onSalvo();
    } catch (err) { notifyError(err); } finally { setGravando(false); }
  }

  const o = ORGAOS[f.orgao];
  return (
    <Modal open onClose={onClose} title={novo ? "Novo parcelamento de imposto" : "Editar parcelamento"} wide>
      <form onSubmit={salvar} className="space-y-4">
        <Field label="Órgão">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Órgão">
            {LISTA_ORGAOS.map((k) => (
              <button key={k} type="button" aria-pressed={f.orgao === k} onClick={() => trocarOrgao(k)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${f.orgao === k ? "text-white shadow-card" : "bg-slate-100 text-slate-600"}`}
                style={f.orgao === k ? { background: ORGAOS[k].cor } : undefined}>{ORGAOS[k].nome}</button>
            ))}
          </div>
        </Field>
        <p className="-mt-2 text-xs text-slate-500">{o.nota}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Modalidade">
            <input className="input" list="modalidades-parc" value={f.modalidade} onChange={(e) => set("modalidade", e.target.value)} maxLength={120} placeholder={o.modalidades[0]} />
            <datalist id="modalidades-parc">{o.modalidades.map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
          <Field label="Número do parcelamento"><input className="input" value={f.numero} onChange={(e) => set("numero", e.target.value)} maxLength={60} placeholder="o do recibo de adesão" /></Field>
          <CampoUnidade value={f.unidade_id} onChange={(v) => set("unidade_id", v)} label="Unidade (CNPJ)" />
          <Field label="Data da adesão"><input className="input" type="date" value={f.data_adesao} onChange={(e) => set("data_adesao", e.target.value)} /></Field>
          <Field label="Valor consolidado (R$)"><input className="input" inputMode="decimal" value={f.consolidado_txt} onChange={(e) => set("consolidado_txt", e.target.value)} placeholder="total parcelado" /></Field>
          <Field label="Quantidade de parcelas"><input className="input" type="number" min={1} max={240} value={f.qtd} onChange={(e) => set("qtd", e.target.value)} required /></Field>
          <Field label="Valor de cada parcela (R$)"><input className="input" inputMode="decimal" value={f.parcela_txt} onChange={(e) => set("parcela_txt", e.target.value)} placeholder="vazio: consolidado ÷ parcelas" /></Field>
          <Field label="1ª parcela vence em"><input className="input" type="date" value={f.primeira_parcela} onChange={(e) => set("primeira_parcela", e.target.value)} required /></Field>
          <Field label="As outras vencem">
            <select className="input" value={f.vencimento_regra} onChange={(e) => set("vencimento_regra", e.target.value as RegraVencimento)}>
              <option value="ultimo_dia_util">No último dia útil do mês</option>
              <option value="dia">Num dia fixo do mês</option>
            </select>
          </Field>
          {f.vencimento_regra === "dia" && <Field label="Dia do vencimento"><input className="input" type="number" min={1} max={31} value={f.dia_vencimento} onChange={(e) => set("dia_vencimento", e.target.value)} placeholder={f.primeira_parcela.slice(8, 10)} /></Field>}
          <Field label="Cancela com quantas atrasadas"><input className="input" type="number" min={1} max={12} value={f.max_atrasos} onChange={(e) => set("max_atrasos", e.target.value)} /></Field>
          {!novo && (
            <Field label="Situação">
              <select className="input" value={f.situacao} onChange={(e) => set("situacao", e.target.value as SituacaoParcelamento)}>
                {Object.entries(SITUACOES_PARCELAMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          )}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.corrige_selic} onChange={(e) => set("corrige_selic", e.target.checked)} /> Parcela corrigida pela Selic</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.rescinde_ultima} onChange={(e) => set("rescinde_ultima", e.target.checked)} /> Cancela também com 1 sem pagar e as outras pagas</label>
        </div>
        {novo && (
          <div className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
            <Field label="Parcelas já pagas antes de cadastrar"><input className="input" type="number" min={0} max={qtd} value={f.ja_pagas} onChange={(e) => set("ja_pagas", e.target.value)} /></Field>
            <Field label="Quem pagou essas">
              <select className="input" value={f.ja_pagas_por} onChange={(e) => set("ja_pagas_por", e.target.value as PagoPor)}>
                {LISTA_PAGO_POR.map((k) => <option key={k} value={k}>{PAGO_POR[k].nome}</option>)}
              </select>
            </Field>
            <p className="text-xs text-slate-500 sm:col-span-2">As primeiras {pagasAntes || "N"} entram como pagas na data do vencimento, para conferir no extrato do órgão (e-CAC, Regularize, SEFAZ). Dá para corrigir uma a uma depois.</p>
          </div>
        )}
        {!novo && (
          <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <input type="checkbox" className="mt-1" checked={f.recalcular} onChange={(e) => set("recalcular", e.target.checked)} />
            <span>Recalcular as datas e os valores das parcelas em aberto pela regra acima (as pagas não mudam). Diminuir a quantidade anula as parcelas em aberto que sobrarem.</span>
          </label>
        )}
        <Field label="Observações"><textarea className="input min-h-[4rem]" value={f.observacoes} onChange={(e) => set("observacoes", e.target.value)} maxLength={2000} placeholder="Débitos incluídos, períodos, o que o contador disse…" /></Field>

        {previa.length > 0 && (
          <div className="rounded-xl border border-slate-200 p-3 text-sm">
            <b className="text-fg">{previa.length} {pl(previa.length, "parcela", "parcelas")}</b>
            <span className="text-slate-600"> · 1ª {dataBR(previa[0].vencimento)}{previa[1] ? ` · 2ª ${dataBR(previa[1].vencimento)}` : ""}{previa.length > 2 ? ` · … · última ${dataBR(previa[previa.length - 1].vencimento)}` : ""}
              {previa[0].valor != null ? ` · ${brl(previa[0].valor)} cada` : " · sem valor (informe o consolidado ou o da parcela)"}</span>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={gravando}>{gravando ? "Salvando…" : "Salvar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function MensagemContador({ onClose }: { onClose: () => void }) {
  const copiar = async () => {
    try { await navigator.clipboard.writeText(MENSAGEM_CONTADOR); notify("Mensagem copiada: cole no WhatsApp ou no e-mail do contador"); }
    catch { notify("Não deu para copiar sozinho: selecione o texto e copie"); }
  };
  return (
    <Modal open onClose={onClose} title="Pedir a lista de parcelamentos ao contador">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">O contador tem acesso ao e-CAC, ao Regularize e às SEFAZ. Peça a lista e os PDFs; não é preciso passar senha nem certificado para ninguém.</p>
        <textarea className="input min-h-[14rem] w-full text-sm" readOnly value={MENSAGEM_CONTADOR} onFocus={(e) => e.currentTarget.select()} aria-label="Mensagem" />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
          <Button onClick={copiar}><ClipboardCopy size={16} /> Copiar a mensagem</Button>
        </div>
      </div>
    </Modal>
  );
}
