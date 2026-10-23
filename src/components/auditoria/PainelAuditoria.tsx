// Auditoria → Painel: resumo do checklist do mês, das exceções em aberto e do histórico de alterações dos últimos 30 dias.
// Cada número e cada item abre a lista certa já filtrada (ex.: "Exclusões" abre o histórico só com as exclusões).
import { useMemo, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardCheck, History, ShieldAlert, Trash2 } from "lucide-react";
import { nomeMes, Section, Stat, Button } from "@/components/ui";
import { Ranking } from "@/components/Charts";
import { ROTULO_CAMPO } from "@/components/Historico";
import { useRows } from "@/lib/data";
import { brl, dataBR, hoje as hojeUTC, pl } from "@/lib/format";
import { TIPOS } from "@/lib/auditoria";
import {
  consultaHistorico, descricaoLinha, diaMes, FILTROS_HISTORICO, hojeLocal, painelChecklist, painelExcecoes, painelHistorico, quem, rotuloTabela,
  type FiltrosExcecoes, type FiltrosHistorico, type OpcoesHistorico, type RespostaChecklist,
} from "@/lib/auditoriaBusca";
import type { DadosExcecoes } from "@/pages/Auditoria";
import { useHistorico, type Destino } from "./useAuditoria";

const NENHUM: never[] = [];
const contagem = (v: number) => v.toLocaleString("pt-BR");
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const COR_GRAVIDADE = {
  alta: { rotulo: "alta", caixa: "bg-red-50 text-red-700 ring-red-200", ponto: "bg-red-500" },
  media: { rotulo: "média", caixa: "bg-amber-50 text-amber-800 ring-amber-200", ponto: "bg-amber-500" },
  baixa: { rotulo: "baixa", caixa: "bg-slate-100 text-slate-700 ring-slate-200", ponto: "bg-slate-400" },
} as const;

export function PainelAuditoria({ dados, nomeRegistro, abrir }: {
  dados: DadosExcecoes; nomeRegistro: NonNullable<OpcoesHistorico["nomeRegistro"]>; abrir: (d: Destino) => void;
}) {
  const hoje = hojeLocal();
  // a competência é a mesma que o checklist abre (o mês de hoje)
  const comp = hojeUTC().slice(0, 7);
  const { data: respostas = NENHUM } = useRows<RespostaChecklist>("auditoria_checklist", { order: "item", ascending: true });
  const ck = useMemo(() => painelChecklist(respostas, comp), [respostas, comp]);
  const ex = painelExcecoes(dados.excecoes, dados.trat, hoje);
  const { linhas, isLoading, isError } = useHistorico(consultaHistorico({ ...FILTROS_HISTORICO, periodo: "30d" }, hoje));
  const h = useMemo(() => painelHistorico(linhas, hoje), [linhas, hoje]);

  const checklist = () => abrir({ aba: "checklist" });
  const exc = (filtros: Partial<FiltrosExcecoes> = {}) => abrir({ aba: "excecoes", filtros });
  const hist = (filtros: Partial<FiltrosHistorico> = {}) => abrir({ aba: "historico", filtros: { periodo: "30d", ...filtros } });
  const carregando = isLoading ? "…" : null;
  const ultimaExclusao = h.exclusoesRecentes[0];
  const atrasado = ck.atrasados[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={ClipboardCheck} label={`Checklist de ${nomeMes(comp)}`} valor={`${ck.pct}%`} onClick={checklist}
          tom={!ck.faltam ? "bom" : atrasado ? "critico" : "atencao"}
          sub={ck.faltam ? `faltam ${ck.faltam} de ${ck.total} itens${atrasado ? ` · ${nomeMes(atrasado.competencia)} em atraso` : ""}` : "tudo conferido"} />
        <Stat icon={ShieldAlert} label="Exceções em aberto" valor={contagem(ex.abertas)} onClick={() => exc()}
          tom={ex.porGravidade.alta ? "critico" : ex.abertas ? "atencao" : "bom"}
          sub={`${ex.porGravidade.alta} de gravidade alta · ${ex.prazoVencido} com prazo vencido`} />
        <Stat icon={History} label="Alterações em 7 dias" valor={carregando ?? contagem(h.ultimos7)} tom="info" onClick={() => hist({ periodo: "7d" })}
          sub={isLoading ? "carregando o histórico" : `${contagem(h.ultimos30)} em 30 dias · ${contagem(h.hoje)} hoje`} />
        <Stat icon={Trash2} label="Exclusões em 30 dias" valor={carregando ?? contagem(h.exclusoes30)} tom={h.exclusoes30 ? "atencao" : "neutro"}
          onClick={() => hist({ acao: "delete" })}
          sub={ultimaExclusao ? `última em ${quando(ultimaExclusao.created_at)} · ${quem(ultimaExclusao)}` : isLoading ? "carregando o histórico" : "nenhuma exclusão"} />
      </div>
      {isError && <p className="text-sm text-red-600">Não foi possível carregar o histórico de alterações (só o financeiro, o administrador e o contador veem).</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ------------------------------- checklist ------------------------------- */}
        <Section title={`Checklist de ${nomeMes(comp)}`} actions={<VerTudo onClick={checklist}>Abrir checklist</VerTudo>}>
          <button type="button" onClick={checklist} className="block w-full rounded-lg text-left">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="num text-2xl font-bold text-fg">{ck.pct}%</span>
              <span className="text-sm text-slate-600">{ck.conferidos} de {ck.total} conferidos · faltam <b className="text-fg">{ck.faltam}</b></span>
            </span>
            <span className="mt-1.5 block h-2.5 overflow-hidden rounded-full bg-slate-200" aria-hidden>
              <span className="block h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${ck.pct}%` }} />
            </span>
          </button>

          {atrasado ? (
            <Aviso tom="ruim" onClick={checklist}>
              <b className="text-red-700">Mais atrasado: {nomeMes(atrasado.competencia)}</b> ainda tem {atrasado.faltam} {pl(atrasado.faltam, "item", "itens")} a conferir
              {ck.atrasados.length > 1 && <> (e mais {ck.atrasados.length - 1} {pl(ck.atrasados.length - 1, "mês", "meses")} em atraso)</>}.
              <span className="mt-0.5 block text-slate-600">Comece por: “{atrasado.item.texto}” ({atrasado.item.secao})</span>
              <span className="mt-0.5 block text-xs text-slate-500">No checklist, escolha a competência {nomeMes(atrasado.competencia)}.</span>
            </Aviso>
          ) : ck.proximo ? (
            <Aviso tom="neutro" onClick={checklist}>
              <b className="text-fg">Meses anteriores em dia.</b> Próximo a conferir: “{ck.proximo.texto}” <span className="text-slate-500">({ck.proximo.secao})</span>
            </Aviso>
          ) : (
            <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16} /> Checklist do mês completo.</p>
          )}

          <ul className="mt-3">
            {ck.areas.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={checklist} className="linha-clicavel flex items-center gap-3 px-1 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 leading-snug text-slate-700">{a.titulo}</span>
                  <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-200 sm:w-28" aria-hidden>
                    <span className="block h-full bg-emerald-500" style={{ width: `${((a.total - a.faltam) / a.total) * 100}%` }} />
                  </span>
                  <span className={`num w-11 shrink-0 text-right text-xs font-semibold ${a.faltam ? "text-slate-600" : "text-emerald-700"}`}>{a.total - a.faltam}/{a.total}</span>
                </button>
              </li>
            ))}
          </ul>
          {ck.naoConformes > 0 && (
            <button type="button" onClick={() => exc({ tipo: "checklist" })} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-red-600 hover:underline">
              {ck.naoConformes} {pl(ck.naoConformes, "item não conforme", "itens não conformes")} (viram exceção) <ChevronRight size={15} />
            </button>
          )}
        </Section>

        {/* ------------------------------- exceções ------------------------------- */}
        <Section title="Exceções para conferir" actions={<VerTudo onClick={() => exc()}>Ver todas</VerTudo>}>
          <div className="grid grid-cols-3 gap-2">
            {(["alta", "media", "baixa"] as const).map((g) => (
              <button key={g} type="button" onClick={() => exc({ gravidade: g })}
                className={`min-w-0 rounded-xl px-2 py-2.5 text-center ring-1 transition hover:shadow-pop ${COR_GRAVIDADE[g].caixa}`}>
                <span className="num block text-xl font-bold leading-tight">{contagem(ex.porGravidade[g])}</span>
                <span className="block text-xs">gravidade {COR_GRAVIDADE[g].rotulo}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <button type="button" onClick={() => exc({ ver: "prazo_vencido" })} className={ex.prazoVencido ? "font-semibold text-red-600 hover:underline" : "link-discreto"}>
              {ex.prazoVencido} com prazo vencido
            </button>
            <button type="button" onClick={() => exc({ ver: "confirmadas" })} className="link-discreto">
              {ex.confirmadas} {pl(ex.confirmadas, "erro confirmado", "erros confirmados")}
            </button>
          </div>

          <Subtitulo>Por tipo</Subtitulo>
          <Ranking itens={ex.porTipo.slice(0, 6).map((t) => ({ rotulo: TIPOS[t.tipo].rotulo, valor: t.n }))} formatar={contagem} cor="rgb(var(--modulo))"
            onClicar={(i) => exc({ tipo: ex.porTipo[i].tipo })} vazio="Nenhuma exceção em aberto." />
          {ex.porTipo.length > 6 && (
            <button type="button" onClick={() => exc()} className="link-acao mt-1 text-xs">
              e mais {ex.porTipo.length - 6} {pl(ex.porTipo.length - 6, "tipo", "tipos")}
            </button>
          )}

          <Subtitulo>Mais antigas em aberto</Subtitulo>
          {!ex.maisAntigas.length ? <p className="text-sm text-slate-500">Nenhuma.</p> : (
            <ul className="space-y-1">
              {ex.maisAntigas.map(({ e, dias }) => (
                <li key={e.chave}>
                  <ItemLista onClick={() => exc({ chave: e.chave, ver: "todas" })}
                    titulo={<><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${COR_GRAVIDADE[e.gravidade].ponto}`} aria-label={`gravidade ${COR_GRAVIDADE[e.gravidade].rotulo}`} />{e.titulo}</>}
                    detalhe={`${TIPOS[e.tipo].rotulo} · ${dataBR(e.data)} · há ${dias} ${pl(dias, "dia", "dias")}`}
                    valor={e.valor != null ? brl(e.valor) : null} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* ------------------------------- histórico ------------------------------- */}
      <Section title="Alterações por dia · últimos 30 dias"
        actions={(
          <div className="flex flex-wrap gap-1.5">
            {([["hoje", "Hoje", h.hoje], ["7d", "7 dias", h.ultimos7], ["30d", "30 dias", h.ultimos30]] as const).map(([p, r, n]) => (
              <Button key={p} type="button" tamanho="mini" variant="secondary" onClick={() => hist({ periodo: p })}>
                {r}: <span className="num">{carregando ?? contagem(n)}</span>
              </Button>
            ))}
          </div>
        )}>
        {isLoading ? <p className="py-10 text-center text-sm text-slate-500">Carregando o histórico…</p>
          : <BarrasPorDia dias={h.porDia} hoje={hoje} onDia={(dia) => hist({ periodo: "livre", de: dia, ate: dia })} />}
        <p className="mt-2 text-xs text-slate-500">Alterações e exclusões feitas pelas pessoas e pelo sistema (criar um registro não entra). Toque num dia para ver a lista.</p>
      </Section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Section title="Quem mais alterou · 30 dias" actions={<VerTudo onClick={() => hist()}>Ver histórico</VerTudo>}>
          <Ranking itens={h.pessoas.map((p) => ({ rotulo: p.nome, valor: p.n }))} formatar={contagem} cor="rgb(var(--modulo))"
            onClicar={(i) => hist({ pessoa: h.pessoas[i].nome })} vazio={isLoading ? "Carregando…" : "Nenhuma alteração no período."} />
        </Section>
        <Section title="Áreas mais alteradas · 30 dias" actions={<VerTudo onClick={() => hist()}>Ver histórico</VerTudo>}>
          <Ranking itens={h.tabelas.map((t) => ({ rotulo: t.rotulo, valor: t.n }))} formatar={contagem} cor="var(--serie-1)"
            onClicar={(i) => hist({ tabela: h.tabelas[i].tabela })} vazio={isLoading ? "Carregando…" : "Nenhuma alteração no período."} />
        </Section>
        <Section title="Exclusões recentes" actions={<VerTudo onClick={() => hist({ acao: "delete" })}>Ver todas</VerTudo>}>
          {!h.exclusoesRecentes.length ? <p className="py-4 text-center text-sm text-slate-500">{isLoading ? "Carregando…" : "Nenhuma exclusão nos últimos 30 dias."}</p> : (
            <ul className="space-y-1">
              {h.exclusoesRecentes.map((l) => {
                const v = l.antes?.valor ?? l.antes?.valor_total;
                return (
                  <li key={l.id}>
                    <ItemLista onClick={() => hist({ ids: [l.id] })}
                      titulo={<><span className="text-red-600">{rotuloTabela(l.tabela)}</span>{descricaoLinha(l, nomeRegistro) && <> · {descricaoLinha(l, nomeRegistro)}</>}</>}
                      detalhe={`${quem(l)} · ${quando(l.created_at)}${l.motivo ? ` · motivo: ${l.motivo}` : ""}`}
                      valor={v != null && v !== "" ? brl(Number(v)) : null} />
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
        <Section title="Maiores mudanças de valor · 30 dias">
          {!h.maioresMudancas.length ? <p className="py-4 text-center text-sm text-slate-500">{isLoading ? "Carregando…" : "Nenhum valor alterado nos últimos 30 dias."}</p> : (
            <ul className="space-y-1">
              {h.maioresMudancas.map((m) => (
                <li key={m.l.id}>
                  <ItemLista onClick={() => hist({ ids: [m.l.id] })}
                    titulo={<>{rotuloTabela(m.l.tabela)}{descricaoLinha(m.l, nomeRegistro) && <> · {descricaoLinha(m.l, nomeRegistro)}</>}</>}
                    detalhe={<>{ROTULO_CAMPO[m.campo] ?? m.campo.replace(/_/g, " ")}: <span className="num">{brl(m.antes)} → {brl(m.depois)}</span> · {quem(m.l)} · {quando(m.l.created_at)}</>}
                    valor={<span className={m.diferenca > 0 ? "text-emerald-700" : "text-red-600"}>{m.diferenca > 0 ? "+" : "−"} {brl(Math.abs(m.diferenca))}</span>} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function VerTudo({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="link-acao inline-flex items-center gap-0.5 text-xs">
      {children} <ChevronRight size={14} />
    </button>
  );
}

function Subtitulo({ children }: { children: ReactNode }) {
  return <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h3>;
}

function Aviso({ tom, onClick, children }: { tom: "ruim" | "neutro"; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`mt-3 flex w-full gap-2.5 rounded-xl border p-3 text-left text-sm transition hover:shadow-pop ${tom === "ruim" ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
      {tom === "ruim" ? <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" aria-hidden /> : <ClipboardCheck size={18} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />}
      <span className="min-w-0 text-slate-700">{children}</span>
    </button>
  );
}

/** Linha clicável das listas do painel: título, detalhe embaixo e valor à direita. */
function ItemLista({ titulo, detalhe, valor, onClick }: { titulo: ReactNode; detalhe: ReactNode; valor?: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="linha-clicavel flex items-start gap-2 px-2 py-1.5">
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-medium text-fg">{titulo}</span>
        <span className="block break-words text-xs text-slate-500">{detalhe}</span>
      </span>
      {valor && <span className="num shrink-0 pt-0.5 text-sm font-semibold text-fg">{valor}</span>}
      <ChevronRight size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden />
    </button>
  );
}

/** Barrinhas por dia (CSS puro): alteração na cor da área e exclusão em vermelho. Tocar num dia abre a lista daquele dia. */
function BarrasPorDia({ dias, hoje, onDia }: { dias: { dia: string; total: number; exclusoes: number }[]; hoje: string; onDia: (dia: string) => void }) {
  const max = Math.max(1, ...dias.map((d) => d.total));
  const soma = dias.reduce((s, d) => s + d.total, 0);
  const pico = dias.reduce((a, d) => (d.total > a.total ? d : a), dias[0]);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-modulo" aria-hidden /> Alterações</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" aria-hidden /> Exclusões</span>
        {soma > 0 && (
          <span className="sm:ml-auto">
            Maior dia: <button type="button" onClick={() => onDia(pico.dia)} className="link-acao">{diaMes(pico.dia)} ({contagem(pico.total)})</button>
            {" "}· média de {contagem(Math.round(soma / dias.length))} por dia
          </span>
        )}
      </div>
      <div className="flex h-36 items-end gap-px border-b border-slate-200 sm:gap-1" role="group" aria-label="Alterações por dia">
        {dias.map((d) => {
          const texto = `${diaMes(d.dia)}${d.dia === hoje ? " (hoje)" : ""}: ${contagem(d.total)} ${pl(d.total, "alteração", "alterações")}${d.exclusoes ? `, ${d.exclusoes} ${pl(d.exclusoes, "exclusão", "exclusões")}` : ""}`;
          return (
            <button key={d.dia} type="button" onClick={() => onDia(d.dia)} title={texto} aria-label={texto}
              className={`group flex h-full min-w-0 flex-1 flex-col justify-end rounded-t-md transition hover:bg-slate-100 ${d.dia === hoje ? "bg-slate-50" : ""}`}>
              {d.total > 0 && (
                <span className="flex w-full flex-col overflow-hidden rounded-t-[3px] opacity-90 transition group-hover:opacity-100"
                  style={{ height: `max(${(d.total / max) * 100}%, 3px)` }}>
                  {d.exclusoes > 0 && <span className="w-full bg-red-500" style={{ flexGrow: d.exclusoes, minHeight: 2 }} />}
                  {d.total > d.exclusoes && <span className="w-full bg-modulo" style={{ flexGrow: d.total - d.exclusoes }} />}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-2xs text-slate-500">
        <span>{diaMes(dias[0].dia)}</span><span>{diaMes(dias[Math.floor(dias.length / 2)].dia)}</span><span>hoje</span>
      </div>
    </div>
  );
}
