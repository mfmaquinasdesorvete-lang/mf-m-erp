// Painel das máquinas: quantas vendemos e de quais modelos, quanto há pronto e em montagem de cada modelo (e para
// quantos meses dá no ritmo de venda), onde estão as máquinas vendidas, garantias e preventivas, e quais modelos mais
// voltam para a assistência. Tocar num modelo (ranking ou tabela) filtra o painel inteiro. Máquinas reprovadas no teste do
// giga (REG-006) esperando reteste entram em "Precisa de atenção".
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlarmClock, BadgeDollarSign, CalendarClock, Factory, Hash, MapPin, PackageX, PlugZap, ShieldAlert, ShieldCheck, ShoppingCart, TrendingDown,
  Warehouse, Wrench,
} from "lucide-react";
import { Section } from "@/components/ui";
import { Colunas, Ranking, Rosca } from "@/components/Charts";
import {
  AtalhosArea, baldes, CabecalhoPainel, CartaoPainel, dentro, FiltrosAtivos, frasePeriodo, intervalos, ListaAtencao, PERIODOS, usePeriodo, variacao,
  type Cartao, type ItemAtencao,
} from "@/components/painel/Painel";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje, somarDias, pl } from "@/lib/format";
import { situacaoGarantia, situacaoPreventiva } from "@/lib/garantia";
import { vendasDaEmpresa } from "@/lib/gerencial";
import { diasDeEstoque, linhasVendidas, margemPct, SELECT_CLIENTES_VENDAS, SELECT_NOTAS_VENDAS, SELECT_PEDIDOS_VENDAS } from "@/lib/paineisProdutos";
import type { Cliente, Equipamento, OrdemProducao, OrdemServico, Produto } from "@/lib/types";
import { useVisivel } from "@/lib/menu";
import { aguardandoReteste } from "@/lib/testeGiga";
import { useTestesGiga } from "@/lib/testeGigaDados";

const CORES = ["var(--serie-1)", "var(--serie-3)", "var(--serie-2)", "var(--kpi-roxo)", "var(--kpi-rosa)", "var(--kpi-ciano)", "var(--eixo-texto)"];
const un = (v: number) => `${v.toLocaleString("pt-BR")} máq.`;
const modeloDe = (p?: Produto | null) => p?.modelo?.trim() || p?.descricao || "Máquina";
const ABERTA = (o: OrdemProducao) => ["planejada", "em_producao"].includes(o.status);
const soma = (l: { quantidade: number }[]) => l.reduce((s, x) => s + x.quantidade, 0);
const valor = (l: { valor: number }[]) => l.reduce((s, x) => s + x.valor, 0);

type Situacao = { texto: string; cor: string; ordem: number };
const SIT: Record<string, Situacao> = {
  falta: { texto: "Sem máquina", cor: "bg-solido-vermelho text-white", ordem: 0 },
  repor: { texto: "Produzir", cor: "bg-amber-100 text-amber-800", ordem: 1 },
  ok: { texto: "Em dia", cor: "bg-emerald-100 text-emerald-800", ordem: 2 },
  parado: { texto: "Parado", cor: "bg-slate-200 text-slate-700", ordem: 3 },
  sem: { texto: "Sem estoque e sem venda", cor: "bg-slate-100 text-slate-500", ordem: 4 },
};

export default function PainelMaquinas() {
  const navigate = useNavigate();
  const { filtrar, atual: unidade } = useUnidade();
  const { data: pedidos = [], isLoading } = useRows<any>("pedidos", { select: SELECT_PEDIDOS_VENDAS, key: ["gerencial"] });
  const { data: notas = [] } = useRows<any>("notas_fiscais", { select: SELECT_NOTAS_VENDAS, key: ["gerencial"] });
  // clientes: para achar o cliente das notas do sistema anterior (pelo CNPJ/CPF) e o estado de cada máquina vendida
  const { data: clientes = [] } = useRows<Cliente>("clientes", { select: SELECT_CLIENTES_VENDAS, key: ["gerencial"] });
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: saldos = [] } = useRows<{ produto_id: string; unidade_id: string; quantidade: number }>("estoque_unidade", { order: "produto_id" });
  const { data: opsTodas = [] } = useRows<OrdemProducao>("ordens_producao", { select: "*, produto:produtos(*)" });
  // mesmos selects das telas de garantias e de assistência
  const { data: eqTodos = [] } = useRows<Equipamento>("equipamentos", { select: "*, cliente:clientes(*)", order: "data_venda" });
  const { data: osTodas = [] } = useRows<OrdemServico>("ordens_servico", { select: "*, cliente:clientes(*), itens:os_itens(*)" });
  const [periodo, setPeriodo] = usePeriodo("maquinas");
  const [fModelo, setFModelo] = useState<string | null>(null);
  // teste do giga: só para quem vê a tela (técnico, financeiro e administrador)
  const verGiga = useVisivel().ve("testegiga", "/teste-giga");
  const { data: giga } = useTestesGiga(verGiga);
  const gigaReteste = useMemo(() => aguardandoReteste((giga?.linhas ?? []).filter((t) => !fModelo || t.produto_id === fModelo)), [giga, fModelo]);
  const per = PERIODOS.find((p) => p.id === periodo)!;
  const dia = hoje();

  const maquinas = useMemo(() => produtos.filter((p) => p.tipo === "maquina"), [produtos]);
  const porId = useMemo(() => new Map(maquinas.map((p) => [p.id, p])), [maquinas]);
  const saldoUnidade = useMemo(() => new Map(saldos.filter((s) => s.unidade_id === unidade).map((s) => [s.produto_id, Number(s.quantidade)])), [saldos, unidade]);
  const qtd = (p: Produto) => Math.max(0, unidade ? saldoUnidade.get(p.id) ?? 0 : Number(p.estoque_atual ?? 0));

  // todas as vendas de máquinas (pedidos do ERP + notas do sistema anterior), uma vez só
  const vendidas = useMemo(() => {
    const vendas = vendasDaEmpresa(filtrar(pedidos), filtrar(notas), clientes);
    return linhasVendidas(vendas, produtos).filter((l) => l.produtoId && porId.has(l.produtoId));
  }, [pedidos, notas, clientes, produtos, porId, filtrar]);
  const ufCliente = useMemo(() => new Map(clientes.map((c) => [c.id, c.uf?.trim().toUpperCase() || "Sem UF"])), [clientes]);

  const ops = filtrar(opsTodas).filter((o) => porId.has(o.produto_id));
  const equipamentos = filtrar(eqTodos);
  const oss = filtrar(osTodas);

  const k = useMemo(() => {
    const { atual, anterior } = intervalos(periodo);
    const bs = baldes(periodo);
    const doModelo = <T,>(l: T[], id: (x: T) => string | null | undefined) => (fModelo ? l.filter((x) => id(x) === fModelo) : l);
    const linhas = doModelo(vendidas, (l) => l.produtoId);
    const em = (f: [string, string]) => linhas.filter((l) => dentro(l.data, f));
    const vAtual = em(atual), vAnt = em(anterior);

    // modelo a modelo: estoque, montagem, ritmo de venda (90 dias) e para quantos dias dá
    const corte90 = somarDias(-89);
    const montando = new Map<string, number>();
    for (const o of ops.filter(ABERTA)) montando.set(o.produto_id, (montando.get(o.produto_id) ?? 0) + Number(o.quantidade ?? 0));
    const modelos = maquinas.map((p) => {
      const daqui = vendidas.filter((l) => l.produtoId === p.id);
      const v90 = daqui.filter((l) => l.data >= corte90);
      const q90 = soma(v90);
      const estoque = qtd(p), montagem = montando.get(p.id) ?? 0;
      const precoMedio = q90 ? valor(v90) / q90 : Number(p.preco_venda ?? 0);
      const diasDa = diasDeEstoque(estoque + montagem, q90);
      const sit = estoque + montagem === 0 ? (q90 > 0 ? "falta" : "sem")
        : q90 === 0 ? "parado"
        : (diasDa ?? 999) < 30 || (Number(p.estoque_minimo) > 0 && estoque <= Number(p.estoque_minimo)) ? "repor" : "ok";
      return {
        p, nome: modeloDe(p), estoque, montagem, q90, noPeriodo: soma(daqui.filter((l) => dentro(l.data, atual))),
        diasDa, precoMedio, margem: margemPct(precoMedio, Number(p.preco_custo ?? 0)), sit,
        ultima: daqui.reduce((m, l) => (l.data > m ? l.data : m), ""),
      };
    }).filter((m) => m.p.ativo !== false || m.estoque > 0 || m.q90 > 0)
      .sort((a, b) => SIT[a.sit].ordem - SIT[b.sit].ordem || b.q90 - a.q90 || a.nome.localeCompare(b.nome));
    const visiveis = doModelo(modelos, (m) => m.p.id);

    const ranking = new Map<string, { qtd: number; valor: number }>();
    for (const l of vendidas.filter((x) => dentro(x.data, atual))) {
      const v = ranking.get(l.produtoId!) ?? { qtd: 0, valor: 0 };
      v.qtd += l.quantidade; v.valor += l.valor; ranking.set(l.produtoId!, v);
    }

    // máquinas com clientes: todas as vendidas no histórico (pedidos + notas do sistema anterior); as registradas
    // em Garantias (na aprovação do pedido ou à mão) têm nº de série, garantia e preventiva
    const totalVendidas = soma(linhas);
    const primeiraVenda = linhas.reduce((m, l) => (!m || l.data < m ? l.data : m), "");
    const parque = doModelo(equipamentos, (e) => e.produto_id);
    const garantia = parque.filter((e) => situacaoGarantia(e.garantia_ate) !== "fora_garantia");
    const venceLogo = parque.filter((e) => situacaoGarantia(e.garantia_ate) === "vence_logo").sort((a, b) => (a.garantia_ate ?? "").localeCompare(b.garantia_ate ?? ""));
    const prevAtrasada = parque.filter((e) => situacaoPreventiva(e.proxima_preventiva) === "atrasada").sort((a, b) => (a.proxima_preventiva ?? "").localeCompare(b.proxima_preventiva ?? ""));
    const ufs = new Map<string, number>();
    for (const l of linhas) { const uf = (l.clienteId && ufCliente.get(l.clienteId)) || "Sem UF"; ufs.set(uf, (ufs.get(uf) ?? 0) + l.quantidade); }
    const ufsOrd = [...ufs.entries()].sort((a, b) => b[1] - a[1]);
    const ufsTop = ufsOrd.length > 7 ? [...ufsOrd.slice(0, 6), ["Outros", ufsOrd.slice(6).reduce((s, [, n]) => s + n, 0)] as [string, number]] : ufsOrd;

    // voltam para a assistência: OS dos últimos 12 meses por modelo, contra o tamanho do parque do modelo
    const corte12 = somarDias(-364);
    const chamados = new Map<string, { os: number; garantia: number }>();
    for (const o of oss) {
      if (!o.produto_id || !porId.has(o.produto_id) || o.status === "cancelada" || (o.data_entrada ?? "") < corte12) continue;
      const v = chamados.get(o.produto_id) ?? { os: 0, garantia: 0 };
      v.os++; if (o.em_garantia) v.garantia++;
      chamados.set(o.produto_id, v);
    }
    const parquePorModelo = new Map<string, number>();
    for (const l of vendidas) parquePorModelo.set(l.produtoId!, (parquePorModelo.get(l.produtoId!) ?? 0) + l.quantidade);

    return {
      vendidas: soma(vAtual), dVendidas: variacao(soma(vAtual), soma(vAnt)),
      faturamento: valor(vAtual), dFaturamento: variacao(valor(vAtual), valor(vAnt)),
      ticket: soma(vAtual) ? valor(vAtual) / soma(vAtual) : 0,
      serie: bs.map((b) => ({ rotulo: b.rotulo, valores: [soma(em(b.atual)), soma(em(b.anterior))] })),
      tendVendidas: bs.map((b) => soma(em(b.atual))), tendFat: bs.map((b) => valor(em(b.atual))),
      modelos, visiveis,
      estoque: visiveis.reduce((s, m) => s + m.estoque, 0), montagem: visiveis.reduce((s, m) => s + m.montagem, 0),
      valorEstoque: visiveis.reduce((s, m) => s + m.estoque * Number(m.p.preco_custo ?? 0), 0),
      ranking: [...ranking.entries()].sort((a, b) => b[1].qtd - a[1].qtd || b[1].valor - a[1].valor).slice(0, 8),
      totalVendidas, primeiraVenda, semRegistro: Math.max(0, totalVendidas - parque.length),
      parque: parque.length, garantia: garantia.length, venceLogo, prevAtrasada, semSerie: parque.filter((e) => !e.numero_serie?.trim()).length,
      ufs: ufsTop,
      chamados: [...chamados.entries()].map(([id, v]) => ({ id, ...v, parque: parquePorModelo.get(id) ?? 0 }))
        .sort((a, b) => b.os - a.os).slice(0, 7),
      atrasadasOP: ops.filter((o) => ABERTA(o) && o.previsao && o.previsao < dia),
    };
  }, [periodo, fModelo, vendidas, maquinas, ops, equipamentos, oss, porId, saldoUnidade, unidade, dia, ufCliente]); // eslint-disable-line react-hooks/exhaustive-deps

  const nomeFiltro = fModelo ? modeloDe(porId.get(fModelo)) : null;
  const filtrarModelo = (id: string) => setFModelo(fModelo === id ? null : id);

  const cartoes: Cartao[] = [
    { id: "vendidas", rotulo: "Máquinas vendidas", valor: un(k.vendidas), icone: ShoppingCart, cor: "var(--kpi-verde)", delta: k.dVendidas, tendencia: k.tendVendidas,
      sub: `${k.ranking.length} ${pl(k.ranking.length, "modelo", "modelos")} ${pl(k.ranking.length, "diferente", "diferentes")}`, onClick: () => navigate("/vendas-maquinas") },
    { id: "fat", rotulo: "Faturamento com máquinas", valor: brl(k.faturamento), icone: BadgeDollarSign, cor: "var(--kpi-azul)", delta: k.dFaturamento, tendencia: k.tendFat,
      sub: k.vendidas ? `preço médio de ${brl(k.ticket)} por máquina` : "nenhuma máquina vendida no período", onClick: () => navigate("/margem") },
    { id: "estoque", rotulo: "Prontas no estoque", valor: un(k.estoque), icone: Warehouse, cor: "var(--kpi-roxo)",
      sub: `${k.montagem ? `+ ${un(k.montagem)} em montagem · ` : ""}${brl(k.valorEstoque)} a custo`, onClick: () => navigate("/produtos/maquinas") },
    { id: "parque", rotulo: "Máquinas com clientes", valor: un(Math.max(k.totalVendidas, k.parque)), icone: MapPin, cor: "var(--kpi-ciano)",
      sub: `${k.primeiraVenda ? `vendidas desde ${dataBR(k.primeiraVenda)} · ` : ""}${k.parque} ${pl(k.parque, "registrada", "registradas")} em Garantias, ${k.garantia} em garantia`,
      titulo: "Todas as máquinas vendidas (pedidos do ERP e notas do sistema anterior). Garantia e preventiva só das registradas em Garantias.", onClick: () => navigate("/garantias") },
  ];

  const semMaquina = k.modelos.filter((m) => m.sit === "falta");
  const produzir = k.modelos.filter((m) => m.sit === "repor");
  const parados = k.modelos.filter((m) => m.sit === "parado");
  const prejuizo = k.modelos.filter((m) => m.margem != null && m.margem < 0);
  const atencao: ItemAtencao[] = [
    semMaquina.length > 0 && { icone: PackageX, cor: "var(--kpi-rosa)", texto: `${semMaquina.length} ${pl(semMaquina.length, "modelo", "modelos")} vendendo e sem máquina pronta nem em montagem`, sub: semMaquina.slice(0, 3).map((m) => m.nome).join(" · "), to: "/producao" },
    produzir.length > 0 && { icone: Factory, cor: "var(--kpi-laranja)", texto: `${produzir.length} ${pl(produzir.length, "modelo", "modelos")} dão para menos de 30 dias de venda`, sub: produzir.slice(0, 3).map((m) => `${m.nome} (${m.diasDa ?? 0} dias)`).join(" · "), to: "/producao" },
    gigaReteste.length > 0 && { icone: PlugZap, cor: "var(--kpi-rosa)", texto: `${gigaReteste.length} ${pl(gigaReteste.length, "máquina reprovada", "máquinas reprovadas")} no teste do giga, esperando reteste`, sub: gigaReteste.slice(0, 4).map((s) => s.ns).join(" · "), to: "/teste-giga" },
    k.atrasadasOP.length > 0 && { icone: AlarmClock, cor: "var(--kpi-rosa)", texto: `${k.atrasadasOP.length} ${pl(k.atrasadasOP.length, "OP", "OPs")} de máquina passaram da data prevista`, to: "/producao" },
    k.venceLogo.length > 0 && { icone: ShieldAlert, cor: "var(--kpi-laranja)", texto: `${k.venceLogo.length} ${pl(k.venceLogo.length, "garantia", "garantias")} vencem nos próximos 30 dias`, sub: "boa hora para oferecer preventiva ou contrato", to: "/garantias" },
    k.prevAtrasada.length > 0 && { icone: CalendarClock, cor: "var(--kpi-rosa)", texto: `${k.prevAtrasada.length} ${pl(k.prevAtrasada.length, "preventiva", "preventivas")} ${pl(k.prevAtrasada.length, "atrasada", "atrasadas")}`, sub: k.prevAtrasada.slice(0, 3).map((e) => e.cliente?.nome_fantasia || e.cliente?.nome || e.descricao).join(" · "), to: "/garantias" },
    k.semRegistro > 0 && { icone: ShieldAlert, cor: "var(--kpi-roxo)", texto: `${k.semRegistro} ${pl(k.semRegistro, "máquina", "máquinas")} ${pl(k.semRegistro, "vendida", "vendidas")} sem registro em Garantias`, sub: "a maioria veio do sistema anterior: registre cliente e nº de série para controlar garantia e preventiva", to: "/garantias" },
    k.semSerie > 0 && { icone: Hash, cor: "var(--kpi-roxo)", texto: `${k.semSerie} ${pl(k.semSerie, "máquina", "máquinas")} ${pl(k.semSerie, "vendida", "vendidas")} sem número de série`, sub: "sem o número fica difícil comprovar a garantia", to: "/garantias" },
    prejuizo.length > 0 && { icone: TrendingDown, cor: "var(--kpi-rosa)", texto: `${prejuizo.length} ${pl(prejuizo.length, "modelo", "modelos")} vendidos abaixo do custo`, sub: prejuizo.slice(0, 3).map((m) => m.nome).join(" · "), to: "/margem" },
    parados.length > 0 && { icone: Warehouse, cor: "var(--eixo-texto)", texto: `${parados.length} ${pl(parados.length, "modelo", "modelos")} com estoque e sem venda há 90 dias`, sub: parados.slice(0, 3).map((m) => `${m.nome} (${m.estoque})`).join(" · "), to: "/produtos/maquinas" },
  ].filter(Boolean) as ItemAtencao[];

  const resumo = isLoading ? "Carregando…"
    : <>{un(k.vendidas)} {pl(un(k.vendidas), "vendida", "vendidas")} {periodo === "hoje" ? "hoje" : "no período"}{frasePeriodo(k.dVendidas, periodo) ? ` (${frasePeriodo(k.dVendidas, periodo)})` : ""} · {un(k.estoque)} {pl(un(k.estoque), "pronta", "prontas")}{k.montagem ? ` e ${un(k.montagem)} em montagem` : ""} · {un(Math.max(k.totalVendidas, k.parque))} com clientes.</>;

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPainel icone={Factory} area="Máquinas" titulo="Como estão as máquinas" resumo={resumo} periodo={periodo} onPeriodo={setPeriodo} />

      {nomeFiltro && <FiltrosAtivos filtros={[{ rotulo: "Modelo", valor: nomeFiltro, limpar: () => setFModelo(null) }]} onLimpar={() => setFModelo(null)} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {cartoes.map((c) => <CartaoPainel key={c.id} c={c} anterior={per.anterior} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Section title={periodo === "ano" ? "Máquinas vendidas mês a mês" : "Máquinas vendidas"} className="xl:col-span-3">
          <Colunas dados={k.serie} altura={250} formatar={un} inteiro vazio="Nenhuma máquina vendida no período."
            series={[{ nome: "Vendidas", cor: "var(--serie-1)" }, { nome: per.anterior[0].toUpperCase() + per.anterior.slice(1), cor: "var(--serie-2)" }]} />
        </Section>
        <Section title="Modelos mais vendidos" className="xl:col-span-2" actions={<span className="text-xs text-slate-500">toque para filtrar</span>}>
          <Ranking cor="var(--serie-1)" formatar={un} vazio="Nenhuma máquina vendida no período."
            ativo={nomeFiltro} onClicar={(i) => filtrarModelo(k.ranking[i][0])}
            itens={k.ranking.map(([id, v]) => ({ rotulo: modeloDe(porId.get(id)), valor: v.qtd, detalhe: `${brl(v.valor)} · média ${brl(v.valor / Math.max(1, v.qtd))}` }))} />
        </Section>
      </div>

      <Section title="Estoque × venda, modelo a modelo" actions={<span className="hidden text-xs text-slate-500 sm:inline">ritmo dos últimos 90 dias · toque para filtrar</span>}>
        {k.modelos.length ? (
          <ul className="divide-y divide-slate-100">
            {k.modelos.map((m) => {
              const s = SIT[m.sit];
              const ativo = fModelo === m.p.id;
              return (
                <li key={m.p.id}>
                  <button type="button" onClick={() => filtrarModelo(m.p.id)} aria-pressed={ativo}
                    className={`linha-clicavel grid grid-cols-4 items-center gap-x-3 gap-y-1.5 px-2 py-2.5 md:grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(0,1fr))] ${ativo ? "bg-modulo/10 ring-1 ring-modulo/30" : ""}`}>
                    <span className="col-span-4 min-w-0 md:col-span-1">
                      <span className="block truncate text-sm font-semibold text-fg">{m.nome}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ${s.cor}`}>{s.texto}</span>
                        {m.ultima ? `última venda ${dataBR(m.ultima)}` : "nunca vendida"}
                      </span>
                    </span>
                    <Numero rotulo="Prontas" valor={m.estoque} />
                    <Numero rotulo="Montando" valor={m.montagem} />
                    <Numero rotulo="Vend. 90d" valor={m.q90} />
                    <Numero rotulo="Dá para" texto={m.diasDa == null ? "—" : m.diasDa >= 365 ? "+1 ano" : m.diasDa >= 60 ? `${Math.round(m.diasDa / 30)} mes.` : `${m.diasDa} dias`}
                      alerta={m.sit === "falta" || m.sit === "repor"} />
                    <Numero rotulo="Margem" texto={m.margem == null ? "—" : `${Math.round(m.margem)}%`} alerta={m.margem != null && m.margem < 15} className="hidden md:block" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="py-8 text-center text-sm text-slate-500">Nenhuma máquina cadastrada (Cadastros → Máquinas).</p>}
      </Section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Section title="Precisa de atenção" className="xl:col-span-3">
          <ListaAtencao itens={atencao} vazio="Máquinas sem pendências" />
        </Section>
        <Section title="Onde estão as máquinas vendidas" className="xl:col-span-2">
          {k.ufs.length
            ? <Rosca total="Máquinas" formatar={(v) => `${v}`} fatias={k.ufs.map(([rotulo, v], i) => ({ rotulo, valor: v, cor: CORES[i % CORES.length] }))} />
            : <p className="py-10 text-center text-sm text-slate-500">Nenhuma máquina vendida ainda.</p>}
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Section title="Garantias a vencer (30 dias)" actions={<button type="button" onClick={() => navigate("/garantias")} className="link-modulo text-sm">Ver todas</button>}>
          <ListaMaquinas lista={k.venceLogo} data={(e) => e.garantia_ate} rotulo="vence" vazio="Nenhuma garantia vencendo." onAbrir={() => navigate("/garantias")} />
        </Section>
        <Section title="Preventivas atrasadas" actions={<button type="button" onClick={() => navigate("/garantias")} className="link-modulo text-sm">Ver todas</button>}>
          <ListaMaquinas lista={k.prevAtrasada} data={(e) => e.proxima_preventiva} rotulo="era em" vazio="Nenhuma preventiva atrasada." onAbrir={() => navigate("/garantias")} />
        </Section>
        <Section title="Voltam para a assistência (12 meses)" className="md:col-span-2 xl:col-span-1">
          <Ranking cor="var(--kpi-rosa)" formatar={(v) => `${v} OS`} vazio="Nenhuma OS de máquina nos últimos 12 meses."
            ativo={nomeFiltro} onClicar={(i) => filtrarModelo(k.chamados[i].id)}
            itens={k.chamados.map((c) => ({
              rotulo: modeloDe(porId.get(c.id)), valor: c.os,
              detalhe: `${c.parque ? `${Math.round((c.os / c.parque) * 100)}% das ${c.parque} vendidas` : "nenhuma venda encontrada"}${c.garantia ? ` · ${c.garantia} em garantia` : ""}`,
            }))} />
        </Section>
      </div>

      <div className="space-y-3">
        <h2 className="flex items-center gap-2 px-1 text-sm font-bold text-fg"><span className="h-4 w-1 rounded-full bg-modulo" aria-hidden />Ir para</h2>
        <AtalhosArea colunas="grid-cols-3 sm:grid-cols-7" itens={[
          { rotulo: "Cadastro das máquinas", icone: Factory, to: "/produtos/maquinas", tela: "estoque" },
          { rotulo: "Ordens de produção", icone: Warehouse, to: "/producao", aviso: semMaquina.length + produzir.length, tela: "producao" },
          { rotulo: "Teste do giga", icone: PlugZap, to: "/teste-giga", aviso: gigaReteste.length, tela: "testegiga" },
          { rotulo: "Garantias", icone: ShieldCheck, to: "/garantias", aviso: k.prevAtrasada.length, tela: "garantias" },
          { rotulo: "Assistência", icone: Wrench, to: "/assistencia", tela: "assistencia" },
          { rotulo: "Vendas", icone: ShoppingCart, to: "/vendas-maquinas", tela: "pedidos" },
          { rotulo: "Margem", icone: BadgeDollarSign, to: "/margem", tela: "margem" },
        ]} />
      </div>
    </div>
  );
}

/** Número da tabela de modelos (rótulo pequeno em cima). */
function Numero({ rotulo, valor, texto, alerta, className = "" }: { rotulo: string; valor?: number; texto?: string; alerta?: boolean; className?: string }) {
  return (
    <span className={`min-w-0 text-left md:text-right ${className}`}>
      <span className="block whitespace-nowrap text-2xs font-semibold uppercase tracking-wide text-slate-500">{rotulo}</span>
      <span className={`num block whitespace-nowrap text-sm font-bold md:text-sm ${alerta ? "text-red-600" : "text-fg"}`}>{texto ?? (valor ?? 0).toLocaleString("pt-BR")}</span>
    </span>
  );
}

/** Lista curta de máquinas com cliente (garantia vencendo, preventiva atrasada). */
function ListaMaquinas({ lista, data, rotulo, vazio, onAbrir }: {
  lista: Equipamento[]; data: (e: Equipamento) => string | null; rotulo: string; vazio: string; onAbrir: () => void;
}) {
  if (!lista.length) return <p className="py-8 text-center text-sm text-slate-500">{vazio} ✅</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {lista.slice(0, 6).map((e) => (
        <li key={e.id}>
          <button type="button" onClick={onAbrir} className="linha-clicavel flex items-center gap-3 px-1 py-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-modulo/10 text-modulo-texto"><ShieldCheck size={17} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-fg">{e.cliente?.nome_fantasia || e.cliente?.nome || "Cliente"}</span>
              <span className="block truncate text-xs text-slate-500">{e.descricao}{e.numero_serie ? ` · nº ${e.numero_serie}` : ""}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-slate-600">{rotulo} {data(e) ? dataBR(data(e)) : "—"}</span>
          </button>
        </li>
      ))}
      {lista.length > 6 && <li className="pt-2 text-center text-xs text-slate-500">e mais {lista.length - 6}</li>}
    </ul>
  );
}
