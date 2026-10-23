import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BarraFiltros } from "@/components/filtros/BarraFiltros";
import { noPeriodoOuPendente, SEM_PERIODO, semanaAtual, type Periodo } from "@/lib/filtroLista";
import { SeloCidade } from "@/components/SeloCidade";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Camera, CheckCircle2, ClipboardCheck, FileDown, History, MessageCircle, PackageCheck, Plus, RotateCcw, ShieldCheck, ShieldOff, Trash2, Wrench,
} from "lucide-react";
import { Badge, CelulaAbrir, Button, Card, Field, MaisAcoes, Modal, PageHeader, Stat, Table, Tabs } from "@/components/ui";
import { BotaoMarcadores, ChipsMarcadores, SelectMarcador, useMarcadores } from "@/components/nfe/Marcadores";
import { ItensEditor, totalItens } from "@/components/ItensEditor";
import { Assinatura } from "@/components/Assinatura";
import { Anexos } from "@/components/Anexos";
import { PdfViewer } from "@/components/PdfViewer";
import { HistoricoModal } from "@/pages/Garantias";
import { limpar, useInvalidate, useRows, ler } from "@/lib/data";
import { sincronizarItens } from "@/lib/itens";
import { useUnidade, EtiquetaUnidade, CampoUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje, whatsappLink, pl } from "@/lib/format";
import { avisoOutraEmpresa, CONDICOES_REPARO_PADRAO, faltaParaConcluirOutraEmpresa, situacaoGarantia } from "@/lib/garantia";
import { notify, notifyError } from "@/lib/notify";
import { baixarPlanilha } from "@/lib/exportar";
import { confirmar } from "@/components/Dialogos";
import { supabase } from "@/lib/supabase";
import { apagarFotoOS, enviarFotoOS, urlsFotos } from "@/lib/fotos";
import { comUnidade, pdfOS } from "@/lib/pdf";
import { useConfig } from "@/lib/useConfig";
import type { Cliente, Equipamento, FotoOS, Item, ItemChecklist, OrdemServico, Produto } from "@/lib/types";
import { usePerfil } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { ClienteBusca } from "@/components/ClienteBusca";
import { NfseOS, useNfsesDaOS } from "@/components/nfse/NfseOS";
import { DocumentosExcluidos, ExcluirDocumento } from "@/components/ExcluirDocumento";
import { pixCopiaECola } from "@/lib/cobranca";
import { CONDICAO_REMOTA, EQUIPAMENTO_A_CONFIRMAR, deCampoHora, passoVideo, termoVideo, paraCampoHora, quandoAgendado, valorVideo } from "@/lib/osVideo";
import { CartaoEtapa, QuadroEtapas, diasDesde } from "@/components/quadro/QuadroEtapas";
import { PainelVideoChamadas } from "@/components/assistencia/PainelVideoChamadas";
import { ETAPAS_OS, proximoStatus, situacaoOS, type AcaoOS, type SituacaoOS } from "@/lib/quadroOS";
import { Columns3, List, PackageOpen, Send, Stethoscope, ThumbsUp, FolderOpen, Video } from "lucide-react";
import { GarantiaCliente, naGarantia, type MaquinaCliente } from "@/components/assistencia/GarantiaCliente";

const STATUS_EDITAVEIS = [
  { value: "aberta", label: "Aberta" },
  { value: "em_diagnostico", label: "Em diagnóstico" },
  { value: "aguardando_aprovacao", label: "Aguardando aprovação do cliente" },
  { value: "aguardando_peca", label: "Aguardando peça" },
  { value: "em_reparo", label: "Em reparo" },
  { value: "cancelada", label: "Cancelada" },
];

/** O que o técnico confere ao receber uma máquina de sorvete. */
const CHECKLIST_PADRAO = [
  "Cabo de energia e plugue", "Torneiras / bicos dosadores", "Bandeja de gotejamento", "Tampa do reservatório",
  "Painel e botões sem trincas", "Batedor / pás do cilindro", "Equipamento limpo (sem calda)", "Acessórios entregues junto",
];

const SELECT = "*, cliente:clientes(*), itens:os_itens(*)";
type Reabertura = { em: string; nome?: string | null; motivo: string; concluida_em?: string | null; voltou_para?: string };
type OSX = OrdemServico & {
  equipamento_id?: string | null; checklist?: ItemChecklist[]; fotos?: FotoOS[];
  assinatura_entrada?: string | null; assinatura_entrega?: string | null; recebido_por?: string | null; entregue_em?: string | null;
  reaberturas?: Reabertura[];
};
type OS = Partial<OSX> & { itens: Item[] };

const nova = (extra: Partial<OS> = {}): OS => ({
  status: "aberta", em_garantia: false, valor_mao_obra: 0, itens: [], data_entrada: hoje(),
  checklist: CHECKLIST_PADRAO.map((item) => ({ item, ok: true })), fotos: [], ...extra,
});

export default function Assistencia() {
  const { pode } = usePerfil();
  const location = useLocation();
  const navigate = useNavigate();
  const { filtrar } = useUnidade();
  const { data: ordensTodos = [], isLoading } = useRows<OSX>("ordens_servico", { select: SELECT });
  const ordens = filtrar(ordensTodos);
  const [mostrarFinalizadas, setMostrarFinalizadas] = useState(false);
  const [busca, setBusca] = useState("");
  const [marcador, setMarcador] = useState("");
  // abre na semana (pela entrada); OS ainda aberta de antes continua aparecendo
  const [periodo, setPeriodo] = useState<Periodo>(() => semanaAtual(hoje()));
  const naData = (o: OSX) => noPeriodoOuPendente((o as any).data_entrada ?? (o as any).created_at, periodo, !["entregue", "cancelada"].includes(o.status));
  const { data: marcadores = [] } = useMarcadores();
  const [aberta, setAberta] = useState<OS | null>(null);
  const [verExcluidas, setVerExcluidas] = useState(false);
  // quadro por etapas (como o Fluxo de pedidos) ou a lista de sempre; a escolha fica no aparelho
  const [modo, setModoState] = useState<"quadro" | "lista" | "video">(() => { try { const m = localStorage.getItem("erp.os.modo"); return m === "lista" || m === "video" ? m : "quadro"; } catch { return "quadro"; } });
  const setModo = (m: "quadro" | "lista" | "video") => { setModoState(m); try { localStorage.setItem("erp.os.modo", m); } catch { /* sem armazenamento */ } };
  const invalidarOS = useInvalidate();
  const [movendo, setMovendo] = useState<string | null>(null);

  // "Abrir OS" vindo da tela de garantias já traz cliente e máquina preenchidos
  useEffect(() => {
    const pre = (location.state as any)?.novaOS;
    if (pre) {
      setAberta(nova(pre));
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    // vindo do painel de pós-venda: abre a OS clicada
    const abrirId = (location.state as any)?.abrir;
    const o = abrirId && ordensTodos.find((x) => x.id === abrirId);
    if (o) {
      setAberta({ ...o, checklist: o.checklist ?? [], fotos: o.fotos ?? [], itens: o.itens ?? [] });
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, ordensTodos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => ordens.filter((o) =>
    (mostrarFinalizadas || !["entregue", "cancelada"].includes(o.status)) &&
    (!marcador || !!o.marcadores?.includes(marcador)) && naData(o) &&
    (!busca || `${o.numero} ${o.cliente?.nome} ${o.equipamento} ${o.numero_serie ?? ""}`.toLowerCase().includes(busca.toLowerCase())),
  ), [ordens, mostrarFinalizadas, busca, marcador, periodo]); // eslint-disable-line react-hooks/exhaustive-deps

  // quadro: cada OS (com a busca e o marcador) na etapa, com o próximo passo
  const noQuadro = useMemo(() => {
    const dia = hoje();
    return ordens.filter((o) => (!marcador || !!o.marcadores?.includes(marcador)) && naData(o) &&
      (!busca || `${o.numero} ${o.cliente?.nome} ${o.equipamento} ${o.numero_serie ?? ""}`.toLowerCase().includes(busca.toLowerCase())))
      .flatMap((o) => { const s = situacaoOS(o, dia); return s ? [{ id: o.id, etapa: s.etapa, nivel: s.nivel, alerta: s.alerta, desde: s.desde, valor: o.em_garantia ? 0 : Number(o.valor_total || 0), o, s }] : []; });
  }, [ordens, busca, marcador, periodo]); // eslint-disable-line react-hooks/exhaustive-deps
  const abrirOS = (o: OSX) => setAberta({ ...o, checklist: o.checklist ?? [], fotos: o.fotos ?? [], itens: o.itens ?? [] });
  async function avancar(o: OSX, acao: AcaoOS) {
    const status = proximoStatus(acao);
    if (!status) return abrirOS(o);
    setMovendo(o.id);
    const extra = acao === "aprovado" ? { orcamento_aprovado_em: o.orcamento_aprovado_em ?? new Date().toISOString(), orcamento_aprovado_por: o.orcamento_aprovado_por || "Cliente (pelo quadro)" } : {};
    const { error } = await supabase.from("ordens_servico").update({ status, ...extra }).eq("id", o.id);
    setMovendo(null);
    if (error) return notifyError(error);
    notify(`OS #${o.numero}: ${STATUS_EDITAVEIS.find((x) => x.value === status)?.label.toLowerCase() ?? status}`);
    invalidarOS("ordens_servico");
  }
  const BOTAO_OS: Record<AcaoOS, { rotulo: string; icon: typeof Send; secundario?: boolean }> = {
    diagnosticar: { rotulo: "Começar diagnóstico", icon: Stethoscope }, orcamento: { rotulo: "Orçamento enviado", icon: Send },
    aprovado: { rotulo: "Cliente aprovou", icon: ThumbsUp }, peca_chegou: { rotulo: "Peça chegou", icon: PackageOpen },
    concluir: { rotulo: "Abrir e concluir", icon: FolderOpen }, entregar: { rotulo: "Abrir e entregar", icon: FolderOpen },
    agendar: { rotulo: "Agendar", icon: FolderOpen }, abrir: { rotulo: "Abrir OS", icon: FolderOpen, secundario: true },
  };
  const cartaoOS = ({ o, s }: { o: OSX; s: SituacaoOS }) => {
    const b = BOTAO_OS[s.acao];
    const zap = o.cliente?.whatsapp && (s.etapa === "aprovacao" || s.etapa === "pronta")
      ? whatsappLink(o.cliente.whatsapp, s.etapa === "pronta"
        ? `Olá ${o.cliente.nome.split(" ")[0]}! Sua OS #${o.numero} (${o.equipamento}) está pronta para retirar na MF Máquinas.`
        : `Olá ${o.cliente.nome.split(" ")[0]}! Conseguiu ver o orçamento da OS #${o.numero} (${o.equipamento})? Fico à disposição.`) : null;
    return (
      <CartaoEtapa key={o.id} cor={ETAPAS_OS.find((e) => e.id === s.etapa)!.cor}
        titulo={<>#{o.numero} · {o.cliente?.nome ?? "—"}<SeloCidade cliente={o.cliente} /></>} subtitulo={o.equipamento}
        valor={o.em_garantia ? null : Number(o.valor_total || 0)} dias={diasDesde(s.desde)} nivel={s.nivel} alerta={s.alerta} proximo={s.proximo}
        etiquetas={<>
          <EtiquetaUnidade id={(o as any).unidade_id} />
          {o.em_garantia && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-2xs font-bold text-emerald-700">garantia</span>}
          {o.atendimento === "video" && <span className="rounded-md bg-purple-50 px-1.5 py-0.5 text-2xs font-bold text-purple-700">vídeo{o.agendado_em ? ` ${quandoAgendado(o.agendado_em)}` : ""}</span>}
          {o.tecnico && <span className="truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-2xs font-semibold text-slate-600">{o.tecnico.split(" ")[0]}</span>}
        </>}
        onAbrir={() => abrirOS(o)}
        botao={pode("editar_os") ? { rotulo: b.rotulo, icon: b.icon, secundario: b.secundario, ocupado: movendo === o.id, onClick: () => void avancar(o, s.acao) } : null}
        extra={zap ? <a href={zap} target="_blank" rel="noreferrer" title="Mandar mensagem no WhatsApp" className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-2 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50"><MessageCircle size={14} /> WhatsApp</a> : null} />
    );
  };

  const abertas = ordens.filter((o) => !["concluida", "entregue", "cancelada"].includes(o.status));
  const atrasadas = abertas.filter((o) => o.previsao && o.previsao < hoje()).length;

  return (
    <div>
      <PageHeader
        title="Ordens de serviço"
        subtitle="Recepção com checklist e fotos, laudo, peças, assinatura do cliente e histórico por nº de série."
        actions={<>
          {pode("editar_os") && <Button onClick={() => setAberta(nova())}><Plus size={16} /> Nova OS</Button>}
          {/* exportar e excluídas ficam no "Mais": o topo fica com uma linha só */}
          <MaisAcoes>
          <Button variant="secondary" onClick={() => baixarPlanilha("ordens-de-servico", [{ nome: "OS", linhas: lista.map((o) => ({
            OS: o.numero, Entrada: dataBR(o.data_entrada), Cliente: o.cliente?.nome ?? "", Equipamento: o.equipamento ?? "", Série: o.numero_serie ?? "",
            Situação: o.status, Garantia: o.em_garantia ? "sim" : "não", Previsão: dataBR(o.previsao), Valor: o.em_garantia ? 0 : Number(o.valor_total ?? 0),
            Faturada: o.faturada_em ? dataBR(o.faturada_em) : "",
            Marcadores: (o.marcadores ?? []).map((id) => marcadores.find((m) => m.id === id)?.nome).filter(Boolean).join(", "),
          })) }]).catch(notifyError)}><FileDown size={16} /> Exportar</Button>
          {pode("editar_os") && <Button variant="ghost" onClick={() => setVerExcluidas(true)}><Trash2 size={16} /> Excluídas</Button>}
          </MaisAcoes>
        </>}
      />

      {/* no quadro, os blocos das etapas já mostram os números */}
      {modo === "lista" && <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Wrench} tom="info" label="Em andamento" valor={abertas.length} />
        <Stat icon={PackageCheck} tom="bom" label="Prontas para retirar" valor={ordens.filter((o) => o.status === "concluida").length} />
        <Stat icon={ShieldCheck} label="Em garantia (abertas)" valor={abertas.filter((o) => o.em_garantia).length} />
        <Stat icon={ClipboardCheck} tom={atrasadas ? "critico" : "neutro"} label="Previsão estourada" valor={atrasadas} />
      </div>}

      <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Buscar nº, cliente, equipamento, série…"
        periodo={periodo} onPeriodo={setPeriodo} rotuloData="Entrada"
        filtros={<>
          <SelectMarcador valor={marcador} onChange={setMarcador} todos={marcadores} />
          {modo === "lista" && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={mostrarFinalizadas} onChange={(e) => setMostrarFinalizadas(e.target.checked)} /> Mostrar entregues e canceladas
            </label>
          )}
        </>}
        nFiltros={(marcador ? 1 : 0) + (mostrarFinalizadas ? 1 : 0)}
        onLimpar={() => { setBusca(""); setMarcador(""); setMostrarFinalizadas(false); setPeriodo(SEM_PERIODO); }}
        direita={
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-sm font-semibold" role="group" aria-label="Ver como">
            {([["quadro", "Quadro", Columns3], ["lista", "Lista", List], ["video", "Vídeo chamadas", Video]] as const).map(([v, l, I]) => (
              <button key={v} type="button" aria-pressed={modo === v} onClick={() => setModo(v)} aria-label={l} title={l}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 ${modo === v ? "bg-brand text-brand-fg" : "bg-surface text-slate-600 hover:bg-slate-50"}`}><I size={15} /> <span className={modo === v ? "" : "hidden sm:inline"}>{l === "Vídeo chamadas" ? <>Vídeo<span className="hidden sm:inline"> chamadas</span></> : l}</span></button>
            ))}
          </div>
        } />

      {modo === "video" ? (
        <PainelVideoChamadas ordens={ordens} onAbrir={abrirOS} />
      ) : modo === "quadro" ? (
        <QuadroEtapas etapas={ETAPAS_OS} itens={noQuadro} carregando={isLoading} nome={["OS", "OS"]} cartao={cartaoOS} />
      ) : (
      <Table
        empty={!isLoading && lista.length === 0}
        head={<><th className="th">OS</th><th className="th">Entrada</th><th className="th">Cliente</th><th className="th">Equipamento</th><th className="th">Situação</th><th className="th">Previsão</th><th className="th text-right">Valor</th><th className="th"><span className="sr-only">Marcadores</span></th><th className="th" /></>}
      >
        {lista.map((o) => (
          <tr key={o.id} className="cursor-pointer hover:bg-slate-50/70" onClick={() => setAberta({ ...o, checklist: o.checklist ?? [], fotos: o.fotos ?? [], itens: o.itens ?? [] })}>
            <td className="td font-bold text-fg">#{o.numero}<EtiquetaUnidade id={(o as any).unidade_id} /></td>
            <td className="td num">{dataBR(o.data_entrada)}</td>
            <td className="td">{o.cliente?.nome}<SeloCidade cliente={o.cliente} /><div className="mt-1"><ChipsMarcadores ids={o.marcadores} todos={marcadores} pequeno /></div></td>
            <td className="td">{o.equipamento}{o.numero_serie && <div className="text-xs text-slate-500">Série {o.numero_serie}</div>}</td>
            <td className="td"><div className="flex flex-wrap gap-1"><Badge value={o.status} />{o.em_garantia && <Badge value="em_garantia" />}
              {o.atendimento === "video" && <span title="Atendimento por vídeo chamada" className="whitespace-nowrap rounded-full bg-purple-100 px-2 py-0.5 text-2xs font-semibold text-purple-800">vídeo{o.agendado_em ? ` ${quandoAgendado(o.agendado_em)}` : " (agendar)"}</span>}
              {o.faturada_em && <span title="NFS-e autorizada: OS faturada" className="whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-2xs font-semibold text-emerald-800">faturada ✓</span>}</div></td>
            <td className={`td num ${o.previsao && o.previsao < hoje() && !["concluida", "entregue", "cancelada"].includes(o.status) ? "font-semibold text-red-600" : ""}`}>{dataBR(o.previsao)}</td>
            <td className="td num text-right">{o.em_garantia ? <span className="text-slate-500">garantia</span> : brl(o.valor_total)}</td>
            <td className="td" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-1">
                <BotaoMarcadores tabela="ordens_servico" registro={o} nome={["OS", "OS"]} />
                {pode("editar_os") && !o.faturada_em && <ExcluirDocumento tabela="ordens_servico" id={o.id} numero={o.numero} />}
              </div>
            </td>
            <CelulaAbrir />
          </tr>
        ))}
      </Table>
      )}

      {aberta && <OSModal os={aberta} onClose={() => setAberta(null)} />}
      {verExcluidas && <DocumentosExcluidos tabela="ordens_servico" onClose={() => setVerExcluidas(false)} />}
    </div>
  );
}

type Aba = "atendimento" | "checklist" | "fotos" | "pecas" | "entrega" | "nota";

function OSModal({ os: inicial, onClose }: { os: OS; onClose: () => void }) {
  const { padrao, unidades } = useUnidade();
  const [o, setO] = useState({ ...inicial, unidade_id: (inicial as any).unidade_id ?? padrao });
  const [aba, setAba] = useState<Aba>("atendimento");
  const [ocupado, setOcupado] = useState(false);
  const [pdf, setPdf] = useState<{ blob: Blob; nome: string; titulo: string } | null>(null);
  const [historico, setHistorico] = useState(false);
  const [reabrir, setReabrir] = useState(false);
  const { data: notasOS = [] } = useNfsesDaOS(o.id);
  const { data: clientes = [] } = useRows<Cliente>("clientes", { order: "nome", ascending: true });
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: equipamentos = [] } = useRows<Equipamento>("equipamentos", { order: "data_venda" });
  const { data: cfg } = useConfig();
  const invalidate = useInvalidate();
  const { pode } = usePerfil();
  const podeEditar = pode("editar_os");
  const encerrada = ["concluida", "entregue", "cancelada"].includes(o.status ?? "");
  // OS encerrada, ou usuário que não é técnico: só consulta (a entrega ainda pode ser registrada)
  const somenteLeitura = !podeEditar || encerrada;
  // nomes dos técnicos do cadastro de funcionários (só o nome; o resto do cadastro é do RH)
  const { data: tecnicos = [] } = useQuery({
    queryKey: ["funcionarios", "nomes_tecnicos"],
    queryFn: async () => ((await ler(supabase.rpc("nomes_tecnicos"))) ?? []).map((r: { nome: string }) => r.nome) as string[],
  });
  // técnicos do cadastro: os que já atenderam este cliente e os da região dele vêm primeiro
  const { data: daRegiao = [] } = useQuery({
    queryKey: ["tecnicos_do_cliente", o.cliente_id],
    enabled: !!o.cliente_id && !somenteLeitura,
    queryFn: async () => ((await supabase.rpc("tecnicos_do_cliente", { p_cliente: o.cliente_id })).data ?? []) as
      { nome: string; atendimentos: number; na_cidade: boolean; no_estado: boolean }[],
  });
  const { data: cadastroTecnicos = [] } = useQuery({
    queryKey: ["tecnicos", "nomes"],
    enabled: !somenteLeitura,
    queryFn: async () => ((await supabase.from("tecnicos").select("nome").eq("ativo", true).order("nome")).data ?? []).map((t: { nome: string }) => t.nome),
  });
  const sugestoesTecnico = new Map<string, string>();
  for (const t of daRegiao) sugestoesTecnico.set(t.nome, [t.atendimentos ? `já atendeu ${t.atendimentos}×` : "", t.na_cidade ? "na cidade" : t.no_estado ? "no estado" : ""].filter(Boolean).join(" · "));
  for (const n of [...cadastroTecnicos, ...tecnicos]) if (!sugestoesTecnico.has(n)) sugestoesTecnico.set(n, "");
  const cliente = clientes.find((c) => c.id === o.cliente_id);
  const equipCliente = equipamentos.filter((e) => e.cliente_id === o.cliente_id);
  const equip = equipamentos.find((e) => e.id === o.equipamento_id);
  const garantia = equip ? situacaoGarantia(equip.garantia_ate) : null;
  const pecas = totalItens(o.itens);
  const total = o.em_garantia ? 0 : pecas + Number(o.valor_mao_obra || 0);
  const set = (patch: Partial<OS>) => setO((x) => ({ ...x, ...patch }));
  // máquina vendida por outra empresa (ex.: My Frost): vem da máquina do cliente ou é marcada aqui
  const origem = (o.maquina_origem || equip?.origem || "").trim() || null;
  const aviso = origem ? avisoOutraEmpresa(origem, cfg) : "";
  const diasReparo = o.garantia_reparo_dias ?? cfg?.garantia_servico_dias ?? 90;

  function escolherEquipamento(id: string) {
    const e = equipamentos.find((x) => x.id === id);
    if (!e) return set({ equipamento_id: null });
    set({
      equipamento_id: e.id, produto_id: e.produto_id, equipamento: e.descricao, numero_serie: e.numero_serie,
      em_garantia: situacaoGarantia(e.garantia_ate) !== "fora_garantia", maquina_origem: e.origem ?? null,
    });
  }

  // máquina achada nas notas emitidas ou no cadastro do cliente (quadro de garantia)
  const taxaDiagnostico = Number(cfg?.taxa_diagnostico_video ?? 150);
  function usarMaquina(m: MaquinaCliente) {
    if (m.equipamento_id) return escolherEquipamento(m.equipamento_id);
    set({
      equipamento_id: null, equipamento: m.nota ? `${m.descricao} (${m.nota} de ${dataBR(m.data)})` : m.descricao,
      em_garantia: naGarantia(m, hoje()), maquina_origem: m.origem ?? null,
    });
  }
  function cobrarDiagnostico() {
    set({ em_garantia: false, valor_mao_obra: Number(o.valor_mao_obra || 0) || taxaDiagnostico });
    notify(`Diagnóstico por vídeo chamada (${brl(taxaDiagnostico)}) lançado na mão de obra: veja a aba Peças e valores`);
  }

  async function gravar(): Promise<string> {
    const { itens, cliente: _c, numero: _n, valor_pecas: _vp, valor_total: _vt, created_at: _ca, reaberturas: _r, ...cab } = o as any;
    // vídeo chamada sem a máquina escolhida: grava "a confirmar" (o equipamento é obrigatório no banco)
    if (cab.atendimento === "video" && !String(cab.equipamento ?? "").trim()) cab.equipamento = EQUIPAMENTO_A_CONFIRMAR;
    const dados = limpar({ ...cab, valor_mao_obra: Number(cab.valor_mao_obra || 0), maquina_origem: origem });
    const { data, error } = dados.id
      ? await supabase.from("ordens_servico").update(dados).eq("id", dados.id).select("id, numero").single()
      : await supabase.from("ordens_servico").insert(dados).select("id, numero").single();
    if (error) throw error;
    let comId = itens as Item[];
    if (!somenteLeitura) {
      // atualiza o que continua, grava o que entrou e só no fim tira o que saiu (nada some se a internet cair)
      const ids = await sincronizarItens("os_itens", "os_id", data.id, itens as Item[], (i) => ({
        produto_id: i.produto_id, descricao: i.descricao, quantidade: i.quantidade, valor_unitario: i.valor_unitario,
      }));
      comId = (itens as Item[]).map((i, k) => ({ ...i, id: ids[k] || i.id }));
    }
    set({ id: data.id, numero: data.numero, itens: comId });
    return data.id;
  }

  async function executar(acao: () => Promise<unknown>, ok: string, fechar = true) {
    setOcupado(true);
    try {
      await acao();
      notify(ok);
      invalidate("ordens_servico", "produtos", "contas_receber", "equipamentos");
      if (fechar) onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(false);
    }
  }

  const salvar = (e: FormEvent) => { e.preventDefault(); executar(gravar, "OS salva"); };

  const concluir = () => executar(async () => {
    // máquina de outra empresa: a OS precisa do registro completo (o banco confere de novo)
    const falta = origem ? faltaParaConcluirOutraEmpresa(o) : [];
    if (falta.length) {
      setAba(falta.some((f) => f.startsWith("orçamento")) && falta.length === 1 ? "pecas" : "atendimento");
      throw new Error(`Máquina vendida pela ${origem} (outra empresa): para concluir, preencha ${falta.join(", ")}.`);
    }
    const id = await gravar();
    const { error } = await supabase.rpc("concluir_os", { p_os: id });
    if (error) throw error;
  }, total > 0 ? "OS concluída: peças baixadas e cobrança gerada no financeiro" : "OS concluída");

  const entregar = () => {
    if (!o.assinatura_entrega || !o.recebido_por?.trim()) {
      setAba("entrega");
      return notify("Para entregar, preencha quem retirou e colha a assinatura do cliente.", "erro");
    }
    executar(async () => {
      const { error } = await supabase.from("ordens_servico").update({
        status: "entregue", entregue_em: new Date().toISOString(), recebido_por: o.recebido_por, assinatura_entrega: o.assinatura_entrega,
      }).eq("id", o.id!);
      if (error) throw error;
    }, "Equipamento entregue ao cliente");
  };

  async function enviarFotos(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    await executar(async () => {
      const id = o.id ?? (await gravar());
      const novas: FotoOS[] = [];
      for (const f of Array.from(arquivos)) novas.push({ caminho: await enviarFotoOS(id, f), criado_em: new Date().toISOString() });
      const fotos = [...(o.fotos ?? []), ...novas];
      const { error } = await supabase.from("ordens_servico").update({ fotos }).eq("id", id);
      if (error) throw error;
      set({ fotos });
    }, `${arquivos.length} ${pl(arquivos.length, "foto", "fotos")} ${pl(arquivos.length, "anexada", "anexadas")}`, false);
  }

  async function removerFoto(caminho: string) {
    // a foto de entrada é prova em garantia: pergunta antes e só apaga o arquivo depois que a OS deixou de apontar para ele
    if (!(await confirmar("Apagar esta foto da OS? Não dá para desfazer.", { perigo: true }))) return;
    const fotos = (o.fotos ?? []).filter((f) => f.caminho !== caminho);
    await executar(async () => {
      const { error } = await supabase.from("ordens_servico").update({ fotos }).eq("id", o.id!);
      if (error) throw error;
      set({ fotos });
      await apagarFotoOS(caminho);
    }, "Foto removida", false);
  }

  async function gerarPdf(tipo: "entrada" | "laudo") {
    if (!cfg) return;
    try {
      const blob = await pdfOS({
        numero: o.numero, tipo, cliente, equipamento: o.equipamento ?? "", numero_serie: o.numero_serie,
        defeito_relatado: o.defeito_relatado ?? "", diagnostico: o.diagnostico, solucao: o.solucao, checklist: o.checklist ?? [],
        itens: o.itens, valor_mao_obra: Number(o.valor_mao_obra || 0), em_garantia: !!o.em_garantia, garantia_ate: equip?.garantia_ate,
        data_entrada: o.data_entrada, previsao: o.previsao, tecnico: o.tecnico,
        condicao_entrada: o.condicao_entrada, maquina_origem: origem, aviso_outra_empresa: aviso || null,
        orcamento_aprovado_em: o.orcamento_aprovado_em, orcamento_aprovado_por: o.orcamento_aprovado_por,
        garantia_reparo_dias: diasReparo, garantia_reparo_condicoes: o.garantia_reparo_condicoes,
        assinatura: tipo === "entrada" ? o.assinatura_entrada : o.assinatura_entrega, recebido_por: tipo === "laudo" ? o.recebido_por : null,
      }, comUnidade(cfg, unidades.find((u) => u.id === (o as any).unidade_id)));
      setPdf({ blob, nome: `OS-${o.numero ?? "nova"}-${tipo}.pdf`, titulo: tipo === "entrada" ? "Comprovante de entrada" : "Laudo técnico e entrega" });
    } catch (e) {
      notifyError(e);
    }
  }

  const video = o.atendimento === "video";
  // vídeo chamada: mão de obra = horas × valor da hora técnica (zero na garantia)
  function mudarAtendimento(a: "oficina" | "video") {
    if (a === "oficina") return set({ atendimento: "oficina" });
    const horas = Number(o.horas_tecnicas) || 1;
    set({ atendimento: "video", horas_tecnicas: horas, valor_mao_obra: valorVideo(horas, taxaDiagnostico, !!o.em_garantia),
      condicao_entrada: o.condicao_entrada || CONDICAO_REMOTA });
  }
  function mudarHoras(v: string) {
    const horas = v === "" ? null : Number(v);
    set({ horas_tecnicas: horas, valor_mao_obra: valorVideo(horas, taxaDiagnostico, !!o.em_garantia) });
  }

  // termo da vídeo chamada (aceite + Pix antes de agendar)
  const unidadeOS = unidades.find((u) => u.id === (o as any).unidade_id) ?? padrao;
  const valorVideoOS = valorVideo(o.horas_tecnicas, taxaDiagnostico, !!o.em_garantia);
  const pixVideo = video && valorVideoOS > 0 && (unidadeOS as any)?.pix_chave
    ? pixCopiaECola({ chave: (unidadeOS as any).pix_chave, nome: (unidadeOS as any).pix_nome || (unidadeOS as any).razao_social || (unidadeOS as any).nome || "",
        cidade: (unidadeOS as any).pix_cidade || (unidadeOS as any).municipio || "", valor: valorVideoOS, txid: o.numero ? `OS${o.numero}` : "***" })
    : null;
  const termo = termoVideo({ numero: o.numero, horas: o.horas_tecnicas, valorHora: taxaDiagnostico, emGarantia: !!o.em_garantia,
    nome: cliente?.nome.split(" ")[0], pix: pixVideo, outraEmpresa: origem || null });
  const passo = passoVideo({ aceito: !!o.orcamento_aprovado_em, pago: !!o.video_pago_em, agendado: !!o.agendado_em, emGarantia: !!o.em_garantia });

  const mensagem = [
    `Olá ${cliente?.nome.split(" ")[0] ?? ""}! Atualização da sua OS #${o.numero ?? ""} na *MF Máquinas*:`,
    `Equipamento: ${o.equipamento ?? ""}`,
    `Status: ${(o.status ?? "").replace(/_/g, " ")}`,
    o.diagnostico ? `Diagnóstico: ${o.diagnostico}` : "",
    o.em_garantia ? "Serviço coberto pela garantia." : total ? `Valor: ${brl(total)}` : "",
    video && o.agendado_em ? `Vídeo chamada agendada: ${quandoAgendado(o.agendado_em)}${o.horas_tecnicas ? ` (${String(o.horas_tecnicas).replace(".", ",")} h técnica)` : ""}` : "",
    !video && o.previsao ? `Previsão: ${dataBR(o.previsao)}` : "",
    origem ? `A MF Máquinas é uma empresa diferente da ${origem} e responde pelo serviço e pelas peças desta OS.` : "",
  ].filter(Boolean).join("\n");

  // faturada: a NFS-e autorizada em produção (acompanha a nota enquanto a janela está aberta)
  const faturada = !!o.faturada_em || notasOS.some((n) => n.status === "autorizada" && n.ambiente === "producao");
  const abas: { value: Aba; label: string }[] = [
    { value: "atendimento", label: "Atendimento" },
    { value: "checklist", label: `Checklist${o.checklist?.some((c) => !c.ok) ? " ⚠" : ""}` },
    { value: "fotos", label: `Fotos (${o.fotos?.length ?? 0})` },
    { value: "pecas", label: "Peças e valores" },
    { value: "entrega", label: "Assinaturas" },
    ...(o.id ? [{ value: "nota" as const, label: faturada ? "Nota de serviço ✓" : "Nota de serviço" }] : []),
  ];

  return (
    <Modal open onClose={onClose} title={o.id ? `OS #${o.numero}` : "Nova ordem de serviço"} wide>
      <form onSubmit={salvar} className="space-y-4">
        {/* Cartão da máquina: garantia em destaque */}
        {(o.equipamento || equip) && (() => {
          const maquinaNaGarantia = equip ? garantia !== "fora_garantia" : !!o.em_garantia;
          const texto = equip?.garantia_ate
            ? maquinaNaGarantia
              ? `Garantia até ${dataBR(equip.garantia_ate)}${garantia === "vence_logo" ? " (vence em menos de 30 dias)" : ""}.`
              : `Garantia encerrada em ${dataBR(equip.garantia_ate)}.`
            : maquinaNaGarantia ? "Atendimento em garantia." : "Sem garantia registrada para esta máquina.";
          const cobranca = o.em_garantia
            ? " Esta OS não será cobrada."
            : maquinaNaGarantia ? " Esta OS está marcada como cobrada (ex.: mau uso ou peça de desgaste)." : " Serviço cobrado.";
          return (
            <div className={`gap-3 rounded-xl border p-3 sm:flex sm:items-center ${maquinaNaGarantia ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-slate-50"}`}>
              {/* no celular o botão desce para baixo do texto (lado a lado o texto ficava com uma palavra por linha) */}
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${maquinaNaGarantia ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                  {maquinaNaGarantia ? <ShieldCheck size={20} /> : <ShieldOff size={20} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold leading-snug text-fg sm:text-base">
                    {o.equipamento}{o.numero_serie && <span className="font-medium text-slate-500"> · série {o.numero_serie}</span>}
                  </div>
                  <div className="mt-1"><Badge value={equip ? garantia : maquinaNaGarantia ? "em_garantia" : "fora_garantia"} /></div>
                  <div className="mt-1 text-sm text-slate-600">{texto}{cobranca}</div>
                </div>
              </div>
              {(o.equipamento_id || o.numero_serie) && (
                <Button type="button" variant="secondary" className="mt-3 w-full shrink-0 sm:mt-0 sm:w-auto" onClick={() => setHistorico(true)}><History size={15} /> Histórico da máquina</Button>
              )}
            </div>
          );
        })()}

        {origem && (
          <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm text-red-900">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-solido-vermelho px-2 py-0.5 text-xs font-black uppercase tracking-wide text-white">Sem garantia da MF</span>
              <b>Máquina vendida pela {origem}, que é outra empresa.</b>
            </div>
            <p className="mt-1">A MF Máquinas não dá garantia desta máquina. Respondemos só pelo serviço feito nesta OS e pelas peças que trocarmos. {aviso}</p>
            <div className="mt-1 text-xs">Para concluir: nº de série, condição de entrada, diagnóstico, serviço executado, peças e orçamento aprovado. Tudo sai no comprovante e no laudo.</div>
          </div>
        )}

        <Tabs value={aba} onChange={setAba} options={abas} />

        {aba === "atendimento" && !!o.reaberturas?.length && (
          <ul className="mb-3 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {o.reaberturas.map((r, i) => (
              <li key={i} className="flex gap-1.5"><RotateCcw size={14} className="mt-0.5 shrink-0" aria-hidden />
                <span>Reaberta em {new Date(r.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {r.nome ? ` por ${r.nome}` : ""}: {r.motivo}</span></li>
            ))}
          </ul>
        )}
        {aba === "atendimento" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="sm:col-span-4">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Tipo de atendimento</span>
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-sm font-semibold" role="group" aria-label="Tipo de atendimento">
                {([["oficina", "Na oficina"], ["video", "Vídeo chamada (hora técnica)"]] as const).map(([v, l]) => (
                  <button key={v} type="button" disabled={somenteLeitura} aria-pressed={(o.atendimento ?? "oficina") === v} onClick={() => mudarAtendimento(v)}
                    className={`px-3 py-1.5 ${(o.atendimento ?? "oficina") === v ? (v === "video" ? "bg-purple-600 text-white" : "bg-slate-700 text-white") : "bg-surface text-slate-600 hover:bg-slate-50"}`}>{l}</button>
                ))}
              </div>
            </div>
            {video && (
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-purple-200 bg-purple-50 p-3 sm:col-span-4 sm:grid-cols-3">
                <ol className="grid gap-2 text-sm sm:col-span-3 sm:grid-cols-3">
                  <li className={`rounded-lg border p-2 ${passo > 1 ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-purple-300 bg-surface text-fg"}`}>
                    <b>1. Termo aceito</b>
                    <span className="block text-xs">{o.orcamento_aprovado_em ? `${o.orcamento_aprovado_por || "Cliente"} aceitou em ${dataBR(o.orcamento_aprovado_em.slice(0, 10))}` : "Mande o termo e espere o ACEITO."}</span>
                    {!somenteLeitura && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {cliente?.whatsapp && <a href={whatsappLink(cliente.whatsapp, termo)} target="_blank" rel="noreferrer" className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">Mandar termo{pixVideo ? " + Pix" : ""}</a>}
                        <Button type="button" variant="secondary" tamanho="mini"
                          onClick={() => navigator.clipboard.writeText(termo).then(() => notify("Termo copiado"), () => notify("Não deu para copiar", "erro"))}>Copiar termo</Button>
                        {!o.orcamento_aprovado_em && <Button type="button" tom="servico" tamanho="mini"
                          onClick={() => set({ orcamento_aprovado_em: new Date().toISOString(), orcamento_aprovado_por: o.orcamento_aprovado_por || "Cliente, ACEITO pelo WhatsApp" })}>Cliente aceitou</Button>}
                      </div>
                    )}
                  </li>
                  <li className={`rounded-lg border p-2 ${o.em_garantia || o.video_pago_em ? "border-emerald-200 bg-emerald-50 text-emerald-900" : passo === 2 ? "border-purple-300 bg-surface text-fg" : "border-slate-200 bg-surface text-slate-500"}`}>
                    <b>2. Pix pago</b>
                    <span className="block text-xs">{o.em_garantia ? "Na garantia: sem cobrança." : o.video_pago_em ? `Pago em ${dataBR(o.video_pago_em.slice(0, 10))} (${brl(valorVideoOS)})` : pixVideo ? `${brl(valorVideoOS)} — o Pix vai junto com o termo.` : `${brl(valorVideoOS)} — cadastre a chave Pix da unidade para ir junto.`}</span>
                    {!somenteLeitura && !o.em_garantia && (
                      <Button type="button" tom="servico" tamanho="mini" className="mt-1.5"
                        onClick={() => set({ video_pago_em: o.video_pago_em ? null : new Date().toISOString() })}>{o.video_pago_em ? "Desfazer" : "Pix recebido"}</Button>
                    )}
                  </li>
                  <li className={`rounded-lg border p-2 ${o.agendado_em ? "border-emerald-200 bg-emerald-50 text-emerald-900" : passo === 3 ? "border-purple-300 bg-surface text-fg" : "border-slate-200 bg-surface text-slate-500"}`}>
                    <b>3. Agendar</b>
                    <span className="block text-xs">{o.agendado_em ? `Marcada para ${quandoAgendado(o.agendado_em)}` : passo < 3 ? "Depois do aceite e do Pix." : "Escolha o dia e a hora abaixo."}</span>
                  </li>
                </ol>
                <Field label="Vídeo chamada agendada para">
                  <input className="input" type="datetime-local" value={paraCampoHora(o.agendado_em)} disabled={somenteLeitura}
                    onChange={(e) => set({ agendado_em: deCampoHora(e.target.value) })} />
                </Field>
                <Field label="Horas técnicas">
                  <input className="input" type="number" min={0.5} step={0.5} inputMode="decimal" value={o.horas_tecnicas ?? ""} disabled={somenteLeitura}
                    onChange={(e) => mudarHoras(e.target.value)} />
                </Field>
                <div className="text-sm text-purple-900 sm:self-end sm:pb-2">
                  {o.em_garantia ? "Na garantia: sem cobrança da hora técnica." : <>Mão de obra: <b>{brl(valorVideo(o.horas_tecnicas, taxaDiagnostico))}</b> <span className="text-xs">({String(o.horas_tecnicas ?? 0).replace(".", ",")} h × {brl(taxaDiagnostico)})</span></>}
                </div>
                <p className="text-xs text-purple-900 sm:col-span-3">A máquina não vem à MF. Escolha a máquina do cliente abaixo, se souber; senão fica "a confirmar". O agendamento vai na mensagem do WhatsApp.</p>
              </div>
            )}
            <Field label="Cliente" className="sm:col-span-2">
              <ClienteBusca clientes={clientes} value={o.cliente_id} disabled={somenteLeitura} required onChange={(id) => set({ cliente_id: id, equipamento_id: null })} />
            </Field>
            <div className="sm:col-span-2"><CampoUnidade value={(o as any).unidade_id} disabled={somenteLeitura} label="Unidade que atende" onChange={(v) => set({ unidade_id: v } as any)} /></div>
            {o.cliente_id && (
              <div className="sm:col-span-4">
                <GarantiaCliente clienteId={o.cliente_id} taxa={taxaDiagnostico} hoje={hoje()} editavel={!somenteLeitura}
                  onUsar={usarMaquina} onCobrarTaxa={cobrarDiagnostico} />
              </div>
            )}
            <Field label="Situação">
              {encerrada ? <div className="py-2"><Badge value={o.status} /></div> : (
                <select className="input" value={o.status} disabled={somenteLeitura} onChange={(e) => set({ status: e.target.value })}>
                  {STATUS_EDITAVEIS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              )}
            </Field>
            <Field label="Técnico">
              {/* sugere os técnicos (cadastro de técnicos e funcionários; os da região do cliente primeiro); dá para digitar outro nome */}
              <input className="input" list="tecnicos-os" value={o.tecnico ?? ""} disabled={somenteLeitura} onChange={(e) => set({ tecnico: e.target.value })} />
              <datalist id="tecnicos-os">{[...sugestoesTecnico].map(([nome, detalhe]) => <option key={nome} value={nome}>{detalhe}</option>)}</datalist>
              {daRegiao.length > 0 && !o.tecnico && !somenteLeitura && (
                <span className="mt-1 block text-xs text-slate-500">Da região: {daRegiao.slice(0, 3).map((t) => t.nome).join(", ")}</span>
              )}
            </Field>

            <Field label="Máquina do cliente" className="sm:col-span-2">
              <select className="input" value={o.equipamento_id ?? ""} disabled={somenteLeitura || !o.cliente_id} onChange={(e) => escolherEquipamento(e.target.value)}>
                <option value="">{o.cliente_id ? (equipCliente.length ? "Outra máquina / não cadastrada" : "Nenhuma máquina cadastrada para este cliente") : "Escolha o cliente primeiro"}</option>
                {equipCliente.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.descricao}{e.numero_serie ? ` · ${e.numero_serie}` : ""} · {e.origem ? `vendida pela ${e.origem} (outra empresa)` : situacaoGarantia(e.garantia_ate) === "fora_garantia" ? "fora da garantia" : "em garantia"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Equipamento">
              <input className="input" value={o.equipamento ?? ""} disabled={somenteLeitura} placeholder={video ? "A confirmar na vídeo chamada" : ""} onChange={(e) => set({ equipamento: e.target.value })} required={!video} />
            </Field>
            <Field label="Nº de série">
              <input className="input" value={o.numero_serie ?? ""} disabled={somenteLeitura} placeholder={origem ? 'Da plaqueta (ou "sem plaqueta")' : ""}
                onChange={(e) => set({ numero_serie: e.target.value })} />
            </Field>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:col-span-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={!!origem} disabled={somenteLeitura || !!equip?.origem}
                  onChange={(e) => set({ maquina_origem: e.target.checked ? "My Frost" : null })} />
                Máquina vendida por outra empresa: <b>sem garantia da MF</b> (a MF responde só pelo serviço e pelas peças desta OS)
              </label>
              {origem && !equip?.origem && (
                <input className="input max-w-[220px] py-1.5" aria-label="Empresa que vendeu a máquina" value={o.maquina_origem ?? ""} disabled={somenteLeitura}
                  onChange={(e) => set({ maquina_origem: e.target.value })} />
              )}
            </div>
            {!o.equipamento_id && (
              <Field label="Modelo cadastrado (opcional)" className="sm:col-span-2">
                <select className="input" value={o.produto_id ?? ""} disabled={somenteLeitura} onChange={(e) => {
                  const prod = produtos.find((p) => p.id === e.target.value);
                  set({ produto_id: e.target.value || null, ...(prod && !o.equipamento ? { equipamento: prod.descricao } : {}) });
                }}>
                  <option value="">—</option>
                  {produtos.filter((p) => p.tipo === "maquina").map((p) => <option key={p.id} value={p.id}>{p.descricao}</option>)}
                </select>
              </Field>
            )}
            <Field label={video ? "Data de abertura" : "Data de entrada"}>
              <input className="input" type="date" value={o.data_entrada ?? ""} disabled={somenteLeitura} onChange={(e) => set({ data_entrada: e.target.value })} />
            </Field>
            {!video && <Field label="Previsão de entrega">
              <input className="input" type="date" value={o.previsao ?? ""} disabled={somenteLeitura} onChange={(e) => set({ previsao: e.target.value })} />
            </Field>}

            <Field label="Defeito relatado pelo cliente" className="sm:col-span-4">
              <textarea className="input" rows={2} value={o.defeito_relatado ?? ""} disabled={somenteLeitura} onChange={(e) => set({ defeito_relatado: e.target.value })} required />
            </Field>
            {(!video || origem) && <Field label={`Condição de entrada${origem ? " (obrigatória)" : ""}`} className="sm:col-span-4">
              <textarea className="input" rows={2} value={o.condicao_entrada ?? ""} disabled={somenteLeitura}
                placeholder="Como a máquina chegou: liga ou não, limpeza, riscos e amassados, peças faltando ou já trocadas por outros"
                onChange={(e) => set({ condicao_entrada: e.target.value })} />
            </Field>}
            <Field label="Diagnóstico técnico" className="sm:col-span-2">
              <textarea className="input" rows={3} value={o.diagnostico ?? ""} disabled={somenteLeitura} onChange={(e) => set({ diagnostico: e.target.value })} />
            </Field>
            <Field label="Serviço executado" className="sm:col-span-2">
              <textarea className="input" rows={3} value={o.solucao ?? ""} disabled={somenteLeitura} onChange={(e) => set({ solucao: e.target.value })} />
            </Field>
          </div>
        )}

        {aba === "checklist" && (
          <div>
            <p className="mb-3 text-sm text-slate-500">Confira com o cliente no balcão. Itens marcados como “Atenção” saem destacados no comprovante de entrada.</p>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {(o.checklist ?? []).map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs font-semibold">
                    {[true, false].map((v) => (
                      <button key={String(v)} type="button" disabled={somenteLeitura}
                        onClick={() => set({ checklist: o.checklist!.map((x, k) => (k === i ? { ...x, ok: v } : x)) })}
                        className={`px-2.5 py-1.5 ${c.ok === v ? (v ? "bg-solido-verde text-white" : "bg-amber-500 text-[#2a1a02]") : "bg-surface text-slate-500"}`}>
                        {v ? "OK" : "Atenção"}
                      </button>
                    ))}
                  </div>
                  <span className="min-w-[160px] flex-1 text-sm font-medium text-slate-700">{c.item}</span>
                  <input className="input max-w-xs py-1.5" placeholder="Observação" value={c.obs ?? ""} disabled={somenteLeitura}
                    onChange={(e) => set({ checklist: o.checklist!.map((x, k) => (k === i ? { ...x, obs: e.target.value } : x)) })} />
                </div>
              ))}
            </div>
          </div>
        )}

        {aba === "fotos" && <FotosOS fotos={o.fotos ?? []} podeEditar={!somenteLeitura} ocupado={ocupado} onEnviar={enviarFotos} onRemover={removerFoto} />}

        {aba === "pecas" && (
          <div className="space-y-4">
            <ItensEditor itens={o.itens} onChange={(itens) => set({ itens })} disabled={somenteLeitura} filtro={(p) => p.tipo !== "maquina" && p.tipo !== "servico"} />
            {!somenteLeitura && (
              <ServicosOS onEscolher={(sv) => set({
                valor_mao_obra: Number(o.valor_mao_obra || 0) + Number(sv.preco_venda || 0),
                solucao: [String(o.solucao ?? "").trim(), sv.descricao.replace(/\s*\(servi[cç]o\)\s*$/i, "")].filter(Boolean).join("; "),
              })} />
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Mão de obra (R$)">
                <input className="input" type="number" step="0.01" min={0} value={o.valor_mao_obra} disabled={somenteLeitura} onChange={(e) => set({ valor_mao_obra: Number(e.target.value) })} />
              </Field>
              <Field label="Garantia">
                <label className="flex items-center gap-2 py-2 text-sm">
                  <input type="checkbox" className="h-5 w-5" checked={!!o.em_garantia} disabled={somenteLeitura} onChange={(e) => set({ em_garantia: e.target.checked })} />
                  {origem ? "Retorno na garantia do reparo da MF (sem cobrança)" : "Coberto (sem cobrança)"}
                </label>
              </Field>
              <Card className="col-span-2 flex items-center justify-between gap-3 p-3">
                <span className="text-sm text-slate-500">Peças {brl(pecas)} · Mão de obra {brl(Number(o.valor_mao_obra || 0))}</span>
                <span className="num shrink-0 whitespace-nowrap text-xl font-bold text-fg">{o.em_garantia ? "R$ 0,00" : brl(total)}</span>
              </Card>
            </div>
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-4">
              <div className="text-sm font-semibold text-fg sm:col-span-4">Orçamento aprovado pelo cliente{origem && !o.em_garantia ? " (obrigatório)" : ""}</div>
              <Field label="Quando">
                <input className="input" type="datetime-local" disabled={somenteLeitura}
                  value={o.orcamento_aprovado_em ? new Date(new Date(o.orcamento_aprovado_em).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""}
                  onChange={(e) => set({ orcamento_aprovado_em: e.target.value ? new Date(e.target.value).toISOString() : null })} />
              </Field>
              <Field label="Por quem e como" className="sm:col-span-2">
                <input className="input" value={o.orcamento_aprovado_por ?? ""} disabled={somenteLeitura} placeholder="Ex.: João (dono), pelo WhatsApp"
                  onChange={(e) => set({ orcamento_aprovado_por: e.target.value })} />
              </Field>
              {!somenteLeitura && (
                <div className="self-end">
                  <Button type="button" variant="secondary" className="w-full" onClick={() => set({ orcamento_aprovado_em: new Date().toISOString() })}>Aprovado agora</Button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-4">
              <div className="text-sm font-semibold text-fg sm:col-span-4">Garantia do reparo (da MF: o serviço e as peças desta OS)</div>
              <Field label="Prazo (dias)">
                <input className="input" type="number" min={0} max={3650} disabled={somenteLeitura} placeholder={String(cfg?.garantia_servico_dias ?? 90)}
                  value={o.garantia_reparo_dias ?? ""} onChange={(e) => set({ garantia_reparo_dias: e.target.value === "" ? null : Math.round(Number(e.target.value)) })} />
              </Field>
              <Field label={`Condições (vazio = ${origem ? "as condições padrão do reparo" : "o termo de garantia da configuração"})`} className="sm:col-span-3">
                <textarea className="input" rows={2} disabled={somenteLeitura} value={o.garantia_reparo_condicoes ?? ""}
                  placeholder={origem ? CONDICOES_REPARO_PADRAO : "Ex.: cobre as peças trocadas e a mão de obra deste conserto; não cobre outras peças da máquina, mau uso, queda ou ligação em tensão errada"}
                  onChange={(e) => set({ garantia_reparo_condicoes: e.target.value })} />
              </Field>
            </div>
          </div>
        )}

        {aba === "nota" && <NfseOS os={o} telefone={cliente?.whatsapp ?? cliente?.telefone} />}

        {aba === "entrega" && (
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="mb-1 text-sm font-bold text-fg">Na entrada (recepção)</h3>
              <p className="mb-2 text-xs text-slate-500">O cliente confirma o estado do equipamento e o checklist.</p>
              <Assinatura key={`ent-${o.id}`} valor={o.assinatura_entrada ?? null} disabled={somenteLeitura} onChange={(png) => set({ assinatura_entrada: png })} />
            </div>
            <div>
              <h3 className="mb-1 text-sm font-bold text-fg">Na retirada (entrega)</h3>
              <p className="mb-2 text-xs text-slate-500">Obrigatória para marcar a OS como entregue.</p>
              <Field label="Nome de quem retirou" className="mb-2">
                <input className="input" value={o.recebido_por ?? ""} disabled={o.status === "entregue" || !podeEditar} onChange={(e) => set({ recebido_por: e.target.value })} />
              </Field>
              <Assinatura key={`sai-${o.id}`} valor={o.assinatura_entrega ?? null} disabled={o.status === "entregue" || !podeEditar} onChange={(png) => set({ assinatura_entrega: png })} />
              {o.entregue_em && <p className="mt-2 text-xs text-slate-500">Entregue em {new Date(o.entregue_em).toLocaleString("pt-BR")}.</p>}
            </div>
          </div>
        )}

        {o.id && <Anexos entidade="os" id={o.id} />}

        {/* no celular: documentos em cima (2 por linha) e as ações principais embaixo, largas */}
        <div className="space-y-2 border-t border-slate-100 pt-4 sm:flex sm:flex-wrap sm:items-center sm:gap-2 sm:space-y-0">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button type="button" variant="ghost" className="border border-slate-200 sm:border-0" onClick={() => gerarPdf("entrada")} disabled={!o.defeito_relatado}>
              <FileDown size={16} /> <span className="sm:hidden">Comprovante</span><span className="hidden sm:inline">Comprovante de entrada</span>
            </Button>
            {(o.diagnostico || encerrada) && <Button type="button" variant="ghost" className="border border-slate-200 sm:border-0" onClick={() => gerarPdf("laudo")}><FileDown size={16} /> Laudo<span className="hidden sm:inline"> / entrega</span></Button>}
            {o.id && cliente?.whatsapp && (
              <a href={whatsappLink(cliente.whatsapp, mensagem)} target="_blank" rel="noreferrer"
                className="col-span-2 inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 sm:min-h-0">
                <MessageCircle size={16} /> Avisar cliente
              </a>
            )}
          </div>
          <span className="hidden sm:block sm:flex-1" />
          <div className="grid grid-cols-3 gap-2 sm:flex">
            {podeEditar && o.status === "concluida" && <Button type="button" variant="ghost" className="col-span-3 border border-slate-200 sm:border-0" onClick={() => setReabrir(true)} disabled={ocupado}><RotateCcw size={16} /> Reabrir OS</Button>}
            {podeEditar && o.status === "concluida" && <Button type="button" variant="secondary" className="col-span-3" onClick={entregar} disabled={ocupado}><PackageCheck size={16} /> Marcar entregue</Button>}
            {!somenteLeitura && <Button variant="secondary" className={o.id ? "" : "col-span-3"} disabled={ocupado}>Salvar</Button>}
            {o.id && !somenteLeitura && (
              <Button type="button" className="col-span-2 whitespace-nowrap" onClick={concluir} disabled={ocupado}><CheckCircle2 size={16} /> Concluir serviço</Button>
            )}
          </div>
        </div>
      </form>

      {pdf && <PdfViewer {...pdf} onClose={() => setPdf(null)} />}
      {reabrir && o.id && <ReabrirOS numero={o.numero} cobrada={total > 0} comPecas={o.itens.length > 0} ocupado={ocupado} onClose={() => setReabrir(false)}
        onConfirmar={(motivo, status) => executar(async () => {
          const { error } = await supabase.rpc("reabrir_os", { p_os: o.id, p_motivo: motivo, p_status: status });
          if (error) throw error;
          setReabrir(false);
        }, `OS #${o.numero} reaberta`)} />}
      {historico && (
        <HistoricoModal equipamento={{ id: o.equipamento_id ?? undefined, numero_serie: o.numero_serie, descricao: o.equipamento ?? "" }} onClose={() => setHistorico(false)} />
      )}
    </Modal>
  );
}

/** Reabrir a OS concluída sem querer: escolhe para onde volta e o motivo (fica no histórico da OS). */
function ReabrirOS({ numero, cobrada, comPecas, ocupado, onClose, onConfirmar }: {
  numero?: number; cobrada: boolean; comPecas: boolean; ocupado: boolean; onClose: () => void; onConfirmar: (motivo: string, status: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [status, setStatus] = useState("em_reparo");
  const ok = motivo.trim().length >= 5;
  return (
    <Modal open onClose={onClose} title={`Reabrir a OS #${numero ?? ""}`}>
      <div className="space-y-3 text-sm">
        <p>A OS volta para o conserto como se não tivesse sido concluída.{comPecas ? " As peças voltam para o estoque." : ""}
          {cobrada ? " A cobrança em aberto desta OS é cancelada." : ""} Ao concluir de novo, {comPecas || cobrada ? "isso é feito outra vez e " : ""}o cliente recebe o aviso de pronta.</p>
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Se o cliente tem e-mail, ele já pode ter recebido o aviso de "máquina pronta": avise que ainda está em conserto.</p>
        <Field label="Volta para">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_EDITAVEIS.filter((s) => s.value !== "cancelada").map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Motivo (fica no histórico da OS)">
          <textarea className="input" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: concluí sem querer, o conserto não terminou" />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={() => onConfirmar(motivo.trim(), status)} disabled={!ok || ocupado}><RotateCcw size={16} /> Reabrir OS</Button>
        </div>
      </div>
    </Modal>
  );
}

function FotosOS({ fotos, podeEditar, ocupado, onEnviar, onRemover }: {
  fotos: FotoOS[]; podeEditar: boolean; ocupado: boolean; onEnviar: (f: FileList | null) => void; onRemover: (c: string) => void;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const chave = fotos.map((f) => f.caminho).join("|");
  useEffect(() => { urlsFotos(fotos.map((f) => f.caminho)).then(setUrls); }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500">Fotografe a máquina na chegada (laterais, painel, defeitos visíveis) e depois do conserto. As fotos ficam guardadas na OS.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {fotos.map((f) => (
          <figure key={f.caminho} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {urls[f.caminho]
              ? <a href={urls[f.caminho]} target="_blank" rel="noreferrer"><img src={urls[f.caminho]} alt="Foto do equipamento" className="aspect-square w-full object-cover" /></a>
              : <div className="aspect-square w-full animate-pulse bg-slate-100" />}
            <figcaption className="px-2 py-1 text-2xs text-slate-500">{new Date(f.criado_em).toLocaleString("pt-BR")}</figcaption>
            {podeEditar && (
              <button type="button" onClick={() => onRemover(f.caminho)} aria-label="Remover foto"
                className="botao-icone-perigo absolute right-1.5 top-1.5 bg-surface/90 text-red-600 shadow focus:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
                <Trash2 size={14} />
              </button>
            )}
          </figure>
        ))}
        {podeEditar && (
          <label className={`grid aspect-square cursor-pointer place-items-center rounded-xl border-2 border-dashed border-slate-300 text-center text-sm text-slate-500 hover:border-brand hover:text-brand ${ocupado ? "opacity-50" : ""}`}>
            <span><Camera className="mx-auto mb-1" size={22} />Tirar foto ou<br />escolher arquivo</span>
            <input type="file" accept="image/*" capture="environment" multiple className="hidden" disabled={ocupado} onChange={(e) => onEnviar(e.target.files)} />
          </label>
        )}
      </div>
      {!fotos.length && !podeEditar && <p className="py-6 text-center text-sm text-slate-500">Nenhuma foto anexada.</p>}
    </div>
  );
}

/** Serviços do cadastro (carga de gás, limpeza…): tocar soma o preço na mão de obra e escreve no serviço executado. */
function ServicosOS({ onEscolher }: { onEscolher: (s: Produto) => void }) {
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const servicos = produtos.filter((p) => p.tipo === "servico" && p.ativo !== false);
  if (!servicos.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 text-xs font-semibold text-slate-600">Serviços (somam na mão de obra e vão para o serviço executado)</div>
      <div className="flex flex-wrap gap-1.5">
        {servicos.map((sv) => (
          <Button key={sv.id} type="button" tom="servico" tamanho="mini" onClick={() => onEscolher(sv)}>
            + {sv.descricao.replace(/\s*\(servi[cç]o\)\s*$/i, "")}{Number(sv.preco_venda) > 0 ? ` · ${brl(Number(sv.preco_venda))}` : ""}
          </Button>
        ))}
      </div>
    </div>
  );
}
