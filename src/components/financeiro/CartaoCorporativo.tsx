// Cartão corporativo de uma pessoa no Início (ex.: "Cartão Fabiano"): quanto gastou hoje, na semana e no mês, em quê
// (alimentação, combustível, mercado, material…), e o que ainda falta pedir nota com o CNPJ da empresa — para tudo entrar
// como despesa da empresa no Lucro Real. A compra que casou com uma NF-e recebida aparece com a nota.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Ban, Check, ChevronDown, ChevronRight, ClipboardCopy, CreditCard, FileCheck2, Hourglass, Info, Link2, Receipt, User, X,
} from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { Anexos } from "@/components/Anexos";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { useRows } from "@/lib/data";
import { brl, dataBR, docFormat, hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import {
  CATEGORIAS, CATEGORIAS_ESCOLHA, PERIODOS_CARTAO, SITUACOES, casarNotas, categoriaDe, estadoNota, intervaloCartao, lojaDoGasto, noPeriodo,
  resumoCartao, type CategoriaCartao, type EstadoNota, type GastoCartao, type NotaCartao, type Periodo, type SituacaoNota,
} from "@/lib/cartaoCorporativo";

export type Cartao = {
  id: string; nome: string; cartao_nome: string; cartao_responsavel: string | null; unidade_id: string | null;
  unidade_nome: string | null; unidade_cnpj: string | null; extrato_ate: string | null;
};

const ESTADO: Record<EstadoNota, { rotulo: string; chip: string }> = {
  ok: { rotulo: "Nota ok", chip: SITUACOES.recebida.chip },
  falta: { rotulo: "Pedir nota", chip: SITUACOES.pendente.chip },
  pedida: { rotulo: "Nota pedida", chip: SITUACOES.pedida.chip },
  sem_nota: { rotulo: "Sem nota", chip: SITUACOES.sem_nota.chip },
  pessoal: { rotulo: "Pessoal", chip: SITUACOES.pessoal.chip },
  nao_precisa: { rotulo: "Não precisa", chip: "bg-slate-100 text-slate-600" },
};

/** Desde quando carregar: começo do mês passado (cobre "mês passado" e "7 dias" na virada do mês). */
const desde = (dia: string) => { const d = new Date(`${dia.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); };

function useGastos(c: Cartao) {
  const de = desde(hoje());
  const gastos = useQuery({
    queryKey: ["cartao_gastos", c.id, de],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("gastos_cartao", { p_conta: c.id, p_de: de });
      if (error) throw error;
      return (data ?? []) as GastoCartao[];
    },
  });
  const notas = useQuery({
    queryKey: ["cartao_notas", c.id, de],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("notas_cartao", { p_conta: c.id, p_de: de });
      if (error) throw error;
      return (data ?? []) as NotaCartao[];
    },
  });
  const { data: funcionarios = [] } = useRows<{ nome: string }>("funcionarios", { select: "nome", order: "nome", ascending: true, key: ["cartao"] });
  const lista = gastos.data ?? [];
  const casadas = useMemo(() => casarNotas(lista, notas.data ?? []), [lista, notas.data]);
  return { lista, casadas, funcionarios, carregando: gastos.isLoading, erro: gastos.error, recarregar: () => { gastos.refetch(); notas.refetch(); } };
}

/** Os cartões no Início: o da pessoa logada (e todos, para o administrador). */
export function CartoesCorporativos({ className = "mb-4" }: { className?: string }) {
  const { user_id, papel } = usePerfil();
  const { data: cartoes = [] } = useQuery({
    queryKey: ["cartoes_corporativos"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cartoes_corporativos");
      if (error) throw error;
      return (data ?? []) as Cartao[];
    },
  });
  const meus = cartoes.filter((c) => c.cartao_responsavel === user_id || papel === "admin");
  if (!meus.length) return null;
  return <div className={`grid gap-3 lg:grid-cols-2 ${className}`}>{meus.map((c) => <CartaoResumo key={c.id} cartao={c} />)}</div>;
}

function CnpjParaNota({ c, claro }: { c: Cartao; claro?: boolean }) {
  if (!c.unidade_cnpj) return null;
  const cnpj = docFormat(c.unidade_cnpj);
  return (
    <button type="button" onClick={() => navigator.clipboard?.writeText(cnpj).then(() => notify("CNPJ copiado"), () => notify(cnpj))}
      title="Copiar o CNPJ para pedir a nota" className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold ${claro ? "bg-white/15 text-white hover:bg-white/25" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
      <Receipt size={13} aria-hidden /> Nota no CNPJ {cnpj}{c.unidade_nome ? ` (${c.unidade_nome})` : ""} <ClipboardCopy size={12} aria-hidden />
    </button>
  );
}

function CartaoResumo({ cartao: c }: { cartao: Cartao }) {
  const dia = hoje();
  const { lista, casadas, funcionarios, carregando, erro } = useGastos(c);
  const [aberto, setAberto] = useState<Periodo | null>(null);
  const doDia = useMemo(() => resumoCartao(lista.filter((g) => noPeriodo(g, intervaloCartao("hoje", dia))), casadas, funcionarios), [lista, casadas, funcionarios, dia]);
  const doMes = useMemo(() => resumoCartao(lista.filter((g) => noPeriodo(g, intervaloCartao("mes", dia))), casadas, funcionarios), [lista, casadas, funcionarios, dia]);
  // sem compra hoje no extrato: mostra o último dia que tem
  const ultimoDia = lista[0]?.data ?? null;
  const base = doDia.n ? { r: doDia, titulo: "Hoje" } : ultimoDia
    ? { r: resumoCartao(lista.filter((g) => g.data === ultimoDia), casadas, funcionarios), titulo: `Último dia no extrato · ${dataBR(ultimoDia)}` } : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-card">
      <div className="bg-gradient-to-br from-[#0f2a4a] via-[#16406e] to-[#0b7a75] p-4 text-white">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid h-10 w-14 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-amber-200 to-amber-400 text-amber-900 shadow-inner" aria-hidden><CreditCard size={22} /></span>
          <div className="min-w-[10rem] flex-1">
            <h2 className="text-lg font-bold leading-tight">{c.cartao_nome}</h2>
            <p className="text-xs text-white/80">{c.nome}{c.extrato_ate ? ` · extrato até ${dataBR(c.extrato_ate)}` : ""}</p>
          </div>
          {/* sem espaço, o total do mês desce para a linha de baixo (não espreme o nome do cartão) */}
          <div className="ml-auto text-right">
            <div className="text-2xs font-semibold uppercase tracking-wide text-white/70">Este mês</div>
            <div className="num text-xl font-bold">{brl(doMes.total)}</div>
          </div>
        </div>
        <div className="mt-3"><CnpjParaNota c={c} claro /></div>
      </div>

      <div className="space-y-3 p-4">
        {erro ? <p className="text-sm text-red-700">Não deu para ler o cartão: {(erro as Error).message}</p>
          : carregando ? <p className="text-sm text-slate-500">Carregando os gastos…</p>
          : !base ? <p className="text-sm text-slate-500">Nenhum gasto no extrato deste cartão desde o mês passado.</p>
          : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{base.titulo}</div>
                  <div className="num text-2xl font-bold text-fg">{brl(base.r.total)} <span className="text-sm font-medium text-slate-500">· {base.r.n} {pl(base.r.n, "compra", "compras")}</span></div>
                </div>
                {doMes.falta > 0 ? (
                  <button type="button" onClick={() => setAberto("mes")} className="rounded-xl bg-red-50 px-3 py-2 text-left text-sm text-red-800 ring-1 ring-inset ring-red-200 hover:bg-red-100">
                    <span className="flex items-center gap-1.5 font-bold"><AlertTriangle size={15} aria-hidden /> {doMes.falta} {pl(doMes.falta, "compra sem nota", "compras sem nota")} no mês</span>
                    <span className="num text-xs">{brl(doMes.faltaValor)} ainda fora da empresa</span>
                  </button>
                ) : doMes.precisam > 0 && <span className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"><Check size={15} aria-hidden /> Todas as notas do mês em dia</span>}
              </div>
              <BarrasCategoria linhas={base.r.porCategoria} total={base.r.total} />
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                  <span>Compras do mês com nota</span><span className="num font-semibold">{doMes.pctComNota}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={doMes.pctComNota} aria-valuemin={0} aria-valuemax={100} aria-label="Compras do mês com nota">
                  <div className={`h-full rounded-full ${doMes.pctComNota >= 90 ? "bg-emerald-500" : doMes.pctComNota >= 60 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${doMes.pctComNota}%` }} />
                </div>
              </div>
            </>
          )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setAberto(doDia.n ? "hoje" : "7dias")}><Receipt size={15} /> Ver gastos e notas</Button>
          {doMes.falta > 0 && <Button type="button" variant="secondary" onClick={() => setAberto("mes")}><AlertTriangle size={15} /> O que falta pedir nota</Button>}
        </div>
      </div>
      {aberto && <CartaoDetalhe cartao={c} inicial={aberto} soFalta={aberto === "mes" && doMes.falta > 0} onClose={() => setAberto(null)} />}
    </section>
  );
}

function BarrasCategoria({ linhas, total, ativa, onEscolher }: { linhas: ReturnType<typeof resumoCartao>["porCategoria"]; total: number; ativa?: CategoriaCartao | null; onEscolher?: (c: CategoriaCartao | null) => void }) {
  if (!linhas.length) return null;
  return (
    <ul className="space-y-1.5">
      {linhas.map((l) => {
        const info = CATEGORIAS[l.categoria];
        const pct = total ? Math.max(3, Math.round((l.total / total) * 100)) : 0;
        const conteudo = (
          <>
            <span className="min-w-0 flex-1 truncate text-sm text-fg sm:w-44 sm:flex-none">
              <span className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle sm:hidden ${info.barra}`} aria-hidden />{info.rotulo}
            </span>
            <span className="hidden h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100 sm:block"><span className={`block h-full rounded-full ${info.barra}`} style={{ width: `${pct}%` }} /></span>
            <span className="num shrink-0 text-right text-sm font-semibold text-fg sm:w-24">{brl(l.total)}</span>
            <span className={`w-[4.5rem] shrink-0 text-right text-2xs leading-tight sm:w-20 ${l.falta ? "font-semibold text-red-700" : "text-slate-400"}`}>{l.falta ? `${l.falta} sem nota` : `${l.n} ${pl(l.n, "compra", "compras")}`}</span>
          </>
        );
        return (
          <li key={l.categoria}>
            {onEscolher ? (
              <button type="button" aria-pressed={ativa === l.categoria} onClick={() => onEscolher(ativa === l.categoria ? null : l.categoria)}
                className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-0.5 text-left ${ativa === l.categoria ? "bg-brand/10 ring-1 ring-brand" : "hover:bg-slate-50"}`}>{conteudo}</button>
            ) : <div className="flex items-center gap-2 px-1.5">{conteudo}</div>}
          </li>
        );
      })}
    </ul>
  );
}

type Filtro = "todos" | "falta" | "ok";

function CartaoDetalhe({ cartao: c, inicial, soFalta, onClose }: { cartao: Cartao; inicial: Periodo; soFalta?: boolean; onClose: () => void }) {
  const dia = hoje();
  const { lista, casadas, funcionarios, recarregar } = useGastos(c);
  const [periodo, setPeriodo] = useState<Periodo>(inicial);
  const [filtro, setFiltro] = useState<Filtro>(soFalta ? "falta" : "todos");
  const [categoria, setCategoria] = useState<CategoriaCartao | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const qc = useQueryClient();
  const intervalo = intervaloCartao(periodo, dia);
  const doPeriodo = useMemo(() => lista.filter((g) => noPeriodo(g, intervalo)), [lista, intervalo.de, intervalo.ate]); // eslint-disable-line react-hooks/exhaustive-deps
  const resumo = useMemo(() => resumoCartao(doPeriodo, casadas, funcionarios), [doPeriodo, casadas, funcionarios]);
  const linhas = doPeriodo.map((g) => {
    const cat = categoriaDe(g, funcionarios);
    return { g, cat, est: estadoNota(g, cat, casadas.get(g.id)), casada: casadas.get(g.id) ?? null };
  }).filter((l) => l.cat !== "transferencia")
    .filter((l) => !categoria || l.cat === categoria)
    .filter((l) => filtro === "todos" || (filtro === "falta" ? l.est === "falta" || l.est === "pedida" : l.est === "ok"));
  const porDia = new Map<string, typeof linhas>();
  for (const l of linhas) porDia.set(l.g.data, [...(porDia.get(l.g.data) ?? []), l]);
  const categoriasNoPeriodo = resumo.porCategoria.map((l) => l.categoria);

  async function marcar(g: GastoCartao, situacao: SituacaoNota, extra: { categoria?: string | null; nota?: string | null; obs?: string | null; nfe?: string | null } = {}) {
    const { error } = await supabase.rpc("marcar_gasto_cartao", {
      p_lancamento: g.id, p_situacao: situacao, p_categoria: extra.categoria ?? null, p_nota: extra.nota ?? null, p_obs: extra.obs ?? null, p_nfe: extra.nfe ?? null,
    });
    if (error) return notifyError(error), false;
    qc.invalidateQueries({ queryKey: ["cartao_gastos"] });
    recarregar();
    return true;
  }

  return (
    <Modal open wide onClose={onClose} title={`${c.cartao_nome} · gastos e notas`}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Período">
            {PERIODOS_CARTAO.map((p) => (
              <button key={p.id} type="button" role="tab" aria-selected={periodo === p.id} onClick={() => setPeriodo(p.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${periodo === p.id ? "bg-brand text-brand-fg" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{p.rotulo}</button>
            ))}
          </div>
          <span className="text-xs text-slate-500">{dataBR(intervalo.de)}{intervalo.ate !== intervalo.de ? ` a ${dataBR(intervalo.ate)}` : ""}{c.extrato_ate && c.extrato_ate < intervalo.ate ? ` · extrato até ${dataBR(c.extrato_ate)}` : ""}</span>
          <span className="ml-auto"><CnpjParaNota c={c} /></span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Numero rotulo="Gasto" valor={brl(resumo.total)} sub={`${resumo.n} ${pl(resumo.n, "compra", "compras")}`} />
          <Numero rotulo="Com nota" valor={`${resumo.pctComNota}%`} sub={`${resumo.comNota} de ${resumo.precisam}`} tom={resumo.pctComNota >= 90 ? "bom" : resumo.pctComNota >= 60 ? "medio" : "ruim"} />
          <Numero rotulo="Falta pedir nota" valor={brl(resumo.faltaValor)} sub={`${resumo.falta} ${pl(resumo.falta, "compra", "compras")}${resumo.pedidas ? ` · ${resumo.pedidas} já ${pl(resumo.pedidas, "pedida", "pedidas")}` : ""}`} tom={resumo.falta ? "ruim" : "bom"} />
          <Numero rotulo="Pessoal" valor={brl(resumo.pessoalValor)} sub={`${resumo.pessoal} ${pl(resumo.pessoal, "compra", "compras")} — não entra na empresa`} />
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Em quê {categoria ? "· toque de novo para ver tudo" : "· toque para filtrar"}</div>
          <BarrasCategoria linhas={resumo.porCategoria} total={resumo.total} ativa={categoria} onEscolher={setCategoria} />
          {!resumo.porCategoria.length && <p className="text-slate-500">Nenhum gasto neste período.</p>}
        </div>

        {categoriasNoPeriodo.length > 0 && (
          <details className="rounded-xl border border-sky-200 bg-sky-50/50 p-3" open={!!categoria}>
            <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-sky-900"><Info size={15} aria-hidden /> Como cada gasto entra na empresa (Lucro Real)</summary>
            <ul className="mt-2 space-y-1.5 text-slate-700">
              {(categoria ? [categoria] : categoriasNoPeriodo).map((k) => <li key={k}><b>{CATEGORIAS[k].rotulo}:</b> {CATEGORIAS[k].dica}</li>)}
            </ul>
            <p className="mt-2 text-xs text-slate-500">Regra geral: a despesa precisa ser necessária para a empresa e ter nota ou cupom com o CNPJ dela (RIR/2018, art. 311). Casos de dúvida: confirmar com o contador.</p>
          </details>
        )}

        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Mostrar">
          {([["todos", "Todas"], ["falta", "Falta nota"], ["ok", "Com nota"]] as [Filtro, string][]).map(([v, r]) => (
            <button key={v} type="button" role="tab" aria-selected={filtro === v} onClick={() => setFiltro(v)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${filtro === v ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{r}</button>
          ))}
        </div>

        {!linhas.length && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-slate-500">Nada aqui neste período.</p>}
        {[...porDia.entries()].map(([d, ls]) => (
          <div key={d}>
            <div className="mb-1 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>{d === dia ? "Hoje" : dataBR(d)}</span>
              <span className="num">{brl(ls.reduce((s, l) => s - Number(l.g.valor), 0))}</span>
            </div>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {ls.map(({ g, cat, est, casada }) => (
                <LinhaGasto key={g.id} g={g} cat={cat} est={est} casada={casada} aberto={aberto === g.id}
                  onAbrir={() => setAberto(aberto === g.id ? null : g.id)} onMarcar={(s, e) => marcar(g, s, e)} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function Numero({ rotulo, valor, sub, tom }: { rotulo: string; valor: string; sub?: string; tom?: "bom" | "medio" | "ruim" }) {
  const cor = tom === "bom" ? "text-emerald-700" : tom === "medio" ? "text-amber-700" : tom === "ruim" ? "text-red-700" : "text-fg";
  return (
    <div className="rounded-xl border border-slate-200 p-2.5">
      <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className={`num text-lg font-bold ${cor}`}>{valor}</div>
      {sub && <div className="text-2xs leading-snug text-slate-500">{sub}</div>}
    </div>
  );
}

function LinhaGasto({ g, cat, est, casada, aberto, onAbrir, onMarcar }: {
  g: GastoCartao; cat: CategoriaCartao; est: EstadoNota; casada: NotaCartao | null; aberto: boolean; onAbrir: () => void;
  onMarcar: (s: SituacaoNota, extra?: { categoria?: string | null; nota?: string | null; obs?: string | null; nfe?: string | null }) => Promise<boolean | undefined>;
}) {
  const [motivo, setMotivo] = useState<string | null>(null);
  const [nota, setNota] = useState(g.nota_numero ?? "");
  const info = CATEGORIAS[cat];
  const pedeNota = info.precisaNota && est !== "ok";
  return (
    <li className="p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onAbrir} aria-expanded={aberto} aria-label={aberto ? "Fechar detalhes" : "Abrir detalhes"} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
          {aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div className="min-w-0 flex-1 basis-40">
          <div className="truncate font-semibold text-fg" title={g.descricao ?? undefined}>{lojaDoGasto(g.descricao)}</div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${info.chip}`}>{info.rotulo}</span>
            <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${ESTADO[est].chip}`}>{ESTADO[est].rotulo}</span>
            {casada && !g.nfe_recebida_id && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-2xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">NF-e de {casada.emitente_nome ?? "fornecedor"} chegou</span>}
            {g.nota_numero && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-2xs text-slate-700">nota {g.nota_numero}</span>}
          </div>
        </div>
        <span className="num shrink-0 text-base font-bold text-fg">{brl(-Number(g.valor))}</span>
        <div className="flex w-full flex-wrap justify-end gap-1 sm:w-auto">
          {casada && !g.nfe_recebida_id && (
            <Button type="button" variant="secondary" className="!min-h-0 !px-2 !py-1 text-xs" onClick={() => onMarcar("recebida", { nfe: casada.id })}><Link2 size={13} /> Ligar NF-e</Button>
          )}
          {pedeNota && est !== "pedida" && <Button type="button" variant="secondary" className="!min-h-0 !px-2 !py-1 text-xs" onClick={() => onMarcar("pedida")}><Hourglass size={13} /> Pedi a nota</Button>}
          {est !== "ok" && <Button type="button" variant="secondary" className="!min-h-0 !px-2 !py-1 text-xs" onClick={() => onMarcar("recebida", { nota: nota || null })}><FileCheck2 size={13} /> Nota ok</Button>}
          {pedeNota && <Button type="button" variant="ghost" className="!min-h-0 !px-2 !py-1 text-xs" onClick={() => setMotivo(motivo === null ? "" : null)}><Ban size={13} /> Sem nota</Button>}
          {est !== "pessoal" && cat !== "imposto" && <Button type="button" variant="ghost" className="!min-h-0 !px-2 !py-1 text-xs" onClick={() => onMarcar("pessoal")}><User size={13} /> Pessoal</Button>}
          {(est === "ok" || est === "pessoal" || est === "sem_nota") && g.situacao !== "pendente" && (
            <Button type="button" variant="ghost" className="!min-h-0 !px-2 !py-1 text-xs" title="Voltar para 'pedir nota'" onClick={() => onMarcar("pendente")}><X size={13} /> Desfazer</Button>
          )}
        </div>
      </div>
      {motivo !== null && (
        <div className="mt-2 flex flex-wrap gap-2 pl-9">
          <input className="input min-w-0 flex-1" autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por que não tem nota? Ex.: ambulante, não emite nota" />
          <Button type="button" disabled={motivo.trim().length < 3} onClick={async () => { if (await onMarcar("sem_nota", { obs: motivo })) setMotivo(null); }}>Salvar</Button>
        </div>
      )}
      {aberto && (
        <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-2.5 pl-9 text-xs text-slate-700">
          <p><b>Como entra na empresa:</b> {info.dica}</p>
          <p className="text-slate-500">No extrato: {g.descricao}{g.observacao ? ` · ${g.observacao}` : ""}</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1"><span className="font-semibold">Nº da nota</span>
              <input className="input w-40" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ex.: 12345" /></label>
            <label className="flex flex-col gap-1"><span className="font-semibold">Categoria</span>
              <select className="input w-52" value={g.categoria ?? ""} onChange={(e) => onMarcar(g.situacao, { categoria: e.target.value || null, obs: g.situacao === "sem_nota" ? g.observacao : null })}>
                <option value="">Automática ({info.rotulo})</option>
                {CATEGORIAS_ESCOLHA.map((k) => <option key={k} value={k}>{CATEGORIAS[k].rotulo}</option>)}
              </select></label>
            <Button type="button" variant="secondary" className="!min-h-0 !py-1.5 text-xs" disabled={!nota.trim()} onClick={() => onMarcar("recebida", { nota })}><FileCheck2 size={13} /> Salvar nº e marcar nota ok</Button>
          </div>
          <Anexos entidade="geral" id={g.id} titulo="Foto da nota ou do cupom" />
        </div>
      )}
    </li>
  );
}
