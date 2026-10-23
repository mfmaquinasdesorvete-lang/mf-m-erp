import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDownCircle, ArrowLeftRight, ArrowUpCircle, Ban, Check, FileUp, Landmark, Link2, List, Mail, Pencil, Plus, Receipt, Scale, Undo2, UserRound, Users, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { CartaoPainel, variacao } from "@/components/painel/Painel";
import { Badge, Button, CampoMes, Card, Field, Modal, PageHeader, Section, Table } from "@/components/ui";
import { BarraFiltros, ChipsSituacao } from "@/components/filtros/BarraFiltros";
import { Colunas, Ranking } from "@/components/Charts";
import { limpar, useInvalidate, useRows, useSave } from "@/lib/data";
import { CampoUnidade, EtiquetaUnidade, useUnidade } from "@/lib/unidade";
import { brl, dataBR, digitos, hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { CampoCategoria } from "@/components/financeiro/CategoriaRateio";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { lerExtrato, linhasCsv, type LinhaExtrato, type MapaCsv, type ResultadoExtrato } from "@/lib/extrato";
import { sugerir, type Sugestao } from "@/lib/conciliacao";
import { direcaoDe, emPedacos, regrasDasLinhas, textoRegra, type RegraConciliacao } from "@/lib/conciliacaoLote";
import { PorFavorecido } from "@/components/financeiro/ConciliacaoLote";
import { PagamentosAnotados } from "@/components/voz/PagamentosAnotados";
import type { ConexaoOF } from "@/components/financeiro/OpenFinance";
import type { ConexaoInter } from "@/components/financeiro/Inter";
import { AvisoContasRepetidas, ResumoExtrato } from "@/components/financeiro/ResumoExtrato";
import { contasRepetidas, semRepetidos, TIPOS_LANC, tipoLancamento, transferenciasInternas, type TipoLanc } from "@/lib/extratoTipos";

export type ContaBancaria = {
  id: string; unidade_id: string; nome: string; banco: string; agencia: string | null; numero: string | null; tipo: string;
  saldo_inicial: number; saldo_inicial_data: string; ativo: boolean;
  /** quem pode mandar o extrato (OFX) desta conta por e-mail: endereço ou domínio */
  extrato_remetentes?: string[];
  /** selo no cartão da conta (ex.: de quem é a conta) */
  etiqueta?: string | null;
};
type Lancamento = {
  id: string; conta_bancaria_id: string; data: string; valor: number; descricao: string | null; documento: string | null;
  status: "pendente" | "conciliado" | "ignorado" | "transferencia"; conta_receber_id: string | null; conta_pagar_id: string | null;
  par_transferencia_id: string | null; observacao: string | null; baixou_conta: boolean; created_at: string;
  /** FITID do OFX (ou resumo da linha do CSV): o mesmo lançamento não entra duas vezes na mesma conta */
  identificador?: string | null;
};
export type Importacao = { id: string; conta_bancaria_id: string; saldo_final: number | null; saldo_final_data: string | null; periodo_fim: string | null; created_at: string; arquivo: string | null; email_id?: string | null };
type Conta = {
  id: string; descricao: string; valor: number; vencimento: string; status: string; data_pagamento: string | null; valor_pago: number | null;
  unidade_id: string | null; conta_bancaria_id: string | null; cliente?: { nome: string } | null; fornecedor?: { nome: string } | null;
};

/** Cor do cartão de cada banco (faixa colorida com o saldo). */
const COR_BANCO: Record<string, string> = {
  infinitepay: "from-[#10b981] to-[#047857]", nubank: "from-[#a855f7] to-[#6d28d9]", inter: "from-[#f97316] to-[#c2410c]",
  unicred: "from-[#22c55e] to-[#166534]", caixa: "from-[#64748b] to-[#334155]", outro: "from-[#0ea5e9] to-[#4f46e5]",
};
const somarMesIso = (ym: string, n: number) => { const [a, m] = ym.split("-").map(Number); const t = a * 12 + m - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };

// limpeza dos extratos antigos concluída em 22/10/2026: daqui para trás já foi revisto
const INICIO_CONCILIACAO = "2026-10-01";
export const BANCOS: Record<string, string> = { unicred: "Unicred", nubank: "Nubank", inter: "Banco Inter", infinitepay: "InfinitePay", outro: "Outro banco", caixa: "Caixa (dinheiro)" };

export default function Conciliacao() {
  const navigate = useNavigate();
  const { pode } = usePerfil();
  const podeEditar = pode("editar_financeiro");
  const { filtrar, padrao: unidadePadrao, unidades, nome: nomeUnidade } = useUnidade();
  const { data: contasTodas = [] } = useRows<ContaBancaria>("contas_bancarias", { order: "nome", ascending: true });
  const bancos = filtrar(contasTodas);
  // cartões separados por unidade (SC, depois SP), as inativas no fim de cada uma
  const gruposBancos = [...new Set(bancos.map((b) => b.unidade_id))]
    .sort((a, c) => (unidades.findIndex((u) => u.id === a) + 1 || 99) - (unidades.findIndex((u) => u.id === c) + 1 || 99))
    .map((id) => ({ id, contas: bancos.filter((b) => b.unidade_id === id).sort((a, c) => Number(c.ativo) - Number(a.ativo)) }));
  const { data: lancamentos = [] } = useRows<Lancamento>("extrato_lancamentos", { order: "data", ascending: false });
  const { data: importacoes = [] } = useRows<Importacao>("extrato_importacoes");
  const { data: conexoes = [] } = useRows<ConexaoOF>("openfinance_conexoes");
  const { data: conexoesInter = [] } = useRows<ConexaoInter>("inter_conexoes");
  const { data: receber = [] } = useRows<Conta>("contas_receber", { select: "*, cliente:clientes(nome)" });
  const { data: pagar = [] } = useRows<Conta>("contas_pagar", { select: "*, fornecedor:fornecedores(nome)" });
  // nomes do cadastro de funcionários: o Pix para eles aparece como "Funcionários" (quem não é do financeiro não lê o cadastro)
  const { data: funcionarios = [] } = useRows<{ id: string; nome: string }>("funcionarios", { select: "id, nome, apelido, ativo", order: "nome", ascending: true, key: ["nomes"] });
  // "este favorecido vai sempre para esta categoria": sugestão pronta para a linha sem conta nem transferência
  const { data: regras = [] } = useRows<RegraConciliacao>("conciliacao_regras", { order: "rotulo", ascending: true });

  const [contaSel, setContaSel] = useState<string>("");
  const [situacao, setSituacao] = useState<string>("pendente");
  const [mes, setMes] = useState("");
  const [tipo, setTipo] = useState<TipoLanc | "">("");
  const [editConta, setEditConta] = useState<Partial<ContaBancaria> | null>(null);
  const [importar, setImportar] = useState(false);
  const [tratar, setTratar] = useState<Lancamento | null>(null);
  const [desfazer, setDesfazer] = useState<Lancamento | null>(null);
  const [visao, setVisao] = useState<"linhas" | "favorecido">("linhas");
  // os extratos antigos já foram revistos na limpeza de out/2026: a conciliação mostra só a partir de INICIO_CONCILIACAO
  const [verAntigos, setVerAntigos] = useState(false);
  const [busca, setBusca] = useState("");
  const recente = (l: Lancamento) => verAntigos || l.data >= INICIO_CONCILIACAO;

  const idsBancos = new Set(bancos.map((b) => b.id));
  const invalidate = useInvalidate();
  const [aprovando, setAprovando] = useState(false);
  const { sugestoes, divergentes } = useMemo(() => {
    const daqui = lancamentos.filter((l) => idsBancos.has(l.conta_bancaria_id));
    const r = sugerir(daqui, receber, pagar, new Map(contasTodas.map((b) => [b.id, b.unidade_id])));
    // a regra do favorecido só entra onde não há conta nem transferência que combine
    for (const [id, regra] of regrasDasLinhas(daqui.filter((l) => l.status === "pendente" && !r.sugestoes.has(l.id)), regras)) {
      r.sugestoes.set(id, { tipo: "regra", regra, rotulo: `Regra: ${textoRegra(regra)}`, pontos: 50 });
      r.divergentes.delete(id);
    }
    return r;
  }, [lancamentos, receber, pagar, contasTodas, bancos, regras]); // eslint-disable-line react-hooks/exhaustive-deps
  // busca na descrição do banco (sem acento; cada palavra precisa aparecer)
  const termos = busca.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\s+/).filter(Boolean);
  const casaBusca = (l: { descricao: string | null }) => !termos.length
    || termos.every((t) => String(l.descricao ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(t));
  const naSituacao = (l: (typeof lancamentos)[number], sit: string) => sit === "todos" || (sit === "sugestao" ? l.status === "pendente" && sugestoes.has(l.id)
    : sit === "divergente" ? l.status === "pendente" && divergentes.has(l.id) : l.status === sit);
  // tudo menos a situação: as contagens dos chips seguem a busca, a conta, o mês e o tipo
  const semSituacao = lancamentos
    .filter((l) => idsBancos.has(l.conta_bancaria_id) && (!contaSel || l.conta_bancaria_id === contaSel) && recente(l))
    .filter((l) => !mes || l.data.startsWith(mes))
    .filter((l) => !tipo || tipoLancamento(l.descricao, Number(l.valor), funcionarios) === tipo)
    .filter(casaBusca);
  const lista = semSituacao.filter((l) => naSituacao(l, situacao));
  // base do resumo: conta e mês escolhidos, todas as situações
  const doResumo = lancamentos.filter((l) => idsBancos.has(l.conta_bancaria_id) && (!contaSel || l.conta_bancaria_id === contaSel) && (!mes || l.data.startsWith(mes)));
  const repetidas = useMemo(() => contasRepetidas(lancamentos.filter((l) => contasTodas.some((b) => b.id === l.conta_bancaria_id && b.ativo))), [lancamentos, contasTodas]);
  const sugeridasNaLista = lista.filter((l) => l.status === "pendente" && sugestoes.has(l.id));
  // por favorecido: as pendentes da conta, do mês e do tipo escolhidos; a que já tem conta ou transferência sugerida fica de fora
  const pendentesFiltradas = lancamentos
    .filter((l) => l.status === "pendente" && idsBancos.has(l.conta_bancaria_id) && (!contaSel || l.conta_bancaria_id === contaSel) && recente(l))
    .filter((l) => (!mes || l.data.startsWith(mes)) && (!tipo || tipoLancamento(l.descricao, Number(l.valor), funcionarios) === tipo) && casaBusca(l));
  const paraLote = visao === "favorecido" ? pendentesFiltradas.filter((l) => sugestoes.get(l.id)?.tipo === undefined || sugestoes.get(l.id)?.tipo === "regra") : [];
  const deFora = visao === "favorecido" ? pendentesFiltradas.length - paraLote.length : 0;
  const pendentesTotal = lancamentos.filter((l) => idsBancos.has(l.conta_bancaria_id) && l.status === "pendente" && recente(l)).length;
  const antigosPendentes = verAntigos ? 0 : lancamentos.filter((l) => idsBancos.has(l.conta_bancaria_id) && l.status === "pendente" && l.data < INICIO_CONCILIACAO).length;

  async function aprovar(ids: string[]) {
    setAprovando(true);
    let ok = 0; const erros: string[] = [];
    // regras: de uma vez no banco, por regra e sentido (a mesma função do lote por favorecido)
    const porRegra = new Map<string, { regra: RegraConciliacao; ids: string[] }>();
    for (const id of ids) {
      const s = sugestoes.get(id) as Sugestao;
      if (s.tipo === "regra") {
        const l = lancamentos.find((x) => x.id === id);
        if (!l || direcaoDe(l.valor) !== s.regra.direcao) continue;
        const g = porRegra.get(s.regra.id) ?? { regra: s.regra, ids: [] };
        g.ids.push(id); porRegra.set(s.regra.id, g);
        continue;
      }
      const { error } = s.tipo === "transferencia"
        ? await supabase.rpc("marcar_transferencia", { p_lanc: id, p_par: s.parId })
        : await supabase.rpc("conciliar_lancamento", { p_lanc: id, p_tipo: s.tipo, p_conta: s.contaId });
      if (error) erros.push(error.message); else ok++;
    }
    for (const { regra: r, ids: doLote } of porRegra.values()) {
      for (const pedaco of emPedacos(doLote)) {
        const { data, error } = await supabase.rpc("conciliar_em_lote", {
          p_ids: pedaco, p_acao: r.acao, p_direcao: r.direcao, p_categoria: r.categoria, p_motivo: r.motivo,
          p_fornecedor: r.fornecedor_id, p_cliente: r.cliente_id, p_regra: r.id,
        });
        if (error) { erros.push(...pedaco.map(() => error.message)); continue; }
        const res = data as { feitos: number; erros: { erro: string }[] };
        ok += res.feitos; erros.push(...res.erros.map((e) => e.erro));
      }
    }
    setAprovando(false);
    invalidate("extrato_lancamentos", "contas_receber", "contas_pagar", "saldos_bancarios", "movimentos_realizados", "conciliacao_regras");
    if (ok) notify(`${ok} ${pl(ok, "lançamento", "lançamentos")} ${pl(ok, "conciliado", "conciliados")}`);
    if (erros.length) notify(`${erros.length} não foram: ${[...new Set(erros)].join("; ")}`, "erro");
  }

  const saldos = useMemo(() => Object.fromEntries(bancos.map((b) => {
    const desde = b.saldo_inicial_data;
    const doBanco = lancamentos.filter((l) => l.conta_bancaria_id === b.id && l.data >= desde);
    const extrato = Number(b.saldo_inicial) + doBanco.reduce((s, l) => s + Number(l.valor), 0);
    const recebido = receber.filter((c) => c.conta_bancaria_id === b.id && c.status === "pago" && (c.data_pagamento ?? "") >= desde).reduce((s, c) => s + Number(c.valor_pago ?? c.valor), 0);
    const pago = pagar.filter((c) => c.conta_bancaria_id === b.id && c.status === "pago" && (c.data_pagamento ?? "") >= desde).reduce((s, c) => s + Number(c.valor_pago ?? c.valor), 0);
    const outros = doBanco.filter((l) => l.status === "transferencia" || l.status === "ignorado").reduce((s, l) => s + Number(l.valor), 0);
    const erp = Number(b.saldo_inicial) + recebido - pago + outros;
    const ultArq = importacoes.filter((i) => i.conta_bancaria_id === b.id && i.saldo_final != null)
      .sort((a, c) => (c.saldo_final_data ?? c.created_at).localeCompare(a.saldo_final_data ?? a.created_at))[0];
    // saldo que o banco mandou (Open Finance ou API do Inter) vale se for mais novo que o do último arquivo
    const of = [...conexoes, ...conexoesInter].find((c) => c.conta_bancaria_id === b.id && c.status !== "desligada" && c.saldo != null && c.saldo_em);
    const dataOf = of?.saldo_em ? new Date(new Date(of.saldo_em).getTime() - 3 * 3600_000).toISOString().slice(0, 10) : null;
    const ult = of && dataOf && (!ultArq?.saldo_final_data || dataOf >= ultArq.saldo_final_data)
      ? { saldo_final: of.saldo, saldo_final_data: dataOf } : ultArq;
    // saldo do extrato na data do saldo informado pelo banco, para comparar
    const extratoNaData = ult?.saldo_final_data ? Number(b.saldo_inicial) + doBanco.filter((l) => l.data <= ult.saldo_final_data!).reduce((s, l) => s + Number(l.valor), 0) : null;
    return [b.id, {
      extrato, erp, pendentes: doBanco.filter((l) => l.status === "pendente").length,
      informado: ult ? Number(ult.saldo_final) : null, informadoData: ult?.saldo_final_data ?? null, extratoNaData,
      ultima: importacoes.filter((i) => i.conta_bancaria_id === b.id).sort((a, c) => c.created_at.localeCompare(a.created_at))[0]?.created_at ?? null,
      openFinance: conexoes.some((c) => c.conta_bancaria_id === b.id && c.status !== "desligada"),
      inter: conexoesInter.some((c) => c.conta_bancaria_id === b.id && c.status !== "desligada"),
    }];
  })), [bancos, lancamentos, importacoes, receber, pagar, conexoes, conexoesInter]);

  const nomeConta = (id: string) => contasTodas.find((b) => b.id === id)?.nome ?? "—";
  const vinculo = (l: Lancamento) => {
    if (l.conta_receber_id) { const c = receber.find((x) => x.id === l.conta_receber_id); return c ? `${c.descricao}${c.cliente ? " · " + c.cliente.nome : ""}` : "conta a receber"; }
    if (l.conta_pagar_id) { const c = pagar.find((x) => x.id === l.conta_pagar_id); return c ? `${c.descricao}${c.fornecedor ? " · " + c.fornecedor.nome : ""}` : "conta a pagar"; }
    if (l.par_transferencia_id) { const p = lancamentos.find((x) => x.id === l.par_transferencia_id); return p ? `Transferência ${l.valor < 0 ? "para" : "de"} ${nomeConta(p.conta_bancaria_id)}` : "transferência"; }
    return l.observacao ?? "";
  };

  return (
    <div>
      <PageHeader title="Bancos e conciliação" subtitle="Conecte o banco pelo Open Finance (ou importe o extrato OFX/CSV) e o ERP liga cada entrada e saída à conta certa"
        actions={podeEditar && <>
          <Button variant="secondary" onClick={() => setEditConta({ banco: "unicred", tipo: "corrente", saldo_inicial: 0, saldo_inicial_data: hoje(), ativo: true, unidade_id: unidadePadrao ?? undefined })}><Plus size={16} /> Nova conta</Button>
          <Button variant="secondary" onClick={() => navigate("/configuracoes/bancos")} title="Open Finance, API do Inter e extrato OFX por e-mail"><Zap size={16} /> Extrato automático</Button>
          <Button onClick={() => setImportar(true)} disabled={!bancos.some((b) => b.ativo)}><FileUp size={16} /> Importar extrato</Button>
        </>} />

      <PagamentosAnotados />

      {!bancos.length && (
        <Card className="mb-5 p-5 text-sm text-slate-600">
          <b className="text-fg">Comece cadastrando as contas</b> de cada unidade (ex.: Unicred SC, Nubank SC, InfinitePay SC, Unicred SP) com o saldo do dia em que vai começar a conciliar.
          Depois importe o extrato de cada uma: OFX na Unicred e no Nubank; na InfinitePay, a planilha (CSV) do extrato.
        </Card>
      )}

      {bancos.length > 0 && <PainelBancos bancos={bancos.filter((b) => b.ativo)} lancamentos={lancamentos} saldos={saldos} pendentes={pendentesTotal}
        sugestoes={sugestoes.size} divergentes={divergentes.size} onPendentes={() => { setSituacao("pendente"); setTipo(""); }} />}

      <AvisoContasRepetidas pares={repetidas} nome={nomeConta} onEditar={podeEditar ? (id) => setEditConta(contasTodas.find((b) => b.id === id) ?? null) : undefined} />

      {gruposBancos.map((g) => {
        const ativas = g.contas.filter((b) => b.ativo);
        const total = Math.round(ativas.reduce((t, b) => t + saldos[b.id].extrato, 0) * 100) / 100;
        return (
          <section key={g.id} className="mb-5" aria-label={`Contas de ${nomeUnidade(g.id)}`}>
            {unidades.length > 1 && (
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">
                  {nomeUnidade(g.id)} <span className="font-semibold normal-case tracking-normal text-slate-500">· {ativas.length} {pl(ativas.length, "conta ativa", "contas ativas")}</span>
                </h2>
                <span className="num text-sm text-slate-600">Saldo pelo extrato: <b className="text-fg">{brl(total)}</b></span>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {g.contas.map((b) => {
              const s = saldos[b.id];
              const dif = Math.round((s.extrato - s.erp) * 100) / 100;
              const difBanco = s.informado != null && s.extratoNaData != null ? Math.round((s.informado - s.extratoNaData) * 100) / 100 : 0;
              return (
                <button key={b.id} onClick={() => setContaSel(contaSel === b.id ? "" : b.id)}
                  className={`flex flex-col overflow-hidden rounded-2xl border bg-surface text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-pop ${contaSel === b.id ? "border-brand ring-2 ring-brand/40" : "border-slate-200/80"} ${b.ativo ? "" : "opacity-60"}`}>
                  <div className={`w-full bg-gradient-to-br ${COR_BANCO[b.banco] ?? COR_BANCO.outro} px-4 pb-3 pt-4 text-white`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-bold"><Landmark size={15} className="shrink-0 opacity-80" /> <span className="truncate">{b.nome}</span></div>
                        <div className="text-xs text-white/80">{BANCOS[b.banco] ?? b.banco}{b.numero ? ` · ${b.numero}` : ""}<EtiquetaUnidade id={b.unidade_id} />
                          {b.etiqueta && <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-white/25 px-2 py-0.5 align-middle text-2xs font-bold text-white ring-1 ring-white/50"><UserRound size={11} aria-hidden />{b.etiqueta}</span>}
                        </div>
                      </div>
                      {podeEditar && <span role="button" tabIndex={0} aria-label={`Editar ${b.nome}`} onClick={(e) => { e.stopPropagation(); setEditConta(b); }}
                        className="rounded-md p-1 text-white/80 hover:bg-white/20 hover:text-white"><Pencil size={14} /></span>}
                    </div>
                    <div className="num mt-2 text-2xl font-bold tracking-tight">{brl(s.extrato)}</div>
                    <div className="text-xs text-white/85">saldo pelo extrato · {s.openFinance ? "Open Finance" : s.inter ? "API do Inter" : "importado"}</div>
                  </div>
                  <dl className="w-full flex-1 space-y-0.5 px-4 pb-4 pt-2.5 text-xs">
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">Pelo ERP (baixas)</dt><dd>{brl(s.erp)}</dd></div>
                    <div className={`flex justify-between gap-2 ${dif ? "font-semibold text-amber-700" : "text-emerald-700"}`}><dt>Diferença</dt><dd>{dif ? brl(dif) : "nenhuma ✓"}</dd></div>
                    {s.informado != null && (
                      <div className={`flex justify-between gap-2 ${difBanco ? "font-semibold text-red-600" : "text-slate-500"}`} title="Saldo que o próprio banco informou no arquivo">
                        <dt>Banco em {dataBR(s.informadoData)}</dt><dd>{brl(s.informado)}{difBanco ? " ≠" : " ✓"}</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-2 text-slate-500"><dt>Pendentes</dt><dd className={s.pendentes ? "font-semibold text-amber-700" : ""}>{s.pendentes}</dd></div>
                  </dl>
                </button>
              );
            })}
            </div>
          </section>
        );
      })}

      <ResumoExtrato lancs={doResumo} titulo={contaSel ? nomeConta(contaSel) : "todas as contas"} mes={mes} tipo={tipo}
        onTipo={(t) => { setTipo(t); if (t) setSituacao("todos"); }} onMes={setMes} funcionarios={funcionarios} />

      {/* a mesma barra das outras listas: busca na descrição e, no botão Filtros, conta, tipo e os lançamentos antigos;
          a visão, o mês (que também muda o resumo acima) e o aprovar ficam à vista */}
      <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Buscar na descrição do banco"
        filtros={<>
          <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">Conta</span>
            <select className="input w-auto" value={contaSel} onChange={(e) => setContaSel(e.target.value)}>
              <option value="">Todas as contas</option>
              {bancos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select></label>
          <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">Tipo de lançamento</span>
            <select className="input w-auto" value={tipo} onChange={(e) => setTipo(e.target.value as TipoLanc | "")}>
              <option value="">Todos os tipos</option>
              {TIPOS_LANC.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
            </select></label>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-600" title={`Antes de ${dataBR(INICIO_CONCILIACAO)} os extratos já foram revistos; marque para ver também esses lançamentos`}>
            <input type="checkbox" checked={verAntigos} onChange={(e) => setVerAntigos(e.target.checked)} />
            Ver antes de {dataBR(INICIO_CONCILIACAO)}{antigosPendentes > 0 && ` (${antigosPendentes} pendentes antigos)`}
          </label>
        </>}
        nFiltros={(contaSel ? 1 : 0) + (tipo ? 1 : 0) + (verAntigos ? 1 : 0)}
        onLimpar={() => { setBusca(""); setContaSel(""); setTipo(""); setVerAntigos(false); }}
        direita={<>
          <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Como ver o extrato">
            {([["linhas", "Linha a linha", List], ["favorecido", "Por favorecido", Users]] as const).map(([v, l, I]) => (
              <button key={v} type="button" aria-pressed={visao === v} onClick={() => setVisao(v)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${visao === v ? "bg-surface text-fg shadow-card" : "text-slate-600 hover:text-fg"}`}><I size={15} aria-hidden /> {l}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">Mês <CampoMes value={mes} onChange={setMes} vazio="Todos os meses" rotulo="Mês do extrato" /></div>
        </>} />
      {visao === "linhas" && (
        <ChipsSituacao valor={situacao} onChange={setSituacao} rotulo="Situação" opcoes={([
          ["pendente", "Pendentes"], ["sugestao", "Com sugestão"], ["divergente", "Divergentes"], ["conciliado", "Conciliados"],
          ["transferencia", "Transferências"], ["ignorado", "Ignorados"], ["todos", "Todos"],
        ] as const).map(([v, l]) => ({ value: v as string, label: l, n: semSituacao.filter((x) => naSituacao(x, v)).length }))} />
      )}
      {visao === "linhas" && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {podeEditar && sugeridasNaLista.length > 0 && (
            <Button onClick={() => aprovar(sugeridasNaLista.map((l) => l.id))} disabled={aprovando}><Check size={16} /> {aprovando ? "Aprovando…" : `Aprovar sugestões (${sugeridasNaLista.length})`}</Button>
          )}
          <span className="ml-auto text-sm text-slate-500">{lista.length} {pl(lista.length, "lançamento", "lançamentos")} · entradas {brl(lista.filter((l) => l.valor > 0).reduce((s, l) => s + Number(l.valor), 0))} · saídas {brl(-lista.filter((l) => l.valor < 0).reduce((s, l) => s + Number(l.valor), 0))}</span>
        </div>
      )}

      {visao === "favorecido" ? (
        <PorFavorecido linhas={paraLote} deFora={deFora} regras={regras} nomeConta={nomeConta} podeEditar={podeEditar} />
      ) : <Table empty={!lista.length}
        head={<><th className="th">Data / conta</th><th className="th">Descrição no banco</th><th className="th">Situação</th><th className="th">Ligado a</th><th className="th text-right">Valor</th><th className="th" /></>}>
        {lista.map((l) => (
          <tr key={l.id}>
            <td className="td whitespace-nowrap">{dataBR(l.data)}<div className="text-xs text-slate-500">{nomeConta(l.conta_bancaria_id)}</div></td>
            <td className="td">{l.descricao}{l.documento && <div className="text-xs text-slate-500">doc. {l.documento}</div>}</td>
            <td className="td">
              {l.status === "pendente" && sugestoes.has(l.id) ? <span className="inline-flex rounded-full border border-sky-300 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-800">Sugestão</span>
                : l.status === "pendente" && divergentes.has(l.id) ? <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900" title="Nenhuma conta com este valor e data próxima: lance como receita/despesa, ligue a mano ou ignore">Divergente</span>
                : <Badge value={l.status} />}
            </td>
            <td className="td text-sm text-slate-600">
              {l.status === "pendente" && sugestoes.has(l.id) ? <span className="italic text-sky-800">→ {sugestoes.get(l.id)!.rotulo}</span> : vinculo(l)}
            </td>
            <td className={`td whitespace-nowrap text-right font-semibold ${l.valor < 0 ? "text-red-600" : "text-emerald-700"}`}>{brl(l.valor)}</td>
            <td className="td whitespace-nowrap text-right">
              {podeEditar && l.status === "pendente" && sugestoes.has(l.id) && <Button variant="secondary" className="mr-1" disabled={aprovando} onClick={() => aprovar([l.id])}><Check size={15} /> Aprovar</Button>}
              {podeEditar && l.status === "pendente" && <Button variant={sugestoes.has(l.id) ? "ghost" : "primary"} onClick={() => setTratar(l)}><Link2 size={15} /> {sugestoes.has(l.id) ? "Outra" : "Conciliar"}</Button>}
              {podeEditar && l.status !== "pendente" && <Button variant="ghost" title="Desfazer" onClick={() => setDesfazer(l)}><Undo2 size={15} /></Button>}
            </td>
          </tr>
        ))}
      </Table>}

      {editConta && <ContaBancariaModal conta={editConta} onClose={() => setEditConta(null)} />}
      {importar && <ImportarModal bancos={bancos.filter((b) => b.ativo)} contaInicial={contaSel} onClose={() => setImportar(false)} />}
      {tratar && <TratarModal lanc={tratar} bancos={contasTodas} receber={receber} pagar={pagar} lancamentos={lancamentos} onClose={() => setTratar(null)} />}
      {desfazer && <DesfazerModal lanc={desfazer} onClose={() => setDesfazer(null)} />}
    </div>
  );
}

/* ------------------------------ Painel colorido do topo ------------------------------ */

/** Saldo, entradas e saídas do mês (pelos extratos, sem as transferências entre as contas) e o que falta conciliar. */
function PainelBancos({ bancos, lancamentos, saldos, pendentes, sugestoes, divergentes, onPendentes }: {
  bancos: ContaBancaria[]; lancamentos: Lancamento[]; saldos: Record<string, { extrato: number }>;
  pendentes: number; sugestoes: number; divergentes: number; onPendentes: () => void;
}) {
  const k = useMemo(() => {
    const ids = new Set(bancos.map((b) => b.id));
    const daqui = semRepetidos(lancamentos.filter((l) => ids.has(l.conta_bancaria_id) && l.status !== "transferencia"));
    const internas = transferenciasInternas(daqui);
    const mov = daqui.filter((l) => !internas.has(l.id));
    const mes = hoje().slice(0, 7);
    const meses = Array.from({ length: 6 }, (_, i) => somarMesIso(mes, i - 5));
    const entrou = (m: string) => mov.filter((l) => l.data.startsWith(m) && l.valor > 0).reduce((t, l) => t + Number(l.valor), 0);
    const saiu = (m: string) => mov.filter((l) => l.data.startsWith(m) && l.valor < 0).reduce((t, l) => t - Number(l.valor), 0);
    return {
      entrou: entrou(mes), saiu: saiu(mes), dEntrou: variacao(entrou(mes), entrou(somarMesIso(mes, -1))), dSaiu: variacao(saiu(mes), saiu(somarMesIso(mes, -1))),
      tendEntrou: meses.map(entrou), tendSaiu: meses.map(saiu), meses,
    };
  }, [bancos, lancamentos]);
  const saldo = bancos.reduce((t, b) => t + Number(saldos[b.id]?.extrato ?? 0), 0);
  const resultado = k.entrou - k.saiu;
  const porConta = bancos.map((b) => ({ rotulo: b.nome, valor: Number(saldos[b.id]?.extrato ?? 0) })).sort((a, b) => b.valor - a.valor);
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return (
    <div className="mb-5 space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <CartaoPainel c={{ id: "saldo", rotulo: "Saldo nos bancos", valor: brl(saldo), icone: Landmark, cor: "var(--kpi-azul)", sub: `${bancos.length} ${pl(bancos.length, "conta ativa", "contas ativas")} · pelos extratos` }} />
      <CartaoPainel anterior="mês passado" c={{ id: "entrou", rotulo: "Entrou este mês", valor: brl(k.entrou), icone: ArrowDownCircle, cor: "var(--kpi-verde)", delta: k.dEntrou, tendencia: k.tendEntrou,
        sub: "sem as transferências entre as contas" }} />
      <CartaoPainel anterior="mês passado" c={{ id: "saiu", rotulo: "Saiu este mês", valor: brl(k.saiu), icone: ArrowUpCircle, cor: "var(--kpi-laranja)", delta: k.dSaiu, bomCair: true, tendencia: k.tendSaiu,
        sub: `resultado ${resultado >= 0 ? "+" : "−"} ${brl(Math.abs(resultado))}` }} />
      <CartaoPainel c={{ id: "pend", rotulo: "Para conciliar", valor: pendentes.toLocaleString("pt-BR"), icone: Scale, cor: "var(--kpi-roxo)", onClick: onPendentes,
        sub: pendentes ? `${sugestoes} com sugestão pronta · ${divergentes} sem par` : "tudo conciliado ✓" }} />
    </div>
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <Section title="Entrou × saiu nos últimos 6 meses" className="min-w-0 xl:col-span-3">
        <Colunas altura={220} vazio="Sem extrato nesses meses." dados={k.meses.map((m, i) => ({ rotulo: `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`, valores: [k.tendEntrou[i], k.tendSaiu[i]] }))}
          series={[{ nome: "Entrou", cor: "var(--kpi-verde)" }, { nome: "Saiu", cor: "var(--kpi-laranja)" }]} />
      </Section>
      <Section title="Saldo por conta" className="min-w-0 xl:col-span-2">
        <Ranking cor="var(--kpi-azul)" vazio="Nenhuma conta ativa." itens={porConta.map((c) => ({ rotulo: c.rotulo, valor: Math.max(0, c.valor), detalhe: c.valor < 0 ? `⚠ saldo negativo: ${brl(c.valor)}` : undefined }))} />
      </Section>
    </div>
    </div>
  );
}

/* --------------------------------- Conta bancária --------------------------------- */

export function ContaBancariaModal({ conta, onClose }: { conta: Partial<ContaBancaria>; onClose: () => void }) {
  const [c, setC] = useState(conta);
  const [remetentes, setRemetentes] = useState((conta.extrato_remetentes ?? []).join(", "));
  const save = useSave("contas_bancarias");
  async function salvar(e: FormEvent) {
    e.preventDefault();
    try {
      const lista = [...new Set(remetentes.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
      const invalido = lista.find((x) => !/^(@?[a-z0-9.-]+\.[a-z]{2,}|[^@\s]+@[a-z0-9.-]+\.[a-z]{2,})$/.test(x));
      if (invalido) throw new Error(`"${invalido}" não é um e-mail nem um domínio (ex.: nubank.com.br)`);
      await save.mutateAsync(limpar({ ...c, saldo_inicial: Number(c.saldo_inicial || 0), extrato_remetentes: lista, etiqueta: c.etiqueta?.trim() || null }));
      notify("Conta salva");
      onClose();
    } catch (err) { notifyError(err); }
  }
  return (
    <Modal open onClose={onClose} title={c.id ? "Editar conta bancária" : "Nova conta bancária"}>
      <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><CampoUnidade value={c.unidade_id ?? null} onChange={(v) => setC({ ...c, unidade_id: v ?? undefined })} label="Unidade (CNPJ dono da conta)" /></div>
        <Field label="Banco">
          <select className="input" value={c.banco} onChange={(e) => setC({ ...c, banco: e.target.value, tipo: e.target.value === "caixa" ? "caixa" : e.target.value === "infinitepay" ? "pagamentos" : c.tipo })}>
            {Object.entries(BANCOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Nome (como aparece no ERP)"><input className="input" value={c.nome ?? ""} onChange={(e) => setC({ ...c, nome: e.target.value })} required placeholder="Ex.: Unicred SC" /></Field>
        <Field label="Selo no cartão (opcional)" className="sm:col-span-2">
          <input className="input" value={c.etiqueta ?? ""} maxLength={30} onChange={(e) => setC({ ...c, etiqueta: e.target.value })} placeholder="ex.: de quem é a conta" />
        </Field>
        <Field label="Agência"><input className="input" value={c.agencia ?? ""} onChange={(e) => setC({ ...c, agencia: e.target.value })} /></Field>
        <Field label="Conta"><input className="input" value={c.numero ?? ""} onChange={(e) => setC({ ...c, numero: e.target.value })} placeholder="ajuda a reconhecer o arquivo OFX" /></Field>
        <Field label="Saldo inicial"><input className="input" type="number" step="0.01" value={c.saldo_inicial ?? 0} onChange={(e) => setC({ ...c, saldo_inicial: Number(e.target.value) })} /></Field>
        <Field label="Saldo em (data)"><input className="input" type="date" value={c.saldo_inicial_data ?? ""} onChange={(e) => setC({ ...c, saldo_inicial_data: e.target.value })} required /></Field>
        <p className="text-xs text-slate-500 sm:col-span-2">O saldo inicial é o saldo do banco no fim do dia anterior ao primeiro lançamento que você vai importar.</p>
        <Field label="Extrato por e-mail: remetentes autorizados" className="sm:col-span-2">
          <input className="input" value={remetentes} onChange={(e) => setRemetentes(e.target.value)} placeholder="ex.: nubank.com.br, seu-email@gmail.com" autoComplete="off" />
        </Field>
        <p className="-mt-1 text-xs text-slate-500 sm:col-span-2">
          O extrato (arquivo OFX) que chegar na caixa de e-mail do ERP vindo destes endereços ou domínios entra sozinho, se o número da conta do arquivo
          bater com o campo Conta e o e-mail tiver a assinatura digital do remetente. Os outros ficam esperando você conferir na caixa de e-mail.
        </p>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-5 w-5" checked={c.ativo ?? true} onChange={(e) => setC({ ...c, ativo: e.target.checked })} /> Conta ativa</label>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={save.isPending || !c.unidade_id}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------- Extrato por e-mail ------------------------------- */

export function ExtratoPorEmail({ bancos, importacoes, onEditar }: { bancos: ContaBancaria[]; importacoes: Importacao[]; onEditar: (c: ContaBancaria) => void }) {
  const { data: caixas = [] } = useRows<{ id: string; email: string }>("email_contas", { select: "id, email" });
  const ligadas = bancos.filter((b) => b.ativo && (b.extrato_remetentes ?? []).length > 0);
  const ultima = (id: string) => importacoes.filter((i) => i.conta_bancaria_id === id && i.email_id).sort((a, c) => c.created_at.localeCompare(a.created_at))[0];
  return (
    <Card className="mb-5 p-4">
      <h2 className="flex items-center gap-2 font-semibold"><Mail size={17} aria-hidden className="text-slate-500" /> Extrato por e-mail</h2>
      <p className="mt-1 text-sm text-slate-600">
        Mande ou encaminhe o extrato em <b>OFX</b> para {caixas.length ? caixas.map((c) => <b key={c.id} className="break-all">{c.email} </b>) : <b>a caixa de e-mail do ERP</b>}
        e ele entra sozinho em até 5 minutos. No Nubank: extrato → exportar → OFX (vai para o seu e-mail; crie um filtro que encaminhe para cá).
      </p>
      {!caixas.length && <p className="mt-1 text-sm text-amber-700">Ligue primeiro a caixa de e-mail em Configurações → Caixa de e-mail.</p>}
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {bancos.filter((b) => b.ativo && b.banco !== "caixa").map((b) => {
          const u = ultima(b.id);
          const ligada = ligadas.includes(b);
          return (
            <li key={b.id} className={`flex items-start justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${ligada ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200"}`}>
              <span className="min-w-0">
                <b className="block truncate">{b.nome}</b>
                <span className="block text-xs text-slate-600">
                  {ligada ? `de: ${(b.extrato_remetentes ?? []).join(", ")}` : "nenhum remetente autorizado"}
                  {ligada && !b.numero ? " · falta o número da conta" : ""}
                </span>
                {u && <span className="block text-xs text-emerald-800">último pelo e-mail: {dataBR(u.created_at)}{u.periodo_fim ? ` (até ${dataBR(u.periodo_fim)})` : ""}</span>}
              </span>
              <button type="button" onClick={() => onEditar(b)} className="shrink-0 text-xs font-semibold text-brand hover:underline">{ligada ? "Alterar" : "Ligar"}</button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ------------------------------------ Importar ------------------------------------ */

export function ImportarModal({ bancos, contaInicial, arquivoInicial, onImportado, onClose }: {
  bancos: ContaBancaria[]; contaInicial: string; onClose: () => void;
  /** arquivo já escolhido (ex.: anexo de um e-mail) */
  arquivoInicial?: File;
  onImportado?: (r: { novas: number; repetidas: number; conciliadas: number; conta: string }) => void;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [res, setRes] = useState<ResultadoExtrato | null>(null);
  const [mapa, setMapa] = useState<MapaCsv | null>(null);
  const [conta, setConta] = useState(contaInicial || bancos[0]?.id || "");
  const [ocupado, setOcupado] = useState(false);
  const invalidate = useInvalidate();
  const linhas: LinhaExtrato[] = res?.csv && mapa ? linhasCsv(res.csv.registros, mapa) : res?.linhas ?? [];
  useEffect(() => { if (arquivoInicial) escolher(arquivoInicial); }, [arquivoInicial]); // eslint-disable-line react-hooks/exhaustive-deps
  // o mesmo arquivo já entrou em outra conta? (importar de novo em outra conta duplica entradas, saídas e saldo)
  const [jaEm, setJaEm] = useState<{ conta: string; iguais: number; amostra: number }[]>([]);
  const chaveAmostra = linhas.slice(0, 80).map((l) => l.identificador).join("|");
  useEffect(() => {
    const ids = chaveAmostra ? chaveAmostra.split("|") : [];
    if (!ids.length || !conta) { setJaEm([]); return; }
    let vivo = true;
    supabase.from("extrato_lancamentos").select("conta_bancaria_id").in("identificador", ids).neq("conta_bancaria_id", conta).limit(1000)
      .then(({ data }) => {
        if (!vivo) return;
        const m = new Map<string, number>();
        for (const r of (data ?? []) as { conta_bancaria_id: string }[]) m.set(r.conta_bancaria_id, (m.get(r.conta_bancaria_id) ?? 0) + 1);
        setJaEm([...m].filter(([, n]) => n >= Math.min(5, ids.length)).map(([c, iguais]) => ({ conta: c, iguais, amostra: ids.length })));
      });
    return () => { vivo = false; };
  }, [chaveAmostra, conta]);

  async function escolher(f: File | null) {
    setArquivo(f); setRes(null); setMapa(null);
    if (!f) return;
    try {
      const r = await lerExtrato(f);
      setRes(r);
      if (r.csv) setMapa(r.csv.mapa);
      // reconhece a conta pelo número que vem no OFX
      const n = digitos(r.conta);
      const achou = n && bancos.find((b) => digitos(b.numero) && (n.endsWith(digitos(b.numero)) || digitos(b.numero).endsWith(n)));
      if (achou) setConta(achou.id);
      else if (bancos.some((b) => b.nome.trim().length >= 3 && f.name.toLowerCase().includes(b.nome.trim().toLowerCase()))) setConta(bancos.find((b) => b.nome.trim().length >= 3 && f.name.toLowerCase().includes(b.nome.trim().toLowerCase()))!.id); // ex.: "extrato-olist.ofx" → conta OLIST
      else if (/infinite/i.test(f.name)) setConta(bancos.find((b) => b.banco === "infinitepay")?.id ?? conta);
      else if (/nu(bank)?[_-]/i.test(f.name)) setConta(bancos.find((b) => b.banco === "nubank")?.id ?? conta);
    } catch (e) { notifyError(e); }
  }

  async function enviar() {
    if (!res || !linhas.length) return;
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc("importar_extrato", {
        p_conta: conta, p_arquivo: arquivo?.name ?? null, p_formato: res.formato, p_linhas: linhas,
        p_saldo_final: res.saldoFinal ?? null, p_saldo_data: res.saldoData ?? null,
      });
      if (error) throw error;
      notify(`${data.novas} ${pl(data.novas, "lançamento", "lançamentos")} novos${data.repetidas ? `, ${data.repetidas} já importados antes` : ""}; ${data.conciliadas} ${pl(data.conciliadas, "conciliado", "conciliados")} automaticamente`);
      invalidate("extrato_lancamentos", "extrato_importacoes", "contas_receber", "contas_pagar", "auditoria");
      onImportado?.({ novas: data.novas, repetidas: data.repetidas, conciliadas: data.conciliadas, conta });
      onClose();
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  const colunas = res?.csv?.cabecalho ?? [];
  const sel = (rotulo: string, chave: Exclude<keyof MapaCsv, "descricao">) => (
    <Field label={rotulo}>
      <select className="input" value={mapa?.[chave] ?? -1} onChange={(e) => setMapa({ ...mapa!, [chave]: Number(e.target.value) })}>
        <option value={-1}>—</option>
        {colunas.map((c, i) => <option key={i} value={i}>{c || `coluna ${i + 1}`}</option>)}
      </select>
    </Field>
  );
  const entradas = linhas.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0);
  const saidas = linhas.filter((l) => l.valor < 0).reduce((s, l) => s + l.valor, 0);
  const datas = linhas.map((l) => l.data).sort();

  return (
    <Modal open onClose={onClose} title="Importar extrato bancário" wide>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Arquivo do banco (.ofx ou .csv)">
            {arquivoInicial ? <div className="input truncate bg-slate-50">{arquivoInicial.name}</div>
              : <input className="input" type="file" accept=".ofx,.OFX,.csv,.CSV,.txt" onChange={(e) => escolher(e.target.files?.[0] ?? null)} />}
          </Field>
          <Field label="Conta">
            <select className="input" value={conta} onChange={(e) => setConta(e.target.value)}>
              {bancos.map((b) => <option key={b.id} value={b.id}>{b.nome} ({BANCOS[b.banco] ?? b.banco})</option>)}
            </select>
          </Field>
        </div>
        <p className="text-xs text-slate-500">
          <b>Unicred:</b> extrato → exportar → OFX (Money). <b>Nubank:</b> extrato → exportar → OFX. <b>InfinitePay:</b> extrato → baixar planilha (CSV).
          Pode importar o mesmo período de novo: o que já entrou é ignorado.
        </p>

        {res?.csv && mapa && (
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 text-sm font-semibold">Colunas da planilha <span className="font-normal text-slate-500">(confira; o ERP tentou adivinhar)</span></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {sel("Data", "data")}{sel("Valor (com sinal)", "valor")}{sel("Entradas", "entrada")}{sel("Saídas", "saida")}{sel("Tipo (crédito/débito)", "tipo")}
            </div>
            <Field label="Descrição (uma ou mais colunas)" className="mt-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {colunas.map((c, i) => (
                  <label key={i} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={mapa.descricao.includes(i)} onChange={(e) => setMapa({ ...mapa, descricao: e.target.checked ? [...mapa.descricao, i] : mapa.descricao.filter((x) => x !== i) })} />
                    {c || `coluna ${i + 1}`}
                  </label>
                ))}
              </div>
            </Field>
          </div>
        )}

        {jaEm.map((j) => (
          <div key={j.conta} role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <b>Este extrato já foi importado na conta “{bancos.find((b) => b.id === j.conta)?.nome ?? "outra conta"}”</b> ({j.iguais} de {j.amostra} lançamentos conferidos são iguais).
            Importar aqui também duplica entradas, saídas e saldo. Confira a conta escolhida acima.
          </div>
        ))}

        {res && (
          linhas.length ? (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><div className="text-xs text-slate-500">Lançamentos</div><b>{linhas.length}</b></div>
                <div><div className="text-xs text-slate-500">Período</div><b>{dataBR(datas[0])} a {dataBR(datas[datas.length - 1])}</b></div>
                <div><div className="text-xs text-slate-500">Entradas / saídas</div><b className="text-emerald-700">{brl(entradas)}</b> / <b className="text-red-600">{brl(-saidas)}</b></div>
                {res.saldoFinal != null && <div><div className="text-xs text-slate-500">Saldo do banco em {dataBR(res.saldoData)}</div><b>{brl(res.saldoFinal)}</b></div>}
              </div>
              <div className="max-h-56 overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {linhas.slice(0, 50).map((l) => (
                      <tr key={l.identificador}><td className="whitespace-nowrap px-3 py-1.5">{dataBR(l.data)}</td><td className="px-3 py-1.5">{l.descricao}</td>
                        <td className={`whitespace-nowrap px-3 py-1.5 text-right ${l.valor < 0 ? "text-red-600" : "text-emerald-700"}`}>{brl(l.valor)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : <p className="text-sm text-red-600">Não encontrei lançamentos neste arquivo. {res.csv ? "Confira as colunas de data e valor acima." : "Confira se é o extrato em OFX."}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={enviar} variant={jaEm.length ? "secondary" : "primary"} disabled={!linhas.length || !conta || ocupado}><FileUp size={16} /> {ocupado ? "Importando…" : `${jaEm.length ? "Importar mesmo assim" : "Importar"} ${linhas.length || ""} ${pl(linhas.length || "", "lançamento", "lançamentos")}`}</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------- Tratar uma linha pendente do extrato ------------------------- */

const palavras = (s: string) => new Set(s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));

function TratarModal({ lanc, bancos, receber, pagar, lancamentos, onClose }: {
  lanc: Lancamento; bancos: ContaBancaria[]; receber: Conta[]; pagar: Conta[]; lancamentos: Lancamento[]; onClose: () => void;
}) {
  const entrada = lanc.valor > 0;
  const unidade = bancos.find((b) => b.id === lanc.conta_bancaria_id)?.unidade_id;
  const [modo, setModo] = useState<"conta" | "lancar" | "transferencia" | "ignorar">("conta");
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState(entrada ? "outras receitas" : "tarifas bancárias");
  const [descricao, setDescricao] = useState(lanc.descricao ?? "");
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const invalidate = useInvalidate();

  const ligadas = new Set(lancamentos.filter((l) => l.status === "conciliado").map((l) => (entrada ? l.conta_receber_id : l.conta_pagar_id)));
  const pw = palavras(lanc.descricao ?? "");
  const candidatas = (entrada ? receber : pagar)
    .filter((c) => c.status !== "cancelado" && !ligadas.has(c.id) && (!unidade || c.unidade_id === unidade))
    .filter((c) => c.status === "aberto" || !c.conta_bancaria_id || c.conta_bancaria_id === lanc.conta_bancaria_id)
    .map((c) => {
      const valor = Number(c.status === "pago" ? c.valor_pago ?? c.valor : c.valor);
      const ref = c.status === "pago" ? c.data_pagamento ?? c.vencimento : c.vencimento;
      const dias = Math.abs((Date.parse(ref) - Date.parse(lanc.data)) / 864e5);
      const nome = `${c.descricao} ${c.cliente?.nome ?? ""} ${c.fornecedor?.nome ?? ""}`;
      const comuns = [...palavras(nome)].filter((w) => pw.has(w)).length;
      const pontos = (Math.abs(valor - Math.abs(lanc.valor)) < 0.01 ? 100 : 0) + Math.max(0, 30 - dias) + comuns * 15;
      return { c, valor, ref, pontos, nome };
    })
    // já baixadas: só as de até 30 dias da data do banco (as antigas não são deste lançamento)
    .filter((x) => x.c.status === "aberto" || Math.abs((Date.parse(x.ref) - Date.parse(lanc.data)) / 864e5) <= 30 || !!busca)
    .filter((x) => !busca || x.nome.toLowerCase().includes(busca.toLowerCase()) || String(x.valor).includes(busca.replace(",", ".")))
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, 12);

  const pares = lancamentos.filter((l) => l.status === "pendente" && l.conta_bancaria_id !== lanc.conta_bancaria_id && Math.abs(Number(l.valor) + Number(lanc.valor)) < 0.01);

  async function rodar(fn: () => PromiseLike<{ error: any }>, ok: string) {
    setOcupado(true);
    const { error } = await fn();
    setOcupado(false);
    if (error) return notifyError(error);
    notify(ok);
    invalidate("extrato_lancamentos", "contas_receber", "contas_pagar", "auditoria");
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Conciliar lançamento do banco" wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3">
        <div><div className="text-sm font-semibold text-fg">{lanc.descricao}</div><div className="text-xs text-slate-500">{dataBR(lanc.data)} · {bancos.find((b) => b.id === lanc.conta_bancaria_id)?.nome}</div></div>
        <div className={`text-lg font-bold ${entrada ? "text-emerald-700" : "text-red-600"}`}>{brl(lanc.valor)}</div>
      </div>
      <div className="mb-4 flex flex-wrap gap-1">
        {([["conta", entrada ? "É uma conta a receber" : "É uma conta a pagar", Link2], ["lancar", entrada ? "Lançar como receita" : "Lançar como despesa (tarifa, juros…)", Receipt],
          ["transferencia", "Transferência entre contas", ArrowLeftRight], ["ignorar", "Ignorar", Ban]] as const).map(([v, l, I]) => (
          <button key={v} type="button" onClick={() => setModo(v)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${modo === v ? "bg-brand text-brand-fg" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}><I size={14} /> {l}</button>
        ))}
      </div>

      {modo === "conta" && (
        <div className="space-y-2">
          <input className="input" placeholder="Buscar por nome, descrição ou valor…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          {!candidatas.length && <p className="text-sm text-slate-500">Nenhuma conta {entrada ? "a receber" : "a pagar"} desta unidade encontrada. Use "Lançar como {entrada ? "receita" : "despesa"}".</p>}
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {candidatas.map(({ c, valor, ref, pontos }) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-fg">{c.descricao}{pontos >= 100 && <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-2xs font-bold text-emerald-700">mesmo valor</span>}</div>
                  <div className="text-xs text-slate-500">{c.cliente?.nome ?? c.fornecedor?.nome ?? "—"} · {c.status === "pago" ? `baixada em ${dataBR(ref)}` : `vence ${dataBR(ref)}`}</div>
                </div>
                <div className="text-sm font-semibold">{brl(valor)}</div>
                <Button disabled={ocupado} onClick={() => rodar(() => supabase.rpc("conciliar_lancamento", { p_lanc: lanc.id, p_tipo: entrada ? "receber" : "pagar", p_conta: c.id }),
                  c.status === "aberto" ? "Conciliado e baixado com a data do banco" : "Conciliado")}><Check size={15} /> Ligar</Button>
              </li>
            ))}
          </ul>
          {candidatas.some(({ valor }) => Math.abs(valor - Math.abs(lanc.valor)) >= 0.01) && <p className="text-xs text-slate-500">Se o valor for diferente (juros, desconto), a baixa fica com o valor que entrou no banco.</p>}
        </div>
      )}

      {modo === "lancar" && (
        <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); rodar(() => supabase.rpc("lancar_do_extrato", { p_lanc: lanc.id, p_categoria: categoria, p_descricao: descricao }), `${entrada ? "Receita" : "Despesa"} lançada e conciliada`); }}>
          <Field label="Descrição"><input className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} required /></Field>
          <CampoCategoria tipo={entrada ? "receita" : "despesa"} value={categoria} onChange={setCategoria} />
          <p className="text-xs text-slate-500 sm:col-span-2">Cria a conta já paga em {dataBR(lanc.data)}, nesta conta bancária, e entra no resultado (DRE).</p>
          <div className="flex justify-end sm:col-span-2"><Button disabled={ocupado}><Receipt size={15} /> Lançar</Button></div>
        </form>
      )}

      {modo === "transferencia" && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">Dinheiro que só mudou de conta (ex.: Unicred → Nubank). Não é receita nem despesa. Escolha a linha correspondente na outra conta:</p>
          {!pares.length && <p className="text-sm text-slate-500">Nenhuma linha pendente de {brl(-lanc.valor)} nas outras contas. Importe o extrato da outra conta primeiro.</p>}
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {pares.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1 text-sm"><b>{bancos.find((b) => b.id === p.conta_bancaria_id)?.nome}</b> · {dataBR(p.data)} · {p.descricao}</div>
                <div className="text-sm font-semibold">{brl(p.valor)}</div>
                <Button disabled={ocupado} onClick={() => rodar(() => supabase.rpc("marcar_transferencia", { p_lanc: lanc.id, p_par: p.id }), "Transferência entre contas registrada")}><ArrowLeftRight size={15} /> Ligar</Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {modo === "ignorar" && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); rodar(() => supabase.rpc("ignorar_lancamento", { p_lanc: lanc.id, p_motivo: motivo }), "Lançamento ignorado"); }}>
          <p className="text-sm text-slate-600">Use só para o que não é receita nem despesa da empresa (aplicação e resgate, estorno do próprio banco). O motivo fica registrado.</p>
          <Field label="Motivo"><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} placeholder="Ex.: aplicação automática" /></Field>
          <div className="flex justify-end"><Button variant="secondary" disabled={ocupado}><Ban size={15} /> Ignorar</Button></div>
        </form>
      )}
    </Modal>
  );
}

function DesfazerModal({ lanc, onClose }: { lanc: Lancamento; onClose: () => void }) {
  const [motivo, setMotivo] = useState("");
  const invalidate = useInvalidate();
  async function confirmar(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc("desfazer_conciliacao", { p_lanc: lanc.id, p_motivo: motivo });
    if (error) return notifyError(error);
    notify("Conciliação desfeita");
    invalidate("extrato_lancamentos", "contas_receber", "contas_pagar", "auditoria");
    onClose();
  }
  return (
    <Modal open onClose={onClose} title="Desfazer conciliação">
      <form onSubmit={confirmar} className="space-y-3">
        <p className="text-sm text-slate-600">
          A linha de {brl(lanc.valor)} volta a ficar pendente.{lanc.baixou_conta && " Como a baixa da conta foi feita por esta conciliação, a conta volta a ficar em aberto."}
        </p>
        <Field label="Motivo"><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} autoFocus /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button variant="danger"><Undo2 size={15} /> Desfazer</Button>
        </div>
      </form>
    </Modal>
  );
}
