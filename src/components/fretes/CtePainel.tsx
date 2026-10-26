// Aba CT-e de Fretes e envios: os conhecimentos de transporte das transportadoras — sozinhos pela SEFAZ (a Focus busca a
// cada 15 minutos os CT-e de SC e SP) e pela planilha que o site delas deixa baixar —, com o frete que a MF paga em
// compras, vendas e transferências, o peso do frete sobre a nota, a entrega no prazo, os fornecedores onde vale negociar
// o frete e as faturas para montar (CT-e sem fatura juntos por transportadora) que viram conta a pagar.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, CheckCircle2, Clock, FileSpreadsheet, Link2, Receipt, RefreshCw, Upload, X } from "lucide-react";
import { Badge, Button, Section, Table, nomeMes, chip } from "@/components/ui";
import { ImportarCteXml } from "@/components/fretes/ImportarCteXml";
import { BarraSentidos, FaturasParaMontar, MenuImportar, div, nomeTransportadora, pct } from "@/components/fretes/CteResumo";
import { ImportarCtes } from "@/components/fretes/CteImportarPlanilha";
import { BarraFiltros } from "@/components/filtros/BarraFiltros";
import { MontarFatura } from "@/components/fretes/CteFaturas";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, hoje } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { useUnidade } from "@/lib/unidade";
import {
  COLUNAS_CTE, SENTIDOS, atrasoDias, entregue, faturasSugeridas, faturavel, pesoDoFrete, porMes, porRemetente, resumoCtes, valido,
  type Cte, type Sentido,
} from "@/lib/cte";
import type { Transportadora } from "@/lib/types";

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export { nomeTransportadora };

const COR_SENTIDO: Record<Sentido, string> = {
  entrada: "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200",
  saida: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  transferencia: "bg-purple-100 text-purple-800 ring-1 ring-inset ring-purple-200",
  outro: "bg-slate-100 text-slate-700",
};
export function SeloSentido({ s }: { s: Sentido }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold ${COR_SENTIDO[s]}`} title={SENTIDOS[s].dica}>{SENTIDOS[s].rotulo}</span>;
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
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${erro ? "rounded-cartao border border-amber-300 bg-amber-50 p-2 text-amber-900" : "text-slate-600"}`}>
      {erro ? <AlertTriangle size={14} className="shrink-0" aria-hidden /> : <BadgeCheck size={14} className="shrink-0 text-emerald-600" aria-hidden />}
      <span className="min-w-0 flex-1 basis-60">
        CT-e automáticos da SEFAZ (SC e SP):{" "}
        {quando ? <>última busca {quando.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}{` · ${s?.da_sefaz ?? 0} vieram da SEFAZ`}</>
          : vazio ? "a busca roda a cada 15 minutos; a SEFAZ guarda os CT-e só pelos últimos 3 meses."
          : "ainda não rodou (roda a cada 15 minutos)."}
        {erro && <span className="block font-semibold [overflow-wrap:anywhere]">{erro}</span>}
      </span>
      {pode && <button type="button" className="link-acao inline-flex items-center gap-1" onClick={buscar} disabled={buscando}><RefreshCw size={13} className={buscando ? "animate-spin" : ""} /> {buscando ? "Buscando…" : "Buscar agora"}</button>}
    </div>
  );
}

/** Quantos CT-e da SEFAZ ainda esperam o XML completo (para o "O que fazer"). */
function usePendentesXml() {
  const { data } = useQuery({
    queryKey: ["ctes_sefaz_situacao"],
    queryFn: async () => ((await supabase.rpc("ctes_sefaz_situacao")).data ?? null) as SituacaoSefaz | null,
    refetchInterval: 5 * 60_000,
  });
  return data?.pendentes_xml ?? 0;
}

export function CtePainel({ transportadoras }: { transportadoras: Transportadora[] }) {
  const { tem } = usePerfil();
  const podeImportar = tem("financeiro", "compras", "expedicao");
  const podeFaturar = tem("financeiro");
  const { filtrar } = useUnidade();
  const { data: todos = [] } = useRows<Cte>("ctes", { select: COLUNAS_CTE, order: "emissao", ascending: false });
  // período padrão: este mês (o total "de sempre" misturava os anos)
  const [de, setDe] = useState(() => `${hoje().slice(0, 7)}-01`);
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
  const sugeridas = faturasSugeridas(ctes);
  const pendentesXml = usePendentesXml();
  const semFaturaTotal = sugeridas.reduce((t, g) => ({ qtd: t.qtd + g.qtd, valor: Math.round((t.valor + g.total) * 100) / 100 }), { qtd: 0, valor: 0 });
  const rotuloPeriodo = de || ate ? `${de ? dataBR(de) : "início"} a ${ate ? dataBR(ate) : "hoje"}` : "todo o período";

  const marcar = (id: string) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const marcarTodos = () => setMarcados(marcadosLista.length === selecionaveis.length ? new Set() : new Set(selecionaveis.map((c) => c.id)));
  const limpar = () => { setDe(""); setAte(""); setTransp(""); setSentido(""); setBusca(""); setSoSemFatura(false); setSoAtraso(false); };

  if (!todos.length) return (
    <>
      <BuscaSefaz vazio />
      <Section title="CT-e das transportadoras" className="mt-4">
        <p className="text-sm text-slate-600">Nenhum CT-e ainda. Os da SEFAZ chegam sozinhos; os mais antigos que 3 meses: envie os XML (ou o ZIP) do portal da transportadora ou do contador, ou importe a planilha de CT-e do período (CSV): o ERP
          separa o frete das compras, das vendas e das transferências, liga cada CT-e à nota e monta a fatura para conferir.</p>
        {podeImportar && <div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => setImportar(true)}><Upload size={16} /> Importar planilha de CT-e</Button><ImportarCteXml /></div>}
      </Section>
      {importar && <ImportarCtes transportadoras={transportadoras} usadas={[]} onClose={() => setImportar(false)} />}
    </>
  );

  return (
    <div className="space-y-4">
      <BuscaSefaz />
      {/* sentido, sem fatura e atraso têm os chips da lista, mas contam como filtro em uso para o Limpar */}
      <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Nº do CT-e, nota, fornecedor, cliente, cidade"
        periodo={{ de, ate }} onPeriodo={(p) => { setDe(p.de); setAte(p.ate); }} rotuloData="Emissão"
        filtros={transpComCte.length > 1 ? (
          <label className="text-xs font-semibold text-slate-600">Transportadora
            <select className="input mt-0.5 h-9 w-auto" value={transp} onChange={(e) => setTransp(e.target.value)}>
              <option value="">Todas</option>{transpComCte.map((id) => <option key={id} value={id}>{nomeTransportadora(porId.get(id))}</option>)}
            </select></label>
        ) : undefined}
        nFiltros={[transp, sentido, soSemFatura, soAtraso].filter(Boolean).length} onLimpar={limpar}
        direita={podeImportar && <MenuImportar onPlanilha={() => setImportar(true)} />} />

      <div className="grid gap-3 lg:grid-cols-5">
        <section className="cartao p-4 lg:col-span-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-600">Frete pago pela MF</h2>
            <span className="rounded-full border border-slate-200 px-2 py-0.5 text-2xs font-semibold text-slate-600">{rotuloPeriodo}</span>
          </div>
          <p className="num mt-1 text-2xl font-bold text-fg">{brl(resumo.fretePagoMF)}</p>
          <p className="text-xs text-slate-500">{resumo.qtdPagoMF} de {resumo.qtd} CT-e (nos outros, o fornecedor ou o cliente pagou)</p>
          <BarraSentidos resumo={resumo} sentido={sentido} onSentido={setSentido} />
          {resumo.qtdPagosAntes > 0 && <p className="mt-2 text-xs text-slate-500">{resumo.qtdPagosAntes} CT-e de antes de outubro de 2026 ({brl(resumo.pagosAntes)}) já foram pagos pelas contas antigas e não entram em fatura.</p>}
        </section>

        <section className="cartao p-4 lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-slate-600">O que fazer</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            <li className="flex flex-wrap items-center gap-2 py-2">
              <Receipt size={16} className="shrink-0 text-slate-500" aria-hidden />
              <span className="min-w-0 flex-1">{semFaturaTotal.qtd ? <><b>{semFaturaTotal.qtd} CT-e sem fatura</b> · {brl(semFaturaTotal.valor)}</> : "Nenhum CT-e esperando fatura"}</span>
              {podeFaturar && <Button tamanho="mini" onClick={() => setFatura({ ids: marcadosLista.map((c) => c.id) })} disabled={!semFaturaTotal.qtd}>Montar fatura</Button>}
            </li>
            <li className="flex flex-wrap items-center gap-2 py-2">
              <FileSpreadsheet size={16} className="shrink-0 text-slate-500" aria-hidden />
              <span className="min-w-0 flex-1">{pendentesXml ? <><b>{pendentesXml} CT-e esperando o XML</b> da SEFAZ (chegam sozinhos; os antigos, envie)</> : "Nenhum CT-e esperando o XML"}</span>
            </li>
            <li className="flex flex-wrap items-center gap-2 py-2">
              <Clock size={16} className="shrink-0 text-slate-500" aria-hidden />
              <span className="min-w-0 flex-1">{atrasados ? <><b>{atrasados} {atrasados === 1 ? "entrega atrasada" : "entregas atrasadas"}</b> · {resumo.noPrazo} de {resumo.entregues} no prazo</> : `Entregas: ${resumo.noPrazo} de ${resumo.entregues} no prazo`}</span>
              {atrasados > 0 && <button type="button" className="link-acao" onClick={() => setSoAtraso(!soAtraso)}>{soAtraso ? "Mostrar todos" : "Ver"}</button>}
            </li>
          </ul>
        </section>
      </div>
      {resumo.cancelados > 0 && <p className="text-xs text-slate-600">{resumo.cancelados} CT-e {resumo.cancelados === 1 ? "cancelado fica" : "cancelados ficam"} na lista, mas fora das contas e das faturas.</p>}

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
              className={chip(sentido === s, "border-transparent bg-modulo-escuro text-white")}>
              {s ? SENTIDOS[s].rotulo : "Todos"}
            </button>
          ))}
          {soSemFatura && <button type="button" onClick={() => setSoSemFatura(false)} className={chip(true, "border-amber-200 bg-amber-100 text-amber-800")}>sem fatura <X size={12} /></button>}
          {soAtraso && <button type="button" onClick={() => setSoAtraso(false)} className={chip(true, "border-amber-200 bg-amber-100 text-amber-800")}>com atraso <X size={12} /></button>}
          {podeFaturar && marcadosLista.length > 0 && <span className="ml-auto flex items-center gap-2 text-sm font-semibold">{marcadosLista.length} marcados · {brl(totalMarcado)}
            <Button tamanho="mini" onClick={() => setFatura({ ids: marcadosLista.map((c) => c.id) })}><Receipt size={13} /> Montar fatura</Button></span>}
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
                  {c.chave && <span title="CT-e conferido na SEFAZ (chave de acesso)" className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 text-2xs font-bold text-emerald-800"><BadgeCheck size={11} aria-hidden />SEFAZ</span>}
                  <span className="block text-xs text-slate-500">{dataBR(c.emissao)}</span><SeloSentido s={c.sentido} />
                  {!valido(c) && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-2xs font-semibold text-red-800">{c.situacao}</span>}</td>
                <td className="td min-w-56 text-sm"><span className="block">{c.remetente_nome ?? "—"}</span>
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
