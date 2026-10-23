// Relatório de giro do estoque: o que vende, o que está parado e para quantos dias o estoque dá, por produto e por
// categoria. As saídas vêm das vendas (pedidos e notas de venda sem pedido, como nos relatórios) e do consumo em
// OS e produção; o estoque é o de hoje (da unidade escolhida no topo, ou das duas).
import { useMemo, useState } from "react";
import { Download, PackageX, RefreshCw, Timer, TrendingUp } from "lucide-react";
import { Button, Card, chip, Field, PageHeader } from "@/components/ui";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import { baixarPlanilha } from "@/lib/exportar";
import { notifyError } from "@/lib/notify";
import { SELECT_NOTAS_VENDA, vendasDasNotas, type NotaVenda } from "@/lib/vendasNotas";
import { calcularGiro, SITUACOES, totaisGiro, type LinhaGiro, type ProdutoGiro, type Saida, type Situacao } from "@/lib/giroEstoque";
import type { Produto } from "@/lib/types";

const VALIDOS = ["aprovado", "faturado", "entregue"];
const TIPOS: Record<string, string> = { peca: "Peças", insumo: "Componentes", maquina: "Máquinas", acessorio: "Acessórios" };
const PERIODOS = [{ m: 3, r: "3 meses" }, { m: 6, r: "6 meses" }, { m: 12, r: "12 meses" }];
const ORDENS = { valorEstoque: "Mais dinheiro parado", saida: "Mais vendidos", cobertura: "Maior cobertura", diasSemVenda: "Mais tempo sem vender" } as const;

const mesesAtras = (m: number) => { const d = new Date(); d.setMonth(d.getMonth() - m); return d.toISOString().slice(0, 10); };
const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export default function GiroEstoque() {
  const { atual, filtrar } = useUnidade();
  const [inicio, setInicio] = useState(mesesAtras(12));
  const [fim, setFim] = useState(hoje());
  const [tipo, setTipo] = useState("");
  const [categoria, setCategoria] = useState("");
  const [marcador, setMarcador] = useState("");
  const [sit, setSit] = useState<Situacao | "">("");
  const [zerados, setZerados] = useState(false);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<keyof typeof ORDENS>("valorEstoque");
  const [limite, setLimite] = useState(100);

  const { data: produtos = [], isLoading } = useRows<Produto & ProdutoGiro>("produtos", { order: "descricao", ascending: true });
  const { data: saldos = [] } = useRows<{ produto_id: string; unidade_id: string; quantidade: number }>("estoque_unidade", { order: "produto_id" });
  const { data: itens = [] } = useRows<{ produto_id: string | null; quantidade: number; pedido: { status: string; created_at: string; aprovado_em: string | null; unidade_id: string | null } | null }>(
    "pedido_itens", { select: "id, produto_id, quantidade, pedido:pedidos!inner(status, created_at, aprovado_em, unidade_id)", order: "id", key: ["giro"] });
  const { data: notas = [] } = useRows<NotaVenda>("notas_fiscais", { select: SELECT_NOTAS_VENDA, key: ["vendas"] });
  const { data: consumo = [] } = useRows<{ produto_id: string; quantidade: number; created_at: string; unidade_id: string | null }>(
    "estoque_movimentos", { select: "produto_id, quantidade, created_at, unidade_id", order: "created_at", key: ["giro-consumo"],
      filtro: (q) => q.eq("tipo", "saida").in("referencia_tipo", ["os", "op", "producao", "baixa"]) });

  const { linhas, totais, total, categorias, marcadores } = useMemo(() => {
    const saldo = new Map<string, number>();
    for (const s of saldos) if (!atual || s.unidade_id === atual) saldo.set(s.produto_id, (saldo.get(s.produto_id) ?? 0) + Number(s.quantidade || 0));
    const saidas: Saida[] = [];
    for (const i of itens) {
      if (!i.produto_id || !i.pedido || !VALIDOS.includes(i.pedido.status) || (atual && i.pedido.unidade_id && i.pedido.unidade_id !== atual)) continue;
      saidas.push({ produto_id: i.produto_id, quantidade: Number(i.quantidade || 0), data: i.pedido.aprovado_em ?? i.pedido.created_at });
    }
    for (const p of filtrar(vendasDasNotas(notas, produtos).pedidos)) for (const i of p.itens) saidas.push({ produto_id: i.produto_id, quantidade: i.quantidade, data: p.created_at });
    for (const m of filtrar(consumo)) saidas.push({ produto_id: m.produto_id, quantidade: Math.abs(Number(m.quantidade || 0)), data: m.created_at });

    const base = produtos.filter((p) => p.ativo !== false && (!tipo || p.tipo === tipo) && (!marcador || (p.marcadores ?? []).includes(marcador)));
    let ls = calcularGiro(base, saldo, saidas, inicio, fim);
    const cats = [...new Set(ls.map((l) => l.categoria))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (categoria) ls = ls.filter((l) => l.categoria === categoria);
    if (!zerados) ls = ls.filter((l) => l.situacao !== "sem_movimento");
    const tot = totaisGiro(ls, inicio, fim);
    const geral = totaisGiro(ls, inicio, fim, () => "Total")[0];
    const marcs = [...new Set(produtos.flatMap((p) => p.marcadores ?? []))].sort();
    return { linhas: ls, totais: tot, total: geral, categorias: cats, marcadores: marcs };
  }, [produtos, saldos, itens, notas, consumo, atual, filtrar, inicio, fim, tipo, categoria, marcador, zerados]);

  const visiveis = linhas
    .filter((l) => (!sit || l.situacao === sit) && (!busca || `${l.descricao} ${l.sku}`.toLowerCase().includes(busca.toLowerCase())))
    .sort((a, b) => ordem === "saida" ? b.saida - a.saida
      : ordem === "cobertura" ? (b.cobertura ?? (b.saldo > 0 ? 1e9 : -1)) - (a.cobertura ?? (a.saldo > 0 ? 1e9 : -1))
      : ordem === "diasSemVenda" ? (b.diasSemVenda ?? 1e9) - (a.diasSemVenda ?? 1e9)
      : b.valorEstoque - a.valorEstoque);
  const porSit = (s: Situacao) => linhas.filter((l) => l.situacao === s);

  async function exportar() {
    try {
      await baixarPlanilha("giro-estoque", [
        { nome: "Produtos", linhas: visiveis.map((l) => ({
          Produto: l.descricao, SKU: l.sku, Categoria: l.categoria, Tipo: TIPOS[l.tipo] ?? l.tipo, Situação: SITUACOES[l.situacao].rotulo,
          "Saída no período": l.saida, "Estoque hoje": l.saldo, "Custo unitário": l.custo, "Valor em estoque": l.valorEstoque,
          Giro: l.giro ?? "", "Cobertura (dias)": l.cobertura ?? "", "Última saída": l.ultimaSaida ?? "", "Dias sem vender": l.diasSemVenda ?? "",
        })) },
        { nome: "Categorias", linhas: totais.map((t) => ({
          Categoria: t.chave, Itens: t.itens, "Valor vendido (custo)": t.valorSaida, "Valor em estoque": t.valorEstoque,
          Giro: t.giro ?? "", "Cobertura (dias)": t.cobertura ?? "", Parados: t.parados, "Valor parado": t.valorParado,
        })) },
      ]);
    } catch (e) { notifyError(e); }
  }

  return (
    <div>
      <PageHeader title="Giro de estoque" subtitle="O que vende, o que está parado e para quantos dias o estoque dá (a custo)"
        actions={<Button variant="secondary" onClick={exportar}><Download size={16} /> Excel</Button>} />

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Indicador icone={<RefreshCw size={16} />} titulo="Giro no período" valor={total?.giro != null ? `${num(total.giro)}×` : "—"} detalhe="saída ÷ estoque de hoje, a custo" cor="text-sky-600" />
        <Indicador icone={<Timer size={16} />} titulo="Cobertura" valor={total?.cobertura != null ? `${total.cobertura} dias` : "—"} detalhe="o estoque dura, no ritmo do período" cor="text-violet-600" />
        <Indicador icone={<TrendingUp size={16} />} titulo="Em estoque" valor={brl(total?.valorEstoque ?? 0)} detalhe={`${total?.itens ?? 0} ${pl(total?.itens ?? 0, "item", "itens")}`} cor="text-emerald-600" />
        <Indicador icone={<PackageX size={16} />} titulo="Parado" valor={brl(total?.valorParado ?? 0)} detalhe={`${total?.parados ?? 0} ${pl(total?.parados ?? 0, "item sem venda", "itens sem venda")}`} cor="text-orange-600"
          onClick={() => setSit(sit === "parado" ? "" : "parado")} />
      </div>

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex gap-1">
            {PERIODOS.map((p) => (
              <button key={p.m} type="button" onClick={() => { setInicio(mesesAtras(p.m)); setFim(hoje()); }}
                className={`${chip(inicio === mesesAtras(p.m) && fim === hoje())} py-2`}>{p.r}</button>
            ))}
          </div>
          <Field label="De" className="w-36"><input type="date" className="input" value={inicio} onChange={(e) => setInicio(e.target.value)} /></Field>
          <Field label="Até" className="w-36"><input type="date" className="input" value={fim} onChange={(e) => setFim(e.target.value)} /></Field>
          <Field label="Tipo" className="w-36">
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos</option>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Categoria" className="w-44">
            <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todas</option>{categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          {marcadores.length > 0 && (
            <Field label="Marcador" className="w-40">
              <select className="input" value={marcador} onChange={(e) => setMarcador(e.target.value)}>
                <option value="">Todos</option>{marcadores.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          )}
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={zerados} onChange={(e) => setZerados(e.target.checked)} /> Incluir zerados</label>
        </div>
      </Card>

      <div className="faixa-chips mb-3">
        <Chip ativo={!sit} onClick={() => setSit("")}>Todos · {linhas.length}</Chip>
        {(Object.keys(SITUACOES) as Situacao[]).filter((s) => s !== "sem_movimento" || zerados).map((s) => (
          <Chip key={s} ativo={sit === s} onClick={() => setSit(sit === s ? "" : s)} titulo={SITUACOES[s].texto}>{SITUACOES[s].rotulo} · {porSit(s).length}</Chip>
        ))}
      </div>

      {!categoria && totais.length > 1 && (
        <Card className="mb-3 overflow-x-auto p-0">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr><th className="px-3 py-2">Categoria</th><th className="px-3 py-2 text-right">Em estoque</th><th className="px-3 py-2 text-right">Giro</th><th className="px-3 py-2 text-right">Cobertura</th><th className="px-3 py-2 text-right">Parado</th></tr>
            </thead>
            <tbody>
              {totais.slice(0, 15).map((t) => (
                <tr key={t.chave} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setCategoria(t.chave)}>
                  <td className="px-3 py-2 font-semibold">{t.chave} <span className="text-xs font-normal text-slate-400">· {t.itens}</span></td>
                  <td className="px-3 py-2 text-right">{brl(t.valorEstoque)}</td>
                  <td className="px-3 py-2 text-right">{t.giro != null ? `${num(t.giro)}×` : "—"}</td>
                  <td className="px-3 py-2 text-right">{t.cobertura != null ? `${t.cobertura} d` : "—"}</td>
                  <td className="px-3 py-2 text-right text-orange-700">{t.valorParado ? brl(t.valorParado) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="mb-2 flex flex-wrap items-end gap-2">
        <Field label="Buscar" className="min-w-[10rem] flex-1"><input className="input" value={busca} placeholder="Produto ou SKU" onChange={(e) => setBusca(e.target.value)} /></Field>
        <Field label="Ordenar" className="w-52">
          <select className="input" value={ordem} onChange={(e) => setOrdem(e.target.value as keyof typeof ORDENS)}>
            {Object.entries(ORDENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      {isLoading && <Card className="p-6 text-center text-sm text-slate-500">Carregando…</Card>}
      <ul className="space-y-2">
        {visiveis.slice(0, limite).map((l) => <LinhaProduto key={l.id} l={l} />)}
      </ul>
      {visiveis.length > limite && <div className="mt-3 text-center"><Button variant="secondary" onClick={() => setLimite(limite + 100)}>Mostrar mais ({visiveis.length - limite})</Button></div>}
      {!isLoading && !visiveis.length && <Card className="p-6 text-center text-sm text-slate-500">Nenhum produto neste filtro.</Card>}
    </div>
  );
}

function LinhaProduto({ l }: { l: LinhaGiro }) {
  const s = SITUACOES[l.situacao];
  return (
    <li>
      <Card className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
        <div className="min-w-0 flex-1 basis-56">
          <div className="truncate font-semibold text-fg" title={l.descricao}>{l.descricao}</div>
          <div className="text-xs text-slate-500">{[l.sku, l.categoria, TIPOS[l.tipo]].filter(Boolean).join(" · ")}</div>
        </div>
        <span title={s.texto} className={`rounded-full px-2 py-0.5 text-2xs font-bold ${s.cor}`}>{s.rotulo}</span>
        <Dado rotulo="Saída" valor={num(l.saida)} />
        <Dado rotulo="Estoque" valor={num(l.saldo)} />
        <Dado rotulo="Valor" valor={brl(l.valorEstoque)} />
        <Dado rotulo="Cobertura" valor={l.cobertura != null ? `${l.cobertura} d` : "—"} />
        <Dado rotulo="Última saída" valor={l.ultimaSaida ? dataBR(l.ultimaSaida) : "nunca"} />
      </Card>
    </li>
  );
}

const Dado = ({ rotulo, valor }: { rotulo: string; valor: string }) => (
  <div className="min-w-[4.5rem] text-right"><div className="text-2xs uppercase tracking-wide text-slate-400">{rotulo}</div><div className="text-sm font-semibold">{valor}</div></div>
);

function Chip({ ativo, onClick, children, titulo }: { ativo: boolean; onClick: () => void; children: React.ReactNode; titulo?: string }) {
  return (
    <button type="button" title={titulo} aria-pressed={ativo} onClick={onClick}
      className={chip(ativo)}>{children}</button>
  );
}

function Indicador({ icone, titulo, valor, detalhe, cor, onClick }: { icone: React.ReactNode; titulo: string; valor: string; detalhe: string; cor: string; onClick?: () => void }) {
  const C = onClick ? "button" : "div";
  return (
    <C type={onClick ? "button" : undefined} onClick={onClick} className="cartao p-3 text-left">
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${cor}`}>{icone}{titulo}</div>
      <div className="mt-1 text-lg font-bold text-fg">{valor}</div>
      <div className="text-xs text-slate-500">{detalhe}</div>
    </C>
  );
}
