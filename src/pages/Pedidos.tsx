import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { lerDestaque } from "@/lib/destaque";
import { FaixaDestaque } from "@/components/FaixaDestaque";
import { FreteVenda } from "@/components/FreteVenda";
import { FreteRapido } from "@/components/fretes/FreteRapido";
import { OcorrenciasPedido } from "@/components/fretes/OcorrenciasPedido";
import { CheckCircle2, ChevronRight, FileDown, FileText, MessageCircle, Pencil, Plus, Printer, Receipt, RotateCcw, Trash2, Truck, XCircle } from "lucide-react";
import { PdfViewer } from "@/components/PdfViewer";
import { comUnidade, pdfOrcamento } from "@/lib/pdf";
import { useConfig } from "@/lib/useConfig";
import { Badge, Button, Field, Modal, PageHeader, Table, Tabs } from "@/components/ui";
import { BotaoMarcadores, ChipsMarcadores, SelectMarcador, useMarcadores } from "@/components/nfe/Marcadores";
import { ItensEditor, totalItens } from "@/components/ItensEditor";
import { limpar, useInvalidate, useRows } from "@/lib/data";
import { useUnidade, EtiquetaUnidade, CampoUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje, pl, somarDias, whatsappLink } from "@/lib/format";
import { MEIOS_VENDA, useFormasPagamento } from "@/lib/formasPagamento";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import type { Cliente, Item, Pedido, Produto, Vendedor } from "@/lib/types";
import { usePerfil } from "@/lib/auth";
import { baixarPlanilha, celula } from "@/lib/exportar";
import { Anexos } from "@/components/Anexos";
import { PropostaPainel } from "@/components/PropostaPainel";
import { useEtiquetas } from "@/components/etiquetas/EditorEtiquetas";
import { conferirPedido, type Pendencia } from "@/lib/compliance";
import { VendedorSelect } from "@/components/VendedorSelect";
import { MotivoAcao } from "@/components/MotivoAcao";
import { AuditoriaPedido } from "@/components/AuditoriaPedido";
import { ambienteNfe, confirmarSeTeste } from "@/lib/ambienteNfe";
import { ClienteBusca } from "@/components/ClienteBusca";
import { combinaBusca } from "@/lib/buscaCliente";
import { pctTexto, percentualPedido, type LinhaProduto, type RegraComissao } from "@/lib/comissao";
import { ajusteTexto, precoNaTabela, type PrecoFixo, type TabelaPreco } from "@/lib/tabelasPreco";
import { MEIOS_LINK, PagamentoPedido, useTemInfinitePay } from "@/components/financeiro/LinkPedido";
import { PropostasTiny } from "@/components/vendas/PropostasTiny";
import { AprovarDesconto } from "@/components/vendas/AprovarDesconto";
import { maximoDesconto, rotuloRegra, type RegraDesconto } from "@/lib/descontos";
import { confirmar, pedirTexto } from "@/components/Dialogos";
import { ehLicenciado, SeloLicenciado } from "@/components/clientes/Licenciado";
import { BarraFiltros, ChipsSituacao, RodapeLista, useSelecao } from "@/components/filtros/BarraFiltros";
import { AplicarMarcadores } from "@/components/nfe/Marcadores";
import { noPeriodo, SEM_PERIODO, somar, type Periodo } from "@/lib/filtroLista";
import { urlFotoProduto } from "@/lib/catalogo";
import {
  contasDaVenda, envioDaVenda, meioDaVenda, pagamentoDaVenda, ROTULO_PAGAMENTO, sinaisDaVenda,
  type ContaVenda, type Envio, type EnvioVenda, type Pagamento, type SituacaoPagamento, type TransportadoraVenda,
} from "@/lib/vendasLista";
import { COR_PAGAMENTO, EtiquetaPagamento, IconeEnvio, IconeMeio, MiniaturaVenda, SinaisVenda } from "@/components/vendas/ColunasVenda";

/** "#12 (motivo), #15 (motivo)…" dos pedidos que a ação em lote deixou de fora. */
const resumoPulados = (p: { numero: number; motivo: string }[]) =>
  p.slice(0, 6).map((x) => `#${x.numero} (${x.motivo})`).join("; ") + (p.length > 6 ? ` e mais ${p.length - 6}` : "");

const STATUS = ["todos", "orcamento", "aprovado", "faturado", "entregue", "cancelado"] as const;
const ROTULO_STATUS: Record<(typeof STATUS)[number], string> = {
  todos: "Todos", orcamento: "Orçamentos", aprovado: "Aprovados", faturado: "Faturados", entregue: "Entregues", cancelado: "Cancelados",
};
const FORMAS = [
  { value: "boleto", label: "Boleto" },
  { value: "pix", label: "Pix" },
  { value: "cartao", label: "Cartão" },
  { value: "transferencia", label: "Transferência" },
  { value: "dinheiro", label: "Dinheiro" },
];

// com as contas a receber (do pedido e das notas dele), os envios e a transportadora: pagamento e envio na lista
const CONTA = "id,status,valor,valor_pago,vencimento,data_pagamento,forma_pagamento";
const TRANSP = "nome,nome_fantasia,tipo,rastreio_url";
const SELECT = `*, cliente:clientes(*), itens:pedido_itens(*), notas:notas_fiscais(id,status,numero,serie,chave,ambiente,contas:contas_receber(${CONTA})), `
  + `contas:contas_receber(${CONTA}), envios:envios(id,status,created_at,transportadora_nome,codigo_rastreio,coletado_em,entregue_em,transportadora:transportadoras(${TRANSP})), `
  + `transportadora:transportadoras(${TRANSP})`;

type PedidoLista = Omit<Pedido, "notas"> & { notas?: (NonNullable<Pedido["notas"]>[number] & { contas?: ContaVenda[] })[]; contas?: ContaVenda[]; envios?: EnvioVenda[]; transportadora?: TransportadoraVenda | null; enviado_em?: string | null; estoque_baixado?: boolean | null };
/** O que a lista mostra de cada venda, calculado uma vez. */
type InfoVenda = { contas: ContaVenda[]; pg: Pagamento | null; meio: ReturnType<typeof meioDaVenda>; envio: Envio; sinais: ReturnType<typeof sinaisDaVenda>; nf: string | null; oc: string | null; foto: string | null };

/** Orçamento enviado pelo representante no Portal do representante. */
const SeloPortal = () => (
  <span className="ml-1.5 rounded-md bg-teal-50 px-1.5 py-0.5 text-[11px] font-bold text-teal-800" title="Orçamento enviado pelo representante no portal">PORTAL</span>
);

function exportarPedidos(lista: Pedido[], infoDe?: (id: string) => InfoVenda | undefined) {
  const ped = lista.map((p: any) => {
    const i = infoDe?.(p.id);
    return {
      Número: p.numero, Data: celula(p.created_at), Situação: ROTULO_STATUS[p.status as (typeof STATUS)[number]] ?? p.status, Cliente: p.cliente?.nome ?? "",
      "CPF/CNPJ": p.cliente?.cpf_cnpj ?? "", UF: p.cliente?.uf ?? "", Origem: p.origem, "Nº no Tiny": p.numero_externo ?? "", "Nº pedido (OC)": i?.oc ?? "",
      Vendedor: p.vendedor ?? "", Produtos: Number(p.valor_produtos ?? 0),
      Desconto: Number(p.desconto ?? 0), Frete: Number(p.frete ?? 0), Total: Number(p.valor_total ?? 0),
      "Forma de pagamento": i?.meio?.rotulo ?? FORMAS.find((f) => f.value === p.forma_pagamento)?.label ?? p.forma_pagamento ?? "", Parcelas: p.parcelas,
      Pagamento: i?.pg ? ROTULO_PAGAMENTO[i.pg.situacao] : "", Recebido: i?.pg ? i.pg.recebido : "",
      "Nota fiscal": i?.nf ?? "", "Forma de envio": i?.envio.rotulo ?? "", Rastreio: i?.envio.rastreio ?? "", Observações: p.observacoes ?? "",
    };
  });
  const itens = lista.flatMap((p: any) => (p.itens ?? []).map((i: Item) => ({
    Pedido: p.numero, Cliente: p.cliente?.nome ?? "", Item: i.descricao, Quantidade: Number(i.quantidade), Unitário: Number(i.valor_unitario),
    Total: Number(i.quantidade) * Number(i.valor_unitario), "Nº de série": i.numero_serie ?? "",
  })));
  baixarPlanilha("vendas", [{ nome: "Pedidos", linhas: ped }, { nome: "Itens", linhas: itens }]).catch(notifyError);
}

// observações padrão do orçamento: Configurações → Orçamentos e garantia
const novoPedido = (observacoes?: string | null): Partial<Pedido> & { itens: Item[] } => ({
  origem: "whatsapp", status: "orcamento", forma_pagamento: "boleto", parcelas: 1, intervalo_dias: 30,
  modalidade_frete: 9, desconto: 0, frete: 0, itens: [], observacoes: observacoes?.trim() || null,
});

/** Venda de Peças (/pedidos) e Venda de Máquinas (/vendas-maquinas): a mesma lista de vendas, separada pelo que
 * foi vendido (pedido com máquina vai para Máquinas). Em Máquinas ficam também as propostas do Tiny (MF e My Frost)
 * e a OP de cada venda. */
export default function Pedidos({ area = "pecas" }: { area?: "pecas" | "maquinas" }) {
  const { pode, tem } = usePerfil();
  const { filtrar } = useUnidade();
  const invalidate = useInvalidate();
  const { data: pedidosTodos = [], isLoading } = useRows<PedidoLista>("pedidos", { select: SELECT });
  const { data: tiposProduto = [] } = useRows<{ id: string; tipo: string; foto_caminho: string | null }>("produtos", { select: "id, tipo, foto_caminho", order: "id", ascending: true, key: ["tipos"] });
  // pedidos do Tiny: nº do pedido do cliente (ordem de compra) e a forma de pagamento que vieram de lá (só o administrador lê)
  const { data: docsTiny = [] } = useRows<{ tiny_id: string; oc: string | null; fp: string | null }>("tiny_documentos", {
    select: "tiny_id, oc:dados->>numero_ordem_compra, fp:dados->>forma_pagamento", order: "tiny_id", ascending: true, key: ["vendas"],
    filtro: (q) => q.eq("tipo", "pedido"),
  });
  // a situação do pagamento vem das contas a receber: só para quem vê o financeiro ou as vendas
  const vePagamento = tem("financeiro", "vendas");
  const { data: ops = [] } = useRows<{ id: string; numero: number; status: string; pedido_id: string | null }>("ordens_producao", {
    select: "id, numero, status, pedido_id", order: "numero", ascending: true, key: ["vendas"],
  });
  const maquinas = useMemo(() => new Set(tiposProduto.filter((x) => x.tipo === "maquina").map((x) => x.id)), [tiposProduto]);
  const ehMaquina = (p: Pedido) => (p.itens ?? []).some((i) => maquinas.has(i.produto_id));
  const opsDe = (id: string) => ops.filter((o) => o.pedido_id === id);
  const { data: cfgPedidos } = useConfig();
  const [filtro, setFiltro] = useState<(typeof STATUS)[number]>("todos");
  const [busca, setBusca] = useState("");
  const [marcador, setMarcador] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>(SEM_PERIODO);
  // situação do pedido no Tiny (os que vieram do histórico do Tiny guardam a situação de lá)
  const [situacaoTiny, setSituacaoTiny] = useState("");
  const selecao = useSelecao();
  const [marcandoLote, setMarcandoLote] = useState(false);
  const [lancando, setLancando] = useState(false);
  // Máquinas: só as vendas para os licenciados da My Frost Sorveterias (etiqueta do cadastro do cliente)
  const [soLicenciados, setSoLicenciados] = useState(false);
  const { data: marcadores = [] } = useMarcadores();
  const [aberto, setAberto] = useState<(Partial<Pedido> & { itens: Item[] }) | null>(null);
  // Máquinas: vendas do ERP ou o histórico de propostas do Tiny (MF e My Frost)
  const [vista, setVista] = useState<"erp" | "tiny">("erp");
  const location = useLocation();
  const navigate = useNavigate();
  // vindo do Analista fiscal: só os pedidos apontados (ex.: vendas sem NF-e)
  const [destaque, setDestaque] = useState(() => lerDestaque(location.state));
  // cada tela mostra só a sua área (a lista apontada por outra tela aparece inteira)
  const pedidos = filtrar(pedidosTodos).filter((p) => !!destaque || ehMaquina(p) === (area === "maquinas"));
  useEffect(() => {
    // vindo do painel de vendas: já abre na situação clicada
    const status = (location.state as any)?.status;
    if (status && (STATUS as readonly string[]).includes(status)) {
      setFiltro(status);
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    const abrirId = (location.state as any)?.abrir;
    if (abrirId) {
      const p = pedidosTodos.find((x) => x.id === abrirId);
      if (!p) return;
      setAberto({ ...p, itens: p.itens ?? [] });
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    if ((location.state as any)?.novo) {
      setAberto({ ...novoPedido(cfgPedidos?.orcamento_observacoes), ...((location.state as any).cliente_id ? { cliente_id: (location.state as any).cliente_id } : {}) });
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, pedidosTodos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // pagamento, forma de pagamento, envio, NF, nº do pedido do cliente e foto de cada venda
  const fotos = useMemo(() => new Map(tiposProduto.filter((x) => x.foto_caminho).map((x) => [x.id, x.foto_caminho!])), [tiposProduto]);
  const tinyPorId = useMemo(() => new Map(docsTiny.map((d) => [`tiny:${d.tiny_id}`, d])), [docsTiny]);
  const dia = hoje();
  const info = useMemo(() => {
    const m = new Map<string, InfoVenda>();
    for (const p of pedidosTodos) {
      const contas = contasDaVenda(p);
      const doc = p.id_externo ? tinyPorId.get(p.id_externo) : undefined;
      const nf = (p.notas ?? []).find((n) => n.status === "autorizada" && n.ambiente !== "homologacao")?.numero ?? null;
      const comFoto = (p.itens ?? []).find((i) => i.produto_id && fotos.has(i.produto_id));
      m.set(p.id, {
        contas, pg: pagamentoDaVenda(p, contas, dia), meio: meioDaVenda(p, contas, doc?.fp), envio: envioDaVenda(p, p.envios ?? [], nf),
        sinais: sinaisDaVenda(p, contas), nf, oc: doc?.oc?.trim() || null, foto: comFoto ? urlFotoProduto(fotos.get(comFoto.produto_id!)) : null,
      });
    }
    return m;
  }, [pedidosTodos, tinyPorId, fotos, dia]);
  const [pagamento, setPagamento] = useState<SituacaoPagamento | "">("");

  // tudo menos a situação e o pagamento: as contagens dos botões seguem a busca, o período e os outros filtros
  const filtrados = useMemo(() => pedidos.filter((p) =>
    (!destaque || destaque.ids.includes(p.id)) &&
    (!marcador || !!p.marcadores?.includes(marcador)) &&
    (!soLicenciados || ehLicenciado(p.cliente)) &&
    (!situacaoTiny || (situacaoTiny === "-" ? !p.situacao_origem : p.situacao_origem === situacaoTiny)) &&
    noPeriodo(p.created_at, periodo) &&
    (!busca || combinaBusca([p.numero, p.numero_externo, info.get(p.id)?.oc, info.get(p.id)?.nf, p.codigo_rastreio, p.cliente?.codigo, p.cliente?.nome, p.cliente?.nome_fantasia, p.cliente?.cpf_cnpj, p.cliente?.municipio], busca)),
  ), [pedidos, busca, destaque, marcador, soLicenciados, situacaoTiny, periodo, info]); // eslint-disable-line react-hooks/exhaustive-deps
  const doPagamento = (p: Pedido) => !pagamento || info.get(p.id)?.pg?.situacao === pagamento;
  const semSituacao = useMemo(() => filtrados.filter(doPagamento), [filtrados, pagamento, info]); // eslint-disable-line react-hooks/exhaustive-deps
  const lista = useMemo(() => semSituacao.filter((p) => filtro === "todos" || p.status === filtro), [semSituacao, filtro]);
  const semPagamento = useMemo(() => filtrados.filter((p) => filtro === "todos" || p.status === filtro), [filtrados, filtro]);
  const situacoesTiny = useMemo(() => [...new Set(pedidos.map((p) => p.situacao_origem).filter((s): s is string => !!s))].sort(), [pedidos]);
  const selecionados = useMemo(() => pedidos.filter((p) => selecao.tem(p.id)), [pedidos, selecao]);
  const nFiltros = (marcador ? 1 : 0) + (situacaoTiny ? 1 : 0) + (soLicenciados ? 1 : 0);
  const limparFiltros = () => { setBusca(""); setMarcador(""); setSituacaoTiny(""); setSoLicenciados(false); setPeriodo(SEM_PERIODO); setFiltro("todos"); setPagamento(""); };
  const infoDe = (id: string) => info.get(id);
  // no rodapé: quanto da lista já entrou e quanto falta receber (pelas contas, valor da venda)
  const recebidoLista = somar(lista, (p) => info.get(p.id)?.pg?.recebido ?? 0);
  const aReceberLista = somar(lista, (p) => { const pg = info.get(p.id)?.pg; return pg && pg.situacao !== "sem_conta" ? pg.total - pg.recebido : 0; });

  async function excluirSelecionados() {
    const motivo = await pedirTexto(`Excluir ${selecionados.length} ${pl(selecionados.length, "pedido", "pedidos")}? Só orçamentos e vendas canceladas são excluídos `
      + "(venda aprovada, faturada ou entregue: cancele antes). O pedido some das listas e fica na auditoria. Escreva o motivo:", "",
      { titulo: "Excluir pedidos", ok: "Excluir", minimo: 5 });
    if (!motivo) return;
    try {
      const { data, error } = await supabase.rpc("excluir_pedidos", { p_ids: selecionados.map((p) => p.id), p_motivo: motivo });
      if (error) throw error;
      const r = data as { excluidos: number; pulados: { numero: number; motivo: string }[] };
      notify(`${r.excluidos} ${pl(r.excluidos, "pedido excluído", "pedidos excluídos")}.${r.pulados.length ? ` Ficaram ${r.pulados.length}: ${resumoPulados(r.pulados)}` : ""}`, r.pulados.length ? "erro" : undefined);
      selecao.limpar();
      invalidate("pedidos", "auditoria");
    } catch (e) { notifyError(e); }
  }

  return (
    <div>
      <PageHeader title={area === "maquinas" ? "Venda de Máquinas" : "Venda de Peças"}
        subtitle={area === "maquinas" ? "Propostas e vendas de máquinas: proposta, pedido, OP e nota fiscal. Com o histórico do Tiny da MF e da My Frost."
          : "Orçamentos e vendas de peças, do WhatsApp à entrega, com frete e nota fiscal."}
        actions={vista === "erp" ? <>
          <Button variant="secondary" disabled={!lista.length} onClick={() => exportarPedidos(lista, infoDe)}><FileDown size={16} /> Exportar</Button>
          {pode("editar_pedidos") && <Button onClick={() => setAberto(novoPedido(cfgPedidos?.orcamento_observacoes))}><Plus size={16} /> {area === "maquinas" ? "Nova proposta" : "Novo orçamento"}</Button>}
        </> : undefined} />

      {area === "maquinas" && <Tabs value={vista} onChange={setVista} options={[{ value: "erp", label: "Propostas e vendas" }, { value: "tiny", label: "Propostas do Tiny (MF e My Frost)" }]} />}
      {area === "maquinas" && vista === "tiny" ? (
        <PropostasTiny onNovoOrcamento={pode("editar_pedidos") ? (cliente_id, itens) => {
          setVista("erp");
          setAberto({ ...novoPedido(cfgPedidos?.orcamento_observacoes), cliente_id, itens });
        } : undefined} />
      ) : <>

      {destaque && <FaixaDestaque destaque={destaque} mostrando={lista.length}
        onLimpar={() => { setDestaque(null); navigate(location.pathname, { replace: true, state: null }); }} />}
      <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Buscar nº, cliente, CPF ou CNPJ…"
        periodo={periodo} onPeriodo={setPeriodo} rotuloData="Data" nFiltros={nFiltros} onLimpar={limparFiltros}
        filtros={<>
          <SelectMarcador valor={marcador} onChange={setMarcador} todos={marcadores} />
          {situacoesTiny.length > 0 && (
            <select className="input w-auto" aria-label="Situação no Tiny" value={situacaoTiny} onChange={(e) => setSituacaoTiny(e.target.value)}>
              <option value="">Situação no Tiny: todas</option>
              {situacoesTiny.map((s) => <option key={s} value={s}>Tiny: {s}</option>)}
              <option value="-">Feitos no ERP (sem Tiny)</option>
            </select>
          )}
          {area === "maquinas" && (
            <button type="button" aria-pressed={soLicenciados} onClick={() => setSoLicenciados((v) => !v)}
              title="Clientes com a etiqueta Licenciado My Frost (marque em Clientes: selecione e use a ação em lote)"
              className={`h-10 shrink-0 rounded-lg border px-3 text-sm font-semibold transition ${soLicenciados ? "border-purple-500 bg-purple-100 text-purple-800 ring-1 ring-purple-500" : "border-slate-200 bg-surface text-purple-700 hover:border-slate-300"}`}>
              Licenciados My Frost <span className="num ml-1 opacity-90">{pedidos.filter((x) => ehLicenciado(x.cliente)).length}</span>
            </button>
          )}
        </>} />
      <ChipsSituacao valor={filtro} onChange={setFiltro} cores={CORES_STATUS}
        opcoes={STATUS.map((st) => ({ value: st, label: ROTULO_STATUS[st], n: st === "todos" ? semSituacao.length : semSituacao.filter((x) => x.status === st).length }))} />
      {vePagamento && <ChipsPagamento valor={pagamento} onChange={setPagamento} lista={semPagamento} info={info} />}

      {/* Celular: cartões */}
      <div className="space-y-2 md:hidden">
        {lista.length > 0 && (
          <label className="flex items-center gap-2 px-1 text-sm text-slate-600">
            <input type="checkbox" className="h-5 w-5" checked={lista.every((p) => selecao.tem(p.id))} onChange={() => selecao.alternarTodos(lista.map((p) => p.id))} />
            Marcar todos da lista
          </label>
        )}
        {lista.map((p) => (
          <div key={p.id} className="relative rounded-xl border border-slate-200 bg-surface shadow-card">
          <input type="checkbox" className="absolute right-3 top-3 z-[1] h-5 w-5" checked={selecao.tem(p.id)} onChange={() => selecao.alternar(p.id)} aria-label={`Marcar o pedido ${p.numero}`} />
          <button type="button" onClick={() => setAberto({ ...p, itens: p.itens ?? [] })}
            className="flex w-full gap-3 rounded-xl p-4 pb-2 pr-10 text-left active:bg-slate-50">
            <MiniaturaVenda url={info.get(p.id)?.foto ?? null} nItens={(p.itens ?? []).length} />
            <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
              <span className="min-w-0 flex-1 font-bold text-fg">#{p.numero}<EtiquetaUnidade id={(p as any).unidade_id} />{p.origem === "loja" && <span className="ml-1.5 rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-bold text-sky-700">LOJA</span>}{p.via_portal && <SeloPortal />}{p.numero_externo && <span className="ml-1.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600" title={`Pedido nº ${p.numero_externo} do Tiny${p.situacao_origem ? ` (${p.situacao_origem})` : ""}`}>TINY {p.numero_externo}</span>} · {p.cliente?.nome}{p.cliente?.uf && <span className="ml-1 text-xs font-semibold text-slate-500">{p.cliente.uf}</span>}<SeloLicenciado cliente={p.cliente} /></span>
              <span className="flex shrink-0 flex-col items-end gap-1"><Badge value={p.status} forte />{p.status === "orcamento" && p.proposta_status && <Badge value={p.proposta_status} />}{p.situacao_origem && <SituacaoTiny s={p.situacao_origem} />}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-sm text-slate-500">
              <span className="min-w-0">{dataBR(p.created_at)} · {(p.itens ?? []).length} {(p.itens ?? []).length === 1 ? "item" : "itens"}{opsDe(p.id).map((o) => ` · OP #${o.numero}`).join("")}{info.get(p.id)?.nf && ` · NF ${info.get(p.id)!.nf}`}</span>
              <span className="num shrink-0 whitespace-nowrap text-base font-bold text-fg">{brl(p.valor_total)}</span>
            </div>
            {/* pagamento e envio em ícone, como no Tiny */}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {vePagamento && <span className="flex items-center gap-1.5"><IconeMeio meio={info.get(p.id)?.meio ?? null} /><EtiquetaPagamento pg={info.get(p.id)?.pg ?? null} compacta /></span>}
              {info.get(p.id) && <IconeEnvio envio={info.get(p.id)!.envio} compacto />}
            </div>
            <div className="mt-1.5"><ChipsMarcadores ids={p.marcadores} todos={marcadores} pequeno /></div>
            </div>
          </button>
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <BotaoMarcadores tabela="pedidos" registro={p} nome={["venda", "vendas"]} />
            <button type="button" onClick={() => setAberto({ ...p, itens: p.itens ?? [] })} className="flex items-center gap-0.5 px-2 py-1 text-sm font-semibold text-brand">Abrir <ChevronRight size={16} /></button>
          </div>
          </div>
        ))}
        {!isLoading && !lista.length && <p className="py-8 text-center text-sm text-slate-500">{area === "maquinas" ? "Nenhuma proposta ou venda de máquina." : "Nenhum pedido encontrado."}</p>}
      </div>

      {/* colunas mais justas: a lista inteira cabe no notebook sem rolar para o lado */}
      <div className="hidden md:block [&_.td]:px-2 [&_.th]:px-2 2xl:[&_.td]:px-3 2xl:[&_.th]:px-3">
      <Table
        empty={!isLoading && lista.length === 0}
        head={<><th className="th w-10"><input type="checkbox" className="h-4 w-4" aria-label="Marcar todos da lista" checked={lista.length > 0 && lista.every((p) => selecao.tem(p.id))} onChange={() => selecao.alternarTodos(lista.map((p) => p.id))} /></th>
          <th className="th w-12"><span className="sr-only">Produto</span></th><th className="th">Nº e data</th><th className="th">Cliente</th><th className="th">Situação</th>
          {area === "maquinas" && <th className="th">OP</th>}{vePagamento && <th className="th">Pagamento</th>}<th className="th text-right">Total</th>
          <th className="th"><span title="Embaixo do número: E estoque baixado · C contas lançadas · N NF-e autorizada · P proposta enviada">NF e feito</span></th><th className="th">Envio</th><th className="th"><span className="sr-only">Marcadores e abrir</span></th></>}
      >
        {lista.map((p) => (
          <tr key={p.id} className={`cursor-pointer hover:bg-slate-50 ${selecao.tem(p.id) ? "bg-brand/5" : ""}`} onClick={() => setAberto({ ...p, itens: p.itens ?? [] })}>
            <td className="td sel w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="h-4 w-4" checked={selecao.tem(p.id)} onChange={() => selecao.alternar(p.id)} aria-label={`Marcar o pedido ${p.numero}`} /></td>
            <td className="td w-12 py-1.5 pr-0"><MiniaturaVenda url={info.get(p.id)?.foto ?? null} nItens={(p.itens ?? []).length} descricao={(p.itens ?? []).map((x) => x.descricao).join(" · ")} /></td>
            <td className="td whitespace-nowrap font-medium">#{p.numero}<EtiquetaUnidade id={(p as any).unidade_id} />{p.origem === "loja" && <span className="ml-1.5 rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-bold text-sky-700">LOJA</span>}{p.via_portal && <SeloPortal />}
              {p.numero_externo && <div><span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600" title={`Pedido nº ${p.numero_externo} do Tiny${p.situacao_origem ? ` (${p.situacao_origem})` : ""}`}>TINY {p.numero_externo}</span></div>}
              <div className="text-xs font-normal text-slate-500">{dataBR(p.created_at)}</div>
              {info.get(p.id)?.oc && <div className="text-[11px] font-normal text-slate-500" title="Nº do pedido do cliente (ordem de compra ou pedido da loja), como veio do Tiny">Ped. {info.get(p.id)!.oc}</div>}</td>
            <td className="td">{p.cliente?.nome}{p.cliente?.uf && <span className="ml-1.5 rounded bg-slate-100 px-1 py-px text-[11px] font-bold text-slate-600" title="Estado do cliente">{p.cliente.uf}</span>}<SeloLicenciado cliente={p.cliente} /><div className="mt-1"><ChipsMarcadores ids={p.marcadores} todos={marcadores} pequeno /></div></td>
            <td className="td"><Badge value={p.status} forte />{p.status === "orcamento" && p.proposta_status && <div className="mt-1"><Badge value={p.proposta_status} /></div>}{p.situacao_origem && <div className="mt-1"><SituacaoTiny s={p.situacao_origem} /></div>}</td>
            {area === "maquinas" && <td className="td text-sm">{opsDe(p.id).length ? opsDe(p.id).map((o) => <div key={o.id}>#{o.numero} <span className="text-xs text-slate-500">{o.status}</span></div>) : <span className="text-slate-400">—</span>}</td>}
            {vePagamento && <td className="td"><span className="flex items-start gap-2"><IconeMeio meio={info.get(p.id)?.meio ?? null} /><EtiquetaPagamento pg={info.get(p.id)?.pg ?? null} /></span></td>}
            <td className="td whitespace-nowrap text-right font-medium">{brl(p.valor_total)}</td>
            <td className="td whitespace-nowrap">{info.get(p.id)?.nf ? <span className="num font-semibold text-fg" title="NF-e autorizada">{info.get(p.id)!.nf}</span>
              : <Badge value={p.notas?.find((n) => n.status !== "erro" && n.status !== "autorizada")?.status ?? null} />}
              {info.get(p.id) && <div className="mt-1"><SinaisVenda s={info.get(p.id)!.sinais} /></div>}</td>
            <td className="td min-w-[7.5rem] max-w-[12rem]">{info.get(p.id) && <IconeEnvio envio={info.get(p.id)!.envio} />}</td>
            {/* marcadores e a seta de abrir na mesma coluna (a linha inteira abre a venda) */}
            <td className="td whitespace-nowrap pl-0 text-right"><span className="inline-flex items-center gap-1">
              <span onClick={(e) => e.stopPropagation()}><BotaoMarcadores tabela="pedidos" registro={p} nome={["venda", "vendas"]} /></span>
              <ChevronRight size={18} className="text-brand" aria-hidden /></span></td>
          </tr>
        ))}
      </Table>
      </div>

      {/* quantidade e soma do que está na lista (valor da venda, não o da NF), como no Tiny; com seleção, as ações em lote */}
      <RodapeLista quantidade={lista.length} nome={["pedido", "pedidos"]} total={somar(lista, (p) => p.valor_total)} rotuloTotal="valor das vendas"
        extras={vePagamento ? [{ valor: recebidoLista, rotulo: "recebido", cor: "text-emerald-700" }, { valor: aReceberLista, rotulo: "a receber", cor: "text-sky-700" }].filter((x) => x.valor > 0) : undefined}
        selecionados={selecionados.length} totalSelecionados={somar(selecionados, (p) => p.valor_total)} onLimparSelecao={selecao.limpar}
        acoes={<>
          <Button variant="ghost" onClick={() => setMarcandoLote(true)}>Marcadores</Button>
          <Button variant="ghost" onClick={() => exportarPedidos(selecionados, infoDe)}><FileDown size={15} /> Exportar</Button>
          {tem("financeiro") && <Button variant="ghost" onClick={() => setLancando(true)}><Receipt size={15} /> Lançar contas</Button>}
          {pode("editar_pedidos") && tem("vendas", "financeiro") && <Button variant="ghost" className="!text-red-600" onClick={excluirSelecionados}><Trash2 size={15} /> Excluir</Button>}
        </>} />
      </>}

      {marcandoLote && <AplicarMarcadores tabela="pedidos" notas={selecionados} nome={["venda", "vendas"]} onClose={() => setMarcandoLote(false)} />}
      {lancando && <LancarContasLote pedidos={selecionados} onClose={(ok) => { setLancando(false); if (ok) selecao.limpar(); }} />}
      {aberto && <PedidoModal pedido={aberto} onClose={() => setAberto(null)} />}
    </div>
  );
}

const ORDEM_PAGAMENTO: SituacaoPagamento[] = ["recebido", "a_receber", "parcial", "vencido", "sem_conta"];
const CHIP_PAGAMENTO: Record<SituacaoPagamento, string> = { recebido: "Recebidas", a_receber: "A receber", parcial: "Recebidas em parte", vencido: "Vencidas", sem_conta: "Sem conta" };

/** Filtro pelo pagamento (pelas contas a receber), com a contagem: o que já foi pago e o que não foi. */
function ChipsPagamento({ valor, onChange, lista, info }: {
  valor: SituacaoPagamento | ""; onChange: (v: SituacaoPagamento | "") => void; lista: Pedido[]; info: Map<string, InfoVenda>;
}) {
  const n = (s: SituacaoPagamento) => lista.filter((p) => info.get(p.id)?.pg?.situacao === s).length;
  return (
    <div className="-mt-1 mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Pagamento">
      <span className="mr-0.5 text-xs font-semibold text-slate-500">Pagamento:</span>
      {ORDEM_PAGAMENTO.map((s) => {
        const qtd = n(s);
        if (!qtd && valor !== s) return null;
        const ativo = valor === s;
        return (
          <button key={s} type="button" aria-pressed={ativo} onClick={() => onChange(ativo ? "" : s)}
            title={s === "sem_conta" ? "Vendas sem conta a receber no ERP (as do Tiny vieram sem as contas)" : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition ${ativo ? "ring-2 ring-brand " : ""}${COR_PAGAMENTO[s]}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />{CHIP_PAGAMENTO[s]} <span className="num opacity-80">{qtd}</span>
          </button>
        );
      })}
      {valor && <button type="button" onClick={() => onChange("")} className="px-1 text-xs font-semibold text-slate-500 hover:text-fg">Todas</button>}
    </div>
  );
}

/** Cor de cada situação nos filtros (a mesma dos selos da lista); fundo sólido não muda com o tema. */
const CORES_STATUS: Partial<Record<(typeof STATUS)[number], { ponto: string; ativo: string }>> = {
  todos: { ponto: "bg-slate-400", ativo: "bg-solido-cinza" },
  orcamento: { ponto: "bg-purple-500", ativo: "bg-[#7c3aed]" },
  aprovado: { ponto: "bg-sky-500", ativo: "bg-solido-azul" },
  faturado: { ponto: "bg-indigo-500", ativo: "bg-[#4338ca]" },
  entregue: { ponto: "bg-emerald-500", ativo: "bg-solido-verde" },
  cancelado: { ponto: "bg-red-500", ativo: "bg-solido-vermelho" },
};

/** Cor da situação que veio do Tiny, pelo nome (entregue, faturado, cancelado…). */
const corTiny = (s: string) => {
  const t = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /cancel/.test(t) ? "bg-red-100 text-red-800 ring-red-200"
    : /entreg/.test(t) ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
    : /fatur|emitid/.test(t) ? "bg-indigo-100 text-indigo-800 ring-indigo-200"
    : /envi|transit|pronto|prepar/.test(t) ? "bg-orange-100 text-orange-800 ring-orange-200"
    : /aprov|andamento/.test(t) ? "bg-sky-100 text-sky-800 ring-sky-200"
    : /aberto|aguard/.test(t) ? "bg-amber-100 text-amber-800 ring-amber-200"
    : "bg-slate-100 text-slate-700 ring-slate-200";
};

/** Situação que o pedido tinha no Tiny (histórico importado). */
function SituacaoTiny({ s }: { s: string }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${corTiny(s)}`} title="Situação do pedido no Tiny">Tiny: {s}</span>;
}

/** Lança as contas a receber das vendas marcadas que ainda não têm conta (valor e parcelas da venda, não os da NF). */
function LancarContasLote({ pedidos, onClose }: { pedidos: Pedido[]; onClose: (ok: boolean) => void }) {
  const [modo, setModo] = useState<"recebidas" | "aberto">("recebidas");
  const [data, setData] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<{ pedidos: number; contas: number; total: number; pulados: { numero: number; motivo: string }[] } | null>(null);
  const invalidate = useInvalidate();
  const aptas = pedidos.filter((p) => ["aprovado", "faturado", "entregue"].includes(p.status));
  async function lancar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      const { data: r, error } = await supabase.rpc("lancar_contas_pedidos", { p_ids: pedidos.map((p) => p.id), p_recebidas: modo === "recebidas", p_data: data || null });
      if (error) throw error;
      setResultado(r as typeof resultado);
      invalidate("contas_receber", "pedidos", "auditoria");
    } catch (err) { notifyError(err); } finally { setOcupado(false); }
  }
  if (resultado) return (
    <Modal open onClose={() => onClose(true)} title="Contas lançadas">
      <p className="text-sm"><b>{resultado.contas}</b> {pl(resultado.contas, "conta lançada", "contas lançadas")} de <b>{resultado.pedidos}</b> {pl(resultado.pedidos, "venda", "vendas")} · total <b>{brl(resultado.total)}</b>.</p>
      {resultado.pulados.length > 0 && (
        <div className="mt-3"><p className="text-sm font-semibold">Ficaram de fora ({resultado.pulados.length}):</p>
          <ul className="mt-1 max-h-60 space-y-0.5 overflow-auto text-sm text-slate-600">{resultado.pulados.map((x) => <li key={x.numero}>#{x.numero}: {x.motivo}</li>)}</ul>
        </div>
      )}
      <div className="mt-4 flex justify-end"><Button onClick={() => onClose(true)}>Fechar</Button></div>
    </Modal>
  );
  return (
    <Modal open onClose={() => onClose(false)} title="Lançar contas a receber">
      <form onSubmit={lancar} className="space-y-3 text-sm">
        <p>{pedidos.length} {pl(pedidos.length, "venda marcada", "vendas marcadas")}; {aptas.length} {pl(aptas.length, "pode", "podem")} ter conta (aprovada, faturada ou entregue). As que já têm conta a receber ficam de fora.
          O valor é o <b>da venda</b> (não o da NF), nas parcelas da venda.</p>
        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold">Como lançar</legend>
          <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5">
            <input type="radio" name="modo" className="mt-0.5" checked={modo === "recebidas"} onChange={() => setModo("recebidas")} />
            <span><b>Já recebidas</b> (histórico): entram pagas, sem aviso ao cliente, sem comissão e sem ir para a aprovação.</span>
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5">
            <input type="radio" name="modo" className="mt-0.5" checked={modo === "aberto"} onChange={() => setModo("aberto")} />
            <span><b>Em aberto</b> (a receber): entram na cobrança. A régua manda lembrete ao cliente 3 dias antes, no dia e 5 dias depois do vencimento; a comissão segue a regra do vendedor quando a conta for recebida.</span>
          </label>
        </fieldset>
        <Field label={modo === "recebidas" ? "Data do recebimento (vazio: o vencimento de cada parcela)" : "Primeiro vencimento (vazio: o prazo da própria venda)"}>
          <input type="date" className="input" value={data} max={modo === "recebidas" ? hoje() : undefined} onChange={(e) => setData(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={() => onClose(false)}>Cancelar</Button>
          <Button disabled={ocupado || !aptas.length}>{ocupado ? "Lançando…" : "Lançar contas"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function PedidoModal({ pedido: inicial, onClose }: { pedido: Partial<Pedido> & { itens: Item[] }; onClose: () => void }) {
  const { padrao, unidades } = useUnidade();
  const { data: ufsIcms = [] } = useRows<{ uf: string }>("icms_uf", { order: "uf", ascending: true });
  const [pendencias, setPendencias] = useState<Pendencia[] | null>(null);
  const etiquetas = useEtiquetas();
  const [p, setP] = useState({ ...inicial, unidade_id: (inicial as any).unidade_id ?? padrao });
  const [ocupado, setOcupado] = useState(false);
  const { data: clientes = [] } = useRows<Cliente>("clientes", { order: "nome", ascending: true });
  const { data: produtos = [] } = useRows<Produto & { garantia_meses?: number | null }>("produtos", { order: "descricao", ascending: true });
  const { data: cfg } = useConfig();
  const { data: vendedores = [] } = useRows<Vendedor>("vendedores", { order: "nome", ascending: true });
  const { data: regrasComissao = [] } = useRows<RegraComissao>("comissao_regras");
  const { data: linhasProduto = [] } = useRows<LinhaProduto>("linhas_produto", { order: "nome", ascending: true });
  const { data: tabelas = [] } = useRows<TabelaPreco>("tabelas_preco", { order: "nome", ascending: true });
  const { data: precosFixos = [] } = useRows<PrecoFixo>("tabela_preco_itens");
  // formas de pagamento cadastradas que a venda aceita (a já escolhida aparece mesmo se for inativada depois)
  const { data: formas = [] } = useFormasPagamento();
  const formasVenda = formas.filter((f) => MEIOS_VENDA.includes(f.meio) && f.uso !== "pagar" && (f.ativo || f.id === (p as any).forma_pagamento_id));
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [aba, setAba] = useState<"pedido" | "frete" | "auditoria">("pedido");
  const [acaoMotivo, setAcaoMotivo] = useState<"editar" | "reabrir" | null>(null);
  const invalidate = useInvalidate();
  const { pode, tem, user_id } = usePerfil();
  const podeEditar = pode("editar_pedidos");
  // link de pagamento (InfinitePay): vendas e financeiro veem; ao aprovar por Pix ou cartão, já sai pronto
  const verPagamento = tem("vendas", "financeiro");
  const temInfinitePay = useTemInfinitePay((p as any).unidade_id);
  const [linkAgora, setLinkAgora] = useState(false);
  // desconto acima do máximo (Configurações → Descontos): precisa da senha de aprovação de um administrador
  const { data: regrasDesc = [] } = useRows<RegraDesconto>("regras_desconto", { order: "canal", ascending: true });
  const [aprovarDesc, setAprovarDesc] = useState<string | null>(null);
  const editavel = podeEditar && (!p.id || p.status === "orcamento");
  // pedido aprovado: vendedor, comissão, origem e observações mudam com motivo; itens e valores só reabrindo
  const ajustavel = podeEditar && !!p.id && ["aprovado", "faturado", "entregue"].includes(p.status ?? "");
  const livre = editavel || ajustavel;
  const [salvo, setSalvo] = useState(() => ({ vendedor_id: inicial.vendedor_id ?? null, comissao_percentual: inicial.comissao_percentual ?? null, origem: inicial.origem, observacoes: inicial.observacoes ?? null }));
  const alterado = ajustavel && (["vendedor_id", "comissao_percentual", "origem", "observacoes"] as const).some((k) => ((p as any)[k] ?? null) !== ((salvo as any)[k] ?? null));
  // orçamento novo já vem com quem está vendendo (se a pessoa tem cadastro de vendedor)
  const vendedorPadrao = useRef(false);
  useEffect(() => {
    if (vendedorPadrao.current || p.id || p.vendedor_id || !vendedores.length) return;
    vendedorPadrao.current = true;
    const meu = vendedores.find((v) => v.user_id === user_id && v.ativo);
    if (meu) setP((x) => ({ ...x, vendedor_id: meu.id, vendedor: meu.nome }));
  }, [vendedores, p.id, p.vendedor_id, user_id]);
  const cliente = clientes.find((c) => c.id === p.cliente_id);
  // orçamento novo: vendedor e forma de pagamento padrão do cadastro do cliente
  function escolherCliente(id: string) {
    const c = clientes.find((x) => x.id === id);
    const patch: Record<string, unknown> = { cliente_id: id };
    if (c && !p.id) {
      const v = c.vendedor_id && vendedores.find((x) => x.id === c.vendedor_id && x.ativo);
      if (v) Object.assign(patch, { vendedor_id: v.id, vendedor: v.nome, comissao_percentual: null });
      const f = c.forma_pagamento_id && formasVenda.find((x) => x.id === c.forma_pagamento_id && x.ativo);
      if (f) Object.assign(patch, { forma_pagamento_id: f.id, forma_pagamento: f.meio, parcelas: f.parcelas, intervalo_dias: f.intervalo_dias, primeiro_vencimento: somarDias(f.primeiro_em_dias) });
    }
    // tabela de preço do cliente (revendedor → Revenda), em orçamento ainda aberto
    const tabCliente = (c as any)?.tabela_preco_id as string | null | undefined;
    if (c && editavel && tabCliente && tabelaDe(tabCliente)?.ativo && tabCliente !== (p as any).tabela_preco_id) return usarTabela(tabCliente, true, patch as Partial<Pedido>);
    set(patch as Partial<Pedido>);
  }
  const subtotal = totalItens(p.itens);
  const pctDesc = subtotal > 0 ? Math.round((Number(p.desconto || 0) / subtotal) * 10000) / 100 : 0;
  const limiteDesc = maximoDesconto(regrasDesc, p.origem, p.forma_pagamento);
  const descAcima = !!limiteDesc && pctDesc > limiteDesc.max + 0.005;
  const descAprovado = Number(p.desconto_aprovado_pct ?? 0);
  const precisaAprovarDesc = descAcima && descAprovado + 0.005 < pctDesc;
  const total = Math.max(subtotal - Number(p.desconto || 0) + Number(p.frete || 0), 0);
  // comissão prevista: % por categoria de cada item (o % digitado no pedido vale acima de tudo)
  const comissaoPrevista = percentualPedido(regrasComissao, vendedores.find((v) => v.id === p.vendedor_id), p.itens,
    (id) => produtos.find((x) => x.id === id)?.categoria, p.comissao_percentual, {
      // linha do produto e desconto de cada item (preço da tabela do pedido x preço cobrado)
      linhaDe: (id) => linhasProduto.find((l) => l.id === produtos.find((x) => x.id === id)?.linha_id),
      precoListaDe: (id) => { const prod = produtos.find((x) => x.id === id); return prod ? precoNaTabela(tabelaDe((p as any).tabela_preco_id), prod, precosFixos).preco : null; },
      descontoPedido: Number(p.desconto || 0),
    });
  const set = (patch: Partial<Pedido>) => setP((x) => ({ ...x, ...patch }));
  // tabela de preço: novos itens entram com o preço dela; trocar a tabela reprecifica os itens do orçamento
  const tabelaDe = (id: string | null | undefined) => tabelas.find((t) => t.id === id) ?? null;
  const tabelaAtual = tabelaDe((p as any).tabela_preco_id);
  const precoDe = (prod: Produto, tabela = tabelaAtual) => precoNaTabela(tabela, prod, precosFixos).preco;
  function usarTabela(id: string | null, avisar = true, base: Partial<Pedido> = {}) {
    const t = tabelaDe(id);
    setP((x) => {
      const itens = (x.itens ?? []).map((i: Item) => {
        const prod = produtos.find((y) => y.id === i.produto_id);
        return prod ? { ...i, valor_unitario: precoNaTabela(t, prod, precosFixos).preco } : i;
      });
      if (avisar && itens.length) notify(`Preços dos itens: ${t ? t.nome : "preço de venda"}`);
      return { ...x, ...base, tabela_preco_id: id, itens } as typeof x;
    });
  }
  // desconto digitado em %; o pedido guarda o valor em R$. Pedido já salvo só muda se o % for digitado
  // (e aí acompanha a troca de itens).
  const [descPct, setDescPct] = useState(() => {
    const st = totalItens(inicial.itens), d = Number(inicial.desconto || 0);
    return d > 0 && st > 0 ? String(Math.round((d / st) * 10000) / 100).replace(".", ",") : "";
  });
  const pctDigitado = useRef(false);
  useEffect(() => {
    if (!pctDigitado.current) return;
    const pct = Math.min(100, Math.max(0, Number(descPct.replace(",", ".")) || 0));
    const v = Math.round(subtotal * pct) / 100;
    if (v !== Number(p.desconto || 0)) set({ desconto: v });
  }, [subtotal, descPct]); // eslint-disable-line react-hooks/exhaustive-deps

  async function executar(acao: () => Promise<unknown>, ok: string, fechar = true) {
    setOcupado(true);
    try {
      await acao();
      notify(ok);
      invalidate("pedidos", "produtos", "contas_receber", "notas_fiscais");
      if (fechar) onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(false);
    }
  }

  /** Grava o pedido e substitui os itens. Retorna o id. */
  async function gravar(): Promise<string> {
    if (!p.cliente_id) throw new Error("Selecione o cliente");
    if (!p.itens.length) throw new Error("Adicione ao menos um item");
    if (p.itens.some((i) => !(Number(i.quantidade) > 0))) throw new Error("Quantidade dos itens deve ser maior que zero");
    const parcelas = Number(p.parcelas);
    if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 24) throw new Error("Parcelas: de 1 a 24");
    if (Number(p.desconto || 0) < 0) throw new Error("O desconto não pode ser negativo");
    if (Number(p.desconto || 0) > subtotal) throw new Error(`O desconto (${brl(p.desconto)}) é maior que o valor dos itens (${brl(subtotal)})`);
    // o que veio junto da lista (contas, envios, transportadora) não é campo do pedido
    const { itens, cliente: _c, notas: _n, contas: _cr, envios: _en, transportadora: _tr, numero: _num, valor_produtos: _vp, valor_total: _vt, created_at: _ca,
      proposta_token: _pt, proposta_status: _ps, proposta_enviada_em: _pe, proposta_visualizada_em: _pv, proposta_respondida_em: _pr,
      proposta_validade: _pval, proposta_resposta_nome: _pn, desconto_aprovado_pct: _dap, desconto_aprovado_por: _dapp, desconto_aprovado_em: _dae, ...cab } = p as any;
    const dados = limpar({
      ...cab,
      parcelas: Number(cab.parcelas), intervalo_dias: Number(cab.intervalo_dias),
      desconto: Number(cab.desconto || 0), frete: Number(cab.frete || 0), modalidade_frete: Number(cab.modalidade_frete),
    });
    const { data, error } = dados.id
      ? await supabase.from("pedidos").update(dados).eq("id", dados.id).select("id, numero").single()
      : await supabase.from("pedidos").insert(dados).select("id, numero").single();
    if (error) throw error;
    if (!p.id) setP((x) => ({ ...x, id: data.id, numero: data.numero, status: x.status ?? "orcamento" }));

    // Grava só o que mudou nos itens (o histórico do pedido mostra o que foi incluído, alterado e removido)
    const linha = (i: Item) => ({
      pedido_id: data.id, produto_id: i.produto_id, descricao: i.descricao,
      quantidade: i.quantidade, valor_unitario: i.valor_unitario, numero_serie: i.numero_serie || null,
      kit_escolha: i.kit_escolha?.length ? i.kit_escolha : null,
    });
    const { data: atuais, error: lerErr } = await supabase.from("pedido_itens").select("id").eq("pedido_id", data.id);
    if (lerErr) throw lerErr;
    const manter = new Set(itens.filter((i: Item) => i.id).map((i: Item) => i.id));
    const remover = (atuais ?? []).map((x: { id: string }) => x.id).filter((id: string) => !manter.has(id));
    if (remover.length) {
      const { error } = await supabase.from("pedido_itens").delete().in("id", remover);
      if (error) throw error;
    }
    for (const i of itens.filter((i: Item) => i.id && (atuais ?? []).some((x: { id: string }) => x.id === i.id))) {
      const { error } = await supabase.from("pedido_itens").update(linha(i)).eq("id", i.id!);
      if (error) throw error;
    }
    const novos = itens.filter((i: Item) => !i.id || !(atuais ?? []).some((x: { id: string }) => x.id === i.id));
    if (novos.length) {
      const { data: criados, error } = await supabase.from("pedido_itens").insert(novos.map(linha)).select("id");
      if (error) throw error;
      // os itens novos ganham o id (salvar de novo não duplica)
      let k = 0;
      const comId = itens.map((i: Item) => (!i.id || !(atuais ?? []).some((x: { id: string }) => x.id === i.id) ? { ...i, id: criados?.[k++]?.id } : i));
      setP((x) => ({ ...x, itens: comId }));
    }
    return data.id;
  }

  const salvar = (e: FormEvent) => { e.preventDefault(); executar(gravar, "Pedido salvo"); };

  const aprovar = () => {
    if (precisaAprovarDesc && limiteDesc) {
      return notify(`Desconto de ${pctTexto(pctDesc)} passa do máximo de ${pctTexto(limiteDesc.max)}: use "Aprovar desconto" (senha do administrador) antes de aprovar a venda.`, "erro");
    }
    const comLink = verPagamento && temInfinitePay && cfg?.link_pagamento_ao_aprovar !== false && MEIOS_LINK.includes(p.forma_pagamento ?? "");
    return executar(async () => {
      const id = await gravar();
      const { error } = await supabase.rpc("aprovar_pedido", { p_pedido: id });
      if (error) throw error;
      // NF-e automática: emite já, se o cadastro estiver ok (senão o aviso aparece e dá para emitir depois)
      if (cfg?.nfe_automatica) {
        const lista = conferirPedido({ cliente, unidade: unidades.find((u) => u.id === (p as any).unidade_id), produtos, itens: p.itens, aliquotasUf: ufsIcms.map((u) => u.uf) });
        if (lista.some((x) => x.nivel === "erro")) notify(`NF-e automática não enviada: ${lista.find((x) => x.nivel === "erro")!.texto}`, "erro");
        // em homologação a nota automática sairia só como teste: não emite sozinha
        else if ((await ambienteNfe().catch(() => "producao")) !== "producao") notify("NF-e automática não enviada: o ERP está em homologação (teste). Ajuste o FOCUS_NFE_ENV para producao.", "erro");
        else await callFunction("nfe-emitir", { pedido_id: id }).catch((e) => notify(`NF-e automática: ${(e as Error).message}`, "erro"));
      }
      // venda por Pix ou cartão: fica na tela com o link de pagamento pronto para mandar ao cliente
      if (comLink) {
        const { data } = await supabase.from("pedidos").select(SELECT).eq("id", id).single();
        if (data) setP({ ...(data as any), itens: (data as any).itens ?? [] });
        setLinkAgora(true);
      }
    }, cfg?.nfe_automatica ? "Venda aprovada: estoque baixado, parcelas geradas e NF-e enviada" : "Pedido aprovado: estoque baixado e parcelas geradas no financeiro", !comLink);
  };

  const cancelar = async () => {
    if (!(await confirmar("Cancelar este pedido? O estoque será devolvido e as parcelas em aberto canceladas."))) return;
    executar(async () => {
      const { error } = await supabase.rpc("cancelar_pedido", { p_pedido: p.id });
      if (error) throw error;
    }, "Pedido cancelado");
  };

  async function editarAprovado(motivo: string) {
    const dados = { vendedor_id: p.vendedor_id ?? "", comissao_percentual: p.comissao_percentual ?? "", origem: p.origem, observacoes: p.observacoes ?? "" };
    const { error } = await supabase.rpc("editar_pedido_aprovado", { p_pedido: p.id, p_dados: dados, p_motivo: motivo });
    if (error) throw error;
    setSalvo({ vendedor_id: p.vendedor_id ?? null, comissao_percentual: p.comissao_percentual ?? null, origem: p.origem, observacoes: p.observacoes ?? null });
    notify("Pedido alterado (comissões refeitas, se mudou o vendedor ou o %)");
    invalidate("pedidos", "comissoes", "auditoria");
  }

  async function reabrir(motivo: string) {
    const { error } = await supabase.rpc("reabrir_pedido", { p_pedido: p.id, p_motivo: motivo });
    if (error) throw error;
    const { data } = await supabase.from("pedidos").select(SELECT).eq("id", p.id!).single();
    if (data) setP({ ...(data as any), itens: (data as any).itens ?? [] });
    notify("Pedido reaberto: agora é orçamento. Altere e aprove de novo.");
    invalidate("pedidos", "produtos", "contas_receber", "comissoes", "auditoria", "expedicoes");
  }

  const entregar = () => executar(async () => {
    const { error } = await supabase.from("pedidos").update({ status: "entregue" }).eq("id", p.id!);
    if (error) throw error;
  }, "Pedido marcado como entregue");

  const emitirNfe = (conferido = false) => {
    if (!conferido) {
      // Compliance: confere cadastro antes de mandar para a SEFAZ (evita rejeição)
      const lista = conferirPedido({ cliente, unidade: unidades.find((u) => u.id === (p as any).unidade_id), produtos, itens: p.itens, aliquotasUf: ufsIcms.map((u) => u.uf) });
      if (lista.length) return setPendencias(lista);
    }
    setPendencias(null);
    executar(async () => {
      if (!(await confirmarSeTeste())) throw new Error("Emissão cancelada: ambiente de teste");
      await callFunction("nfe-emitir", { pedido_id: p.id });
    }, "NF-e enviada para a SEFAZ. Acompanhe em Notas fiscais.");
  };

  const mensagemWhats = () => {
    const linhas = p.itens.map((i) => `• ${i.quantidade}x ${i.descricao} — ${brl(i.quantidade * i.valor_unitario)}`);
    return [
      `Olá ${cliente?.nome.split(" ")[0] ?? ""}! Segue ${p.status === "orcamento" ? "o orçamento" : "o pedido"}${p.numero ? ` #${p.numero}` : ""} da *MF Máquinas*:`,
      "", ...linhas, "",
      Number(p.desconto) ? `Desconto: ${brl(p.desconto)}` : "",
      Number(p.frete) ? `Frete: ${brl(p.frete)}` : "",
      `*Total: ${brl(total)}*`,
      `Pagamento: ${FORMAS.find((f) => f.value === p.forma_pagamento)?.label}${Number(p.parcelas) > 1 ? ` em ${p.parcelas}x` : ""}`,
    ].filter((l) => l !== "").join("\n");
  };

  async function montarPdf(): Promise<Blob | null> {
    if (!cfg || !p.itens.length) return null;
    const garantias: Record<string, number> = {};
    for (const i of p.itens) {
      const prod = produtos.find((x) => x.id === i.produto_id);
      if (prod?.tipo === "maquina") garantias[i.produto_id] = prod.garantia_meses ?? cfg.garantia_meses_padrao;
    }
    return pdfOrcamento({
      numero: p.numero, status: p.status, cliente, itens: p.itens, desconto: Number(p.desconto || 0), frete: Number(p.frete || 0),
      forma_pagamento: p.forma_pagamento ?? "boleto", parcelas: Number(p.parcelas || 1), observacoes: p.observacoes,
      vendedor: vendedores.find((v) => v.id === p.vendedor_id)?.nome ?? p.vendedor, garantias, validade: p.proposta_validade,
    }, comUnidade(cfg, unidades.find((u) => u.id === p.unidade_id)));
  }
  async function gerarPdf() {
    if (!p.itens.length) return notify("Adicione itens antes de gerar o PDF", "erro");
    try { setPdf(await montarPdf()); } catch (e) { notifyError(e); }
  }
  async function pdfBase64() {
    const b = await montarPdf();
    if (!b) return null;
    const bytes = new Uint8Array(await b.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  async function recarregar() {
    invalidate("pedidos");
    const id = p.id ?? (await supabase.from("pedidos").select("id").eq("proposta_token", p.proposta_token ?? "").maybeSingle()).data?.id;
    if (!id) return;
    const { data } = await supabase.from("pedidos").select("*").eq("id", id).single();
    if (data) setP((x) => ({ ...x, ...data, itens: x.itens }));
  }

  const temNotaValida = p.notas?.some((n) => n.ambiente !== "homologacao" && (n.status === "autorizada" || n.status === "processando"));

  return (
    <Modal open onClose={onClose} title={p.id ? `Pedido #${p.numero}` : "Novo pedido"} wide>
      <form onSubmit={salvar} className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {p.status && <Badge value={p.status} />}
          {p.via_portal && <span className="rounded-md bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-800">Veio do portal do representante{p.status === "orcamento" ? ": confira e aprove pelo fluxo normal" : ""}</span>}
          {p.id && <Tabs value={aba} onChange={setAba} options={[{ value: "pedido", label: "Pedido" }, { value: "frete", label: "Frete e envio" }, { value: "auditoria", label: "Conferências" }]} />}
        </div>

        {aba === "frete" && p.id && (
          <FreteVenda pedido={{ ...(p as any), cliente, itens: p.itens }} onAlterado={(patch) => set(patch as Partial<Pedido>)} />
        )}

        {aba === "auditoria" && p.id && (
          <AuditoriaPedido pedido={{ ...(p as any), itens: p.itens }} produtos={produtos}
            baseComissao={vendedores.find((v) => v.id === p.vendedor_id)?.base ?? null} />
        )}

        {aba === "pedido" && ajustavel && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            Pedido {p.status}: vendedor, comissão, origem e observações podem ser alterados (pede o motivo, que fica na auditoria).
            {temNotaValida
              ? " Itens, valores e pagamento já estão na NF-e autorizada: para mudar, cancele a nota ou emita uma NF de devolução."
              : <> Para mudar itens, valores ou pagamento, use <b>Reabrir pedido</b>: o estoque volta, as parcelas em aberto são canceladas e o pedido vira orçamento de novo.</>}
          </div>
        )}

        {aba === "pedido" && (<>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Cliente" className="sm:col-span-2">
            <ClienteBusca clientes={clientes} value={p.cliente_id} disabled={!editavel} required onChange={(id) => escolherCliente(id)} />
            {cliente && (cliente.condicao_pagamento || cliente.limite_credito != null || cliente.desconto_padrao) && (
              <span className="mt-1 block text-xs text-slate-500">
                {[cliente.condicao_pagamento && `Condição: ${cliente.condicao_pagamento}`,
                  cliente.desconto_padrao ? `desconto padrão ${String(cliente.desconto_padrao).replace(".", ",")}%` : null,
                  cliente.limite_credito != null && `limite de crédito ${brl(Number(cliente.limite_credito))}`].filter(Boolean).join(" · ")}
              </span>
            )}
          </Field>
          <div className="sm:col-span-2"><CampoUnidade value={(p as any).unidade_id} disabled={!editavel} onChange={(v) => set({ unidade_id: v } as Partial<Pedido>)} /></div>
          <Field label="Origem">
            <select className="input" value={p.origem} disabled={!livre} onChange={(e) => {
              const origem = e.target.value;
              // venda de marketplace usa a tabela do marketplace (se houver e ainda não tiver tabela)
              const tm = origem === "marketplace" && editavel && !(p as any).tabela_preco_id ? tabelas.find((t) => t.ativo && t.canal === "marketplace") : null;
              if (tm) usarTabela(tm.id, true, { origem }); else set({ origem });
            }}>
              <option value="whatsapp">WhatsApp</option>
              <option value="telefone">Telefone</option>
              <option value="presencial">Presencial</option>
              <option value="representante">Representante</option>
              <option value="loja">Loja virtual</option>
              <option value="marketplace">Marketplace</option>
            </select>
          </Field>
          {(tabelas.some((t) => t.ativo) || tabelaAtual) && (
            <Field label="Tabela de preço">
              <select className="input" value={(p as any).tabela_preco_id ?? ""} disabled={!editavel} onChange={(e) => usarTabela(e.target.value || null)}>
                <option value="">Preço de venda</option>
                {tabelas.filter((t) => t.ativo || t.id === (p as any).tabela_preco_id).map((t) => <option key={t.id} value={t.id}>{t.nome} ({ajusteTexto(t.ajuste_percentual)})</option>)}
              </select>
            </Field>
          )}
          <Field label="Vendedor / representante">
            <VendedorSelect value={p.vendedor_id} textoAntigo={p.vendedor} disabled={!livre}
              onChange={(id, nome) => set({ vendedor_id: id, vendedor: nome, comissao_percentual: null })} />
          </Field>
          {p.vendedor_id && (
            <Field label="Comissão (%)">
              <input className="input" inputMode="decimal" disabled={!livre} value={p.comissao_percentual ?? ""} placeholder={comissaoPrevista ? `automática ${pctTexto(comissaoPrevista.pct)}` : ""}
                onChange={(e) => set({ comissao_percentual: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) })} />
              {comissaoPrevista && subtotal > 0 && (
                <span className="mt-1 block text-xs text-slate-600" title="Em branco: % por categoria de cada item (regras em Comissões)">
                  ≈ {brl((subtotal - Number(p.desconto || 0)) * comissaoPrevista.pct / 100)}
                  {comissaoPrevista.faixas.length > 1 && ` · ${comissaoPrevista.faixas.map((f) => `${f.categorias.slice(0, 2).join(", ") || "outros"} ${pctTexto(f.pct)}`).join(" · ")}`}
                </span>
              )}
            </Field>
          )}
        </div>

        <ItensEditor itens={p.itens} onChange={(itens) => set({ itens } as any)} disabled={!editavel} comSerie filtro={(x) => x.vendavel !== false} precoDe={(x) => precoDe(x)} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Field label="Pagamento" className="col-span-2">
            <select className="input" value={(p as any).forma_pagamento_id ?? `meio:${p.forma_pagamento}`} disabled={!editavel} onChange={(e) => {
              const v = e.target.value;
              if (v.startsWith("meio:")) return set({ forma_pagamento: v.slice(5), forma_pagamento_id: null } as any);
              const f = formasVenda.find((x) => x.id === v);
              if (f) set({ forma_pagamento_id: f.id, forma_pagamento: f.meio, parcelas: f.parcelas, intervalo_dias: f.intervalo_dias, primeiro_vencimento: somarDias(f.primeiro_em_dias) } as any);
            }}>
              {formasVenda.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              {(!(p as any).forma_pagamento_id || !formasVenda.length) && <option value={`meio:${p.forma_pagamento}`}>{FORMAS.find((f) => f.value === p.forma_pagamento)?.label ?? p.forma_pagamento}</option>}
              {!formasVenda.length && FORMAS.filter((f) => f.value !== p.forma_pagamento).map((f) => <option key={f.value} value={`meio:${f.value}`}>{f.label}</option>)}
            </select>
          </Field>
          <Field label="Parcelas">
            <input className="input" type="number" min={1} max={24} value={p.parcelas} disabled={!editavel} onChange={(e) => set({ parcelas: Number(e.target.value) })} />
          </Field>
          <Field label="1º vencimento">
            <input className="input" type="date" value={p.primeiro_vencimento ?? ""} disabled={!editavel} onChange={(e) => set({ primeiro_vencimento: e.target.value })} />
          </Field>
          <Field label="Desconto (%)">
            <span className="relative block">
              <input className="input pr-8 text-right" inputMode="decimal" placeholder="0" value={descPct} disabled={!editavel}
                onChange={(e) => { pctDigitado.current = true; setDescPct(e.target.value.replace(/[^\d,.]/g, "").slice(0, 6)); }} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500" aria-hidden>%</span>
            </span>
            {Number(p.desconto) > 0 && <span className="mt-1 block text-xs text-slate-600">= {brl(p.desconto)} de desconto</span>}
            {descAcima && limiteDesc && (precisaAprovarDesc ? (
              <span className="mt-1 block text-xs text-amber-800">
                Passa do máximo de {pctTexto(limiteDesc.max)} ({rotuloRegra(p.origem ?? "todos", p.forma_pagamento)}).
                {editavel && <button type="button" className="ml-1 font-semibold text-brand underline" disabled={ocupado}
                  onClick={() => executar(async () => setAprovarDesc(await gravar()), "Orçamento salvo: falta a senha do administrador", false)}>Aprovar desconto</button>}
              </span>
            ) : <span className="mt-1 block text-xs font-semibold text-emerald-700">Desconto aprovado (até {pctTexto(descAprovado)})</span>)}
          </Field>
          <FreteRapido pedido={p as any} cliente={cliente} produtos={produtos} disabled={!editavel} podeCotar={pode("cotar_frete")}
            onChange={(patch) => set(patch as Partial<Pedido>)} />
          <Field label="Observações" className="col-span-2 sm:col-span-4">
            <input className="input" value={p.observacoes ?? ""} disabled={!livre} onChange={(e) => set({ observacoes: e.target.value })} />
          </Field>
        </div>

        <div className="text-right text-sm text-slate-600">
          Subtotal {brl(subtotal)} · <span className="num text-xl font-bold text-fg">Total {brl(total)}</span>
        </div>

        {p.id && verPagamento && ["aprovado", "faturado", "entregue"].includes(p.status ?? "") && (
          <PagamentoPedido pedido={p as any} cliente={cliente} gerarAgora={linkAgora} />
        )}
        {p.itens.length > 0 && (p.status === "orcamento" || !p.id || p.proposta_status) && (
          <PropostaPainel pedido={p} cliente={cliente} podeEditar={podeEditar} gravar={gravar} pdfBase64={pdfBase64} onAlterado={recarregar} />
        )}
        {p.id && <OcorrenciasPedido pedidoId={p.id} statusPedido={p.status ?? ""} />}
        {p.id && <Anexos entidade="pedido" id={p.id} />}

        </>)}

        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          {p.itens.length > 0 && (
            <Button type="button" variant="ghost" onClick={gerarPdf}><FileDown size={16} /> PDF {p.status && p.status !== "orcamento" ? "do pedido" : "do orçamento"}</Button>
          )}
          {cliente?.whatsapp && p.itens.length > 0 && (
            <a href={whatsappLink(cliente.whatsapp, mensagemWhats())} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-green-600 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-50">
              <MessageCircle size={16} /> Enviar no WhatsApp
            </a>
          )}
          {podeEditar && p.id && p.status !== "cancelado" && !temNotaValida && (
            <Button type="button" variant="secondary" onClick={cancelar} disabled={ocupado}><XCircle size={16} /> Cancelar pedido</Button>
          )}
          {pode("emitir_nfe") && (p.status === "aprovado" || p.status === "entregue") && !temNotaValida && (
            <Button type="button" variant="secondary" onClick={() => emitirNfe()} disabled={ocupado}><FileText size={16} /> Emitir NF-e</Button>
          )}
          {p.id && ["aprovado", "faturado", "entregue"].includes(p.status ?? "") && (
            <Button type="button" variant="secondary" title="Conferir, editar e imprimir as etiquetas de transporte e de volume"
              onClick={() => etiquetas.abrir({ tipo: "pedido", pedido_id: p.id! })}><Printer size={16} /> Etiquetas</Button>
          )}
          {podeEditar && (p.status === "aprovado" || p.status === "faturado") && (
            <Button type="button" variant="secondary" onClick={entregar} disabled={ocupado}><Truck size={16} /> Marcar entregue</Button>
          )}
          {ajustavel && !temNotaValida && (
            <Button type="button" variant="secondary" onClick={() => setAcaoMotivo("reabrir")} disabled={ocupado}><RotateCcw size={16} /> Reabrir pedido</Button>
          )}
          {ajustavel && alterado && (
            <Button type="button" onClick={() => setAcaoMotivo("editar")} disabled={ocupado}><Pencil size={16} /> Salvar alterações</Button>
          )}
          {editavel && <Button disabled={ocupado} variant="secondary">Salvar orçamento</Button>}
          {editavel && (
            <Button type="button" onClick={aprovar} disabled={ocupado}><CheckCircle2 size={16} /> Aprovar venda</Button>
          )}
        </div>
      </form>
      {pendencias && (
        <Modal open onClose={() => setPendencias(null)} title="Conferência fiscal antes de emitir">
          <ul className="space-y-1.5 text-sm">
            {pendencias.map((x, i) => (
              <li key={i} className="flex gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${x.nivel === "erro" ? "bg-red-500" : "bg-amber-500"}`} />{x.texto}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate-600">
            {pendencias.some((x) => x.nivel === "erro") ? "Corrija os itens em vermelho (no cadastro do cliente, do produto ou da unidade) e tente de novo: a SEFAZ rejeitaria a nota." : "São só alertas. Confira e, se estiver certo, emita assim mesmo."}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPendencias(null)}>Voltar</Button>
            {!pendencias.some((x) => x.nivel === "erro") && <Button type="button" onClick={() => emitirNfe(true)}>Emitir mesmo assim</Button>}
          </div>
        </Modal>
      )}
      {etiquetas.modal}
      {aprovarDesc && limiteDesc && (
        <AprovarDesconto percentual={pctDesc} maximo={limiteDesc.max} contexto="pedido" pedidoId={aprovarDesc} canal={p.origem ?? "todos"} forma={p.forma_pagamento ?? null}
          onClose={() => setAprovarDesc(null)}
          onAprovado={(r) => { setP((x) => ({ ...x, desconto_aprovado_pct: r.percentual })); setAprovarDesc(null); notify(`Desconto aprovado por ${r.aprovado_por}`); }} />
      )}
      {acaoMotivo === "editar" && (
        <MotivoAcao titulo={`Alterar pedido #${p.numero}`} rotulo="Salvar alterações" onConfirmar={editarAprovado} onClose={() => setAcaoMotivo(null)}>
          <p>O pedido já foi aprovado. A alteração fica na auditoria do pedido com o seu nome e o motivo.</p>
          {(p.vendedor_id ?? null) !== (salvo.vendedor_id ?? null) || (p.comissao_percentual ?? null) !== (salvo.comissao_percentual ?? null)
            ? <p>As comissões deste pedido que ainda não foram pagas são refeitas com o vendedor e o percentual novos.</p> : null}
        </MotivoAcao>
      )}
      {acaoMotivo === "reabrir" && (
        <MotivoAcao titulo={`Reabrir pedido #${p.numero}`} rotulo="Reabrir pedido" perigo onConfirmar={reabrir} onClose={() => setAcaoMotivo(null)}>
          <p>O pedido volta a ser orçamento para você mudar itens, valores e pagamento. Ao reabrir:</p>
          <ul className="list-disc pl-5">
            <li>o estoque que saiu volta;</li>
            <li>as parcelas em aberto no contas a receber são canceladas (novas são geradas ao aprovar de novo);</li>
            <li>as comissões ainda não pagas são canceladas.</li>
          </ul>
          <p>Não reabre se houver NF-e válida, parcela recebida ou comissão já paga.</p>
        </MotivoAcao>
      )}
      {pdf && (
        <PdfViewer blob={pdf} nome={`${p.status && p.status !== "orcamento" ? "pedido" : "orcamento"}-${p.numero ?? "rascunho"}-mf-maquinas.pdf`}
          titulo={p.numero ? `${p.status === "orcamento" ? "Orçamento" : "Pedido"} #${p.numero}` : "Orçamento (rascunho)"} onClose={() => setPdf(null)} />
      )}
    </Modal>
  );
}
