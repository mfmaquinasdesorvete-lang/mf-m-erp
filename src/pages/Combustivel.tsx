// Combustível: gastos em postos, isolados do resto. Vem dos extratos dos bancos e cartões (abastecimentos pagos),
// das notas que os postos emitiram para a MF e dos postos no cadastro de fornecedores.
// O mesmo lançamento importado em duas contas conta uma vez.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Fuel, Receipt, Store, TrendingUp } from "lucide-react";
import { CampoMes, Card, nomeMes, PageHeader, Stat, Table } from "@/components/ui";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { brl, dataBR, pl } from "@/lib/format";
import { ehCombustivel, ehPosto, estabelecimento, semRepetidos, tipoLancamento } from "@/lib/extratoTipos";

type Conta = { id: string; nome: string; unidade_id: string; ativo: boolean };
type Lanc = { id: string; conta_bancaria_id: string; data: string; valor: number; descricao: string | null; identificador?: string | null };
type NotaPosto = { id: string; emitente_nome: string | null; emitente_cnpj: string | null; valor_total: number | null; data_emissao: string | null; unidade_id: string | null };
type Fornecedor = { id: string; nome: string; nome_fantasia: string | null; cnpj: string | null; municipio: string | null; uf: string | null; receita?: unknown };

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** `embutido`: dentro de Gastos separados (a tela de abas já tem o título). */
export default function Combustivel({ embutido }: { embutido?: boolean } = {}) {
  const { filtrar } = useUnidade();
  const { data: contasTodas = [] } = useRows<Conta>("contas_bancarias", { order: "nome", ascending: true });
  const contas = filtrar(contasTodas);
  const { data: lancamentos = [] } = useRows<Lanc>("extrato_lancamentos", { order: "data", ascending: false });
  // só as colunas do resumo; quais são de posto o ERP vê pelo nome do emitente
  const { data: notas = [] } = useRows<NotaPosto>("nfe_recebidas", { select: "id, emitente_nome, emitente_cnpj, valor_total, data_emissao, unidade_id", order: "data_emissao", key: ["postos"] });
  const { data: fornecedores = [] } = useRows<Fornecedor>("fornecedores", { select: "id, nome, nome_fantasia, cnpj, municipio, uf, receita", order: "nome", ascending: true, key: ["postos"] });

  const [mes, setMes] = useState("");
  const [conta, setConta] = useState("");
  const [busca, setBusca] = useState("");

  const idsContas = new Set(contas.map((c) => c.id));
  const nomeConta = (id: string) => contasTodas.find((c) => c.id === id)?.nome ?? "—";
  const casa = (texto: string | null | undefined) => !busca.trim() || sem(texto).includes(sem(busca.trim()));

  // abastecimentos pagos (todos os meses): base do gráfico mês a mês
  const todos = useMemo(() => semRepetidos(lancamentos
    .filter((l) => idsContas.has(l.conta_bancaria_id) && (!conta || l.conta_bancaria_id === conta))
    .filter((l) => Number(l.valor) < 0 && tipoLancamento(l.descricao, Number(l.valor)) === "combustivel")
    .filter((l) => casa(l.descricao))), [lancamentos, contas, conta, busca]); // eslint-disable-line react-hooks/exhaustive-deps
  const doPeriodo = todos.filter((l) => !mes || l.data.startsWith(mes));
  const total = -doPeriodo.reduce((s, l) => s + Number(l.valor), 0);

  const notasPostos = notas.filter((n) => ehCombustivel(n.emitente_nome) && (!n.unidade_id || contas.some((c) => c.unidade_id === n.unidade_id)) && casa(n.emitente_nome));
  const notasPeriodo = notasPostos.filter((n) => !mes || (n.data_emissao ?? "").startsWith(mes));
  const totalNotas = notasPeriodo.reduce((s, n) => s + Number(n.valor_total ?? 0), 0);
  const postosCadastro = fornecedores.filter((f) => ehPosto(f) && (casa(f.nome) || casa(f.nome_fantasia)));

  const porMes = useMemo(() => {
    const m = new Map<string, { n: number; total: number }>();
    for (const l of todos) { const k = l.data.slice(0, 7); const x = m.get(k) ?? { n: 0, total: 0 }; x.n++; x.total -= Number(l.valor); m.set(k, x); }
    return [...m].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  }, [todos]);
  const maiorMes = Math.max(1, ...porMes.map(([, x]) => x.total));

  const porPosto = useMemo(() => {
    const m = new Map<string, { n: number; total: number; ultimo: string }>();
    for (const l of doPeriodo) {
      const k = estabelecimento(l.descricao);
      const x = m.get(k) ?? { n: 0, total: 0, ultimo: "" };
      x.n++; x.total -= Number(l.valor); if (l.data > x.ultimo) x.ultimo = l.data;
      m.set(k, x);
    }
    return [...m].sort((a, b) => b[1].total - a[1].total);
  }, [doPeriodo]);

  const periodo = mes ? nomeMes(mes) : "todo o extrato importado";
  return (
    <div>
      {!embutido && <PageHeader title="Combustível" subtitle="Gastos em postos separados do resto: abastecimentos pagos (extratos dos bancos e cartões), notas dos postos e postos no cadastro" />}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-sm text-slate-600">Mês <CampoMes value={mes} onChange={setMes} vazio="Todos os meses" rotulo="Mês" /></div>
        <select className="input w-auto" value={conta} onChange={(e) => setConta(e.target.value)} aria-label="Conta">
          <option value="">Todas as contas e cartões</option>
          {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <input className="input w-full sm:w-64" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar posto" aria-label="Buscar posto" />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={`Gasto com combustível · ${periodo}`} valor={brl(total)} icon={Fuel} tom="atencao" />
        <Stat label="Abastecimentos pagos" valor={doPeriodo.length} sub={doPeriodo.length ? `média de ${brl(total / doPeriodo.length)}` : undefined} icon={TrendingUp} />
        <Stat label="Notas dos postos" valor={notasPeriodo.length} sub={brl(totalNotas)} icon={Receipt} tom={notasPeriodo.length || !doPeriodo.length ? "info" : "critico"} />
        <Stat label="Postos no cadastro" valor={postosCadastro.length} sub={<Link to="/fornecedores" className="text-brand hover:underline">ver fornecedores</Link>} icon={Store} />
      </div>

      {doPeriodo.length > 0 && totalNotas < total * 0.5 && (
        <Card className="mb-4 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Só {brl(totalNotas)} em notas de postos para {brl(total)} pagos. Peça a nota no CNPJ da MF em cada abastecimento: sem ela o gasto fica sem comprovante
          e não entra crédito de imposto (o crédito de PIS/COFINS sobre combustível depende do uso do veículo: confirmar com o contador).
        </Card>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 font-bold text-fg">Mês a mês</h2>
          {!porMes.length ? <p className="text-sm text-slate-500">Nenhum abastecimento nos extratos importados.</p> : (
            <ul className="space-y-1.5">
              {porMes.map(([m, x]) => (
                <li key={m}>
                  <button type="button" onClick={() => setMes(mes === m ? "" : m)} className={`w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-slate-50 ${mes === m ? "ring-2 ring-brand/40" : ""}`}>
                    <div className="flex justify-between gap-2"><span className="font-semibold text-fg">{nomeMes(m)}</span><span className="num whitespace-nowrap">{brl(x.total)} · {x.n} {pl(x.n, "vez", "vezes")}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-amber-500" style={{ width: `${Math.max(2, (x.total / maiorMes) * 100)}%` }} /></div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 font-bold text-fg">Por posto <span className="text-sm font-normal text-slate-500">· {periodo}</span></h2>
          {!porPosto.length ? <p className="text-sm text-slate-500">Nada no período.</p> : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 pr-3">Posto</th><th className="py-1 pr-3 text-right">Vezes</th><th className="py-1 pr-3 text-right">Total</th><th className="py-1 text-right">Último</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {porPosto.slice(0, 15).map(([p, x]) => (
                    <tr key={p}><td className="py-1.5 pr-3">{p}</td><td className="py-1.5 pr-3 text-right">{x.n}</td><td className="num whitespace-nowrap py-1.5 pr-3 text-right font-semibold">{brl(x.total)}</td><td className="whitespace-nowrap py-1.5 text-right">{dataBR(x.ultimo)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <h2 className="mb-2 font-bold text-fg">Abastecimentos pagos <span className="text-sm font-normal text-slate-500">· {doPeriodo.length} {pl(doPeriodo.length, "lançamento", "lançamentos")}</span></h2>
      <Table empty={!doPeriodo.length} head={<><th className="th">Data</th><th className="th">Posto</th><th className="th">Conta / cartão</th><th className="th text-right">Valor</th></>}>
        {doPeriodo.slice(0, 300).map((l) => (
          <tr key={l.id}>
            <td className="td whitespace-nowrap">{dataBR(l.data)}</td>
            <td className="td">{estabelecimento(l.descricao)}</td>
            <td className="td text-sm text-slate-600">{nomeConta(l.conta_bancaria_id)}</td>
            <td className="td num whitespace-nowrap text-right font-semibold text-red-600">{brl(-Number(l.valor))}</td>
          </tr>
        ))}
      </Table>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-2 font-bold text-fg">Notas dos postos <span className="text-sm font-normal text-slate-500">· {periodo}</span></h2>
          {!notasPeriodo.length ? <p className="text-sm text-slate-500">Nenhuma nota de posto recebida no período.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {notasPeriodo.slice(0, 50).map((n) => (
                <li key={n.id} className="flex justify-between gap-2 py-1.5"><span className="min-w-0 [overflow-wrap:anywhere]">{dataBR(n.data_emissao)} · {n.emitente_nome}</span><span className="num whitespace-nowrap font-semibold">{brl(Number(n.valor_total ?? 0))}</span></li>
              ))}
            </ul>
          )}
          <Link to="/notas" state={{ aba: "recebidas" }} className="mt-2 inline-block text-sm font-semibold text-brand hover:underline">Abrir notas recebidas</Link>
        </Card>
        <Card className="p-4">
          <h2 className="mb-2 font-bold text-fg">Postos no cadastro de fornecedores</h2>
          {!postosCadastro.length ? <p className="text-sm text-slate-500">Nenhum posto cadastrado.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {postosCadastro.map((f) => (
                <li key={f.id} className="py-1.5"><b className="text-fg">{f.nome_fantasia || f.nome}</b><span className="text-slate-500">{[f.municipio, f.uf].filter(Boolean).length ? ` · ${[f.municipio, f.uf].filter(Boolean).join("/")}` : ""}</span></li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-500">Em Fornecedores, o filtro “Postos de combustível” mostra só eles.</p>
        </Card>
      </div>
    </div>
  );
}
