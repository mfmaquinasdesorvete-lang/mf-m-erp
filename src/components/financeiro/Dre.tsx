// Financeiro → DRE: lucro do mês e dos meses anteriores pelo plano de contas, por competência ou por caixa,
// com filtro por centro de custo, detalhe por categoria e exportação para Excel. Entram também os extratos dos
// bancos que não estão lançados como conta (dreExtrato.ts), com a opção de ver só as contas.
// O gráfico escolhe o mês em foco. Celular: só esse mês, em linhas com % da receita e comparação com o mês
// anterior. Computador: a tabela com todos os meses, o mês em foco destacado.
// Receita pelas notas (como no Tiny): receita, impostos destacados, devoluções e CMV das NF-e (dreNotas.ts).
// Unidade: consolidado, SC ou SP, e o quadro lado a lado. Fixa × variável: margem de contribuição e ponto de equilíbrio.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, FileDown, Scale } from "lucide-react";
import { Button, Card, Tabs } from "@/components/ui";
import { brl, hoje, pl } from "@/lib/format";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { soDigitos, type Parte } from "@/lib/partesRelacionadas";
import { extratoParaDre, type ContaBancariaDre, type LancExtratoDre, type ResultadoExtratoDre } from "@/lib/dreExtrato";
import { baixarPlanilha } from "@/lib/exportar";
import { notifyError } from "@/lib/notify";
import { dre, mesesAte, rotuloCategoria, type LancDre, type LinhaDre, type Regime } from "@/lib/dre";
import { contasSemNotas, contribuicao, daUnidade, jurosDescontosDasBaixas, mesesAnoAnterior, notasParaDre, taxasPorCanal, vendasPorMes,
  type Contribuicao, type CustoAnterior, type DevolucaoRecebida, type NfseDre, type NotaDre } from "@/lib/dreNotas";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Produto } from "@/lib/types";
import { useCategorias, useCentros } from "./CategoriaRateio";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const rotuloMes = (am: string) => `${MESES[Number(am.slice(5)) - 1]}/${am.slice(2, 4)}`;
const rotuloMesLongo = (am: string) => `${MESES_LONGOS[Number(am.slice(5)) - 1]} de ${am.slice(0, 4)}`;
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const valor = (v: number) => (v < 0 ? `(${brl(-v)})` : brl(v));
const corLucro = (v: number) => (v >= 0 ? "text-emerald-700" : "text-red-700");

const SELECT_NOTAS_DRE = "id, numero, created_at, status, ambiente, pedido_id, unidade_id, tipo_operacao, finalidade, excluida_em, transferencia_id, valor_total, payload";
type ResultadoNotas = ReturnType<typeof notasParaDre>;

/** DRE com os extratos dos bancos e as notas: carrega só quando a aba abre. Recebe as contas de todas as unidades. */
export function DreComExtratos({ lancamentos }: { lancamentos: LancDre[] }) {
  const { data: extrato = [], isLoading } = useRows<LancExtratoDre>("extrato_lancamentos", {
    select: "id, conta_bancaria_id, data, valor, descricao, identificador, status, conta_receber_id, conta_pagar_id, par_transferencia_id", order: "data", ascending: true, key: ["dre"],
  });
  const { data: bancos = [] } = useRows<ContaBancariaDre>("contas_bancarias", { select: "id, ativo, unidade_id, nome", order: "nome", ascending: true, key: ["dre"] });
  const { data: funcionarios = [] } = useRows<{ nome: string }>("funcionarios", { select: "id, nome, apelido, ativo", order: "nome", ascending: true, key: ["nomes"] });
  const { data: partes = [] } = useRows<Parte>("partes_relacionadas", { order: "nome", ascending: true });
  const { data: unidades = [] } = useRows<{ razao_social: string | null; cnpj: string | null }>("unidades", { select: "id, razao_social, cnpj", order: "nome", ascending: true, key: ["partes"] });
  const r = useMemo<ResultadoExtratoDre>(() => extratoParaDre(extrato, bancos, lancamentos, {
    funcionarios, partes,
    propria: { nomes: [...new Set(unidades.map((u) => u.razao_social ?? "").filter(Boolean))], documentos: unidades.map((u) => soDigitos(u.cnpj)).filter(Boolean) },
  }), [extrato, bancos, lancamentos, funcionarios, partes, unidades]);
  const { data: notas = [], isLoading: carregandoNotas } = useRows<NotaDre>("notas_fiscais", { select: SELECT_NOTAS_DRE, order: "created_at", ascending: true, key: ["dre"] });
  const { data: devolucoes = [] } = useRows<DevolucaoRecebida>("nfe_recebidas", {
    select: "id, data_emissao, valor_total, unidade_id, finalidade, situacao, excluida_em, icms_credito, itens", order: "data_emissao", ascending: true, key: ["dre-devolucoes"],
    filtro: (q) => q.eq("finalidade", "devolucao"),
  });
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  // CMV pelo custo do dia da venda: as mudanças de custo do cadastro (auditoria)
  const { data: custosAnteriores = [] } = useQuery({
    queryKey: ["produtos", "custos-anteriores"],
    queryFn: async () => { const { data, error } = await supabase.rpc("custos_anteriores_produtos"); if (error) throw error; return (data ?? []) as CustoAnterior[]; },
  });
  // ISS das NFS-e (emitidas pelo ERP e as importadas)
  const { data: nfseErp = [] } = useRows<{ status: string; ambiente: string | null; data_emissao: string | null; autorizada_em: string | null; valor_iss: number | null; iss_retido: boolean | null; unidade_id: string | null }>("nfse", {
    select: "status, ambiente, data_emissao, autorizada_em, valor_iss, iss_retido, unidade_id", order: "created_at", ascending: true, key: ["dre"],
  });
  const { data: nfseImp = [] } = useRows<{ tipo: string; situacao: string | null; data_emissao: string | null; valor_iss: number | null; iss_retido: boolean | null; unidade_id: string | null }>("nfse_importadas", {
    select: "tipo, situacao, data_emissao, valor_iss, iss_retido, unidade_id", order: "data_emissao", ascending: true, key: ["dre"], filtro: (q) => q.eq("tipo", "emitida"),
  });
  const nfse = useMemo<NfseDre[]>(() => [
    ...nfseErp.map((x) => ({ data: x.data_emissao ?? x.autorizada_em, valor_iss: x.valor_iss, iss_retido: x.iss_retido, unidade_id: x.unidade_id, valida: x.status === "autorizada" && x.ambiente !== "homologacao" })),
    ...nfseImp.map((x) => ({ data: x.data_emissao, valor_iss: x.valor_iss, iss_retido: x.iss_retido, unidade_id: x.unidade_id, valida: !/cancel/i.test(x.situacao ?? "") })),
  ], [nfseErp, nfseImp]);
  const doNotas = useMemo(() => notasParaDre(notas, devolucoes, produtos, { custosAnteriores, nfse }), [notas, devolucoes, produtos, custosAnteriores, nfse]);
  return <Dre lancamentos={lancamentos} extrato={r.lancamentos} fora={r.fora} carregando={isLoading} notas={doNotas} carregandoNotas={carregandoNotas} />;
}

export function Dre({ lancamentos, extrato = [], fora, carregando, notas, carregandoNotas }: {
  lancamentos: LancDre[]; extrato?: LancDre[]; fora?: ResultadoExtratoDre["fora"]; carregando?: boolean; notas?: ResultadoNotas; carregandoNotas?: boolean;
}) {
  const dia = hoje();
  const { unidades, atual: unidadeAtual } = useUnidade();
  const [fonte, setFonte] = useState<"notas" | "contas">(notas ? "notas" : "contas");
  const [unidade, setUnidade] = useState<string>(unidadeAtual ?? "");
  const [comExtrato, setComExtrato] = useState<"sim" | "nao">("sim");
  const [regime, setRegime] = useState<Regime>("competencia");
  const [periodo, setPeriodo] = useState<"6" | "12" | "ano">("6");
  const [centro, setCentro] = useState("");
  const [foco, setFoco] = useState<string | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const { data: cats = [] } = useCategorias();
  const { data: centros = [] } = useCentros();
  const meses = periodo === "ano" ? mesesAte(dia, Number(dia.slice(5, 7))) : mesesAte(dia, Number(periodo));
  const usaNotas = fonte === "notas" && regime === "competencia" && !!notas;
  // receita pelas notas: das contas sai o que as notas já contam (vendas, impostos sobre a venda, compras de mercadoria)
  // competência: juros e descontos das baixas (diferença entre o pago e o valor da conta) entram no resultado financeiro
  const contasBase = useMemo(() => {
    const contas = comExtrato === "sim" ? [...lancamentos, ...extrato] : lancamentos;
    return regime === "competencia" ? [...contas, ...jurosDescontosDasBaixas(lancamentos)] : contas;
  }, [lancamentos, extrato, comExtrato, regime]);
  const base = useMemo(() => (usaNotas ? [...contasSemNotas(contasBase, cats), ...notas!.lancamentos] : contasBase), [contasBase, usaNotas, notas, cats]);
  const todos = useMemo(() => daUnidade(base, unidade || null), [base, unidade]);
  const d = useMemo(() => dre(todos, cats, meses, regime, centro || null), [todos, cats, meses.join(), regime, centro]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = useMemo(() => contribuicao(d.linhas, cats, meses.length), [d, cats, meses.length]);
  // SC × SP × consolidado no mês em foco
  const porUnidade = useMemo(() => (unidades.length < 2 ? [] : [...unidades.map((u) => ({ id: u.id, rotulo: u.codigo || u.nome })), { id: "", rotulo: "Consolidado" }].map((u) => {
    const du = dre(daUnidade(base, u.id || null), cats, meses, regime, centro || null);
    return { ...u, d: du, c: contribuicao(du.linhas, cats, meses.length) };
  })), [base, unidades, cats, meses.join(), regime, centro]); // eslint-disable-line react-hooks/exhaustive-deps
  const semUnidade = useMemo(() => base.filter((l) => !l.unidade_id && l.status !== "cancelado").length, [base]);
  // nº de notas e ticket médio; o mesmo período um ano antes; o caixa do mesmo período; as taxas por canal
  const ind = useMemo(() => (usaNotas ? vendasPorMes(notas!.vendas, meses, unidade || null) : null), [usaNotas, notas, meses.join(), unidade]); // eslint-disable-line react-hooks/exhaustive-deps
  const dAno = useMemo(() => dre(todos, cats, mesesAnoAnterior(meses), regime, centro || null), [todos, cats, meses.join(), regime, centro]); // eslint-disable-line react-hooks/exhaustive-deps
  const dCaixa = useMemo(() => dre(daUnidade(comExtrato === "sim" ? [...lancamentos, ...extrato] : lancamentos, unidade || null), cats, meses, "caixa", centro || null),
    [lancamentos, extrato, comExtrato, unidade, cats, meses.join(), centro]); // eslint-disable-line react-hooks/exhaustive-deps
  const taxas = useMemo(() => taxasPorCanal(daUnidade(contasBase, unidade || null), meses), [contasBase, unidade, meses.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const i = foco && meses.includes(foco) ? meses.indexOf(foco) : meses.length - 1;
  const mes = meses[i];
  const atual = d.resumo(i);
  const anterior = i > 0 ? d.resumo(i - 1) : null;
  const linha = (chave: string) => d.linhas.find((l) => l.chave === chave)!;
  const receitas = linha("receita").valores;
  const lucros = linha("liquido").valores;
  const temDados = meses.map((_, k) => d.linhas.some((l) => l.valores[k]));
  const nomeCentro = centro ? centros.find((c) => c.id === centro)?.nome ?? "sem centro de custo" : "todos os centros de custo";
  const caixa = useRef<HTMLDivElement>(null);
  // computador: a tabela é mais larga que a tela; rola até o mês em foco (o último mostra também o total)
  useEffect(() => {
    const c = caixa.current, th = c?.querySelector<HTMLElement>(`th[data-mes="${mes}"]`);
    if (!c || !th) return;
    if (i === meses.length - 1) { c.scrollLeft = c.scrollWidth; return; }
    const r = th.getBoundingClientRect(), cr = c.getBoundingClientRect();
    if (r.right > cr.right) c.scrollLeft += r.right - cr.right + 16;
    else if (r.left < cr.left + 208) c.scrollLeft -= cr.left + 208 - r.left;
  }, [mes, meses.length, i]);
  const alternar = (k: string) => setAbertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  function exportar() {
    const linhas = d.linhas.flatMap((l) => [
      { Linha: l.rotulo, ...Object.fromEntries(meses.map((m, k) => [rotuloMes(m), l.valores[k]])), Total: l.total },
      ...l.detalhes.map((x) => ({ Linha: `   ${rotuloCategoria(x.categoria)}`, ...Object.fromEntries(meses.map((m, k) => [rotuloMes(m), x.valores[k]])), Total: x.total })),
    ]);
    linhas.push({ Linha: "Margem de contribuição", ...Object.fromEntries(meses.map((m, k) => [rotuloMes(m), c.mc[k]])), Total: c.total.mc } as any);
    linhas.push({ Linha: "Despesas fixas", ...Object.fromEntries(meses.map((m, k) => [rotuloMes(m), c.fixas[k]])), Total: c.total.fixas } as any);
    linhas.push({ Linha: "Ponto de equilíbrio (receita)", ...Object.fromEntries(meses.map((m, k) => [rotuloMes(m), c.pe[k] ?? ""])), Total: c.total.pe ?? "" } as any);
    linhas.push({ Linha: "Margem bruta (% da receita líquida)", ...Object.fromEntries(meses.map((m, k) => [rotuloMes(m), d.margemBruta[k] === null ? "" : Math.round(d.margemBruta[k]! * 1000) / 10])), Total: d.margemBrutaTotal === null ? "" : Math.round(d.margemBrutaTotal * 1000) / 10 } as any);
    if (ind) {
      linhas.push({ Linha: "Notas de venda (nº)", ...Object.fromEntries(meses.map((m, k) => [rotuloMes(m), ind.nNotas[k]])), Total: ind.nNotas.reduce((a, b) => a + b, 0) } as any);
      linhas.push({ Linha: "Ticket médio", ...Object.fromEntries(meses.map((m, k) => [rotuloMes(m), ind.ticket[k] ?? ""])), Total: "" } as any);
    }
    linhas.push({ Linha: "Margem líquida", ...Object.fromEntries(meses.map((m, k) => [rotuloMes(m), d.margem[k] === null ? "" : Math.round(d.margem[k]! * 1000) / 10])), Total: d.margemTotal === null ? "" : Math.round(d.margemTotal * 1000) / 10 } as any);
    const nomeUn = unidade ? (unidades.find((u) => u.id === unidade)?.codigo ?? "unidade") : "consolidado";
    baixarPlanilha(`dre-${usaNotas ? "notas" : "contas"}-${nomeUn}-${regime}-${meses[0]}-a-${meses[meses.length - 1]}`, [{ nome: "DRE", linhas }]).catch(notifyError);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-2">
        <Tabs value={regime} onChange={setRegime} options={[{ value: "competencia", label: "Competência" }, { value: "caixa", label: "Caixa" }]} />
        <Tabs value={periodo} onChange={setPeriodo} options={[{ value: "6", label: "6 meses" }, { value: "12", label: "12 meses" }, { value: "ano", label: `Ano ${dia.slice(0, 4)}` }]} />
        <Tabs value={comExtrato} onChange={setComExtrato} options={[{ value: "sim", label: "Contas + extratos" }, { value: "nao", label: "Só contas lançadas" }]} />
        {notas && <Tabs value={fonte} onChange={setFonte} options={[{ value: "notas", label: "Receita pelas notas" }, { value: "contas", label: "Receita pelas contas" }]} />}
        {unidades.length > 1 && <Tabs value={unidade} onChange={setUnidade} options={[{ value: "", label: "Consolidado" }, ...unidades.map((u) => ({ value: u.id, label: u.codigo || u.nome }))]} />}
        {/* sem centro de custo cadastrado o filtro não tem o que mostrar */}
        {centros.length > 0 && (
          <select className="input mb-4 w-full sm:w-auto" value={centro} onChange={(e) => setCentro(e.target.value)} aria-label="Centro de custo">
            <option value="">Todos os centros de custo</option>
            {centros.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            <option value="sem">Sem centro de custo</option>
          </select>
        )}
        <Button variant="secondary" className="mb-4 ml-auto" onClick={exportar}><FileDown size={16} aria-hidden /> Exportar</Button>
      </div>

      {fonte === "notas" && notas && (
        <p className="-mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">
          {regime === "caixa" ? "No regime de caixa vale o dinheiro que entrou e saiu: a receita vem das contas recebidas. A receita pelas notas é por competência."
            : carregandoNotas ? "Carregando as notas…"
            : <>Receita, impostos destacados, devoluções e custo dos produtos vendidos saem de {notas.notasVenda} {pl(notas.notasVenda, "NF-e de venda", "NF-e de venda")} (sem transferências entre SC e SP); despesas, das contas{comExtrato === "sim" ? " e dos extratos" : ""}.
              {notas.semCusto > 0 && <> {notas.semCusto} {pl(notas.semCusto, "item vendido está", "itens vendidos estão")} sem custo no cadastro: o CMV fica menor que o real.</>} Gerencial: a apuração oficial é do contador.</>}
        </p>
      )}

      {/* grid-cols-1 e min-w-0: o gráfico de 12 meses rola dentro do cartão, sem alargar a tela do celular */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="min-w-0 p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
            <b className="text-base first-letter:uppercase">{rotuloMesLongo(mes)}</b>
            <span className="text-xs text-slate-500">{nomeCentro}</span>
          </div>
          <dl className="num space-y-1 text-sm">
            <div className="flex justify-between gap-3"><dt className="min-w-0">Receita bruta</dt><dd className="whitespace-nowrap font-semibold">{brl(atual.receita)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="min-w-0">(−) Custos e impostos</dt><dd className="whitespace-nowrap font-semibold text-red-700">{brl(-atual.custos || 0)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="min-w-0">(−) Despesas</dt><dd className="whitespace-nowrap font-semibold text-red-700">{brl(-atual.despesas || 0)}</dd></div>
            <div className="flex justify-between gap-3 border-t border-slate-200 pt-1.5 text-base"><dt className="min-w-0 font-bold">(=) Lucro líquido</dt>
              <dd className={`whitespace-nowrap font-bold ${corLucro(atual.lucro)}`}>{brl(atual.lucro)}</dd></div>
          </dl>
          {atual.margem !== null && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${atual.margem >= 0 ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, Math.abs(atual.margem) * 100)}%` }} /></div>
              <span className={`text-xs font-semibold ${corLucro(atual.margem)}`}>margem {pct(atual.margem)}</span>
            </div>
          )}
          {anterior && <Comparacao agora={atual.lucro} antes={anterior.lucro} mes={meses[i - 1]} />}
          <ComparacaoAno receita={atual.receita} lucro={atual.lucro} antes={dAno.resumo(i)} mes={mesesAnoAnterior([mes])[0]} />
          {ind && ind.nNotas[i] > 0 && <p className="mt-1 text-xs text-slate-600">{ind.nNotas[i]} {pl(ind.nNotas[i], "NF-e de venda", "NF-e de venda")} · ticket médio <b>{brl(ind.ticket[i] ?? 0)}</b>{d.margemBruta[i] !== null && <> · margem bruta <b>{pct(d.margemBruta[i])}</b></>}</p>}
        </Card>

        <Card className="min-w-0 p-4 lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <b>Mês a mês</b>
            <span className="flex items-center gap-3 text-xs text-slate-500" aria-hidden>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-sky-400" /> receita</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> lucro</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> prejuízo</span>
            </span>
          </div>
          <Grafico meses={meses} receitas={receitas} lucros={lucros} temDados={temDados} foco={i} onFoco={setFoco} />
          <p className="mt-1 text-xs text-slate-500">Toque num mês para ver o DRE dele.</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <QuadroContribuicao c={c} i={i} mes={mes} />
        <QuadroCaixa competencia={d} caixa={dCaixa} i={i} mes={mes} />
        <QuadroTaxas taxas={taxas} i={i} mes={mes} receita={receitas[i]} />
        {porUnidade.length > 0 && <QuadroUnidades lista={porUnidade} i={i} mes={mes} semUnidade={semUnidade} />}
      </div>

      <details className="rounded-xl border border-slate-200 bg-surface px-4 py-2.5 text-sm">
        <summary className="cursor-pointer font-semibold">Como ler o DRE</summary>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-slate-600">
          <li>{regime === "competencia" ? "Competência: cada conta entra no mês do vencimento (contas fixas: no mês de referência), paga ou não."
            : "Caixa: cada conta entra no mês em que o dinheiro entrou ou saiu, pelo valor pago."}</li>
          <li>Cada conta entra na linha da categoria dela (Financeiro → <b>Plano de contas</b>). Categoria sem cadastro conta como despesa operacional.</li>
          <li>Toque numa linha com seta para ver as categorias que a compõem. Valores entre parênteses são saídas.</li>
          <li>Investimentos e distribuição de lucros aparecem embaixo, fora do resultado; transferências entre contas não entram.</li>
          {comExtrato === "sim" ? (
            <li>
              <b>Extratos dos bancos:</b> entra o que passou nas contas e não está lançado como conta a pagar ou a receber, no dia do extrato
              (Pix e cartão recebidos como receita; funcionários, combustível, impostos, tarifas e outros pagamentos pelo tipo).
              {fora && <> Ficaram de fora {fora.transferencias} {pl(fora.transferencias, "transferência", "transferências")} entre as contas da MF,
                {" "}{fora.partes} {pl(fora.partes, "movimento", "movimentos")} com sócios e empresas ligadas, {fora.ja_em_conta} {pl(fora.ja_em_conta, "linha que já entra", "linhas que já entram")} pela conta paga
                {" "}e {fora.repetidas} {pl(fora.repetidas, "linha repetida", "linhas repetidas")} (mesmo extrato importado duas vezes).</>}
              {" "}Para ver só as contas, toque em <b>Só contas lançadas</b>.
            </li>
          ) : <li>Só as contas lançadas em Contas a pagar e a receber. Os extratos dos bancos ficam de fora.</li>}
          {usaNotas && <li><b>Receita pelas notas:</b> receita bruta = produtos dos itens com CFOP de venda − desconto + IPI, no dia da emissão; impostos destacados (ICMS, IPI, PIS, COFINS, DIFAL e FCP) e devoluções de venda (NF-e de entrada de devolução e as que o cliente emitiu) nas deduções; CMV = quantidade × custo do cadastro. Saem das contas as vendas de produtos, os recebimentos soltos do extrato, os impostos (guias) e as compras de mercadoria, que as notas já contam; a receita de serviços (assistência técnica) continua vindo das contas a receber. Impostos sobre o lucro (IRPJ e CSLL) não entram aqui — confirmar com o contador.</li>}
          {usaNotas && <li><b>Devoluções:</b> a devolução de venda entra nas deduções e o que ela devolve volta: os impostos da nota de devolução (estorno de impostos) e o custo do que voltou ao estoque (estorno de CMV). O CMV usa o custo do cadastro no dia da venda; o ISS das NFS-e entra nas deduções (o retido pelo cliente, não).</li>}
          {regime === "competencia" && <li><b>Juros e descontos:</b> a diferença entre o valor pago e o valor da conta (pago a mais, pago a menos, recebido a mais ou a menos) entra no resultado financeiro, no mês do pagamento.</li>}
          <li><b>Tributos sobre o lucro:</b> IRPJ e CSLL ficam numa linha própria, depois do resultado antes dos tributos (categorias IRPJ e CSLL do Plano de contas). A apuração oficial do Lucro Real é do contador.</li>
          <li><b>Margem de contribuição</b> = receita − impostos, custos e despesas variáveis. <b>Ponto de equilíbrio</b> = despesas fixas ÷ margem de contribuição %: a receita do mês que paga tudo sem lucro nem prejuízo. Fixa ou variável vem do Plano de contas (* = sugestão do ERP).</li>
          {unidades.length > 1 && <li><b>Unidade:</b> SC e SP mostram só o que é de cada uma; o consolidado soma as duas sem as transferências entre elas (notas de transferência e transferências entre as contas da empresa ficam de fora).{semUnidade > 0 && ` ${semUnidade} ${pl(semUnidade, "lançamento está", "lançamentos estão")} sem unidade e aparecem só no consolidado.`}</li>}
          {centros.length === 0 && <li>Centros de custo: nenhum cadastrado. Cadastre em <b>Plano de contas</b> e divida as contas entre eles para filtrar o DRE por centro.</li>}
          {centro && comExtrato === "sim" && <li>Filtro por centro de custo: os lançamentos dos extratos não têm centro e aparecem só em "Sem centro de custo".</li>}
        </ul>
      </details>

      {/* celular: um mês por vez */}
      <Card className="md:hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-2 py-2">
          <Button variant="ghost" aria-label="Mês anterior" disabled={i === 0} onClick={() => setFoco(meses[i - 1])}><ChevronLeft size={18} aria-hidden /></Button>
          <h3 className="flex-1 text-center font-bold first-letter:uppercase" aria-live="polite">{rotuloMesLongo(mes)}</h3>
          <Button variant="ghost" aria-label="Próximo mês" disabled={i === meses.length - 1} onClick={() => setFoco(meses[i + 1])}><ChevronRight size={18} aria-hidden /></Button>
        </div>
        {!temDados[i] ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            {carregando ? "Carregando os extratos…" : <>Nenhuma conta {regime === "caixa" ? "paga ou recebida" : "com vencimento"}{comExtrato === "sim" ? " nem lançamento de extrato" : ""} em {rotuloMesLongo(mes)}.</>}
            {temDados.some(Boolean) && " Escolha no gráfico um mês com barras."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {d.linhas.map((l) => <LinhaMes key={l.chave} l={l} i={i} receita={receitas[i]} aberto={abertos.has(l.chave)} alternar={alternar} />)}
            <li className="flex items-center justify-between px-4 py-2.5 text-sm text-slate-600">
              <span className="font-semibold">Margem líquida</span><span className="num font-semibold">{pct(d.margem[i])}</span>
            </li>
            <li className="flex items-center justify-between px-4 py-2.5 text-sm text-slate-600">
              <span className="font-semibold">Margem bruta</span><span className="num font-semibold">{pct(d.margemBruta[i])}</span>
            </li>
            <li className="flex items-center justify-between px-4 py-2.5 text-sm text-slate-600">
              <span className="font-semibold">Margem de contribuição</span><span className="num font-semibold">{valor(c.mc[i])} ({pct(c.mcPct[i])})</span>
            </li>
          </ul>
        )}
      </Card>

      {/* computador: todos os meses */}
      <Card className="hidden md:block">
        <div ref={caixa} className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50/80">
            <tr>
              <th className="th sticky left-0 z-10 min-w-[13rem] bg-slate-50">Linha</th>
              {meses.map((m, k) => (
                <th key={m} data-mes={m} className={`th text-right ${k === i ? "bg-modulo/15" : ""}`}>
                  <button type="button" className="uppercase hover:underline" aria-pressed={k === i} onClick={() => setFoco(m)}>{rotuloMes(m)}</button>
                </th>
              ))}
              <th className="th text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {d.linhas.map((l) => {
              if (l.tipo === "info" && !l.valores.some(Boolean)) return null;
              const aberto = abertos.has(l.chave);
              const forte = l.tipo === "resultado";
              const cor = (v: number) => (l.chave === "liquido" ? corLucro(v) : v < 0 ? "text-slate-700" : "");
              return (
                <Fragment key={l.chave}>
                  <tr className={`${forte ? "bg-slate-50/70 font-bold" : ""} ${l.chave === "liquido" ? "text-base" : ""} ${l.tipo === "info" ? "text-slate-500" : ""}`}>
                    <td className={`sticky left-0 z-10 whitespace-nowrap px-4 py-2 ${forte ? "bg-slate-50" : "bg-surface"}`}>
                      {l.detalhes.length ? (
                        <button type="button" onClick={() => alternar(l.chave)} className="inline-flex items-center gap-1 text-left font-semibold hover:text-modulo-texto" aria-expanded={aberto}>
                          {aberto ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />} {l.rotulo}
                        </button>
                      ) : <span className={forte ? "" : "pl-5"}>{l.rotulo}</span>}
                    </td>
                    {l.valores.map((v, k) => <td key={k} className={`num whitespace-nowrap px-4 py-2 text-right ${cor(v)} ${k === i ? "bg-modulo/5" : ""}`}>{v ? valor(v) : "—"}</td>)}
                    <td className={`num whitespace-nowrap px-4 py-2 text-right font-semibold ${l.chave === "liquido" ? corLucro(l.total) : ""}`}>{l.total ? valor(l.total) : "—"}</td>
                  </tr>
                  {aberto && l.detalhes.map((x) => (
                    <tr key={l.chave + x.categoria} className="text-slate-600">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-surface py-1.5 pl-10 pr-4">{rotuloCategoria(x.categoria)}</td>
                      {x.valores.map((v, k) => <td key={k} className={`num whitespace-nowrap px-4 py-1.5 text-right ${k === i ? "bg-modulo/5" : ""}`}>{v ? valor(v) : "—"}</td>)}
                      <td className="num whitespace-nowrap px-4 py-1.5 text-right">{valor(x.total)}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            <tr className="text-slate-600">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-4 py-2 font-semibold">Margem líquida</td>
              {d.margem.map((m, k) => <td key={k} className={`num px-4 py-2 text-right ${k === i ? "bg-modulo/5" : ""}`}>{pct(m)}</td>)}
              <td className="num px-4 py-2 text-right font-semibold">{pct(d.margemTotal)}</td>
            </tr>
            <tr className="text-slate-600">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-4 py-2 font-semibold">Margem bruta</td>
              {d.margemBruta.map((m, k) => <td key={k} className={`num px-4 py-2 text-right ${k === i ? "bg-modulo/5" : ""}`}>{pct(m)}</td>)}
              <td className="num px-4 py-2 text-right font-semibold">{pct(d.margemBrutaTotal)}</td>
            </tr>
            {ind && (
              <tr className="text-slate-600">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-4 py-2 font-semibold">Notas de venda · ticket médio</td>
                {ind.nNotas.map((q, k) => <td key={k} className={`num whitespace-nowrap px-4 py-2 text-right ${k === i ? "bg-modulo/5" : ""}`}>{q ? <>{q} · {brl(ind.ticket[k] ?? 0)}</> : "—"}</td>)}
                <td className="num whitespace-nowrap px-4 py-2 text-right font-semibold">{ind.nNotas.reduce((a, b) => a + b, 0)}</td>
              </tr>
            )}
            <tr className="text-slate-600">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-4 py-2 font-semibold">Margem de contribuição</td>
              {c.mc.map((v, k) => <td key={k} className={`num whitespace-nowrap px-4 py-2 text-right ${k === i ? "bg-modulo/5" : ""}`}>{c.receita[k] ? <>{valor(v)} <span className="text-xs">({pct(c.mcPct[k])})</span></> : "—"}</td>)}
              <td className="num whitespace-nowrap px-4 py-2 text-right font-semibold">{valor(c.total.mc)} <span className="text-xs">({pct(c.total.mcPct)})</span></td>
            </tr>
            <tr className="text-slate-600">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-4 py-2 font-semibold">Ponto de equilíbrio</td>
              {c.pe.map((v, k) => <td key={k} className={`num whitespace-nowrap px-4 py-2 text-right ${k === i ? "bg-modulo/5" : ""} ${v !== null && c.receita[k] < v ? "text-red-700" : ""}`}>{v !== null ? brl(v) : "—"}</td>)}
              <td className="num whitespace-nowrap px-4 py-2 text-right font-semibold">{c.total.pe !== null ? brl(c.total.pe) : "—"}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}

/** Barras de receita e lucro por mês; cada mês é um botão que põe o DRE dele em foco. */
function Grafico({ meses, receitas, lucros, temDados, foco, onFoco }: {
  meses: string[]; receitas: number[]; lucros: number[]; temDados: boolean[]; foco: number; onFoco: (m: string) => void;
}) {
  const max = Math.max(1, ...receitas.map(Math.abs), ...lucros.map(Math.abs));
  const altura = (v: number) => (v ? `${Math.max(4, (Math.abs(v) / max) * 100)}%` : "0");
  return (
    <div role="group" aria-label="Escolha o mês" className="-mx-1 flex items-end gap-1 overflow-x-auto px-1 pb-1">
      {meses.map((m, k) => (
        <button key={m} type="button" aria-pressed={k === foco} onClick={() => onFoco(m)}
          aria-label={`${rotuloMesLongo(m)}: ${temDados[k] ? `receita ${brl(receitas[k])}, ${lucros[k] >= 0 ? "lucro" : "prejuízo"} ${brl(Math.abs(lucros[k]))}` : "sem contas"}`}
          className={`flex min-w-[2.75rem] flex-1 flex-col items-center gap-1 rounded-lg px-1 pb-1 pt-2 transition ${k === foco ? "bg-modulo/15 ring-2 ring-modulo" : "hover:bg-slate-100"}`}>
          <span className="flex h-20 items-end gap-0.5" aria-hidden>
            {temDados[k] ? (
              <>
                <span className="w-2.5 rounded-t bg-sky-400" style={{ height: altura(receitas[k]) }} />
                <span className={`w-2.5 rounded-t ${lucros[k] >= 0 ? "bg-emerald-500" : "bg-red-500"}`} style={{ height: altura(lucros[k]) }} />
              </>
            ) : <span className="h-0.5 w-5 rounded bg-slate-200" />}
          </span>
          <span className={`text-[11px] font-semibold ${k === foco ? "text-modulo-texto" : "text-slate-500"}`}>{rotuloMes(m)}</span>
        </button>
      ))}
    </div>
  );
}

/** Uma linha do DRE no celular: valor do mês, % da receita e, nas linhas com categorias, o detalhe ao tocar. */
function LinhaMes({ l, i, receita, aberto, alternar }: { l: LinhaDre; i: number; receita: number; aberto: boolean; alternar: (k: string) => void }) {
  const v = l.valores[i];
  if (l.tipo === "info" && !v) return null;
  const forte = l.tipo === "resultado";
  const final = l.chave === "liquido";
  const dets = l.detalhes.filter((x) => x.valores[i]);
  const av = v && receita > 0 && l.chave !== "receita" && l.tipo !== "info" ? Math.abs(v) / receita : null;
  return (
    <li className={`${forte ? "bg-slate-50/70" : ""} ${l.tipo === "info" ? "text-slate-500" : ""}`}>
      <div className={`flex items-center gap-2 px-4 ${final ? "py-3" : "py-2.5"}`}>
        {dets.length ? (
          <button type="button" onClick={() => alternar(l.chave)} aria-expanded={aberto} className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm font-semibold">
            {aberto ? <ChevronDown size={15} className="shrink-0" aria-hidden /> : <ChevronRight size={15} className="shrink-0" aria-hidden />}
            <span>{l.rotulo}</span>
          </button>
        ) : <span className={`min-w-0 flex-1 text-sm ${forte ? "font-bold" : "pl-5"} ${final ? "text-base" : ""}`}>{l.rotulo}</span>}
        <span className="shrink-0 text-right">
          <span className={`num block whitespace-nowrap ${forte ? "font-bold" : "font-semibold"} ${final ? `text-base ${corLucro(v)}` : ""}`}>{v ? valor(v) : "—"}</span>
          {av !== null && <span className="block text-[11px] text-slate-500">{pct(av)} da receita</span>}
        </span>
      </div>
      {aberto && dets.length > 0 && (
        <ul className="pb-2">
          {dets.map((x) => (
            <li key={x.categoria} className="flex justify-between gap-2 py-1 pl-10 pr-4 text-sm text-slate-600">
              <span className="min-w-0">{rotuloCategoria(x.categoria)}</span><span className="num shrink-0">{valor(x.valores[i])}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Comparacao({ agora, antes, mes }: { agora: number; antes: number; mes: string }) {
  const dif = Math.round((agora - antes) * 100) / 100;
  if (!agora && !antes) return null;
  return (
    <p className="mt-2 text-xs text-slate-600">
      {dif === 0 ? "Lucro igual ao" : <>Lucro <b className={corLucro(dif)}>{dif > 0 ? "▲" : "▼"} {brl(Math.abs(dif))}</b> {dif > 0 ? "acima do" : "abaixo do"}</>} mês anterior ({rotuloMes(mes)}: {brl(antes)}).
    </p>
  );
}

/** Fixa × variável no mês em foco: margem de contribuição, despesas fixas, ponto de equilíbrio e margem de segurança. */
function QuadroContribuicao({ c, i, mes }: { c: Contribuicao; i: number; mes: string }) {
  const rec = c.receita[i], pe = c.pe[i], seg = c.seguranca[i];
  const variaveis = c.categorias.filter((x) => x.comportamento === "variavel").slice(0, 5);
  const fixas = c.categorias.filter((x) => x.comportamento === "fixa").slice(0, 5);
  const max = Math.max(rec, pe ?? 0, 1);
  return (
    <Card className="min-w-0 p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold"><Scale size={16} className="text-modulo-texto" aria-hidden /> Margem de contribuição e ponto de equilíbrio</h3>
        <span className="text-xs text-slate-500 first-letter:uppercase">{rotuloMesLongo(mes)}</span>
      </div>
      <dl className="num space-y-1 text-sm">
        <div className="flex justify-between gap-3"><dt className="min-w-0">Receita bruta</dt><dd className="whitespace-nowrap font-semibold">{brl(rec)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="min-w-0">(−) Impostos, custos e despesas variáveis</dt><dd className="whitespace-nowrap font-semibold text-red-700">{brl(-c.variaveis[i] || 0)}</dd></div>
        <div className="flex justify-between gap-3 border-t border-slate-200 pt-1"><dt className="min-w-0 font-bold">(=) Margem de contribuição</dt><dd className="whitespace-nowrap text-right font-bold">{brl(c.mc[i])} <span className="block text-xs font-semibold text-slate-500 sm:inline">{pct(c.mcPct[i])}</span></dd></div>
        <div className="flex justify-between gap-3"><dt className="min-w-0">(−) Despesas fixas</dt><dd className="whitespace-nowrap font-semibold text-red-700">{brl(-c.fixas[i] || 0)}</dd></div>
      </dl>
      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
        {pe === null ? <p className="text-slate-600">{rec ? "A margem de contribuição está zerada ou negativa: nenhuma receita paga as despesas fixas." : "Sem receita no mês."}</p> : (
          <>
            <p><b>Ponto de equilíbrio: {brl(pe)}</b> de receita no mês.</p>
            <p className={`text-xs font-semibold ${seg !== null && seg >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {seg === null ? "" : seg >= 0 ? `Receita ${pct(seg)} acima do ponto de equilíbrio (margem de segurança).` : `Faltaram ${brl(pe - rec)} de receita para empatar.`}
            </p>
            <div className="mt-2 space-y-1" aria-hidden>
              <div className="h-2 rounded-full bg-sky-400" style={{ width: `${(rec / max) * 100}%` }} />
              <div className="h-2 rounded-full bg-amber-400" style={{ width: `${(pe / max) * 100}%` }} />
            </div>
            <p className="mt-1 flex gap-3 text-[11px] text-slate-500"><span className="text-sky-700">▬ receita</span><span className="text-amber-700">▬ ponto de equilíbrio</span></p>
          </>
        )}
      </div>
      {(variaveis.length > 0 || fixas.length > 0) && (
        <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
          {([["Variáveis (no período)", variaveis], ["Fixas (no período)", fixas]] as const).map(([t, l]) => (
            <div key={t}>
              <div className="mb-1 font-semibold text-slate-600">{t}</div>
              <ul className="space-y-0.5">{l.map((x) => (
                <li key={x.categoria} className="flex justify-between gap-2"><span className="min-w-0 truncate">{rotuloCategoria(x.categoria)}{x.sugerido ? "*" : ""}</span><span className="num shrink-0">{brl(x.total)}</span></li>
              ))}</ul>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">* sugestão do ERP. Trocar fixa ou variável em <Link to="/financeiro?aba=plano" className="font-semibold text-brand underline">Plano de contas → Editar</Link>.</p>
    </Card>
  );
}

type PorUnidade = { id: string; rotulo: string; d: ReturnType<typeof dre>; c: Contribuicao };

/** SC × SP × consolidado no mês em foco. */
function QuadroUnidades({ lista, i, mes, semUnidade }: { lista: PorUnidade[]; i: number; mes: string; semUnidade: number }) {
  const linha = (x: PorUnidade, k: string) => x.d.linhas.find((l) => l.chave === k)?.valores[i] ?? 0;
  const linhas: { rotulo: string; v: (x: PorUnidade) => string; lucro?: boolean }[] = [
    { rotulo: "Receita bruta", v: (x) => brl(linha(x, "receita")) },
    { rotulo: "Receita líquida", v: (x) => brl(linha(x, "liquida")) },
    { rotulo: "Lucro bruto", v: (x) => brl(linha(x, "bruto")) },
    { rotulo: "Lucro líquido", v: (x) => brl(linha(x, "liquido")), lucro: true },
    { rotulo: "Margem líquida", v: (x) => pct(x.d.margem[i]) },
    { rotulo: "Margem de contribuição", v: (x) => pct(x.c.mcPct[i]) },
    { rotulo: "Ponto de equilíbrio", v: (x) => (x.c.pe[i] !== null ? brl(x.c.pe[i]!) : "—") },
  ];
  return (
    <Card className="min-w-0 p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">{lista.slice(0, -1).map((x) => x.rotulo).join(" × ")} × consolidado</h3>
        <span className="text-xs text-slate-500 first-letter:uppercase">{rotuloMesLongo(mes)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-xs uppercase text-slate-500"><th className="py-1 text-left font-semibold"><span className="sr-only">Linha</span></th>{lista.map((x) => <th key={x.id || "todas"} className="py-1 pl-3 text-right font-semibold">{x.rotulo}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map((l) => (
              <tr key={l.rotulo} className={l.lucro ? "font-bold" : ""}>
                <td className="whitespace-nowrap py-1.5 pr-3">{l.rotulo}</td>
                {lista.map((x) => <td key={x.id || "todas"} className={`num whitespace-nowrap py-1.5 pl-3 text-right ${l.lucro ? corLucro(linha(x, "liquido")) : ""}`}>{l.v(x)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Consolidado sem as transferências entre as unidades.{semUnidade > 0 && ` ${semUnidade} ${pl(semUnidade, "lançamento sem unidade entra", "lançamentos sem unidade entram")} só no consolidado.`}</p>
    </Card>
  );
}

/** O mesmo mês do ano anterior (sazonalidade do sorvete). */
function ComparacaoAno({ receita, lucro, antes, mes }: { receita: number; lucro: number; antes: { receita: number; lucro: number }; mes: string }) {
  if (!antes.receita && !antes.lucro) return <p className="mt-1 text-xs text-slate-500">Sem lançamentos em {rotuloMes(mes)} para comparar com o ano anterior.</p>;
  const varRec = antes.receita ? (receita - antes.receita) / Math.abs(antes.receita) : null;
  return (
    <p className="mt-1 text-xs text-slate-600">
      Mesmo mês do ano anterior ({rotuloMes(mes)}): receita {brl(antes.receita)}
      {varRec !== null && <b className={varRec >= 0 ? "text-emerald-700" : "text-red-700"}> ({varRec >= 0 ? "▲" : "▼"} {pct(Math.abs(varRec))})</b>}, lucro {brl(antes.lucro)}.
    </p>
  );
}

/** Competência × caixa no mês em foco: o lucro do DRE e o que de fato entrou e saiu. */
function QuadroCaixa({ competencia, caixa, i, mes }: { competencia: ReturnType<typeof dre>; caixa: ReturnType<typeof dre>; i: number; mes: string }) {
  const v = (d: ReturnType<typeof dre>, k: string) => d.linhas.find((l) => l.chave === k)?.valores[i] ?? 0;
  const lucro = v(competencia, "liquido"), gerado = v(caixa, "liquido");
  const linhas: [string, number, number][] = [
    ["Receita / recebido", v(competencia, "receita"), v(caixa, "receita")],
    ["Custos e impostos / pagos", v(competencia, "deducao") + v(competencia, "custo"), v(caixa, "deducao") + v(caixa, "custo")],
    ["Despesas / pagas", v(competencia, "despesas") + v(competencia, "financeiro") + v(competencia, "outros"), v(caixa, "despesas") + v(caixa, "financeiro") + v(caixa, "outros")],
    ["Resultado", lucro, gerado],
  ];
  return (
    <Card className="min-w-0 p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">DRE × caixa</h3>
        <span className="text-xs text-slate-500 first-letter:uppercase">{rotuloMesLongo(mes)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-xs uppercase text-slate-500"><th className="py-1 text-left font-semibold"><span className="sr-only">Linha</span></th><th className="py-1 pl-3 text-right font-semibold">DRE (competência)</th><th className="py-1 pl-3 text-right font-semibold">Caixa</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map(([r, a, b], k) => (
              <tr key={r} className={k === linhas.length - 1 ? "font-bold" : ""}>
                <td className="py-1.5 pr-3">{r}</td>
                <td className={`num whitespace-nowrap py-1.5 pl-3 text-right ${k === linhas.length - 1 ? corLucro(a) : ""}`}>{valor(a)}</td>
                <td className={`num whitespace-nowrap py-1.5 pl-3 text-right ${k === linhas.length - 1 ? corLucro(b) : ""}`}>{valor(b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        {Math.abs(lucro - gerado) < 1 ? "O lucro do mês e o caixa andaram juntos." : lucro > gerado
          ? `O caixa ficou ${brl(lucro - gerado)} abaixo do lucro: vendas a prazo ainda a receber, compras pagas adiantadas ou estoque parado.`
          : `O caixa ficou ${brl(gerado - lucro)} acima do lucro: recebimentos de meses anteriores ou contas do mês ainda não pagas.`}
        {" "}Caixa = contas pagas e recebidas no mês{" "}(e os extratos, se ligados).
      </p>
    </Card>
  );
}

/** Taxas de maquininha, marketplace, antecipação e tarifas por canal. */
function QuadroTaxas({ taxas, i, mes, receita }: { taxas: ReturnType<typeof taxasPorCanal>; i: number; mes: string; receita: number }) {
  const doMes = taxas.filter((t) => t.valores[i]).sort((a, b) => b.valores[i] - a.valores[i]);
  const total = doMes.reduce((s, t) => s + t.valores[i], 0);
  return (
    <Card className="min-w-0 p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">Taxas e tarifas por canal</h3>
        <span className="text-xs text-slate-500 first-letter:uppercase">{rotuloMesLongo(mes)}</span>
      </div>
      {!doMes.length ? <p className="text-sm text-slate-600">Nenhuma taxa ou tarifa lançada no mês.</p> : (
        <ul className="space-y-1.5 text-sm">
          {doMes.map((t) => (
            <li key={t.canal}>
              <div className="flex justify-between gap-3"><span className="min-w-0">{t.canal}</span>
                <span className="num whitespace-nowrap font-semibold">{brl(t.valores[i])}{receita > 0 && <span className="ml-1 text-xs font-normal text-slate-500">{pct(t.valores[i] / receita)} da receita</span>}</span></div>
              <div className="h-1.5 rounded-full bg-slate-100" aria-hidden><div className="h-full rounded-full bg-amber-400" style={{ width: `${(t.valores[i] / (doMes[0].valores[i] || 1)) * 100}%` }} /></div>
            </li>
          ))}
          <li className="flex justify-between gap-3 border-t border-slate-200 pt-1.5 font-bold"><span>Total</span><span className="num whitespace-nowrap">{brl(total)}{receita > 0 && <span className="ml-1 text-xs font-semibold text-slate-500">{pct(total / receita)}</span>}</span></li>
        </ul>
      )}
      <p className="mt-2 text-[11px] text-slate-500">Canal pela conta do banco do extrato, pelo fornecedor ou pela descrição. Vale negociar a taxa quando o volume do canal cresce.</p>
    </Card>
  );
}
