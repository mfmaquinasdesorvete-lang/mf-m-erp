// Impostos pagos, tarifas de cartão e OLIST e pagamentos a funcionários, cada um separado do resto e juntando todas as contas
// (como o combustível). Vem dos extratos e das contas pagas lançadas no ERP nessas categorias, sem contar o mesmo pagamento duas vezes.
// Os funcionários são reconhecidos pelo nome do cadastro de funcionários, como aparece no Pix.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Car, CreditCard, Download, Landmark, MapPin, Receipt, ShoppingCart, User, Users, type LucideIcon } from "lucide-react";
import { Button, CampoMes, Card, nomeMes, PageHeader, Table, Tabs } from "@/components/ui";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { useAbaUrl } from "@/lib/abaUrl";
import { brl, dataBR, pl } from "@/lib/format";
import { baixarPlanilha } from "@/lib/exportar";
import { ESFERAS } from "@/lib/extratoTipos";
import { ABAS_GASTO, linhasGasto, porMesGasto, porTipoGasto, SEM_GRUPO, type RecebidaGasto, totalPorGrupo, type AbaGasto, type ContaGasto, type LancGasto } from "@/lib/impostosTarifas";

type Conta = { id: string; nome: string; unidade_id: string; ativo: boolean };
type Funcionario = { id: string; nome: string; apelido: string | null; ativo: boolean };

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ROTULO_STATUS: Record<string, string> = { pendente: "Para conciliar", conciliado: "Conciliado", transferencia: "Transferência", ignorado: "Ignorado", pago: "Pago" };
const ABAS = ABAS_GASTO.map((a) => a.id);

const GRUPOS_FIXOS: Record<AbaGasto, { id: string; sub: string; icone: LucideIcon }[]> = {
  impostos: ESFERAS.map((e) => ({ id: e.id, sub: e.dica, icone: e.id === "Federal" ? Landmark : e.id === "Estadual" ? Building2 : e.id === "Municipal" ? MapPin : Car })),
  tarifas: [
    { id: "OLIST", sub: "Pix recebido, lembretes, boleto e taxa do cartão (Zoop)", icone: ShoppingCart },
    { id: "InfinitePay", sub: "Taxa da venda descontada no depósito (venda − depósito) e tarifas à parte", icone: CreditCard },
    { id: "Cartão", sub: "Outras maquininhas e antecipação", icone: CreditCard },
    { id: "Banco", sub: "Tarifas, juros, IOF e multas dos bancos", icone: Landmark },
  ],
  funcionarios: [],
};

/** `aba`: dentro de Gastos separados cada tipo é uma aba de lá (sem as abas e o título daqui). */
export default function ImpostosTarifas({ aba: abaFixa }: { aba?: AbaGasto } = {}) {
  const { filtrar } = useUnidade();
  const [abaUrl, setAba] = useAbaUrl<AbaGasto>("impostos", ABAS);
  const aba = abaFixa ?? abaUrl;
  const { data: contasTodas = [] } = useRows<Conta>("contas_bancarias", { order: "nome", ascending: true });
  const contas = filtrar(contasTodas).filter((c) => c.ativo);
  const { data: lancamentos = [] } = useRows<LancGasto>("extrato_lancamentos", { order: "data", ascending: false });
  const { data: contasPagar = [] } = useRows<ContaGasto & { unidade_id: string | null }>("contas_pagar", {
    select: "id, descricao, categoria, valor, valor_pago, data_pagamento, vencimento, status, conta_bancaria_id, unidade_id", order: "vencimento", key: ["impostos-tarifas"] });
  // vendas ligadas aos depósitos da InfinitePay: a taxa é a venda menos o depósito
  const { data: recebidas = [] } = useRows<RecebidaGasto>("contas_receber", { select: "id, valor, descricao", order: "vencimento", key: ["impostos-tarifas"] });
  const { data: funcionariosTodos = [] } = useRows<Funcionario>("funcionarios", { select: "id, nome, apelido, ativo", order: "nome", ascending: true, key: ["nomes"] });
  const funcionarios = funcionariosTodos.filter((f) => f.ativo !== false);

  const [mes, setMes] = useState("");
  const [conta, setConta] = useState("");
  const [grupo, setGrupo] = useState("");
  const [busca, setBusca] = useState("");
  const trocarAba = (a: AbaGasto) => { setAba(a); setGrupo(""); };

  const nomeConta = (id: string | null) => (id ? contasTodas.find((c) => c.id === id)?.nome ?? "—" : "—");
  const idsContas = useMemo(() => new Set(contas.map((c) => c.id)), [contas]);

  // todas as linhas da aba (todos os meses), já só das contas da unidade escolhida
  const todas = useMemo(() => {
    const lancs = lancamentos.filter((l) => idsContas.has(l.conta_bancaria_id));
    return linhasGasto(aba, lancs, filtrar(contasPagar), funcionariosTodos, recebidas)
      .filter((l) => (l.fonte === "conta" ? !l.conta_bancaria_id || idsContas.has(l.conta_bancaria_id) : true));
  }, [aba, lancamentos, contasPagar, funcionariosTodos, idsContas, recebidas]); // eslint-disable-line react-hooks/exhaustive-deps

  const casa = (texto: string) => !busca.trim() || sem(texto).includes(sem(busca.trim()));
  const doFiltro = todas.filter((l) => (!conta || l.conta_bancaria_id === conta) && (casa(l.descricao) || casa(l.grupo)));
  const doPeriodo = doFiltro.filter((l) => !mes || l.data.startsWith(mes));
  const lista = doPeriodo.filter((l) => !grupo || l.grupo === grupo);
  const total = lista.reduce((s, l) => s + l.valor, 0);
  const porGrupo = totalPorGrupo(doPeriodo);
  const porTipo = porTipoGasto(lista);
  const porMes = porMesGasto(doFiltro.filter((l) => !grupo || l.grupo === grupo));
  const maiorMes = Math.max(1, ...porMes.map(([, x]) => x.total));

  // cartões: os fixos da aba (ou um por funcionário) e o que mais aparecer
  const grupos = useMemo(() => {
    // funcionários: quem recebeu mais no período primeiro
    const fixos = aba === "funcionarios"
      ? funcionarios.map((f) => ({ id: f.nome, sub: f.apelido ? `“${f.apelido}”` : "Funcionário", icone: User }))
        .sort((a, b) => (porGrupo.get(b.id)?.total ?? 0) - (porGrupo.get(a.id)?.total ?? 0))
      : GRUPOS_FIXOS[aba];
    const extras = [...porGrupo.keys()].filter((g) => !fixos.some((x) => x.id === g))
      .map((g) => ({ id: g, sub: g === SEM_GRUPO[aba] ? (aba === "funcionarios" ? "Folha lançada sem o nome do funcionário" : "Lançados na categoria impostos") : "", icone: aba === "funcionarios" ? Users : Receipt }));
    return [...fixos, ...extras];
  }, [aba, funcionarios, doPeriodo]); // eslint-disable-line react-hooks/exhaustive-deps

  const def = ABAS_GASTO.find((a) => a.id === aba)!;
  const periodo = mes ? nomeMes(mes) : "todo o extrato importado";
  const contasComExtrato = contas.filter((c) => lancamentos.some((l) => l.conta_bancaria_id === c.id)).map((c) => c.nome);

  const exportar = () => baixarPlanilha(`${aba}${mes ? `-${mes}` : ""}`, [{
    nome: def.rotulo,
    linhas: lista.map((l) => ({
      Data: dataBR(l.data), [aba === "impostos" ? "Esfera" : aba === "tarifas" ? "Quem cobrou" : "Funcionário"]: l.grupo,
      Descrição: l.descricao, Conta: nomeConta(l.conta_bancaria_id), Origem: l.fonte === "extrato" ? "Extrato do banco" : "Contas a pagar",
      Situação: ROTULO_STATUS[l.status] ?? l.status, Valor: l.valor,
    })),
  }]);

  return (
    <div>
      {!abaFixa && <>
        <PageHeader title="Impostos, tarifas e funcionários"
          subtitle="Guias de imposto pagas, tarifas de cartão e da OLIST e pagamentos aos funcionários, separados do resto e juntando todas as contas" />
        <Tabs value={aba} onChange={trocarAba} options={ABAS_GASTO.map((a) => ({ value: a.id, label: a.rotulo }))} />
      </>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-sm text-slate-600">Mês <CampoMes value={mes} onChange={setMes} vazio="Todos os meses" rotulo="Mês" /></div>
        <select className="input w-auto" value={conta} onChange={(e) => setConta(e.target.value)} aria-label="Conta">
          <option value="">Todas as contas</option>
          {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <input className="input w-full sm:w-64" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar na descrição" aria-label="Buscar" />
        <Button type="button" variant="secondary" onClick={exportar} disabled={!lista.length}><Download size={16} aria-hidden /> Exportar</Button>
      </div>

      {aba === "funcionarios" && !funcionarios.length && (
        <Card className="mb-4 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Nenhum funcionário no cadastro. Cadastre cada um em <Link to="/funcionarios" className="font-semibold underline">Funcionários</Link> com o
          nome completo igual ao do Pix: os pagamentos aparecem aqui sozinhos.
        </Card>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {grupos.map((g) => {
          const x = porGrupo.get(g.id) ?? { n: 0, total: 0, ultimo: "" };
          const ativo = grupo === g.id;
          return (
            <button key={g.id} type="button" onClick={() => setGrupo(ativo ? "" : g.id)} aria-pressed={ativo} disabled={!x.n && !ativo}
              className={`rounded-2xl border bg-surface p-4 text-left shadow-sm transition enabled:hover:shadow-pop disabled:opacity-60 ${ativo ? "border-brand ring-2 ring-brand/40" : "border-slate-200"}`}>
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-100 text-rose-700"><g.icone size={18} aria-hidden /></span>
                <span className="min-w-0">
                  <span className="block font-bold text-fg [overflow-wrap:anywhere]">{g.id}</span>
                  {g.sub && <span className="block text-xs text-slate-500">{g.sub}</span>}
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <span className="num text-lg font-bold text-red-600">{brl(x.total)}</span>
                <span className="text-xs text-slate-500">{x.n} {pl(x.n, "pagamento", "pagamentos")}{x.ultimo && ` · último ${dataBR(x.ultimo)}`}</span>
              </div>
            </button>
          );
        })}
      </div>

      {aba === "impostos" && (
        <Card className="mb-4 border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          Entram as guias pagas pelas contas com extrato no ERP{contasComExtrato.length ? ` (${contasComExtrato.join(", ")})` : ""} e as contas pagas lançadas
          na categoria <b>impostos</b>. Imposto pago por outro banco aparece quando o extrato dele for importado. Exporte a planilha para mandar ao contador.
        </Card>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-1 font-bold text-fg">Total {grupo ? `· ${grupo}` : ""} <span className="text-sm font-normal text-slate-500">· {periodo}</span></h2>
          <p className="num text-2xl font-bold text-red-600">{brl(total)}</p>
          <p className="text-sm text-slate-500">{lista.length} {pl(lista.length, "pagamento", "pagamentos")}{lista.length ? ` · média de ${brl(total / lista.length)}` : ""}</p>
          {aba === "tarifas" && porTipo.length > 1 && (
            <div className="mt-4">
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Por tipo de cobrança · quantas vezes</h3>
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm">
                {porTipo.slice(0, 30).map((t) => (
                  <li key={t.tipo}>
                    {/* tocar filtra a lista pelo tipo (busca na descrição) */}
                    <button type="button" onClick={() => setBusca(t.tipo)} title={`Mostrar só "${t.tipo}"`}
                      className="flex w-full items-center gap-2 py-1.5 text-left hover:bg-slate-50">
                      <span className="min-w-0 flex-1 truncate text-fg">{t.tipo}</span>
                      <span className="num shrink-0 rounded-full bg-slate-100 px-2 text-xs font-bold text-slate-700">{t.n}×{t.unitario != null ? ` ${brl(t.unitario)}` : ""}</span>
                      <span className="num w-24 shrink-0 text-right font-semibold text-red-600">{brl(t.total)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 font-bold text-fg">Mês a mês</h2>
          {!porMes.length ? <p className="text-sm text-slate-500">Nada nos extratos e contas lançadas.</p> : (
            <ul className="space-y-1.5">
              {porMes.map(([m, x]) => (
                <li key={m}>
                  <button type="button" onClick={() => setMes(mes === m ? "" : m)} className={`w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-slate-50 ${mes === m ? "ring-2 ring-brand/40" : ""}`}>
                    <div className="flex justify-between gap-2"><span className="font-semibold text-fg">{nomeMes(m)}</span><span className="num whitespace-nowrap">{brl(x.total)} · {x.n} {pl(x.n, "pagamento", "pagamentos")}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-rose-500" style={{ width: `${Math.max(2, (x.total / maiorMes) * 100)}%` }} /></div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <h2 className="mb-2 font-bold text-fg">{def.rotulo} <span className="text-sm font-normal text-slate-500">· {lista.length} {pl(lista.length, "lançamento", "lançamentos")}</span></h2>
      <Table empty={!lista.length} head={<>
        <th className="th">Data</th><th className="th">{aba === "impostos" ? "Esfera" : aba === "tarifas" ? "Quem cobrou" : "Funcionário"}</th>
        <th className="th">Descrição</th><th className="th">Conta</th><th className="th">Situação</th><th className="th text-right">Valor</th>
      </>}>
        {lista.slice(0, 500).map((l) => (
          <tr key={`${l.fonte}${l.id}`}>
            <td className="td whitespace-nowrap">{dataBR(l.data)}</td>
            <td className="td">{l.grupo}</td>
            <td className="td [overflow-wrap:anywhere]">{l.descricao}{l.fonte === "conta" && <span className="ml-1 text-xs text-slate-500">(contas a pagar)</span>}</td>
            <td className="td text-sm text-slate-600">{nomeConta(l.conta_bancaria_id)}</td>
            <td className="td text-sm">{ROTULO_STATUS[l.status] ?? l.status}</td>
            <td className="td num whitespace-nowrap text-right font-semibold text-red-600">{brl(l.valor)}</td>
          </tr>
        ))}
      </Table>
      {lista.length > 500 && <p className="mt-2 text-xs text-slate-500">Mostrando os 500 mais novos; a planilha leva todos.</p>}
    </div>
  );
}
