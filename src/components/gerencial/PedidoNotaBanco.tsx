// Painel gerencial → aba "Pedido x Nota x Banco": cada venda dos últimos 12 meses com o valor do pedido, da nota
// fiscal e do que entrou no banco (extrato ligado à conta a receber), com filtros pelo que não bate.
import { useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui";
import { CartaoPainel, type Cartao } from "@/components/painel/Painel";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { baixarPlanilha, celula } from "@/lib/exportar";
import { notifyError } from "@/lib/notify";
import { brl, dataBR, pl } from "@/lib/format";
import { ROTULO_BANCO, ROTULO_NOTA, resumoConferencia, type SituacaoBanco, type SituacaoNota, type VendaConferida } from "@/lib/pedidoNotaBanco";
import { AlertTriangle, CheckCircle2, Landmark, Receipt } from "lucide-react";

const desde = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
const COR_NOTA: Record<SituacaoNota, string> = {
  bate: "bg-emerald-100 text-emerald-800", outra_empresa: "bg-sky-100 text-sky-800", sem_frete: "bg-amber-100 text-amber-900",
  menor: "bg-red-100 text-red-800", maior: "bg-violet-100 text-violet-800", sem_nota: "bg-slate-200 text-slate-700",
};
const COR_BANCO: Record<SituacaoBanco, string> = {
  entrou: "bg-emerald-100 text-emerald-800", parcial: "bg-amber-100 text-amber-900", baixado_sem_extrato: "bg-sky-100 text-sky-800",
  a_receber: "bg-violet-100 text-violet-800", sem_conta: "bg-slate-200 text-slate-700",
};
type Filtro = "todos" | "problema" | `n:${SituacaoNota}` | `b:${SituacaoBanco}`;

export function PedidoNotaBanco() {
  const { filtrar } = useUnidade();
  const [filtro, setFiltro] = useState<Filtro>("problema");
  const chave = ["pedido-nota-banco", desde];
  const { data: pedidos = [], isLoading } = useRows<any>("pedidos", {
    select: "id, numero, status, created_at, aprovado_em, valor_total, frete, unidade_id, nf_outra_numero, nf_outra_valor, cliente:clientes(nome, nome_fantasia)", key: chave,
    filtro: (q) => q.is("excluida_em", null).in("status", ["aprovado", "faturado", "entregue"]).gte("created_at", desde),
  });
  const { data: notas = [] } = useRows<any>("notas_fiscais", {
    select: "id, pedido_id, valor_total, finalidade", key: chave,
    filtro: (q) => q.not("pedido_id", "is", null).eq("status", "autorizada").neq("ambiente", "homologacao").is("excluida_em", null).gte("created_at", desde),
  });
  const { data: contas = [] } = useRows<any>("contas_receber", {
    select: "id, pedido_id, valor, valor_pago, status", key: chave,
    filtro: (q) => q.not("pedido_id", "is", null).neq("status", "cancelado").gte("vencimento", desde),
  });
  const { data: extrato = [] } = useRows<any>("extrato_lancamentos", {
    select: "id, valor, conta_receber_id", order: "data", key: chave,
    filtro: (q) => q.not("conta_receber_id", "is", null).gte("data", desde),
  });

  const r = useMemo(() => {
    const notasPor = new Map<string, number[]>();
    for (const n of notas) if (n.finalidade !== "devolucao") notasPor.set(n.pedido_id, [...(notasPor.get(n.pedido_id) ?? []), Number(n.valor_total)]);
    const bancoPorConta = new Map<string, number>();
    for (const e of extrato) bancoPorConta.set(e.conta_receber_id, (bancoPorConta.get(e.conta_receber_id) ?? 0) + Number(e.valor));
    const cr = new Map<string, { contas: number; baixado: number; banco: number }>();
    for (const c of contas) {
      const x = cr.get(c.pedido_id) ?? { contas: 0, baixado: 0, banco: 0 };
      x.contas += Number(c.valor);
      if (c.status === "pago") x.baixado += Number(c.valor_pago ?? c.valor);
      x.banco += bancoPorConta.get(c.id) ?? 0;
      cr.set(c.pedido_id, x);
    }
    return resumoConferencia(filtrar(pedidos).map((p: any) => ({
      id: p.id, numero: p.numero, data: p.aprovado_em ?? p.created_at,
      cliente: p.cliente?.nome_fantasia || p.cliente?.nome || "—",
      total: Number(p.valor_total ?? 0), frete: Number(p.frete ?? 0),
      notas: notasPor.get(p.id) ?? [],
      notaOutra: p.nf_outra_numero ? { numero: p.nf_outra_numero, valor: p.nf_outra_valor == null ? null : Number(p.nf_outra_valor) } : null,
      ...(cr.get(p.id) ?? { contas: 0, baixado: 0, banco: 0 }),
    })));
  }, [pedidos, notas, contas, extrato, filtrar]);

  const lista = r.linhas
    .filter((l) => filtro === "todos" ? true : filtro === "problema" ? !l.ok
      : filtro.startsWith("n:") ? l.sNota === filtro.slice(2) : l.sBanco === filtro.slice(2))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));

  function exportar() {
    baixarPlanilha("pedido-nota-banco", [{ nome: "Pedido x Nota x Banco", linhas: lista.map((l) => ({
      Pedido: l.numero, Data: celula(String(l.data).slice(0, 10)), Cliente: l.cliente, "Valor do pedido": l.total, Frete: l.frete,
      "Valor da nota": l.nota, Nota: ROTULO_NOTA[l.sNota], "Entrou no banco": l.banco, Banco: ROTULO_BANCO[l.sBanco],
      "Diferença nota": l.difNota, "Diferença banco": l.difBanco,
    })) }]).catch(notifyError);
  }

  if (isLoading) return <p className="text-sm text-slate-500">Juntando pedidos, notas e banco…</p>;
  const n = r.linhas.length;
  const cartoes: Cartao[] = [
    { id: "vendido", rotulo: "Vendido (pedidos)", valor: brl(r.vendido), icone: Receipt, cor: "var(--serie-1)", sub: `${n} ${pl(n, "venda", "vendas")} em 12 meses` },
    { id: "notas", rotulo: "Em nota fiscal", valor: brl(r.notas), icone: Receipt, cor: "var(--kpi-roxo)",
      sub: `${r.porNota.sem_nota ?? 0} sem nota · ${r.porNota.menor ?? 0} com nota menor`, onClick: () => setFiltro("n:menor") },
    { id: "banco", rotulo: "Entrou no banco", valor: brl(r.banco), icone: Landmark, cor: "var(--kpi-verde)",
      sub: `${r.porBanco.entrou ?? 0} inteiras · ${r.porBanco.parcial ?? 0} em parte`, onClick: () => setFiltro("b:parcial") },
    { id: "bate", rotulo: "Tudo bate", valor: `${r.tudoBate} de ${n}`, icone: CheckCircle2, cor: "var(--kpi-laranja)",
      sub: "pedido = nota = banco", onClick: () => setFiltro("problema") },
  ];
  const chip = (f: Filtro, rotulo: string, qtd: number | undefined) => (
    <button key={f} type="button" onClick={() => setFiltro(f)} aria-pressed={filtro === f}
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${filtro === f ? "border-brand bg-brand text-brand-fg" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
      {rotulo} · {qtd ?? 0}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{cartoes.map((c) => <CartaoPainel key={c.id} c={c} />)}</div>
      {(r.notaMenor > 0 || r.freteFora > 0) && (
        <div className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p>
            {r.freteFora > 0 && <><b>{r.porNota.sem_frete} {pl(r.porNota.sem_frete ?? 0, "venda", "vendas")}</b> com frete cobrado no pedido e fora da nota ({brl(r.freteFora)}). Frete cobrado do cliente costuma entrar na nota (campo frete): confirme com o contador. </>}
            {r.notaMenor > 0 && <><b>{r.porNota.menor} {pl(r.porNota.menor ?? 0, "nota menor", "notas menores")}</b> que o pedido ({brl(r.notaMenor)} a menos). Pode ser pedido com valor errado, nota parcial ou desconto que não foi para o pedido: confira cada uma.</>}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {chip("problema", "Não bate", n - r.tudoBate)}
        {chip("todos", "Todas", n)}
        {(Object.keys(ROTULO_NOTA) as SituacaoNota[]).filter((s) => s !== "bate" && r.porNota[s]).map((s) => chip(`n:${s}`, ROTULO_NOTA[s], r.porNota[s]))}
        {(Object.keys(ROTULO_BANCO) as SituacaoBanco[]).filter((s) => s !== "entrou" && r.porBanco[s]).map((s) => chip(`b:${s}`, ROTULO_BANCO[s], r.porBanco[s]))}
        <Button variant="secondary" className="ml-auto" onClick={exportar}><FileDown size={16} /> Planilha</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="tabela w-full min-w-[760px] text-sm">
          <thead><tr><th>Pedido</th><th>Cliente</th><th className="text-right">Pedido</th><th className="text-right">Nota</th><th className="text-right">Banco</th><th>Situação</th></tr></thead>
          <tbody>
            {lista.slice(0, 300).map((l) => <Linha key={l.id} l={l} />)}
            {!lista.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">Nada aqui.</td></tr>}
          </tbody>
        </table>
      </div>
      {lista.length > 300 && <p className="text-xs text-slate-500">Mostrando 300 de {lista.length}. A planilha leva todas.</p>}
    </div>
  );
}

function Linha({ l }: { l: VendaConferida }) {
  const dif = (x: number) => (Math.abs(x) > 1 ? <span className={`block text-xs ${x < 0 ? "text-red-600" : "text-violet-700"}`}>{x > 0 ? "+" : ""}{brl(x)}</span> : null);
  return (
    <tr>
      <td className="whitespace-nowrap"><b className="text-fg">#{l.numero ?? "—"}</b><span className="block text-xs text-slate-500">{dataBR(String(l.data).slice(0, 10))}</span></td>
      <td className="max-w-[220px] truncate" title={l.cliente}>{l.cliente}</td>
      <td className="num text-right">{brl(l.total)}{l.frete > 0 && <span className="block text-xs text-slate-500">frete {brl(l.frete)}</span>}</td>
      <td className="num text-right">{l.sNota === "sem_nota" ? "—" : brl(l.nota)}{l.sNota !== "sem_nota" && dif(l.difNota)}</td>
      <td className="num text-right">{l.banco ? brl(l.banco) : "—"}{l.banco ? dif(l.difBanco) : null}</td>
      <td>
        <span className="flex flex-wrap gap-1">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COR_NOTA[l.sNota]}`}>{ROTULO_NOTA[l.sNota]}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COR_BANCO[l.sBanco]}`}>{ROTULO_BANCO[l.sBanco]}</span>
        </span>
      </td>
    </tr>
  );
}
