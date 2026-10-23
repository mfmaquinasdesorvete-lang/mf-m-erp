// Gastos separados → Quiosques: o que a MF gastou na montagem dos quiosques (MDF, fitas de borda, tinta, ferragens…).
// Vem das notas de fornecedor com o marcador "Quiosques" (e das contas a pagar marcadas sem nota) e dos pagamentos
// nos extratos às lojas dessas notas. Para incluir outra compra, basta pôr o marcador nela.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Hammer, PaintBucket, Receipt, Store, Wallet } from "lucide-react";
import { Button, Card, chip, nomeMes, Stat, Table } from "@/components/ui";
import { BarraFiltros } from "@/components/filtros/BarraFiltros";
import { mesDoPeriodo, noPeriodo, periodoDoAtalho, periodoDoMes, rotuloPeriodo, SEM_PERIODO, temPeriodo, type Periodo } from "@/lib/filtroLista";
import { useMarcadores } from "@/components/nfe/Marcadores";
import { useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { useUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import { notifyError } from "@/lib/notify";
import { baixarPlanilha } from "@/lib/exportar";
import { estabelecimento, semRepetidos } from "@/lib/extratoTipos";
import { casarPagamentos } from "@/lib/marketplaces";
import { chaveDaLoja, ehMarcadorQuiosque, GRUPOS_QUIOSQUE, grupoDoItem, NOME_GRUPO, pagamentoDeQuiosque, type GrupoQuiosque } from "@/lib/quiosques";

type Conta = { id: string; nome: string; unidade_id: string; ativo: boolean };
type Lanc = { id: string; conta_bancaria_id: string; data: string; valor: number; descricao: string | null; identificador?: string | null };
type Nota = { id: string; chave: string | null; emitente_nome: string | null; emitente_cnpj: string | null; valor_total: number | null; data_emissao: string | null; unidade_id: string | null; excluida_em?: string | null; marcadores?: string[] | null };
type Item = { nfe_id: string; descricao: string | null; quantidade: number | null; valor_total: number | null };
type Pagar = { id: string; descricao: string | null; valor: number | null; vencimento: string | null; status: string | null; data_pagamento?: string | null; nfe_recebida_id?: string | null; unidade_id?: string | null; marcadores?: string[] | null };

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const numeroDaChave = (c: string | null) => (c && c.length === 44 ? String(Number(c.slice(25, 34))) : "");
const ESTILO = Object.fromEntries(GRUPOS_QUIOSQUE.map((g) => [g.id, g])) as Record<GrupoQuiosque, (typeof GRUPOS_QUIOSQUE)[number]>;
const ICONE: Record<GrupoQuiosque, typeof Hammer> = { mdf: Store, tinta: PaintBucket, ferragens: Hammer };

function Chip({ g, valor }: { g: GrupoQuiosque; valor?: number }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${ESTILO[g].chip}`}>{NOME_GRUPO[g]}{valor != null && <span className="num ml-1 opacity-80">{brl(valor)}</span>}</span>;
}

export default function GastosQuiosques() {
  const { filtrar } = useUnidade();
  const { data: marcadores = [] } = useMarcadores();
  const marcador = marcadores.find((m) => ehMarcadorQuiosque(m.nome));
  const { data: notasTodas = [] } = useRows<Nota>("nfe_recebidas", { select: "id, chave, emitente_nome, emitente_cnpj, valor_total, data_emissao, unidade_id, excluida_em, marcadores", order: "data_emissao", key: ["quiosques"] });
  const { data: pagarTodas = [] } = useRows<Pagar>("contas_pagar", { select: "id, descricao, valor, vencimento, status, data_pagamento, nfe_recebida_id, unidade_id, marcadores", order: "vencimento", key: ["quiosques"] });
  const { data: contasTodas = [] } = useRows<Conta>("contas_bancarias", { order: "nome", ascending: true });
  const contas = filtrar(contasTodas);
  const { data: lancamentos = [] } = useRows<Lanc>("extrato_lancamentos", { order: "data", ascending: false });

  // abre no mês atual; tocar num mês do "Mês a mês" escolhe o mês inteiro
  const [faixa, setFaixa] = useState<Periodo>(() => periodoDoAtalho("mes", hoje()));
  const mes = mesDoPeriodo(faixa);
  const [grupo, setGrupo] = useState<GrupoQuiosque | "">("");
  const [busca, setBusca] = useState("");

  const notas = useMemo(() => !marcador ? [] : filtrar(notasTodas)
    .filter((n) => !n.excluida_em && (n.marcadores ?? []).includes(marcador.id))
    .map((n) => ({ ...n, numero: numeroDaChave(n.chave) })), [notasTodas, marcador, filtrar]);
  const idsNotas = useMemo(() => notas.map((n) => n.id).sort(), [notas]);
  const { data: itens = [] } = useQuery({
    queryKey: ["nfe_recebida_itens", "quiosques", idsNotas.length, idsNotas[0], idsNotas[idsNotas.length - 1]],
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
  // contas a pagar marcadas que não vieram de uma nota marcada (ex.: mão de obra do marceneiro sem nota)
  const idsSet = new Set(idsNotas);
  const avulsas = !marcador ? [] : filtrar(pagarTodas).filter((c) => (c.marcadores ?? []).includes(marcador.id) && !(c.nfe_recebida_id && idsSet.has(c.nfe_recebida_id)));

  // itens por nota, já com o grupo
  const itensDe = useMemo(() => {
    const m = new Map<string, (Item & { grupo: GrupoQuiosque })[]>();
    for (const i of itens) m.set(i.nfe_id, [...(m.get(i.nfe_id) ?? []), { ...i, grupo: grupoDoItem(i.descricao) }]);
    return m;
  }, [itens]);
  const somaGrupos = (id: string) => {
    const r: Record<GrupoQuiosque, number> = { mdf: 0, tinta: 0, ferragens: 0 };
    for (const i of itensDe.get(id) ?? []) r[i.grupo] += Number(i.valor_total ?? 0);
    return r;
  };

  // pagamentos nos extratos às lojas das notas (ou a lojas de tinta e MDF)
  const chaves = useMemo(() => [...new Set(notas.map((n) => n.emitente_nome ?? ""))].map(chaveDaLoja), [notas]);
  const idsContas = new Set(contas.map((c) => c.id));
  const nomeConta = (id: string) => contasTodas.find((c) => c.id === id)?.nome ?? "—";
  const pagamentos = useMemo(() => semRepetidos(lancamentos.filter((l) => idsContas.has(l.conta_bancaria_id) && pagamentoDeQuiosque(l.descricao, Number(l.valor), chaves))),
    [lancamentos, contas, chaves]); // eslint-disable-line react-hooks/exhaustive-deps
  const ligacao = useMemo(() => casarPagamentos(
    pagamentos.map((p) => ({ id: p.id, data: p.data, valor: Number(p.valor) })),
    notas.map((n) => ({ id: n.id, data: String(n.data_emissao ?? "").slice(0, 10), valor: Number(n.valor_total ?? 0) })),
  ), [pagamentos, notas]);
  const notaPorId = new Map(notas.map((n) => [n.id, n]));

  const doMes = (d: string | null | undefined) => noPeriodo(d, faixa);
  const casa = (...t: unknown[]) => !busca.trim() || t.some((x) => sem(x).includes(sem(busca.trim())));
  const textoItens = (id: string) => (itensDe.get(id) ?? []).map((i) => i.descricao ?? "").join(" ");
  const notasVis = notas.filter((n) => doMes(n.data_emissao) && (!grupo || somaGrupos(n.id)[grupo] > 0) && casa(n.emitente_nome, n.numero, textoItens(n.id)));
  const avulsasVis = grupo ? [] : avulsas.filter((c) => doMes(c.data_pagamento ?? c.vencimento) && casa(c.descricao));
  const pagsVis = pagamentos.filter((p) => doMes(p.data) && casa(p.descricao));

  const porGrupo = GRUPOS_QUIOSQUE.map((g) => ({ ...g, total: notasVis.reduce((s, n) => s + somaGrupos(n.id)[g.id], 0) }));
  const totalItens = porGrupo.reduce((s, g) => s + g.total, 0);
  const totalNotas = notasVis.reduce((s, n) => s + Number(n.valor_total ?? 0), 0);
  const totalAvulsas = avulsasVis.reduce((s, c) => s + Number(c.valor ?? 0), 0);
  const gasto = grupo ? porGrupo.find((g) => g.id === grupo)!.total : totalNotas + totalAvulsas;
  const totalPags = -pagsVis.reduce((s, p) => s + Number(p.valor), 0);
  const semNota = pagsVis.filter((p) => !ligacao.has(p.id));
  const maiorGrupo = Math.max(1, ...porGrupo.map((g) => g.total));
  const periodo = mes ? nomeMes(mes) : temPeriodo(faixa) ? rotuloPeriodo(faixa, hoje()).toLowerCase() : "todas as datas";

  // mês a mês (itens das notas), em segmentos por grupo
  const porMes = useMemo(() => {
    const m = new Map<string, Record<GrupoQuiosque, number>>();
    for (const n of notas) {
      const k = String(n.data_emissao ?? "").slice(0, 7);
      if (!k) continue;
      const x = m.get(k) ?? { mdf: 0, tinta: 0, ferragens: 0 };
      const s = somaGrupos(n.id);
      for (const g of GRUPOS_QUIOSQUE) if (!grupo || g.id === grupo) x[g.id] += s[g.id];
      m.set(k, x);
    }
    return [...m].sort((a, b) => b[0].localeCompare(a[0])).map(([k, x]) => ({ mes: k, partes: x, total: x.mdf + x.tinta + x.ferragens })).filter((x) => x.total > 0).slice(0, 18);
  }, [notas, itensDe, grupo]); // eslint-disable-line react-hooks/exhaustive-deps
  const maiorMes = Math.max(1, ...porMes.map((x) => x.total));

  const porLoja = useMemo(() => {
    const m = new Map<string, { nome: string; n: number; total: number; ultimo: string }>();
    for (const n of notasVis) {
      const k = n.emitente_cnpj || n.emitente_nome || "—";
      const x = m.get(k) ?? { nome: n.emitente_nome || "—", n: 0, total: 0, ultimo: "" };
      x.n++; x.total += Number(n.valor_total ?? 0);
      const d = String(n.data_emissao ?? "").slice(0, 10);
      if (d > x.ultimo) x.ultimo = d;
      m.set(k, x);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [notasVis]); // eslint-disable-line react-hooks/exhaustive-deps

  const estado = (ids: string[], titulo: string) => ({ aba: "recebidas", destaque: { ids, titulo, origem: "Gastos com quiosques" } });

  function exportar() {
    baixarPlanilha(`gastos-quiosques${mes ? `-${mes}` : faixa.de ? `-${faixa.de}` : ""}`, [
      { nome: "Notas", linhas: notasVis.map((n) => { const s = somaGrupos(n.id); return {
        Data: dataBR(n.data_emissao), NF: n.numero, Loja: n.emitente_nome ?? "", [NOME_GRUPO.mdf]: s.mdf, [NOME_GRUPO.tinta]: s.tinta, [NOME_GRUPO.ferragens]: s.ferragens,
        "Frete e impostos": Number(n.valor_total ?? 0) - s.mdf - s.tinta - s.ferragens, "Valor da nota": Number(n.valor_total ?? 0) }; }) },
      { nome: "Itens", linhas: notasVis.flatMap((n) => (itensDe.get(n.id) ?? []).map((i) => ({
        Data: dataBR(n.data_emissao), NF: n.numero, Loja: n.emitente_nome ?? "", Grupo: NOME_GRUPO[i.grupo], Item: i.descricao ?? "", Quantidade: Number(i.quantidade ?? 0), Valor: Number(i.valor_total ?? 0) }))) },
      { nome: "Contas sem nota", linhas: avulsasVis.map((c) => ({ Vencimento: dataBR(c.vencimento), Descrição: c.descricao ?? "", Situação: c.status ?? "", Valor: Number(c.valor ?? 0) })) },
      { nome: "Pagamentos", linhas: pagsVis.map((p) => { const n = notaPorId.get(ligacao.get(p.id) ?? ""); return {
        Data: dataBR(p.data), Descrição: p.descricao ?? "", Conta: nomeConta(p.conta_bancaria_id), Nota: n ? `NF ${n.numero} · ${n.emitente_nome}` : "sem nota ligada", Valor: -Number(p.valor) }; }) },
    ]).catch(notifyError);
  }

  if (marcadores.length && !marcador) {
    return (
      <Card className="p-5 text-sm text-slate-600">
        Ainda não existe o marcador <b>Quiosques</b>. Crie em Notas fiscais → Recebidas → Marcadores e marque as notas de MDF, tinta e ferragens dos quiosques: elas aparecem aqui.
      </Card>
    );
  }

  return (
    <div>
      <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Buscar loja, item ou nº da nota" periodo={faixa} onPeriodo={setFaixa} rotuloData="Data"
        nFiltros={grupo ? 1 : 0} onLimpar={() => { setBusca(""); setGrupo(""); setFaixa(SEM_PERIODO); }}
        direita={<Button variant="secondary" onClick={exportar} disabled={!notasVis.length && !pagsVis.length}><Download size={16} /> Exportar</Button>} />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Grupo de material">
        <button type="button" aria-pressed={!grupo} onClick={() => setGrupo("")}
          className={chip(!grupo)}>Tudo</button>
        {porGrupo.map((g) => (
          <button key={g.id} type="button" aria-pressed={grupo === g.id} onClick={() => setGrupo(grupo === g.id ? "" : g.id)}
            className={chip(grupo === g.id, `${g.chip} ring-2`)}>
            <span className={`h-2.5 w-2.5 rounded-full ${g.barra}`} aria-hidden />{g.nome}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={`${grupo ? NOME_GRUPO[grupo] : "Gasto com quiosques"} · ${periodo}`} valor={brl(gasto)} icon={Hammer} tom="info"
          sub={grupo ? `itens de ${notasVis.length} ${pl(notasVis.length, "nota", "notas")}` : `${notasVis.length} ${pl(notasVis.length, "nota", "notas")}${avulsasVis.length ? ` + ${avulsasVis.length} ${pl(avulsasVis.length, "conta", "contas")} sem nota` : ""}`} />
        <Stat label="MDF e fitas de borda" valor={brl(porGrupo[0].total)} sub={totalItens ? `${Math.round((porGrupo[0].total / totalItens) * 100)}% dos itens` : undefined} icon={Store} onClick={() => setGrupo(grupo === "mdf" ? "" : "mdf")} />
        <Stat label="Tinta e acabamento" valor={brl(porGrupo[1].total)} sub={totalItens ? `${Math.round((porGrupo[1].total / totalItens) * 100)}% dos itens` : undefined} icon={PaintBucket} onClick={() => setGrupo(grupo === "tinta" ? "" : "tinta")} />
        <Stat label="Pagos nos extratos" valor={brl(totalPags)} sub={`${pagsVis.length} ${pl(pagsVis.length, "pagamento", "pagamentos")}${semNota.length ? ` · ${semNota.length} sem nota ligada` : ""}`} icon={Wallet} tom={semNota.length ? "atencao" : "neutro"} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 font-bold text-fg">Por material <span className="text-sm font-normal text-slate-500">· {periodo}</span></h2>
          {!totalItens ? <p className="text-sm text-slate-500">Nenhum item de quiosque no período.</p> : (
            <ul className="space-y-3">
              {porGrupo.map((g) => {
                const Icone = ICONE[g.id];
                return (
                  <li key={g.id}>
                    <button type="button" onClick={() => setGrupo(grupo === g.id ? "" : g.id)} className={`linha-clicavel px-2 py-1 ${grupo === g.id ? "ring-2 ring-brand/40" : ""}`}>
                      <div className="flex flex-wrap justify-between gap-x-3 text-sm">
                        <span className="flex items-center gap-1.5 font-semibold text-fg"><Icone size={15} aria-hidden /> {g.nome}</span>
                        <span className="num whitespace-nowrap">{brl(g.total)}</span>
                      </div>
                      <div className="mt-1 h-2.5 rounded-full bg-slate-100"><div className={`h-2.5 rounded-full ${g.barra}`} style={{ width: `${Math.max(2, (g.total / maiorGrupo) * 100)}%` }} /></div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!grupo && totalNotas - totalItens > 0.5 && <p className="mt-3 text-xs text-slate-500">Mais {brl(totalNotas - totalItens)} de frete e impostos destacados nas notas (entram no total do gasto).</p>}
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 font-bold text-fg">Mês a mês <span className="text-sm font-normal text-slate-500">· itens das notas</span></h2>
          {!porMes.length ? <p className="text-sm text-slate-500">Nenhuma nota de quiosque.</p> : (
            <ul className="space-y-1.5">
              {porMes.map((x) => (
                <li key={x.mes}>
                  <button type="button" onClick={() => setFaixa(mes === x.mes ? SEM_PERIODO : periodoDoMes(x.mes))} className={`linha-clicavel px-2 py-1 text-sm ${mes === x.mes ? "ring-2 ring-brand/40" : ""}`}>
                    <div className="flex justify-between gap-2"><span className="font-semibold text-fg">{nomeMes(x.mes)}</span><span className="num whitespace-nowrap">{brl(x.total)}</span></div>
                    <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-slate-100" style={{ width: `${Math.max(2, (x.total / maiorMes) * 100)}%` }}>
                      {GRUPOS_QUIOSQUE.filter((g) => x.partes[g.id] > 0).map((g) => <div key={g.id} className={g.barra} style={{ width: `${(x.partes[g.id] / x.total) * 100}%` }} title={`${g.nome}: ${brl(x.partes[g.id])}`} />)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {porLoja.length > 0 && (
        <Card className="mb-4 p-4">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-fg"><Store size={18} aria-hidden /> Lojas <span className="text-sm font-normal text-slate-500">· {periodo}</span></h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 pr-3">Loja</th><th className="hidden py-1 pr-3 text-right sm:table-cell">Notas</th><th className="py-1 pr-3 text-right">Total</th><th className="hidden py-1 text-right sm:table-cell">Última</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {porLoja.slice(0, 12).map((l) => (
                  <tr key={l.nome + l.ultimo}><td className="py-1.5 pr-3">{l.nome}<span className="block text-xs text-slate-500 sm:hidden">{l.n} {pl(l.n, "nota", "notas")} · última {dataBR(l.ultimo)}</span></td><td className="hidden py-1.5 pr-3 text-right sm:table-cell">{l.n}</td><td className="num whitespace-nowrap py-1.5 pr-3 text-right font-semibold">{brl(l.total)}</td><td className="hidden whitespace-nowrap py-1.5 text-right sm:table-cell">{dataBR(l.ultimo)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-fg"><Receipt size={18} aria-hidden /> Notas de compra <span className="text-sm font-normal text-slate-500">· {notasVis.length} {pl(notasVis.length, "nota", "notas")} · {brl(totalNotas)}</span></h2>
        {notasVis.length > 0 && <Link to="/notas" state={estado(notasVis.map((n) => n.id), `Quiosques · ${periodo}`)} className="link-acao text-sm">Abrir estas notas nas notas recebidas</Link>}
      </div>
      <Table empty={!notasVis.length} head={<><th className="th">Data</th><th className="th">Nota</th><th className="th">Loja</th><th className="th">Material</th><th className="th text-right">Valor</th></>}>
        {notasVis.slice(0, 300).map((n) => {
          const s = somaGrupos(n.id);
          const its = itensDe.get(n.id) ?? [];
          return (
            <tr key={n.id}>
              <td className="td whitespace-nowrap">{dataBR(n.data_emissao)}</td>
              <td className="td whitespace-nowrap"><Link to="/notas" state={estado([n.id], `NF ${n.numero}`)} className="link-acao">NF {n.numero || "—"}</Link></td>
              <td className="td">{n.emitente_nome}</td>
              <td className="td">
                <div className="flex flex-wrap gap-1">{GRUPOS_QUIOSQUE.filter((g) => s[g.id] > 0).map((g) => <Chip key={g.id} g={g.id} valor={s[g.id]} />)}</div>
                {its.length > 0 && <div className="mt-1 text-xs text-slate-500 [overflow-wrap:anywhere]">{its.slice(0, 4).map((i) => i.descricao).join("; ")}{its.length > 4 ? ` e mais ${its.length - 4}` : ""}</div>}
              </td>
              <td className="td num whitespace-nowrap text-right font-semibold">{brl(grupo ? s[grupo] : Number(n.valor_total ?? 0))}</td>
            </tr>
          );
        })}
      </Table>

      {avulsasVis.length > 0 && <>
        <h2 className="mb-2 mt-5 font-bold text-fg">Contas sem nota <span className="text-sm font-normal text-slate-500">· {avulsasVis.length} · {brl(totalAvulsas)}</span></h2>
        <Table head={<><th className="th">Vencimento</th><th className="th">Descrição</th><th className="th">Situação</th><th className="th text-right">Valor</th></>}>
          {avulsasVis.map((c) => (
            <tr key={c.id}><td className="td whitespace-nowrap">{dataBR(c.vencimento)}</td><td className="td">{c.descricao}</td><td className="td text-sm">{c.status === "pago" ? "paga" : "em aberto"}</td><td className="td num whitespace-nowrap text-right font-semibold">{brl(Number(c.valor ?? 0))}</td></tr>
          ))}
        </Table>
      </>}

      <h2 className="mb-2 mt-5 flex items-center gap-2 font-bold text-fg"><Wallet size={18} aria-hidden /> Pagamentos nos extratos <span className="text-sm font-normal text-slate-500">· {pagsVis.length} {pl(pagsVis.length, "lançamento", "lançamentos")} · {brl(totalPags)}</span></h2>
      <Table empty={!pagsVis.length} head={<><th className="th">Data</th><th className="th">Descrição</th><th className="th">Conta</th><th className="th">Nota</th><th className="th text-right">Valor</th></>}>
        {pagsVis.slice(0, 300).map((p) => {
          const n = notaPorId.get(ligacao.get(p.id) ?? "");
          return (
            <tr key={p.id}>
              <td className="td whitespace-nowrap">{dataBR(p.data)}</td>
              <td className="td">{estabelecimento(p.descricao)}</td>
              <td className="td text-sm text-slate-600">{nomeConta(p.conta_bancaria_id)}</td>
              <td className="td text-sm">{n ? <Link to="/notas" state={estado([n.id], `NF ${n.numero}`)} className="link-acao">NF {n.numero} · {n.emitente_nome}</Link> : <span className="font-semibold text-amber-700">sem nota ligada</span>}</td>
              <td className="td num whitespace-nowrap text-right font-semibold text-red-600">{brl(-Number(p.valor))}</td>
            </tr>
          );
        })}
      </Table>
      <p className="mt-3 text-xs text-slate-500">
        Entra aqui toda nota de fornecedor e conta a pagar com o marcador <b>Quiosques</b>: para incluir outra compra, ponha o marcador nela (Notas fiscais → Recebidas, ou Contas a pagar).
        Os pagamentos são achados pelo nome das lojas dessas notas e das lojas de tinta e MDF; confira os que ficaram sem nota ligada, porque podem ser de outra obra.
        Quiosque vendido pela MF precisa de NF-e de venda; o que foi entregue no pacote do licenciamento da My Frost é assunto para o contador.
      </p>
    </div>
  );
}
