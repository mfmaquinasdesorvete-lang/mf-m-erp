// Painel de Pós-venda: ordens de serviço que entraram e saíram, quanto tempo leva o conserto, quem está consertando,
// o que está parado (peça, aprovação do cliente, retirada) e as garantias e preventivas das máquinas vendidas.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlarmClock, BellRing, CircleDollarSign, Clock, FileText, Hourglass, PackageCheck, Plus, ShieldCheck, ShieldOff, Timer, Users, Wrench,
} from "lucide-react";
import { Badge, Section } from "@/components/ui";
import { Colunas, Ranking, Rosca } from "@/components/Charts";
import {
  AtalhosArea, baldes, CabecalhoPainel, CartaoPainel, dentro, FiltrosAtivos, frasePeriodo, intervalos, ListaAtencao, PERIODOS, usePeriodo, variacao,
  type Cartao, type ItemAtencao,
} from "@/components/painel/Painel";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { usePerfil } from "@/lib/auth";
import { brl, dataBR, hoje, somarDias, pl } from "@/lib/format";
import { situacaoGarantia, situacaoPreventiva } from "@/lib/garantia";
import type { Equipamento, OrdemServico } from "@/lib/types";

// o mesmo select da tela de assistência: a lista carregada serve aos dois
const SELECT = "*, cliente:clientes(*), itens:os_itens(*)";
type OS = OrdemServico & { concluida_em?: string | null };
const ABERTA = (o: OS) => !["concluida", "entregue", "cancelada"].includes(o.status);
const FEITA = (o: OS) => ["concluida", "entregue"].includes(o.status);
const tecnicoDe = (o: OS) => o.tecnico?.trim() || "Sem técnico";
const dias = (de: string, ate: string) => Math.max(0, Math.round((Date.parse(ate.slice(0, 10) + "T12:00:00Z") - Date.parse(de.slice(0, 10) + "T12:00:00Z")) / 864e5));
const ETAPAS: { rotulo: string; status: string[]; cor: string }[] = [
  { rotulo: "Na bancada", status: ["aberta", "em_diagnostico", "em_reparo"], cor: "var(--serie-1)" },
  { rotulo: "Esperando peça", status: ["aguardando_peca"], cor: "var(--serie-2)" },
  { rotulo: "Esperando o cliente aprovar", status: ["aguardando_aprovacao"], cor: "var(--kpi-roxo)" },
  { rotulo: "Pronta para retirar", status: ["concluida"], cor: "var(--serie-3)" },
];

export default function PainelPosVenda() {
  const navigate = useNavigate();
  const { pode, podeVer } = usePerfil();
  const { filtrar } = useUnidade();
  const { data: osTodas = [], isLoading } = useRows<OS>("ordens_servico", { select: SELECT });
  const { data: eqTodos = [] } = useRows<Equipamento>("equipamentos", { order: "data_venda" });
  const { data: lembretes = [] } = useRows<{ id: string }>("lembretes_manutencao", { select: "id", order: "id" });
  const [periodo, setPeriodo] = usePeriodo("posvenda");
  const [fTecnico, setFTecnico] = useState<string | null>(null);
  const [fEtapa, setFEtapa] = useState<string | null>(null);
  const per = PERIODOS.find((p) => p.id === periodo)!;
  const dia = hoje();

  const todas = filtrar(osTodas);
  const ordens = useMemo(() => todas.filter((o) => !fTecnico || tecnicoDe(o) === fTecnico), [todas, fTecnico]);
  const equipamentos = filtrar(eqTodos);

  const k = useMemo(() => {
    const { atual, anterior } = intervalos(periodo);
    const bs = baldes(periodo);
    const entraram = (f: [string, string]) => ordens.filter((o) => o.status !== "cancelada" && dentro(o.data_entrada, f));
    const prontas = (f: [string, string]) => ordens.filter((o) => FEITA(o) && dentro(o.concluida_em, f));
    const eAtual = entraram(atual), eAnt = entraram(anterior);
    const pAtual = prontas(atual), pAnt = prontas(anterior);
    const tempo = (l: OS[]) => { const c = l.filter((o) => o.concluida_em); return c.length ? c.reduce((s, o) => s + dias(o.data_entrada, o.concluida_em!), 0) / c.length : 0; };
    const receita = (l: OS[]) => l.filter((o) => !o.em_garantia).reduce((s, o) => s + Number(o.valor_total ?? 0), 0);
    const abertas = ordens.filter(ABERTA);

    const tecnicos = new Map<string, { qtd: number; dias: number; abertas: number }>();
    for (const o of todas) {
      const t = tecnicoDe(o);
      const v = tecnicos.get(t) ?? { qtd: 0, dias: 0, abertas: 0 };
      if (FEITA(o) && dentro(o.concluida_em, atual)) { v.qtd++; v.dias += o.concluida_em ? dias(o.data_entrada, o.concluida_em) : 0; }
      if (ABERTA(o)) v.abertas++;
      if (v.qtd || v.abertas) tecnicos.set(t, v);
    }
    const modelos = new Map<string, number>();
    for (const o of eAtual) modelos.set(o.equipamento, (modelos.get(o.equipamento) ?? 0) + 1);

    const naEtapa = (st: string[]) => ordens.filter((o) => st.includes(o.status));
    return {
      entraram: eAtual.length, dEntraram: variacao(eAtual.length, eAnt.length),
      prontas: pAtual.length, dProntas: variacao(pAtual.length, pAnt.length),
      tempo: tempo(pAtual), dTempo: tempo(pAnt) ? variacao(tempo(pAtual), tempo(pAnt)) : undefined,
      receita: receita(pAtual), dReceita: variacao(receita(pAtual), receita(pAnt)),
      garantiaNoPeriodo: pAtual.filter((o) => o.em_garantia).length,
      abertas, atrasadas: abertas.filter((o) => o.previsao && o.previsao < dia),
      serie: bs.map((b) => ({ rotulo: b.rotulo, valores: [entraram(b.atual).length, prontas(b.atual).length] })),
      tendEntraram: bs.map((b) => entraram(b.atual).length), tendProntas: bs.map((b) => prontas(b.atual).length),
      tendReceita: bs.map((b) => receita(prontas(b.atual))),
      etapas: ETAPAS.map((e) => ({ ...e, lista: naEtapa(e.status) })),
      tecnicos: [...tecnicos.entries()].sort((a, b) => b[1].qtd - a[1].qtd || b[1].abertas - a[1].abertas),
      modelos: [...modelos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
      paradasRetirada: ordens.filter((o) => o.status === "concluida" && o.concluida_em && o.concluida_em.slice(0, 10) <= somarDias(-7)),
    };
  }, [periodo, ordens, todas, dia]);

  const g = useMemo(() => ({
    em: equipamentos.filter((e) => situacaoGarantia(e.garantia_ate) === "em_garantia").length,
    vence: equipamentos.filter((e) => situacaoGarantia(e.garantia_ate) === "vence_logo").length,
    fora: equipamentos.filter((e) => situacaoGarantia(e.garantia_ate) === "fora_garantia").length,
    prevAtrasada: equipamentos.filter((e) => situacaoPreventiva(e.proxima_preventiva) === "atrasada").length,
    prevProxima: equipamentos.filter((e) => situacaoPreventiva(e.proxima_preventiva) === "proxima").length,
  }), [equipamentos]);

  const cartoes: Cartao[] = [
    { id: "abertas", rotulo: "OS em andamento", valor: k.abertas.length, icone: Wrench, cor: "var(--kpi-laranja)",
      sub: k.atrasadas.length ? `${k.atrasadas.length} com a entrega atrasada` : "nenhuma atrasada", onClick: () => navigate("/assistencia") },
    { id: "entraram", rotulo: "Entraram", valor: k.entraram, icone: Clock, cor: "var(--kpi-azul)", delta: k.dEntraram, bomCair: true, tendencia: k.tendEntraram,
      sub: "máquinas recebidas para conserto" },
    { id: "prontas", rotulo: "Consertadas", valor: k.prontas, icone: PackageCheck, cor: "var(--kpi-verde)", delta: k.dProntas, tendencia: k.tendProntas,
      sub: k.prontas ? `em média ${k.tempo.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${pl(Math.round(k.tempo * 10) / 10, "dia", "dias")} na bancada` : "nenhuma concluída no período",
      ...(k.dTempo != null ? { titulo: `tempo médio ${k.dTempo <= 0 ? "menor" : "maior"} que ${per.anterior}` } : {}) },
    { id: "receita", rotulo: "Faturado em serviços", valor: brl(k.receita), icone: CircleDollarSign, cor: "var(--kpi-roxo)", delta: k.dReceita, tendencia: k.tendReceita,
      sub: k.garantiaNoPeriodo ? `+ ${k.garantiaNoPeriodo} OS em garantia (sem cobrança)` : "OS fora da garantia" },
  ];

  const atencao: ItemAtencao[] = [
    k.atrasadas.length > 0 && { icone: AlarmClock, cor: "var(--kpi-rosa)", texto: `${k.atrasadas.length} OS com a entrega atrasada`, sub: k.atrasadas.slice(0, 3).map((o) => `#${o.numero} ${o.cliente?.nome ?? ""}`).join(" · "), to: "/assistencia" },
    k.etapas[2].lista.length > 0 && { icone: Hourglass, cor: "var(--kpi-roxo)", texto: `${k.etapas[2].lista.length} ${pl(k.etapas[2].lista.length, "orçamento", "orçamentos")} de conserto esperando o cliente aprovar`, sub: "vale ligar ou mandar WhatsApp", to: "/assistencia" },
    k.etapas[1].lista.length > 0 && { icone: Clock, cor: "var(--kpi-laranja)", texto: `${k.etapas[1].lista.length} OS esperando peça`, sub: "confira os pedidos de compra", to: "/compras", state: { aba: "compras" } },
    k.paradasRetirada.length > 0 && { icone: PackageCheck, cor: "var(--kpi-ciano)", texto: `${k.paradasRetirada.length} ${pl(k.paradasRetirada.length, "máquina", "máquinas")} prontas há mais de 7 dias sem retirada`, to: "/assistencia" },
    g.prevAtrasada > 0 && { icone: BellRing, cor: "var(--kpi-rosa)", texto: `${g.prevAtrasada} ${pl(g.prevAtrasada, "preventiva", "preventivas")} ${pl(g.prevAtrasada, "atrasada", "atrasadas")}`, sub: lembretes.length ? `${lembretes.length} ${pl(lembretes.length, "cliente", "clientes")} para lembrar` : undefined, to: "/garantias", state: { lembretes: true } },
    g.vence > 0 && { icone: ShieldCheck, cor: "var(--kpi-laranja)", texto: `${g.vence} ${pl(g.vence, "garantia", "garantias")} vencendo em 30 dias`, sub: "oportunidade de contrato de manutenção", to: "/garantias" },
  ].filter(Boolean) as ItemAtencao[];

  const etapaAtiva = k.etapas.find((e) => e.rotulo === fEtapa);
  const listaAbertas = (etapaAtiva ? etapaAtiva.lista : [...k.abertas, ...k.etapas[3].lista])
    .sort((a, b) => (a.previsao ?? "9999").localeCompare(b.previsao ?? "9999")).slice(0, 8);

  const resumo = isLoading ? "Carregando…"
    : <>{k.abertas.length} OS em andamento{k.atrasadas.length ? `, ${k.atrasadas.length} ${pl(k.atrasadas.length, "atrasada", "atrasadas")}` : ""} · {k.prontas} {pl(k.prontas, "consertada", "consertadas")} {periodo === "hoje" ? "hoje" : "no período"}{frasePeriodo(k.dProntas, periodo) ? ` (${frasePeriodo(k.dProntas, periodo)})` : ""}.</>;

  const filtros = [
    fTecnico && { rotulo: "Técnico", valor: fTecnico, limpar: () => setFTecnico(null) },
    fEtapa && { rotulo: "Situação", valor: fEtapa, limpar: () => setFEtapa(null) },
  ].filter(Boolean) as { rotulo: string; valor: string; limpar: () => void }[];

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPainel icone={Wrench} area="Pós-venda" titulo="Como está a assistência" resumo={resumo} periodo={periodo} onPeriodo={setPeriodo}
        acoes={pode("editar_os") && (
          <button type="button" onClick={() => navigate("/assistencia", { state: { novaOS: {} } })}
            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-white px-3.5 text-sm font-bold text-modulo-texto shadow hover:bg-white/90">
            <Plus size={16} /> Nova OS
          </button>
        )} />

      <FiltrosAtivos filtros={filtros} onLimpar={() => { setFTecnico(null); setFEtapa(null); }} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {cartoes.map((c) => <CartaoPainel key={c.id} c={c} anterior={per.anterior} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Section title={periodo === "ano" ? "Entraram x consertadas, mês a mês" : "Entraram x consertadas"} className="xl:col-span-3">
          <Colunas dados={k.serie} altura={250} formatar={(v) => `${v} OS`} inteiro vazio="Nenhuma OS entrou nem saiu no período."
            series={[{ nome: "Entraram", cor: "var(--serie-1)" }, { nome: "Consertadas", cor: "var(--serie-3)" }]} />
        </Section>
        <Section title="Onde estão as máquinas agora" className="xl:col-span-2" actions={<span className="text-xs text-slate-500">toque para ver</span>}>
          <Rosca total="Na oficina" formatar={(v) => `${v} OS`} ativo={fEtapa}
            onClicar={(i) => { const r = k.etapas[i].rotulo; setFEtapa(fEtapa === r ? null : r); }}
            fatias={k.etapas.map((e) => ({ rotulo: e.rotulo, valor: e.lista.length, cor: e.cor }))} />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Section title={etapaAtiva ? `OS · ${etapaAtiva.rotulo}` : "OS na oficina (pela data prometida)"} className="xl:col-span-3"
          actions={<button type="button" onClick={() => navigate("/assistencia")} className="text-sm font-semibold text-modulo-texto hover:underline">Ver todas</button>}>
          {listaAbertas.length ? (
            <ul className="divide-y divide-slate-100">
              {listaAbertas.map((o) => {
                const atrasada = o.previsao && o.previsao < dia && ABERTA(o);
                return (
                  <li key={o.id}>
                    <button type="button" onClick={() => navigate("/assistencia", { state: { abrir: o.id } })}
                      className="flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition hover:bg-slate-50">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${atrasada ? "bg-red-50 text-red-600" : "bg-modulo/10 text-modulo-texto"}`}><Wrench size={17} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-fg">#{o.numero} · {o.cliente?.nome_fantasia || o.cliente?.nome}</span>
                        <span className="block truncate text-xs text-slate-500">{o.equipamento} · {tecnicoDe(o)} · entrou {dataBR(o.data_entrada)}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className={`text-xs font-semibold ${atrasada ? "text-red-600" : "text-slate-500"}`}>{o.previsao ? `${atrasada ? "atrasada · " : "até "}${dataBR(o.previsao)}` : "sem previsão"}</span>
                        <Badge value={o.status} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="py-8 text-center text-sm text-slate-500">Nenhuma OS aqui. ✅</p>}
        </Section>
        <Section title="Precisa de atenção" className="xl:col-span-2">
          <ListaAtencao itens={atencao} vazio="Nada parado na assistência" />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Section title="Técnicos" actions={<span className="text-xs text-slate-500">toque para filtrar</span>}>
          <Ranking ativo={fTecnico} cor="var(--serie-3)" formatar={(v) => `${v} OS`} vazio="Nenhuma OS no período."
            onClicar={(i) => { const t = k.tecnicos[i][0]; setFTecnico(fTecnico === t ? null : t); }}
            itens={k.tecnicos.map(([nome, v]) => ({ rotulo: nome, valor: v.qtd, detalhe: `${v.abertas} em andamento${v.qtd ? ` · ${(v.dias / v.qtd).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${pl(Math.round((v.dias / v.qtd) * 10) / 10, "dia", "dias")} por conserto` : ""}` }))} />
        </Section>
        <Section title="Máquinas que mais voltam">
          <Ranking cor="var(--serie-2)" formatar={(v) => `${v} OS`} vazio="Nenhuma máquina entrou no período."
            itens={k.modelos.map(([modelo, n]) => ({ rotulo: modelo, valor: n }))} />
          <p className="mt-2 text-xs text-slate-500">Modelos que entraram para conserto no período: ajuda a ver defeito de fábrica.</p>
        </Section>
        <Section title="Garantias e preventivas" className="md:col-span-2 xl:col-span-1"
          actions={<button type="button" onClick={() => navigate("/garantias")} className="text-sm font-semibold text-modulo-texto hover:underline">Abrir</button>}>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icone: ShieldCheck, cor: "var(--kpi-verde)", rotulo: "Em garantia", n: g.em, state: undefined },
              { icone: ShieldCheck, cor: "var(--kpi-laranja)", rotulo: "Vencem em 30 dias", n: g.vence, state: undefined },
              { icone: ShieldOff, cor: "var(--eixo-texto)", rotulo: "Fora da garantia", n: g.fora, state: undefined },
              { icone: AlarmClock, cor: "var(--kpi-rosa)", rotulo: "Preventiva atrasada", n: g.prevAtrasada, state: { lembretes: true } },
            ].map((x) => (
              <button key={x.rotulo} type="button" onClick={() => navigate("/garantias", { state: x.state })}
                className="flex items-center gap-2.5 rounded-xl border border-slate-100 p-2.5 text-left transition hover:border-slate-200 hover:bg-slate-50">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${x.cor} 16%, transparent)`, color: x.cor }}><x.icone size={17} /></span>
                <span className="min-w-0"><span className="num block text-lg font-bold leading-none text-fg">{x.n}</span><span className="mt-0.5 block text-xs leading-tight text-slate-500">{x.rotulo}</span></span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">{g.prevProxima} {pl(g.prevProxima, "preventiva", "preventivas")} nos próximos 30 dias.</p>
        </Section>
      </div>

      <div className="space-y-3">
        <h2 className="flex items-center gap-2 px-1 text-sm font-bold text-fg"><span className="h-4 w-1 rounded-full bg-modulo" aria-hidden />Ir para</h2>
        <AtalhosArea itens={[
          { rotulo: "Assistência técnica", icone: Wrench, to: "/assistencia", aviso: k.atrasadas.length, tela: "assistencia" },
          { rotulo: "Garantias e manutenção", icone: ShieldCheck, to: "/garantias", tela: "garantias" },
          { rotulo: "Lembrar clientes", icone: BellRing, to: "/garantias", state: { lembretes: true }, aviso: lembretes.length, tela: "garantias" },
          { rotulo: "Notas de serviço", icone: FileText, to: "/notas", state: { aba: "nfse" }, tela: "notas" },
          { rotulo: "Clientes", icone: Users, to: "/clientes", tela: "clientes" },
          ...(podeVer("producao") ? [{ rotulo: "Peças (compras)", icone: Timer, to: "/compras", state: { aba: "compras" } }] : []),
        ]} />
      </div>
    </div>
  );
}
