// Margem de contribuição → Cruzar à vontade: tabela dinâmica na tela. A pessoa escolhe o que vai nas linhas, nas colunas
// e o valor de cada célula, com o período e a unidade da tela, e baixa em Excel. Duas fontes: as vendas (item a item,
// com a margem de contribuição) e o dinheiro que entrou e saiu (contas recebidas e pagas, por categoria, como no DRE e no
// fluxo de caixa).
import { useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { Button, Table } from "@/components/ui";
import { useRows } from "@/lib/data";
import { brl } from "@/lib/format";
import { baixarPlanilha } from "@/lib/exportar";
import { notifyError } from "@/lib/notify";
import { cruzar, linhasPlanilha, SEM_COLUNA, type Dimensao, type Medida } from "@/lib/cruzamento";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-10" → "2026-10 · out" (o número na frente mantém a ordem dos meses). */
export const rotuloMes = (am: string) => (am && /^\d{4}-\d{2}$/.test(am) ? `${am} · ${MESES[Number(am.slice(5)) - 1]}` : am || "(sem data)");

/** Um item vendido, já com a margem: o fato das vendas. */
export type FatoVenda = {
  venda: string; mes: string; produto: string; categoria: string; canal: string; vendedor: string; cliente: string; uf: string; unidade: string;
  quantidade: number; receita: number; impostos: number; cmv: number; comissao: number; frete: number; taxa: number; mc: number;
};

const soma = (k: string): Medida["de"] => (a) => a.somas[k] ?? 0;
const DIM_VENDAS: Dimensao<FatoVenda>[] = [
  { id: "mes", nome: "Mês", de: (f) => rotuloMes(f.mes), ordem: "texto" },
  { id: "produto", nome: "Produto", de: (f) => f.produto },
  { id: "categoria", nome: "Categoria do produto", de: (f) => f.categoria },
  { id: "canal", nome: "Canal", de: (f) => f.canal },
  { id: "vendedor", nome: "Vendedor", de: (f) => f.vendedor },
  { id: "cliente", nome: "Cliente", de: (f) => f.cliente },
  { id: "uf", nome: "Estado do cliente", de: (f) => f.uf },
  { id: "unidade", nome: "Unidade", de: (f) => f.unidade },
];
const MED_VENDAS: Medida[] = [
  { id: "receita", nome: "Receita", formato: "brl", de: soma("receita") },
  { id: "mc", nome: "Margem de contribuição", formato: "brl", de: soma("mc") },
  { id: "pct", nome: "Margem %", formato: "pct", de: (a) => (a.somas.receita ? (a.somas.mc ?? 0) / a.somas.receita : 0) },
  { id: "impostos", nome: "Impostos", formato: "brl", de: soma("impostos") },
  { id: "cmv", nome: "Custo do produto", formato: "brl", de: soma("cmv") },
  { id: "comissao", nome: "Comissão", formato: "brl", de: soma("comissao") },
  { id: "frete", nome: "Frete pago", formato: "brl", de: soma("frete") },
  { id: "taxa", nome: "Taxas de pagamento", formato: "brl", de: soma("taxa") },
  { id: "quantidade", nome: "Quantidade vendida", formato: "num", de: soma("quantidade") },
  { id: "vendas", nome: "Número de vendas", formato: "num", de: (a) => a.ids.size },
  { id: "ticket", nome: "Ticket médio", formato: "brl", de: (a) => (a.ids.size ? (a.somas.receita ?? 0) / a.ids.size : 0) },
];

/** Uma conta recebida ou paga: o fato do dinheiro. */
type FatoDinheiro = { id: string; tipo: string; mes: string; categoria: string; pessoa: string; unidade: string; banco: string; recebido: number; pago: number };
const DIM_DINHEIRO: Dimensao<FatoDinheiro>[] = [
  { id: "mes", nome: "Mês do pagamento", de: (f) => rotuloMes(f.mes), ordem: "texto" },
  { id: "tipo", nome: "Entrada ou saída", de: (f) => f.tipo, ordem: "texto" },
  { id: "categoria", nome: "Categoria (plano de contas)", de: (f) => f.categoria },
  { id: "pessoa", nome: "Cliente ou fornecedor", de: (f) => f.pessoa },
  { id: "unidade", nome: "Unidade", de: (f) => f.unidade },
  { id: "banco", nome: "Conta bancária", de: (f) => f.banco },
];
const MED_DINHEIRO: Medida[] = [
  { id: "saldo", nome: "Saldo (entrou − saiu)", formato: "brl", de: (a) => (a.somas.recebido ?? 0) - (a.somas.pago ?? 0) },
  { id: "recebido", nome: "Recebido", formato: "brl", de: soma("recebido") },
  { id: "pago", nome: "Pago", formato: "brl", de: soma("pago") },
  { id: "lancamentos", nome: "Número de contas", formato: "num", de: (a) => a.ids.size },
];

type Fonte = "vendas" | "dinheiro";
const LIMITE_LINHAS = 100;

export function CruzamentoLivre({ fatosVendas, de, ate, filtrar, nomeUnidade }: {
  fatosVendas: FatoVenda[]; de: string; ate: string;
  filtrar: <T,>(l: T[]) => T[]; nomeUnidade: (id: string | null | undefined) => string;
}) {
  const [fonte, setFonte] = useState<Fonte>("vendas");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-fg">Cruzar:</span>
        {([["vendas", "Vendas e margem"], ["dinheiro", "Dinheiro recebido e pago"]] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setFonte(v)} aria-pressed={fonte === v}
            className={`rounded-lg px-3 py-1.5 font-semibold ${fonte === v ? "bg-brand text-brand-fg" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{l}</button>
        ))}
      </div>
      {fonte === "vendas"
        ? <Tabela fatos={fatosVendas} dims={DIM_VENDAS} medidas={MED_VENDAS} padrao={{ linha: "produto", coluna: "mes", medida: "mc" }}
            id={(f) => f.venda} numeros={(f) => ({ receita: f.receita, impostos: f.impostos, cmv: f.cmv, comissao: f.comissao, frete: f.frete, taxa: f.taxa, mc: f.mc, quantidade: f.quantidade })}
            arquivo="cruzamento-vendas" vazio="Sem vendas aprovadas no período." />
        : <Dinheiro de={de} ate={ate} filtrar={filtrar} nomeUnidade={nomeUnidade} />}
    </div>
  );
}

type Conta = { id: string; status: string; valor: number; valor_pago: number | null; data_pagamento: string | null; categoria: string | null; unidade_id: string | null;
  conta_bancaria_id: string | null; pessoa?: { nome: string } | null };

/** Lê as contas só quando a pessoa escolhe "Dinheiro" (as vendas já estão carregadas pela tela). */
function Dinheiro({ de, ate, filtrar, nomeUnidade }: { de: string; ate: string; filtrar: <T,>(l: T[]) => T[]; nomeUnidade: (id: string | null | undefined) => string }) {
  const periodo = (q: any) => q.eq("status", "pago").gte("data_pagamento", `${de}-01`).lte("data_pagamento", `${ate}-31`);
  const comuns = "id, status, valor, valor_pago, data_pagamento, categoria, unidade_id, conta_bancaria_id";
  const { data: receber = [], isLoading: l1 } = useRows<Conta>("contas_receber", { select: `${comuns}, pessoa:clientes(nome)`, key: ["cruzar", de, ate], filtro: periodo });
  const { data: pagar = [], isLoading: l2 } = useRows<Conta>("contas_pagar", { select: `${comuns}, pessoa:fornecedores(nome)`, key: ["cruzar", de, ate], filtro: periodo });
  const { data: bancos = [] } = useRows<{ id: string; nome: string }>("contas_bancarias", { order: "nome", ascending: true });
  const fatos = useMemo<FatoDinheiro[]>(() => {
    const banco = (id: string | null) => bancos.find((b) => b.id === id)?.nome ?? "(sem conta)";
    const fato = (c: Conta, entrada: boolean): FatoDinheiro => {
      const v = Number(c.valor_pago ?? c.valor) || 0;
      return { id: c.id, tipo: entrada ? "Entrada" : "Saída", mes: (c.data_pagamento ?? "").slice(0, 7), categoria: c.categoria || "(sem categoria)",
        pessoa: c.pessoa?.nome ?? "(sem nome)", unidade: nomeUnidade(c.unidade_id), banco: banco(c.conta_bancaria_id), recebido: entrada ? v : 0, pago: entrada ? 0 : v };
    };
    return [...filtrar(receber).map((c) => fato(c, true)), ...filtrar(pagar).map((c) => fato(c, false))];
  }, [receber, pagar, bancos, filtrar, nomeUnidade]);
  if (l1 || l2) return <p className="text-sm text-slate-500">Carregando as contas pagas e recebidas…</p>;
  return <Tabela fatos={fatos} dims={DIM_DINHEIRO} medidas={MED_DINHEIRO} padrao={{ linha: "categoria", coluna: "mes", medida: "saldo" }}
    id={(f) => f.id} numeros={(f) => ({ recebido: f.recebido, pago: f.pago })} arquivo="cruzamento-dinheiro" vazio="Nenhuma conta paga ou recebida no período." />;
}

function Tabela<F>({ fatos, dims, medidas, padrao, id, numeros, arquivo, vazio }: {
  fatos: F[]; dims: Dimensao<F>[]; medidas: Medida[]; padrao: { linha: string; coluna: string; medida: string };
  id: (f: F) => string; numeros: (f: F) => Record<string, number>; arquivo: string; vazio: string;
}) {
  const [linha, setLinha] = useState(padrao.linha);
  const [coluna, setColuna] = useState(padrao.coluna);
  const [medida, setMedida] = useState(padrao.medida);
  const [todas, setTodas] = useState(false);
  const dimL = dims.find((d) => d.id === linha) ?? dims[0];
  const dimC = coluna ? dims.find((d) => d.id === coluna) ?? null : null;
  const med = medidas.find((m) => m.id === medida) ?? medidas[0];
  const c = useMemo(() => cruzar(fatos, { linha: dimL, coluna: dimC, medida: med, numeros, id }), [fatos, dimL, dimC, med, numeros, id]);
  const fmt = (v: number | null) => (v === null ? "" : med.formato === "brl" ? brl(v) : med.formato === "pct" ? `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));
  const linhas = todas ? c.linhas : c.linhas.slice(0, LIMITE_LINHAS);
  const comTotal = c.colunas.length > 1 || c.colunas[0] !== SEM_COLUNA;

  function exportar() {
    baixarPlanilha(arquivo, [{ nome: `${med.nome} por ${dimL.nome}`.slice(0, 31), linhas: linhasPlanilha(c, dimL.nome) }]).catch(notifyError);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
        <label className="text-sm"><span className="mb-1 block font-semibold text-slate-600">Linhas</span>
          <select className="input" value={linha} onChange={(e) => setLinha(e.target.value)}>{dims.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</select></label>
        <label className="text-sm"><span className="mb-1 block font-semibold text-slate-600">Colunas</span>
          <select className="input" value={coluna} onChange={(e) => setColuna(e.target.value)}>
            <option value="">Só o total</option>
            {dims.filter((d) => d.id !== linha).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select></label>
        <label className="text-sm"><span className="mb-1 block font-semibold text-slate-600">Valor</span>
          <select className="input" value={medida} onChange={(e) => setMedida(e.target.value)}>{medidas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>
        <Button variant="secondary" onClick={exportar} disabled={!fatos.length}><FileDown size={16} /> Exportar</Button>
      </div>
      {!fatos.length ? <p className="p-6 text-center text-sm text-slate-500">{vazio}</p> : (
        <>
          <p className="text-xs text-slate-500">{c.linhas.length.toLocaleString("pt-BR")} {c.linhas.length === 1 ? "linha" : "linhas"}{dimC ? ` × ${c.colunas.length} ${c.colunas.length === 1 ? "coluna" : "colunas"}` : ""} · {med.nome} · o período e a unidade são os escolhidos no alto da tela.</p>
          <Table head={<>
            <th className="th sticky left-0 z-10 min-w-[180px] bg-surface">{dimL.nome}</th>
            {dimC && c.colunas.map((col) => <th key={col} className="th whitespace-nowrap text-right">{col}</th>)}
            <th className="th whitespace-nowrap text-right">Total</th>
          </>}>
            {linhas.map((l) => (
              <tr key={l}>
                <td className="td sticky left-0 z-10 bg-surface font-medium text-fg">{l}</td>
                {dimC && c.colunas.map((col) => { const v = c.valor(l, col); return <td key={col} className={`td num whitespace-nowrap text-right ${v !== null && v < 0 ? "text-red-600" : "text-slate-700"}`}>{fmt(v)}</td>; })}
                <td className={`td num whitespace-nowrap text-right font-semibold ${c.totalLinha(l) < 0 ? "text-red-600" : "text-fg"}`}>{fmt(c.totalLinha(l))}</td>
              </tr>
            ))}
            <tr className="bg-slate-50">
              <td className="td sticky left-0 z-10 bg-slate-50 font-bold text-fg">Total</td>
              {dimC && c.colunas.map((col) => <td key={col} className="td num whitespace-nowrap text-right font-semibold">{fmt(c.totalColuna(col))}</td>)}
              <td className="td num whitespace-nowrap text-right font-bold">{comTotal || !dimC ? fmt(c.total) : ""}</td>
            </tr>
          </Table>
          {c.linhas.length > LIMITE_LINHAS && !todas && (
            <div className="text-center"><Button variant="secondary" onClick={() => setTodas(true)}>Mostrar as {c.linhas.length.toLocaleString("pt-BR")} linhas</Button>
              <p className="mt-1 text-xs text-slate-500">Na planilha exportada vão todas.</p></div>
          )}
        </>
      )}
    </div>
  );
}
