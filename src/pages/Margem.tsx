// Margem de contribuição: lucro de verdade de cada venda, produto, canal, vendedor, cliente e unidade.
import { useMemo, useState } from "react";
import { ArrowDownWideNarrow, FileDown, Percent, TrendingUp, Wallet } from "lucide-react";
import { Button, PageHeader, Section, Stat, Tabs } from "@/components/ui";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { useConfig } from "@/lib/useConfig";
import { brl, dataBR } from "@/lib/format";
import { baixarPlanilha } from "@/lib/exportar";
import { notifyError } from "@/lib/notify";
import { CANAIS, margemPedido, pctMc, somar, zero, type Contexto, type PedidoMargem, type Valores } from "@/lib/margem";
import type { KitComponente, Produto, Vendedor } from "@/lib/types";

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
  const { data: comissoes = [] } = useRows<{ pedido_id: string; valor: number; status: string }>("comissoes", {});
  const { data: cotacoes = [] } = useRows<{ pedido_id: string; valor: number; escolhida: boolean }>("cotacoes_frete", {});
  const { data: formas = [] } = useRows<{ id: string; taxa_percentual: number; tarifa_fixa: number }>("formas_pagamento", { order: "ordem", ascending: true });
  const { data: envios = [] } = useRows<{ pedido_id: string | null; status: string; pagador: string; valor_aprovado: number | null; valor_final: number | null }>("envios", { order: "created_at", ascending: true });
  const { data: notas = [] } = useRows<Contexto["notas"][number]>("notas_fiscais", { select: "pedido_id, status, payload, ambiente" });
  const { data: ufs = [] } = useRows<{ uf: string; aliquota_interna: number; fcp: number }>("icms_uf", { order: "uf", ascending: true });
  const [de, setDe] = useState(mesesAtras(2));
  const [ate, setAte] = useState(mesAtual());
  const [canal, setCanal] = useState("");
  const [visao, setVisao] = useState<Visao>("venda");
  const [ordem, setOrdem] = useState<"mc" | "pct" | "receita">("mc");

  const dados = useMemo(() => {
    if (!cfg) return null;
    const ctx: Contexto = { produtos, comps, unidades, vendedores, comissoes, cotacoes, notas, ufs, cfg, formas, envios };
    const vendas = filtrar(pedidosTodos).filter((p) => {
      const d = (p.aprovado_em ?? p.created_at).slice(0, 7);
      return VALIDOS.includes(p.status) && d >= de && d <= ate && (!canal || p.origem === canal);
    });
    const calc = vendas.map((p) => ({ p, r: margemPedido(p, ctx) }));
    const total = calc.reduce<Valores>((s, x) => somar(s, x.r.total), zero());
    const grupos = new Map<string, Linha>();
    const add = (chave: string, nome: string, v: Valores, qtd: number, detalhe?: string, estimado?: boolean) => {
      const g = grupos.get(chave) ?? { ...zero(), chave, nome, detalhe, qtd: 0, estimado: false };
      Object.assign(g, somar(g, v)); g.qtd += qtd; g.estimado ||= !!estimado;
      grupos.set(chave, g);
    };
    for (const { p, r } of calc) {
      if (visao === "venda") add(p.id, `#${p.numero} · ${p.cliente?.nome ?? ""}`, r.total, 1, `${dataBR(p.aprovado_em ?? p.created_at)} · ${CANAIS[p.origem] ?? p.origem}`, r.impostosEstimados);
      else if (visao === "produto") for (const i of r.itens) add(i.produto_id, i.descricao, i, i.quantidade, undefined, r.impostosEstimados);
      else if (visao === "canal") add(p.origem, CANAIS[p.origem] ?? p.origem, r.total, 1, undefined, r.impostosEstimados);
      else if (visao === "vendedor") { const v = vendedores.find((x) => x.id === p.vendedor_id); add(v?.id ?? p.vendedor ?? "-", v?.nome ?? p.vendedor ?? "Sem vendedor", r.total, 1, undefined, r.impostosEstimados); }
      else if (visao === "cliente") add(p.cliente_id, p.cliente?.nome ?? "—", r.total, 1, p.cliente?.municipio ? `${p.cliente.municipio}/${p.cliente.uf}` : undefined, r.impostosEstimados);
      else add(p.unidade_id ?? "-", nomeUnidade(p.unidade_id), r.total, 1, undefined, r.impostosEstimados);
    }
    const linhas = [...grupos.values()].sort((a, b) => ordem === "pct" ? pctMc(b) - pctMc(a) : ordem === "receita" ? b.receita - a.receita : b.mc - a.mc);
    return { total, linhas, n: vendas.length, estimadas: calc.filter((x) => x.r.impostosEstimados).length };
  }, [cfg, produtos, comps, unidades, vendedores, comissoes, cotacoes, formas, envios, notas, ufs, pedidosTodos, filtrar, de, ate, canal, visao, ordem, nomeUnidade]);

  function exportar() {
    if (!dados) return;
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
        <label className="text-sm">De <input type="month" className="input w-auto" value={de} onChange={(e) => setDe(e.target.value)} /></label>
        <label className="text-sm">até <input type="month" className="input w-auto" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
        <select className="input w-auto" value={canal} onChange={(e) => setCanal(e.target.value)}>
          <option value="">Todos os canais</option>
          {Object.entries(CANAIS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={TrendingUp} tom="info" label="Receita" valor={brl(t.receita)} sub={`${dados?.n ?? 0} venda(s)`} />
        <Stat icon={Wallet} label="Custos variáveis" valor={brl(custos)} sub="impostos, produto, comissão, frete, taxas" />
        <Stat icon={ArrowDownWideNarrow} tom={t.mc < 0 ? "critico" : "bom"} label="Margem de contribuição" valor={brl(t.mc)} />
        <Stat icon={Percent} tom={pctMc(t) < 0.15 ? "atencao" : "bom"} label="Margem %" valor={pctTxt(pctMc(t))} sub="da receita" />
      </div>

      <Section title="Da receita à margem" className="mb-5">
        <Cascata t={t} />
        {dados && dados.estimadas > 0 && <p className="mt-3 text-xs text-slate-500">
          {dados.estimadas} venda(s) sem NF-e autorizada: impostos estimados pelo cadastro da unidade (ICMS, DIFAL, PIS e COFINS). IPI não entra (é cobrado à parte do cliente).
          O custo do produto é o custo atual do cadastro.</p>}
      </Section>

      <Tabs value={visao} onChange={setVisao} options={(Object.keys(ROTULO) as Visao[]).map((v) => ({ value: v, label: `Por ${ROTULO[v].toLowerCase()}` }))} />
      <div className="mb-2 flex justify-end gap-1 text-sm">
        Ordenar: {([["mc", "margem R$"], ["pct", "margem %"], ["receita", "receita"]] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setOrdem(v)} className={`rounded-md px-2 py-0.5 font-semibold ${ordem === v ? "bg-brand text-brand-fg" : "text-slate-600"}`}>{l}</button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-surface">
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="th min-w-[240px]">{ROTULO[visao]}</th><th className="th text-right">{visao === "produto" ? "Qtd" : "Vendas"}</th>
              <th className="th text-right">Receita</th><th className="th text-right">Impostos</th><th className="th text-right">Produto</th>
              <th className="th text-right">Comissão</th><th className="th text-right">Frete</th><th className="th text-right">Taxas</th>
              <th className="th text-right">Margem</th><th className="th w-40">Margem %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {dados?.linhas.map((l) => {
              const pc = pctMc(l);
              return (
                <tr key={l.chave}>
                  <td className="td"><div className="font-medium text-fg">{l.nome}{l.estimado && <span title="impostos estimados" className="text-slate-400"> *</span>}</div>{l.detalhe && <div className="text-xs text-slate-500">{l.detalhe}</div>}</td>
                  <td className="td num text-right">{l.qtd.toLocaleString("pt-BR")}</td>
                  <td className="td num text-right">{brl(l.receita)}</td>
                  <td className="td num text-right text-slate-600">{brl(l.impostos)}</td>
                  <td className="td num text-right text-slate-600">{brl(l.cmv)}</td>
                  <td className="td num text-right text-slate-600">{brl(l.comissao)}</td>
                  <td className="td num text-right text-slate-600">{brl(l.frete)}</td>
                  <td className="td num text-right text-slate-600">{brl(l.taxa)}</td>
                  <td className={`td num text-right font-bold ${l.mc < 0 ? "text-red-600" : "text-fg"}`}>{brl(l.mc)}</td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pc * 100))}%`, background: pc < 0 ? "#dc2626" : pc < 0.15 ? "var(--serie-2)" : "var(--serie-1)" }} />
                      </div>
                      <span className={`num w-12 text-right font-semibold ${pc < 0 ? "text-red-600" : ""}`}>{pctTxt(pc)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!dados?.linhas.length && <tr><td colSpan={10} className="py-8 text-center text-slate-500">Sem vendas aprovadas no período.</td></tr>}
          </tbody>
        </table>
      </div>
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
