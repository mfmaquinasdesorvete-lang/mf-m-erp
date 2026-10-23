// Margem de contribuição: lucro de verdade de cada venda, produto, canal, vendedor, cliente e unidade.
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDownWideNarrow, ArrowRight, CheckCircle2, FileDown, Lightbulb, Percent, Sparkles, TrendingUp, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, CampoMes, chip, PageHeader, Section, Stat, Table, Tabs } from "@/components/ui";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { useConfig } from "@/lib/useConfig";
import { brl, dataBR, pl } from "@/lib/format";
import { baixarPlanilha } from "@/lib/exportar";
import { notifyError } from "@/lib/notify";
import type { RegraComissao } from "@/lib/comissao";
import { CANAIS, margemPedido, pctMc, somar, zero, type Contexto, type PedidoMargem, type Valores } from "@/lib/margem";
import type { KitComponente, Produto, Vendedor } from "@/lib/types";
import { rotuloVenda, SELECT_NOTAS_VENDA, vendasDasNotas, type NotaVenda } from "@/lib/vendasNotas";
import { conselhosMargem, type Conselho } from "@/lib/conselheiroMargem";
import { CruzamentoLivre, type FatoVenda } from "@/components/margem/CruzamentoLivre";

const VALIDOS = ["aprovado", "faturado", "entregue"];
type Visao = "venda" | "produto" | "canal" | "vendedor" | "cliente" | "unidade";
type Linha = Valores & { chave: string; nome: string; detalhe?: string; qtd: number; estimado?: boolean };

const mesAtual = () => new Date().toISOString().slice(0, 7);
const mesesAtras = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 7); };
const pctTxt = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export default function Margem() {
  const { filtrar, unidades, nome: nomeUnidade } = useUnidade();
  const { data: cfg } = useConfig();
  const { data: pedidosTodos = [] } = useRows<PedidoMargem>("pedidos", { select: "*, cliente:clientes(*), itens:pedido_itens(*)" });
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: comps = [] } = useRows<KitComponente>("kit_componentes", { order: "kit_id" });
  const { data: vendedores = [] } = useRows<Vendedor>("vendedores", { order: "nome", ascending: true });
  const { data: regrasComissao = [] } = useRows<RegraComissao>("comissao_regras");
  const { data: comissoes = [] } = useRows<{ pedido_id: string; valor: number; status: string }>("comissoes", {});
  const { data: cotacoes = [] } = useRows<{ pedido_id: string; valor: number; escolhida: boolean }>("cotacoes_frete", {});
  const { data: formas = [] } = useRows<{ id: string; taxa_percentual: number; tarifa_fixa: number }>("formas_pagamento", { order: "ordem", ascending: true });
  const { data: envios = [] } = useRows<{ pedido_id: string | null; status: string; pagador: string; valor_aprovado: number | null; valor_final: number | null }>("envios", { order: "created_at", ascending: true });
  // as notas servem para os impostos reais de cada pedido e, sem pedido (importadas do Tiny), como a própria venda
  const { data: notas = [] } = useRows<NotaVenda>("notas_fiscais", { select: SELECT_NOTAS_VENDA, key: ["vendas"] });
  const { data: ufs = [] } = useRows<{ uf: string; aliquota_interna: number; fcp: number }>("icms_uf", { order: "uf", ascending: true });
  const [de, setDe] = useState(mesesAtras(2));
  const [ate, setAte] = useState(mesAtual());
  const [canal, setCanal] = useState("");
  const [visao, setVisao] = useState<Visao | "cruzar">("venda");
  const [ordem, setOrdem] = useState<"mc" | "pct" | "receita">("mc");

  const dados = useMemo(() => {
    if (!cfg) return null;
    const nv = vendasDasNotas(notas, produtos);
    const ctx: Contexto = { produtos, comps, unidades, vendedores, comissoes, cotacoes, notas: [...(notas as Contexto["notas"]), ...nv.notas], ufs, cfg, formas, envios, regrasComissao };
    const vendas = filtrar([...pedidosTodos, ...(nv.pedidos as PedidoMargem[])]).filter((p) => {
      const d = (p.aprovado_em ?? p.created_at).slice(0, 7);
      return VALIDOS.includes(p.status) && d >= de && d <= ate && (!canal || p.origem === canal);
    });
    const calc = vendas.map((p) => ({ p, r: margemPedido(p, ctx) }));
    const total = calc.reduce<Valores>((s, x) => somar(s, x.r.total), zero());
    // os grupos de cada visão (a tabela mostra um; o conselheiro lê produto, canal, vendedor e cliente)
    const agrupar = (vis: Visao) => {
      const grupos = new Map<string, Linha>();
      const add = (chave: string, nome: string, v: Valores, qtd: number, detalhe?: string, estimado?: boolean) => {
        const g = grupos.get(chave) ?? { ...zero(), chave, nome, detalhe, qtd: 0, estimado: false };
        Object.assign(g, somar(g, v)); g.qtd += qtd; g.estimado ||= !!estimado;
        grupos.set(chave, g);
      };
      for (const { p, r } of calc) {
        if (vis === "venda") add(p.id, `${rotuloVenda(p)} · ${p.cliente?.nome ?? ""}`, r.total, 1, `${dataBR(p.aprovado_em ?? p.created_at)} · ${CANAIS[p.origem] ?? p.origem}`, r.impostosEstimados);
        else if (vis === "produto") for (const i of r.itens) add(i.produto_id, i.descricao, i, i.quantidade, undefined, r.impostosEstimados);
        else if (vis === "canal") add(p.origem, CANAIS[p.origem] ?? p.origem, r.total, 1, undefined, r.impostosEstimados);
        else if (vis === "vendedor") { const v = vendedores.find((x) => x.id === p.vendedor_id); add(v?.id ?? p.vendedor ?? "-", v?.nome ?? p.vendedor ?? "Sem vendedor", r.total, 1, undefined, r.impostosEstimados); }
        else if (vis === "cliente") add(p.cliente_id, p.cliente?.nome ?? "—", r.total, 1, p.cliente?.municipio ? `${p.cliente.municipio}/${p.cliente.uf}` : undefined, r.impostosEstimados);
        else add(p.unidade_id ?? "-", nomeUnidade(p.unidade_id), r.total, 1, undefined, r.impostosEstimados);
      }
      return [...grupos.values()];
    };
    // cruzamento livre: cada item vendido vira um fato com tudo o que dá para cruzar
    const fatos: FatoVenda[] = calc.flatMap(({ p, r }) => {
      const v = vendedores.find((x) => x.id === p.vendedor_id);
      const base = {
        venda: p.id, mes: (p.aprovado_em ?? p.created_at).slice(0, 7), canal: CANAIS[p.origem] ?? p.origem ?? "(sem canal)",
        vendedor: v?.nome ?? p.vendedor ?? "Sem vendedor", cliente: p.cliente?.nome ?? "(sem cliente)", uf: p.cliente?.uf?.toUpperCase() || "(sem UF)", unidade: nomeUnidade(p.unidade_id),
      };
      return r.itens.map((i) => ({
        ...base, produto: i.descricao, categoria: produtos.find((x) => x.id === i.produto_id)?.categoria || "(sem categoria)",
        quantidade: i.quantidade, receita: i.receita, impostos: i.impostos, cmv: i.cmv, comissao: i.comissao, frete: i.frete, taxa: i.taxa, mc: i.mc,
      }));
    });
    const linhas = visao === "cruzar" ? [] : agrupar(visao).sort((a, b) => ordem === "pct" ? pctMc(b) - pctMc(a) : ordem === "receita" ? b.receita - a.receita : b.mc - a.mc);
    const deNotas = vendas.filter((p) => (p as { de_nota?: boolean }).de_nota);
    const semCusto = deNotas.reduce((s, p) => s + p.itens.filter((i) => i.produto_id.startsWith("nf-item:")).length, 0);
    const estimadas = calc.filter((x) => x.r.impostosEstimados).length;
    const conselhos = conselhosMargem({
      total, produtos: agrupar("produto"), canais: agrupar("canal"), vendedores: agrupar("vendedor"), clientes: agrupar("cliente"),
      semCusto, estimadas, vendas: vendas.length,
    });
    return { total, linhas, n: vendas.length, estimadas, deNotas: deNotas.length, semCusto, conselhos, fatos };
  }, [cfg, produtos, comps, unidades, vendedores, regrasComissao, comissoes, cotacoes, formas, envios, notas, ufs, pedidosTodos, filtrar, de, ate, canal, visao, ordem, nomeUnidade]);

  function exportar() {
    if (!dados || visao === "cruzar") return;
    baixarPlanilha(`margem-${visao}`, [{ nome: "Margem de contribuição", linhas: dados.linhas.map((l) => ({
      [ROTULO[visao]]: l.nome, Detalhe: l.detalhe ?? "", [visao === "produto" ? "Quantidade" : "Pedidos"]: l.qtd,
      Receita: r2(l.receita), Impostos: r2(l.impostos), "Custo do produto": r2(l.cmv), Comissão: r2(l.comissao), Frete: r2(l.frete),
      "Taxa de pagamento": r2(l.taxa), "Margem de contribuição": r2(l.mc), "MC %": Math.round(pctMc(l) * 1000) / 10, "Impostos estimados": l.estimado ? "Sim" : "Não",
    })) }]).catch(notifyError);
  }

  const t = dados?.total ?? zero();
  const custos = t.impostos + t.cmv + t.comissao + t.frete + t.taxa;
  return (
    <div>
      <PageHeader title="Margem de contribuição" subtitle="Quanto sobra de cada venda depois dos impostos, do custo do produto, da comissão, do frete e da taxa do pagamento."
        actions={<Button variant="secondary" onClick={exportar} disabled={!dados?.linhas.length}><FileDown size={16} /> Exportar</Button>} />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex items-center gap-1 text-sm">De <CampoMes value={de} onChange={setDe} max={ate} rotulo="Do mês" /></div>
        <div className="flex items-center gap-1 text-sm">até <CampoMes value={ate} onChange={setAte} min={de} rotulo="Até o mês" /></div>
        <select className="input w-auto" value={canal} onChange={(e) => setCanal(e.target.value)}>
          <option value="">Todos os canais</option>
          {Object.entries(CANAIS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={TrendingUp} tom="info" label="Receita" valor={brl(t.receita)} sub={`${dados?.n ?? 0} ${pl(dados?.n ?? 0, "venda", "vendas")}`} />
        <Stat icon={Wallet} label="Custos variáveis" valor={brl(custos)} sub="impostos, produto, comissão, frete, taxas" />
        <Stat icon={ArrowDownWideNarrow} tom={t.mc < 0 ? "critico" : "bom"} label="Margem de contribuição" valor={brl(t.mc)} />
        <Stat icon={Percent} tom={pctMc(t) < 0.15 ? "atencao" : "bom"} label="Margem %" valor={pctTxt(pctMc(t))} sub="da receita" />
      </div>

      <Section title="Da receita à margem" className="mb-5">
        <Cascata t={t} />
        {dados && dados.estimadas > 0 && <p className="mt-3 text-xs text-slate-500">
          {dados.estimadas} {pl(dados.estimadas, "venda", "vendas")} sem NF-e autorizada: impostos estimados pelo cadastro da unidade (ICMS, DIFAL, PIS e COFINS). IPI não entra (é cobrado à parte do cliente).
          O custo do produto é o custo atual do cadastro.</p>}
        {dados && dados.deNotas > 0 && <p className="mt-2 text-xs text-slate-500">
          {dados.deNotas} {pl(dados.deNotas, "venda vem", "vendas vêm")} das notas fiscais sem pedido no ERP (importadas do Tiny): só os itens de venda (remessa, transferência, conserto e garantia ficam de fora),
          com os impostos destacados na nota. Sem vendedor, frete e taxa (não estão na nota).
          {dados.semCusto > 0 && <> {dados.semCusto} {pl(dados.semCusto, "item não foi achado", "itens não foram achados")} no cadastro de produtos pelo código ou pela descrição e {pl(dados.semCusto, "entra", "entram")} sem custo.</>}</p>}
      </Section>

      {dados && <Conselheiro conselhos={dados.conselhos} />}

      <Tabs value={visao} onChange={setVisao} options={[...(Object.keys(ROTULO) as Visao[]).map((v) => ({ value: v as Visao | "cruzar", label: `Por ${ROTULO[v].toLowerCase()}` })),
        { value: "cruzar", label: "Cruzar à vontade" }]} />
      {visao === "cruzar" ? (dados ? <CruzamentoLivre fatosVendas={dados.fatos} de={de} ate={ate} filtrar={filtrar} nomeUnidade={nomeUnidade} /> : <p className="text-sm text-slate-500">Carregando…</p>) : <>
      <div className="mb-2 flex justify-end gap-1 text-sm">
        Ordenar: {([["mc", "margem R$"], ["pct", "margem %"], ["receita", "receita"]] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setOrdem(v)} className={chip(ordem === v)}>{l}</button>
        ))}
      </div>
      {/* no notebook cabe sem rolar (quantidade embaixo do nome, margem e % na mesma coluna); no celular cada linha vira um cartão */}
      <Table
        head={<>
          <th className="th min-w-[180px] 2xl:min-w-[240px]">{ROTULO[visao]}</th>
          <th className="th text-right">Receita</th><th className="th text-right">Impostos</th><th className="th text-right">Produto</th>
          <th className="th text-right">Comissão</th><th className="th text-right">Frete</th><th className="th text-right">Taxas</th>
          <th className="th w-36 text-right">Margem</th>
        </>}>
        {dados?.linhas.map((l) => {
          const pc = pctMc(l);
          return (
            <tr key={l.chave}>
              <td className="td">
                <div className="font-medium text-fg">{l.nome}{l.estimado && <span title="impostos estimados" className="text-slate-400"> *</span>}</div>
                {l.detalhe && <div className="text-xs text-slate-500">{l.detalhe}</div>}
                <div className="text-xs text-slate-500">{l.qtd.toLocaleString("pt-BR")} {visao === "produto" ? "unid." : l.qtd === 1 ? "venda" : "vendas"}</div>
              </td>
              <td className="td num whitespace-nowrap text-right">{brl(l.receita)}</td>
              <td className="td num whitespace-nowrap text-right text-slate-600">{brl(l.impostos)}</td>
              <td className="td num whitespace-nowrap text-right text-slate-600">{brl(l.cmv)}</td>
              <td className="td num whitespace-nowrap text-right text-slate-600">{brl(l.comissao)}</td>
              <td className="td num whitespace-nowrap text-right text-slate-600">{brl(l.frete)}</td>
              <td className="td num whitespace-nowrap text-right text-slate-600">{brl(l.taxa)}</td>
              <td className="td text-right">
                <div className={`num whitespace-nowrap font-bold ${l.mc < 0 ? "text-red-600" : "text-fg"}`}>{brl(l.mc)}</div>
                <div className="mt-1 flex items-center justify-end gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pc * 100))}%`, background: pc < 0 ? "#dc2626" : pc < 0.15 ? "var(--serie-2)" : "var(--serie-1)" }} />
                  </div>
                  <span className={`num text-xs font-semibold ${pc < 0 ? "text-red-600" : "text-slate-600"}`}>{pctTxt(pc)}</span>
                </div>
              </td>
            </tr>
          );
        })}
      </Table>
      {!dados?.linhas.length && <p className="p-6 text-center text-sm text-slate-500">Sem vendas aprovadas no período.</p>}
      </>}
    </div>
  );
}

const ROTULO: Record<Visao, string> = { venda: "Venda", produto: "Produto", canal: "Canal", vendedor: "Vendedor", cliente: "Cliente", unidade: "Unidade" };
const r2 = (n: number) => Math.round(n * 100) / 100;

function Cascata({ t }: { t: Valores }) {
  const linhas: [string, number, string][] = [
    ["Receita", t.receita, "var(--serie-1)"], ["Impostos", -t.impostos, "var(--serie-2)"], ["Custo do produto", -t.cmv, "var(--serie-2)"],
    ["Comissões", -t.comissao, "var(--serie-2)"], ["Frete pago", -t.frete, "var(--serie-2)"], ["Taxas de pagamento", -t.taxa, "var(--serie-2)"],
    ["Margem de contribuição", t.mc, t.mc < 0 ? "#dc2626" : "var(--kpi-verde)"],
  ];
  const max = Math.max(1, t.receita);
  return (
    <div className="space-y-2">
      {linhas.map(([r, v, cor]) => (
        <div key={r} className="grid grid-cols-[150px_1fr_110px] items-center gap-3 text-sm sm:grid-cols-[190px_1fr_130px]">
          <span className={r.startsWith("Margem") ? "font-bold text-fg" : "text-slate-600"}>{r}</span>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (Math.abs(v) / max) * 100)}%`, background: cor }} /></div>
          <span className={`num text-right ${r.startsWith("Margem") ? "font-bold" : ""} ${v < 0 && !r.startsWith("Margem") ? "text-slate-600" : ""}`}>{v < 0 && !r.startsWith("Margem") ? `- ${brl(-v)}` : brl(v)}</span>
        </div>
      ))}
    </div>
  );
}

/** O conselheiro: o que a margem do período está dizendo, do mais grave ao bom, com o porquê (a conta) e o que fazer. */
const ESTILO: Record<Conselho["tom"], { icone: typeof AlertTriangle; cor: string; rotulo: string }> = {
  alerta: { icone: AlertTriangle, cor: "border-l-red-500", rotulo: "Corrigir" },
  atencao: { icone: AlertTriangle, cor: "border-l-amber-400", rotulo: "Atenção" },
  oportunidade: { icone: Lightbulb, cor: "border-l-sky-500", rotulo: "Oportunidade" },
  ok: { icone: CheckCircle2, cor: "border-l-emerald-500", rotulo: "Tudo certo" },
};
function Conselheiro({ conselhos }: { conselhos: Conselho[] }) {
  if (!conselhos.length) return null;
  return (
    <Section title="Conselheiro da margem" className="mb-5" actions={<Sparkles size={18} className="text-modulo-texto" aria-hidden />}>
      <p className="mb-3 text-xs text-slate-500">Lido dos números do período e dos filtros acima. Cada conselho mostra a conta que o gerou.</p>
      <ul className="grid gap-2.5 md:grid-cols-2">
        {conselhos.map((c) => {
          const e = ESTILO[c.tom];
          return (
            <li key={c.id} className={`rounded-xl border border-l-4 border-slate-200 bg-surface p-3 ${e.cor}`}>
              <div className="flex items-start gap-2">
                <e.icone size={17} className="mt-0.5 shrink-0 text-modulo-texto" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500">{e.rotulo}</div>
                  <div className="font-semibold leading-tight text-fg">{c.titulo}</div>
                  <p className="mt-1 text-sm text-slate-600">{c.porque}</p>
                  <p className="mt-1 text-sm text-fg"><b>O que fazer:</b> {c.fazer}</p>
                  {c.ir && <Link to={c.ir.para} className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-modulo-texto hover:underline">{c.ir.rotulo} <ArrowRight size={14} aria-hidden /></Link>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
