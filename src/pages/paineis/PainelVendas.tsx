// Painel de Vendas: quanto vendeu, de onde veio, quem vendeu, o que vendeu e o que está parado no caminho.
// Clicar num canal ou num vendedor filtra o painel inteiro; os números levam para a lista certa.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlarmClock, BadgePercent, ClipboardList, FileWarning, HandCoins, Hourglass, PackageCheck, PackageSearch, Plus, Receipt,
  ScanBarcode, ShoppingCart, Target, ThumbsDown, TrendingUp, Truck, Users, Workflow,
} from "lucide-react";
import { Badge, Section } from "@/components/ui";
import { Area, Rosca, Ranking } from "@/components/Charts";
import { FichaCliente } from "@/components/FichaCliente";
import {
  AtalhosArea, baldes, CabecalhoPainel, CartaoPainel, dentro, FiltrosAtivos, frasePeriodo, Funil, intervalos, ListaAtencao, PERIODOS, usePeriodo, variacao,
  type Cartao, type ItemAtencao,
} from "@/components/painel/Painel";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { usePerfil } from "@/lib/auth";
import { brl, dataBR, hoje, somarDias, pl } from "@/lib/format";
import { MOTIVOS } from "@/lib/propostas";
import type { Cliente, Pedido } from "@/lib/types";

// o mesmo select da tela de vendas: a lista já carregada serve aos dois
const SELECT = "*, cliente:clientes(*), itens:pedido_itens(*), notas:notas_fiscais(id,status,numero,serie,chave,ambiente)";
const CANAL: Record<string, string> = {
  whatsapp: "WhatsApp", telefone: "Telefone", presencial: "Presencial", representante: "Representante",
  loja: "Loja virtual", marketplace: "Marketplace", balcao: "Balcão (PDV)",
};
const CORES = ["var(--serie-1)", "var(--serie-3)", "var(--serie-2)", "var(--kpi-roxo)", "var(--kpi-rosa)", "var(--kpi-ciano)", "var(--kpi-laranja)"];
const canal = (p: Pedido) => CANAL[p.origem] ?? p.origem ?? "Outro";
const vendedorDe = (p: Pedido) => p.vendedor?.trim() || "Sem vendedor";
const vendido = (p: Pedido) => !["orcamento", "cancelado"].includes(p.status);
/** dia da venda: a aprovação (orçamento antigo aprovado hoje conta hoje) */
const diaVenda = (p: Pedido) => p.aprovado_em ?? p.created_at;
const notaValida = (p: Pedido) => (p.notas ?? []).some((n) => n.status === "autorizada" && n.ambiente !== "homologacao");
const soma = (l: Pedido[]) => l.reduce((s, p) => s + Number(p.valor_total ?? 0), 0);

export default function PainelVendas() {
  const navigate = useNavigate();
  const { pode } = usePerfil();
  const { filtrar } = useUnidade();
  const { data: todos = [], isLoading } = useRows<Pedido>("pedidos", { select: SELECT });
  const [periodo, setPeriodo] = usePeriodo("vendas");
  const [fCanal, setFCanal] = useState<string | null>(null);
  const [fVendedor, setFVendedor] = useState<string | null>(null);
  const [ficha, setFicha] = useState<Cliente | null>(null);

  const doUnidade = filtrar(todos);
  // filtros por clique valem para o painel inteiro
  const pedidos = useMemo(() => doUnidade.filter((p) => (!fCanal || canal(p) === fCanal) && (!fVendedor || vendedorDe(p) === fVendedor)), [doUnidade, fCanal, fVendedor]);
  const per = PERIODOS.find((p) => p.id === periodo)!;

  const k = useMemo(() => {
    const { atual, anterior } = intervalos(periodo);
    const vendasEm = (f: [string, string], lista = pedidos) => lista.filter((p) => vendido(p) && dentro(diaVenda(p), f));
    const vAtual = vendasEm(atual), vAnt = vendasEm(anterior);
    const criadosEm = (f: [string, string]) => pedidos.filter((p) => dentro(p.created_at, f));
    const cAtual = criadosEm(atual), cAnt = criadosEm(anterior);
    const conv = (l: Pedido[]) => (l.length ? (l.filter(vendido).length / l.length) * 100 : 0);
    const bs = baldes(periodo);
    const serie = bs.map((b) => ({ rotulo: b.rotulo, valores: [soma(vendasEm(b.atual)), soma(vendasEm(b.anterior))] }));

    // canais e vendedores: sem o próprio filtro, para dar para trocar de um para outro
    const base = (sem: "canal" | "vendedor") => doUnidade.filter((p) => vendido(p) && dentro(diaVenda(p), atual) &&
      (sem === "canal" || !fCanal || canal(p) === fCanal) && (sem === "vendedor" || !fVendedor || vendedorDe(p) === fVendedor));
    const agrupar = (l: Pedido[], chave: (p: Pedido) => string) => {
      const m = new Map<string, { valor: number; qtd: number }>();
      for (const p of l) { const c = chave(p); const v = m.get(c) ?? { valor: 0, qtd: 0 }; v.valor += Number(p.valor_total); v.qtd++; m.set(c, v); }
      return [...m.entries()].sort((a, b) => b[1].valor - a[1].valor);
    };
    const canais = agrupar(base("canal"), canal);
    const vendedores = agrupar(base("vendedor"), vendedorDe);

    const produtos = new Map<string, { valor: number; qtd: number }>();
    for (const p of vAtual) for (const i of p.itens ?? []) {
      const v = produtos.get(i.descricao) ?? { valor: 0, qtd: 0 };
      v.valor += Number(i.quantidade) * Number(i.valor_unitario); v.qtd += Number(i.quantidade);
      produtos.set(i.descricao, v);
    }
    const clientes = new Map<string, { cliente: Cliente; valor: number; qtd: number }>();
    for (const p of vAtual) if (p.cliente) {
      const v = clientes.get(p.cliente_id) ?? { cliente: p.cliente, valor: 0, qtd: 0 };
      v.valor += Number(p.valor_total); v.qtd++; clientes.set(p.cliente_id, v);
    }
    const estados = agrupar(vAtual, (p) => p.cliente?.uf || "—");

    // funil dos orçamentos criados no período
    const enviados = cAtual.filter((p) => p.proposta_enviada_em);
    const vistos = enviados.filter((p) => p.proposta_visualizada_em || (p.proposta_status && p.proposta_status !== "enviada"));
    const aprovados = cAtual.filter(vendido);
    const faturados = cAtual.filter((p) => ["faturado", "entregue"].includes(p.status));
    const entregues = cAtual.filter((p) => p.status === "entregue");

    const h = hoje();
    const abertos = pedidos.filter((p) => p.status === "orcamento" && !["rejeitada", "expirada"].includes(p.proposta_status ?? ""));
    const perdidos = cAtual.filter((p) => p.proposta_status === "rejeitada" || p.status === "cancelado");
    const motivos = new Map<string, number>();
    for (const p of perdidos) if (p.motivo_rejeicao) motivos.set(p.motivo_rejeicao, (motivos.get(p.motivo_rejeicao) ?? 0) + 1);
    const motivo = [...motivos.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      serie,
      valor: soma(vAtual), dValor: variacao(soma(vAtual), soma(vAnt)), qtd: vAtual.length, dQtd: variacao(vAtual.length, vAnt.length),
      ticket: vAtual.length ? soma(vAtual) / vAtual.length : 0,
      dTicket: variacao(vAtual.length ? soma(vAtual) / vAtual.length : 0, vAnt.length ? soma(vAnt) / vAnt.length : 0),
      conv: conv(cAtual), dConv: cAnt.length ? conv(cAtual) - conv(cAnt) : undefined, criados: cAtual.length,
      abertos, valorAbertos: soma(abertos),
      tendValor: serie.map((s) => s.valores[0]),
      tendQtd: bs.map((b) => vendasEm(b.atual).length),
      tendTicket: bs.map((b) => { const l = vendasEm(b.atual); return l.length ? soma(l) / l.length : 0; }),
      canais, vendedores, estados,
      produtos: [...produtos.entries()].sort((a, b) => b[1].valor - a[1].valor).slice(0, 6),
      clientes: [...clientes.values()].sort((a, b) => b.valor - a.valor).slice(0, 5),
      funil: { criados: cAtual.length, enviados: enviados.length, vistos: vistos.length, aprovados: aprovados.length, faturados: faturados.length, entregues: entregues.length },
      perdidos: perdidos.length, motivo: motivo ? `${MOTIVOS[motivo[0]] ?? motivo[0]} (${motivo[1]})` : null,
      vencendo: abertos.filter((p) => p.proposta_validade && p.proposta_validade >= h && p.proposta_validade <= somarDias(3)),
      parados: abertos.filter((p) => p.created_at.slice(0, 10) <= somarDias(-7) && !p.proposta_visualizada_em),
      semNota: pedidos.filter((p) => p.status === "aprovado" && !notaValida(p)),
      aEntregar: pedidos.filter((p) => p.status === "faturado"),
      recentes: [...pedidos].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6),
    };
  }, [periodo, pedidos, doUnidade, fCanal, fVendedor]);

  const cartoes: Cartao[] = [
    { id: "valor", rotulo: "Vendido", valor: brl(k.valor), sub: `${k.qtd} ${pl(k.qtd, "venda", "vendas")} ${pl(k.qtd, "aprovada", "aprovadas")}`, icone: TrendingUp, cor: "var(--kpi-verde)", delta: k.dValor, tendencia: k.tendValor, onClick: () => navigate("/pedidos", { state: { status: "aprovado" } }) },
    { id: "ticket", rotulo: "Ticket médio", valor: brl(k.ticket), sub: "valor médio por venda", icone: Receipt, cor: "var(--kpi-azul)", delta: k.dTicket, tendencia: k.tendTicket },
    { id: "conv", rotulo: "Conversão", valor: `${Math.round(k.conv)}%`, icone: Target, cor: "var(--kpi-roxo)",
      sub: k.criados ? `dos ${k.criados} ${pl(k.criados, "orçamento", "orçamentos")} do período viraram venda` : "nenhum orçamento no período",
      ...(k.dConv !== undefined ? { titulo: `${k.dConv >= 0 ? "+" : ""}${Math.round(k.dConv)} pontos contra ${per.anterior}` } : {}),
      onClick: () => navigate("/pedidos", { state: { status: "orcamento" } }) },
    { id: "abertos", rotulo: "Em negociação", valor: brl(k.valorAbertos), sub: `${k.abertos.length} ${pl(k.abertos.length, "orçamento", "orçamentos")} esperando resposta`, icone: Hourglass, cor: "var(--kpi-laranja)", onClick: () => navigate("/pedidos", { state: { status: "orcamento" } }) },
  ];

  const atencao: ItemAtencao[] = [
    k.vencendo.length > 0 && { icone: AlarmClock, cor: "var(--kpi-rosa)", texto: `${k.vencendo.length} ${pl(k.vencendo.length, "proposta", "propostas")} vencem em até 3 dias`, sub: k.vencendo.slice(0, 3).map((p) => `#${p.numero} ${p.cliente?.nome ?? ""}`).join(" · "), to: "/pedidos", state: { status: "orcamento" } },
    k.parados.length > 0 && { icone: Hourglass, cor: "var(--kpi-laranja)", texto: `${k.parados.length} ${pl(k.parados.length, "orçamento", "orçamentos")} há mais de 7 dias sem o cliente abrir`, sub: "vale um contato pelo WhatsApp", to: "/pedidos", state: { status: "orcamento" } },
    k.semNota.length > 0 && { icone: FileWarning, cor: "var(--kpi-roxo)", texto: `${k.semNota.length} ${pl(k.semNota.length, "venda", "vendas")} ${pl(k.semNota.length, "aprovada", "aprovadas")} sem NF-e`, sub: k.semNota.slice(0, 3).map((p) => `#${p.numero}`).join(" · "), to: "/fluxo" },
    k.aEntregar.length > 0 && { icone: Truck, cor: "var(--kpi-ciano)", texto: `${k.aEntregar.length} ${pl(k.aEntregar.length, "pedido", "pedidos")} ${pl(k.aEntregar.length, "faturado", "faturados")} esperando entrega`, to: "/fluxo" },
    k.perdidos > 0 && { icone: ThumbsDown, cor: "var(--kpi-rosa)", texto: `${k.perdidos} ${pl(k.perdidos, "venda", "vendas")} ${pl(k.perdidos, "perdida", "perdidas")} no período`, sub: k.motivo ? `motivo mais comum: ${k.motivo}` : undefined, to: "/relatorios" },
  ].filter(Boolean) as ItemAtencao[];

  const filtros = [
    fCanal && { rotulo: "Canal", valor: fCanal, limpar: () => setFCanal(null) },
    fVendedor && { rotulo: "Vendedor", valor: fVendedor, limpar: () => setFVendedor(null) },
  ].filter(Boolean) as { rotulo: string; valor: string; limpar: () => void }[];

  const resumo = isLoading ? "Carregando…" : k.qtd
    ? <>{brl(k.valor)} em {k.qtd} {pl(k.qtd, "venda", "vendas")}{frasePeriodo(k.dValor, periodo) ? ` · ${frasePeriodo(k.dValor, periodo)}` : ""}.</>
    : <>Nenhuma venda aprovada {periodo === "hoje" ? "hoje" : "no período"} ainda.</>;

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPainel icone={ShoppingCart} area="Vendas" titulo="Como estão as vendas" resumo={resumo} periodo={periodo} onPeriodo={setPeriodo}
        acoes={pode("editar_pedidos") && (
          <button type="button" onClick={() => navigate("/pedidos", { state: { novo: true } })}
            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-white px-3.5 text-sm font-bold text-modulo-texto shadow hover:bg-white/90">
            <Plus size={16} /> Novo orçamento
          </button>
        )} />

      <FiltrosAtivos filtros={filtros} onLimpar={() => { setFCanal(null); setFVendedor(null); }} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {cartoes.map((c) => <CartaoPainel key={c.id} c={c} anterior={per.anterior} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Section title={periodo === "ano" ? "Vendas mês a mês" : periodo === "hoje" ? "Vendas dos últimos 7 dias" : "Vendas dia a dia"} className="xl:col-span-3">
          <Area dados={k.serie} altura={250} series={[
            { nome: periodo === "ano" ? "Este ano" : "Este período", cor: "var(--serie-1)" },
            { nome: periodo === "ano" ? "Ano passado" : "Período anterior", cor: "var(--eixo-texto)", tracejada: true },
          ]} />
        </Section>
        <Section title="Do orçamento à entrega" className="xl:col-span-2">
          <Funil etapas={[
            { rotulo: "Orçamentos feitos", valor: k.funil.criados, onClick: () => navigate("/pedidos", { state: { status: "todos" } }),
              sub: k.funil.enviados ? `${k.funil.enviados} com proposta enviada pelo ERP, ${k.funil.vistos} ${pl(k.funil.vistos, "aberta", "abertas")} pelo cliente` : undefined },
            { rotulo: "Aprovados", valor: k.funil.aprovados, onClick: () => navigate("/pedidos", { state: { status: "aprovado" } }) },
            { rotulo: "Faturados", valor: k.funil.faturados, onClick: () => navigate("/pedidos", { state: { status: "faturado" } }) },
            { rotulo: "Entregues", valor: k.funil.entregues, onClick: () => navigate("/pedidos", { state: { status: "entregue" } }) },
          ]} />
          <p className="mt-3 text-xs text-slate-500">Orçamentos criados no período e até onde cada um chegou.</p>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Section title="Por canal" actions={<span className="text-xs text-slate-500">toque para filtrar</span>}>
          {k.canais.length
            ? <Rosca total="Vendido" ativo={fCanal} onClicar={(i) => { const c = k.canais[i][0]; setFCanal(fCanal === c ? null : c); }}
                fatias={k.canais.map(([rotulo, v], i) => ({ rotulo, valor: v.valor, cor: CORES[i % CORES.length] }))} />
            : <p className="py-10 text-center text-sm text-slate-500">Sem vendas no período.</p>}
        </Section>
        <Section title="Por vendedor" actions={<span className="text-xs text-slate-500">toque para filtrar</span>}>
          <Ranking ativo={fVendedor} cor="var(--serie-3)" onClicar={(i) => { const v = k.vendedores[i][0]; setFVendedor(fVendedor === v ? null : v); }}
            itens={k.vendedores.map(([rotulo, v]) => ({ rotulo, valor: v.valor, detalhe: `${v.qtd} ${pl(v.qtd, "venda", "vendas")} · ticket ${brl(v.valor / v.qtd)}` }))} />
        </Section>
        <Section title="Precisa de atenção" className="md:col-span-2 xl:col-span-1">
          <ListaAtencao itens={atencao} vazio="Nenhuma venda parada" />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Section title="Produtos mais vendidos">
          <Ranking itens={k.produtos.map(([rotulo, v]) => ({ rotulo, valor: v.valor, detalhe: `${v.qtd.toLocaleString("pt-BR")} un.` }))} />
        </Section>
        <Section title="Melhores clientes" actions={<span className="text-xs text-slate-500">toque para abrir a ficha</span>}>
          <Ranking cor="var(--kpi-roxo)" onClicar={(i) => setFicha(k.clientes[i].cliente)} vazio="Sem vendas no período."
            itens={k.clientes.map((c) => ({ rotulo: c.cliente.nome_fantasia || c.cliente.nome, valor: c.valor, detalhe: `${c.qtd} ${pl(c.qtd, "compra", "compras")}${c.cliente.municipio ? ` · ${c.cliente.municipio}/${c.cliente.uf ?? ""}` : ""}` }))} />
        </Section>
        <Section title="Onde vendemos" className="md:col-span-2 xl:col-span-1">
          <Ranking cor="var(--serie-2)" vazio="Sem vendas no período."
            itens={k.estados.slice(0, 6).map(([uf, v]) => ({ rotulo: uf === "—" ? "Sem estado no cadastro" : uf, valor: v.valor, detalhe: `${v.qtd} ${pl(v.qtd, "venda", "vendas")}` }))} />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Section title="Últimos pedidos e orçamentos" className="xl:col-span-3"
          actions={<button type="button" onClick={() => navigate("/pedidos")} className="text-sm font-semibold text-modulo-texto hover:underline">Ver todos</button>}>
          {k.recentes.length ? (
            <ul className="divide-y divide-slate-100">
              {k.recentes.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => navigate("/pedidos", { state: { abrir: p.id } })}
                    className="flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition hover:bg-slate-50">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-modulo/10 text-modulo-texto"><ClipboardList size={17} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">#{p.numero} · {p.cliente?.nome_fantasia || p.cliente?.nome}</span>
                      <span className="block text-xs text-slate-500">{dataBR(p.created_at.slice(0, 10))} · {canal(p)} · {vendedorDe(p)}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="num text-sm font-bold text-fg">{brl(p.valor_total)}</span>
                      <Badge value={p.status} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="py-8 text-center text-sm text-slate-500">Nenhum pedido ainda.</p>}
        </Section>
        <div className="space-y-3 xl:col-span-2">
          <h2 className="flex items-center gap-2 px-1 text-sm font-bold text-fg"><span className="h-4 w-1 rounded-full bg-modulo" aria-hidden />Ir para</h2>
          <AtalhosArea colunas="grid-cols-3" itens={[
            { rotulo: "Vendas e orçamentos", icone: ShoppingCart, to: "/pedidos", aviso: k.abertos.length, tela: "pedidos" },
            { rotulo: "PDV", icone: ScanBarcode, to: "/pdv", tela: "pedidos" },
            { rotulo: "Fluxo de pedidos", icone: Workflow, to: "/fluxo", aviso: k.semNota.length + k.aEntregar.length, tela: "fluxo" },
            { rotulo: "Fretes e envios", icone: PackageSearch, to: "/fretes", tela: "fretes" },
            { rotulo: "Comissões", icone: HandCoins, to: "/comissoes", tela: "comissoes" },
            { rotulo: "Clientes", icone: Users, to: "/clientes", tela: "clientes" },
          ]} />
          <div className="grid grid-cols-2 gap-3">
            <MiniNumero icone={BadgePercent} rotulo="Perdidas no período" valor={k.perdidos} sub={k.motivo ?? "sem motivo registrado"} />
            <MiniNumero icone={PackageCheck} rotulo="Entregues no período" valor={k.funil.entregues} sub="dos orçamentos do período" />
          </div>
        </div>
      </div>

      {ficha && <FichaCliente cliente={ficha} onClose={() => setFicha(null)} />}
    </div>
  );
}

function MiniNumero({ icone: Icone, rotulo, valor, sub }: { icone: typeof Plus; rotulo: string; valor: number | string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-surface p-3 shadow-card">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-modulo/10 text-modulo-texto"><Icone size={19} /></span>
      <span className="min-w-0">
        <span className="num block text-xl font-bold leading-none text-fg">{valor}</span>
        <span className="mt-1 block text-xs leading-tight text-slate-500">{rotulo}{sub ? ` · ${sub}` : ""}</span>
      </span>
    </div>
  );
}
