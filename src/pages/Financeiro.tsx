import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { type Destaque, lerDestaque } from "@/lib/destaque";
import { FaixaDestaque } from "@/components/FaixaDestaque";
import { Ban, Barcode, CalendarClock, Check, CheckCheck, ClipboardCheck, Copy, Eye, FileDown, Handshake, Link2, MessageCircle, Pencil, Plus, Printer, Repeat, RotateCcw, ScanBarcode, Send, Tags, Undo2, Users, Wallet } from "lucide-react";
import { Badge, BotaoAtalho, Button, COR_ATALHO, Field, Modal, PageHeader, Table, Tabs } from "@/components/ui";
import { CartaoConta, ListaContas } from "@/components/financeiro/CartaoConta";
import { limpar, useInvalidate, useRows, useSave, semUnificados } from "@/lib/data";
import { useUnidade, EtiquetaUnidade, CampoUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje, situacaoConta, somarDias, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import type { Cliente } from "@/lib/types";
import { usePerfil } from "@/lib/auth";
import { useConfig } from "@/lib/useConfig";
import { comUnidade, pdfFinanceiro } from "@/lib/pdf";
import { baixarPlanilha, celula } from "@/lib/exportar";
import { PdfViewer } from "@/components/PdfViewer";
import { Anexos } from "@/components/Anexos";
import { Historico } from "@/components/Historico";
import { BaixaModal } from "@/components/financeiro/BaixaModal";
import { VisaoGeral } from "@/components/financeiro/VisaoGeral";
import { CampoCategoria, CampoRateio, rateioOk } from "@/components/financeiro/CategoriaRateio";
import { ContasFixas } from "@/components/financeiro/ContasFixas";
import { DreComExtratos } from "@/components/financeiro/Dre";
import { PlanoContas } from "@/components/financeiro/PlanoContas";
import { Cobranca } from "@/components/financeiro/Cobranca";
import { BotaoRecibo, Recibos, reciboDePagar, reciboDeReceber } from "@/components/financeiro/Recibos";
import { pixDaConta } from "@/lib/cobranca";
import type { LancDre, Rateio } from "@/lib/dre";
import { BarraLote, ModalAgendar, ModalNaoPagar, PagarLoteModal, useProgramar } from "@/components/financeiro/DecisaoPagamento";
import { ChipRenegociada, HistoricoNegociacao, ModalRenegociar, PainelRenegociadas } from "@/components/financeiro/Renegociacao";
import { PrestarContas, SeloAdiantamento, useGastosAdiantamento } from "@/components/financeiro/Adiantamento";
import { PagarPixInter } from "@/components/financeiro/PixInter";
import { ehAdiantamento, gastosParaDre } from "@/lib/adiantamento";
import { useAprovarPagar } from "@/components/financeiro/AprovarPagar";
import { ChipTipo } from "@/components/financeiro/ResumoPagar";
import { ORDEM_TIPOS, raizCnpj, TIPOS_PAGAR, tipoPagar, type TipoPagar } from "@/lib/tiposPagar";
import { noCartao, noEstado, resumoAgora, type CartaoAgora, type EstadoLista, type RegrasAgora } from "@/lib/agoraContas";
import { CartoesAgora, EscolhaEstado, FaixaCartao } from "@/components/financeiro/AgoraContas";
import type { ContaRevisao } from "@/lib/aprovacao";
import { aguardaAprovacao, contaParada, COR_TOM, diaDoPagamento, naVisaoPagar, paraPagarHoje, passoPagar, situacaoPagar, type Decisao, type VisaoPagar } from "@/lib/programacao";
import { BarraFiltros, ChipsSituacao, RodapeLista } from "@/components/filtros/BarraFiltros";
import { noPeriodo, noPeriodoOuPendente, rotuloPeriodo, SEM_PERIODO, semanaAtual, temPeriodo, type Periodo } from "@/lib/filtroLista";
import { MenuAcoes } from "@/components/MenuAcoes";
import { AvisoGolpe } from "@/components/fornecedores/Golpe";
import { ChipRevisao } from "@/components/financeiro/Revisao";
import { CampoBoleto, ConferirBoletoModal } from "@/components/financeiro/Boleto";
import { ClienteBusca } from "@/components/ClienteBusca";
import { LinkPagamentoModal, SituacaoLink, type CobrancaLink } from "@/components/financeiro/LinkPagamento";
import { BoletoInterModal, SituacaoBoleto, boletoAberto, type BoletoInter } from "@/components/financeiro/BoletoInter";
import { AplicarMarcadores, BotaoMarcadores, ChipsMarcadores, SelectMarcador, useMarcadores } from "@/components/nfe/Marcadores";
import { buscaDaAba, useAbaUrl } from "@/lib/abaUrl";
import { filtroRecentesPagar, inicioRecentes, periodoPedeHistorico } from "@/lib/pagarRecentes";
import { useFormasPagamento } from "@/lib/formasPagamento";
import { CAMPOS_DATA, competenciaDe, dataDaConta, MAX_VEZES, MODOS_COMPETENCIA, modoDaCompetencia, OCORRENCIAS, ORIGENS, rotuloOrigem, serieContas, termosOrigem,
  type CampoData, type CodigoOrigem, type ModoCompetencia, type Ocorrencia, type OrigemConta } from "@/lib/pagarTiny";

type Receber = {
  id: string; descricao: string; cliente_id: string | null; valor: number; vencimento: string; status: string;
  forma_pagamento: string; data_pagamento: string | null; valor_pago: number | null; unidade_id?: string | null;
  conta_bancaria_id?: string | null; motivo_alteracao?: string | null; cliente?: Cliente | null;
  categoria?: string; rateio?: Rateio; competencia?: string | null; recorrente_id?: string | null;
};
type Pagar = ContaRevisao & {
  id: string; descricao: string; fornecedor_id: string | null; categoria: string; documento: string | null;
  valor: number; vencimento: string; status: string; data_pagamento: string | null; valor_pago: number | null;
  observacoes: string | null; conta_bancaria_id?: string | null; motivo_alteracao?: string | null;
  fornecedor?: { nome: string; cnpj?: string | null; bloqueado?: boolean | null; bloqueio_motivo?: string | null } | null;
  rateio?: Rateio; competencia?: string | null; recorrente_id?: string | null; unidade_id?: string | null;
  decisao?: Decisao | null; pagar_em?: string | null; decisao_motivo?: string | null; decisao_por_nome?: string | null; decisao_em?: string | null;
  linha_digitavel?: string | null; boleto_multa_pct?: number | null; boleto_juros_mes_pct?: number | null; boleto_juros_dia?: number | null;
  emissao?: string | null; forma_pagamento_id?: string | null; chave_pix?: string | null; created_at?: string | null;
  negociacao_id?: string | null; negociacao_papel?: string | null;
};
type ContaBancaria = { id: string; nome: string; unidade_id: string; ativo: boolean };
type Fornecedor = {
  id: string; nome: string; nome_fantasia?: string | null; cnpj?: string | null; municipio?: string | null; uf?: string | null;
  chave_pix?: string | null; bloqueado?: boolean; bloqueio_motivo?: string | null;
};

/** Mudou valor ou vencimento de uma conta já lançada: pede o motivo (fica no histórico). */
const precisaMotivo = (orig: { valor: number; vencimento: string } | undefined, nova: { valor?: number; vencimento?: string }) =>
  !!orig && (Number(orig.valor) !== Number(nova.valor) || orig.vencimento !== nova.vencimento);

/** "2026-10-01" → "10/2026" */
const mesAno = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Nome e descrição iguais (sem contar maiúsculas e espaços): o cartão mostra uma vez só. */
const mesmoTexto = (a: string | null | undefined, b: string | null | undefined) => {
  const n = (t: string | null | undefined) => (t ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return n(a) === n(b);
};

const FILTROS = [
  { value: "pendentes", label: "Em aberto" },
  { value: "vencido", label: "Vencidas" },
  { value: "pago", label: "Pagas" },
  { value: "todos", label: "Todas" },
];

const SELECT_PAGAR = "*, fornecedor:fornecedores(nome, cnpj, bloqueado, bloqueio_motivo)";
/** Só o que as contas a receber, a cobrança, o recibo e a busca de cliente usam (o cadastro inteiro passa de 5 MB). */
const CAMPOS_CLIENTE_CONTA = "id, codigo, nome, nome_fantasia, cpf_cnpj, municipio, uf, email, telefone, telefone_adicional, whatsapp, portal_token, portal_link";


export default function Financeiro() {
  const { pode, papel, tem } = usePerfil();
  const veContasPagar = pode("contas_pagar") || papel === "contador";
  const [aba, setAba] = useAbaUrl<"visao" | "receber" | "pagar" | "cobranca" | "recibos" | "fixas" | "dre" | "plano">("visao", ["visao", "receber", "pagar", "cobranca", "recibos", "fixas", "dre", "plano"] as const);
  const veCobranca = tem("financeiro", "vendas");
  // "+ Conta a pagar" do menu: abre a aba e o formulário da conta nova
  const location = useLocation();
  const navigate = useNavigate();
  const [novaAoAbrir, setNovaAoAbrir] = useState(false);
  const [tipoInicial, setTipoInicial] = useState<TipoPagar | "">("");
  // vindo do painel pessoal ("Lançar na MF"): a conta nova já preenchida, para conferir e salvar
  const [contaInicial, setContaInicial] = useState<Partial<Pagar> | null>(null);
  // vindo do Analista fiscal: contas a pagar só com as contas apontadas
  const [destaque, setDestaque] = useState<Destaque | null>(null);
  // a aba "Contas fixas" agora é um extra de Contas a pagar (links antigos com ?aba=fixas vão para lá)
  const [visaoInicial, setVisaoInicial] = useState<VisaoPagar | null>(null);
  useEffect(() => {
    if (aba !== "fixas") return;
    setVisaoInicial("fixas");
    setAba("pagar");
  }, [aba]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const st = location.state as { aba?: typeof aba; nova?: boolean; tipo?: TipoPagar; inicial?: Partial<Pagar> } | null;
    const d = lerDestaque(location.state);
    if (d) setDestaque(d);
    if (st?.aba) {
      // aba que o perfil não vê (contas a pagar, cobrança) vira contas a receber, em vez de ficar sem aba marcada
      const nova = (st.aba === "pagar" && !veContasPagar) || (st.aba === "cobranca" && !veCobranca) ? "receber" : st.aba;
      setNovaAoAbrir(!!st.nova);
      setTipoInicial(st.tipo ?? "");
      setContaInicial(st.inicial ?? null);
      navigate({ pathname: location.pathname, search: buscaDaAba(nova, "visao") }, { replace: true, state: null });
    }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const { filtrar } = useUnidade();
  const { data: receberTodos = [], isLoading: carregandoReceber } = useRows<Receber>("contas_receber", { select: `*, cliente:clientes(${CAMPOS_CLIENTE_CONTA})` });
  // a lista filtrada só muda quando muda a unidade ou os dados (senão as contas abaixo refazem a cada tecla)
  const receber = useMemo(() => filtrar(receberTodos), [receberTodos, filtrar]);
  // contas a pagar: primeiro as recentes (rápido); o histórico inteiro só quando a tela pede (e fica guardado)
  const corte = inicioRecentes(hoje());
  const [pedeHistorico, setPedeHistorico] = useState(false);
  const historico = pedeHistorico || aba === "dre" || aba === "plano" || !!destaque;
  const recentes = useRows<Pagar>("contas_pagar", { select: SELECT_PAGAR, key: ["recentes", corte], filtro: filtroRecentesPagar(corte) });
  const completo = useRows<Pagar>("contas_pagar", { select: SELECT_PAGAR, enabled: historico });
  const pagarTodos = useMemo(() => completo.data ?? recentes.data ?? [], [completo.data, recentes.data]);
  const esperandoHistorico = historico && !completo.data;
  const carregandoPagar = recentes.isLoading || esperandoHistorico;
  const pagar = useMemo(() => filtrar(pagarTodos), [pagarTodos, filtrar]);

  const paraVisao = useMemo(() => ({
    receber: receber.map((c) => ({ ...c, terceiro: c.cliente ? c.cliente.nome_fantasia?.trim() || c.cliente.nome : null })),
    pagar: pagar.map((c) => ({ ...c, terceiro: c.fornecedor?.nome ?? null })),
  }), [receber, pagar]);
  // adiantamento para funcionário: a conta fica fora do DRE (transferência) e entram os gastos da prestação de contas
  const { data: gastosAdiant = [] } = useGastosAdiantamento();
  const paraDre = useMemo<LancDre[]>(() => [
    ...receber.map((c) => ({ ...c, tipo: "receber" as const })),
    ...pagar.map((c) => ({ ...c, tipo: "pagar" as const })),
    ...gastosParaDre(gastosAdiant, pagar),
  ], [receber, pagar, gastosAdiant]);
  // DRE: todas as unidades (ele mesmo separa SC, SP e o consolidado)
  const paraDreTodas = useMemo<LancDre[]>(() => [
    ...receberTodos.map((c) => ({ ...c, tipo: "receber" as const })),
    ...pagarTodos.map((c) => ({ ...c, tipo: "pagar" as const })),
    ...gastosParaDre(gastosAdiant, pagarTodos),
  ], [receberTodos, pagarTodos, gastosAdiant]);

  return (
    <div>
      <PageHeader title="Contas a pagar e receber" />
      <Tabs value={aba} onChange={setAba} options={[
        { value: "visao", label: "Visão geral" }, { value: "receber", label: "Contas a receber" },
        ...(veContasPagar ? [{ value: "pagar" as const, label: "Contas a pagar" }] : []),
        ...(veCobranca ? [{ value: "cobranca" as const, label: "Cobrança" }] : []),
        { value: "recibos" as const, label: "Recibos" },
        ...(veContasPagar ? [{ value: "dre" as const, label: "DRE" }, { value: "plano" as const, label: "Plano de contas" }] : []),
      ]} />
      {aba === "cobranca" && veCobranca ? <Cobranca contas={receber} />
        : aba === "recibos" ? <Recibos />
        : (aba === "dre" || aba === "plano") && veContasPagar && esperandoHistorico ? <p className="py-10 text-center text-sm text-slate-500">Carregando o histórico das contas…</p>
        : aba === "dre" && veContasPagar ? <DreComExtratos lancamentos={paraDreTodas} />
        : aba === "plano" && veContasPagar ? <PlanoContas lancamentos={paraDre} />
        : aba === "visao" ? (
        <VisaoGeral receber={paraVisao.receber} pagar={veContasPagar ? paraVisao.pagar : []} vePagar={veContasPagar}
          veSaldo={tem("financeiro", "contador")} podeBaixar={pode("editar_financeiro")} />
      ) : (
        <>
          {/* os números do topo ficam nos cartões de cada tela (pedido de 26/10): sem a fileira repetida aqui */}
          {(aba === "pagar" || aba === "fixas") && veContasPagar ? <ContasPagar key={destaque?.titulo ?? ""} contas={destaque ? pagar.filter((c) => destaque.ids.includes(c.id)) : pagar} novaAoAbrir={novaAoAbrir} contaInicial={contaInicial} onNovaAberta={() => { setNovaAoAbrir(false); setContaInicial(null); }}
            tipoInicial={tipoInicial} destaque={destaque} onLimparDestaque={() => setDestaque(null)} carregando={carregandoPagar}
            visaoInicial={visaoInicial} onVisaoAplicada={() => setVisaoInicial(null)} corte={corte} onPedeHistorico={() => setPedeHistorico(true)} /> : <ContasReceber contas={receber} carregando={carregandoReceber} />}
        </>
      )}
    </div>
  );
}


/* ------------------------- Imprimir e exportar a lista ------------------------- */

type LinhaRel = { vencimento: string; descricao: string; terceiro: string; status: string; data_pagamento: string | null; valor: number; valor_pago: number | null; unidade_id?: string | null };

function useRelatorio(tipo: "receber" | "pagar", filtro: string, mes: string, rotuloFiltro?: string) {
  const { data: cfg } = useConfig();
  const { nome, atual, unidades } = useUnidade();
  const [pdf, setPdf] = useState<Blob | null>(null);
  const titulo = tipo === "receber" ? "Contas a receber" : "Contas a pagar";
  const terceiro = tipo === "receber" ? "Cliente" : "Fornecedor";
  const filtros = () => [
    ...(rotuloFiltro ? [rotuloFiltro] : [FILTROS.find((f) => f.value === filtro)?.label, mes ? `vencimento em ${mes.split("-").reverse().join("/")}` : "todos os meses"]),
    atual ? nome(atual) : "todas as unidades",
  ].join(" · ");

  async function imprimir(lista: LinhaRel[], agrupar = false) {
    if (!cfg) return;
    try {
      setPdf(await pdfFinanceiro({
        titulo, terceiro, agrupar, filtros: [filtros(), agrupar && `agrupado por ${terceiro.toLowerCase()}`].filter(Boolean).join(" · "),
        linhas: lista.map((c) => ({ vencimento: c.vencimento, descricao: c.descricao, terceiro: c.terceiro, situacao: situacaoConta(c.status, c.vencimento),
          pagamento: c.data_pagamento, valor: Number(c.valor), pago: c.valor_pago == null ? null : Number(c.valor_pago) })),
      }, comUnidade(cfg, unidades.find((u) => u.id === atual))));
    } catch (e) { notifyError(e); }
  }
  function exportar(lista: LinhaRel[], extra: (c: any) => Record<string, unknown> = () => ({})) {
    const SIT: Record<string, string> = { aberto: "Em aberto", vencido: "Vencida", pago: "Paga", cancelado: "Cancelada" };
    baixarPlanilha(tipo === "receber" ? "contas-a-receber" : "contas-a-pagar", [{ nome: titulo, linhas: lista.map((c) => ({
      Vencimento: celula(c.vencimento), Descrição: c.descricao, [terceiro]: c.terceiro, ...extra(c),
      Situação: SIT[situacaoConta(c.status, c.vencimento)] ?? c.status, Valor: Number(c.valor),
      "Pago em": celula(c.data_pagamento), "Valor pago": c.valor_pago == null ? "" : Number(c.valor_pago), Unidade: nome(c.unidade_id ?? null),
    })) }]).catch(notifyError);
  }
  const visor = pdf && <PdfViewer blob={pdf} nome={`${tipo === "receber" ? "contas-a-receber" : "contas-a-pagar"}${mes ? `-${mes}` : ""}.pdf`} titulo={titulo} onClose={() => setPdf(null)} />;
  return { imprimir, exportar, visor };
}

/* ----------------------------- Contas a receber ----------------------------- */

function ContasReceber({ contas, carregando = false }: { contas: Receber[]; carregando?: boolean }) {
  const { data: cfgRecibo } = useConfig();
  const { padrao, unidades } = useUnidade();
  const { pode } = usePerfil();
  const podeEditar = pode("editar_financeiro");
  const navigate = useNavigate();
  // mesma cara das contas a pagar (pedido de 26/10): cartões do que fazer agora e a lista em aberto, recebida ou toda
  const [cartao, setCartao] = useState<CartaoAgora | null>(null);
  const [estado, setEstado] = useState<EstadoLista>("aberto");
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>(() => semanaAtual(hoje()));
  const [nova, setNova] = useState<Partial<Receber> | null>(null);
  const [baixa, setBaixa] = useState<{ conta: Receber; tabela: "contas_receber" } | null>(null);
  const [motivo, setMotivo] = useState<{ conta: Receber; acao: "cancelar" | "estornar" } | null>(null);
  const [linkDe, setLinkDe] = useState<Receber | null>(null);
  const [boletoDe, setBoletoDe] = useState<Receber | null>(null);
  const { data: boletos = [] } = useRows<BoletoInter>("boletos_inter");
  const boletosDa = useMemo(() => {
    const m = new Map<string, BoletoInter[]>();
    for (const b of boletos) if (b.conta_receber_id) m.set(b.conta_receber_id, [...(m.get(b.conta_receber_id) ?? []), b]);
    return m;
  }, [boletos]);
  // unidades com conta do Inter que emite boleto (o botão Boleto só aparece nelas)
  const { data: unidadesBoleto = [] } = useQuery({
    queryKey: ["inter_conexoes", "unidades_boleto"], staleTime: 300_000,
    queryFn: async () => ((await supabase.rpc("unidades_com_boleto_inter")).data ?? []) as string[],
  });
  const temBoleto = (c: Receber) => unidadesBoleto.includes(c.unidade_id ?? "") || (boletosDa.get(c.id)?.length ?? 0) > 0;
  const { data: marcadores = [] } = useMarcadores();
  const { data: links = [] } = useRows<CobrancaLink>("cobrancas_link");
  const linksDa = useMemo(() => {
    const m = new Map<string, CobrancaLink[]>();
    for (const l of links) if (l.conta_receber_id) m.set(l.conta_receber_id, [...(m.get(l.conta_receber_id) ?? []), l]);
    return m;
  }, [links]);
  // link do pedido (várias parcelas num link só): aparece na situação de cada parcela do pedido
  const linksPedido = useMemo(() => {
    const m = new Map<string, CobrancaLink[]>();
    for (const l of links) if (l.pedido_id && !l.conta_receber_id) m.set(l.pedido_id, [...(m.get(l.pedido_id) ?? []), l]);
    return m;
  }, [links]);
  const contaBanco = useNomeContaBancaria();
  const { data: clientes = [] } = useRows<Cliente>("clientes", { select: CAMPOS_CLIENTE_CONTA, order: "nome", ascending: true, key: ["contas"] });
  const save = useSave("contas_receber");
  const invalidate = useInvalidate();
  const dia = hoje();
  const termo = busca.trim().toLowerCase();
  const semPeriodo = useMemo(() => contas.filter((c) => !termo
    || [c.descricao, c.cliente?.nome, c.cliente?.nome_fantasia, c.forma_pagamento, c.categoria].some((t) => (t ?? "").toLowerCase().includes(termo))), [contas, termo]);
  const regras: RegrasAgora<Receber> = { decidir: (c) => (c as any).revisao === "em_revisao" };
  const resumo = useMemo(() => resumoAgora(semPeriodo, dia, regras), [semPeriodo, dia]); // eslint-disable-line react-hooks/exhaustive-deps
  const lista = useMemo(() => (cartao ? semPeriodo.filter((c) => noCartao(c, cartao, dia, regras))
    : semPeriodo.filter((c) => noEstado(c, estado) && noPeriodoOuPendente(c.vencimento, periodo, c.status === "aberto")))
    .sort((a, b) => !cartao && estado === "pagas" ? (b.data_pagamento ?? "").localeCompare(a.data_pagamento ?? "") : a.vencimento.localeCompare(b.vencimento)),
  [semPeriodo, cartao, estado, periodo, dia]); // eslint-disable-line react-hooks/exhaustive-deps
  const rotuloLista = cartao ? { vencidas: "Vencidas", hoje: "Hoje", semana: "Esta semana", decidir: "Para decidir" }[cartao]
    : [{ aberto: "Em aberto", pagas: "Recebidas", todas: "Todas" }[estado], temPeriodo(periodo) ? `vencimento ${rotuloPeriodo(periodo, dia).toLowerCase()}` : ""].filter(Boolean).join(" · ");
  const rel = useRelatorio("receber", "todos", "", [rotuloLista, termo && `busca "${busca.trim()}"`].filter(Boolean).join(" · "));
  const paraRel = () => lista.map((c) => ({ ...c, terceiro: c.cliente?.nome ?? "" }));

  const copiar = (texto: string, o: string) => navigator.clipboard.writeText(texto).then(() => notify(`${o} copiado`));

  const pagamentoDe = (c: Receber) => unidades.find((u) => u.id === c.unidade_id)?.instrucoes_pagamento ?? "";
  const mensagemCobranca = (c: Receber) => {
    const u = unidades.find((x) => x.id === c.unidade_id);
    const pix = pixDaConta(u, Number(c.valor), c.id);
    return [
      `Olá ${c.cliente?.nome.split(" ")[0] ?? ""}! Segue a cobrança da *MF Máquinas*:`,
      `${c.descricao}`,
      `Valor: ${brl(c.valor)} · Vencimento: ${dataBR(c.vencimento)}`,
      pix ? `\n*Pix copia e cola:*\n${pix}` : "",
      pagamentoDe(c) ? `\n*Como pagar:*\n${pagamentoDe(c)}` : "",
      c.cliente?.portal_token ? `\nSuas contas e a segunda via: ${window.location.origin}/cliente/${c.cliente.portal_link || c.cliente.portal_token}` : "",
    ].filter(Boolean).join("\n");
  };

  const somenteVer = !!nova?.id && (!podeEditar || nova.status !== "aberto");

  async function salvarNova(e: FormEvent) {
    e.preventDefault();
    try {
      const { cliente: _c, ...row } = nova as any;
      if (!rateioOk(row.rateio)) return notify("Os centros de custo precisam somar 100%", "erro");
      if (!precisaMotivo(contas.find((c) => c.id === row.id), row)) delete row.motivo_alteracao;
      await save.mutateAsync(limpar({ ...row, valor: Number(row.valor) }));
      notify(row.id ? "Conta salva" : "Conta lançada");
      setNova(null);
    } catch (err) {
      notifyError(err);
    }
  }

  return (
    <>
      {rel.visor}
      <CartoesAgora resumo={resumo} ativo={cartao} onEscolher={setCartao} />
      <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Buscar cliente, descrição ou forma de pagamento…"
        periodo={cartao ? undefined : periodo} onPeriodo={cartao ? undefined : setPeriodo} rotuloData="Vencimento"
        onLimpar={() => { setBusca(""); setPeriodo(SEM_PERIODO); }}
        direita={<>
          {!cartao && <EscolhaEstado valor={estado} onMudar={setEstado} rotuloPagas="Recebidas" />}
          <span className="flex flex-1 justify-end gap-2 sm:flex-none">
          <MenuAcoes texto="Mais" rotulo="Mais opções" itens={[
            { rotulo: "Imprimir a lista", icone: Printer, onClick: () => rel.imprimir(paraRel()) },
            { rotulo: "Exportar para Excel", icone: FileDown, onClick: () => rel.exportar(paraRel(), (c) => ({ Forma: c.forma_pagamento })) },
            { rotulo: "Aprovações", icone: ClipboardCheck, onClick: () => navigate("/aprovacoes") },
          ]} />
          {podeEditar && <Button onClick={() => setNova({ forma_pagamento: "boleto", vencimento: somarDias(3), descricao: "", unidade_id: padrao, categoria: "vendas", rateio: [] } as any)}><Plus size={16} /> Nova conta</Button>}
          </span>
        </>} />
      {cartao && <FaixaCartao cartao={cartao} onLimpar={() => setCartao(null)} />}
      <ListaContas vazia={!carregando && lista.length === 0}>
        {lista.map((c) => {
          const s = situacaoConta(c.status, c.vencimento);
          const links = [...(linksDa.get(c.id) ?? []), ...(((c as any).pedido_id && linksPedido.get((c as any).pedido_id)) || [])];
          const nomeCliente = c.cliente ? c.cliente.nome_fantasia?.trim() || c.cliente.nome : null;
          return (
            <CartaoConta key={c.id} titulo={nomeCliente || c.descricao} descricao={mesmoTexto(nomeCliente || c.descricao, c.descricao) ? null : c.descricao} unidadeId={(c as any).unidade_id}
              detalhe={<>{[c.forma_pagamento, c.conta_bancaria_id && contaBanco(c.conta_bancaria_id)].filter(Boolean).join(" · ")}<SituacaoLink links={links} /><SituacaoBoleto boletos={boletosDa.get(c.id) ?? []} /></>}
              valor={c.valor} vencimento={c.vencimento} status={c.status} pagoEm={c.data_pagamento}
              situacao={<>{s !== "aberto" && <Badge value={s} />}<ChipRevisao conta={c as any} /><ChipsMarcadores ids={(c as any).marcadores} todos={marcadores} pequeno /></>}
              acoes={<>
                <BotaoMarcadores tabela="contas_receber" registro={c as any} nome={["conta a receber", "contas a receber"]} />
                {c.status === "aberto" && c.cliente?.whatsapp && (
                  <BotaoAtalho icon={MessageCircle} label="Cobrar" cor={COR_ATALHO.verde} href={whatsappLink(c.cliente.whatsapp, mensagemCobranca(c))} title="Enviar cobrança no WhatsApp" />
                )}
                {c.status === "aberto" && (
                  <BotaoAtalho icon={Link2} label={linksDa.get(c.id)?.some((l) => l.status === "aberto") ? "Link enviado" : "Link"} cor={COR_ATALHO.azul}
                    title="Link de pagamento (Pix ou cartão em até 12x)" onClick={() => setLinkDe(c)} />
                )}
                {temBoleto(c) && (c.status === "aberto" || (boletosDa.get(c.id)?.length ?? 0) > 0) && (
                  <BotaoAtalho icon={Barcode} label={boletosDa.get(c.id)?.some(boletoAberto) ? "Boleto emitido" : "Boleto"} cor={COR_ATALHO.laranja}
                    title="Boleto com Pix do Banco Inter (baixa sozinha quando o cliente paga)" onClick={() => setBoletoDe(c)} />
                )}
                {c.status === "aberto" && pagamentoDe(c) && <BotaoAtalho icon={Copy} label="Copiar" cor={COR_ATALHO.cinza} title="Copiar dados para pagamento" onClick={() => copiar(pagamentoDe(c), "Dados para pagamento")} />}
                {podeEditar && c.status === "aberto" && <BotaoAtalho icon={Wallet} label="Baixa" cor={COR_ATALHO.laranja} title="Registrar o recebimento" onClick={() => setBaixa({ conta: c, tabela: "contas_receber" })} />}
                {c.status === "pago" && <BotaoRecibo atalho contaId={c.id} tipo="receber" montar={() => reciboDeReceber(c, unidades.find((u) => u.id === c.unidade_id), cfgRecibo)} />}
                {podeEditar && c.status === "pago" && <BotaoAtalho icon={Undo2} label="Estornar" cor={COR_ATALHO.rosa} title="Estornar a baixa (volta a ficar em aberto)" onClick={() => setMotivo({ conta: c, acao: "estornar" })} />}
                {podeEditar && c.status === "aberto"
                  ? <BotaoAtalho icon={Pencil} label="Editar" cor={COR_ATALHO.roxo} onClick={() => setNova({ ...c, __antes: c } as any)} />
                  : <BotaoAtalho icon={Eye} label="Ver" cor={COR_ATALHO.roxo} onClick={() => setNova({ ...c, __antes: c } as any)} />}
              </>} />
          );
        })}
      </ListaContas>
      <div className="hidden md:block">
      <Table
        empty={!carregando && lista.length === 0}
        head={<><th className="th">Vencimento</th><th className="th">Descrição</th><th className="th">Cliente</th><th className="th">Situação</th><th className="th text-right">Valor</th><th className="th" /></>}
      >
        {lista.map((c) => {
          const s = situacaoConta(c.status, c.vencimento);
          return (
            <tr key={c.id}>
              <td className="td whitespace-nowrap">{dataBR(c.vencimento)}</td>
              <td className="td">{c.descricao}<EtiquetaUnidade id={(c as any).unidade_id} /><div className="text-xs text-slate-500">{c.forma_pagamento}{c.data_pagamento && ` · pago em ${dataBR(c.data_pagamento)}`}{c.conta_bancaria_id && ` · ${contaBanco(c.conta_bancaria_id)}`}<SituacaoLink links={[...(linksDa.get(c.id) ?? []), ...(((c as any).pedido_id && linksPedido.get((c as any).pedido_id)) || [])]} /><SituacaoBoleto boletos={boletosDa.get(c.id) ?? []} /></div></td>
              <td className="td">{c.cliente?.nome ?? "—"}</td>
              <td className="td"><span className="flex flex-wrap items-center gap-1"><Badge value={s} /><ChipRevisao conta={c as any} /><ChipsMarcadores ids={(c as any).marcadores} todos={marcadores} pequeno /></span></td>
              <td className="td text-right font-medium">{brl(c.valor)}</td>
              <td className="td">
                <div className="flex flex-wrap justify-end gap-1">
                  <BotaoMarcadores tabela="contas_receber" registro={c as any} nome={["conta a receber", "contas a receber"]} />
                  {c.status === "aberto" && pagamentoDe(c) && <Button variant="ghost" title="Copiar dados para pagamento" onClick={() => copiar(pagamentoDe(c), "Dados para pagamento")}><Copy size={15} /></Button>}
                  {c.status === "aberto" && c.cliente?.whatsapp && (
                    <a href={whatsappLink(c.cliente.whatsapp, mensagemCobranca(c))} target="_blank" rel="noreferrer" title="Enviar cobrança no WhatsApp"
                      className="inline-flex items-center rounded-md px-2 py-2 text-green-700 hover:bg-green-50"><MessageCircle size={16} /></a>
                  )}
                  {c.status === "aberto" && (
                    <Button variant="ghost" title="Link de pagamento (Pix ou cartão em até 12x)" onClick={() => setLinkDe(c)}
                      className={linksDa.get(c.id)?.some((l) => l.status === "aberto") ? "!text-sky-700" : ""}><Link2 size={15} /></Button>
                  )}
                  {temBoleto(c) && (c.status === "aberto" || (boletosDa.get(c.id)?.length ?? 0) > 0) && (
                    <Button variant="ghost" title="Boleto com Pix do Banco Inter" onClick={() => setBoletoDe(c)}
                      className={boletosDa.get(c.id)?.some(boletoAberto) ? "!text-orange-700" : ""}><Barcode size={15} /></Button>
                  )}
                  {podeEditar && c.status === "aberto" && <Button variant="ghost" onClick={() => setBaixa({ conta: c, tabela: "contas_receber" })}>Baixar</Button>}
                  {c.status === "pago" && <BotaoRecibo contaId={c.id} tipo="receber" montar={() => reciboDeReceber(c, unidades.find((u) => u.id === c.unidade_id), cfgRecibo)} />}
                  {podeEditar && c.status === "pago" && <Button variant="ghost" title="Estornar a baixa (volta a ficar em aberto)" onClick={() => setMotivo({ conta: c, acao: "estornar" })}><Undo2 size={15} /></Button>}
                  <Button variant="secondary" onClick={() => setNova({ ...c, __antes: c } as any)}>{podeEditar && c.status === "aberto" ? <><Pencil size={15} /> Editar</> : <><Eye size={15} /> Ver</>}</Button>
                </div>
              </td>
            </tr>
          );
        })}
      </Table>
      </div>

      <Modal open={!!nova} onClose={() => setNova(null)}
        title={!nova?.id ? "Nova conta a receber" : somenteVer ? "Conta a receber" : "Editar conta a receber"}>
        {nova && (
          <form onSubmit={salvarNova} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {nova.id && (
              <div className="flex flex-wrap items-center gap-2 text-sm sm:col-span-2">
                <Badge value={situacaoConta(nova.status!, nova.vencimento!)} />
                {nova.data_pagamento && <span className="text-slate-500">pago em {dataBR(nova.data_pagamento)} · {brl(nova.valor_pago)}</span>}
              </div>
            )}
            <fieldset disabled={somenteVer} className="contents">
            <div className="sm:col-span-2"><CampoUnidade value={(nova as any).unidade_id} disabled={!!nova.id} onChange={(v) => setNova({ ...nova, unidade_id: v } as any)} label="Unidade que recebe" /></div>
            <Field label="Descrição" className="sm:col-span-2"><input className="input" value={nova.descricao ?? ""} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} required /></Field>
            <Field label="Cliente" className="sm:col-span-2">
              <ClienteBusca clientes={clientes} value={nova.cliente_id} disabled={somenteVer} required={nova.forma_pagamento === "boleto"}
                onChange={(id) => setNova({ ...nova, cliente_id: id || null })} />
            </Field>
            <Field label="Valor"><input className="input" type="number" step="0.01" min={0.01} value={nova.valor ?? ""} onChange={(e) => setNova({ ...nova, valor: Number(e.target.value) })} required /></Field>
            <Field label="Vencimento"><input className="input" type="date" value={nova.vencimento} onChange={(e) => setNova({ ...nova, vencimento: e.target.value })} required /></Field>
            <Field label="Forma" className="sm:col-span-2">
              <select className="input" value={nova.forma_pagamento} onChange={(e) => setNova({ ...nova, forma_pagamento: e.target.value })}>
                <option value="boleto">Boleto</option><option value="pix">Pix</option><option value="cartao">Cartão</option>
                <option value="transferencia">Transferência</option><option value="dinheiro">Dinheiro</option>
              </select>
            </Field>
            <CampoCategoria tipo="receita" value={nova.categoria} onChange={(v) => setNova({ ...nova, categoria: v })} className="sm:col-span-2" />
            <div className="sm:col-span-2"><CampoRateio value={nova.rateio} disabled={somenteVer} onChange={(v) => setNova({ ...nova, rateio: v })} /></div>
            {nova.recorrente_id && <p className="text-xs text-slate-500 sm:col-span-2">Lançada pela conta fixa (Contas a pagar → Contas fixas).</p>}
            {precisaMotivo(contas.find((c) => c.id === nova.id), nova) && (
              <Field label="Motivo da alteração de valor/vencimento (fica no histórico)" className="sm:col-span-2">
                <input className="input" value={nova.motivo_alteracao ?? ""} onChange={(e) => setNova({ ...nova, motivo_alteracao: e.target.value })} required minLength={3} placeholder="Ex.: cliente pediu prorrogação por e-mail" />
              </Field>
            )}
            </fieldset>
            <div className="sm:col-span-2"><Anexos entidade="conta_receber" id={nova?.id} /></div>
            <div className="sm:col-span-2"><Historico tabela="contas_receber" id={nova?.id} /></div>
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
              {podeEditar && nova.id && nova.status === "aberto" && (
                <Button type="button" variant="ghost" className="mr-auto text-red-600" onClick={() => { setMotivo({ conta: nova as Receber, acao: "cancelar" }); setNova(null); }}><Ban size={15} /> Cancelar conta</Button>
              )}
              <Button type="button" variant="secondary" onClick={() => setNova(null)}>{somenteVer ? "Fechar" : "Cancelar"}</Button>
              {!somenteVer && <Button disabled={save.isPending}>Salvar</Button>}
            </div>
          </form>
        )}
      </Modal>

      {baixa && <BaixaModal conta={baixa.conta} tabela={baixa.tabela} onClose={() => setBaixa(null)} />}
      {linkDe && <LinkPagamentoModal conta={contas.find((x) => x.id === linkDe.id) ?? linkDe} links={linksDa.get(linkDe.id) ?? []}
        taxas={(unidades.find((u) => u.id === linkDe.unidade_id) ?? unidades.find((u) => u.matriz))?.infinitepay_taxas} onClose={() => setLinkDe(null)} />}
      {boletoDe && <BoletoInterModal conta={contas.find((x) => x.id === boletoDe.id) ?? boletoDe} boletos={boletosDa.get(boletoDe.id) ?? []} onClose={() => setBoletoDe(null)} />}
      {motivo && <MotivoModal conta={motivo.conta} acao={motivo.acao} tabela="contas_receber" onClose={() => setMotivo(null)} />}
    </>
  );
}

/* ------------------------------ Contas a pagar ------------------------------ */

function ContasPagar({ contas, novaAoAbrir = false, contaInicial, onNovaAberta, tipoInicial = "", destaque, onLimparDestaque, carregando = false, visaoInicial, onVisaoAplicada, corte, onPedeHistorico }: {
  contas: Pagar[]; novaAoAbrir?: boolean; contaInicial?: Partial<Pagar> | null; onNovaAberta?: () => void; tipoInicial?: TipoPagar | ""; destaque?: Destaque | null; onLimparDestaque?: () => void; carregando?: boolean;
  visaoInicial?: VisaoPagar | null; onVisaoAplicada?: () => void; corte: string; onPedeHistorico: () => void;
}) {
  const { padrao, unidades, filtrar: filtrarUnidade } = useUnidade();
  const { pode } = usePerfil();
  const podeDecidir = pode("editar_financeiro");
  const { data: cfgRecibo } = useConfig();
  const navigate = useNavigate();
  // pedido de 26/10 (a tela estava confusa): no topo os cartões do que fazer agora (vencidas, hoje, esta semana e para
  // decidir); embaixo a lista em aberto, paga ou toda, com o período no chip. Renegociadas e contas fixas ficam no "Mais"
  const [cartao, setCartao] = useState<CartaoAgora | null>(null);
  const [estado, setEstado] = useState<EstadoLista>(destaque ? "todas" : "aberto");
  const [especial, setEspecial] = useState<"renegociadas" | "fixas" | null>(null);
  // quem abre a tela já numa visão (painel, Configurações → Contas fixas) cai no cartão ou na lista equivalente
  const aplicarVisao = (v: VisaoPagar) => {
    setCartao(v === "decidir" ? "decidir" : v === "hoje" ? "hoje" : v === "atrasadas" ? "vencidas" : null);
    setEspecial(v === "renegociadas" || v === "fixas" ? v : null);
    setEstado(v === "pagas" ? "pagas" : v === "todas" ? "todas" : "aberto");
  };
  useEffect(() => { if (visaoInicial) { aplicarVisao(visaoInicial); onVisaoAplicada?.(); } }, [visaoInicial]); // eslint-disable-line react-hooks/exhaustive-deps
  // renegociação: o acordo (contas marcadas ou uma só) e o histórico da negociação
  const [renegociar, setRenegociar] = useState<Pagar[] | null>(null);
  const [prestar, setPrestar] = useState<Pagar | null>(null);
  const [pixInter, setPixInter] = useState<Pagar | null>(null);
  const [negociacao, setNegociacao] = useState<string | null>(null);
  // tipo da conta (transportadora, fornecedor, folha…): a transportadora pelo CNPJ do cadastro de transportadoras
  const [tipo, setTipo] = useState<TipoPagar | "">(tipoInicial);
  useEffect(() => { if (tipoInicial) setTipo(tipoInicial); }, [tipoInicial]);
  const { data: transportadoras = [] } = useRows<{ id: string; cnpj: string | null }>("transportadoras", { select: "id, cnpj", order: "nome", ascending: true, key: ["cnpj"] });
  const tipos = useMemo(() => {
    const raizes = new Set(transportadoras.map((t) => raizCnpj(t.cnpj)).filter(Boolean));
    return new Map(contas.map((c) => [c.id, tipoPagar(c, raizes)]));
  }, [contas, transportadoras]);
  const tipoDe = (c: Pagar) => tipos.get(c.id) ?? "outros";
  const aprov = useAprovarPagar(contas, tipoDe);
  const [busca, setBusca] = useState("");
  // abre na semana; conta em aberto de antes (vencida) continua aparecendo
  const [periodo, setPeriodo] = useState<Periodo>(() => (destaque ? SEM_PERIODO : semanaAtual(hoje())));
  // período antes das contas recentes (ou sem começo): busca o histórico inteiro
  useEffect(() => { if (periodoPedeHistorico(periodo, corte)) onPedeHistorico(); }, [periodo, corte]); // eslint-disable-line react-hooks/exhaustive-deps
  // como no Tiny: o período pode ser pelo vencimento, pela emissão, pelo pagamento ou pela competência
  const [campoData, setCampoData] = useState<CampoData>("vencimento");
  const rotuloCampo = CAMPOS_DATA.find((x) => x.v === campoData)?.rotulo ?? "Vencimento";
  const [categoria, setCategoria] = useState("");
  const [marcador, setMarcador] = useState("");
  // de onde veio a conta (nota de fornecedor, ordem de compra, CT-e, frete, conta fixa, extrato…), com os números para a busca
  const [origemF, setOrigemF] = useState<CodigoOrigem | "">("");
  const { data: origensLista = [] } = useRows<OrigemConta>("contas_pagar_origem", { order: "id", ascending: true });
  const origens = useMemo(() => new Map(origensLista.map((o) => [o.id, o])), [origensLista]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const { data: marcadores = [] } = useMarcadores();
  const [lotePagarHoje, setLotePagarHoje] = useState(false);
  const dia = hoje();
  const [editando, setEditando] = useState<Partial<Pagar> | null>(null);
  const [baixa, setBaixa] = useState<Pagar | null>(null);
  const [baixaCom, setBaixaCom] = useState<{ valor: number; data: string } | null>(null);
  const [boleto, setBoleto] = useState<Pagar | null>(null);
  const [motivo, setMotivo] = useState<{ conta: Pagar; acao: "cancelar" | "estornar" } | null>(null);
  const contaBanco = useNomeContaBancaria();
  const { data: fornecedoresTodos = [] } = useRows<Fornecedor>("fornecedores", { order: "nome", ascending: true });
  const fornecedores = semUnificados(fornecedoresTodos);
  // a busca do fornecedor por nome, fantasia, CNPJ ou cidade (a "lupa" do Tiny), com o aviso de golpe no nome
  const fornecedoresBusca = useMemo(() => fornecedores.map((f) => ({ ...f, nome: f.bloqueado ? `⛔ ${f.nome} (golpe: não pagar)` : f.nome, cpf_cnpj: f.cnpj ?? null })), [fornecedores]);
  const { data: formasTodas = [] } = useFormasPagamento();
  const formasPagar = formasTodas.filter((f) => f.ativo && f.uso !== "receber");
  const nomeForma = (id: string | null | undefined) => (id ? formasTodas.find((f) => f.id === id)?.nome ?? null : null);
  const save = useSave("contas_pagar", ["contas_pagar_origem"]);
  const invalidar = useInvalidate();
  // conta nova: uma só ou uma série (parcelada, semanal, mensal…); competência pelo vencimento, mês anterior, emissão ou escolhida
  const [serie, setSerie] = useState<{ ocorrencia: Ocorrencia; vezes: number; modo: ModoCompetencia; mes: string; mexeu: boolean }>({ ocorrencia: "unica", vezes: 2, modo: "vencimento", mes: "", mexeu: false });
  const [gravandoSerie, setGravandoSerie] = useState(false);
  // conta já lançada leva a foto de quando abriu (__antes): ao salvar vai só o que mudou, com a versão (sincronização)
  const abrirConta = (c: Partial<Pagar>) => {
    setEditando(c.id ? ({ ...c, __antes: c } as any) : c);
    setSerie({ ocorrencia: "unica", vezes: 2, modo: c.vencimento ? modoDaCompetencia(c.competencia, c.vencimento, c.emissao) : "vencimento", mes: (c.competencia ?? "").slice(0, 7), mexeu: false });
  };
  // a forma de pagamento da conta ou "pagar por Pix à vista" (conta fixa) vira a forma de pagamento do recibo
  const formaDaObs = (obs: string | null) => /pagar por ([^·]+)/.exec(obs ?? "")?.[1]?.trim() ?? null;
  useEffect(() => {
    if (!novaAoAbrir) return;
    abrirConta({ categoria: "fornecedores", vencimento: hoje(), descricao: "", unidade_id: padrao, rateio: [], ...contaInicial } as any);
    onNovaAberta?.();
  }, [novaAoAbrir]); // eslint-disable-line react-hooks/exhaustive-deps

  const termo = busca.trim().toLowerCase();
  // busca como no Tiny: nº do documento, fornecedor, histórico (descrição e observações), nº da NF de entrada e da OC
  // busca e filtros valem para tudo; o período só para a lista (os cartões olham todas as contas em aberto)
  const semPeriodo = useMemo(() => contas.filter((c) => {
    const o = origens.get(c.id);
    return (!termo || [c.descricao, c.fornecedor?.nome, c.fornecedor?.cnpj, c.documento, c.categoria, c.observacoes, ...termosOrigem(o)].some((t) => (t ?? "").toLowerCase().includes(termo)))
      && (!categoria || c.categoria === categoria) && (!marcador || ((c as any).marcadores ?? []).includes(marcador))
      && (!origemF || (o?.origem ?? "outro") === origemF) && (!tipo || tipos.get(c.id) === tipo);
  }), [contas, termo, categoria, marcador, origens, origemF, tipo, tipos]);
  const base = useMemo(() => semPeriodo.filter((c) => noPeriodoOuPendente(dataDaConta(c, campoData, origens.get(c.id)), periodo, c.status === "aberto")),
    [semPeriodo, periodo, campoData, origens]);
  const origensUsadas = useMemo(() => {
    const n = new Map<CodigoOrigem, number>();
    for (const c of contas) { const k = origens.get(c.id)?.origem ?? "outro"; n.set(k, (n.get(k) ?? 0) + 1); }
    return (Object.keys(ORIGENS) as CodigoOrigem[]).filter((k) => n.has(k)).map((k) => ({ k, n: n.get(k)! }));
  }, [contas, origens]);
  const regras: RegrasAgora<Pagar> = { dia: diaDoPagamento, parada: contaParada, decidir: (c) => passoPagar(c, dia) === "decidir" };
  const resumo = useMemo(() => resumoAgora(semPeriodo, dia, regras), [semPeriodo, dia]); // eslint-disable-line react-hooks/exhaustive-deps
  const lista = useMemo(() => (especial === "fixas" ? base.filter((c) => naVisaoPagar(c, "fixas", dia))
    : cartao ? semPeriodo.filter((c) => noCartao(c, cartao, dia, regras))
    : base.filter((c) => noEstado(c, estado)))
    .sort((a, b) => !cartao && estado === "pagas" ? (b.data_pagamento ?? "").localeCompare(a.data_pagamento ?? "") : diaDoPagamento(a).localeCompare(diaDoPagamento(b))),
  [base, semPeriodo, cartao, estado, especial, dia]); // eslint-disable-line react-hooks/exhaustive-deps
  const nFixas = contas.filter((c) => naVisaoPagar(c, "fixas", dia)).length;
  // renegociadas: quantos acordos em andamento (não quantas contas)
  const { data: negociacoes = [] } = useRows<{ id: string; situacao: string; unidade_id: string | null }>("pagar_negociacoes", { order: "created_at", ascending: false });
  const negAndamento = filtrarUnidade(negociacoes).filter((n) => n.situacao === "negociando" || n.situacao === "acordo").length;
  const categorias = [...new Set(contas.map((c) => c.categoria).filter(Boolean))].sort();
  const pagarHoje = paraPagarHoje(contas, dia);
  const marcadas = contas.filter((c) => sel.has(c.id));
  const abertasVisiveis = lista.filter((c) => c.status === "aberto");
  const todasMarcadas = abertasVisiveis.length > 0 && abertasVisiveis.every((c) => sel.has(c.id));
  const marcar = (id: string) => setSel((s0) => { const s1 = new Set(s0); if (s1.has(id)) s1.delete(id); else s1.add(id); return s1; });
  const marcarTodas = () => setSel(todasMarcadas ? new Set() : new Set(abertasVisiveis.map((c) => c.id)));
  const somaDe = (l: Pagar[]) => l.reduce((s0, c) => s0 + Number(c.valor), 0);
  const rotuloVisao = especial === "fixas" ? "Contas fixas" : cartao ? { vencidas: "Vencidas", hoje: "Hoje", semana: "Esta semana", decidir: "Para decidir" }[cartao]
    : { aberto: "Em aberto", pagas: "Pagas", todas: "Todas" }[estado];
  const rel = useRelatorio("pagar", "todos", "", [rotuloVisao, temPeriodo(periodo) ? `${rotuloCampo.toLowerCase()} ${rotuloPeriodo(periodo, dia).toLowerCase()}` : "",
    origemF && `origem: ${ORIGENS[origemF].rotulo.toLowerCase()}`, termo && `busca "${busca.trim()}"`].filter(Boolean).join(" · "));
  const paraRel = () => lista.map((c) => ({ ...c, terceiro: c.fornecedor?.nome ?? "" }));
  const novaConta = () => abrirConta({ categoria: "fornecedores", vencimento: hoje(), descricao: "", unidade_id: padrao, rateio: [] } as any);
  const acoesDe = (c: Pagar) => (
    <AcoesPagar conta={c} podeDecidir={podeDecidir} aprovar={aprov.botoes(c)} onBaixa={() => setBaixa(c)} onBoleto={() => setBoleto(c)} onEditar={() => abrirConta(c)}
      onEstornar={() => setMotivo({ conta: c, acao: "estornar" })} onRenegociar={() => setRenegociar([c])} onNegociacao={() => c.negociacao_id && setNegociacao(c.negociacao_id)}
      onPrestar={ehAdiantamento(c.categoria) ? () => setPrestar(c) : undefined} onPix={() => setPixInter(c)}
      recibo={<BotaoRecibo contaId={c.id} tipo="pagar" montar={() => reciboDePagar(c, fornecedores.find((f) => f.id === c.fornecedor_id), unidades.find((u) => u.id === c.unidade_id), cfgRecibo, nomeForma(c.forma_pagamento_id) ?? formaDaObs(c.observacoes))} />} />
  );
  const situacaoDe = (c: Pagar) => {
    const s = situacaoPagar(c, dia);
    return (
      <div className="min-w-0">
        <span className="flex flex-wrap items-center gap-1">
          <span title={s.sub ?? undefined} className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${COR_TOM[s.tom]}`}>{s.texto}</span>
          {s.texto === "Falta aprovar" && <ChipRevisao conta={c as any} />}
          {c.negociacao_id && <ChipRenegociada papel={c.negociacao_papel} onClick={() => setNegociacao(c.negociacao_id!)} />}
          <SeloAdiantamento conta={c} />
        </span>
        {s.sub && <div className={`mt-0.5 text-xs ${s.tom === "golpe" ? "text-red-700" : "text-slate-500"}`}>{s.sub}</div>}
        {((c as any).marcadores ?? []).length > 0 && <div className="mt-1"><ChipsMarcadores ids={(c as any).marcadores} todos={marcadores} pequeno /></div>}
      </div>
    );
  };

  // a série que a conta nova vai gerar (uma só quando a ocorrência é única)
  const partes = editando && !editando.id && editando.valor && editando.vencimento
    ? serieContas({ valor: Number(editando.valor), vencimento: editando.vencimento, descricao: editando.descricao ?? "", documento: editando.documento, emissao: editando.emissao },
      serie.ocorrencia, serie.vezes, serie.modo, serie.mes)
    : [];
  // competência gravada: vazia segue o vencimento (como sempre foi); as outras escolhas gravam o mês
  const competenciaGravar = (venc: string, recorrente: boolean) =>
    serie.modo === "vencimento" && !recorrente ? null : competenciaDe(serie.modo, venc, editando?.emissao, serie.mes);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (gravandoSerie) return;
    try {
      const { fornecedor: _f, created_at: _c, ...row } = editando as any;
      if (!rateioOk(row.rateio)) return notify("Os centros de custo precisam somar 100%", "erro");
      if (serie.modo === "outro" && !serie.mes) return notify("Escolha o mês de competência", "erro");
      if (!precisaMotivo(contas.find((c) => c.id === row.id), row)) delete row.motivo_alteracao;
      if (row.id) {
        // conta já lançada: a competência só muda se a pessoa mexeu nela
        if (serie.mexeu) row.competencia = competenciaGravar(row.vencimento, !!row.recorrente_id);
        await save.mutateAsync(limpar({ ...row, valor: Number(row.valor) }));
        notify("Conta salva");
      } else if (partes.length > 1) {
        // o boleto lido vale só para a primeira; as outras recebem o seu boleto depois
        const semBoleto = { linha_digitavel: null, boleto_multa_pct: null, boleto_juros_mes_pct: null, boleto_juros_dia: null };
        const linhas = partes.map((p, i) => limpar({ ...row, ...(i > 0 ? semBoleto : {}), valor: p.valor, vencimento: p.vencimento, descricao: p.descricao, documento: p.documento,
          competencia: serie.modo === "vencimento" ? null : p.competencia }));
        // a série grava direto (sem o useSave): trava própria contra o clique duplo
        setGravandoSerie(true);
        const { error } = await supabase.from("contas_pagar").insert(linhas).then((r) => { setGravandoSerie(false); return r; });
        if (error) throw error;
        invalidar("contas_pagar", "contas_pagar_origem");
        notify(`${linhas.length} contas lançadas`);
      } else {
        await save.mutateAsync(limpar({ ...row, valor: Number(row.valor), competencia: competenciaGravar(row.vencimento, false) }));
        notify("Conta salva");
      }
      setEditando(null);
    } catch (err) {
      notifyError(err);
    }
  }

  return (
    <>
      {destaque && onLimparDestaque && <FaixaDestaque destaque={destaque} mostrando={contas.length} onLimpar={onLimparDestaque} />}
      {rel.visor}
      <CartoesAgora resumo={resumo} ativo={cartao} onEscolher={(k) => { setCartao(k); setEspecial(null); setSel(new Set()); }} />
      <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Buscar fornecedor, documento, histórico, nº da NF ou da OC…"
        periodo={cartao ? undefined : periodo} onPeriodo={cartao ? undefined : setPeriodo} rotuloData={rotuloCampo}
        campoData={{ valor: campoData, opcoes: CAMPOS_DATA, onChange: (v) => setCampoData(v as CampoData) }}
        nFiltros={(categoria ? 1 : 0) + (marcador ? 1 : 0) + (tipo ? 1 : 0) + (origemF ? 1 : 0)}
        filtros={<>
          <label className="text-xs font-semibold text-slate-600">Tipo
            <select className="input mt-0.5 h-9 w-auto" value={tipo} onChange={(e) => { setTipo(e.target.value as TipoPagar | ""); setSel(new Set()); }}>
              <option value="">Todos</option>
              {ORDEM_TIPOS.map((t) => <option key={t} value={t}>{TIPOS_PAGAR[t].rotulo}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Origem
            <select className="input mt-0.5 h-9 w-auto" value={origemF} onChange={(e) => setOrigemF(e.target.value as CodigoOrigem | "")}>
              <option value="">Todas</option>
              {origensUsadas.map(({ k, n }) => <option key={k} value={k}>{ORIGENS[k].rotulo} ({n})</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Categoria
            <select className="input mt-0.5 h-9 w-auto" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todas</option>
              {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <SelectMarcador valor={marcador} onChange={setMarcador} todos={marcadores} className="h-9" />
        </>}
        onLimpar={() => { setBusca(""); setPeriodo(SEM_PERIODO); setCategoria(""); setMarcador(""); setTipo(""); setOrigemF(""); }}
        direita={<>
          {!cartao && !especial && <EscolhaEstado valor={estado} onMudar={(e) => { setEstado(e); setSel(new Set()); }} />}
          <span className="flex flex-1 justify-end gap-2 sm:flex-none">
          <MenuAcoes texto="Mais" rotulo="Mais opções" itens={[
            { rotulo: "Imprimir a lista", icone: Printer, onClick: () => rel.imprimir(paraRel()) },
            { rotulo: "Imprimir por fornecedor", icone: Users, onClick: () => rel.imprimir(paraRel(), true) },
            { rotulo: "Exportar para Excel", icone: FileDown, onClick: () => rel.exportar(paraRel(), (c) => ({ Categoria: c.categoria, Documento: c.documento ?? "", Origem: rotuloOrigem(origens.get(c.id)) ?? "",
              Emissão: celula(dataDaConta(c, "emissao", origens.get(c.id))), Competência: celula(dataDaConta(c, "competencia")) })) },
            { rotulo: `Contas fixas (${nFixas})`, icone: Repeat, onClick: () => { setEspecial("fixas"); setCartao(null); setSel(new Set()); } },
            { rotulo: `Renegociadas (${negAndamento})`, icone: Handshake, onClick: () => { setEspecial("renegociadas"); setCartao(null); setSel(new Set()); } },
            { rotulo: `Aprovações${aprov.minhaVez.length ? ` (${aprov.minhaVez.length} na sua vez)` : ""}`, icone: ClipboardCheck, onClick: () => navigate("/aprovacoes") },
          ]} />
          <Button onClick={novaConta}><Plus size={16} /> Nova conta</Button>
          </span>
        </>} />
      {cartao && (
        <FaixaCartao cartao={cartao} onLimpar={() => setCartao(null)}>
          {cartao === "hoje" && podeDecidir && pagarHoje.length > 0 && (
            <Button variant="secondary" onClick={() => setLotePagarHoje(true)} title="Pague no banco e registre aqui: o ERP dá baixa em todas de uma vez">
              <CheckCheck size={15} /> Registrar o pagamento das {pagarHoje.length} programadas para hoje
            </Button>
          )}
        </FaixaCartao>
      )}
      {cartao === "decidir" && aprov.faixa(() => navigate("/aprovacoes"))}
      {especial && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-600">Mostrando: <b className="text-fg">{especial === "fixas" ? "Contas fixas" : "Renegociadas"}</b></span>
          <button type="button" className="link-modulo font-semibold" onClick={() => setEspecial(null)}>voltar à lista</button>
        </div>
      )}
      {especial === "renegociadas" ? (
        <PainelRenegociadas contas={contas} onAbrir={setNegociacao} />
      ) : especial === "fixas" ? (
        <div className="space-y-4">
          <ContasFixas contas={contas} />
          {lista.length > 0 && <h3 className="text-sm font-bold text-fg">Contas lançadas pelas fixas, em aberto ({lista.length})</h3>}
          {lista.length > 0 && <ListaContas vazia={false}>
            {lista.map((c) => (
              <CartaoConta key={c.id} titulo={c.fornecedor?.nome || c.descricao} descricao={mesmoTexto(c.fornecedor?.nome || c.descricao, c.descricao) ? null : c.descricao} unidadeId={(c as any).unidade_id}
                detalhe={<><ChipTipo tipo={tipoDe(c)} className="mr-1" />{[c.categoria, nomeForma(c.forma_pagamento_id)].filter(Boolean).join(" · ")}</>}
                valor={c.valor} vencimento={c.vencimento} status={c.status} pagoEm={c.data_pagamento} situacao={situacaoDe(c)}
                acoes={<div className="col-span-full px-1.5">{acoesDe(c)}</div>} />
            ))}
          </ListaContas>}
          {lista.length > 0 && <div className="hidden md:block"><Table head={<><th className="th">Vencimento</th><th className="th">Fornecedor e descrição</th><th className="th">Situação</th><th className="th text-right">Valor</th><th className="th text-right">Ação</th></>}>
            {lista.map((c) => (
              <tr key={c.id}>
                <td className="td num whitespace-nowrap">{dataBR(c.vencimento)}</td>
                <td className="td"><div className="font-semibold text-fg">{c.fornecedor?.nome || c.descricao}<EtiquetaUnidade id={(c as any).unidade_id} /></div><div className="text-xs text-slate-500">{c.descricao}</div></td>
                <td className="td">{situacaoDe(c)}</td>
                <td className="td num whitespace-nowrap text-right font-semibold">{brl(c.valor)}</td>
                <td className="td">{acoesDe(c)}</td>
              </tr>
            ))}
          </Table></div>}
        </div>
      ) : <>
      {podeDecidir && abertasVisiveis.length > 0 && (
        <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700 md:hidden">
          <input type="checkbox" className="h-5 w-5" checked={todasMarcadas} onChange={marcarTodas} /> Marcar todas em aberto ({abertasVisiveis.length})
        </label>
      )}
      <ListaContas vazia={!carregando && lista.length === 0}>
        {lista.map((c) => (
          <CartaoConta key={c.id} titulo={c.fornecedor?.nome || c.descricao} descricao={mesmoTexto(c.fornecedor?.nome || c.descricao, c.descricao) ? null : c.descricao} unidadeId={(c as any).unidade_id}
            detalhe={<><ChipTipo tipo={tipoDe(c)} className="mr-1" /><ChipOrigem o={origens.get(c.id)} className="mr-1" />{[c.categoria, c.documento, nomeForma(c.forma_pagamento_id), c.conta_bancaria_id && contaBanco(c.conta_bancaria_id)].filter(Boolean).join(" · ")}</>}
            valor={c.valor} vencimento={c.vencimento} status={c.status} pagoEm={c.data_pagamento} marcado={sel.has(c.id)}
            marcar={podeDecidir && c.status === "aberto"
              ? <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" aria-label={`Marcar ${c.descricao}`} checked={sel.has(c.id)} onChange={() => marcar(c.id)} />
              : null}
            situacao={situacaoDe(c)}
            acoes={<div className="col-span-full px-1.5">{acoesDe(c)}</div>} />
        ))}
      </ListaContas>
      <div className="hidden md:block">
      <Table
        empty={!carregando && lista.length === 0}
        head={<>{podeDecidir && <th className="th w-8"><input type="checkbox" aria-label="Marcar todas em aberto" checked={todasMarcadas} onChange={marcarTodas} /></th>}<th className="th">Vencimento</th><th className="th">Fornecedor e descrição</th><th className="th">Origem</th><th className="th">Situação</th><th className="th text-right">Valor</th><th className="th text-right">Ação</th></>}
      >
        {lista.map((c) => (
          <tr key={c.id} className={sel.has(c.id) ? "bg-brand/5" : undefined}>
            {podeDecidir && <td className="td" data-label="Marcar">{c.status === "aberto" && <input type="checkbox" aria-label={`Marcar ${c.descricao}`} checked={sel.has(c.id)} onChange={() => marcar(c.id)} />}</td>}
            <td className="td whitespace-nowrap">
              <div className="num font-medium">{dataBR(c.vencimento)}</div>
              {c.status === "aberto" && c.pagar_em && c.pagar_em !== c.vencimento && c.decisao !== "nao_pagar" && <div className="text-xs text-slate-500">pagar {dataBR(c.pagar_em).slice(0, 5)}</div>}
            </td>
            <td className="td">
              <div className="flex flex-wrap items-center gap-x-1.5 font-semibold text-fg">{c.fornecedor?.nome || c.descricao}<EtiquetaUnidade id={(c as any).unidade_id} /><ChipTipo tipo={tipoDe(c)} /></div>
              <div className="text-xs text-slate-500">{[!mesmoTexto(c.fornecedor?.nome || c.descricao, c.descricao) && c.descricao, c.categoria, c.documento, c.linha_digitavel && "boleto",
                nomeForma(c.forma_pagamento_id), c.chave_pix && `Pix ${c.chave_pix}`,
                c.data_pagamento && c.conta_bancaria_id && `saiu de ${contaBanco(c.conta_bancaria_id)}`].filter(Boolean).join(" · ")}</div>
            </td>
            <td className="td"><ChipOrigem o={origens.get(c.id)} /></td>
            <td className="td">{situacaoDe(c)}</td>
            <td className="td num whitespace-nowrap text-right font-semibold">{brl(c.valor)}</td>
            <td className="td">{acoesDe(c)}</td>
          </tr>
        ))}
      </Table>
      </div>
      {!(podeDecidir && marcadas.length > 0) && <RodapeLista quantidade={lista.length} nome={["conta", "contas"]} total={somaDe(lista)} rotuloTotal={`total · ${rotuloVisao.toLowerCase()}`} />}
      </>}

      <Modal open={!!editando} onClose={() => setEditando(null)} title={editando?.id ? "Editar conta a pagar" : "Nova conta a pagar"}>
        {editando && (
          <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><CampoUnidade value={(editando as any).unidade_id} onChange={(v) => setEditando({ ...editando, unidade_id: v } as any)} label="Unidade que paga" /></div>
            <Field label="Descrição" className="sm:col-span-2"><input className="input" value={editando.descricao ?? ""} onChange={(e) => setEditando({ ...editando, descricao: e.target.value })} required /></Field>
            <Field label="Fornecedor" className="sm:col-span-2">
              <ClienteBusca clientes={fornecedoresBusca} value={editando.fornecedor_id} placeholder="Buscar por nome, CNPJ ou cidade…"
                onChange={(id) => setEditando((x) => {
                  if (!x) return x;
                  // a chave Pix vem do cadastro do fornecedor (troca junto se ainda era a do fornecedor anterior)
                  const antes = fornecedores.find((f) => f.id === x.fornecedor_id)?.chave_pix ?? null;
                  const nova = fornecedores.find((f) => f.id === id)?.chave_pix ?? null;
                  const pix = !x.chave_pix || x.chave_pix === antes ? nova : x.chave_pix;
                  return { ...x, fornecedor_id: id || null, chave_pix: pix };
                })} />
            </Field>
            {fornecedores.find((f) => f.id === editando.fornecedor_id)?.bloqueado && (
              <div className="sm:col-span-2"><AvisoGolpe f={fornecedores.find((f) => f.id === editando.fornecedor_id)} /></div>
            )}
            <CampoCategoria tipo="despesa" value={editando.categoria} onChange={(v) => setEditando({ ...editando, categoria: v })} />
            <Field label={!editando.id && serie.ocorrencia === "parcelada" ? "Valor total (dividido nas parcelas)" : "Valor"}><input className="input" type="number" step="0.01" min={0.01} value={editando.valor ?? ""} onChange={(e) => setEditando({ ...editando, valor: Number(e.target.value) })} required /></Field>
            <Field label={!editando.id && serie.ocorrencia !== "unica" ? "1º vencimento" : "Vencimento"}><input className="input" type="date" value={editando.vencimento} onChange={(e) => setEditando({ ...editando, vencimento: e.target.value })} required /></Field>
            <Field label="Emissão"><input className="input" type="date" value={editando.emissao ?? ""} onChange={(e) => setEditando({ ...editando, emissao: e.target.value || null })} /></Field>
            <Field label="Forma de pagamento">
              <select className="input" value={editando.forma_pagamento_id ?? ""} onChange={(e) => setEditando({ ...editando, forma_pagamento_id: e.target.value || null })}>
                <option value="">—</option>
                {formasPagar.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                {editando.forma_pagamento_id && !formasPagar.some((f) => f.id === editando.forma_pagamento_id) && (
                  <option value={editando.forma_pagamento_id}>{formasTodas.find((f) => f.id === editando.forma_pagamento_id)?.nome ?? "Forma desativada"}</option>
                )}
              </select>
            </Field>
            <Field label="Chave Pix de quem recebe" className="sm:col-span-2">
              <input className="input" value={editando.chave_pix ?? ""} onChange={(e) => setEditando({ ...editando, chave_pix: e.target.value })} placeholder="CNPJ, e-mail, telefone ou chave aleatória" />
            </Field>
            <Field label="Competência (mês do DRE)">
              <select className="input" value={serie.modo} onChange={(e) => setSerie({ ...serie, modo: e.target.value as ModoCompetencia, mexeu: true })}>
                {MODOS_COMPETENCIA.map((m) => <option key={m.v} value={m.v}>{m.rotulo}</option>)}
              </select>
            </Field>
            {serie.modo === "outro" ? (
              <Field label="Mês de competência"><input className="input" type="month" value={serie.mes} onChange={(e) => setSerie({ ...serie, mes: e.target.value, mexeu: true })} required /></Field>
            ) : (
              <p className="self-end pb-2 text-xs text-slate-500">
                {serie.modo === "emissao" && !editando.emissao ? "Sem a emissão, vale o mês do vencimento. " : ""}
                {partes.length > 1 ? "A 1ª entra" : "Entra"} no DRE em <b className="text-fg">{editando.vencimento ? mesAno(competenciaDe(serie.modo, editando.vencimento, editando.emissao)) : "—"}</b>.
              </p>
            )}
            {!editando.id && (
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-3 sm:col-span-2">
                <Field label="Ocorrência">
                  <select className="input" value={serie.ocorrencia} onChange={(e) => setSerie({ ...serie, ocorrencia: e.target.value as Ocorrencia })}>
                    {OCORRENCIAS.map((o) => <option key={o.v} value={o.v}>{o.rotulo}</option>)}
                  </select>
                </Field>
                {serie.ocorrencia !== "unica" && (
                  <Field label={serie.ocorrencia === "parcelada" ? "Parcelas" : "Quantas vezes"}>
                    <input className="input" type="number" min={2} max={MAX_VEZES} value={serie.vezes} onChange={(e) => setSerie({ ...serie, vezes: Number(e.target.value) })} required />
                  </Field>
                )}
                {partes.length > 1 && (
                  <p className="col-span-2 text-xs text-slate-600">
                    Vai lançar <b className="text-fg">{partes.length} contas</b> de {dataBR(partes[0].vencimento)} a {dataBR(partes[partes.length - 1].vencimento)}
                    {" "}· {partes[0].valor === partes[partes.length - 1].valor ? `${brl(partes[0].valor)} cada` : `${brl(partes[0].valor)} na 1ª e ${brl(partes[1].valor)} nas outras`}
                    {serie.ocorrencia !== "parcelada" && ` · total ${brl(partes.reduce((t, x) => t + x.valor, 0))}`}. Cada uma passa pela aprovação como as outras.
                  </p>
                )}
              </div>
            )}
            <div className="sm:col-span-2">
              <CampoBoleto key={editando.id ?? "nova"} linha={editando.linha_digitavel} contaId={editando.id}
                encargos={{ boleto_multa_pct: editando.boleto_multa_pct, boleto_juros_mes_pct: editando.boleto_juros_mes_pct, boleto_juros_dia: editando.boleto_juros_dia }}
                onLinha={(l) => setEditando((x) => (x ? { ...x, linha_digitavel: l } : x))}
                onLido={(b) => setEditando((x) => (x ? { ...x, valor: b.valor ?? x.valor, vencimento: b.vencimento ?? x.vencimento } : x))}
                onEncargos={(e) => setEditando((x) => (x ? { ...x, ...e } : x))} />
            </div>
            <Field label="Nº do documento (NF, boleto, recibo…)" className="sm:col-span-2"><input className="input" value={editando.documento ?? ""} onChange={(e) => setEditando({ ...editando, documento: e.target.value })} /></Field>
            <Field label="Histórico / observações" className="sm:col-span-2"><textarea className="input" rows={2} value={editando.observacoes ?? ""} onChange={(e) => setEditando({ ...editando, observacoes: e.target.value })} /></Field>
            <div className="sm:col-span-2"><CampoRateio value={editando.rateio} onChange={(v) => setEditando({ ...editando, rateio: v })} /></div>
            {editando.recorrente_id && <p className="text-xs text-slate-500 sm:col-span-2">Lançada pela conta fixa (Contas a pagar → Contas fixas).</p>}
            {editando.id && origens.get(editando.id) && origens.get(editando.id)!.origem !== "outro" && (
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 sm:col-span-2">Origem: <ChipOrigem o={origens.get(editando.id)} /> {ORIGENS[origens.get(editando.id)!.origem].rotulo}</p>
            )}
            {precisaMotivo(contas.find((c) => c.id === editando.id), editando) && (
              <Field label="Motivo da alteração de valor/vencimento (fica no histórico)" className="sm:col-span-2">
                <input className="input" value={editando.motivo_alteracao ?? ""} onChange={(e) => setEditando({ ...editando, motivo_alteracao: e.target.value })} required minLength={3} placeholder="Ex.: fornecedor enviou boleto corrigido" />
              </Field>
            )}
            <div className="sm:col-span-2"><Anexos entidade="conta_pagar" id={editando?.id} /></div>
            <div className="sm:col-span-2"><Historico tabela="contas_pagar" id={editando?.id} /></div>
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
              {editando.id && editando.status === "aberto" && (
                <Button type="button" variant="ghost" className="mr-auto text-red-600" onClick={() => { setMotivo({ conta: editando as Pagar, acao: "cancelar" }); setEditando(null); }}><Ban size={15} /> Cancelar conta</Button>
              )}
              <Button type="button" variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button disabled={save.isPending || gravandoSerie}>{gravandoSerie ? "Lançando…" : "Salvar"}</Button>
            </div>
          </form>
        )}
      </Modal>

      {podeDecidir && <BarraLote contas={marcadas} onLimpar={() => setSel(new Set())}
        extra={<Button type="button" variant="secondary" disabled={!marcadas.some((c) => c.status === "aberto" && !c.negociacao_id)} onClick={() => setRenegociar(marcadas)}
          title="Juntar as contas marcadas num acordo com o fornecedor (parcelas novas) ou só registrar a negociação"><Handshake size={15} /> Renegociar</Button>} />}
      {pixInter && <PagarPixInter conta={pixInter as any} onClose={() => setPixInter(null)} />}
      {prestar && <PrestarContas conta={prestar} onClose={() => setPrestar(null)} />}
      {renegociar && <ModalRenegociar contas={renegociar} onClose={() => setRenegociar(null)} onFeito={(id) => { setSel(new Set()); setNegociacao(id); }} />}
      {negociacao && <HistoricoNegociacao id={negociacao} contas={contas} onClose={() => setNegociacao(null)} />}
      {lotePagarHoje && <PagarLoteModal contas={pagarHoje} onClose={() => setLotePagarHoje(false)} />}
      {baixa && <BaixaModal conta={baixa} tabela="contas_pagar" valorInicial={baixaCom?.valor} dataInicial={baixaCom?.data} onClose={() => { setBaixa(null); setBaixaCom(null); }} />}
      {boleto && <ConferirBoletoModal conta={contas.find((x) => x.id === boleto.id) ?? boleto} podeEditar={podeDecidir} aprovada={!aguardaAprovacao(contas.find((x) => x.id === boleto.id) ?? boleto)} onClose={() => setBoleto(null)}
        onPagar={(valor, data) => { setBaixaCom({ valor, data }); setBaixa(contas.find((x) => x.id === boleto.id) ?? boleto); setBoleto(null); }} />}
      {motivo && <MotivoModal conta={motivo.conta} acao={motivo.acao} tabela="contas_pagar" onClose={() => setMotivo(null)} />}
      {aprov.modais}
    </>
  );
}

/** De onde veio a conta, como a coluna "Integrações" do Tiny: NF 1234, OC 56, Fatura 789, Envio 12, Fixa, Extrato… */
function ChipOrigem({ o, className = "" }: { o: OrigemConta | undefined; className?: string }) {
  if (!o || o.origem === "outro") return null;
  const d = ORIGENS[o.origem];
  return <span title={d.rotulo} className={`inline-flex max-w-full items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${d.cor} ${className}`}>{rotuloOrigem(o)}</span>;
}

/**
 * Ações de uma conta a pagar: um botão com o próximo passo (pagar, registrar o pagamento, aprovar, recibo…) e o resto
 * no menu "⋯" (agendar, não pagar, voltar a decidir, boleto, marcadores, editar, estornar).
 */
function AcoesPagar({ conta: c, podeDecidir, aprovar, onBaixa, onBoleto, onEditar, onEstornar, onRenegociar, onNegociacao, onPrestar, onPix, recibo }: {
  conta: Pagar; podeDecidir: boolean; aprovar?: ReactNode; onBaixa: () => void; onBoleto: () => void; onEditar: () => void; onEstornar: () => void;
  onRenegociar: () => void; onNegociacao: () => void; onPrestar?: () => void; onPix?: () => void; recibo: ReactNode;
}) {
  const { programar, ocupado } = useProgramar();
  const [janela, setJanela] = useState<"agendar" | "nao_pagar" | "marcadores" | null>(null);
  const aberta = c.status === "aberto", golpe = !!c.fornecedor?.bloqueado, falta = aguardaAprovacao(c);
  const decidida = c.decisao === "pagar" || c.decisao === "agendado";
  const podeMexer = podeDecidir && aberta && !golpe;
  const hojeDia = hoje();
  let principal: ReactNode;
  if (c.status === "pago") principal = onPrestar ? <Button variant="secondary" className="whitespace-nowrap" onClick={onPrestar}><ClipboardCheck size={15} /> Prestar contas</Button> : recibo;
  // falta aprovar: "Aprovar / Não" para quem aprova (ou o porquê de esperar)
  else if (falta && aberta && !golpe && aprovar) principal = aprovar;
  else if (!podeMexer) principal = <Button variant="secondary" onClick={onEditar}><Eye size={15} /> Ver</Button>;
  else if (falta) principal = <Link to="/aprovacoes" title="A conta precisa ser aprovada antes de pagar" className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">Aprovar</Link>;
  else if (c.decisao === "nao_pagar") principal = <Button variant="secondary" disabled={ocupado} onClick={() => programar([c.id], "limpar")} title="Volta para a decidir"><RotateCcw size={15} /> Retomar</Button>;
  else if (decidida) principal = <Button className="whitespace-nowrap" onClick={onBaixa} title="O dinheiro já saiu: registre o pagamento (valor, data e banco)"><Wallet size={15} /> Registrar pagamento</Button>;
  else principal = (
    <Button variant="secondary" className="whitespace-nowrap" disabled={ocupado} onClick={() => programar([c.id], "pagar")} title="Entra na lista de pagar hoje no dia do vencimento (ou hoje, se já venceu)">
      <Check size={15} /> {c.vencimento <= hojeDia ? "Pagar hoje" : "Pagar no vencimento"}
    </Button>
  );
  return (
    <div className="flex items-center justify-end gap-1.5">
      {principal}
      <MenuAcoes itens={[
        podeMexer && !falta && { rotulo: c.decisao === "agendado" ? "Mudar o dia do pagamento" : "Agendar um dia…", icone: CalendarClock, onClick: () => setJanela("agendar") },
        podeMexer && c.decisao !== "nao_pagar" && { rotulo: "Não pagar…", icone: Ban, onClick: () => setJanela("nao_pagar") },
        podeMexer && !!c.decisao && c.decisao !== "nao_pagar" && { rotulo: "Voltar a decidir", icone: RotateCcw, onClick: () => programar([c.id], "limpar") },
        podeMexer && !falta && !!onPix && { rotulo: "Pagar com Pix pelo Inter…", icone: Send, onClick: onPix },
        aberta && !golpe && !falta && !decidida && { rotulo: "Registrar pagamento", icone: Wallet, onClick: onBaixa },
        (aberta || !!c.linha_digitavel) && { rotulo: "Conferir boleto", icone: ScanBarcode, onClick: onBoleto },
        podeMexer && !c.negociacao_id && { rotulo: "Renegociar…", icone: Handshake, onClick: onRenegociar },
        !!c.negociacao_id && { rotulo: "Histórico da negociação", icone: Handshake, onClick: onNegociacao },
        !!onPrestar && { rotulo: "Prestar contas (adiantamento)", icone: ClipboardCheck, onClick: onPrestar },
        { rotulo: "Marcadores", icone: Tags, onClick: () => setJanela("marcadores") },
        { rotulo: aberta ? "Editar" : "Ver detalhes", icone: aberta ? Pencil : Eye, onClick: onEditar },
        c.status === "pago" && { rotulo: "Estornar o pagamento", icone: Undo2, onClick: onEstornar, perigo: true },
      ]} />
      {janela === "agendar" && <ModalAgendar contas={[c]} onClose={() => setJanela(null)} />}
      {janela === "nao_pagar" && <ModalNaoPagar contas={[c]} onClose={() => setJanela(null)} />}
      {janela === "marcadores" && <AplicarMarcadores tabela="contas_pagar" notas={[c as any]} nome={["conta a pagar", "contas a pagar"]} onClose={() => setJanela(null)} />}
    </div>
  );
}

/* --------------------------- Baixa manual (pagamento) --------------------------- */

/* --------------------- Cancelar conta / estornar baixa (com motivo) --------------------- */

function MotivoModal({ conta, acao, tabela, onClose }: {
  conta: { id: string; descricao: string; valor: number }; acao: "cancelar" | "estornar"; tabela: "contas_receber" | "contas_pagar"; onClose: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [gravando, setGravando] = useState(false);
  const invalidate = useInvalidate();
  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (gravando) return;
    setGravando(true);
    try { await gravar(); } finally { setGravando(false); }
  }
  async function gravar() {
    // baixa que veio do extrato do banco: estornar só a conta deixaria a linha do banco conciliada com ela (saldo errado)
    if (acao === "estornar") {
      const { data: ligada, error: erroLigada } = await supabase.from("extrato_lancamentos").select("id")
        .eq(tabela === "contas_receber" ? "conta_receber_id" : "conta_pagar_id", conta.id).eq("status", "conciliado").limit(1);
      if (erroLigada) return notifyError(erroLigada);
      if (ligada?.length) return notifyError("Esta baixa está ligada a uma linha do extrato do banco. Para desfazer, abra o Extrato e use \"Desfazer conciliação\" nessa linha: a conta volta a ficar em aberto e a linha fica pendente.");
    }
    const patch = acao === "cancelar"
      ? { status: "cancelado", motivo_alteracao: motivo }
      : { status: "aberto", data_pagamento: null, valor_pago: null, conta_bancaria_id: null, motivo_alteracao: `Estorno: ${motivo}` };
    const { error } = await supabase.from(tabela).update(patch).eq("id", conta.id);
    if (error) return notifyError(error);
    notify(acao === "cancelar" ? "Conta cancelada" : "Baixa estornada: a conta voltou a ficar em aberto");
    invalidate(tabela, "auditoria", "saldos_bancarios", "movimentos_realizados");
    onClose();
  }
  return (
    <Modal open onClose={onClose} title={`${acao === "cancelar" ? "Cancelar conta" : "Estornar baixa"} — ${conta.descricao}`}>
      <form onSubmit={confirmar} className="space-y-3">
        <p className="text-sm text-slate-600">
          {acao === "cancelar"
            ? <>A conta de <b>{brl(conta.valor)}</b> deixa de contar como {tabela === "contas_receber" ? "a receber" : "a pagar"}. Ela não é apagada: fica como cancelada, com o motivo no histórico.</>
            : <>O pagamento é desfeito e a conta de <b>{brl(conta.valor)}</b> volta a ficar em aberto. O motivo fica no histórico.</>}
        </p>
        <Field label="Motivo"><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} autoFocus /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button variant={acao === "cancelar" ? "danger" : "primary"} disabled={gravando}>{acao === "cancelar" ? "Cancelar conta" : "Estornar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Nome da conta bancária pelo id (para mostrar onde o dinheiro entrou/saiu). */
function useNomeContaBancaria() {
  const { data: bancos = [] } = useRows<ContaBancaria>("contas_bancarias", { order: "nome", ascending: true });
  return (id: string) => bancos.find((b) => b.id === id)?.nome ?? "";
}
