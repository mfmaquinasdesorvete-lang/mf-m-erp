// Metas de vendas: meta x realizado do mês da empresa, dos vendedores (ranking) e das regiões/estados, projeção pelos
// dias úteis, evolução mês a mês e o cadastro das metas. Usado no Painel gerencial (aba Metas) e na tela Metas.
// O banco (metas_apuracao) faz as contas e filtra: o vendedor recebe só as linhas dele.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, CalendarClock, FileDown, Flag, Gauge, Info, MapPin, Pencil, Target, TrendingUp, Trophy } from "lucide-react";
import { Button, CampoMes, Section, Stat, nomeMes } from "@/components/ui";
import { Colunas } from "@/components/Charts";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { useUnidade } from "@/lib/unidade";
import { brl, pl } from "@/lib/format";
import { baixarPlanilha } from "@/lib/exportar";
import { notifyError } from "@/lib/notify";
import {
  agruparRegioes, COR_FAIXA, faixa, hojeBrasil, mesesAte, normalizarLinhas, planilhaMetas, rankingVendedores, rotuloOrigem,
  serieMetas, somarMeses, NOME_UF, type Faixa, type GrupoRegiao, type LinhaApuracao,
} from "@/lib/metas";
import { EditarMetas } from "./EditarMetas";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (am: string) => `${MESES[Number(am.slice(5, 7)) - 1]}/${am.slice(2, 4)}`;
const pctTexto = (p: number | null | undefined) => (p == null ? "—" : `${p.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const compacto = (v: number) =>
  Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
    : Math.abs(v) >= 1e3 ? `${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil` : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const TOM: Record<Faixa, "critico" | "atencao" | "bom" | "neutro"> = { vermelho: "critico", amarelo: "atencao", verde: "bom", sem_meta: "neutro" };

/** Erro de banco sem a mudança das metas aplicada: avisa em vez de mostrar o erro técnico. */
function mensagemErro(e: unknown) {
  const m = e as { code?: string; message?: string } | null;
  if (m?.code === "PGRST202" || /metas_apuracao/.test(m?.message ?? "")) return "As metas ainda não estão ativas no banco: falta aplicar a mudança do banco das metas (metas_vendas).";
  return `Não foi possível carregar as metas: ${m?.message ?? "erro desconhecido"}`;
}

export function PainelMetas() {
  const { tem } = usePerfil();
  const gerencia = tem("financeiro");
  const { atual, unidades, nome: nomeUnidade } = useUnidade();
  const dia = hojeBrasil();
  const [mes, setMes] = useState(dia.slice(0, 7));
  const [unidade, setUnidade] = useState<string>(atual ?? "");
  const [editar, setEditar] = useState(false);
  const meses = useMemo(() => mesesAte(mes, 12), [mes]);
  const rotuloUnidade = unidade ? nomeUnidade(unidade) : "Todas as unidades";

  const q = useQuery({
    queryKey: ["metas_apuracao", meses[0], mes, unidade],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("metas_apuracao", { p_de: `${meses[0]}-01`, p_ate: `${mes}-01`, p_unidade: unidade || null });
      if (error) throw error;
      return normalizarLinhas(data);
    },
  });
  const linhas = useMemo(() => q.data ?? [], [q.data]);
  const doMes = useMemo(() => linhas.filter((l) => l.mes.slice(0, 7) === mes), [linhas, mes]);
  const anterior = useMemo(() => {
    const m = somarMeses(mes, -1);
    return new Map(linhas.filter((l) => l.mes.slice(0, 7) === m).map((l) => [l.chave, l.realizado]));
  }, [linhas, mes]);

  function exportar() {
    baixarPlanilha(`metas-${mes}${unidade ? `-${nomeUnidade(unidade).toLowerCase().replace(/\s+/g, "-")}` : ""}`, planilhaMetas(linhas, mes, rotuloUnidade)).catch(notifyError);
  }

  const barra = (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <CampoMes value={mes} onChange={(v) => v && setMes(v)} rotulo="Mês das metas" />
      {unidades.length > 1 && (
        <select className="input w-auto" value={unidade} onChange={(e) => setUnidade(e.target.value)} aria-label="Unidade">
          <option value="">Todas as unidades</option>
          {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}{u.uf ? ` (${u.uf})` : ""}</option>)}
        </select>
      )}
      <div className="flex-1" />
      <Button variant="secondary" onClick={exportar} disabled={!linhas.length}><FileDown size={16} /> Exportar</Button>
      {gerencia && <Button onClick={() => setEditar(true)}><Pencil size={16} /> Cadastrar metas</Button>}
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      {barra}
      {q.isLoading && <p className="text-sm text-slate-500">Carregando as metas…</p>}
      {q.error && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">{mensagemErro(q.error)}</p>}
      {!q.isLoading && !q.error && (gerencia
        ? <VisaoGerencia linhas={linhas} doMes={doMes} meses={meses} mes={mes} hoje={dia} />
        : <VisaoVendedor linhas={linhas} doMes={doMes} meses={meses} mes={mes} hoje={dia} />)}
      <ComoConta />
      {editar && <EditarMetas mes={mes} unidadeId={unidade || null} referencia={anterior} onClose={() => setEditar(false)} />}
    </div>
  );
}

/* ------------------------------ Administrador e financeiro ------------------------------ */

function VisaoGerencia({ linhas, doMes, meses, mes, hoje }: { linhas: LinhaApuracao[]; doMes: LinhaApuracao[]; meses: string[]; mes: string; hoje: string }) {
  const empresa = doMes.find((l) => l.tipo === "empresa");
  const ranking = useMemo(() => rankingVendedores(doMes), [doMes]);
  const regioes = useMemo(() => agruparRegioes(doMes, mes, hoje), [doMes, mes, hoje]);
  const semEstado = doMes.find((l) => l.chave === "UF:--");
  const serie = useMemo(() => serieMetas(linhas, meses), [linhas, meses]);

  return (
    <>
      {empresa && <Cartoes l={empresa} mes={mes} titulo="Meta da empresa" />}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Section title={`Ranking dos vendedores · ${nomeMes(mes)}`} className="xl:col-span-3" actions={<Legenda />}>
          <Ranking linhas={ranking} />
        </Section>
        <Section title="Meta x realizado mês a mês (empresa)" className="xl:col-span-2">
          <Colunas altura={240} vazio="Sem metas nem vendas nos últimos 12 meses."
            dados={serie.map((s) => ({ rotulo: rotuloMes(s.mes), valores: [s.meta ?? 0, s.realizado] }))}
            series={[{ nome: "Meta", cor: "rgb(var(--slate-400))" }, { nome: "Realizado", cor: "var(--serie-1)" }]} />
          <TabelaEvolucao serie={serie} />
        </Section>
      </div>

      <Section title={`Regiões e estados · ${nomeMes(mes)}`} actions={<span className="text-xs text-slate-500">estado do destinatário da nota ou do cliente</span>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {regioes.map((g) => <CartaoRegiao key={g.regiao} g={g} />)}
        </div>
        {semEstado && semEstado.realizado !== 0 && (
          <p className="mt-3 text-xs text-slate-500">{brl(semEstado.realizado)} em {semEstado.vendas} {pl(semEstado.vendas, "venda", "vendas")} sem estado no cliente nem na nota: não entram em nenhuma região.</p>
        )}
      </Section>
    </>
  );
}

/* ------------------------------------ Vendedor ------------------------------------ */

function VisaoVendedor({ linhas, doMes, meses, mes }: { linhas: LinhaApuracao[]; doMes: LinhaApuracao[]; meses: string[]; mes: string; hoje: string }) {
  const minhas = doMes.filter((l) => l.tipo === "vendedor");
  const serie = useMemo(() => serieMetas(linhas.filter((l) => l.tipo === "vendedor").map((l) => ({ ...l, chave: "eu" })), meses, "eu"), [linhas, meses]);
  if (!linhas.some((l) => l.tipo === "vendedor")) {
    return <p className="rounded-xl border border-slate-200 bg-surface p-4 text-sm text-slate-600">Seu usuário não está ligado a um cadastro de vendedor. Peça ao financeiro para ligar em Comissões → Vendedores.</p>;
  }
  return (
    <>
      {minhas.map((l) => <Cartoes key={l.chave} l={l} mes={mes} titulo={minhas.length > 1 ? `Meta · ${l.nome}` : "Minha meta"} />)}
      <Section title="Minha meta x realizado mês a mês">
        <Colunas altura={240} vazio="Sem metas nem vendas nos últimos 12 meses."
          dados={serie.map((s) => ({ rotulo: rotuloMes(s.mes), valores: [s.meta ?? 0, s.realizado] }))}
          series={[{ nome: "Meta", cor: "rgb(var(--slate-400))" }, { nome: "Realizado", cor: "var(--serie-1)" }]} />
        <TabelaEvolucao serie={serie} />
      </Section>
    </>
  );
}

/* ------------------------------------ Peças ------------------------------------ */

/** Os 4 cartões do mês: meta, realizado, % atingido e projeção. */
function Cartoes({ l, mes, titulo }: { l: LinhaApuracao; mes: string; titulo: string }) {
  const f = faixa(l.pct);
  const pctProj = l.projecao != null && l.meta ? Math.round((l.projecao / l.meta) * 1000) / 10 : null;
  const encerrado = l.dias_passados >= l.dias_uteis;
  const anoPassado = Number(mes.slice(0, 4)) - 1;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat icon={Target} tom="info" label={`${titulo} · ${nomeMes(mes)}`} valor={l.meta != null ? brl(l.meta) : "Sem meta"}
        sub={<>
          {l.meta != null && l.meta_origem && l.meta_origem !== "cadastrada" && <>{rotuloOrigem(l.meta_origem)}<br /></>}
          {l.meta_maquinas != null && <>{l.meta_maquinas} {pl(l.meta_maquinas, "máquina", "máquinas")} · </>}
          {l.meta_margem != null && <>margem mínima {pctTexto(l.meta_margem)} · </>}
          {l.dias_uteis} dias úteis no mês
          {l.observacao && <><br /><span className="italic">{l.observacao}</span></>}
        </>} />
      <Stat icon={TrendingUp} label="Realizado" valor={brl(l.realizado)}
        sub={<>
          {l.vendas} {pl(l.vendas, "venda", "vendas")}{l.maquinas > 0 && <> · {l.maquinas.toLocaleString("pt-BR")} {pl(l.maquinas, "máquina", "máquinas")}{l.meta_maquinas != null && ` de ${l.meta_maquinas}`}</>}
          {l.devolucoes > 0 && <> · {brl(l.devolucoes)} devolvidos</>}
          {l.margem_pct != null && <><br />margem {pctTexto(l.margem_pct)}{l.meta_margem != null && (l.margem_pct >= l.meta_margem ? " (dentro da meta)" : " (abaixo da meta)")}</>}
          <br /><VariacaoAno l={l} rotulo={encerrado ? `vs ${MESES[Number(mes.slice(5, 7)) - 1]}/${anoPassado}` : `vs mesmo período de ${anoPassado}`} />
        </>} />
      <Stat icon={Gauge} tom={TOM[f]} label="% atingido" valor={pctTexto(l.pct)}
        sub={<>
          <Barra pct={l.pct} projecao={pctProj} faixa={f} rotulo={`${titulo}: % atingido`} />
          <span className="mt-1 block">{l.meta == null ? "cadastre a meta para acompanhar" : l.falta ? `faltam ${brl(l.falta)}` : "meta batida"} · {COR_FAIXA[f].rotulo}</span>
        </>} />
      <Stat icon={encerrado ? Flag : CalendarClock} label={encerrado ? "Fechou o mês" : "Projeção do mês"} valor={l.projecao != null ? brl(l.projecao) : "—"}
        sub={<>
          {pctProj != null && !encerrado && <>{pctTexto(pctProj)} da meta no ritmo atual<br /></>}
          {l.dias_passados} de {l.dias_uteis} dias úteis{encerrado ? "" : " (até hoje)"}
          {l.falta_por_dia != null && l.falta_por_dia > 0 && <><br /><b className="text-fg">{brl(l.falta_por_dia)}</b> por dia útil para bater a meta</>}
        </>} />
    </div>
  );
}

function VariacaoAno({ l, rotulo }: { l: LinhaApuracao; rotulo: string }) {
  if (l.variacao_ano == null) return <>{rotulo}: sem vendas para comparar</>;
  const sobe = l.variacao_ano >= 0;
  return (
    <span className={sobe ? "text-emerald-700" : "text-red-700"} title={`${rotulo}: ${brl(l.ano_anterior_parcial)}`}>
      {sobe ? <ArrowUpRight size={13} className="inline" aria-hidden /> : <ArrowDownRight size={13} className="inline" aria-hidden />}
      {sobe ? " subiu " : " caiu "}{pctTexto(Math.abs(l.variacao_ano))} {rotulo}
    </span>
  );
}

/** Barra de progresso na cor da faixa; a parte clara é a projeção do mês. Sem meta: `pct` é só o tamanho da barra. */
function Barra({ pct, projecao, faixa: f, rotulo }: { pct: number | null; projecao?: number | null; faixa: Faixa; rotulo: string }) {
  const cor = COR_FAIXA[f];
  const largura = pct == null ? 0 : Math.min(100, Math.max(0, pct));
  const proj = projecao == null ? 0 : Math.min(100, Math.max(0, projecao));
  return (
    <span className="relative mt-1.5 block h-2.5 overflow-hidden rounded-full bg-slate-200/70" role="progressbar" aria-label={rotulo}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(largura)} aria-valuetext={pct == null || f === "sem_meta" ? "sem meta" : `${pctTexto(pct)} da meta`}>
      {proj > largura && <span className={`absolute inset-y-0 left-0 block rounded-full opacity-30 ${cor.barra}`} style={{ width: `${proj}%` }} />}
      <span className={`absolute inset-y-0 left-0 block rounded-full transition-[width] duration-500 ${cor.barra}`} style={{ width: `${largura}%` }} />
    </span>
  );
}

function Legenda() {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
      {(["vermelho", "amarelo", "verde"] as const).map((f) => (
        <span key={f} className="inline-flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-full ${COR_FAIXA[f].barra}`} aria-hidden />{f === "vermelho" ? "< 70%" : f === "amarelo" ? "70–99%" : "≥ 100%"}</span>
      ))}
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-slate-400 opacity-40" aria-hidden />projeção</span>
    </span>
  );
}

function Ranking({ linhas }: { linhas: LinhaApuracao[] }) {
  if (!linhas.length) return <p className="py-6 text-center text-sm text-slate-500">Sem metas de vendedor nem vendas no mês.</p>;
  const maior = Math.max(1, ...linhas.map((l) => l.realizado));
  let pos = 0;
  return (
    <ol className="space-y-2">
      {linhas.map((l) => {
        const semVendedor = l.chave === "sem_vendedor";
        const f = faixa(l.pct);
        const cor = COR_FAIXA[f];
        if (!semVendedor) pos++;
        const pctProj = l.projecao != null && l.meta ? (l.projecao / l.meta) * 100 : null;
        return (
          <li key={l.chave} className={`rounded-xl border border-slate-200 p-3 ${semVendedor ? "bg-slate-50" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${pos === 1 && l.pct != null && !semVendedor ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`} aria-hidden>
                  {semVendedor ? "—" : pos === 1 && l.pct != null ? <Trophy size={14} /> : pos}
                </span>
                <span className="min-w-0 truncate text-sm font-semibold text-fg">{l.nome}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${cor.selo}`}>{l.pct == null ? "sem meta" : pctTexto(l.pct)}</span>
            </div>
            <Barra pct={l.pct ?? (l.realizado / maior) * 100} projecao={pctProj} faixa={f} rotulo={`${l.nome}: ${l.pct == null ? "sem meta" : `${pctTexto(l.pct)} da meta`}`} />
            <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs text-slate-600">
              <span><b className="num text-fg">{brl(l.realizado)}</b>{l.meta != null && <> de {brl(l.meta)}</>} · {l.vendas} {pl(l.vendas, "venda", "vendas")}
                {(l.maquinas > 0 || l.meta_maquinas != null) && <> · {l.maquinas.toLocaleString("pt-BR")}{l.meta_maquinas != null && `/${l.meta_maquinas}`} {pl(l.maquinas, "máquina", "máquinas")}</>}
                {l.margem_pct != null && <> · margem {pctTexto(l.margem_pct)}</>}</span>
              {l.meta != null && (
                <span>{l.dias_passados < l.dias_uteis && l.projecao != null && <>projeção {brl(l.projecao)}</>}
                  {l.falta_por_dia ? <> · faltam <b className="text-fg">{brl(l.falta_por_dia)}</b>/dia útil</> : l.falta === 0 ? " · meta batida" : ""}</span>
              )}
            </div>
            {semVendedor && <p className="mt-1 text-xs text-slate-500">Vendas sem vendedor no pedido e sem vendedor na carteira do cliente (ex.: notas antigas do Tiny).</p>}
          </li>
        );
      })}
    </ol>
  );
}

function CartaoRegiao({ g }: { g: GrupoRegiao }) {
  const cor = COR_FAIXA[g.faixa];
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-bold text-fg"><MapPin size={15} className="text-modulo-texto" aria-hidden />{g.regiao}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cor.selo}`}>{g.pct == null ? "sem meta" : pctTexto(g.pct)}</span>
      </div>
      <div className="num mt-1 text-lg font-bold text-fg">{brl(g.realizado)}</div>
      <div className="text-xs text-slate-600">{g.meta != null ? <>de {brl(g.meta)}{g.metaPelosEstados && " (soma dos estados)"}</> : "sem meta"}
        {g.variacaoAno != null && <span className={g.variacaoAno >= 0 ? " text-emerald-700" : " text-red-700"}> · {g.variacaoAno >= 0 ? "+" : ""}{pctTexto(g.variacaoAno)} ano ant.</span>}</div>
      <Barra pct={g.pct} projecao={g.projecao != null && g.meta ? (g.projecao / g.meta) * 100 : null} faixa={g.faixa} rotulo={`Região ${g.regiao}`} />
      {g.ufs.length > 0 ? (
        <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label={`Estados da região ${g.regiao}`}>
          {g.ufs.map((u) => {
            const uf = u.chave.slice(3);
            const c = COR_FAIXA[faixa(u.pct)];
            return (
              <li key={u.chave} title={`${NOME_UF[uf] ?? uf}: ${brl(u.realizado)}${u.meta != null ? ` de ${brl(u.meta)} (${pctTexto(u.pct)})` : ""}`}
                className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${c.selo}`}>
                {uf} <span className="num font-normal">{compacto(u.realizado)}{u.pct != null && ` · ${pctTexto(u.pct)}`}</span>
              </li>
            );
          })}
        </ul>
      ) : <p className="mt-2.5 text-xs text-slate-500">Nenhuma venda nem meta nos estados.</p>}
    </div>
  );
}

function TabelaEvolucao({ serie }: { serie: ReturnType<typeof serieMetas> }) {
  const comMeta = serie.filter((s) => s.meta != null);
  if (!comMeta.length) return <p className="mt-2 text-xs text-slate-500">Nenhum mês com meta cadastrada nos últimos 12 meses.</p>;
  const batidas = comMeta.filter((s) => s.realizado >= (s.meta ?? 0)).length;
  return <p className="mt-2 text-xs text-slate-600">Meta batida em <b className="text-fg">{batidas} de {comMeta.length}</b> {pl(comMeta.length, "mês com meta", "meses com meta")}.</p>;
}

function ComoConta() {
  return (
    <details className="rounded-xl border border-slate-200 bg-surface p-3 text-sm text-slate-600">
      <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-fg"><Info size={15} aria-hidden /> Como o realizado é contado</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Pedidos aprovados, faturados ou entregues, no dia da aprovação, mais as notas fiscais de venda sem pedido no ERP (importadas do Tiny). Nota ligada a pedido não conta duas vezes.</li>
        <li>Saem orçamentos, pedidos cancelados, notas canceladas ou de teste, remessas e transferências. Devolução de venda (nota de entrada ligada à venda) desconta no mês em que entrou.</li>
        <li>Vendedor: o do pedido; venda sem vendedor fica com o vendedor da carteira do cliente. Estado: o do destinatário da nota ou o do cliente.</li>
        <li>Projeção: o que foi vendido até hoje dividido pelos dias úteis passados, vezes os dias úteis do mês. Dias úteis: segunda a sexta, sem os feriados nacionais de data fixa.</li>
        <li>Máquinas: itens que são máquina no cadastro de produtos. Margem: venda menos o custo atual do produto, só nos itens com custo cadastrado.</li>
      </ul>
    </details>
  );
}
