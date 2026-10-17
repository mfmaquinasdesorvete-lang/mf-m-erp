// Compras em marketplaces (Mercado Livre, TikTok Shop, Shopee, Amazon…), separadas do resto como o combustível.
// Vem das notas das lojas (o marketplace aparece na NF-e como intermediador) e dos pagamentos nos extratos (Pix e cartão).
// Cada pagamento é ligado à nota de mesmo valor; o que ficou sem nota aparece para pedir. O mesmo lançamento em duas contas conta uma vez.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Package, Receipt, ShoppingBag, Store, Wallet } from "lucide-react";
import { CampoMes, Card, nomeMes, PageHeader, Stat, Table } from "@/components/ui";
import { useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { useUnidade } from "@/lib/unidade";
import { brl, dataBR, pl } from "@/lib/format";
import { estabelecimento, semRepetidos } from "@/lib/extratoTipos";
import { useComprasMarketplace } from "@/lib/comprasMarketplace";
import { casarPagamentos, formatarCnpj, marketplaceDaNota, marketplaceDoExtrato, MARKETPLACES, NOME_MARKETPLACE, type Marketplace } from "@/lib/marketplaces";

type Conta = { id: string; nome: string; unidade_id: string; ativo: boolean };
type Lanc = { id: string; conta_bancaria_id: string; data: string; valor: number; descricao: string | null; identificador?: string | null };
type Nota = { id: string; chave: string | null; emitente_nome: string | null; emitente_cnpj: string | null; valor_total: number | null; data_emissao: string | null; unidade_id: string | null; excluida_em?: string | null };
type Item = { nfe_id: string; descricao: string | null; quantidade: number | null; valor_total: number | null };

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const numeroDaChave = (c: string | null) => (c && c.length === 44 ? String(Number(c.slice(25, 34))) : "");
const ESTILO = Object.fromEntries(MARKETPLACES.map((m) => [m.id, m])) as Record<Marketplace, (typeof MARKETPLACES)[number]>;

function Chip({ m }: { m: Marketplace }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${ESTILO[m].chip}`}>{NOME_MARKETPLACE[m]}</span>;
}

/** `embutido`: dentro de Gastos separados (a tela de abas já tem o título). */
export default function ComprasMarketplace({ embutido }: { embutido?: boolean } = {}) {
  const { filtrar } = useUnidade();
  const { data: contasTodas = [] } = useRows<Conta>("contas_bancarias", { order: "nome", ascending: true });
  const contas = filtrar(contasTodas);
  const { data: lancamentos = [] } = useRows<Lanc>("extrato_lancamentos", { order: "data", ascending: false });
  const { data: notasTodas = [] } = useRows<Nota>("nfe_recebidas", { select: "id, chave, emitente_nome, emitente_cnpj, valor_total, data_emissao, unidade_id, excluida_em", order: "data_emissao", key: ["marketplace"] });
  // o marketplace de cada nota vem do XML (lido no banco: public.compras_marketplace)
  const { linhas: intermed, erro: erroIntermed } = useComprasMarketplace();
  const idsNotas = useMemo(() => intermed.map((i) => i.nota_id).sort(), [intermed]);
  const { data: itens = [] } = useQuery({
    queryKey: ["nfe_recebida_itens", "marketplace", idsNotas.length, idsNotas[0], idsNotas[idsNotas.length - 1]],
    enabled: idsNotas.length > 0,
    queryFn: async () => {
      const todos: Item[] = [];
      for (let i = 0; i < idsNotas.length; i += 150) {
        const { data, error } = await supabase.from("nfe_recebida_itens").select("nfe_id, descricao, quantidade, valor_total").in("nfe_id", idsNotas.slice(i, i + 150));
        if (error) throw error;
        todos.push(...((data ?? []) as Item[]));
      }
      return todos;
    },
  });

  const [mes, setMes] = useState("");
  const [qual, setQual] = useState<Marketplace | "">("");
  const [conta, setConta] = useState("");
  const [busca, setBusca] = useState("");

  const idsContas = new Set(contas.map((c) => c.id));
  const nomeConta = (id: string) => contasTodas.find((c) => c.id === id)?.nome ?? "—";
  const itensDe = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of itens) m.set(i.nfe_id, [...(m.get(i.nfe_id) ?? []), i]);
    return m;
  }, [itens]);
  const textoItens = (id: string) => (itensDe.get(id) ?? []).map((i) => `${Number(i.quantidade ?? 1).toLocaleString("pt-BR")}× ${i.descricao ?? ""}`).join("; ");
  const casa = (...t: unknown[]) => !busca.trim() || t.some((x) => sem(x).includes(sem(busca.trim())));

  // notas de compra em marketplace (todas as datas; o mês filtra depois)
  const notas = useMemo(() => {
    const porId = new Map(intermed.map((i) => [i.nota_id, i]));
    return filtrar(notasTodas).filter((n) => !n.excluida_em && porId.has(n.id)).map((n) => {
      const i = porId.get(n.id)!;
      return { ...n, marketplace: marketplaceDaNota(i) ?? "outro", loja_usuario: i.loja_usuario, pedido: i.pedido, intermediador: i.intermediador_cnpj, numero: numeroDaChave(n.chave) };
    });
  }, [notasTodas, intermed, filtrar]);
  // pagamentos nos extratos (Pix e cartão) com o nome do marketplace
  const pagamentosExtrato = useMemo(() => semRepetidos(lancamentos
    .filter((l) => idsContas.has(l.conta_bancaria_id) && (!conta || l.conta_bancaria_id === conta))
    .map((l) => ({ ...l, marketplace: marketplaceDoExtrato(l.descricao, Number(l.valor)) }))
    .filter((l): l is typeof l & { marketplace: Marketplace } => !!l.marketplace)), [lancamentos, contas, conta]); // eslint-disable-line react-hooks/exhaustive-deps
  const ligacao = useMemo(() => casarPagamentos(
    pagamentosExtrato.map((p) => ({ id: p.id, data: p.data, valor: Number(p.valor) })),
    notas.map((n) => ({ id: n.id, data: String(n.data_emissao ?? "").slice(0, 10), valor: Number(n.valor_total ?? 0) })),
  ), [pagamentosExtrato, notas]);
  const notaPorId = new Map(notas.map((n) => [n.id, n]));
  // "Pix Marketplace" sem o nome da loja: ligado a uma nota, vale o marketplace da nota
  const pagamentos = pagamentosExtrato.map((p) => {
    const n = p.marketplace === "outro" ? notaPorId.get(ligacao.get(p.id) ?? "") : undefined;
    return n ? { ...p, marketplace: n.marketplace } : p;
  });

  const doMes = (d: string | null | undefined) => !mes || String(d ?? "").startsWith(mes);
  const notasVis = notas.filter((n) => doMes(n.data_emissao) && (!qual || n.marketplace === qual) && casa(n.emitente_nome, n.loja_usuario, n.pedido, n.numero, textoItens(n.id)));
  const pagsVis = pagamentos.filter((p) => doMes(p.data) && (!qual || p.marketplace === qual) && casa(p.descricao));
  const totalNotas = notasVis.reduce((s, n) => s + Number(n.valor_total ?? 0), 0);
  const totalPags = -pagsVis.reduce((s, p) => s + Number(p.valor), 0);
  const semNota = pagsVis.filter((p) => !ligacao.has(p.id));
  const lojas = new Set(notasVis.map((n) => n.emitente_cnpj || n.emitente_nome)).size;

  // por marketplace (no período, sem o filtro de marketplace, para comparar)
  const porMkt = MARKETPLACES.map((m) => {
    const ns = notas.filter((n) => n.marketplace === m.id && doMes(n.data_emissao));
    const ps = pagamentos.filter((p) => p.marketplace === m.id && doMes(p.data));
    return { ...m, notas: ns.length, total: ns.reduce((s, n) => s + Number(n.valor_total ?? 0), 0), pags: ps.length, pago: -ps.reduce((s, p) => s + Number(p.valor), 0) };
  }).filter((m) => m.notas || m.pags);
  const maiorMkt = Math.max(1, ...porMkt.map((m) => Math.max(m.total, m.pago)));

  // mês a mês (notas), em segmentos por marketplace
  const porMes = useMemo(() => {
    const m = new Map<string, Map<Marketplace, number>>();
    for (const n of notas) {
      if (qual && n.marketplace !== qual) continue;
      const k = String(n.data_emissao ?? "").slice(0, 7);
      if (!k) continue;
      const x = m.get(k) ?? new Map<Marketplace, number>();
      x.set(n.marketplace, (x.get(n.marketplace) ?? 0) + Number(n.valor_total ?? 0));
      m.set(k, x);
    }
    return [...m].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12).map(([k, x]) => ({ mes: k, partes: [...x], total: [...x.values()].reduce((s, v) => s + v, 0) }));
  }, [notas, qual]);
  const maiorMes = Math.max(1, ...porMes.map((x) => x.total));

  const porLoja = useMemo(() => {
    const m = new Map<string, { nome: string; mkt: Marketplace; n: number; total: number; ultimo: string }>();
    for (const n of notasVis) {
      const k = n.emitente_cnpj || n.emitente_nome || "—";
      const x = m.get(k) ?? { nome: n.emitente_nome || "—", mkt: n.marketplace, n: 0, total: 0, ultimo: "" };
      x.n++; x.total += Number(n.valor_total ?? 0);
      const d = String(n.data_emissao ?? "").slice(0, 10);
      if (d > x.ultimo) x.ultimo = d;
      m.set(k, x);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [notasVis]);

  const outrosCnpjs = [...new Set(notas.filter((n) => n.marketplace === "outro" && n.intermediador).map((n) => formatarCnpj(n.intermediador)))];
  const periodo = mes ? nomeMes(mes) : "todas as datas";
  const estado = (ids: string[], titulo: string) => ({ aba: "recebidas", destaque: { ids, titulo, origem: "Compras em marketplaces" } });

  return (
    <div>
      {!embutido && <PageHeader title="Compras em marketplaces" subtitle="Mercado Livre, TikTok Shop, Shopee e Amazon separados do resto: notas das lojas (o marketplace vem na nota) e pagamentos nos extratos" />}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-sm text-slate-600">Mês <CampoMes value={mes} onChange={setMes} vazio="Todos os meses" rotulo="Mês" /></div>
        <select className="input w-auto" value={conta} onChange={(e) => setConta(e.target.value)} aria-label="Conta dos pagamentos">
          <option value="">Pagamentos de todas as contas</option>
          {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <input className="input w-full sm:w-72" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar loja, produto, pedido ou nº da nota" aria-label="Buscar compra" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Marketplace">
        <button type="button" aria-pressed={!qual} onClick={() => setQual("")}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${!qual ? "bg-brand text-white ring-brand" : "bg-surface text-slate-700 ring-slate-200 hover:ring-slate-300"}`}>Todos</button>
        {MARKETPLACES.map((m) => {
          const n = notas.filter((x) => x.marketplace === m.id && doMes(x.data_emissao)).length + pagamentos.filter((p) => p.marketplace === m.id && doMes(p.data) && !ligacao.has(p.id)).length;
          if (!n && qual !== m.id) return null;
          return (
            <button key={m.id} type="button" aria-pressed={qual === m.id} onClick={() => setQual(qual === m.id ? "" : m.id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${qual === m.id ? `${m.chip} ring-2` : "bg-surface text-slate-700 ring-slate-200 hover:ring-slate-300"}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${m.barra}`} aria-hidden />{m.nome} <span className="text-xs opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {erroIntermed && <Card className="mb-4 border-red-300 bg-red-50 p-3 text-sm text-red-800">Não consegui ler o marketplace das notas: {erroIntermed.message}</Card>}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={`Comprado com nota · ${periodo}`} valor={brl(totalNotas)} icon={ShoppingBag} tom="info" />
        <Stat label="Notas de compra" valor={notasVis.length} sub={`${lojas} ${pl(lojas, "loja", "lojas")}${notasVis.length ? ` · média de ${brl(totalNotas / notasVis.length)}` : ""}`} icon={Receipt} />
        <Stat label="Pagos nos extratos (Pix e cartão)" valor={brl(totalPags)} sub={`${pagsVis.length} ${pl(pagsVis.length, "pagamento", "pagamentos")}`} icon={Wallet} />
        <Stat label="Pagamentos sem nota" valor={semNota.length} sub={semNota.length ? brl(-semNota.reduce((s, p) => s + Number(p.valor), 0)) : "tudo com nota"} icon={Package} tom={semNota.length ? "atencao" : "bom"} />
      </div>

      {semNota.length > 0 && (
        <Card className="mb-4 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {semNota.length} {pl(semNota.length, "pagamento", "pagamentos")} sem nota com o mesmo valor. Confira no marketplace se a loja emitiu a nota para o CNPJ da MF
          (na conta do Mercado Livre: Compras → a compra → Nota fiscal). Sem nota, o gasto fica sem comprovante e sem crédito de imposto (confirmar com o contador).
        </Card>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 font-bold text-fg">Por marketplace <span className="text-sm font-normal text-slate-500">· {periodo}</span></h2>
          {!porMkt.length ? <p className="text-sm text-slate-500">Nenhuma compra em marketplace no período.</p> : (
            <ul className="space-y-3">
              {porMkt.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => setQual(qual === m.id ? "" : m.id)} className={`w-full rounded-lg px-2 py-1 text-left hover:bg-slate-50 ${qual === m.id ? "ring-2 ring-brand/40" : ""}`}>
                    <div className="flex flex-wrap justify-between gap-x-3 text-sm">
                      <span className="font-semibold text-fg">{m.nome}</span>
                      <span className="num whitespace-nowrap">{brl(m.total)} · {m.notas} {pl(m.notas, "nota", "notas")}</span>
                    </div>
                    <div className="mt-1 h-2.5 rounded-full bg-slate-100"><div className={`h-2.5 rounded-full ${m.barra}`} style={{ width: `${Math.max(2, (m.total / maiorMkt) * 100)}%` }} /></div>
                    {m.pags > 0 && <div className="mt-0.5 text-xs text-slate-500">{m.pags} {pl(m.pags, "pagamento", "pagamentos")} no extrato · {brl(m.pago)}</div>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {outrosCnpjs.length > 0 && <p className="mt-3 text-xs text-slate-500">Em “Outros”: intermediador com CNPJ {outrosCnpjs.join(", ")} (ainda sem nome no ERP).</p>}
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 font-bold text-fg">Mês a mês <span className="text-sm font-normal text-slate-500">· notas</span></h2>
          {!porMes.length ? <p className="text-sm text-slate-500">Nenhuma nota de marketplace.</p> : (
            <ul className="space-y-1.5">
              {porMes.map((x) => (
                <li key={x.mes}>
                  <button type="button" onClick={() => setMes(mes === x.mes ? "" : x.mes)} className={`w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-slate-50 ${mes === x.mes ? "ring-2 ring-brand/40" : ""}`}>
                    <div className="flex justify-between gap-2"><span className="font-semibold text-fg">{nomeMes(x.mes)}</span><span className="num whitespace-nowrap">{brl(x.total)}</span></div>
                    <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-slate-100" style={{ width: `${Math.max(2, (x.total / maiorMes) * 100)}%` }}>
                      {x.partes.map(([mk, v]) => <div key={mk} className={ESTILO[mk].barra} style={{ width: `${(v / x.total) * 100}%` }} title={`${NOME_MARKETPLACE[mk]}: ${brl(v)}`} />)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mb-4 p-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-fg"><Store size={18} aria-hidden /> Lojas que mais venderam para a MF <span className="text-sm font-normal text-slate-500">· {periodo}</span></h2>
        {!porLoja.length ? <p className="text-sm text-slate-500">Nada no período.</p> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 pr-3">Loja</th><th className="hidden py-1 pr-3 sm:table-cell">Marketplace</th><th className="hidden py-1 pr-3 text-right sm:table-cell">Notas</th><th className="py-1 pr-3 text-right">Total</th><th className="hidden py-1 text-right sm:table-cell">Última</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {porLoja.slice(0, 15).map((l) => (
                  <tr key={l.nome + l.ultimo}><td className="py-1.5 pr-3">{l.nome}<span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-500 sm:hidden"><Chip m={l.mkt} /> {l.n} {pl(l.n, "nota", "notas")} · última {dataBR(l.ultimo)}</span></td><td className="hidden py-1.5 pr-3 sm:table-cell"><Chip m={l.mkt} /></td><td className="hidden py-1.5 pr-3 text-right sm:table-cell">{l.n}</td><td className="num whitespace-nowrap py-1.5 pr-3 text-right font-semibold">{brl(l.total)}</td><td className="hidden whitespace-nowrap py-1.5 text-right sm:table-cell">{dataBR(l.ultimo)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold text-fg">Notas de compra <span className="text-sm font-normal text-slate-500">· {notasVis.length} {pl(notasVis.length, "nota", "notas")} · {brl(totalNotas)}</span></h2>
        {notasVis.length > 0 && <Link to="/notas" state={estado(notasVis.map((n) => n.id), `Compras em marketplaces · ${periodo}`)} className="text-sm font-semibold text-brand hover:underline">Abrir estas notas nas notas recebidas</Link>}
      </div>
      <Table empty={!notasVis.length} head={<><th className="th">Data</th><th className="th">Nota</th><th className="th">Loja</th><th className="th">Marketplace</th><th className="th">O que comprou</th><th className="th text-right">Valor</th></>}>
        {notasVis.slice(0, 300).map((n) => (
          <tr key={n.id}>
            <td className="td whitespace-nowrap">{dataBR(n.data_emissao)}</td>
            <td className="td whitespace-nowrap"><Link to="/notas" state={estado([n.id], `NF ${n.numero}`)} className="font-semibold text-brand hover:underline">NF {n.numero || "—"}</Link>{n.pedido && <div className="text-xs text-slate-500">pedido {n.pedido}</div>}</td>
            <td className="td">{n.emitente_nome}{n.loja_usuario && <div className="text-xs text-slate-500">{n.loja_usuario}</div>}</td>
            <td className="td"><Chip m={n.marketplace} /></td>
            <td className="td text-sm text-slate-700 [overflow-wrap:anywhere]">{textoItens(n.id) || "—"}</td>
            <td className="td num whitespace-nowrap text-right font-semibold">{brl(Number(n.valor_total ?? 0))}</td>
          </tr>
        ))}
      </Table>

      <h2 className="mb-2 mt-5 font-bold text-fg">Pagamentos nos extratos <span className="text-sm font-normal text-slate-500">· {pagsVis.length} {pl(pagsVis.length, "lançamento", "lançamentos")} · {brl(totalPags)}</span></h2>
      <Table empty={!pagsVis.length} head={<><th className="th">Data</th><th className="th">Descrição</th><th className="th">Conta</th><th className="th">Marketplace</th><th className="th">Nota</th><th className="th text-right">Valor</th></>}>
        {pagsVis.slice(0, 300).map((p) => {
          const n = notaPorId.get(ligacao.get(p.id) ?? "");
          return (
            <tr key={p.id}>
              <td className="td whitespace-nowrap">{dataBR(p.data)}</td>
              <td className="td">{estabelecimento(p.descricao)}</td>
              <td className="td text-sm text-slate-600">{nomeConta(p.conta_bancaria_id)}</td>
              <td className="td"><Chip m={p.marketplace} /></td>
              <td className="td text-sm">{n ? <Link to="/notas" state={estado([n.id], `NF ${n.numero}`)} className="font-semibold text-brand hover:underline">NF {n.numero} · {n.emitente_nome}</Link> : <span className="font-semibold text-amber-700">sem nota</span>}</td>
              <td className="td num whitespace-nowrap text-right font-semibold text-red-600">{brl(-Number(p.valor))}</td>
            </tr>
          );
        })}
      </Table>
      <p className="mt-3 text-xs text-slate-500">
        “MP *LOJA” no cartão é a maquininha do Mercado Pago em restaurantes e lojas físicas: não entra aqui. Nota sem pagamento no extrato costuma ter sido paga no cartão de crédito
        (o extrato do cartão de crédito ainda não vem para o ERP). “Pix Marketplace” sem o nome da loja fica em Outros até ser ligado a uma nota.
      </p>
    </div>
  );
}
