// Painel do Teste do giga: testes no período, aprovadas de primeira (first pass yield), reprovações por tipo de teste,
// máquinas aguardando reteste, aprovadas × reprovadas mês a mês, por modelo e por operador. Tocar num modelo filtra.
import { useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, ClipboardCheck, RotateCcw, XCircle } from "lucide-react";
import { Section } from "@/components/ui";
import { Colunas, Ranking } from "@/components/Charts";
import { CartaoPainel, dentro, FiltrosAtivos, intervalos, PERIODOS, usePeriodo, variacao, type Cartao } from "@/components/painel/Painel";
import { pl } from "@/lib/format";
import {
  agrupar, aguardandoReteste, dataHoraBR, diaBrasil, falhas, mesBrasil, mesesAte, primeiraPassagem, primeirosTestes, reprovacoesPorTipo,
  rotuloTipo, serieMensal, TIPOS_TESTE, validos, aprovada, type Grupo, type TesteGiga,
} from "@/lib/testeGiga";
import type { ContextoGiga } from "./tipos";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (am: string) => `${MESES[Number(am.slice(5, 7)) - 1]}/${am.slice(2, 4)}`;
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
const qtd = (v: number) => v.toLocaleString("pt-BR");
const detalheGrupo = (g: Grupo) =>
  `${g.aprovadas} ${pl(g.aprovadas, "aprovada", "aprovadas")} · ${g.reprovadas} ${pl(g.reprovadas, "reprovada", "reprovadas")}${g.fpy != null ? ` · ${pct(g.fpy)} de primeira` : ""}`;

export function PainelGiga({ ctx, onReteste, onVerRegistros }: {
  ctx: ContextoGiga; onReteste: (t: TesteGiga) => void; onVerRegistros: (filtro: { resultado?: "reprovada" }) => void;
}) {
  const [periodo, setPeriodo] = usePeriodo("testegiga");
  const [fModelo, setFModelo] = useState<string | null>(null);
  const per = PERIODOS.find((p) => p.id === periodo)!;

  const k = useMemo(() => {
    const { atual, anterior } = intervalos(periodo);
    const todos = validos(ctx.testes).filter((t) => !fModelo || t.produto_id === fModelo);
    const no = (f: [string, string]) => todos.filter((t) => dentro(diaBrasil(t.testado_em), f));
    const doPer = no(atual), ant = no(anterior);
    const prim = primeirosTestes(validos(ctx.testes));
    const fpy = primeiraPassagem(todos, atual), fpyAnt = primeiraPassagem(todos, anterior);
    const reprovadas = doPer.filter((t) => !aprovada(t));
    const meses = mesesAte(mesBrasil(new Date().toISOString()), 12);
    return {
      testes: doPer.length, dTestes: variacao(doPer.length, ant.length),
      maquinas: new Set(doPer.map((t) => t.numero_serie)).size, retestes: doPer.filter((t) => (t.tentativa ?? 1) > 1).length,
      fpy, fpyAnt,
      reprovadas: reprovadas.length, dReprovadas: variacao(reprovadas.length, ant.filter((t) => !aprovada(t)).length),
      porTipo: reprovacoesPorTipo(doPer),
      aguardando: aguardandoReteste(todos),
      serie: serieMensal(todos, meses),
      porModelo: agrupar(validos(ctx.testes).filter((t) => dentro(diaBrasil(t.testado_em), atual)), (t) => t.produto_id, ctx.nomeMaquina, prim),
      porOperador: agrupar(doPer, (t) => t.operador_nome, (x) => x, prim),
      foraDoLimite: doPer.filter((t) => t.divergencias?.length),
    };
  }, [ctx.testes, ctx.nomeMaquina, periodo, fModelo]);

  const nomeFiltro = fModelo ? ctx.nomeMaquina(fModelo) : null;
  const cartoes: Cartao[] = [
    { id: "testes", rotulo: "Testes no período", valor: qtd(k.testes), icone: ClipboardCheck, cor: "var(--kpi-azul)", delta: k.dTestes,
      sub: `${k.maquinas} ${pl(k.maquinas, "máquina", "máquinas")}${k.retestes ? ` · ${k.retestes} ${pl(k.retestes, "reteste", "retestes")}` : ""}` },
    { id: "fpy", rotulo: "Aprovadas de primeira", valor: pct(k.fpy.pct), icone: BadgeCheck, cor: "var(--kpi-verde)",
      sub: k.fpy.maquinas ? `${k.fpy.dePrimeira} de ${k.fpy.maquinas} ${pl(k.fpy.maquinas, "máquina", "máquinas")} no 1º teste${k.fpyAnt.pct != null ? ` · ${per.anterior}: ${pct(k.fpyAnt.pct)}` : ""}` : "nenhuma máquina testada pela 1ª vez",
      titulo: "First pass yield: das máquinas testadas pela primeira vez no período, quantas passaram nos três testes logo no primeiro teste" },
    { id: "reprovadas", rotulo: "Reprovações", valor: qtd(k.reprovadas), icone: XCircle, cor: "var(--kpi-rosa)", delta: k.dReprovadas, bomCair: true,
      sub: TIPOS_TESTE.map((t) => `${t.curto} ${k.porTipo[t.id]}`).join(" · "), onClick: () => onVerRegistros({ resultado: "reprovada" }) },
    { id: "aguardando", rotulo: "Aguardando reteste", valor: qtd(k.aguardando.length), icone: RotateCcw, cor: "var(--kpi-laranja)",
      sub: k.aguardando.length ? `a mais antiga desde ${dataHoraBR(k.aguardando[0].ultimo.testado_em).slice(0, 10)}` : "nenhuma máquina parada no teste",
      titulo: "Máquinas cujo último teste foi reprovado (todas as datas)" },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex justify-end">
        <div role="tablist" aria-label="Período" className="grid w-full grid-cols-5 gap-0.5 rounded-xl border border-slate-200 bg-surface p-1 shadow-card sm:inline-grid sm:w-auto">
          {PERIODOS.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={periodo === p.id} onClick={() => setPeriodo(p.id)}
              className={`min-h-[36px] whitespace-nowrap rounded-lg px-2.5 text-[13px] font-bold transition sm:px-3 ${periodo === p.id ? "bg-modulo-escuro text-white shadow" : "text-slate-600 hover:bg-slate-100"}`}>
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>

      {nomeFiltro && <FiltrosAtivos filtros={[{ rotulo: "Modelo", valor: nomeFiltro, limpar: () => setFModelo(null) }]} onLimpar={() => setFModelo(null)} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {cartoes.map((c) => <CartaoPainel key={c.id} c={c} anterior={per.anterior} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Section title="Aprovadas × reprovadas por mês" className="xl:col-span-3" actions={<span className="text-xs text-slate-500">últimos 12 meses · retestes contam</span>}>
          <Colunas dados={k.serie.map((s) => ({ rotulo: rotuloMes(s.mes), valores: [s.aprovadas, s.reprovadas] }))} altura={250} inteiro formatar={qtd}
            vazio="Nenhum teste nos últimos 12 meses." series={[{ nome: "Aprovadas", cor: "var(--kpi-verde)" }, { nome: "Reprovadas", cor: "var(--kpi-rosa)" }]} />
        </Section>
        <Section title="Reprovações por tipo de teste" className="xl:col-span-2" actions={<span className="text-xs text-slate-500">no período</span>}>
          <Ranking cor="var(--kpi-rosa)" formatar={qtd} vazio="Nenhuma reprovação no período."
            itens={k.reprovadas ? TIPOS_TESTE.map((t) => ({ rotulo: t.rotulo, valor: k.porTipo[t.id], detalhe: k.reprovadas ? `${pct((k.porTipo[t.id] / k.reprovadas) * 100)} das reprovações` : undefined })) : []} />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Por modelo" actions={<span className="text-xs text-slate-500">toque para filtrar</span>}>
          <Ranking cor="var(--serie-1)" formatar={(v) => `${qtd(v)} ${pl(v, "teste", "testes")}`} vazio="Nenhum teste no período."
            ativo={nomeFiltro} onClicar={(i) => setFModelo(fModelo === k.porModelo[i].chave ? null : k.porModelo[i].chave)}
            itens={k.porModelo.map((g) => ({ rotulo: g.rotulo, valor: g.testes, detalhe: detalheGrupo(g) }))} />
        </Section>
        <Section title="Por operador">
          <Ranking cor="var(--serie-3)" formatar={(v) => `${qtd(v)} ${pl(v, "teste", "testes")}`} vazio="Nenhum teste no período."
            itens={k.porOperador.map((g) => ({ rotulo: g.rotulo, valor: g.testes, detalhe: detalheGrupo(g) }))} />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title={`Aguardando reteste (${k.aguardando.length})`}>
          {!k.aguardando.length ? <p className="py-6 text-center text-sm text-slate-500">Nenhuma máquina esperando reteste ✅</p> : (
            <ul className="divide-y divide-slate-100">
              {k.aguardando.slice(0, 12).map((s) => (
                <li key={s.ns} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="num block font-semibold text-fg">{s.ns} <span className="font-normal text-slate-500">· {ctx.nomeMaquina(s.ultimo.produto_id)}</span></span>
                    <span className="block text-xs text-slate-500">
                      {dataHoraBR(s.ultimo.testado_em)} · {s.tentativas}ª tentativa · reprovou em {falhas(s.ultimo).map(rotuloTipo).join(", ").toLowerCase()}
                    </span>
                  </span>
                  {ctx.podeLancar && (
                    <button type="button" onClick={() => onReteste(s.ultimo)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-semibold text-fg hover:bg-slate-50">
                      <RotateCcw size={14} aria-hidden /> Lançar reteste
                    </button>
                  )}
                </li>
              ))}
              {k.aguardando.length > 12 && <li className="pt-2 text-center text-xs text-slate-500">e mais {k.aguardando.length - 12}</li>}
            </ul>
          )}
        </Section>
        <Section title="Aprovadas com medida fora do limite">
          {!k.foraDoLimite.length ? <p className="py-6 text-center text-sm text-slate-500">Nenhuma no período ✅</p> : (
            <ul className="space-y-2">
              {k.foraDoLimite.slice(0, 8).map((t) => (
                <li key={t.id} className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <b className="num">{t.numero_serie}</b> · nº {t.numero} · {dataHoraBR(t.testado_em)}
                    <span className="block text-xs">{(t.divergencias ?? []).join("; ")}{t.observacoes ? ` — ${t.observacoes}` : ""}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <p className="text-xs text-slate-500">
        Aprovadas de primeira (first pass yield): das máquinas testadas pela primeira vez no período, a parte que passou nos três testes já no
        primeiro teste. Retestes contam nos gráficos, mas não nessa porcentagem. Lançamentos anulados ficam fora das contas.
      </p>
    </div>
  );
}
