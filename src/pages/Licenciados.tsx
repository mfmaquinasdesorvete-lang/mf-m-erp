// Carteira My Frost Sorveterias · Licenciados (pelo sorvete no fim do menu, só para o administrador): as lojas
// licenciadas e o que cada uma pagou, como o painel pessoal. MF ≠ My Frost: nada daqui entra no DRE, na conciliação,
// nos painéis da MF nem no que vai para o contador; no banco, cada linha é de quem a criou e só essa pessoa lê.
// "Para conferir" traz as entradas altas dos extratos pessoais e as vendas altas no cartão das InfinitePay: a pessoa
// liga cada uma à loja (dá para dividir uma entrada entre duas lojas) ou marca "não é de loja". Nada é apagado:
// pagamento errado é anulado; loja que saiu fica como encerrada.
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Check, Download, IceCreamCone, Link2, Lock, Pencil, Plus, Search, Store, Undo2, Wallet, X } from "lucide-react";
import { Button, Card, Field, MaisAcoes, Modal, PageHeader } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { Colunas, Ranking } from "@/components/Charts";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { numeroBR } from "@/lib/fichaCadastral";
import { baixarPlanilha } from "@/lib/exportar";
import { useUnidade } from "@/lib/unidade";
import type { Parte } from "@/lib/partesRelacionadas";
import type { ContaPessoal, Empresa, LancPessoal } from "@/lib/pessoal";
import { paresEntreContas } from "@/lib/pessoalCards";
import {
  CORES_LOJA, FORMAS_PAGAMENTO, PERIODOS_LIC, SITUACOES_LOJA, TIPOS_PAGAMENTO, corDaLoja, deEmpresaOuSocio, entradasCartao, entradasPessoais, faixaLic, nomeForma,
  nomeSituacao, nomeTipo, nomesComTermo, resumoLojas, serieMensalLojas, sugestoes, valePagamento,
  type ContaBancaria, type ExtratoLinha, type Loja, type PagamentoLoja, type PeriodoLic, type ReceberCartao, type Sugestao, type TipoPagamento,
} from "@/lib/licenciados";

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (ym: string) => `${MESES_CURTOS[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const NENHUM = "00000000-0000-0000-0000-000000000000";
// rosa e turquesa da marca My Frost (fundo forte, letra branca: iguais nos dois temas)
const ROSA = "#c2185b", ROSA_ESCURO = "#6d0d33", TURQUESA = "#67e8e2";
const nomeProprio = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

export default function Licenciados() {
  const invalidar = useInvalidate();
  const { unidades } = useUnidade();
  const { data: lojas = [], isLoading } = useRows<Loja>("licenciados_lojas", { order: "ordem", ascending: true });
  const { data: pagamentos = [] } = useRows<PagamentoLoja>("licenciados_pagamentos", { order: "data", ascending: false });
  const { data: contasPessoais = [] } = useRows<ContaPessoal>("pessoal_contas", { order: "ordem", ascending: true });
  const { data: lancs = [] } = useRows<LancPessoal>("pessoal_lancamentos", { order: "data", ascending: false });
  const { data: partes = [] } = useRows<Parte>("partes_relacionadas", { order: "nome", ascending: true });
  const { data: bancos = [] } = useRows<ContaBancaria>("contas_bancarias", { select: "id,nome,banco", order: "nome", ascending: true, key: ["licenciados"] });
  const idsInfinite = bancos.filter((b) => /infinit/i.test(`${b.banco ?? ""} ${b.nome}`)).map((b) => b.id);
  const { data: receber = [] } = useRows<ReceberCartao>("contas_receber", {
    select: "id,descricao,valor,valor_pago,data_pagamento,vencimento,forma_pagamento,conta_bancaria_id,pedido_id,os_id,status", order: "vencimento",
    filtro: (q) => q.eq("forma_pagamento", "cartao").in("conta_bancaria_id", idsInfinite.length ? idsInfinite : [NENHUM]).gte("valor", 500),
    key: ["licenciados-cartao", idsInfinite.join()],
  });
  const { data: extrato = [] } = useRows<ExtratoLinha>("extrato_lancamentos", {
    select: "id,conta_bancaria_id,valor,conta_receber_id", order: "data",
    filtro: (q) => q.in("conta_bancaria_id", idsInfinite.length ? idsInfinite : [NENHUM]).gte("valor", 100),
    key: ["licenciados-extrato", idsInfinite.join()],
  });

  const [periodo, setPeriodo] = useState<PeriodoLic>("12m");
  const [lojaSel, setLojaSel] = useState("");
  const [minimo, setMinimo] = useState(1000);
  const [busca, setBusca] = useState("");
  const [verTodas, setVerTodas] = useState(false);
  const [editLoja, setEditLoja] = useState<{ loja: Partial<Loja>; depois?: Sugestao } | null>(null);
  const [editPag, setEditPag] = useState<Partial<PagamentoLoja> | null>(null);
  const [verDescartes, setVerDescartes] = useState(false);

  // a MF, as empresas ligadas e os sócios (Entre contas e sócios): o Pix deles na conta pessoal não é pagamento de loja
  const empresas: Empresa = useMemo(() => {
    const ligadas = partes.filter((p) => p.ativo !== false);
    return {
      nomes: [...new Set(unidades.map((u) => u.razao_social ?? "").filter(Boolean)), ...ligadas.flatMap((p) => [p.nome, ...(p.nomes_extrato ?? [])])],
      documentos: [...unidades.map((u) => String(u.cnpj ?? "").replace(/\D/g, "")).filter((d) => d.length === 14),
        ...ligadas.flatMap((p) => (p.documentos ?? []).map((d) => String(d).replace(/\D/g, "")))],
    };
  }, [unidades, partes]);
  const entreContas = useMemo(() => paresEntreContas(lancs, contasPessoais, (l) => deEmpresaOuSocio(l.descricao, empresas)), [lancs, contasPessoais, empresas]);
  const entradas = useMemo(() => [
    ...entradasPessoais(lancs, contasPessoais, { empresas, entreContas, minimo }),
    ...entradasCartao(receber, extrato, bancos, minimo),
  ], [lancs, contasPessoais, empresas, entreContas, minimo, receber, extrato, bancos]);
  const lista = useMemo(() => sugestoes(entradas, pagamentos, lojas), [entradas, pagamentos, lojas]);
  const reconhecidas = lista.filter((s) => s.loja);

  const faixa = faixaLic(periodo, hoje());
  const resumo = useMemo(() => resumoLojas(lojas, pagamentos, faixa, hoje()), [lojas, pagamentos, faixa.de, faixa.ate]); // eslint-disable-line react-hooks/exhaustive-deps
  const ordenadas = [...resumo].sort((a, b) => (a.loja.situacao === "encerrada" ? 1 : 0) - (b.loja.situacao === "encerrada" ? 1 : 0) || b.total - a.total);
  const validos = pagamentos.filter(valePagamento);
  const noPeriodo = validos.filter((p) => p.data >= faixa.de && p.data <= faixa.ate && (!lojaSel || p.loja_id === lojaSel));
  const total = r2(noPeriodo.reduce((t, p) => t + Number(p.valor), 0));
  const taxas = r2(noPeriodo.reduce((t, p) => t + Number(p.taxa), 0));
  const ativas = lojas.filter((l) => l.situacao === "ativa" || l.situacao === "implantacao").length;
  const ateMes = faixa.ate > hoje() ? hoje().slice(0, 7) : faixa.ate.slice(0, 7);
  const serie = useMemo(() => serieMensalLojas(lojaSel ? pagamentos.filter((p) => p.loja_id === lojaSel) : pagamentos, ateMes, 12), [pagamentos, lojaSel, ateMes]);
  const nomeLoja = (id: string | null) => lojas.find((l) => l.id === id);
  const descartes = pagamentos.filter((p) => p.descartado && !p.anulado);
  const rotulo = PERIODOS_LIC.find((p) => p.id === periodo)?.rotulo ?? "";

  const pagsLista = noPeriodo.filter((p) => !busca.trim() || [nomeLoja(p.loja_id)?.nome, p.descricao, p.onde, nomeTipo(p.tipo)].some((x) => sem(x).includes(sem(busca.trim()))));

  async function ligar(s: Sugestao, lojaId: string, tipo: TipoPagamento, valor = s.resta) {
    const loja = nomeLoja(lojaId);
    const v = Math.min(r2(valor), s.resta);
    if (!(v > 0)) return notifyError(new Error("Informe um valor maior que zero."));
    const { error } = await supabase.from("licenciados_pagamentos").insert({
      loja_id: lojaId, data: s.data, valor: v, taxa: s.resta > 0 ? r2((s.taxaResta * v) / s.resta) : 0, tipo, forma: s.forma, origem: s.origem,
      origem_id: s.origem_id, onde: s.onde.slice(0, 80), descricao: s.descricao.slice(0, 300),
    });
    if (error) return notifyError(error);
    // guarda na loja o nome como o extrato escreve: as próximas entradas já vêm com ela sugerida
    if (loja && s.nome) {
      const nomes = nomesComTermo(loja.nomes_extrato, s.nome);
      if (nomes.length !== (loja.nomes_extrato ?? []).length) await supabase.from("licenciados_lojas").update({ nomes_extrato: nomes }).eq("id", loja.id);
    }
    notify(`${brl(v)} ligado a ${loja?.nome ?? "loja"}`);
    invalidar("licenciados_pagamentos", "licenciados_lojas");
  }
  async function naoELoja(s: Sugestao) {
    const { error } = await supabase.from("licenciados_pagamentos").insert({
      loja_id: null, descartado: true, data: s.data, valor: s.resta, origem: s.origem, origem_id: s.origem_id, onde: s.onde.slice(0, 80), descricao: s.descricao.slice(0, 300),
    });
    if (error) return notifyError(error);
    notify("Marcado como não é de loja");
    invalidar("licenciados_pagamentos");
  }
  async function ligarReconhecidas() {
    const soma = reconhecidas.reduce((t, s) => t + s.resta, 0);
    if (!(await confirmar(`Ligar ${reconhecidas.length} ${pl(reconhecidas.length, "entrada", "entradas")} (${brl(soma)}) às lojas reconhecidas pelo nome no extrato, como licença? Dá para mudar o tipo ou anular depois.`, { ok: "Ligar todas" }))) return;
    const linhas = reconhecidas.map((s) => ({
      loja_id: s.loja!.id, data: s.data, valor: s.resta, taxa: s.taxaResta, tipo: "licenca", forma: s.forma, origem: s.origem, origem_id: s.origem_id,
      onde: s.onde.slice(0, 80), descricao: s.descricao.slice(0, 300),
    }));
    const { error } = await supabase.from("licenciados_pagamentos").insert(linhas);
    if (error) return notifyError(error);
    notify(`${linhas.length} ${pl(linhas.length, "pagamento ligado", "pagamentos ligados")}`);
    invalidar("licenciados_pagamentos");
  }
  async function gravarLoja(l: Record<string, unknown>, depois?: Sugestao) {
    const { id, ...resto } = l;
    const r = id ? await supabase.from("licenciados_lojas").update(resto).eq("id", id as string).select("id").single()
      : await supabase.from("licenciados_lojas").insert({ ...resto, ordem: lojas.length }).select("id").single();
    if (r.error) return notifyError(r.error);
    notify(id ? "Loja alterada" : "Loja cadastrada");
    invalidar("licenciados_lojas");
    setEditLoja(null);
    if (depois && r.data?.id) await ligar(depois, r.data.id as string, "licenca");
  }
  async function gravarPag(p: Record<string, unknown>) {
    const { id, ...resto } = p;
    const { error } = id ? await supabase.from("licenciados_pagamentos").update(resto).eq("id", id as string) : await supabase.from("licenciados_pagamentos").insert(resto);
    if (error) return notifyError(error);
    notify(id ? "Pagamento alterado" : "Pagamento lançado");
    invalidar("licenciados_pagamentos");
    setEditPag(null);
  }
  async function anular(p: PagamentoLoja) {
    const { error } = await supabase.from("licenciados_pagamentos").update({ anulado: !p.anulado }).eq("id", p.id);
    if (error) return notifyError(error);
    notify(p.anulado ? "Pagamento de volta" : p.descartado ? "Voltou para conferir" : "Pagamento anulado (a entrada volta para conferir)");
    invalidar("licenciados_pagamentos");
  }
  async function baixar() {
    try {
      await baixarPlanilha(`licenciados-my-frost-${hoje()}`, [
        { nome: "Lojas", linhas: ordenadas.map((r) => ({
          Loja: r.loja.nome, Cidade: r.loja.cidade ?? "", UF: r.loja.uf ?? "", Situação: nomeSituacao(r.loja.situacao), Início: r.loja.inicio ? dataBR(r.loja.inicio) : "",
          "Combinado (R$)": r.loja.valor_combinado ?? "", "Pago (R$)": r.total, "Falta (R$)": r.falta ?? "", "Taxas (R$)": r.taxas, Pagamentos: r.qtd,
          "Último pagamento": r.ultimo ? dataBR(r.ultimo) : "",
        })) },
        { nome: "Pagamentos", linhas: validos.map((p) => ({
          Data: dataBR(p.data), Loja: nomeLoja(p.loja_id)?.nome ?? "", Tipo: nomeTipo(p.tipo), Forma: nomeForma(p.forma), Onde: p.onde ?? "",
          "Valor (R$)": Number(p.valor), "Taxa (R$)": Number(p.taxa), "Líquido (R$)": r2(Number(p.valor) - Number(p.taxa)), Descrição: p.descricao ?? "", Observação: p.observacao ?? "",
        })) },
      ]);
    } catch (e) { notifyError(e); }
  }

  const sugestoesVistas = verTodas ? lista : lista.slice(0, 12);
  return (
    <div>
      <PageHeader title="Licenciados My Frost" subtitle="As lojas licenciadas da My Frost Sorveterias e o que cada uma pagou"
        actions={<>
          <MaisAcoes>
            <Button variant="secondary" onClick={() => setEditPag({ data: hoje(), tipo: "licenca", forma: "pix", origem: "manual", loja_id: lojaSel || lojas[0]?.id })} disabled={!lojas.length}><Plus size={16} /> Lançar pagamento</Button>
            <Button variant="secondary" onClick={baixar} disabled={!lojas.length}><Download size={16} /> Baixar planilha</Button>
            <Link to="/pessoal" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"><Wallet size={16} /> Painel pessoal</Link>
          </MaisAcoes>
          <Button onClick={() => setEditLoja({ loja: { situacao: "ativa", cor: Object.keys(CORES_LOJA)[lojas.length % 8], nomes_extrato: [] } })}><Store size={16} /> Nova loja</Button>
        </>} />

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm text-purple-900">
        <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span>Só você vê esta carteira. MF ≠ My Frost: nada daqui entra no DRE, na conciliação, nos painéis da MF nem no que vai para o contador.
          O que caiu na InfinitePay da MF continua lá como "recebido por conta de terceiros" (acerto entre as empresas: confirmar com o contador).</span>
      </div>

      {/* a carteira: rosa e turquesa da marca */}
      <div className="mb-4 overflow-hidden rounded-2xl text-white shadow-card" style={{ background: `linear-gradient(135deg, ${ROSA}, ${ROSA_ESCURO})` }}>
        <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15"><IceCreamCone size={30} aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <div className="text-xl font-extrabold leading-tight sm:text-2xl">My Frost <span style={{ color: TURQUESA }}>Sorveterias</span></div>
            <div className="text-sm opacity-90">Licenciados · {lojaSel ? nomeLoja(lojaSel)?.nome : "todas as lojas"}</div>
          </div>
          <div className="text-right">
            <div className="num text-3xl font-bold">{brl(total)}</div>
            <div className="text-xs opacity-90">recebido · {rotulo}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-white/20 text-sm sm:grid-cols-4">
          {[["Lojas ativas", String(ativas)], ["Pagamentos", String(noPeriodo.length)], ["Taxas do cartão", brl(taxas)], ["Líquido", brl(r2(total - taxas))]].map(([r, v], i) => (
            <div key={r} className={`px-4 py-2.5 ${i % 2 ? "border-l border-white/20" : ""} ${i >= 2 ? "border-t border-white/20 sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}>
              <div className="text-xs opacity-80">{r}</div><div className="num font-bold">{v}</div>
            </div>
          ))}
        </div>
      </div>

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Período">
            {PERIODOS_LIC.map((p) => (
              <button key={p.id} type="button" aria-pressed={periodo === p.id} onClick={() => setPeriodo(p.id)}
                className={`rounded-lg px-2.5 py-1.5 text-sm font-semibold ${periodo === p.id ? "bg-surface text-fg shadow-card" : "text-slate-600 hover:text-fg"}`}>{p.rotulo}</button>
            ))}
          </div>
          {lojaSel && <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline" onClick={() => setLojaSel("")}><X size={14} /> ver todas as lojas</button>}
        </div>
      </Card>

      {/* para conferir: entradas altas do extrato pessoal e vendas altas no cartão da InfinitePay */}
      <Card className="mb-4 p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-start gap-2">
          <div className="mr-auto min-w-0">
            <h2 className="font-bold text-fg">Para conferir <span className="text-sm font-normal text-slate-500">· {lista.length} {pl(lista.length, "entrada", "entradas")} · {brl(lista.reduce((t, s) => t + s.resta, 0))}</span></h2>
            <p className="text-xs text-slate-500">Entradas altas dos seus extratos pessoais (sem as da MF, das empresas ligadas, dos sócios e entre as suas contas) e vendas altas no cartão das InfinitePay que não são vendas da MF.</p>
          </div>
          <label className="flex items-center gap-1.5 text-sm text-slate-600">a partir de
            <input className="input w-28 py-1.5 text-right" inputMode="decimal" defaultValue="1.000" aria-label="Valor mínimo"
              onBlur={(e) => setMinimo(Math.max(0, numeroBR(e.target.value) ?? 0))} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
          </label>
          {reconhecidas.length > 0 && <Button variant="secondary" onClick={ligarReconhecidas}><Link2 size={15} /> Ligar as {reconhecidas.length} reconhecidas</Button>}
        </div>
        {!lista.length ? <p className="text-sm text-slate-500">Nada para conferir: todas as entradas a partir de {brl(minimo)} já estão ligadas a uma loja ou marcadas como "não é de loja".</p> : (
          <ul className="divide-y divide-slate-100">
            {sugestoesVistas.map((s) => <LinhaSugestao key={`${s.origem}:${s.origem_id}`} s={s} lojas={lojas} onLigar={ligar} onNaoE={naoELoja}
              onNova={() => setEditLoja({ loja: { nome: s.nome ? nomeProprio(s.nome) : "", nomes_extrato: s.nome ? [s.nome] : [], situacao: "ativa", cor: Object.keys(CORES_LOJA)[lojas.length % 8] }, depois: s })} />)}
          </ul>
        )}
        {lista.length > 12 && <button type="button" className="mt-2 text-sm font-semibold text-brand hover:underline" onClick={() => setVerTodas(!verTodas)}>{verTodas ? "Mostrar menos" : `Ver as ${lista.length}`}</button>}
        {descartes.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-2 text-sm">
            <button type="button" className="font-semibold text-slate-600 hover:underline" onClick={() => setVerDescartes(!verDescartes)}>
              {descartes.length} {pl(descartes.length, "entrada marcada", "entradas marcadas")} como "não é de loja" {verDescartes ? "▲" : "▼"}
            </button>
            {verDescartes && (
              <ul className="mt-1 divide-y divide-slate-100">
                {descartes.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 py-1.5">
                    <span className="w-20 shrink-0 text-xs text-slate-500">{dataBR(p.data)}</span>
                    <span className="min-w-0 flex-1 truncate">{p.descricao}</span>
                    <span className="num">{brl(p.valor)}</span>
                    <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline" onClick={() => anular(p)}><Undo2 size={13} /> voltar para conferir</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      {/* as lojas, cada uma com a sua cor */}
      {!isLoading && !lojas.length ? (
        <Card className="mb-4 flex flex-col items-center gap-3 p-8 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl text-white" style={{ background: ROSA }}><Store size={28} aria-hidden /></span>
          <h2 className="text-lg font-bold text-fg">Cadastre as lojas licenciadas</h2>
          <p className="max-w-md text-sm text-slate-600">O nome da loja, a cidade e como o nome aparece no extrato. Ou use "Nova loja" numa entrada de "Para conferir": a loja já nasce com o pagamento.</p>
          <Button onClick={() => setEditLoja({ loja: { situacao: "ativa", cor: "rosa", nomes_extrato: [] } })}><Plus size={16} /> Primeira loja</Button>
        </Card>
      ) : (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ordenadas.map((r) => {
            const sit = SITUACOES_LOJA.find((s) => s.id === r.loja.situacao);
            return (
              <div key={r.loja.id} className={`overflow-hidden rounded-2xl text-white shadow-card ${r.loja.situacao === "encerrada" ? "opacity-60" : ""}`}
                style={{ background: `linear-gradient(135deg, ${corDaLoja(r.loja.cor)}, #0f172a)` }}>
                <button type="button" onClick={() => setLojaSel(lojaSel === r.loja.id ? "" : r.loja.id)} aria-pressed={lojaSel === r.loja.id}
                  className={`block w-full p-4 text-left ${lojaSel === r.loja.id ? "ring-4 ring-inset ring-white/60" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="line-clamp-2 break-words text-base font-bold leading-tight">{r.loja.nome}</div>
                      <div className="truncate text-xs opacity-80">{[r.loja.cidade, r.loja.uf].filter(Boolean).join("/") || "cidade não informada"}</div>
                    </div>
                    <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold" title={sit?.nome}>{sit?.nome}</span>
                  </div>
                  <div className="num mt-3 text-2xl font-bold">{brl(r.total)}</div>
                  <div className="text-xs opacity-80">pago desde o começo · {r.qtd} {pl(r.qtd, "pagamento", "pagamentos")}</div>
                  {r.pct != null && (
                    <div className="mt-2 text-[11px]">
                      <div className="flex justify-between"><span>{r.pct}% de {brl(r.loja.valor_combinado)}</span><span>{r.falta ? `falta ${brl(r.falta)}` : "quitado"}</span></div>
                      <span className="mt-0.5 block h-1.5 rounded-full bg-white/25"><span className="block h-1.5 rounded-full bg-white" style={{ width: `${r.pct}%` }} /></span>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-3 text-xs"><span>{brl(r.noPeriodo)} no período</span>{r.taxas > 0 && <span className="opacity-80">taxas {brl(r.taxas)}</span>}</div>
                  <div className="mt-1 text-[11px] opacity-80">{r.ultimo ? `último em ${dataBR(r.ultimo)}${r.diasSemPagar != null && r.diasSemPagar > 45 && r.loja.situacao === "ativa" ? ` · ${r.diasSemPagar} dias sem pagar` : ""}` : "sem pagamentos"}</div>
                </button>
                <div className="flex border-t border-white/20 text-xs font-semibold">
                  <button type="button" className="flex-1 py-2 hover:bg-white/10" onClick={() => setEditPag({ data: hoje(), tipo: r.loja.mensalidade ? "mensalidade" : "licenca", forma: "pix", origem: "manual", loja_id: r.loja.id, valor: r.loja.mensalidade ?? undefined })}>Lançar</button>
                  <button type="button" className="flex-1 border-l border-white/20 py-2 hover:bg-white/10" onClick={() => setEditLoja({ loja: r.loja })}>Editar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="min-w-0 p-4">
          <h2 className="font-bold text-fg">Recebido mês a mês</h2>
          <p className="mb-2 text-xs text-slate-500">12 meses até {mesCurto(ateMes)}{lojaSel ? ` · ${nomeLoja(lojaSel)?.nome}` : ""} · valor pago pelas lojas e taxas do cartão</p>
          <Colunas altura={230} vazio="Sem pagamentos nesses meses." dados={serie.map((s) => ({ rotulo: mesCurto(s.mes), valores: [s.valor, s.taxas] }))}
            series={[{ nome: "Recebido", cor: ROSA }, { nome: "Taxas", cor: "var(--serie-2)" }]} />
        </Card>
        <Card className="min-w-0 p-4">
          <h2 className="mb-3 font-bold text-fg">Lojas que mais pagaram · {rotulo}</h2>
          <Ranking vazio="Nenhum pagamento no período." cor={ROSA} onClicar={(i) => { const id = ordenadas.filter((r) => r.noPeriodo > 0).sort((a, b) => b.noPeriodo - a.noPeriodo)[i]?.loja.id; if (id) setLojaSel(id); }}
            itens={ordenadas.filter((r) => r.noPeriodo > 0).sort((a, b) => b.noPeriodo - a.noPeriodo).map((r) => ({ rotulo: r.loja.nome, valor: r.noPeriodo, detalhe: `${r.qtdPeriodo} ${pl(r.qtdPeriodo, "pagamento", "pagamentos")}` }))} />
        </Card>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-bold text-fg">Pagamentos <span className="text-sm font-normal text-slate-500">· {rotulo}{lojaSel ? ` · ${nomeLoja(lojaSel)?.nome}` : ""} · {pagsLista.length}</span></h2>
        <label className="relative w-full sm:w-64">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input w-full pl-8" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pagamento" aria-label="Buscar pagamento" />
        </label>
      </div>
      <Card className="overflow-hidden">
        {!pagsLista.length ? <p className="p-4 text-sm text-slate-500">Nenhum pagamento no período.</p> : (
          <ul className="divide-y divide-slate-100">
            {pagsLista.slice(0, 300).map((p) => {
              const l = nomeLoja(p.loja_id);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="w-20 shrink-0 text-xs font-semibold text-slate-500">{dataBR(p.data)}</span>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: corDaLoja(l?.cor) }} aria-hidden />
                  <span className="min-w-0 flex-1 basis-48">
                    <span className="block truncate font-semibold text-fg">{l?.nome ?? "—"}</span>
                    <span className="block truncate text-xs text-slate-500">{nomeTipo(p.tipo)} · {nomeForma(p.forma)}{p.onde ? ` · ${p.onde}` : ""}{p.descricao ? ` · ${p.descricao}` : ""}</span>
                  </span>
                  <span className="text-right">
                    <span className="num block font-bold text-emerald-700">{brl(p.valor)}</span>
                    {Number(p.taxa) > 0 && <span className="num block text-[11px] text-slate-500">taxa {brl(p.taxa)}</span>}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <button type="button" className="rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Editar pagamento" title="Editar" onClick={() => setEditPag(p)}><Pencil size={15} /></button>
                    <button type="button" className="rounded p-1.5 text-red-600 hover:bg-red-50" aria-label="Anular pagamento" title="Anular (a entrada volta para conferir)" onClick={() => anular(p)}><Undo2 size={15} /></button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {editLoja && <LojaModal loja={editLoja.loja} comPagamento={!!editLoja.depois} onClose={() => setEditLoja(null)} onGravar={(l) => gravarLoja(l, editLoja.depois)} />}
      {editPag && <PagamentoModal pag={editPag} lojas={lojas} onClose={() => setEditPag(null)} onGravar={gravarPag} />}
    </div>
  );
}

function LinhaSugestao({ s, lojas, onLigar, onNaoE, onNova }: {
  s: Sugestao; lojas: Loja[]; onLigar: (s: Sugestao, loja: string, tipo: TipoPagamento, valor?: number) => void; onNaoE: (s: Sugestao) => void; onNova: () => void;
}) {
  const [loja, setLoja] = useState(s.loja?.id ?? "");
  const [tipo, setTipo] = useState<TipoPagamento>("licenca");
  const [valorTxt, setValorTxt] = useState(String(s.resta).replace(".", ","));
  const valor = numeroBR(valorTxt) ?? 0;
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="w-20 shrink-0 text-xs font-semibold text-slate-500">{dataBR(s.data)}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${s.origem === "infinitepay" ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"}`}>
          {s.origem === "infinitepay" ? `Cartão · ${s.onde}` : s.onde}
        </span>
        <span className="min-w-0 flex-1 basis-48 truncate text-fg" title={s.descricao}>{s.nome || s.descricao}</span>
        <span className="text-right">
          <span className="num block font-bold text-emerald-700">{brl(s.resta)}</span>
          {s.resta < s.valor && <span className="block text-[11px] text-slate-500">resta de {brl(s.valor)}</span>}
          {s.taxaResta > 0 && <span className="num block text-[11px] text-slate-500">taxa {brl(s.taxaResta)}</span>}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:pl-[5.75rem]">
        <select className="input w-auto min-w-0 flex-1 basis-40 py-1.5" value={loja} onChange={(e) => setLoja(e.target.value)} aria-label="Loja">
          <option value="">Escolher a loja…</option>
          {lojas.filter((l) => l.situacao !== "encerrada" || l.id === loja).map((l) => <option key={l.id} value={l.id}>{l.nome}{s.loja?.id === l.id ? " (pelo nome no extrato)" : ""}</option>)}
        </select>
        <select className="input w-auto py-1.5" value={tipo} onChange={(e) => setTipo(e.target.value as TipoPagamento)} aria-label="Tipo do pagamento">
          {TIPOS_PAGAMENTO.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
        <input className="input w-28 py-1.5 text-right" inputMode="decimal" value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} aria-label="Valor desta loja"
          title="Para dividir entre duas lojas, ponha aqui a parte desta loja: o resto continua para conferir" />
        <Button onClick={() => onLigar(s, loja, tipo, valor)} disabled={!loja || !(valor > 0)}><Check size={15} /> Ligar</Button>
        <Button variant="secondary" onClick={onNova}><Plus size={15} /> Nova loja</Button>
        <Button variant="ghost" onClick={() => onNaoE(s)}>Não é de loja</Button>
      </div>
    </li>
  );
}

function LojaModal({ loja, comPagamento, onClose, onGravar }: { loja: Partial<Loja>; comPagamento: boolean; onClose: () => void; onGravar: (l: Record<string, unknown>) => void }) {
  const [l, setL] = useState({
    ...loja, nomes_txt: (loja.nomes_extrato ?? []).join(", "), combinado_txt: loja.valor_combinado != null ? String(loja.valor_combinado).replace(".", ",") : "",
    mensalidade_txt: loja.mensalidade != null ? String(loja.mensalidade).replace(".", ",") : "",
  });
  const set = (k: string, v: unknown) => setL((x) => ({ ...x, [k]: v }));
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const doc = String(l.documento ?? "").replace(/\D/g, "");
    if (doc && doc.length !== 11 && doc.length !== 14) return notifyError(new Error("CPF com 11 números ou CNPJ com 14."));
    onGravar({
      id: loja.id, nome: String(l.nome ?? "").trim(), cidade: String(l.cidade ?? "").trim() || null, uf: String(l.uf ?? "").trim().toUpperCase() || null,
      responsavel: String(l.responsavel ?? "").trim() || null, documento: doc || null, telefone: String(l.telefone ?? "").trim() || null,
      nomes_extrato: [...new Set(l.nomes_txt.split(",").map((x) => x.trim()).filter((x) => x.length >= 3))].slice(0, 20),
      situacao: l.situacao ?? "ativa", inicio: l.inicio || null, valor_combinado: numeroBR(l.combinado_txt), mensalidade: numeroBR(l.mensalidade_txt),
      cor: l.cor ?? "rosa", observacoes: String(l.observacoes ?? "").trim() || null,
    });
  };
  return (
    <Modal open onClose={onClose} title={loja.id ? "Editar loja" : "Nova loja licenciada"}>
      <form onSubmit={enviar} className="space-y-3">
        {comPagamento && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">Ao salvar, a entrada que você escolheu fica ligada a esta loja como licença.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nome da loja" className="sm:col-span-2"><input className="input" value={l.nome ?? ""} onChange={(e) => set("nome", e.target.value)} required minLength={2} maxLength={120} placeholder="Ex.: My Frost Centro" autoFocus /></Field>
          <Field label="Cidade"><input className="input" value={l.cidade ?? ""} onChange={(e) => set("cidade", e.target.value)} maxLength={80} /></Field>
          <Field label="UF"><input className="input uppercase" value={l.uf ?? ""} onChange={(e) => set("uf", e.target.value.replace(/[^a-z]/gi, "").slice(0, 2))} maxLength={2} pattern="[A-Za-z]{2}" placeholder="SC" /></Field>
          <Field label="Responsável"><input className="input" value={l.responsavel ?? ""} onChange={(e) => set("responsavel", e.target.value)} maxLength={120} /></Field>
          <Field label="CPF ou CNPJ (só números)"><input className="input" inputMode="numeric" value={l.documento ?? ""} onChange={(e) => set("documento", e.target.value)} maxLength={18} /></Field>
          <Field label="Telefone"><input className="input" inputMode="tel" value={l.telefone ?? ""} onChange={(e) => set("telefone", e.target.value)} maxLength={30} /></Field>
          <Field label="Situação">
            <select className="input" value={l.situacao ?? "ativa"} onChange={(e) => set("situacao", e.target.value)}>{SITUACOES_LOJA.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
          </Field>
          <Field label="Início da licença"><input className="input" type="date" value={l.inicio ?? ""} onChange={(e) => set("inicio", e.target.value)} /></Field>
          <Field label="Valor combinado da licença (R$)"><input className="input" inputMode="decimal" value={l.combinado_txt} onChange={(e) => set("combinado_txt", e.target.value)} placeholder="opcional" /></Field>
          <Field label="Mensalidade (R$)"><input className="input" inputMode="decimal" value={l.mensalidade_txt} onChange={(e) => set("mensalidade_txt", e.target.value)} placeholder="opcional" /></Field>
          <Field label="Como aparece no extrato (separe por vírgula)" className="sm:col-span-2">
            <input className="input" value={l.nomes_txt} onChange={(e) => set("nomes_txt", e.target.value)} placeholder="Ex.: o nome cortado do Pix no Itaú" />
          </Field>
        </div>
        <p className="text-xs text-slate-500">O Itaú corta o nome de quem mandou o Pix em 7 letras. Com esse texto aqui, as próximas entradas já chegam com a loja escolhida.</p>
        <Field label="Cor">
          <div className="flex flex-wrap gap-2">
            {Object.entries(CORES_LOJA).map(([nome, hex]) => (
              <button key={nome} type="button" onClick={() => set("cor", nome)} aria-label={`Cor ${nome}`} aria-pressed={l.cor === nome}
                className={`h-8 w-8 rounded-full ${l.cor === nome ? "ring-4 ring-brand/50" : ""}`} style={{ background: hex }} />
            ))}
          </div>
        </Field>
        <Field label="Observações"><textarea className="input min-h-[4rem]" value={l.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} maxLength={1000} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></div>
      </form>
    </Modal>
  );
}

function PagamentoModal({ pag, lojas, onClose, onGravar }: { pag: Partial<PagamentoLoja>; lojas: Loja[]; onClose: () => void; onGravar: (p: Record<string, unknown>) => void }) {
  const [p, setP] = useState({ ...pag, valor_txt: pag.valor != null ? String(pag.valor).replace(".", ",") : "", taxa_txt: pag.taxa ? String(pag.taxa).replace(".", ",") : "" });
  const set = (k: string, v: unknown) => setP((x) => ({ ...x, [k]: v }));
  // o que veio do extrato fica com a data e o valor dele; muda só a loja, o tipo e a observação
  const doExtrato = !!pag.id && pag.origem !== "manual";
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const valor = numeroBR(p.valor_txt);
    if (!(valor && valor > 0)) return notifyError(new Error("Informe o valor."));
    onGravar(doExtrato ? { id: pag.id, loja_id: p.loja_id, tipo: p.tipo, observacao: String(p.observacao ?? "").trim() || null } : {
      id: pag.id, loja_id: p.loja_id, data: p.data, valor, taxa: numeroBR(p.taxa_txt) ?? 0, tipo: p.tipo, forma: p.forma, origem: "manual",
      onde: String(p.onde ?? "").trim() || null, descricao: String(p.descricao ?? "").trim() || null, observacao: String(p.observacao ?? "").trim() || null,
    });
  };
  return (
    <Modal open onClose={onClose} title={pag.id ? "Editar pagamento" : "Lançar pagamento de loja"}>
      <form onSubmit={enviar} className="space-y-3">
        {doExtrato && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Veio do extrato ({pag.onde}): a data e o valor ficam como estão. Para tirar, use Anular na lista.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Loja" className="sm:col-span-2">
            <select className="input" value={p.loja_id ?? ""} onChange={(e) => set("loja_id", e.target.value)} required>
              <option value="" disabled>Escolher…</option>
              {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </Field>
          <Field label="Data"><input className="input" type="date" value={p.data ?? ""} onChange={(e) => set("data", e.target.value)} required disabled={doExtrato} /></Field>
          <Field label="Tipo">
            <select className="input" value={p.tipo ?? "licenca"} onChange={(e) => set("tipo", e.target.value)}>{TIPOS_PAGAMENTO.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}</select>
          </Field>
          <Field label="Valor pago (R$)"><input className="input" inputMode="decimal" value={p.valor_txt} onChange={(e) => set("valor_txt", e.target.value)} placeholder="0,00" required disabled={doExtrato} /></Field>
          <Field label="Taxa do cartão (R$)"><input className="input" inputMode="decimal" value={p.taxa_txt} onChange={(e) => set("taxa_txt", e.target.value)} placeholder="0,00" disabled={doExtrato} /></Field>
          <Field label="Forma">
            <select className="input" value={p.forma ?? "pix"} onChange={(e) => set("forma", e.target.value)} disabled={doExtrato}>{FORMAS_PAGAMENTO.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
          </Field>
          <Field label="Onde caiu"><input className="input" value={p.onde ?? ""} onChange={(e) => set("onde", e.target.value)} maxLength={80} placeholder="Ex.: conta pessoal, dinheiro" disabled={doExtrato} /></Field>
          <Field label="Descrição" className="sm:col-span-2"><input className="input" value={p.descricao ?? ""} onChange={(e) => set("descricao", e.target.value)} maxLength={300} disabled={doExtrato} /></Field>
          <Field label="Observação" className="sm:col-span-2"><input className="input" value={p.observacao ?? ""} onChange={(e) => set("observacao", e.target.value)} maxLength={500} /></Field>
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></div>
      </form>
    </Modal>
  );
}
