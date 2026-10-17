// Expedição de um pedido (separar, conferir, embalar, despachar, entregar): as chamadas ao banco e a janela com cada etapa.
// Usadas no Fluxo de pedidos e no painel de Separação e embalagem.
import { useState, type FormEvent } from "react";
import { Barcode, CheckCircle2, ClipboardCheck, ExternalLink, FileText, PackageCheck, Printer, Send, Truck } from "lucide-react";
import { Badge, Button, Field, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { callFunction, supabase } from "@/lib/supabase";
import { confirmarSeTeste } from "@/lib/ambienteNfe";
import { notify, notifyError } from "@/lib/notify";
import { dataBR, pl } from "@/lib/format";
import { pecasDoKit } from "@/lib/kits";
import { useEtiquetas } from "@/components/etiquetas/EditorEtiquetas";
import { usePerfil } from "@/lib/auth";
import type { Exp, PedidoFluxo as P } from "@/lib/fluxo";
import type { KitComponente, Produto, Transportadora } from "@/lib/types";
import { QuadroRisco, useRiscoPedido } from "./ConferenciaRisco";

export const ETAPA: Record<string, string> = { separar: "a separar", separando: "separando", conferido: "conferido", embalado: "embalado", despachado: "despachado", entregue: "entregue" };

/** As mesmas chamadas da janela de expedição, usadas também pelos botões dos cartões. */
export function useAcoesExpedicao() {
  const invalidar = useInvalidate();
  const [ocupado, setOcupado] = useState<string | null>(null); // pedido com ação em andamento
  async function avancar(exp: Exp, etapa: string, dados: Record<string, unknown> = {}, aviso?: string) {
    setOcupado(exp.pedido_id);
    const { error } = await supabase.rpc("avancar_expedicao", { p_expedicao: exp.id, p_etapa: etapa, p_dados: dados });
    setOcupado(null);
    if (error) { notifyError(error); return false; }
    notify(aviso ?? (etapa === "despachado" ? "Despachado: o cliente recebe o rastreio por e-mail" : "Expedição atualizada"));
    invalidar("expedicoes", "pedidos");
    return true;
  }
  async function emitirNota(pedidoId: string) {
    // trava antes da pergunta de teste (ela consulta o servidor): dois cliques não emitem duas notas
    if (ocupado) return false;
    setOcupado(pedidoId);
    if (!(await confirmarSeTeste())) { setOcupado(null); return false; }
    try { await callFunction("nfe-emitir", { pedido_id: pedidoId }); notify("NF-e enviada para a SEFAZ"); invalidar("pedidos", "notas_fiscais"); return true; }
    catch (e) { notifyError(e); return false; }
    finally { setOcupado(null); }
  }
  return { avancar, emitirNota, ocupado };
}

/* ------------------------------ Expedição ------------------------------ */

const PASSOS = ["separar", "separando", "conferido", "embalado", "despachado", "entregue"];

export function ExpedicaoModal({ pedido: p, exp, onClose }: { pedido: P; exp: Exp; onClose: () => void }) {
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: comps = [] } = useRows<KitComponente>("kit_componentes", { order: "kit_id" });
  const { data: transp = [] } = useRows<Transportadora>("transportadoras", { order: "nome", ascending: true });
  const { nome: nomeUsuario, pode } = usePerfil();
  const acoes = useAcoesExpedicao();
  const ocupado = acoes.ocupado !== null;
  const [conf, setConf] = useState<Set<string>>(new Set(exp.itens_conferidos ?? []));
  const [f, setF] = useState({ volumes: String(exp.volumes ?? 1), peso_kg: String(exp.peso_kg ?? ""), transportadora_id: exp.transportadora_id ?? p.transportadora_id ?? "", codigo_rastreio: exp.codigo_rastreio ?? "", observacoes: "" });
  const [scan, setScan] = useState("");
  const etiquetasImp = useEtiquetas();
  const nota = p.notas?.find((n) => n.status === "autorizada" && n.ambiente !== "homologacao");
  // venda por cartão ou link com risco no limite: o despacho espera a conferência (o banco também trava)
  const { data: risco } = useRiscoPedido(p.id);
  const travado = !!risco?.travar;
  const prod = (id: string) => produtos.find((x) => x.id === id);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const atual = PASSOS.indexOf(exp.status);

  async function avancar(etapa: string, dados: Record<string, unknown> = {}) {
    if (await acoes.avancar(exp, etapa, dados)) onClose();
  }
  async function emitirNota() {
    if (await acoes.emitirNota(p.id)) onClose();
  }
  function lerCodigo(e: FormEvent) {
    e.preventDefault();
    const c = scan.trim().toLowerCase();
    const item = p.itens.find((i) => !conf.has(i.id) && [prod(i.produto_id)?.codigo_barras, prod(i.produto_id)?.sku, i.numero_serie].some((x) => x && String(x).toLowerCase() === c));
    if (item) { setConf(new Set([...conf, item.id])); notify(`Conferido: ${item.descricao}`); } else notify("Código não confere com nenhum item pendente", "erro");
    setScan("");
  }
  // abre o editor com o que está na tela (volumes, peso, transportadora e rastreio ainda não salvos)
  const etiquetas = () => etiquetasImp.abrir({ tipo: "pedido", pedido_id: p.id, sobrepor: { volumes: Number(f.volumes) || 1, peso_kg: f.peso_kg, transportadora_id: f.transportadora_id || null, rastreio: f.codigo_rastreio || null } });

  return (
    <Modal open onClose={onClose} title={`Expedição · pedido #${p.numero} · ${p.cliente?.nome ?? ""}`} wide>
      <ol className="mb-4 flex flex-wrap gap-1.5 text-xs font-semibold">
        {PASSOS.map((s, i) => (
          <li key={s} className={`rounded-full px-2.5 py-1 ${i < atual ? "bg-emerald-50 text-emerald-700" : i === atual ? "bg-brand text-brand-fg" : "bg-slate-100 text-slate-500"}`}>{i < atual ? "✓ " : ""}{ETAPA[s]}</li>
        ))}
      </ol>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm">
        <FileText size={18} className={nota ? "text-emerald-600" : "text-amber-600"} />
        {nota ? <span>NF-e <b>{nota.numero}</b> autorizada</span> : <span className="text-amber-800">Sem NF-e autorizada: a mercadoria só pode sair com a nota.</span>}
        {nota?.danfe_url && <a href={nota.danfe_url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-fg hover:border-brand"><ExternalLink size={15} /> DANFE</a>}
        {!nota && pode("emitir_nfe") && !p.notas?.some((n) => ["processando", "contingencia"].includes(n.status)) && <Button type="button" variant="secondary" disabled={ocupado} onClick={emitirNota}><FileText size={15} /> Emitir NF-e</Button>}
        {!nota && p.notas?.some((n) => ["processando", "contingencia"].includes(n.status)) && <Badge value={p.notas.find((n) => ["processando", "contingencia"].includes(n.status))!.status} />}
      </div>
      <QuadroRisco pedidoId={p.id} numero={p.numero} />

      {(exp.status === "separar" || exp.status === "separando") && (
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 font-semibold"><ClipboardCheck size={18} /> {exp.status === "separar" ? "Lista de separação" : "Conferência"}</h3>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {p.itens.map((i) => {
              const pr = prod(i.produto_id);
              const partes = pr?.kit ? pecasDoKit(i.produto_id, comps, i.kit_escolha) : [];
              return (
                <li key={i.id} className="flex items-start gap-3 p-3">
                  {exp.status === "separando" && <input type="checkbox" className="mt-1 h-5 w-5" checked={conf.has(i.id)} onChange={(e) => { const n = new Set(conf); if (e.target.checked) n.add(i.id); else n.delete(i.id); setConf(n); }} />}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-fg">{Number(i.quantidade)}× {i.descricao}</div>
                    <div className="text-xs text-slate-500">{[pr?.sku && `cód. ${pr.sku}`, pr?.localizacao && `local ${pr.localizacao}`, i.numero_serie && `série ${i.numero_serie}`].filter(Boolean).join(" · ")}</div>
                    {partes.length > 0 && <div className="mt-1 text-xs text-slate-600">Kit: {partes.map((c) => `${c.quantidade * Number(i.quantidade)}× ${prod(c.componente_id)?.descricao}${prod(c.componente_id)?.localizacao ? ` (${prod(c.componente_id)?.localizacao})` : ""}`).join(" · ")}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
          {exp.status === "separar"
            ? <div className="flex justify-end"><Button type="button" disabled={ocupado} onClick={() => avancar("separando", { responsavel: nomeUsuario })}><PackageCheck size={16} /> Começar a separar</Button></div>
            : (
              <>
                <form onSubmit={lerCodigo} className="flex gap-2">
                  <div className="relative flex-1"><Barcode size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input className="input pl-9" value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Leia o código de barras, SKU ou nº de série (leitor ou digitando)" /></div>
                  <Button variant="secondary">Conferir</Button>
                </form>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-500">{conf.size} de {p.itens.length} itens conferidos</span>
                  <Button type="button" disabled={ocupado || conf.size < p.itens.length} onClick={() => avancar("conferido", { itens_conferidos: [...conf] })}><CheckCircle2 size={16} /> Conferência ok</Button>
                </div>
              </>
            )}
        </div>
      )}

      {(exp.status === "conferido" || exp.status === "embalado") && (
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 font-semibold"><Truck size={18} /> {exp.status === "conferido" ? "Embalagem" : "Despacho"}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Volumes"><input className="input" type="number" min={1} value={f.volumes} onChange={set("volumes")} disabled={exp.status === "embalado"} /></Field>
            <Field label="Peso total (kg)"><input className="input" inputMode="decimal" value={f.peso_kg} onChange={set("peso_kg")} disabled={exp.status === "embalado"} /></Field>
            <Field label="Transportadora" className="col-span-2">
              <select className="input" value={f.transportadora_id} onChange={set("transportadora_id")}>
                <option value="">— (retira / entrega própria)</option>
                {transp.filter((t) => t.ativo).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </Field>
            {exp.status === "embalado" && <Field label="Código de rastreio" className="col-span-2 sm:col-span-4"><input className="input" value={f.codigo_rastreio} onChange={set("codigo_rastreio")} placeholder="o cliente recebe por e-mail ao despachar" /></Field>}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={etiquetas} title="Conferir, editar e imprimir as etiquetas"><Printer size={16} /> Etiquetas</Button>
            {exp.status === "conferido"
              ? <Button type="button" disabled={ocupado} onClick={() => avancar("embalado", { volumes: Number(f.volumes), peso_kg: f.peso_kg ? Number(f.peso_kg.replace(",", ".")) : null, transportadora_id: f.transportadora_id || null })}><PackageCheck size={16} /> Embalado</Button>
              : <Button type="button" disabled={ocupado || !nota || travado} title={!nota ? "emita a NF-e antes" : travado ? "confira o risco antes (quadro acima)" : ""} onClick={() => avancar("despachado", { transportadora_id: f.transportadora_id || null, codigo_rastreio: f.codigo_rastreio })}><Send size={16} /> Despachar</Button>}
          </div>
        </div>
      )}

      {exp.status === "despachado" && (
        <div className="space-y-3 text-sm">
          <p>Despachado em <b>{dataBR(exp.despachado_em)}</b>{exp.codigo_rastreio ? <> · rastreio <b>{exp.codigo_rastreio}</b></> : null}{exp.volumes ? ` · ${exp.volumes} ${pl(exp.volumes, "volume", "volumes")}` : ""}.</p>
          <div className="flex justify-end"><Button type="button" disabled={ocupado} onClick={() => avancar("entregue")}><CheckCircle2 size={16} /> Marcar entregue</Button></div>
        </div>
      )}
      {exp.status === "entregue" && <p className="text-sm text-emerald-700">Entregue em {dataBR(exp.entregue_em)}.</p>}
      {etiquetasImp.modal}
    </Modal>
  );
}
