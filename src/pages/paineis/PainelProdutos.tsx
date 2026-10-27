// Painel dos produtos: o que mais vende e quanto sobra de margem, a curva ABC, o que vai acabar no ritmo de venda,
// o dinheiro parado no estoque e como está o cadastro. Os botões de tipo e as categorias filtram o painel inteiro.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, Barcode, Boxes, CircleDollarSign, Clock, FileWarning, Gauge, Hourglass, Package, PackageX, Percent, PieChart, ShoppingBag,
  TrendingDown, Warehouse, Wrench,
} from "lucide-react";
import { Section } from "@/components/ui";
import { Secoes } from "@/components/Secoes";
import { Colunas, Ranking, Rosca } from "@/components/Charts";
import {
  AtalhosArea, baldes, CabecalhoPainel, CartaoPainel, dentro, FiltrosAtivos, frasePeriodo, intervalos, ListaAtencao, PERIODOS, usePeriodo, variacao,
  type Cartao, type ItemAtencao,
} from "@/components/painel/Painel";
import { useRows } from "@/lib/data";
import { SELECT_LISTA_PRODUTOS } from "@/lib/produtosLista";
import { useUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje, somarDias, pl } from "@/lib/format";
import { curvaABC, resumoABC, vendasDaEmpresa } from "@/lib/gerencial";
import {
  diasDeEstoque, linhasVendidas, margemPct, SELECT_NOTAS_VENDAS, SELECT_PEDIDOS_VENDAS, somarPorProduto, ultimaVenda,
} from "@/lib/paineisProdutos";
import type { Produto } from "@/lib/types";

const TIPOS: { id: string; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "peca", rotulo: "Peças de reposição" },
  { id: "acessorio", rotulo: "Acessórios" },
  { id: "insumo", rotulo: "Componentes" },
  { id: "maquina", rotulo: "Máquinas" },
];
const CORES = ["var(--serie-1)", "var(--serie-3)", "var(--serie-2)", "var(--kpi-roxo)", "var(--kpi-rosa)", "var(--kpi-ciano)", "var(--kpi-laranja)", "var(--eixo-texto)"];
const COR_ABC = { A: "var(--serie-3)", B: "var(--serie-2)", C: "var(--eixo-texto)" } as const;
const categoriaDe = (p?: Produto | null) => p?.categoria?.trim() || "Sem categoria";
const soma = (l: { quantidade: number }[]) => l.reduce((s, x) => s + x.quantidade, 0);
const valor = (l: { valor: number }[]) => l.reduce((s, x) => s + x.valor, 0);
const qtdTxt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export default function PainelProdutos() {
  const navigate = useNavigate();
  const { filtrar, atual: unidade } = useUnidade();
  const { data: pedidos = [], isLoading } = useRows<any>("pedidos", { select: SELECT_PEDIDOS_VENDAS, key: ["gerencial"] });
  const { data: notas = [] } = useRows<any>("notas_fiscais", { select: SELECT_NOTAS_VENDAS, key: ["gerencial"] });
  const { data: produtos = [] } = useRows<Produto>("produtos", { select: SELECT_LISTA_PRODUTOS, order: "descricao", ascending: true });
  const { data: saldos = [] } = useRows<{ produto_id: string; unidade_id: string; quantidade: number }>("estoque_unidade", { order: "produto_id" });
  const [periodo, setPeriodo] = usePeriodo("produtos");
  const [tipo, setTipo] = useState("todos");
  const [fCategoria, setFCategoria] = useState<string | null>(null);
  const [classe, setClasse] = useState<"A" | "B" | "C">("A");
  const per = PERIODOS.find((p) => p.id === periodo)!;
  const dia = hoje();

  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const saldoUnidade = useMemo(() => new Map(saldos.filter((s) => s.unidade_id === unidade).map((s) => [s.produto_id, Number(s.quantidade)])), [saldos, unidade]);
  const qtd = (p: Produto) => (unidade ? saldoUnidade.get(p.id) ?? 0 : Number(p.estoque_atual ?? 0));

  // todas as vendas (pedidos do ERP + notas do sistema anterior), casadas com o cadastro, uma vez só
  const todasLinhas = useMemo(() => linhasVendidas(vendasDaEmpresa(filtrar(pedidos), filtrar(notas), []), produtos), [pedidos, notas, produtos, filtrar]);

  // tipo e categoria valem para o painel inteiro
  const entra = (p?: Produto | null) => !!p && (tipo === "todos" || p.tipo === tipo) && (!fCategoria || categoriaDe(p) === fCategoria);
  const doTipo = (p?: Produto | null) => !!p && (tipo === "todos" || p.tipo === tipo);

  const k = useMemo(() => {
    const { atual, anterior } = intervalos(periodo);
    const bs = baldes(periodo);
    const linhas = todasLinhas.filter((l) => entra(l.produtoId ? porId.get(l.produtoId) : null));
    const em = (f: [string, string], l = linhas) => l.filter((x) => dentro(x.data, f));
    const vAtual = em(atual), vAnt = em(anterior);
    const custoDe = (l: typeof linhas) => l.reduce((s, x) => s + x.quantidade * Number(porId.get(x.produtoId!)?.preco_custo ?? 0), 0);
    const lucro = (l: typeof linhas) => valor(l) - custoDe(l);

    const ativos = produtos.filter((p) => p.ativo !== false && !p.kit && entra(p));
    const valorEstoque = ativos.reduce((s, p) => s + Math.max(0, qtd(p)) * Number(p.preco_custo ?? 0), 0);
    // giro: custo do que saiu nos últimos 12 meses ÷ o estoque de hoje (a custo)
    const ano = em([somarDias(-364), dia]);
    const giro = valorEstoque > 0 ? custoDe(ano) / valorEstoque : null;

    // ritmo de venda (90 dias) e última venda de cada produto
    const corte90 = somarDias(-89);
    const v90 = somarPorProduto(linhas.filter((l) => l.data >= corte90));
    const ultima = ultimaVenda(linhas);
    const corte180 = somarDias(-180);
    const parados = ativos.filter((p) => qtd(p) > 0 && (ultima.get(p.id) ?? "") < corte180 && (!p.created_at || p.created_at.slice(0, 10) < corte180))
      .map((p) => ({ p, valor: qtd(p) * Number(p.preco_custo ?? 0), ultima: ultima.get(p.id) ?? null }))
      .sort((a, b) => b.valor - a.valor);
    // vai faltar: o estoque não chega ao fim do prazo de reposição no ritmo de venda
    const vaiFaltar = ativos.filter((p) => !p.sob_encomenda && !p.fora_de_linha).map((p) => {
      const vendeu = v90.get(p.id)?.quantidade ?? 0;
      const prazo = Number(p.prazo_reposicao_dias ?? 0) || 15;
      return { p, vendeu, prazo, dias: diasDeEstoque(Math.max(0, qtd(p)), vendeu) };
    }).filter((x) => x.dias != null && x.dias <= x.prazo).sort((a, b) => a.dias! - b.dias! || b.vendeu - a.vendeu);

    // mais vendidos (período) com a margem pelo custo do cadastro
    const vendidosPer = [...somarPorProduto(vAtual).entries()].map(([chave, v]) => {
      const p = porId.get(chave);
      const custo = v.quantidade * Number(p?.preco_custo ?? 0);
      return { chave, nome: p?.descricao ?? chave.replace(/^nome:/, ""), ...v, margem: p && Number(p.preco_custo) > 0 ? margemPct(v.valor, custo) : null };
    }).sort((a, b) => b.valor - a.valor);

    // curva ABC dos últimos 12 meses (o que sustenta o faturamento)
    const abc = curvaABC([...somarPorProduto(ano).entries()].map(([chave, v]) => ({ chave, rotulo: porId.get(chave)?.descricao ?? chave.replace(/^nome:/, ""), valor: v.valor, quantidade: v.quantidade, vezes: v.vezes })));

    // categorias (sem o filtro de categoria, para dar para trocar)
    const cats = new Map<string, number>();
    for (const l of em(atual, todasLinhas)) { const p = l.produtoId ? porId.get(l.produtoId) : null; if (doTipo(p)) cats.set(categoriaDe(p), (cats.get(categoriaDe(p)) ?? 0) + l.valor); }
    const catOrd = [...cats.entries()].sort((a, b) => b[1] - a[1]);
    const catTop = catOrd.length > 8 ? [...catOrd.slice(0, 7), ["Outras", catOrd.slice(7).reduce((s, [, v]) => s + v, 0)] as [string, number]] : catOrd;

    // cadastro: o que está preenchido nos ativos
    const vendaveis = ativos.filter((p) => p.vendavel !== false && p.tipo !== "insumo");
    const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
    const qualidade = [
      { rotulo: "NCM válido (8 dígitos)", n: ativos.filter((p) => /^\d{8}$/.test(String(p.ncm ?? "").replace(/\D/g, ""))).length, base: ativos.length },
      { rotulo: "Custo", n: ativos.filter((p) => Number(p.preco_custo) > 0).length, base: ativos.length },
      { rotulo: "Preço de venda", n: vendaveis.filter((p) => Number(p.preco_venda) > 0).length, base: vendaveis.length },
      { rotulo: "Categoria", n: ativos.filter((p) => p.categoria?.trim()).length, base: ativos.length },
      { rotulo: "Peso e medidas (frete)", n: vendaveis.filter((p) => Number(p.peso_kg) > 0 && Number(p.altura_cm) > 0 && Number(p.largura_cm) > 0 && Number(p.profundidade_cm) > 0).length, base: vendaveis.length },
      { rotulo: "Foto", n: vendaveis.filter((p) => p.foto_caminho).length, base: vendaveis.length },
      { rotulo: "Código de barras", n: vendaveis.filter((p) => p.codigo_barras?.trim()).length, base: vendaveis.length },
    ].filter((q) => q.base).map((q) => ({ ...q, pct: pct(q.n, q.base) }));

    return {
      faturamento: valor(vAtual), dFaturamento: variacao(valor(vAtual), valor(vAnt)),
      lucro: lucro(vAtual), margem: margemPct(valor(vAtual), custoDe(vAtual)), dLucro: variacao(lucro(vAtual), lucro(vAnt)),
      unidades: soma(vAtual), diferentes: new Set(vAtual.map((l) => l.produtoId ?? l.descricao)).size,
      serie: bs.map((b) => ({ rotulo: b.rotulo, valores: [valor(em(b.atual)), valor(em(b.anterior))] })),
      tendFat: bs.map((b) => valor(em(b.atual))), tendLucro: bs.map((b) => lucro(em(b.atual))),
      valorEstoque, giro, ativos: ativos.length,
      parados, valorParado: parados.reduce((s, x) => s + x.valor, 0), vaiFaltar,
      vendidos: vendidosPer.slice(0, 8), abc, resumoAbc: resumoABC(abc), cats: catTop, qualidade,
      abaixoCusto: ativos.filter((p) => Number(p.preco_venda) > 0 && Number(p.preco_custo) > Number(p.preco_venda)),
      semPreco: ativos.filter((p) => p.vendavel !== false && p.tipo !== "insumo" && !(Number(p.preco_venda) > 0)),
      semNcm: ativos.filter((p) => !/^\d{8}$/.test(String(p.ncm ?? "").replace(/\D/g, ""))),
      negativo: ativos.filter((p) => qtd(p) < 0),
      semCusto: ativos.filter((p) => !(Number(p.preco_custo) > 0)),
    };
  }, [periodo, tipo, fCategoria, todasLinhas, produtos, porId, saldoUnidade, unidade, dia]); // eslint-disable-line react-hooks/exhaustive-deps

  const coberturaDias = k.giro ? Math.round(365 / k.giro) : null;
  const cartoes: Cartao[] = [
    { id: "fat", rotulo: "Vendido em produtos", valor: brl(k.faturamento), icone: ShoppingBag, cor: "var(--kpi-verde)", delta: k.dFaturamento, tendencia: k.tendFat,
      sub: `${qtdTxt(k.unidades)} ${pl(qtdTxt(k.unidades), "unidade", "unidades")} de ${k.diferentes} ${pl(k.diferentes, "produto", "produtos")}`, onClick: () => navigate("/pedidos") },
    { id: "lucro", rotulo: "Lucro bruto", valor: brl(k.lucro), icone: Percent, cor: "var(--kpi-azul)", delta: k.dLucro, tendencia: k.tendLucro,
      sub: k.margem == null ? "sem venda no período" : `margem de ${Math.round(k.margem)}% sobre o vendido`, titulo: "Preço vendido menos o custo atual do cadastro (sem impostos, frete e comissão; a margem completa fica em Análises → Margem)", onClick: () => navigate("/margem") },
    { id: "estoque", rotulo: "Dinheiro no estoque", valor: brl(k.valorEstoque), icone: Warehouse, cor: "var(--kpi-roxo)",
      sub: k.giro ? `gira ${k.giro.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}× por ano · dá para ~${coberturaDias} dias` : `${k.ativos} ${pl(k.ativos, "produto", "produtos")} ativos · a preço de custo`, onClick: () => navigate("/estoque") },
    { id: "parado", rotulo: "Parado há 6 meses", valor: brl(k.valorParado), icone: Hourglass, cor: "var(--kpi-laranja)",
      sub: `${k.parados.length} ${pl(k.parados.length, "produto", "produtos")} com estoque e sem venda`, titulo: "Produtos com estoque que não venderam nos últimos 180 dias (a custo)" },
  ];

  const atencao: ItemAtencao[] = [
    k.vaiFaltar.length > 0 && { icone: PackageX, cor: "var(--kpi-rosa)", texto: `${k.vaiFaltar.length} ${pl(k.vaiFaltar.length, "produto", "produtos")} acabam antes de chegar reposição`, sub: k.vaiFaltar.slice(0, 3).map((x) => x.p.descricao).join(" · "), to: "/compras", state: { aba: "reposicao" } },
    k.abaixoCusto.length > 0 && { icone: TrendingDown, cor: "var(--kpi-rosa)", texto: `${k.abaixoCusto.length} ${pl(k.abaixoCusto.length, "produto", "produtos")} com preço abaixo do custo`, sub: "cada venda dá prejuízo", to: "/estoque" },
    k.negativo.length > 0 && { icone: AlertTriangle, cor: "var(--kpi-rosa)", texto: `${k.negativo.length} ${pl(k.negativo.length, "produto", "produtos")} com estoque negativo`, sub: "falta lançar entrada ou houve baixa errada", to: "/estoque" },
    k.semPreco.length > 0 && { icone: CircleDollarSign, cor: "var(--kpi-laranja)", texto: `${k.semPreco.length} ${pl(k.semPreco.length, "produto", "produtos")} à venda sem preço`, to: "/estoque" },
    k.semNcm.length > 0 && { icone: FileWarning, cor: "var(--kpi-laranja)", texto: `${k.semNcm.length} ${pl(k.semNcm.length, "produto", "produtos")} sem NCM válido`, sub: "a NF-e é rejeitada", to: "/estoque" },
    k.semCusto.length > 0 && { icone: Gauge, cor: "var(--kpi-roxo)", texto: `${k.semCusto.length} ${pl(k.semCusto.length, "produto", "produtos")} sem custo`, sub: "sem custo não dá para saber a margem", to: "/estoque" },
  ].filter(Boolean) as ItemAtencao[];

  const filtros = fCategoria ? [{ rotulo: "Categoria", valor: fCategoria, limpar: () => setFCategoria(null) }] : [];
  const linhasClasse = k.abc.filter((l) => l.classe === classe);
  const resumo = isLoading ? "Carregando…"
    : <>{brl(k.faturamento)} vendidos {periodo === "hoje" ? "hoje" : "no período"}{frasePeriodo(k.dFaturamento, periodo) ? ` (${frasePeriodo(k.dFaturamento, periodo)})` : ""}{k.margem != null ? ` · margem bruta de ${Math.round(k.margem)}%` : ""} · {brl(k.valorEstoque)} no estoque.</>;

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPainel icone={Boxes} area="Produtos" titulo="Como estão os produtos" resumo={resumo} periodo={periodo} onPeriodo={setPeriodo} />

      <div role="tablist" aria-label="Tipo de produto" className="flex gap-1.5 overflow-x-auto pb-1">
        {TIPOS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tipo === t.id} onClick={() => { setTipo(t.id); setFCategoria(null); }}
            className={`min-h-[40px] shrink-0 whitespace-nowrap rounded-xl px-4 text-sm font-bold transition ${tipo === t.id ? "bg-modulo text-white shadow" : "border border-slate-200 bg-surface text-slate-600 hover:border-slate-300"}`}>
            {t.rotulo}
          </button>
        ))}
      </div>
      {filtros.length > 0 && <FiltrosAtivos filtros={filtros} onLimpar={() => setFCategoria(null)} />}

      {/* seções que a pessoa pode reordenar no "Organizar" (fica no perfil dela) */}
      <Secoes pagina="painel-produtos" secoes={[
        { id: "cartoes", titulo: "Números", largo: true, conteudo: (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {cartoes.map((c) => <CartaoPainel key={c.id} c={c} anterior={per.anterior} />)}
          </div>
        ) },
        { id: "vendas", titulo: "Vendas", conteudo: (
          <Section title={periodo === "ano" ? "Vendas mês a mês" : "Vendas"} className="h-full">
            <Colunas dados={k.serie} altura={250} vazio="Nenhuma venda no período."
              series={[{ nome: "Vendido", cor: "var(--serie-1)" }, { nome: per.anterior[0].toUpperCase() + per.anterior.slice(1), cor: "var(--serie-2)" }]} />
          </Section>
        ) },
        { id: "atencao", titulo: "Precisa de atenção", conteudo: (
          <Section title="Precisa de atenção" className="h-full">
            <ListaAtencao itens={atencao} vazio="Produtos sem pendências" />
          </Section>
        ) },
        { id: "mais-vendidos", titulo: "Mais vendidos", conteudo: (
          <Section title="Mais vendidos" className="h-full" actions={<button type="button" onClick={() => navigate("/margem")} className="link-modulo text-sm">Margem completa</button>}>
            <Ranking cor="var(--serie-1)" vazio="Nenhuma venda no período."
              itens={k.vendidos.map((v) => ({ rotulo: v.nome, valor: v.valor, detalhe: `${qtdTxt(v.quantidade)} un.${v.margem != null ? ` · margem ${Math.round(v.margem)}%` : " · sem custo no cadastro"}` }))} />
          </Section>
        ) },
        { id: "categorias", titulo: "Vendas por categoria", conteudo: (
          <Section title="Vendas por categoria" className="h-full" actions={<span className="text-xs text-slate-500">toque para filtrar</span>}>
            {k.cats.length
              ? <Rosca total="Vendido" ativo={fCategoria} onClicar={(i) => { const c = k.cats[i][0]; if (c !== "Outras") setFCategoria(fCategoria === c ? null : c); }}
                  fatias={k.cats.map(([rotulo, v], i) => ({ rotulo, valor: v, cor: CORES[i % CORES.length] }))} />
              : <p className="py-10 text-center text-sm text-slate-500">Nenhuma venda no período.</p>}
          </Section>
        ) },
        { id: "abc", titulo: "Curva ABC (12 meses)", conteudo: (
          <Section title="Curva ABC (12 meses)" className="h-full">
            {k.abc.length ? (
              <>
                <div className="flex h-4 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  {k.resumoAbc.map((r) => <span key={r.classe} style={{ width: `${r.pctValor}%`, background: COR_ABC[r.classe] }} />)}
                </div>
                <div role="tablist" aria-label="Classe da curva ABC" className="mt-3 grid grid-cols-3 gap-2">
                  {k.resumoAbc.map((r) => (
                    <button key={r.classe} type="button" role="tab" aria-selected={classe === r.classe} onClick={() => setClasse(r.classe)}
                      className={`rounded-xl border p-2.5 text-left transition ${classe === r.classe ? "border-modulo bg-modulo/10" : "border-slate-200 hover:border-slate-300"}`}>
                      <span className="flex items-center gap-1.5 text-sm font-bold text-fg"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COR_ABC[r.classe] }} />Classe {r.classe}</span>
                      <span className="num mt-0.5 block text-lg font-bold text-fg">{r.pctValor}%</span>
                      <span className="block text-xs leading-snug text-slate-600">do faturamento · {r.itens} {pl(r.itens, "produto", "produtos")}</span>
                    </button>
                  ))}
                </div>
                <ul className="mt-3 divide-y divide-slate-100">
                  {linhasClasse.slice(0, 6).map((l) => (
                    <li key={l.chave} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                      <span className="min-w-0 truncate text-slate-700">{l.rotulo}</span>
                      <span className="num shrink-0 font-semibold text-fg">{brl(l.valor)} <span className="font-normal text-slate-500">· {l.pct}%</span></span>
                    </li>
                  ))}
                  {linhasClasse.length > 6 && <li className="pt-1.5 text-center text-xs text-slate-500">e mais {linhasClasse.length - 6} na classe {classe}</li>}
                </ul>
              </>
            ) : <p className="py-10 text-center text-sm text-slate-500">Sem vendas nos últimos 12 meses.</p>}
          </Section>
        ) },
        { id: "vai-faltar", titulo: "Vai acabar antes da reposição chegar", conteudo: (
          <Section title="Vai acabar antes da reposição chegar" className="h-full"
            actions={<button type="button" onClick={() => navigate("/compras", { state: { aba: "reposicao" } })} className="link-modulo text-sm">Repor</button>}>
            {k.vaiFaltar.length ? (
              <ul className="space-y-2.5">
                {k.vaiFaltar.slice(0, 7).map((x) => {
                  const pct = Math.min(100, ((x.dias ?? 0) / Math.max(1, x.prazo)) * 100);
                  return (
                    <li key={x.p.id}>
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-slate-700">{x.p.descricao}</span>
                        <span className={`num shrink-0 font-semibold ${x.dias === 0 ? "text-red-600" : "text-fg"}`}>
                          {x.dias === 0 ? "sem estoque" : `acaba em ~${x.dias} ${pl(x.dias, "dia", "dias")}`} <span className="font-normal text-slate-500">· repor leva {x.prazo}</span>
                        </span>
                      </div>
                      <div className="h-2 rounded-r bg-slate-100"><div className="h-2 rounded-r" style={{ width: `${Math.max(pct, 2)}%`, background: x.dias === 0 ? "rgb(var(--red-500))" : "var(--kpi-laranja)" }} /></div>
                      <span className="mt-0.5 block text-xs text-slate-500">{qtdTxt(Math.max(0, qtd(x.p)))} {x.p.unidade} no estoque · vendeu {qtdTxt(x.vendeu)} em 90 dias</span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="py-8 text-center text-sm text-slate-500">Nada vai faltar no ritmo de venda atual. ✅</p>}
          </Section>
        ) },
        { id: "parados", titulo: "Parados há 6 meses (mais dinheiro primeiro)", conteudo: (
          <Section title="Parados há 6 meses (mais dinheiro primeiro)" className="h-full" actions={<button type="button" onClick={() => navigate("/estoque")} className="link-modulo text-sm">Estoque</button>}>
            {k.parados.length ? (
              <ul className="divide-y divide-slate-100">
                {k.parados.slice(0, 7).map((x) => (
                  <li key={x.p.id} className="flex items-center gap-3 py-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-modulo/10 text-modulo-texto"><Clock size={17} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">{x.p.descricao}</span>
                      <span className="block text-xs text-slate-500">{qtdTxt(qtd(x.p))} {x.p.unidade} · {x.ultima ? `última venda ${dataBR(x.ultima)}` : "nunca vendeu"}</span>
                    </span>
                    <span className="num shrink-0 text-sm font-bold text-fg">{brl(x.valor)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="py-8 text-center text-sm text-slate-500">Nenhum produto parado. ✅</p>}
          </Section>
        ) },
        { id: "cadastro", titulo: "Cadastro: o que está preenchido", conteudo: (
          <Section title="Cadastro: o que está preenchido" className="h-full" actions={<button type="button" onClick={() => navigate("/estoque")} className="link-modulo text-sm">Arrumar</button>}>
            <Ranking cor="var(--serie-3)" formatar={(v) => `${v}%`} vazio="Nenhum produto ativo." onClicar={() => navigate("/estoque")}
              itens={k.qualidade.map((q) => ({ rotulo: q.rotulo, valor: q.pct, detalhe: `${q.n.toLocaleString("pt-BR")} de ${q.base.toLocaleString("pt-BR")}` }))} />
          </Section>
        ) },
        { id: "atalhos", titulo: "Ir para", largo: true, conteudo: (
          <div className="space-y-3">
            <h2 className="flex items-center gap-2 px-1 text-sm font-bold text-fg"><span className="h-4 w-1 rounded-full bg-modulo" aria-hidden />Ir para</h2>
            <AtalhosArea itens={[
              { rotulo: "Todos os produtos", icone: Boxes, to: "/estoque", aviso: k.negativo.length, tela: "estoque" },
              { rotulo: "Peças à venda", icone: Wrench, to: "/produtos/pecas", tela: "estoque" },
                { rotulo: "Tornearia", icone: Wrench, to: "/produtos/tornearia", tela: "estoque" },
              { rotulo: "Insumos", icone: Package, to: "/produtos/componentes", tela: "estoque" },
              { rotulo: "Reposição", icone: PackageX, to: "/compras", state: { aba: "reposicao" }, aviso: k.vaiFaltar.length, tela: "producao" },
              { rotulo: "Margem", icone: PieChart, to: "/margem", tela: "margem" },
              { rotulo: "Painel gerencial", icone: Barcode, to: "/gerencial", tela: "relatorios" },
            ]} />
          </div>
        ) },
      ]} />
    </div>
  );
}
