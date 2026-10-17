// Aba CT-e de Fretes e envios: os conhecimentos de transporte das transportadoras — sozinhos pela SEFAZ (a Focus busca a
// cada 15 minutos os CT-e de SC e SP) e pela planilha que o site delas deixa baixar —, com o frete que a MF paga em
// compras, vendas e transferências, o peso do frete sobre a nota, a entrega no prazo, os fornecedores onde vale negociar
// o frete e as faturas para montar (CT-e sem fatura juntos por transportadora) que viram conta a pagar.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, BadgeCheck, CheckCircle2, CircleDollarSign, Clock, FileSpreadsheet, Link2, PackageCheck, Receipt, RefreshCw, Search, Truck, Upload, X } from "lucide-react";
import { Badge, Button, Field, Modal, Section, Stat, Table, nomeMes } from "@/components/ui";
import { MontarFatura } from "@/components/fretes/CteFaturas";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { useUnidade } from "@/lib/unidade";
import {
  COLUNAS_CTE, SENTIDOS, atrasoDias, entregue, faturasSugeridas, faturavel, lerPlanilhaCtes, pesoDoFrete, porMes, porRemetente, resumoCtes, valido,
  type Cte, type FaturaSugerida, type LinhaCte, type Sentido,
} from "@/lib/cte";
import type { Transportadora } from "@/lib/types";

const pct = (v: number | null) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const div = (a: number, b: number) => (b > 0 ? a / b : null);
const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const nomeTransportadora = (t?: Transportadora | null) => (t ? t.nome_fantasia || t.nome : "—");

const COR_SENTIDO: Record<Sentido, string> = {
  entrada: "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200",
  saida: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  transferencia: "bg-purple-100 text-purple-800 ring-1 ring-inset ring-purple-200",
  outro: "bg-slate-100 text-slate-700",
};
export function SeloSentido({ s }: { s: Sentido }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${COR_SENTIDO[s]}`} title={SENTIDOS[s].dica}>{SENTIDOS[s].rotulo}</span>;
}

type SituacaoSefaz = { em?: string; novos?: number; atualizados?: number; completos?: number; erro?: string | null; pendentes_xml?: number; da_sefaz?: number };

/** Faixa da busca automática na SEFAZ: quando rodou, o que trouxe, o erro (se houve) e o botão para buscar agora. */
function BuscaSefaz({ vazio = false }: { vazio?: boolean }) {
  const { tem } = usePerfil();
  const pode = tem("financeiro", "compras");
  const qc = useQueryClient();
  const invalidar = useInvalidate();
  const [buscando, setBuscando] = useState(false);
  const { data: s } = useQuery({
    queryKey: ["ctes_sefaz_situacao"],
    queryFn: async () => ((await supabase.rpc("ctes_sefaz_situacao")).data ?? null) as SituacaoSefaz | null,
    refetchInterval: 5 * 60_000,
  });
  async function buscar() {
    setBuscando(true);
    try {
      const r = await callFunction<{ novos: number; atualizados: number; completos: number; avisos: string[] }>("nfe-recebidas-sync", { acao: "sincronizar_ctes" });
      notify(`${r.novos} ${r.novos === 1 ? "CT-e novo" : "CT-e novos"}, ${r.completos} com o XML completo${r.atualizados ? `, ${r.atualizados} com a situação atualizada` : ""}` +
        (r.avisos?.length ? `. Atenção: ${r.avisos.join("; ")}` : ""), r.avisos?.length ? "erro" : undefined);
      invalidar("ctes", "transportadoras");
      qc.invalidateQueries({ queryKey: ["ctes_sefaz_situacao"] });
    } catch (e) { notifyError(e); } finally { setBuscando(false); }
  }
  const quando = s?.em ? new Date(s.em) : null;
  const erro = s?.erro;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-3 text-sm ${erro ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${erro ? "bg-amber-200 text-amber-900" : "bg-emerald-200 text-emerald-900"}`}>
        {erro ? <AlertTriangle size={16} aria-hidden /> : <BadgeCheck size={16} aria-hidden />}
      </span>
      <span className="min-w-0 flex-1 basis-60">
        <b className="block text-fg">CT-e automáticos da SEFAZ (SC e SP)</b>
        <span className="block text-slate-700">
          {quando ? <>Última busca {quando.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            {` · ${s?.da_sefaz ?? 0} CT-e vieram da SEFAZ`}{s?.pendentes_xml ? ` · ${s.pendentes_xml} esperando o XML` : ""}</>
            : vazio ? "A busca roda a cada 15 minutos junto com as notas dos fornecedores. A SEFAZ guarda os CT-e só pelos últimos 3 meses."
            : "Ainda não rodou: a busca roda a cada 15 minutos junto com as notas dos fornecedores."}
        </span>
        {erro && <span className="mt-0.5 block text-amber-900 [overflow-wrap:anywhere]">{erro}</span>}
      </span>
      {pode && <Button variant="secondary" onClick={buscar} disabled={buscando}><RefreshCw size={15} className={buscando ? "animate-spin" : ""} /> {buscando ? "Buscando…" : "Buscar agora"}</Button>}
    </div>
  );
}

/** Faturas para montar: os CT-e sem fatura juntos por transportadora (e pelo nº da fatura quando vem no CT-e). */
function FaturasParaMontar({ grupos, porId, onMontar }: {
  grupos: FaturaSugerida[]; porId: Map<string, Transportadora>; onMontar: (g: FaturaSugerida) => void;
}) {
  if (!grupos.length) return null;
  return (
    <Section title="Faturas para montar">
      <p className="mb-2 text-[13px] text-slate-600">CT-e que a MF paga e ainda não estão em fatura. Quando a fatura da transportadora chegar, confira e toque em
        Montar: ela vai para Contas a pagar (tipo Transportadoras) e passa pela aprovação.</p>
      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {grupos.map((g) => (
          <li key={g.chave} className="flex flex-col gap-2 rounded-xl border border-l-[5px] border-slate-200 border-l-cyan-500 bg-surface p-3">
            <span className="flex flex-wrap items-baseline justify-between gap-x-2">
              <b className="min-w-0 flex-1 truncate">{nomeTransportadora(g.transportadora_id ? porId.get(g.transportadora_id) : null)}</b>
              <span className="num whitespace-nowrap text-lg font-extrabold">{brl(g.total)}</span>
            </span>
            <span className="text-[13px] text-slate-600">
              {g.qtd} CT-e de {dataBR(g.desde)}{g.ate !== g.desde ? ` a ${dataBR(g.ate)}` : ""}{g.daSefaz ? ` · ${g.daSefaz} da SEFAZ` : ""}
              {g.fatura && <> · fatura nº <b>{g.fatura}</b> informada no CT-e</>}{g.vencimento && <> · vence {dataBR(g.vencimento)}</>}
            </span>
            <Button className="self-start" onClick={() => onMontar(g)}><Receipt size={15} /> Montar fatura</Button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function CtePainel({ transportadoras }: { transportadoras: Transportadora[] }) {
  const { tem } = usePerfil();
  const podeImportar = tem("financeiro", "compras", "expedicao");
  const podeFaturar = tem("financeiro");
  const { filtrar } = useUnidade();
  const { data: todos = [] } = useRows<Cte>("ctes", { select: COLUNAS_CTE, order: "emissao", ascending: false });
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [transp, setTransp] = useState("");
  const [sentido, setSentido] = useState<Sentido | "">("");
  const [busca, setBusca] = useState("");
  const [soSemFatura, setSoSemFatura] = useState(false);
  const [soAtraso, setSoAtraso] = useState(false);
  const [importar, setImportar] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [fatura, setFatura] = useState<{ ids: string[]; numero?: string | null; vencimento?: string | null } | null>(null);

  const porId = useMemo(() => new Map(transportadoras.map((t) => [t.id, t])), [transportadoras]);
  const ctes = filtrar(todos);
  const doPeriodo = ctes.filter((c) => (!de || c.emissao >= de) && (!ate || c.emissao <= ate) && (!transp || c.transportadora_id === transp));
  const resumo = resumoCtes(doPeriodo);
  const meses = porMes(doPeriodo);
  const negociar = porRemetente(doPeriodo, 6);
  const q = sem(busca.trim());
  const lista = doPeriodo.filter((c) => (!sentido || c.sentido === sentido) && (!soSemFatura || faturavel(c)) && (!soAtraso || (atrasoDias(c) ?? 0) > 0)
    && (!q || sem([c.numero, c.nf_numero, c.remetente_nome, c.destinatario_nome, c.ag_origem, c.ag_destino].join(" ")).includes(q)));
  const transpComCte = [...new Set(ctes.map((c) => c.transportadora_id).filter(Boolean) as string[])];
  const atrasados = doPeriodo.filter((c) => (atrasoDias(c) ?? 0) > 0).length;
  const selecionaveis = lista.filter(faturavel);
  const marcadosLista = selecionaveis.filter((c) => marcados.has(c.id));
  const totalMarcado = marcadosLista.reduce((s, c) => s + Number(c.valor), 0);
  const filtros = [de, ate, transp, sentido, busca, soSemFatura || "", soAtraso || ""].filter(Boolean).length;
  const sugeridas = faturasSugeridas(ctes);

  const marcar = (id: string) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const marcarTodos = () => setMarcados(marcadosLista.length === selecionaveis.length ? new Set() : new Set(selecionaveis.map((c) => c.id)));
  const limpar = () => { setDe(""); setAte(""); setTransp(""); setSentido(""); setBusca(""); setSoSemFatura(false); setSoAtraso(false); };

  if (!todos.length) return (
    <>
      <BuscaSefaz vazio />
      <Section title="CT-e das transportadoras" className="mt-4">
        <p className="text-sm text-slate-600">Nenhum CT-e ainda. Os da SEFAZ chegam sozinhos; os mais antigos que 3 meses: baixe no site da transportadora a planilha de CT-e do período (CSV) e importe aqui: o ERP
          separa o frete das compras, das vendas e das transferências, liga cada CT-e à nota e monta a fatura para conferir.</p>
        {podeImportar && <Button className="mt-3" onClick={() => setImportar(true)}><Upload size={16} /> Importar planilha de CT-e</Button>}
      </Section>
      {importar && <ImportarCtes transportadoras={transportadoras} usadas={[]} onClose={() => setImportar(false)} />}
    </>
  );

  return (
    <div className="space-y-4">
      <BuscaSefaz />
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-surface p-3">
        <label className="block min-w-[9rem] flex-1 sm:flex-none"><span className="mb-1 block text-xs font-semibold text-slate-600">De</span>
          <input className="input" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label>
        <label className="block min-w-[9rem] flex-1 sm:flex-none"><span className="mb-1 block text-xs font-semibold text-slate-600">Até</span>
          <input className="input" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
        {transpComCte.length > 1 && (
          <label className="block min-w-[10rem] flex-1"><span className="mb-1 block text-xs font-semibold text-slate-600">Transportadora</span>
            <select className="input" value={transp} onChange={(e) => setTransp(e.target.value)}>
              <option value="">Todas</option>{transpComCte.map((id) => <option key={id} value={id}>{nomeTransportadora(porId.get(id))}</option>)}
            </select></label>
        )}
        <label className="block min-w-[12rem] flex-[2]"><span className="mb-1 block text-xs font-semibold text-slate-600">Buscar</span>
          <span className="relative block"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Nº do CT-e, nota, fornecedor, cliente, cidade" value={busca} onChange={(e) => setBusca(e.target.value)} /></span></label>
        {filtros > 0 && <Button variant="ghost" onClick={limpar}><X size={15} /> Limpar</Button>}
        <div className="ml-auto flex flex-wrap gap-2">
          {podeImportar && <Button variant="secondary" onClick={() => setImportar(true)}><Upload size={16} /> Importar planilha</Button>}
          {podeFaturar && <Button onClick={() => setFatura({ ids: marcadosLista.map((c) => c.id) })}><Receipt size={16} /> Montar fatura{marcadosLista.length ? ` (${marcadosLista.length})` : ""}</Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Frete pago pela MF" icon={CircleDollarSign} valor={brl(resumo.fretePagoMF)}
          sub={`${resumo.qtdPagoMF} de ${resumo.qtd} CT-e · os outros o fornecedor ou o cliente pagou`} />
        <Stat label="Compras chegando (frete à pagar)" icon={PackageCheck} tom="info" valor={brl(resumo.compras)}
          sub={`${pct(div(resumo.compras, resumo.nfCompras))} sobre ${brl(resumo.nfCompras)} em notas de compra`} onClick={() => setSentido(sentido === "entrada" ? "" : "entrada")} />
        <Stat label="Vendas saindo (frete pago pela MF)" icon={Truck} tom="bom" valor={brl(resumo.vendas)}
          sub={`${pct(div(resumo.vendas, resumo.nfVendas))} sobre ${brl(resumo.nfVendas)} em notas de venda`} onClick={() => setSentido(sentido === "saida" ? "" : "saida")} />
        <Stat label="Transferências SC↔SP" icon={ArrowRight} valor={brl(resumo.transferencias)} sub="frete entre a matriz e a filial"
          onClick={() => setSentido(sentido === "transferencia" ? "" : "transferencia")} />
        <Stat label="Ainda sem fatura" icon={Receipt} tom={resumo.qtdSemFatura ? "atencao" : "bom"} valor={brl(resumo.semFatura)}
          sub={resumo.qtdSemFatura ? `${resumo.qtdSemFatura} CT-e para conferir quando a fatura chegar` : "todos os CT-e já estão em fatura"}
          onClick={() => setSoSemFatura(!soSemFatura)} />
        <Stat label="Entregas no prazo" icon={Clock} tom={atrasados ? "atencao" : "bom"} valor={`${resumo.noPrazo} de ${resumo.entregues}`}
          sub={atrasados ? `${atrasados} com atraso · média de ${String(resumo.atrasoMedio).replace(".", ",")} dia(s) — toque para ver` : "nenhum atraso no período"}
          onClick={() => setSoAtraso(!soAtraso)} />
      </div>
      {resumo.cancelados > 0 && <p className="text-[13px] text-slate-600">{resumo.cancelados} CT-e {resumo.cancelados === 1 ? "cancelado fica" : "cancelados ficam"} na lista, mas fora das contas e das faturas.</p>}

      {podeFaturar && <FaturasParaMontar grupos={sugeridas} porId={porId} onMontar={(g) => setFatura({ ids: g.ids, numero: g.fatura, vencimento: g.vencimento })} />}

      <div className="grid gap-4 xl:grid-cols-5">
        <Section title="Mês a mês (frete pago pela MF)" className="xl:col-span-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 pr-2">Mês</th><th className="py-1 pr-2 text-right">CT-e</th>
                <th className="py-1 pr-2 text-right">Compras</th><th className="py-1 pr-2 text-right">Vendas</th><th className="py-1 pr-2 text-right">Transf.</th>
                <th className="py-1 pr-2 text-right">Total</th><th className="py-1 text-right" title="frete das compras sobre o valor das notas de compra">% compras</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {meses.map((m) => (
                  <tr key={m.mes}><td className="whitespace-nowrap py-1.5 pr-2 font-semibold">{nomeMes(m.mes).replace(/^./, (x) => x.toUpperCase())}</td><td className="num py-1.5 pr-2 text-right">{m.qtdPagoMF}</td>
                    <td className="num py-1.5 pr-2 text-right">{brl(m.compras)}</td><td className="num py-1.5 pr-2 text-right">{brl(m.vendas)}</td>
                    <td className="num py-1.5 pr-2 text-right">{brl(m.transferencias)}</td><td className="num py-1.5 pr-2 text-right font-semibold">{brl(m.fretePagoMF)}</td>
                    <td className="num py-1.5 text-right">{pct(div(m.compras, m.nfCompras))}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <Section title="Onde negociar o frete das compras" className="xl:col-span-2">
          <p className="mb-2 text-xs text-slate-500">Fornecedores que mandam com frete à pagar (a MF paga). Muitos CT-e pequenos: peça frete pago (CIF) ou junte os pedidos.</p>
          <ul className="divide-y divide-slate-100 text-sm">
            {negociar.map((f) => (
              <li key={f.nome} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5">
                <span className="min-w-0 flex-1 font-semibold">{f.nome}</span>
                <span className="text-xs text-slate-500">{f.qtd} CT-e · {pct(div(f.frete, f.nf))} da nota</span>
                <span className="num w-24 text-right font-semibold">{brl(f.frete)}</span>
              </li>
            ))}
            {!negociar.length && <li className="py-2 text-slate-500">Sem compras com frete à pagar no período.</li>}
          </ul>
        </Section>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold">CT-e</h2>
          <span className="text-sm text-slate-500">{lista.length} de {doPeriodo.length}</span>
          {(["", "entrada", "saida", "transferencia", "outro"] as const).map((s) => (
            <button key={s || "todos"} type="button" aria-pressed={sentido === s} onClick={() => setSentido(s)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${sentido === s ? "bg-modulo-escuro text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              {s ? SENTIDOS[s].rotulo : "Todos"}
            </button>
          ))}
          {soSemFatura && <button type="button" onClick={() => setSoSemFatura(false)} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">sem fatura <X size={12} /></button>}
          {soAtraso && <button type="button" onClick={() => setSoAtraso(false)} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">com atraso <X size={12} /></button>}
          {podeFaturar && marcadosLista.length > 0 && <span className="ml-auto text-sm font-semibold">{marcadosLista.length} marcados · {brl(totalMarcado)}</span>}
        </div>
        <Table empty={!lista.length}
          head={<>
            {podeFaturar && <th className="th w-8"><input type="checkbox" aria-label="Marcar todos sem fatura" checked={!!selecionaveis.length && marcadosLista.length === selecionaveis.length}
              onChange={marcarTodos} disabled={!selecionaveis.length} /></th>}
            <th className="th">CT-e</th><th className="th">De → para</th><th className="th">Nota</th><th className="th">Frete</th><th className="th">Entrega</th>
            <th className="th">Fatura</th><th className="th text-right">Valor</th>
          </>}>
          {lista.map((c) => {
            const atraso = atrasoDias(c);
            const peso = pesoDoFrete(c);
            return (
              <tr key={c.id} className={marcados.has(c.id) && faturavel(c) ? "bg-brand/5" : ""}>
                {podeFaturar && <td className="td">{faturavel(c) && <input type="checkbox" aria-label={`Marcar CT-e ${c.numero}`} checked={marcados.has(c.id)} onChange={() => marcar(c.id)} />}</td>}
                <td className="td"><span className={`font-semibold ${valido(c) ? "" : "line-through"}`}>{c.numero}</span>
                  {c.chave && <span title="CT-e conferido na SEFAZ (chave de acesso)" className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 text-[10px] font-bold text-emerald-800"><BadgeCheck size={11} aria-hidden />SEFAZ</span>}
                  <span className="block text-xs text-slate-500">{dataBR(c.emissao)}</span><SeloSentido s={c.sentido} />
                  {!valido(c) && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">{c.situacao}</span>}</td>
                <td className="td min-w-[14rem] text-sm"><span className="block">{c.remetente_nome ?? "—"}</span>
                  <span className="block text-slate-600">→ {c.destinatario_nome ?? "—"}</span>
                  <span className="block text-xs text-slate-500">{[c.ag_origem, c.ag_destino].filter(Boolean).join(" → ")}{c.volumes ? ` · ${c.volumes} vol.` : ""}{c.peso ? ` · ${String(c.peso).replace(".", ",")} ${c.peso_tipo === "M3" ? "m³" : "kg"}` : ""}</span></td>
                <td className="td whitespace-nowrap text-sm">{c.nf_numero ? <>
                  <span className="inline-flex items-center gap-1">nº {c.nf_numero}{(c.nfe_recebida_id || c.nota_fiscal_id) && <Link2 size={13} className="text-emerald-600" aria-label="ligada à nota no ERP" />}</span>
                  <span className="block text-xs text-slate-500">{brl(c.nf_valor)}{peso != null ? ` · frete ${pct(peso)}` : ""}</span></> : "—"}</td>
                <td className="td text-sm"><span className="whitespace-nowrap">{c.frete === "pago" ? "Pago (CIF)" : c.frete === "a_pagar" ? "À pagar (FOB)" : "—"}</span>
                  <span className={`block text-xs ${c.mf_paga ? "font-semibold text-fg" : "text-slate-500"}`}>{c.mf_paga ? "a MF paga" : c.sentido === "entrada" ? "o fornecedor paga" : "outro paga"}</span></td>
                <td className="td whitespace-nowrap text-sm">{entregue(c) ? <>
                  <span className="inline-flex items-center gap-1">{atraso ? <AlertTriangle size={13} className="text-amber-600" /> : <CheckCircle2 size={13} className="text-emerald-600" />}{dataBR(c.ocorrencia_em)}</span>
                  <span className="block text-xs text-slate-500">{atraso ? `${atraso} dia(s) de atraso` : "no prazo"}{c.prev_entrega ? ` · prev. ${dataBR(c.prev_entrega)}` : ""}</span></>
                  : <><span>{c.ocorrencia ?? "—"}</span>{c.prev_entrega && <span className="block text-xs text-slate-500">prev. {dataBR(c.prev_entrega)}</span>}</>}</td>
                <td className="td text-sm">{c.fatura_id ? <Badge value="faturado" /> : !valido(c) ? <span className="text-xs text-slate-400">não entra</span>
                  : c.mf_paga ? <span className="text-xs font-semibold text-amber-700">sem fatura</span> : <span className="text-xs text-slate-400">não se aplica</span>}</td>
                <td className={`td num text-right font-semibold ${c.mf_paga && valido(c) ? "" : "text-slate-400"} ${valido(c) ? "" : "line-through"}`}>{brl(c.valor)}</td>
              </tr>
            );
          })}
        </Table>
      </div>

      {importar && <ImportarCtes transportadoras={transportadoras} usadas={transpComCte} onClose={() => setImportar(false)} />}
      {fatura && <MontarFatura ctes={ctes} transportadoras={transportadoras} inicial={fatura.ids} numeroInicial={fatura.numero} vencimentoInicial={fatura.vencimento}
        onClose={(ok) => { setFatura(null); if (ok) setMarcados(new Set()); }} />}
    </div>
  );
}

type Arquivo = { nome: string; linhas: LinhaCte[]; erros: string[] };

/** Lê o CSV (UTF-8 ou o padrão do Windows) e mostra o que vai entrar antes de gravar. */
function ImportarCtes({ transportadoras, usadas, onClose }: { transportadoras: Transportadora[]; usadas: string[]; onClose: () => void }) {
  const invalidar = useInvalidate();
  const opcoes = transportadoras.filter((t) => t.ativo !== false && (!t.tipo || t.tipo === "transportadora"));
  const [transp, setTransp] = useState(usadas[0] ?? "");
  const [arquivos, setArquivos] = useState<Arquivo[]>([]);
  const [gravando, setGravando] = useState(false);
  const linhas = arquivos.flatMap((a) => a.linhas);
  const datas = linhas.map((l) => l.emissao).sort();

  async function ler(files: FileList | null) {
    const lidos: Arquivo[] = [];
    for (const f of Array.from(files ?? [])) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      let texto: string;
      try { texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { texto = new TextDecoder("windows-1252").decode(bytes); }
      lidos.push({ nome: f.name, ...lerPlanilhaCtes(texto) });
    }
    setArquivos(lidos);
  }

  async function gravar() {
    if (!transp) return notifyError(new Error("escolha a transportadora"));
    setGravando(true);
    const total = { novos: 0, atualizados: 0, ignorados: 0 };
    try {
      for (const a of arquivos.filter((x) => x.linhas.length)) {
        const { data, error } = await supabase.rpc("importar_ctes", { p_transportadora: transp, p_linhas: a.linhas, p_arquivo: a.nome });
        if (error) throw error;
        const r = data as typeof total;
        total.novos += r.novos; total.atualizados += r.atualizados; total.ignorados += r.ignorados;
      }
      notify(`${total.novos} CT-e novos${total.atualizados ? `, ${total.atualizados} atualizados (entrega)` : ""}${total.ignorados ? `, ${total.ignorados} ignorados` : ""}`);
      invalidar("ctes");
      onClose();
    } catch (e) { notifyError(e); } finally { setGravando(false); }
  }

  return (
    <Modal open onClose={onClose} title="Importar CT-e da transportadora">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">No site da transportadora, baixe o relatório de CT-e do período em CSV (colunas Documento, Tipo, Nota Fiscal, CNPJ Dest…).
          Pode mandar vários meses de uma vez e repetir um mês: o CT-e que já está no ERP só atualiza a entrega.</p>
        <Field label="Transportadora">
          <select className="input" value={transp} onChange={(e) => setTransp(e.target.value)}>
            <option value="">Escolha…</option>
            {opcoes.map((t) => <option key={t.id} value={t.id}>{nomeTransportadora(t)}{t.municipio ? ` · ${t.municipio}/${t.uf ?? ""}` : ""}</option>)}
          </select>
        </Field>
        <Field label="Planilhas (CSV)">
          <input className="input" type="file" accept=".csv,text/csv" multiple onChange={(e) => ler(e.target.files)} />
        </Field>
        {arquivos.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
            {arquivos.map((a) => (
              <li key={a.nome} className="p-3">
                <span className="flex flex-wrap items-center gap-2"><FileSpreadsheet size={15} className="text-slate-500" /><span className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]">{a.nome}</span>
                  <span>{a.linhas.length} CT-e · {brl(a.linhas.reduce((s, l) => s + l.valor, 0))}</span></span>
                {a.erros.map((e) => <span key={e} className="mt-1 block text-xs text-amber-700">{e}</span>)}
              </li>
            ))}
          </ul>
        )}
        {linhas.length > 0 && <p className="text-sm">Vão entrar <b>{linhas.length} CT-e</b> de {dataBR(datas[0])} a {dataBR(datas[datas.length - 1])}. O ERP vê quem é a MF em cada um
          (compra, venda ou transferência), quem paga o frete e liga à nota.</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={gravar} disabled={!linhas.length || !transp || gravando}><Upload size={16} /> {gravando ? "Importando…" : `Importar ${linhas.length || ""} CT-e`}</Button>
        </div>
      </div>
    </Modal>
  );
}
