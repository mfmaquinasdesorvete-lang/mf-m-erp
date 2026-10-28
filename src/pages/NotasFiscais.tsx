import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { type Destaque, lerDestaque } from "@/lib/destaque";
import { FaixaDestaque } from "@/components/FaixaDestaque";
import { ArrowLeft, Ban, CalendarClock, FileDown, FlaskConical, Lightbulb, ListChecks, RefreshCw, Scale, Search, Send, Settings2, ShieldCheck, Tags, Undo2, Upload } from "lucide-react";
import { AcoesNoTopo, Button, CelulaAbrir, chip, MaisAcoes, PageHeader, Table, Tabs } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { useUnidade, EtiquetaUnidade } from "@/lib/unidade";
import { brl, dataBR, digitos, docFormat, hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { baixarPlanilha } from "@/lib/exportar";
import { callFunction, supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { InutilizarModal, RegrasTributacao } from "@/components/FiscalAvancado";
import { ComplianceFiscal } from "@/components/ComplianceFiscal";
import { EmitirNfeModal } from "@/components/EmitirNfe";
import { ConfigNfe } from "@/components/ConfigNfe";
import { NfsePainel } from "@/components/nfse/NfsePainel";
import { ImportarXmlNotas, type TipoImportacao } from "@/components/ImportarXmlNotas";
import { ABAS_EMITIDAS, ABAS_RECEBIDAS, numeroDaChave, situacaoEmitida, situacaoRecebida, type Situacao } from "@/lib/notas";
import { guiaRejeicao } from "@/lib/faturamento";
import { PainelFaturamento } from "@/components/nfe/PainelFaturamento";
import { AplicarMarcadores, ChipsMarcadores, GerenciarMarcadores, TituloMarcadores, useMarcadores, type TabelaNota } from "@/components/nfe/Marcadores";
import { NotaDetalhe, type NotaEmitida } from "@/components/nfe/NotaDetalhe";
import { RecebidaDetalhe, type Recebida } from "@/components/nfe/RecebidaDetalhe";
import { ConferirItensNotas } from "@/components/compras/ConferirItensNotas";
import { Excluidas, useExcluidas } from "@/components/nfe/Excluidas";
import { DiagnosticoNfe } from "@/components/nfe/DiagnosticoNfe";
import { SeloValidacao, useValidacoes, ValidarNfe } from "@/components/nfe/ValidarNfe";
import { IconePostos, useEventosNfe } from "@/components/nfe/PostosFiscais";
import { LegendaEvolucao, TrilhaEvolucao, useEvolucaoEmitidas, useEvolucaoRecebidas } from "@/components/nfe/Evolucao";
import { FILTROS_EMITIDAS, FILTROS_RECEBIDAS, evolucaoEmitida, evolucaoRecebida, type Evolucao } from "@/lib/evolucaoNota";
import { operacaoNota } from "../../supabase/functions/_shared/nfe-operacoes";
import { buscaDaAba, useAbaUrl } from "@/lib/abaUrl";
import { CamposNota, camposEmUso, CartoesNotas, useFiltrosNotas } from "@/components/nfe/FiltrosNotas";
import { partesDaSaida } from "@/lib/analistaFiscal";
import { BarraFiltros } from "@/components/filtros/BarraFiltros";
import { noPeriodoOuPendente } from "@/lib/filtroLista";
import { FILTRO_VAZIO, passaFiltro } from "@/lib/filtroNotas";
import { useComprasMarketplace } from "@/lib/comprasMarketplace";
import { NOME_MARKETPLACE, OPCOES_FILTRO_MARKETPLACE, passaMarketplace } from "@/lib/marketplaces";

const CAMPOS_RECEBIDA = "id, chave, emitente_nome, emitente_cnpj, valor_total, data_emissao, situacao, manifestacao, nfe_completa, fornecedor_id, conta_pagar_id, estoque_lancado, processamento, processamento_msg, unidade_id, origem, marcadores, observacao_interna, finalidade, chegou_em, chegou_como, conferencia, conferencia_obs";
const POR_VEZ = 200;
const sem = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Planilha do que está na lista (aba, filtros e busca aplicados). */
function exportarNotas(arquivo: string, linhas: Record<string, unknown>[]) {
  baixarPlanilha(arquivo, [{ nome: "Notas", linhas }]).catch(notifyError);
}

/** Busca + "mostrar mais" para listas grandes (as notas importadas do sistema anterior). */
function useBusca<T>(lista: T[], texto: (x: T) => string) {
  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(POR_VEZ);
  const termos = sem(busca).split(/\s+/).filter(Boolean);
  const filtrada = termos.length ? lista.filter((x) => { const t = sem(texto(x)); return termos.every((p) => t.includes(p)); }) : lista;
  const campo = (
    <label className="relative block w-full sm:w-72">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input className="input pl-9" placeholder="Buscar nº, nome, CNPJ ou chave" value={busca} onChange={(e) => { setBusca(e.target.value); setLimite(POR_VEZ); }} />
    </label>
  );
  const mais = filtrada.length > limite && (
    <div className="mt-3 flex items-center justify-center gap-3 text-sm text-slate-500">
      Mostrando {limite} de {filtrada.length}
      <Button variant="secondary" onClick={() => setLimite(limite + POR_VEZ)}>Mostrar mais</Button>
    </div>
  );
  const buscar = (v: string) => { setBusca(v); setLimite(POR_VEZ); };
  return { filtrada, limite, total: filtrada.length, campo, mais, busca, buscar };
}

function BotaoImportar({ tipo, rotulo }: { tipo: TipoImportacao; rotulo: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setAberto(true)}><Upload size={16} /> {rotulo}</Button>
      {aberto && <ImportarXmlNotas tipo={tipo} onClose={() => setAberto(false)} />}
    </>
  );
}

/** Abas com contagem (Todas 388 · Pendentes 4 …), como no Tiny. */
function AbasContagem({ abas, valor, onChange }: { abas: { valor: string; rotulo: string; n: number; icone?: ReactNode }[]; valor: string; onChange: (v: string) => void }) {
  return (
    <div className="faixa-chips mb-3" role="tablist">
      {abas.map((a) => (
        <button key={a.valor} type="button" role="tab" aria-selected={valor === a.valor} onClick={() => onChange(a.valor)}
          className={chip(valor === a.valor)}>
          {a.icone}{a.rotulo}
          <span className={`rounded-full px-1.5 text-xs ${valor === a.valor ? "bg-black/15" : "bg-slate-100 text-slate-600"}`}>{a.n}</span>
        </button>
      ))}
    </div>
  );
}

function IconeSituacao({ s }: { s: Situacao }) {
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold ${s.cor}`}><s.Icone size={16} aria-hidden /> {s.rotulo}</span>;
}

/** Seleção de várias linhas para aplicar marcadores de uma vez. */
function useSelecao(ids: string[]) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const todos = ids.length > 0 && ids.every((id) => sel.has(id));
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const alternarTodos = () => setSel(todos ? new Set() : new Set(ids));
  const caixaTodos = <input type="checkbox" aria-label="Selecionar todas" checked={todos} onChange={alternarTodos} />;
  return { sel, setSel, alternar, caixaTodos };
}

function BarraSelecao({ n, onMarcadores, onLimpar }: { n: number; onMarcadores: () => void; onLimpar: () => void }) {
  if (!n) return null;
  return (
    <div className="sticky top-2 z-10 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-brand/40 bg-surface p-2 text-sm shadow-card">
      <b className="px-1">{n} {pl(n, "selecionada", "selecionadas")}</b>
      <Button type="button" variant="secondary" onClick={onMarcadores}><Tags size={15} /> Marcadores</Button>
      <Button type="button" variant="ghost" onClick={onLimpar}>Limpar seleção</Button>
    </div>
  );
}

// o que ainda pede ação continua na lista mesmo sendo de antes do período (a lista abre na semana)
const pendenteEmitida = (n: NotaEmitida) => ABAS_EMITIDAS.find((a) => a.valor === "pendentes")!.filtro(n as any);
const pendenteRecebida = (n: Recebida) => ABAS_RECEBIDAS.find((a) => a.valor === "pendentes")!.filtro(n as any);

function FiltroEtapa({ valor, onChange, opcoes }: { valor: string; onChange: (v: string) => void; opcoes: { valor: string; rotulo: string }[] }) {
  return (
    <select className="input min-w-0 sm:w-auto" value={valor} onChange={(e) => onChange(e.target.value)} aria-label="Filtrar pela evolução">
      <option value="">Etapa: todas</option>
      {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
    </select>
  );
}

function FiltroMarcador({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const { data: marcadores = [] } = useMarcadores();
  return (
    <select className="input min-w-0 sm:w-auto" value={valor} onChange={(e) => onChange(e.target.value)} aria-label="Filtrar por marcador">
      <option value="">Marcador: todos</option>
      {marcadores.filter((m) => m.ativo).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
    </select>
  );
}

export default function NotasFiscais() {
  const { pode, papel, tem } = usePerfil();
  const contador = papel === "contador";
  // perfil Compras (sem vendas nem financeiro): só as notas de fornecedor
  const soRecebidas = !contador && !tem("vendas", "financeiro") && pode("nfe_recebidas");
  const [aba, setAba] = useAbaUrl<"emitidas" | "recebidas" | "config" | "regras" | "compliance" | "nfse" | "faturamento">("emitidas", ["emitidas", "recebidas", "config", "regras", "compliance", "nfse", "faturamento"] as const);
  // "+ Emitir NF-e" do menu: abre a emissão
  const location = useLocation();
  const navigate = useNavigate();
  const [emitirAgora, setEmitirAgora] = useState(false);
  // vindo do painel de notas: abre a aba e o filtro clicados (ex.: recebidas "a resolver")
  const [filtroInicial, setFiltroInicial] = useState<string | undefined>(undefined);
  // vindo do Analista fiscal: a lista abre só com as notas apontadas
  const [destaque, setDestaque] = useState<Destaque | null>(null);
  useEffect(() => {
    const st = location.state as { emitir?: boolean; aba?: typeof aba; filtro?: string } | null;
    const d = lerDestaque(location.state);
    if (d) setDestaque(d);
    if (st?.emitir) {
      setEmitirAgora(true);
      navigate({ pathname: location.pathname, search: "" }, { replace: true, state: null });
    } else if (st?.aba) {
      setFiltroInicial(st.filtro);
      navigate({ pathname: location.pathname, search: buscaDaAba(st.aba, "emitidas") }, { replace: true, state: null });
    }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const ajuste = { config: "Configurações da NF-e", regras: "Regras de tributação", compliance: "Conferência fiscal (compliance)" }[aba as string] as string | undefined;
  return (
    <div>
      <PageHeader title="Notas fiscais" />
      {soRecebidas ? <Recebidas key={`${filtroInicial}-${destaque?.titulo ?? ""}`} filtroInicial={filtroInicial} destaque={destaque} onLimparDestaque={() => setDestaque(null)} /> : <>
      {/* só as notas nas abas; configuração, regras e conferência fiscal ficam no "Mais" das emitidas (pedido de 22/10) */}
      {ajuste ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setAba("emitidas")}><ArrowLeft size={16} /> Voltar para as notas</Button>
          <span className="font-display text-lg font-semibold text-fg">{ajuste}</span>
        </div>
      ) : <Tabs value={aba} onChange={setAba} options={[
        { value: "emitidas", label: "Vendas · NF-e emitidas" },
        ...(pode("nfe_recebidas") || contador ? [{ value: "recebidas" as const, label: "Compras · NF-e recebidas" }] : []),
        { value: "nfse" as const, label: "Serviços · NFS-e" },
        { value: "faturamento", label: "Faturamento" },
      ]} />}
      {aba === "faturamento" ? <PainelFaturamento /> : aba === "nfse" ? <NfsePainel /> : aba === "compliance" ? <ComplianceFiscal /> : aba === "config" ? <>{pode("nfe_recebidas") && <DiagnosticoNfe />}<ConfigNfe podeEditar={papel === "admin"} irParaRegras={() => setAba("regras")} /></> : aba === "regras" ? <RegrasTributacao podeEditar={pode("nfe_recebidas")} /> : aba === "recebidas" && (pode("nfe_recebidas") || contador) ? <Recebidas key={`${filtroInicial}-${destaque?.titulo ?? ""}`} leitura={contador} filtroInicial={filtroInicial} destaque={destaque} onLimparDestaque={() => setDestaque(null)} /> : <Emitidas key={`${filtroInicial}-${destaque?.titulo ?? ""}`} leitura={contador} irPara={setAba} filtroInicial={filtroInicial} emitirAgora={emitirAgora} onEmitirAberto={() => setEmitirAgora(false)} destaque={destaque} onLimparDestaque={() => setDestaque(null)} />}
      </>}
    </div>
  );
}

function Emitidas({ leitura = false, irPara, emitirAgora = false, onEmitirAberto, filtroInicial, destaque, onLimparDestaque }: { leitura?: boolean; irPara?: (a: "config" | "regras" | "compliance") => void; emitirAgora?: boolean; onEmitirAberto?: () => void; filtroInicial?: string; destaque?: Destaque | null; onLimparDestaque?: () => void }) {
  const { filtrar, unidades } = useUnidade();
  // raiz do CNPJ das unidades da MF: nota para outra unidade é transferência
  const raizesUnidades = useMemo(() => new Set(unidades.map((u) => digitos(u.cnpj).slice(0, 8)).filter((r) => r.length === 8)), [unidades]);
  const { data: dataTodos = [], isLoading } = useRows<NotaEmitida & { excluida_em?: string | null }>("notas_fiscais", { select: "*, pedido:pedidos(numero, cliente:clientes(nome, nome_fantasia)), transferencia:transferencias(numero, destino_id)" });
  // chaves das saídas anuladas por NF de estorno (entrada de ajuste autorizada que as referencia)
  const estornadas = useMemo(() => new Set(dataTodos.filter((n) => n.tipo_operacao === "entrada" && n.finalidade === "ajuste" && n.status === "autorizada" && !n.excluida_em && n.chave_referenciada)
    .map((n) => String(n.chave_referenciada))), [dataTodos]);
  // tentativas recusadas do mesmo pedido viram uma linha só (a mais recente, com o número de tentativas);
  // se o pedido já tem nota autorizada/em processamento depois, as recusas antigas somem da lista
  const data = useMemo(() => juntarTentativas(filtrar(dataTodos).filter((n) => !n.excluida_em)), [dataTodos, filtrar]);
  const { data: marcadores = [] } = useMarcadores();
  const validacoes = useValidacoes();
  const eventosNfe = useEventosNfe();
  const [validarXml, setValidarXml] = useState(false);
  const { pode } = usePerfil();
  const podeFin = !leitura && pode("nfe_recebidas");
  const [aba, setAba] = useState(() => (filtroInicial && ABAS_EMITIDAS.some((a) => a.valor === filtroInicial) ? filtroInicial : "todas"));
  const [marcador, setMarcador] = useState("");
  const [etapa, setEtapa] = useState("");
  const { data: excluidas = [] } = useExcluidas("notas_fiscais", podeFin);
  // evolução de cada nota (e-mail, contas, estoque, etiqueta, despacho, entrega)
  const { data: evolucoes } = useEvolucaoEmitidas();
  const evolucao = useMemo(() => {
    const dia = hoje();
    const m = new Map<string, Evolucao>();
    for (const n of data) m.set(n.id, evolucaoEmitida(n as any, evolucoes?.get(n.id), dia, n.pedido_id ? null : operacaoNota(n.operacao ?? "venda")));
    return m;
  }, [data, evolucoes]);
  const filtroEtapa = FILTROS_EMITIDAS.find((f) => f.valor === etapa);
  const filtros = useFiltrosNotas();
  const daAba = aba === "excluidas" ? [] : data.filter(ABAS_EMITIDAS.find((a) => a.valor === aba)!.filtro).filter((n) => !destaque || destaque.ids.includes(n.id)).filter((n) => !marcador || (n.marcadores ?? []).includes(marcador))
    .filter((n) => !filtroEtapa || filtroEtapa.teste(evolucao.get(n.id)!))
    .filter((n) => passaFiltro({ data: null, numero: n.numero, valor: n.valor_total, uf: n.payload?.uf_destinatario }, { ...filtros.f, de: "", ate: "" })
      && noPeriodoOuPendente(n.created_at, filtros.f, pendenteEmitida(n)));
  const { filtrada, limite, mais, busca, buscar } = useBusca(daAba, (n) => [n.numero, n.chave, n.pedido?.numero, n.pedido?.cliente?.nome, n.pedido?.cliente?.nome_fantasia, n.destinatario_nome, n.destinatario_doc, n.payload?.natureza_operacao, situacaoEmitida(n).rotulo, ...(n.marcadores ?? []).map((id) => marcadores.find((m) => m.id === id)?.nome)].join(" "));
  const { sel, setSel, alternar, caixaTodos } = useSelecao(filtrada.map((n) => n.id));
  const [aberta, setAberta] = useState<NotaEmitida | null>(null);
  // uma nota só em destaque (ex.: vinda da busca do menu): já abre
  const [destaqueAberto, setDestaqueAberto] = useState<string | null>(null);
  useEffect(() => {
    const id = destaque?.ids.length === 1 ? destaque.ids[0] : null;
    const n = id && id !== destaqueAberto ? data.find((x) => x.id === id) : null;
    if (n) { setDestaqueAberto(n.id); setAberta(n); }
  }, [destaque, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const [janela, setJanela] = useState<"inutilizar" | "emitir" | "marcadores" | "gerenciar" | null>(null);
  const invalidate = useInvalidate();
  useEffect(() => {
    if (!emitirAgora) return;
    if (!leitura && pode("emitir_nfe")) setJanela("emitir");
    onEmitirAberto?.();
  }, [emitirAgora]); // eslint-disable-line react-hooks/exhaustive-deps

  // Com os gatilhos da Focus ativos o status muda sozinho no banco; recarrega enquanto houver nota processando.
  const processando = data.some((n) => n.status === "processando" || n.status === "contingencia");
  useEffect(() => {
    if (!processando) return;
    const t = setInterval(() => invalidate("notas_fiscais", "pedidos"), 8000);
    return () => clearInterval(t);
  }, [processando]); // eslint-disable-line react-hooks/exhaustive-deps

  // a nota aberta acompanha a lista (marcadores e situação atualizados)
  const abertaAtual = aberta ? data.find((n) => n.id === aberta.id) ?? aberta : null;
  const abas = [
    ...ABAS_EMITIDAS.map((a) => ({ valor: a.valor, rotulo: a.rotulo, n: data.filter(a.filtro).length,
      icone: a.valor === "teste" ? <FlaskConical size={14} /> : a.valor === "devolucoes" ? <Undo2 size={14} /> : undefined })),
    ...(podeFin ? [{ valor: "excluidas", rotulo: "Excluídas", n: excluidas.length }] : []),
  ].filter((a) => a.n > 0 || ["todas", "pendentes", "autorizadas", "canceladas"].includes(a.valor) || a.valor === aba);

  return (
    <>
      <BarraFiltros busca={busca} onBusca={buscar} placeholder="Buscar nº, nome, CNPJ ou chave"
        periodo={aba === "excluidas" ? undefined : filtros.f} onPeriodo={aba === "excluidas" ? undefined : (p) => filtros.setF({ ...filtros.f, ...p })} rotuloData="Emissão"
        filtros={aba === "excluidas" ? undefined : <><FiltroMarcador valor={marcador} onChange={setMarcador} /><FiltroEtapa valor={etapa} onChange={setEtapa} opcoes={FILTROS_EMITIDAS} /><CamposNota f={filtros.f} onChange={filtros.setF} comUf /></>}
        nFiltros={(marcador ? 1 : 0) + (etapa ? 1 : 0) + camposEmUso(filtros.f)}
        onLimpar={() => { buscar(""); setMarcador(""); setEtapa(""); filtros.setF(FILTRO_VAZIO); }} />
      {/* Emitir NF-e e o "Mais" ao lado do título da página (no celular a busca fica numa linha só) */}
      <AcoesNoTopo>
          {!leitura && pode("emitir_nfe") && <Button className="md:order-last" onClick={() => setJanela("emitir")}><Send size={16} /> Emitir NF-e</Button>}
          <MaisAcoes>
            <Button variant="secondary" onClick={() => setValidarXml(true)} title="Conferir arquivos XML com as regras oficiais da SEFAZ"><ShieldCheck size={16} /> Validar XML</Button>
            <Button variant="secondary" onClick={() => exportarNotas(`notas-emitidas-${aba}`, filtrada.map((n) => ({
              Número: n.numero ?? "", Emissão: dataBR(n.created_at), Pedido: n.pedido?.numero ?? "",
              "Cliente / destinatário": (n as any).transferencia?.numero != null ? `Transferência #${(n as any).transferencia.numero}` : n.pedido?.cliente?.nome ?? n.destinatario_nome ?? n.payload?.nome_destinatario ?? "",
              "CPF/CNPJ": docFormat(n.destinatario_doc), UF: n.payload?.uf_destinatario ?? "", Valor: Number(n.valor_total ?? 0),
              Situação: situacaoEmitida(n).rotulo, Natureza: n.payload?.natureza_operacao ?? "", Ambiente: n.ambiente === "homologacao" ? "teste" : "produção",
              Chave: n.chave ?? "", Marcadores: (n.marcadores ?? []).map((id) => marcadores.find((m) => m.id === id)?.nome).filter(Boolean).join(", "),
            })))}><FileDown size={16} /> Exportar</Button>
            {!leitura && <Button variant="ghost" onClick={() => setJanela("gerenciar")}><Settings2 size={16} /> Marcadores</Button>}
            {podeFin && <BotaoImportar tipo="emitidas" rotulo="Importar do Tiny (XML)" />}
            {podeFin && <Button variant="secondary" onClick={() => setJanela("inutilizar")}><Ban size={16} /> Inutilizar numeração</Button>}
            {irPara && <>
              <Button variant="ghost" onClick={() => irPara("config")}><Settings2 size={16} /> Configurações da NF-e</Button>
              <Button variant="ghost" onClick={() => irPara("regras")}><Scale size={16} /> Regras de tributação</Button>
              <Button variant="ghost" onClick={() => irPara("compliance")}><ShieldCheck size={16} /> Conferência fiscal</Button>
            </>}
          </MaisAcoes>
        </AcoesNoTopo>
      {destaque && onLimparDestaque && <FaixaDestaque destaque={destaque} mostrando={daAba.length} onLimpar={onLimparDestaque} />}
      <AbasContagem abas={abas} valor={aba} onChange={(v) => { setAba(v); setSel(new Set()); }} />
      <CartoesNotas tipo="emitidas" ativo={aba !== "excluidas"} periodo={filtros.f} notas={filtrada.map((n) => { const p = partesDaSaida(n, { paraOutraUnidade: n.destinatario_doc ? raizesUnidades.has(digitos(n.destinatario_doc).slice(0, 8)) : null, estornada: !!n.chave && estornadas.has(n.chave) }); return { valor: Number(n.valor_total ?? 0), situacao: situacaoEmitida(n).chave, venda: p.venda, transferencia: p.transferencia }; })} />
      <div className="mb-2"><LegendaEvolucao tipo="emitidas" /></div>
      {data.some((n) => n.status === "contingencia") && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <b>Contingência:</b> a SEFAZ ou a Focus não respondeu e há notas na fila. O ERP reenvia sozinho a cada 15 minutos
          (e a Focus usa o ambiente de contingência SVC quando a SEFAZ do estado está fora). Abra a nota para tentar agora.
        </div>
      )}
      {aba === "excluidas" ? <Excluidas tabela="notas_fiscais" /> : (
        <>
          <BarraSelecao n={sel.size} onMarcadores={() => setJanela("marcadores")} onLimpar={() => setSel(new Set())} />
          <div className="tabela-leve"><Table
            limite={limite}
            empty={!isLoading && daAba.length === 0}
            head={<>{!leitura && <th className="th w-8">{caixaTodos}</th>}<th className="th">Emissão</th><th className="th">Nº</th><th className="th">Cliente / destinatário</th><th className="th">UF</th><th className="th text-right">Valor</th><th className="th">Situação</th><th className="th">Evolução</th><th className="th"><TituloMarcadores /></th><th className="th" /></>}
          >
            {filtrada.map((n) => {
              const transf = (n as any).transferencia?.numero != null ? (n as any).transferencia : null;
              const nome = transf ? `Transferência #${transf.numero}` : n.pedido?.cliente?.nome ?? n.destinatario_nome ?? n.payload?.nome_destinatario ?? "—";
              const fantasia = n.pedido?.cliente?.nome_fantasia;
              return (
                <tr key={n.id} className="cursor-pointer focus-visible:bg-slate-50 hover:bg-slate-50" onClick={() => setAberta(n)} tabIndex={0} onKeyDown={(ev) => { if (ev.target === ev.currentTarget && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); setAberta(n); } }}>
                  {!leitura && <td className="td w-8" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Selecionar NF ${n.numero ?? ""}`} checked={sel.has(n.id)} onChange={() => alternar(n.id)} /></td>}
                  <td className="td whitespace-nowrap">{dataBR(n.created_at)}</td>
                  {/* celular: nº ao lado da emissão, e situação ao lado da evolução (cada uma numa linha deixava o cartão comprido) */}
                  <td className="td font-semibold max-md:!col-span-1">{n.numero ?? "—"}<div className="text-xs font-normal text-slate-500">{n.pedido?.numero != null ? `pedido #${n.pedido.numero}` : n.origem === "importada" ? "importada" : ""}</div></td>
                  <td className="td">{nome}
                    <div className="text-xs text-slate-500">{fantasia && fantasia !== nome ? fantasia : !fantasia && n.destinatario_doc ? docFormat(n.destinatario_doc) : ""}</div>
                    <EtiquetaUnidade id={n.unidade_id ?? undefined} /></td>
                  <td className="td">{n.payload?.uf_destinatario ?? "—"}</td>
                  <td className="td text-right">{brl(n.valor_total)}</td>
                  <td className={`td ${n.status === "erro" ? "" : "max-md:!col-span-1"}`}>
                    <IconeSituacao s={situacaoEmitida(n)} />
                    {n.chave && <div className="flex flex-wrap gap-1"><SeloValidacao nivel={validacoes.get(n.chave)?.nivel} quando={validacoes.get(n.chave)?.validado_em} /><IconePostos eventos={eventosNfe.get(n.chave)} /></div>}
                    {n.ambiente === "homologacao" && <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-2xs font-semibold text-amber-800" title="Emitida no ambiente de teste da SEFAZ"><FlaskConical size={11} /> teste</div>}
                    {n.finalidade === "devolucao" && <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-2xs font-semibold text-purple-800"><Undo2 size={11} /> devolução</div>}
                    {n.status === "erro" && n.mensagem && <div className="mt-1 line-clamp-2 max-w-xs text-xs text-slate-500">{n.mensagem}</div>}
                    {n.status === "erro" && guiaRejeicao(n.mensagem) && <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-2xs font-semibold text-amber-900" title="Abra a nota para ver o passo a passo"><Lightbulb size={11} /> {guiaRejeicao(n.mensagem)!.titulo}</div>}
                    {n.status === "erro" && (n as any)._tentativas > 1 && <div className="mt-0.5 text-2xs font-semibold text-rose-700">{(n as any)._tentativas} tentativas recusadas · corrija o cadastro antes de reenviar</div>}
                  </td>
                  <td className="td max-md:!col-span-1"><TrilhaEvolucao e={evolucao.get(n.id)!} /></td>
                  <td className="td"><ChipsMarcadores ids={n.marcadores} todos={marcadores} pequeno /></td>
                  <CelulaAbrir />
                </tr>
              );
            })}
          </Table></div>
          {mais}
        </>
      )}
      {janela === "emitir" && <EmitirNfeModal onClose={() => setJanela(null)} />}
      {validarXml && <ValidarNfe onClose={() => setValidarXml(false)} />}
      {janela === "inutilizar" && <InutilizarModal onClose={() => setJanela(null)} />}
      {janela === "gerenciar" && <GerenciarMarcadores onClose={() => setJanela(null)} />}
      {janela === "marcadores" && <AplicarMarcadores tabela="notas_fiscais" notas={data.filter((n) => sel.has(n.id))} onClose={() => setJanela(null)} />}
      {abertaAtual && <NotaDetalhe nota={abertaAtual} leitura={leitura} onClose={() => setAberta(null)} />}
    </>
  );
}

function Recebidas({ leitura = false, filtroInicial, destaque, onLimparDestaque }: { leitura?: boolean; filtroInicial?: string; destaque?: Destaque | null; onLimparDestaque?: () => void }) {
  const { filtrar } = useUnidade();
  const { data: dataTodos = [], isLoading } = useRows<Recebida & { excluida_em?: string | null }>("nfe_recebidas", { select: CAMPOS_RECEBIDA, order: "data_emissao" });
  const data = useMemo(() => filtrar(dataTodos).filter((n) => !n.excluida_em), [dataTodos, filtrar]);
  const { data: marcadores = [] } = useMarcadores();
  const validacoes = useValidacoes();
  const eventosNfe = useEventosNfe();
  const [validarXml, setValidarXml] = useState(false);
  const [aba, setAba] = useState(() => (filtroInicial && ABAS_RECEBIDAS.some((a) => a.valor === filtroInicial) ? filtroInicial : "todas"));
  const [marcador, setMarcador] = useState("");
  const [etapa, setEtapa] = useState("");
  const [mkt, setMkt] = useState("");
  const { porNota: marketplaceDe } = useComprasMarketplace();
  // compras vê e trabalha as notas; excluir, restaurar e lançar contas a pagar ficam com o financeiro
  const { tem } = usePerfil();
  const fin = !leitura && tem("financeiro");
  const { data: excluidas = [] } = useExcluidas("nfe_recebidas", fin);
  const { data: evolucoes } = useEvolucaoRecebidas();
  const evolucao = useMemo(() => new Map(data.map((n) => [n.id, evolucaoRecebida(n as any, evolucoes?.get(n.id))])), [data, evolucoes]);
  const filtroEtapa = FILTROS_RECEBIDAS.find((f) => f.valor === etapa);
  const filtros = useFiltrosNotas();
  const daAba = aba === "excluidas" ? [] : data.filter(ABAS_RECEBIDAS.find((a) => a.valor === aba)!.filtro).filter((n) => !destaque || destaque.ids.includes(n.id)).filter((n) => !marcador || (n.marcadores ?? []).includes(marcador))
    .filter((n) => !filtroEtapa || filtroEtapa.teste(evolucao.get(n.id)!))
    .filter((n) => passaMarketplace(marketplaceDe.get(n.id), mkt))
    .filter((n) => passaFiltro({ data: null, numero: numeroDaChave(n.chave), valor: n.valor_total }, { ...filtros.f, de: "", ate: "" })
      && noPeriodoOuPendente(n.data_emissao, filtros.f, pendenteRecebida(n)));
  const { filtrada, limite, mais, busca, buscar } = useBusca(daAba, (n) => [numeroDaChave(n.chave), n.chave, n.emitente_nome, n.emitente_cnpj, marketplaceDe.has(n.id) ? `marketplace ${NOME_MARKETPLACE[marketplaceDe.get(n.id)!]}` : "", n.processamento, situacaoRecebida(n).rotulo, ...(n.marcadores ?? []).map((id) => marcadores.find((m) => m.id === id)?.nome)].join(" "));
  const { sel, setSel, alternar, caixaTodos } = useSelecao(filtrada.map((n) => n.id));
  const [aberta, setAberta] = useState<Recebida | null>(null);
  const [janela, setJanela] = useState<"marcadores" | "gerenciar" | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [conferir, setConferir] = useState(false);
  const invalidate = useInvalidate();

  async function sincronizar() {
    setBuscando(true);
    try {
      const r = await callFunction("nfe-recebidas-sync", { acao: "sincronizar" });
      notify(`${r.processadas} ${pl(r.processadas, "nota", "notas")} ${pl(r.processadas, "sincronizada", "sincronizadas")}, ${r.automaticas} ${pl(r.automaticas, "processada", "processadas")} automaticamente${r.avisos?.length ? `. Não buscou: ${r.avisos.join("; ")}` : ""}`);
      invalidate("nfe_recebidas", "fornecedores", "contas_pagar");
    } catch (e) {
      notifyError(e);
    } finally {
      setBuscando(false);
    }
  }

  const abertaAtual = aberta ? data.find((n) => n.id === aberta.id) ?? aberta : null;
  const abas = [
    ...ABAS_RECEBIDAS.map((a) => ({ valor: a.valor, rotulo: a.rotulo, n: data.filter(a.filtro).length, icone: a.valor === "devolucoes" ? <Undo2 size={14} /> : undefined })),
    ...(fin ? [{ valor: "excluidas", rotulo: "Excluídas", n: excluidas.length }] : []),
  ].filter((a) => a.n > 0 || ["todas", "pendentes", "lancadas"].includes(a.valor) || a.valor === aba);
  const tabela: TabelaNota = "nfe_recebidas";

  return (
    <>
      {leitura ? <p className="mb-3 text-sm text-slate-500">Os XML das notas de fornecedores vão no pacote do fechamento (Painel do contador).</p> : <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button className="!min-h-0 !px-3 !py-2 text-sm" onClick={sincronizar} disabled={buscando}><RefreshCw size={16} className={buscando ? "animate-spin" : ""} /> Buscar<span className="hidden sm:inline"> notas</span> na SEFAZ</Button>
        <Button className="!min-h-0 !px-3 !py-2 text-sm" variant="secondary" onClick={() => setConferir(true)} title="Ligar os itens das notas aos produtos do ERP (cadastro e fornecedores)"><ListChecks size={16} /> Conferir itens<span className="hidden sm:inline"> das notas</span></Button>
        <MaisAcoes>
        <Button variant="secondary" onClick={() => setValidarXml(true)} title="Conferir arquivos XML com as regras oficiais da SEFAZ"><ShieldCheck size={16} /> Validar XML</Button>
        <Button variant="secondary" onClick={() => exportarNotas(`notas-recebidas-${aba}`, filtrada.map((n) => ({
          Número: numeroDaChave(n.chave), Emissão: dataBR(n.data_emissao), Fornecedor: n.emitente_nome ?? "", CNPJ: docFormat(n.emitente_cnpj),
          Valor: Number(n.valor_total ?? 0), Situação: situacaoRecebida(n).rotulo, Chave: n.chave ?? "",
          Marcadores: (n.marcadores ?? []).map((id) => marcadores.find((m) => m.id === id)?.nome).filter(Boolean).join(", "),
        })))}><FileDown size={16} /> Exportar</Button>
        <BotaoImportar tipo="recebidas" rotulo="Importar XML ou .zip" />
        {fin && <Button variant="secondary" title="Das notas importadas que ficaram só como histórico: as duplicatas que ainda vão vencer viram contas a pagar (sem repetir)"
          onClick={async () => {
            try {
              const { data: n, error } = await supabase.rpc("lancar_duplicatas_a_vencer");
              if (error) throw error;
              notify(n ? `${n} ${pl(n, "parcela", "parcelas")} a vencer ${pl(n, "lançada", "lançadas")} no contas a pagar` : "Nenhuma parcela a vencer sem conta lançada");
              invalidate("contas_pagar");
            } catch (e) { notifyError(e); }
          }}><CalendarClock size={16} /> Lançar contas a vencer</Button>}
        <Button variant="ghost" onClick={() => setJanela("gerenciar")}><Settings2 size={16} /> Marcadores</Button>
        </MaisAcoes>
        <p className="hidden text-sm text-slate-500 md:block">
          Notas emitidas contra os CNPJs da MF (ou o XML que o fornecedor mandou). O ERP dá ciência, lê o XML, lança o contas a pagar e dá entrada no estoque
          sozinho. Só pede ajuda quando um item ainda não tem produto vinculado.
        </p>
      </div>}
      <BarraFiltros busca={busca} onBusca={buscar} placeholder="Buscar nº, nome, CNPJ ou chave"
        periodo={aba === "excluidas" ? undefined : filtros.f} onPeriodo={aba === "excluidas" ? undefined : (p) => filtros.setF({ ...filtros.f, ...p })} rotuloData="Emissão"
        filtros={aba === "excluidas" ? undefined : <><FiltroMarcador valor={marcador} onChange={setMarcador} /><FiltroEtapa valor={etapa} onChange={setEtapa} opcoes={FILTROS_RECEBIDAS} />
          <select className="input min-w-0 sm:w-auto" value={mkt} onChange={(e) => setMkt(e.target.value)} aria-label="Compra em marketplace">
            <option value="">Marketplace: todas</option>
            {OPCOES_FILTRO_MARKETPLACE.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </select><CamposNota f={filtros.f} onChange={filtros.setF} /></>}
        nFiltros={(marcador ? 1 : 0) + (etapa ? 1 : 0) + (mkt ? 1 : 0) + camposEmUso(filtros.f)}
        onLimpar={() => { buscar(""); setMarcador(""); setEtapa(""); setMkt(""); filtros.setF(FILTRO_VAZIO); }} />
      {destaque && onLimparDestaque && <FaixaDestaque destaque={destaque} mostrando={daAba.length} onLimpar={onLimparDestaque} />}
      <AbasContagem abas={abas} valor={aba} onChange={(v) => { setAba(v); setSel(new Set()); }} />
      <CartoesNotas tipo="recebidas" ativo={aba !== "excluidas"} periodo={filtros.f} notas={filtrada.map((n) => ({ valor: Number(n.valor_total ?? 0), situacao: situacaoRecebida(n).chave }))} />
      <div className="mb-2"><LegendaEvolucao tipo="recebidas" /></div>
      {aba === "excluidas" ? <Excluidas tabela="nfe_recebidas" /> : (
        <>
          <BarraSelecao n={sel.size} onMarcadores={() => setJanela("marcadores")} onLimpar={() => setSel(new Set())} />
          <div className="tabela-leve"><Table
            limite={limite}
            empty={!isLoading && daAba.length === 0}
            head={<>{!leitura && <th className="th w-8">{caixaTodos}</th>}<th className="th">Emissão</th><th className="th">Nº</th><th className="th">Fornecedor</th><th className="th text-right">Valor</th><th className="th">Situação</th><th className="th">Evolução</th><th className="th"><TituloMarcadores /></th><th className="th" /></>}
          >
            {filtrada.map((n) => (
              <tr key={n.id} className="cursor-pointer focus-visible:bg-slate-50 hover:bg-slate-50" onClick={() => setAberta(n)} tabIndex={0} onKeyDown={(ev) => { if (ev.target === ev.currentTarget && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); setAberta(n); } }}>
                {!leitura && <td className="td w-8" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Selecionar NF ${numeroDaChave(n.chave)}`} checked={sel.has(n.id)} onChange={() => alternar(n.id)} /></td>}
                <td className="td whitespace-nowrap">{dataBR(n.data_emissao)}</td>
                <td className="td font-semibold">{numeroDaChave(n.chave)}</td>
                <td className="td">{n.emitente_nome}<EtiquetaUnidade id={n.unidade_id ?? undefined} /><div className="text-xs text-slate-500">{docFormat(n.emitente_cnpj)}</div></td>
                <td className="td text-right">{brl(n.valor_total)}</td>
                <td className={`td ${n.processamento_msg && !["concluido", "ignorada"].includes(n.processamento) ? "" : "max-md:!col-span-1"}`}>
                  <IconeSituacao s={situacaoRecebida(n)} />
                  {n.chave && <div className="flex flex-wrap gap-1"><SeloValidacao nivel={validacoes.get(n.chave)?.nivel} quando={validacoes.get(n.chave)?.validado_em} /><IconePostos eventos={eventosNfe.get(n.chave)} /></div>}
                  {n.finalidade === "devolucao" && <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-2xs font-semibold text-purple-800"><Undo2 size={11} /> devolução</div>}
                  {n.processamento_msg && !["concluido", "ignorada"].includes(n.processamento) && <div className="mt-1 line-clamp-2 max-w-xs text-xs text-slate-500">{n.processamento_msg}</div>}
                </td>
                <td className="td max-md:!col-span-1"><TrilhaEvolucao e={evolucao.get(n.id)!} /></td>
                <td className="td"><ChipsMarcadores ids={n.marcadores} todos={marcadores} pequeno /></td>
                <CelulaAbrir />
              </tr>
            ))}
          </Table></div>
          {mais}
        </>
      )}
      {janela === "gerenciar" && <GerenciarMarcadores onClose={() => setJanela(null)} />}
      {janela === "marcadores" && <AplicarMarcadores tabela={tabela} notas={data.filter((n) => sel.has(n.id))} onClose={() => setJanela(null)} />}
      {abertaAtual && <RecebidaDetalhe nota={abertaAtual} leitura={leitura} onClose={() => setAberta(null)} />}
      {conferir && <ConferirItensNotas onClose={() => setConferir(false)} />}
      {validarXml && <ValidarNfe onClose={() => setValidarXml(false)} />}
    </>
  );
}

/** Junta as tentativas recusadas (status erro) do mesmo pedido numa linha: fica a mais recente, com `_tentativas`. */
export function juntarTentativas<T extends { id: string; status: string; pedido_id?: string | null; created_at: string }>(notas: T[]): (T & { _tentativas?: number })[] {
  const porPedido = new Map<string, T[]>();
  for (const n of notas) if (n.pedido_id) porPedido.set(n.pedido_id, [...(porPedido.get(n.pedido_id) ?? []), n]);
  const esconder = new Set<string>();
  const tentativas = new Map<string, number>();
  for (const lista of porPedido.values()) {
    const erros = lista.filter((n) => n.status === "erro").sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (!erros.length) continue;
    const boa = lista.some((n) => n.status !== "erro" && n.status !== "cancelada" && n.created_at > erros[0].created_at);
    for (const e of (boa ? erros : erros.slice(1))) esconder.add(e.id);
    if (!boa) tentativas.set(erros[0].id, erros.length);
  }
  return notas.filter((n) => !esconder.has(n.id)).map((n) => (tentativas.has(n.id) ? { ...n, _tentativas: tentativas.get(n.id) } : n));
}
