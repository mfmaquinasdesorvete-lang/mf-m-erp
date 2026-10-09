import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Camera, CheckCircle2, ClipboardCheck, FileDown, History, MessageCircle, PackageCheck, Plus, Search, ShieldCheck, ShieldOff, Trash2, Wrench,
} from "lucide-react";
import { Badge, CelulaAbrir, Button, Card, Field, Modal, PageHeader, Stat, Table, Tabs } from "@/components/ui";
import { ItensEditor, totalItens } from "@/components/ItensEditor";
import { Assinatura } from "@/components/Assinatura";
import { Anexos } from "@/components/Anexos";
import { PdfViewer } from "@/components/PdfViewer";
import { HistoricoModal } from "@/pages/Garantias";
import { limpar, useInvalidate, useRows } from "@/lib/data";
import { useUnidade, EtiquetaUnidade, CampoUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje, whatsappLink } from "@/lib/format";
import { situacaoGarantia } from "@/lib/garantia";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { apagarFotoOS, enviarFotoOS, urlsFotos } from "@/lib/fotos";
import { pdfOS } from "@/lib/pdf";
import { useConfig } from "@/lib/useConfig";
import type { Cliente, Equipamento, FotoOS, Item, ItemChecklist, OrdemServico, Produto } from "@/lib/types";
import { usePerfil } from "@/lib/auth";
import { ClienteBusca } from "@/components/ClienteBusca";

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
type OSX = OrdemServico & {
  equipamento_id?: string | null; checklist?: ItemChecklist[]; fotos?: FotoOS[];
  assinatura_entrada?: string | null; assinatura_entrega?: string | null; recebido_por?: string | null; entregue_em?: string | null;
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
  const [aberta, setAberta] = useState<OS | null>(null);

  // "Abrir OS" vindo da tela de garantias já traz cliente e máquina preenchidos
  useEffect(() => {
    const pre = (location.state as any)?.novaOS;
    if (pre) {
      setAberta(nova(pre));
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => ordens.filter((o) =>
    (mostrarFinalizadas || !["entregue", "cancelada"].includes(o.status)) &&
    (!busca || `${o.numero} ${o.cliente?.nome} ${o.equipamento} ${o.numero_serie ?? ""}`.toLowerCase().includes(busca.toLowerCase())),
  ), [ordens, mostrarFinalizadas, busca]);

  const abertas = ordens.filter((o) => !["concluida", "entregue", "cancelada"].includes(o.status));
  const atrasadas = abertas.filter((o) => o.previsao && o.previsao < hoje()).length;

  return (
    <div>
      <PageHeader
        title="Assistência técnica"
        subtitle="Recepção com checklist e fotos, laudo, peças, assinatura do cliente e histórico por nº de série."
        actions={pode("editar_os") && <Button onClick={() => setAberta(nova())}><Plus size={16} /> Nova OS</Button>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Wrench} tom="info" label="Em andamento" valor={abertas.length} />
        <Stat icon={PackageCheck} tom="bom" label="Prontas para retirar" valor={ordens.filter((o) => o.status === "concluida").length} />
        <Stat icon={ShieldCheck} label="Em garantia (abertas)" valor={abertas.filter((o) => o.em_garantia).length} />
        <Stat icon={ClipboardCheck} tom={atrasadas ? "critico" : "neutro"} label="Previsão estourada" valor={atrasadas} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="input pl-9" placeholder="Buscar nº, cliente, equipamento, série…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={mostrarFinalizadas} onChange={(e) => setMostrarFinalizadas(e.target.checked)} /> Mostrar entregues e canceladas
        </label>
      </div>

      <Table
        empty={!isLoading && lista.length === 0}
        head={<><th className="th">OS</th><th className="th">Entrada</th><th className="th">Cliente</th><th className="th">Equipamento</th><th className="th">Situação</th><th className="th">Previsão</th><th className="th text-right">Valor</th><th className="th" /></>}
      >
        {lista.map((o) => (
          <tr key={o.id} className="cursor-pointer hover:bg-slate-50/70" onClick={() => setAberta({ ...o, checklist: o.checklist ?? [], fotos: o.fotos ?? [], itens: o.itens ?? [] })}>
            <td className="td font-bold text-fg">#{o.numero}<EtiquetaUnidade id={(o as any).unidade_id} /></td>
            <td className="td num">{dataBR(o.data_entrada)}</td>
            <td className="td">{o.cliente?.nome}</td>
            <td className="td">{o.equipamento}{o.numero_serie && <div className="text-xs text-slate-500">Série {o.numero_serie}</div>}</td>
            <td className="td"><div className="flex flex-wrap gap-1"><Badge value={o.status} />{o.em_garantia && <Badge value="em_garantia" />}</div></td>
            <td className={`td num ${o.previsao && o.previsao < hoje() && !["concluida", "entregue", "cancelada"].includes(o.status) ? "font-semibold text-red-600" : ""}`}>{dataBR(o.previsao)}</td>
            <td className="td num text-right">{o.em_garantia ? <span className="text-slate-500">garantia</span> : brl(o.valor_total)}</td>
            <CelulaAbrir texto="Ver / editar" />
          </tr>
        ))}
      </Table>

      {aberta && <OSModal os={aberta} onClose={() => setAberta(null)} />}
    </div>
  );
}

type Aba = "atendimento" | "checklist" | "fotos" | "pecas" | "entrega";

function OSModal({ os: inicial, onClose }: { os: OS; onClose: () => void }) {
  const { padrao } = useUnidade();
  const [o, setO] = useState({ ...inicial, unidade_id: (inicial as any).unidade_id ?? padrao });
  const [aba, setAba] = useState<Aba>("atendimento");
  const [ocupado, setOcupado] = useState(false);
  const [pdf, setPdf] = useState<{ blob: Blob; nome: string; titulo: string } | null>(null);
  const [historico, setHistorico] = useState(false);
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
  const cliente = clientes.find((c) => c.id === o.cliente_id);
  const equipCliente = equipamentos.filter((e) => e.cliente_id === o.cliente_id);
  const equip = equipamentos.find((e) => e.id === o.equipamento_id);
  const garantia = equip ? situacaoGarantia(equip.garantia_ate) : null;
  const pecas = totalItens(o.itens);
  const total = o.em_garantia ? 0 : pecas + Number(o.valor_mao_obra || 0);
  const set = (patch: Partial<OS>) => setO((x) => ({ ...x, ...patch }));

  function escolherEquipamento(id: string) {
    const e = equipamentos.find((x) => x.id === id);
    if (!e) return set({ equipamento_id: null });
    set({
      equipamento_id: e.id, produto_id: e.produto_id, equipamento: e.descricao, numero_serie: e.numero_serie,
      em_garantia: situacaoGarantia(e.garantia_ate) !== "fora_garantia",
    });
  }

  async function gravar(): Promise<string> {
    const { itens, cliente: _c, numero: _n, valor_pecas: _vp, valor_total: _vt, created_at: _ca, ...cab } = o as any;
    const dados = limpar({ ...cab, valor_mao_obra: Number(cab.valor_mao_obra || 0) });
    const { data, error } = dados.id
      ? await supabase.from("ordens_servico").update(dados).eq("id", dados.id).select("id, numero").single()
      : await supabase.from("ordens_servico").insert(dados).select("id, numero").single();
    if (error) throw error;
    if (!somenteLeitura) {
      const { error: e1 } = await supabase.from("os_itens").delete().eq("os_id", data.id);
      if (e1) throw e1;
      if (itens.length) {
        const { error: e2 } = await supabase.from("os_itens").insert(itens.map((i: Item) => ({
          os_id: data.id, produto_id: i.produto_id, descricao: i.descricao, quantidade: i.quantidade, valor_unitario: i.valor_unitario,
        })));
        if (e2) throw e2;
      }
    }
    set({ id: data.id, numero: data.numero });
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
    }, `${arquivos.length} foto(s) anexada(s)`, false);
  }

  async function removerFoto(caminho: string) {
    const fotos = (o.fotos ?? []).filter((f) => f.caminho !== caminho);
    await executar(async () => {
      await apagarFotoOS(caminho);
      await supabase.from("ordens_servico").update({ fotos }).eq("id", o.id!);
      set({ fotos });
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
        assinatura: tipo === "entrada" ? o.assinatura_entrada : o.assinatura_entrega, recebido_por: tipo === "laudo" ? o.recebido_por : null,
      }, cfg);
      setPdf({ blob, nome: `OS-${o.numero ?? "nova"}-${tipo}.pdf`, titulo: tipo === "entrada" ? "Comprovante de entrada" : "Laudo técnico e entrega" });
    } catch (e) {
      notifyError(e);
    }
  }

  const mensagem = [
    `Olá ${cliente?.nome.split(" ")[0] ?? ""}! Atualização da sua OS #${o.numero ?? ""} na *MF Máquinas*:`,
    `Equipamento: ${o.equipamento ?? ""}`,
    `Status: ${(o.status ?? "").replace(/_/g, " ")}`,
    o.diagnostico ? `Diagnóstico: ${o.diagnostico}` : "",
    o.em_garantia ? "Serviço coberto pela garantia." : total ? `Valor: ${brl(total)}` : "",
    o.previsao ? `Previsão: ${dataBR(o.previsao)}` : "",
  ].filter(Boolean).join("\n");

  const abas: { value: Aba; label: string }[] = [
    { value: "atendimento", label: "Atendimento" },
    { value: "checklist", label: `Checklist${o.checklist?.some((c) => !c.ok) ? " ⚠" : ""}` },
    { value: "fotos", label: `Fotos (${o.fotos?.length ?? 0})` },
    { value: "pecas", label: "Peças e valores" },
    { value: "entrega", label: "Assinaturas" },
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
                  <div className="text-[15px] font-bold leading-snug text-fg sm:text-base">
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

        <Tabs value={aba} onChange={setAba} options={abas} />

        {aba === "atendimento" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Cliente" className="sm:col-span-2">
              <ClienteBusca clientes={clientes} value={o.cliente_id} disabled={somenteLeitura} required onChange={(id) => set({ cliente_id: id, equipamento_id: null })} />
            </Field>
            <div className="sm:col-span-2"><CampoUnidade value={(o as any).unidade_id} disabled={somenteLeitura} label="Unidade que atende" onChange={(v) => set({ unidade_id: v } as any)} /></div>
            <Field label="Situação">
              {encerrada ? <div className="py-2"><Badge value={o.status} /></div> : (
                <select className="input" value={o.status} disabled={somenteLeitura} onChange={(e) => set({ status: e.target.value })}>
                  {STATUS_EDITAVEIS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              )}
            </Field>
            <Field label="Técnico">
              <input className="input" value={o.tecnico ?? ""} disabled={somenteLeitura} onChange={(e) => set({ tecnico: e.target.value })} />
            </Field>

            <Field label={equipCliente.length ? "Máquina do cliente (vendida pela MF)" : "Máquina do cliente"} className="sm:col-span-2">
              <select className="input" value={o.equipamento_id ?? ""} disabled={somenteLeitura || !o.cliente_id} onChange={(e) => escolherEquipamento(e.target.value)}>
                <option value="">{o.cliente_id ? (equipCliente.length ? "Outra máquina / não cadastrada" : "Nenhuma máquina cadastrada para este cliente") : "Escolha o cliente primeiro"}</option>
                {equipCliente.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.descricao}{e.numero_serie ? ` · ${e.numero_serie}` : ""} · {situacaoGarantia(e.garantia_ate) === "fora_garantia" ? "fora da garantia" : "em garantia"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Equipamento">
              <input className="input" value={o.equipamento ?? ""} disabled={somenteLeitura} onChange={(e) => set({ equipamento: e.target.value })} required />
            </Field>
            <Field label="Nº de série">
              <input className="input" value={o.numero_serie ?? ""} disabled={somenteLeitura} onChange={(e) => set({ numero_serie: e.target.value })} />
            </Field>
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
            <Field label="Data de entrada">
              <input className="input" type="date" value={o.data_entrada ?? ""} disabled={somenteLeitura} onChange={(e) => set({ data_entrada: e.target.value })} />
            </Field>
            <Field label="Previsão de entrega">
              <input className="input" type="date" value={o.previsao ?? ""} disabled={somenteLeitura} onChange={(e) => set({ previsao: e.target.value })} />
            </Field>

            <Field label="Defeito relatado pelo cliente" className="sm:col-span-4">
              <textarea className="input" rows={2} value={o.defeito_relatado ?? ""} disabled={somenteLeitura} onChange={(e) => set({ defeito_relatado: e.target.value })} required />
            </Field>
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
                        className={`px-2.5 py-1.5 ${c.ok === v ? (v ? "bg-emerald-500 text-white" : "bg-amber-500 text-[#2a1a02]") : "bg-surface text-slate-500"}`}>
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
            <ItensEditor itens={o.itens} onChange={(itens) => set({ itens })} disabled={somenteLeitura} filtro={(p) => p.tipo !== "maquina"} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Mão de obra (R$)">
                <input className="input" type="number" step="0.01" min={0} value={o.valor_mao_obra} disabled={somenteLeitura} onChange={(e) => set({ valor_mao_obra: Number(e.target.value) })} />
              </Field>
              <Field label="Garantia">
                <label className="flex items-center gap-2 py-2 text-sm">
                  <input type="checkbox" className="h-5 w-5" checked={!!o.em_garantia} disabled={somenteLeitura} onChange={(e) => set({ em_garantia: e.target.checked })} />
                  Coberto (sem cobrança)
                </label>
              </Field>
              <Card className="col-span-2 flex items-center justify-between gap-3 p-3">
                <span className="text-sm text-slate-500">Peças {brl(pecas)} · Mão de obra {brl(Number(o.valor_mao_obra || 0))}</span>
                <span className="num shrink-0 whitespace-nowrap text-xl font-bold text-fg">{o.em_garantia ? "R$ 0,00" : brl(total)}</span>
              </Card>
            </div>
          </div>
        )}

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
            {podeEditar && o.status === "concluida" && <Button type="button" variant="secondary" className="col-span-3" onClick={entregar} disabled={ocupado}><PackageCheck size={16} /> Marcar entregue</Button>}
            {!somenteLeitura && <Button variant="secondary" className={o.id ? "" : "col-span-3"} disabled={ocupado}>Salvar</Button>}
            {o.id && !somenteLeitura && (
              <Button type="button" className="col-span-2 whitespace-nowrap" onClick={concluir} disabled={ocupado}><CheckCircle2 size={16} /> Concluir serviço</Button>
            )}
          </div>
        </div>
      </form>

      {pdf && <PdfViewer {...pdf} onClose={() => setPdf(null)} />}
      {historico && (
        <HistoricoModal equipamento={{ id: o.equipamento_id ?? undefined, numero_serie: o.numero_serie, descricao: o.equipamento ?? "" }} onClose={() => setHistorico(false)} />
      )}
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
            <figcaption className="px-2 py-1 text-[11px] text-slate-500">{new Date(f.criado_em).toLocaleString("pt-BR")}</figcaption>
            {podeEditar && (
              <button type="button" onClick={() => onRemover(f.caminho)} aria-label="Remover foto"
                className="absolute right-1.5 top-1.5 rounded-lg bg-surface/90 p-1.5 text-red-600 opacity-0 shadow transition group-hover:opacity-100 focus:opacity-100">
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
