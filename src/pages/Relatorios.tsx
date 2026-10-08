import { useMemo, useState } from "react";
import { Banknote, Percent, Receipt, TrendingUp } from "lucide-react";
import { PageHeader, Section, Stat, Tabs } from "@/components/ui";
import { Colunas, Ranking } from "@/components/Charts";
import { useUnidade, EtiquetaUnidade, CampoUnidade } from "@/lib/unidade";
import { useRows } from "@/lib/data";
import { brl, hoje, somarDias } from "@/lib/format";
import { MOTIVOS } from "@/lib/propostas";
import type { Vendedor } from "@/lib/types";

type ItemV = { produto_id: string; descricao: string; quantidade: number; valor_unitario: number; produto?: { preco_custo: number; tipo: string } | null };
type PedidoR = {
  id: string; created_at: string; status: string; valor_total: number; vendedor: string | null; vendedor_id: string | null; desconto: number; itens: ItemV[];
  proposta_status: string | null; proposta_enviada_em: string | null; proposta_visualizada_em: string | null; proposta_respondida_em: string | null;
  motivo_rejeicao: string | null; concorrente: string | null;
};
type Conta = { valor: number; vencimento: string; status: string; data_pagamento: string | null; valor_pago: number | null; categoria?: string; pedido_id?: string | null };
type OSR = { status: string; valor_total: number; concluida_em: string | null };

const VALIDOS = ["aprovado", "faturado", "entregue"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Lista os meses (AAAA-MM) do período, do mais antigo ao atual. */
function ultimosMeses(n: number) {
  const d = new Date();
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(d.getFullYear(), d.getMonth() - (n - 1 - i), 1);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
  });
}
const rotuloMes = (am: string) => `${MESES[Number(am.slice(5)) - 1]}/${am.slice(2, 4)}`;

export default function Relatorios() {
  const [periodo, setPeriodo] = useState<"3" | "6" | "12">("6");
  const { data: vendedoresCad = [] } = useRows<Vendedor>("vendedores", { order: "nome", ascending: true });
  const { filtrar } = useUnidade();
  const { data: pedidosTodos = [] } = useRows<PedidoR>("pedidos", { select: "id, unidade_id, created_at, status, valor_total, vendedor, vendedor_id, desconto, frete, comissao_percentual, proposta_status, proposta_enviada_em, proposta_visualizada_em, proposta_respondida_em, motivo_rejeicao, concorrente, itens:pedido_itens(produto_id, descricao, quantidade, valor_unitario, produto:produtos(preco_custo, tipo))" });
  const pedidos = filtrar(pedidosTodos);
  const { data: receberTodos = [] } = useRows<Conta>("contas_receber");
  const receber = filtrar(receberTodos);
  const { data: pagarTodos = [] } = useRows<Conta>("contas_pagar");
  const pagar = filtrar(pagarTodos);
  const { data: comissoes = [] } = useRows<{ pedido_id: string; valor: number; status: string }>("comissoes", { select: "pedido_id, valor, status" });
  const { data: ordensTodos = [] } = useRows<OSR>("ordens_servico", { select: "status, unidade_id, valor_total, concluida_em" });
  const ordens = filtrar(ordensTodos);

  const r = useMemo(() => {
    const meses = ultimosMeses(Number(periodo));
    const inicio = meses[0] + "-01";
    const noPeriodo = (d: string | null | undefined) => !!d && d.slice(0, 10) >= inicio;
    const vendas = pedidos.filter((p) => VALIDOS.includes(p.status) && noPeriodo(p.created_at));

    const porMes = meses.map((m) => ({
      rotulo: rotuloMes(m),
      valores: [vendas.filter((p) => p.created_at.startsWith(m)).reduce((s, p) => s + Number(p.valor_total), 0)],
    }));

    // Top produtos por receita
    const prod = new Map<string, { rotulo: string; valor: number; qtd: number }>();
    for (const p of vendas) for (const i of p.itens) {
      const atual = prod.get(i.produto_id) ?? { rotulo: i.descricao, valor: 0, qtd: 0 };
      atual.valor += i.quantidade * i.valor_unitario;
      atual.qtd += Number(i.quantidade);
      prod.set(i.produto_id, atual);
    }
    const top = [...prod.values()].sort((a, b) => b.valor - a.valor).slice(0, 6)
      .map((p) => ({ rotulo: p.rotulo, valor: p.valor, detalhe: `${p.qtd} unidade(s)` }));

    // DRE simplificado (competência)
    const receitaVendas = vendas.reduce((s, p) => s + Number(p.valor_total), 0);
    const receitaServicos = ordens.filter((o) => ["concluida", "entregue"].includes(o.status) && noPeriodo(o.concluida_em))
      .reduce((s, o) => s + Number(o.valor_total), 0);
    const cmv = vendas.reduce((s, p) => s + p.itens.reduce((t, i) => t + i.quantidade * Number(i.produto?.preco_custo ?? 0), 0), 0);
    const despesas = new Map<string, number>();
    for (const c of pagar) {
      // compras de mercadoria já entram no custo (CMV); aqui ficam as despesas da operação
      // comissões entram pela venda (competência), logo abaixo, e não quando são pagas
      if (c.status !== "pago" || !noPeriodo(c.data_pagamento) || c.categoria === "fornecedores" || c.categoria === "comissoes") continue;
      despesas.set(c.categoria ?? "outros", (despesas.get(c.categoria ?? "outros") ?? 0) + Number(c.valor_pago ?? c.valor));
    }
    // comissão de cada venda do período: a já lançada ou a prevista pelo % do vendedor
    const comissaoVendas = vendas.reduce((s, p: any) => {
      const lancada = comissoes.filter((c) => c.pedido_id === p.id && c.status !== "cancelada").reduce((t, c) => t + Number(c.valor), 0);
      if (lancada) return s + lancada;
      const v = vendedoresCad.find((x) => x.id === p.vendedor_id);
      if (!v) return s;
      const base = Number(p.valor_total) - (v.descontar_frete ? Number(p.frete ?? 0) : 0);
      return s + base * Number(p.comissao_percentual ?? v.percentual ?? 0) / 100;
    }, 0);
    if (comissaoVendas) despesas.set("comissões de venda", comissaoVendas);
    const totalDespesas = [...despesas.values()].reduce((a, b) => a + b, 0);
    const lucroBruto = receitaVendas + receitaServicos - cmv;

    // Fluxo de caixa: próximas 8 semanas (contas em aberto)
    const semanas = Array.from({ length: 8 }, (_, i) => ({ de: somarDias(i * 7), ate: somarDias(i * 7 + 6) }));
    const vencidoReceber = receber.filter((c) => c.status === "aberto" && c.vencimento < hoje()).reduce((s, c) => s + Number(c.valor), 0);
    const vencidoPagar = pagar.filter((c) => c.status === "aberto" && c.vencimento < hoje()).reduce((s, c) => s + Number(c.valor), 0);
    const fluxo = semanas.map((w, i) => ({
      rotulo: i === 0 ? "esta sem." : `${w.de.slice(8, 10)}/${w.de.slice(5, 7)}`,
      valores: [
        receber.filter((c) => c.status === "aberto" && c.vencimento >= w.de && c.vencimento <= w.ate).reduce((s, c) => s + Number(c.valor), 0),
        pagar.filter((c) => c.status === "aberto" && c.vencimento >= w.de && c.vencimento <= w.ate).reduce((s, c) => s + Number(c.valor), 0),
      ],
    }));
    const saldo8 = fluxo.reduce((s, f) => s + f.valores[0] - f.valores[1], 0);

    // Vendas por vendedor (comissões detalhadas ficam na tela Comissões)
    const nomeVend = (p: PedidoR) => vendedoresCad.find((v) => v.id === p.vendedor_id)?.nome ?? (p.vendedor?.trim() || "Sem vendedor");
    const vend = new Map<string, { vendido: number; recebido: number; pedidos: number }>();
    for (const p of vendas) {
      const nome = nomeVend(p);
      const v = vend.get(nome) ?? { vendido: 0, recebido: 0, pedidos: 0 };
      v.vendido += Number(p.valor_total);
      v.pedidos++;
      v.recebido += receber.filter((c) => c.pedido_id === p.id && c.status === "pago").reduce((s, c) => s + Number(c.valor_pago ?? c.valor), 0);
      vend.set(nome, v);
    }

    // Propostas enviadas no período: conversão e por que perdemos
    const props = pedidos.filter((p) => p.proposta_status && noPeriodo(p.proposta_enviada_em));
    const ganhas = props.filter((p) => p.proposta_status === "aprovada" || VALIDOS.includes(p.status));
    const perdidas = props.filter((p) => p.proposta_status === "rejeitada" || p.proposta_status === "expirada" || p.status === "cancelado");
    const emAberto = props.filter((p) => !ganhas.includes(p) && !perdidas.includes(p));
    const somaV = (l: PedidoR[]) => l.reduce((s, p) => s + Number(p.valor_total), 0);
    const motivos = new Map<string, { n: number; valor: number }>();
    for (const p of perdidas) {
      const m = p.proposta_status === "expirada" ? "sem_resposta" : p.motivo_rejeicao ?? "outro";
      const x = motivos.get(m) ?? { n: 0, valor: 0 };
      x.n++; x.valor += Number(p.valor_total);
      motivos.set(m, x);
    }
    const concorrentes = new Map<string, number>();
    for (const p of perdidas) if (p.concorrente) concorrentes.set(p.concorrente, (concorrentes.get(p.concorrente) ?? 0) + 1);
    const resp = props.filter((p) => p.proposta_respondida_em && p.proposta_enviada_em)
      .map((p) => (new Date(p.proposta_respondida_em!).getTime() - new Date(p.proposta_enviada_em!).getTime()) / 864e5);
    const porVendProp = new Map<string, { enviadas: number; ganhas: number; valorGanho: number }>();
    for (const p of props) {
      const x = porVendProp.get(nomeVend(p)) ?? { enviadas: 0, ganhas: 0, valorGanho: 0 };
      x.enviadas++;
      if (ganhas.includes(p)) { x.ganhas++; x.valorGanho += Number(p.valor_total); }
      porVendProp.set(nomeVend(p), x);
    }
    const propostas = {
      enviadas: props.length, abertas: props.filter((p) => p.proposta_visualizada_em).length,
      ganhas: ganhas.length, perdidas: perdidas.length, emAberto: emAberto.length,
      valorGanho: somaV(ganhas), valorPerdido: somaV(perdidas), valorAberto: somaV(emAberto),
      conversao: ganhas.length + perdidas.length ? ganhas.length / (ganhas.length + perdidas.length) : 0,
      diasResposta: resp.length ? resp.reduce((a, b) => a + b, 0) / resp.length : null,
      motivos: [...motivos.entries()].sort((a, b) => b[1].n - a[1].n).map(([m, x]) => ({ rotulo: MOTIVOS[m] ?? m, valor: x.n, detalhe: `${brl(x.valor)} perdidos` })),
      concorrentes: [...concorrentes.entries()].sort((a, b) => b[1] - a[1]),
      porVendedor: [...porVendProp.entries()].sort((a, b) => b[1].valorGanho - a[1].valorGanho),
    };

    return {
      porMes, top, receitaVendas, receitaServicos, cmv, despesas, totalDespesas, lucroBruto, fluxo, saldo8, vencidoReceber, vencidoPagar,
      ticket: vendas.length ? receitaVendas / vendas.length : 0, qtdVendas: vendas.length,
      margem: receitaVendas ? (receitaVendas - cmv) / receitaVendas : 0,
      vendedores: [...vend.entries()].map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.vendido - a.vendido),
      propostas,
    };
  }, [periodo, pedidos, receber, pagar, ordens, vendedoresCad, comissoes]);

  return (
    <div>
      <PageHeader title="Relatórios" subtitle="Números do período escolhido, atualizados a cada venda, pagamento e OS concluída." />
      <Tabs value={periodo} onChange={setPeriodo} options={[
        { value: "3", label: "Últimos 3 meses" }, { value: "6", label: "Últimos 6 meses" }, { value: "12", label: "Últimos 12 meses" },
      ]} />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={TrendingUp} tom="info" label="Vendas no período" valor={brl(r.receitaVendas)} sub={`${r.qtdVendas} pedido(s)`} />
        <Stat icon={Receipt} label="Ticket médio" valor={brl(r.ticket)} />
        <Stat icon={Percent} tom={r.margem < 0.2 ? "atencao" : "bom"} label="Margem bruta dos produtos"
          valor={`${(r.margem * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} sub="venda menos custo do produto" />
        <Stat icon={Banknote} tom={r.saldo8 < 0 ? "critico" : "bom"} label="Saldo previsto (8 semanas)" valor={brl(r.saldo8)}
          sub={r.vencidoReceber || r.vencidoPagar ? `fora do gráfico: ${brl(r.vencidoReceber)} a receber e ${brl(r.vencidoPagar)} a pagar vencidos` : "a receber menos a pagar"} />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-5">
        <Section title="Vendas por mês" className="xl:col-span-3">
          <Colunas dados={r.porMes} series={[{ nome: "Vendas", cor: "var(--serie-1)" }]} />
        </Section>
        <Section title="Produtos que mais faturaram" className="xl:col-span-2">
          <Ranking itens={r.top} />
        </Section>

        <Section title="Fluxo de caixa: próximas 8 semanas" className="xl:col-span-3">
          <Colunas dados={r.fluxo} series={[{ nome: "A receber", cor: "var(--serie-1)" }, { nome: "A pagar", cor: "var(--serie-2)" }]} />
        </Section>

        <Section title="Resultado simplificado (DRE)" className="xl:col-span-2">
          <dl className="num text-sm">
            <Linha rotulo="Receita de vendas" valor={r.receitaVendas} />
            <Linha rotulo="Receita de assistência técnica" valor={r.receitaServicos} />
            <Linha rotulo="(-) Custo dos produtos vendidos" valor={-r.cmv} />
            <Linha rotulo="= Lucro bruto" valor={r.lucroBruto} forte />
            {[...r.despesas.entries()].map(([cat, v]) => <Linha key={cat} rotulo={`(-) ${cat[0].toUpperCase()}${cat.slice(1)}`} valor={-v} />)}
            <Linha rotulo="= Resultado do período" valor={r.lucroBruto - r.totalDespesas} forte destaque />
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            <b>Gerencial e misto:</b> vendas, custo e comissões pela data da venda (competência); as demais despesas pela data em que foram pagas (caixa).
            Usa o custo atual dos produtos; compras de mercadoria entram no custo, não nas despesas. Não substitui o balanço do contador.
          </p>
        </Section>

        <Section title="Propostas comerciais" className="xl:col-span-3">
          <div className="mb-4 grid grid-cols-2 gap-3 2xl:grid-cols-4">
            <Mini rotulo="Enviadas" valor={String(r.propostas.enviadas)} sub={`${r.propostas.abertas} abertas pelo cliente`} />
            <Mini rotulo="Conversão" valor={`${Math.round(r.propostas.conversao * 100)}%`} sub={`${r.propostas.ganhas} ganhas · ${r.propostas.perdidas} perdidas`} />
            <Mini rotulo="Ganho" valor={brl(r.propostas.valorGanho)} sub={`${brl(r.propostas.valorAberto)} em aberto`} />
            <Mini rotulo="Perdido" valor={brl(r.propostas.valorPerdido)} sub={r.propostas.diasResposta != null ? `resposta em ${r.propostas.diasResposta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dia(s)` : ""} />
          </div>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Por que perdemos</h3>
          {r.propostas.motivos.length ? <Ranking itens={r.propostas.motivos} cor="var(--serie-2)" formatar={(v) => `${v} proposta(s)`} /> : <p className="text-sm text-slate-500">Nenhuma proposta perdida no período.</p>}
          {r.propostas.concorrentes.length > 0 && (
            <p className="mt-3 text-sm text-slate-600">Concorrentes citados: {r.propostas.concorrentes.map(([c, n]) => `${c} (${n})`).join(", ")}</p>
          )}
        </Section>

        <Section title="Vendedores" className="xl:col-span-2">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr><th className="th pl-0">Vendedor</th><th className="th text-right">Vendido</th><th className="th text-right">Recebido</th><th className="th text-right" title="propostas ganhas / enviadas">Prop.</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.vendedores.map((c) => {
                  const pv = r.propostas.porVendedor.find(([n]) => n === c.nome)?.[1];
                  return (
                    <tr key={c.nome}>
                      <td className="py-2 font-medium text-fg">{c.nome}<div className="text-xs font-normal text-slate-500">{c.pedidos} pedido(s)</div></td>
                      <td className="num py-2 text-right">{brl(c.vendido)}</td>
                      <td className="num py-2 text-right">{brl(c.recebido)}</td>
                      <td className="num py-2 text-right">{pv ? `${pv.ganhas}/${pv.enviadas}` : "—"}</td>
                    </tr>
                  );
                })}
                {!r.vendedores.length && <tr><td colSpan={4} className="py-6 text-center text-slate-500">Sem vendas no período.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">Comissões a pagar e pagas: menu Comissões.</p>
        </Section>
      </div>
    </div>
  );
}

function Mini({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="text-xs text-slate-500">{rotulo}</div>
      <div className="num text-lg font-bold text-fg">{valor}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Linha({ rotulo, valor, forte, destaque }: { rotulo: string; valor: number; forte?: boolean; destaque?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1.5 ${forte ? "border-t border-slate-200 font-bold text-fg" : "text-slate-600"} ${destaque ? "text-base" : ""}`}>
      <dt>{rotulo}</dt>
      <dd className={"whitespace-nowrap " + (destaque ? (valor < 0 ? "text-red-600" : "text-emerald-700") : "")}>{brl(valor)}</dd>
    </div>
  );
}
