// Painel de Produção e estoque: máquinas em montagem e prontas, peças que faltam para as OPs, compras a caminho,
// quanto dinheiro está parado no estoque e o que está abaixo do mínimo. Tocar num tipo de produto filtra a lista do mínimo.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlarmClock, ArrowLeftRight, Boxes, ClipboardList, ClipboardCheck, Factory, PackageSearch, Plus, ShoppingBag, Truck, Warehouse, Wrench,
} from "lucide-react";
import { Badge, Section } from "@/components/ui";
import { Secoes } from "@/components/Secoes";
import { Colunas, Ranking, Rosca } from "@/components/Charts";
import {
  AtalhosArea, baldes, CabecalhoPainel, CartaoPainel, dentro, FiltrosAtivos, frasePeriodo, intervalos, ListaAtencao, PERIODOS, usePeriodo, variacao,
  type Cartao, type ItemAtencao,
} from "@/components/painel/Painel";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { usePerfil } from "@/lib/auth";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import type { Necessidade, OrdemProducao, PedidoCompra, Produto } from "@/lib/types";

const TIPO: Record<string, string> = { maquina: "Máquinas", peca: "Peças de reposição", acessorio: "Acessórios", insumo: "Componentes de produção" };
const COR_TIPO: Record<string, string> = { Máquinas: "var(--serie-1)", "Peças de reposição": "var(--serie-2)", Acessórios: "var(--kpi-roxo)", "Componentes de produção": "var(--serie-3)", Outros: "var(--eixo-texto)" };
const tipoDe = (p: Produto) => TIPO[p.tipo] ?? "Outros";
const ABERTA = (o: OrdemProducao) => ["planejada", "em_producao"].includes(o.status);
const A_CAMINHO = (c: PedidoCompra) => ["enviado", "parcial"].includes(c.status);
const falta = (n: Necessidade) => Math.max(0, Number(n.necessario) - Math.max(0, Number(n.estoque_atual) - Number(n.reservado_outras_op)) - Number(n.a_caminho));
const un = (v: number) => `${v.toLocaleString("pt-BR")} máq.`;

export default function PainelProducao() {
  const navigate = useNavigate();
  const { pode } = usePerfil();
  const verCompras = pode("editar_producao") || pode("receber_compras");
  const { filtrar, atual: unidade } = useUnidade();
  // mesmos selects das telas de produção e de produtos: o que já foi carregado serve aos dois
  const { data: opsTodas = [], isLoading } = useRows<OrdemProducao>("ordens_producao", { select: "*, produto:produtos(*)" });
  const { data: pcsTodos = [] } = useRows<PedidoCompra>("pedidos_compra", { select: "*, fornecedor:fornecedores(*), itens:pedido_compra_itens(*)" });
  const { data: necessidade = [] } = useRows<Necessidade>("necessidade_producao", { order: "descricao", ascending: true });
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: saldos = [] } = useRows<{ produto_id: string; unidade_id: string; quantidade: number }>("estoque_unidade", { order: "produto_id" });
  const { data: transfs = [] } = useRows<{ id: string; status: string }>("transferencias", { select: "*, itens:transferencia_itens(*)" });
  const [periodo, setPeriodo] = usePeriodo("producao");
  const [fTipo, setFTipo] = useState<string | null>(null);
  const per = PERIODOS.find((p) => p.id === periodo)!;
  const dia = hoje();

  const ops = filtrar(opsTodas);
  const compras = verCompras ? filtrar(pcsTodos) : [];
  // estoque da unidade escolhida (ou o total, em "Todas")
  const saldoUnidade = useMemo(() => new Map(saldos.filter((s) => s.unidade_id === unidade).map((s) => [s.produto_id, Number(s.quantidade)])), [saldos, unidade]);
  const qtd = (p: Produto) => (unidade ? saldoUnidade.get(p.id) ?? 0 : Number(p.estoque_atual ?? 0));

  const k = useMemo(() => {
    const { atual, anterior } = intervalos(periodo);
    const bs = baldes(periodo);
    const feitas = (f: [string, string]) => ops.filter((o) => o.status === "concluida" && dentro(o.concluida_em, f));
    const maquinas = (l: OrdemProducao[]) => l.reduce((s, o) => s + Number(o.quantidade ?? 0), 0);
    const abertas = ops.filter(ABERTA);
    const idsAbertas = new Set(abertas.map((o) => o.id));
    const faltando = necessidade.filter((n) => idsAbertas.has(n.ordem_id) && !n.subconjunto && falta(n) > 0);
    const opsComFalta = new Set(faltando.map((n) => n.ordem_id));
    // a mesma peça pode faltar em várias OPs: soma
    const pecas = new Map<string, { falta: number; tem: number; un: string; custo: number }>();
    for (const n of faltando) {
      const v = pecas.get(n.descricao) ?? { falta: 0, tem: Math.max(0, Number(n.estoque_atual) - Number(n.reservado_outras_op)), un: n.unidade, custo: Number(n.preco_custo) };
      v.falta += falta(n); pecas.set(n.descricao, v);
    }
    const caminho = compras.filter(A_CAMINHO);
    const porFornecedor = new Map<string, { valor: number; qtd: number }>();
    for (const c of caminho) { const n = c.fornecedor?.nome ?? "Sem fornecedor"; const v = porFornecedor.get(n) ?? { valor: 0, qtd: 0 }; v.valor += Number(c.valor_total); v.qtd++; porFornecedor.set(n, v); }

    const ativos = produtos.filter((p) => p.ativo !== false);
    const porTipo = new Map<string, number>();
    for (const p of ativos) { const v = qtd(p) * Number(p.preco_custo ?? 0); if (v > 0) porTipo.set(tipoDe(p), (porTipo.get(tipoDe(p)) ?? 0) + v); }
    const abaixo = ativos.filter((p) => Number(p.estoque_minimo) > 0 && qtd(p) <= Number(p.estoque_minimo));

    return {
      emProducao: maquinas(abertas), opsAbertas: abertas.length, opsComFalta: opsComFalta.size,
      atrasadas: abertas.filter((o) => o.previsao && o.previsao < dia),
      feitas: maquinas(feitas(atual)), dFeitas: variacao(maquinas(feitas(atual)), maquinas(feitas(anterior))),
      serie: bs.map((b) => ({ rotulo: b.rotulo, valores: [maquinas(feitas(b.atual))] })), tendFeitas: bs.map((b) => maquinas(feitas(b.atual))),
      lista: [...abertas].sort((a, b) => (a.previsao ?? "9999").localeCompare(b.previsao ?? "9999")).slice(0, 7), comFalta: opsComFalta,
      pecas: [...pecas.entries()].sort((a, b) => b[1].falta * b[1].custo - a[1].falta * a[1].custo).slice(0, 7),
      caminho, valorCaminho: caminho.reduce((s, c) => s + Number(c.valor_total), 0),
      comprasAtrasadas: caminho.filter((c) => c.previsao_entrega && c.previsao_entrega < dia),
      cotacao: compras.filter((c) => c.status === "cotacao").length,
      fornecedores: [...porFornecedor.entries()].sort((a, b) => b[1].valor - a[1].valor).slice(0, 6),
      estoque: [...porTipo.values()].reduce((s, v) => s + v, 0),
      porTipo: [...porTipo.entries()].sort((a, b) => b[1] - a[1]),
      abaixo, itensAtivos: ativos.length,
    };
  }, [periodo, ops, compras, necessidade, produtos, dia, saldoUnidade, unidade]); // eslint-disable-line react-hooks/exhaustive-deps

  const transito = transfs.filter((t) => t.status === "enviada").length;
  const abaixoFiltrado = k.abaixo.filter((p) => !fTipo || tipoDe(p) === fTipo)
    .sort((a, b) => qtd(a) / Math.max(1, Number(a.estoque_minimo)) - qtd(b) / Math.max(1, Number(b.estoque_minimo))).slice(0, 8);

  const cartoes: Cartao[] = [
    { id: "prod", rotulo: "Em produção", valor: un(k.emProducao), icone: Factory, cor: "var(--kpi-azul)",
      sub: `${k.opsAbertas} ${pl(k.opsAbertas, "OP", "OPs")}${k.opsComFalta ? ` · ${k.opsComFalta} com peça faltando` : " · peças ok"}`, onClick: () => navigate("/producao") },
    { id: "feitas", rotulo: "Máquinas prontas", valor: un(k.feitas), icone: ClipboardCheck, cor: "var(--kpi-verde)", delta: k.dFeitas, tendencia: k.tendFeitas,
      sub: "OPs concluídas no período" },
    ...(verCompras ? [{ id: "compras", rotulo: "Compras a caminho", valor: brl(k.valorCaminho), icone: Truck, cor: "var(--kpi-laranja)",
      sub: `${k.caminho.length} ${pl(k.caminho.length, "pedido", "pedidos")}${k.comprasAtrasadas.length ? ` · ${k.comprasAtrasadas.length} ${pl(k.comprasAtrasadas.length, "atrasado", "atrasados")}` : " · no prazo"}`, onClick: () => navigate("/compras", { state: { aba: "compras" } }) } as Cartao] : []),
    { id: "estoque", rotulo: "Dinheiro no estoque", valor: brl(k.estoque), icone: Warehouse, cor: "var(--kpi-roxo)",
      sub: `${k.abaixo.length} de ${k.itensAtivos} ${pl(k.itensAtivos, "item", "itens")} no mínimo · a preço de custo`, onClick: () => navigate("/estoque") },
  ];

  const atencao: ItemAtencao[] = [
    k.opsComFalta > 0 && { icone: PackageSearch, cor: "var(--kpi-rosa)", texto: `${k.opsComFalta} ${pl(k.opsComFalta, "OP", "OPs")} com peça faltando`, sub: k.pecas.slice(0, 3).map(([d]) => d).join(" · "), to: "/producao" },
    k.atrasadas.length > 0 && { icone: AlarmClock, cor: "var(--kpi-rosa)", texto: `${k.atrasadas.length} ${pl(k.atrasadas.length, "OP", "OPs")} passaram da data prevista`, to: "/producao" },
    verCompras && k.comprasAtrasadas.length > 0 && { icone: Truck, cor: "var(--kpi-laranja)", texto: `${k.comprasAtrasadas.length} ${pl(k.comprasAtrasadas.length, "pedido", "pedidos")} de compra com entrega atrasada`, sub: k.comprasAtrasadas.slice(0, 3).map((c) => c.fornecedor?.nome ?? `#${c.numero}`).join(" · "), to: "/compras", state: { aba: "compras" } },
    verCompras && k.cotacao > 0 && { icone: ClipboardList, cor: "var(--kpi-roxo)", texto: `${k.cotacao} ${pl(k.cotacao, "pedido", "pedidos")} de compra em cotação`, to: "/compras", state: { aba: "compras" } },
    k.abaixo.length > 0 && { icone: Boxes, cor: "var(--kpi-laranja)", texto: `${k.abaixo.length} ${pl(k.abaixo.length, "item", "itens")} no estoque mínimo`, sub: verCompras ? "a reposição sugere o que comprar" : undefined, to: verCompras ? "/producao" : "/estoque", state: verCompras ? { aba: "reposicao" } : undefined },
    transito > 0 && { icone: ArrowLeftRight, cor: "var(--kpi-ciano)", texto: `${transito} ${pl(transito, "transferência", "transferências")} SC ↔ SP em trânsito`, sub: "confirme o recebimento quando chegar", to: "/transferencias" },
  ].filter(Boolean) as ItemAtencao[];

  const resumo = isLoading ? "Carregando…"
    : <>{un(k.emProducao)} em montagem{k.opsComFalta ? `, ${k.opsComFalta} ${pl(k.opsComFalta, "OP", "OPs")} esperando peça` : ""} · {un(k.feitas)} {pl(un(k.feitas), "pronta", "prontas")} {periodo === "hoje" ? "hoje" : "no período"}{frasePeriodo(k.dFeitas, periodo) ? ` (${frasePeriodo(k.dFeitas, periodo)})` : ""}.</>;

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPainel icone={Factory} area="Produção e estoque" titulo="Como está a fábrica" resumo={resumo} periodo={periodo} onPeriodo={setPeriodo}
        acoes={pode("editar_producao") && (
          <button type="button" onClick={() => navigate("/compras", { state: { aba: "compras", novaCompra: true } })}
            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-white px-4 text-sm font-bold text-modulo-texto shadow hover:bg-white/90">
            <Plus size={16} /> Pedir peças
          </button>
        )} />

      {/* seções que a pessoa pode reordenar no "Organizar" (fica no perfil dela) */}
      <Secoes pagina="painel-producao" secoes={[
        { id: "cartoes", titulo: "Números", largo: true, conteudo: (
          <div className={`grid grid-cols-2 gap-3 lg:gap-4 ${cartoes.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
            {cartoes.map((c) => <CartaoPainel key={c.id} c={c} anterior={per.anterior} />)}
          </div>
        ) },
        { id: "ops", titulo: "Ordens de produção abertas", conteudo: (
          <Section title="Ordens de produção abertas (pela data prevista)" className="h-full"
            actions={<button type="button" onClick={() => navigate("/producao")} className="link-modulo text-sm">Ver todas</button>}>
            {k.lista.length ? (
              <ul className="divide-y divide-slate-100">
                {k.lista.map((o) => {
                  const atrasada = o.previsao && o.previsao < dia;
                  const semPeca = k.comFalta.has(o.id);
                  return (
                    <li key={o.id}>
                      <button type="button" onClick={() => navigate("/producao")} className="linha-clicavel flex items-center gap-3 px-1 py-2.5">
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${semPeca ? "bg-red-50 text-red-600" : "bg-modulo/10 text-modulo-texto"}`}><Factory size={17} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-fg">OP #{o.numero} · {o.quantidade}× {o.produto?.descricao ?? "produto"}</span>
                          <span className={`block text-xs ${semPeca ? "font-semibold text-red-600" : "text-slate-500"}`}>{semPeca ? "falta peça" : "peças ok"}{o.responsavel ? ` · ${o.responsavel}` : ""}</span>
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
            ) : <p className="py-8 text-center text-sm text-slate-500">Nenhuma OP aberta.</p>}
          </Section>
        ) },
        { id: "atencao", titulo: "Precisa de atenção", conteudo: (
          <Section title="Precisa de atenção" className="h-full">
            <ListaAtencao itens={atencao} vazio="Fábrica sem pendências" />
          </Section>
        ) },
        { id: "prontas", titulo: "Máquinas prontas", conteudo: (
          <Section title={periodo === "ano" ? "Máquinas prontas mês a mês" : "Máquinas prontas"} className="h-full">
            <Colunas dados={k.serie} altura={220} formatar={un} inteiro vazio="Nenhuma OP concluída no período." series={[{ nome: "Prontas", cor: "var(--serie-3)" }]} />
          </Section>
        ) },
        { id: "pecas", titulo: "Peças que faltam para as OPs", conteudo: (
          <Section title="Peças que faltam para as OPs" className="h-full">
            <Ranking cor="var(--kpi-rosa)" vazio="Nenhuma peça faltando. ✅" formatar={(v) => v.toLocaleString("pt-BR")}
              itens={k.pecas.map(([d, v]) => ({ rotulo: d, valor: v.falta, detalhe: `faltam ${v.falta.toLocaleString("pt-BR")} ${v.un} · livre no estoque ${v.tem.toLocaleString("pt-BR")} · ≈ ${brl(v.falta * v.custo)}` }))} />
          </Section>
        ) },
        { id: "compras", titulo: "Compras a caminho por fornecedor", conteudo: verCompras && (
          <Section title="Compras a caminho por fornecedor" className="h-full">
            <Ranking cor="var(--serie-2)" vazio="Nenhuma compra a caminho."
              onClicar={() => navigate("/compras", { state: { aba: "compras" } })}
              itens={k.fornecedores.map(([nome, v]) => ({ rotulo: nome, valor: v.valor, detalhe: `${v.qtd} ${pl(v.qtd, "pedido", "pedidos")}` }))} />
          </Section>
        ) },
        { id: "estoque-tipo", titulo: "Onde está o dinheiro do estoque", conteudo: (
          <Section title="Onde está o dinheiro do estoque" className="h-full" actions={<span className="text-xs text-slate-500">toque para filtrar</span>}>
            {k.porTipo.length
              ? <Rosca total="Em estoque" ativo={fTipo} onClicar={(i) => { const t = k.porTipo[i][0]; setFTipo(fTipo === t ? null : t); }}
                  fatias={k.porTipo.map(([rotulo, valor]) => ({ rotulo, valor, cor: COR_TIPO[rotulo] ?? "var(--eixo-texto)" }))} />
              : <p className="py-10 text-center text-sm text-slate-500">Sem estoque com custo cadastrado.</p>}
          </Section>
        ) },
        { id: "minimo", titulo: "No estoque mínimo", conteudo: (
          <Section title={fTipo ? `No estoque mínimo · ${fTipo}` : "No estoque mínimo (os mais críticos primeiro)"} className="h-full"
            actions={<button type="button" onClick={() => navigate("/estoque")} className="link-modulo text-sm">Abrir estoque</button>}>
            {fTipo && <div className="mb-3"><FiltrosAtivos filtros={[{ rotulo: "Tipo", valor: fTipo, limpar: () => setFTipo(null) }]} onLimpar={() => setFTipo(null)} /></div>}
            {abaixoFiltrado.length ? (
              <ul className="space-y-2.5">
                {abaixoFiltrado.map((p) => {
                  const pct = Math.min(100, (qtd(p) / Math.max(1, Number(p.estoque_minimo))) * 100);
                  return (
                    <li key={p.id}>
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-slate-700">{p.descricao}</span>
                        <span className="num shrink-0 font-semibold text-fg">{qtd(p).toLocaleString("pt-BR")} <span className="font-normal text-slate-500">/ mín. {Number(p.estoque_minimo).toLocaleString("pt-BR")} {p.unidade}</span></span>
                      </div>
                      <div className="h-2 rounded-r bg-slate-100"><div className="h-2 rounded-r" style={{ width: `${Math.max(pct, 2)}%`, background: qtd(p) <= 0 ? "rgb(var(--red-500))" : "var(--kpi-laranja)" }} /></div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="py-8 text-center text-sm text-slate-500">Nenhum item no mínimo{fTipo ? " deste tipo" : ""}. ✅</p>}
          </Section>
        ) },
        { id: "atalhos", titulo: "Ir para", largo: true, conteudo: (
          <div className="space-y-3">
            <h2 className="flex items-center gap-2 px-1 text-sm font-bold text-fg"><span className="h-4 w-1 rounded-full bg-modulo" aria-hidden />Ir para</h2>
            <AtalhosArea itens={[
              { rotulo: "OP - Ordem de Produção", icone: Factory, to: "/producao", aviso: k.opsComFalta, tela: "producao" },
              ...(verCompras ? [
                { rotulo: "Reposição de Estoque (base 90 dias)", icone: Boxes, to: "/compras", state: { aba: "reposicao" }, aviso: k.abaixo.length },
                { rotulo: "OC - Ordem de Compras", icone: ShoppingBag, to: "/compras", state: { aba: "compras" }, aviso: k.comprasAtrasadas.length },
              ] : []),
              { rotulo: "Ficha técnica", icone: Wrench, to: "/producao", state: { aba: "ficha" }, tela: "producao" },
              { rotulo: "Produtos e estoque", icone: Warehouse, to: "/estoque", tela: "estoque" },
              { rotulo: "Transferências", icone: ArrowLeftRight, to: "/transferencias", aviso: transito, tela: "estoque" },
            ]} />
          </div>
        ) },
      ]} />
    </div>
  );
}
