// Fluxo de pedidos: todos os pedidos (WhatsApp, loja, proposta, representante...) num painel só,
// do orçamento à entrega, com a NF-e automática e a expedição (separar, conferir, embalar, despachar).
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Barcode, CheckCircle2, ClipboardCheck, FileText, PackageCheck, Printer, Send, Truck } from "lucide-react";
import { Badge, Button, Field, Modal, PageHeader } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { useUnidade, EtiquetaUnidade } from "@/lib/unidade";
import { callFunction, supabase } from "@/lib/supabase";
import { confirmarSeTeste } from "@/lib/ambienteNfe";
import { notify, notifyError } from "@/lib/notify";
import { brl, dataBR } from "@/lib/format";
import { useConfig } from "@/lib/useConfig";
import { composicao } from "@/lib/kits";
import { useEtiquetas } from "@/components/etiquetas/EditorEtiquetas";
import { CANAIS } from "@/lib/margem";
import { usePerfil } from "@/lib/auth";
import type { Cliente, Item, KitComponente, Pedido, Produto, Transportadora } from "@/lib/types";

type Exp = {
  id: string; pedido_id: string; status: string; itens_conferidos: string[]; volumes: number | null; peso_kg: number | null;
  transportadora_id: string | null; codigo_rastreio: string | null; responsavel: string | null; observacoes: string | null;
  separando_em: string | null; conferido_em: string | null; embalado_em: string | null; despachado_em: string | null; entregue_em: string | null; created_at: string;
};
type P = Omit<Pedido, "itens" | "notas" | "cliente"> & { itens: (Item & { id: string })[]; cliente: Cliente; notas: { id: string; status: string; numero: string | null; serie?: string | null; chave?: string | null; mensagem: string | null; ambiente?: string }[]; aprovado_em?: string | null };

const COLUNAS = [
  { id: "orcamento", titulo: "Orçamentos e propostas", cor: "var(--kpi-roxo)" },
  { id: "nfe", titulo: "Aprovados · nota fiscal", cor: "var(--kpi-laranja)" },
  { id: "separar", titulo: "Separar e conferir", cor: "var(--kpi-ciano)" },
  { id: "embalar", titulo: "Embalar e despachar", cor: "var(--kpi-azul, #3b82f6)" },
  { id: "transito", titulo: "Em trânsito", cor: "var(--kpi-verde)" },
  { id: "entregue", titulo: "Entregues (15 dias)", cor: "#64748b" },
] as const;
const ETAPA: Record<string, string> = { separar: "a separar", separando: "separando", conferido: "conferido", embalado: "embalado", despachado: "despachado", entregue: "entregue" };

function coluna(p: P, e?: Exp) {
  if (p.status === "orcamento") return "orcamento";
  if (p.status === "cancelado" || e?.status === "cancelada") return null;
  if (p.status === "entregue" || e?.status === "entregue") {
    const d = e?.entregue_em ?? p.created_at;
    return Date.now() - new Date(d).getTime() < 15 * 864e5 ? "entregue" : null;
  }
  if (e) return e.status === "despachado" ? "transito" : ["conferido", "embalado"].includes(e.status) ? "embalar" : "separar";
  return "nfe";
}


export default function Fluxo() {
  const { filtrar } = useUnidade();
  const { data: todos = [] } = useRows<P>("pedidos", { select: "*, cliente:clientes(*), itens:pedido_itens(*), notas:notas_fiscais(id, status, numero, serie, chave, mensagem, ambiente)" });
  const etiquetas = useEtiquetas();
  const { data: exps = [] } = useRows<Exp>("expedicoes", {});
  const { data: cfg } = useConfig();
  const [canal, setCanal] = useState("");
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<{ p: P; e: Exp } | null>(null);
  const navigate = useNavigate();
  const pedidos = filtrar(todos).filter((p) => (!canal || p.origem === canal) && (!busca || `${p.numero} ${p.cliente?.nome}`.toLowerCase().includes(busca.toLowerCase())));
  const expDe = (id: string) => exps.find((e) => e.pedido_id === id);
  const porColuna = useMemo(() => {
    const m = new Map<string, P[]>(COLUNAS.map((c) => [c.id, []]));
    for (const p of pedidos) { const c = coluna(p, expDe(p.id)); if (c) m.get(c)!.push(p); }
    for (const l of m.values()) l.sort((a, b) => (b.aprovado_em ?? b.created_at).localeCompare(a.aprovado_em ?? a.created_at));
    return m;
  }, [pedidos, exps]); // eslint-disable-line react-hooks/exhaustive-deps
  const abrir = (p: P) => { const e = expDe(p.id); if (e) setAberta({ p, e }); else navigate("/pedidos", { state: { abrir: p.id } }); };

  return (
    <div>
      <PageHeader title="Fluxo de pedidos" subtitle={`Todos os canais num painel só. ${cfg?.nfe_automatica ? "NF-e automática ligada: pedido aprovado tem a nota emitida sozinho." : "NF-e automática desligada (Configurações → Automação de pedidos)."}`} />
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Buscar nº ou cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="flex gap-1.5 overflow-x-auto">
          {[["", "Todos os canais"], ...Object.entries(CANAIS)].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setCanal(v)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${canal === v ? "border-brand bg-brand text-brand-fg" : "border-slate-200 bg-surface text-slate-600"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
        <div className="grid min-w-[1180px] grid-cols-6 gap-3">
          {COLUNAS.map((c) => {
            const lista = porColuna.get(c.id) ?? [];
            return (
              <section key={c.id} className="flex min-h-[200px] flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-2">
                <header className="mb-2 flex items-center gap-2 px-1.5 pt-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.cor }} />
                  <h2 className="flex-1 text-sm font-bold text-fg">{c.titulo}</h2>
                  <span className="num text-xs font-semibold text-slate-500">{lista.length}</span>
                </header>
                <div className="flex items-center justify-between gap-1 px-1.5 pb-2">
                  <span className="num text-xs text-slate-500">{brl(lista.reduce((s, p) => s + Number(p.valor_total), 0))}</span>
                  {c.id === "embalar" && lista.length > 0 && (
                    <button type="button" disabled={etiquetas.ocupado} onClick={() => etiquetas.imprimir(lista.map((p) => ({ tipo: "pedido" as const, pedido_id: p.id })))}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-surface px-2 py-1 text-xs font-semibold text-fg hover:border-brand disabled:opacity-50" title="Imprimir as etiquetas de todos os pedidos desta coluna">
                      <Printer size={13} /> Imprimir todas
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {lista.slice(0, 40).map((p) => {
                    const e = expDe(p.id);
                    return <Cartao key={p.id} p={p} e={e} onClick={() => abrir(p)}
                      onEtiquetas={e && ["conferido", "embalado", "despachado"].includes(e.status) ? () => etiquetas.imprimir([{ tipo: "pedido", pedido_id: p.id }]) : undefined} />;
                  })}
                  {!lista.length && <p className="px-2 py-6 text-center text-xs text-slate-400">Nada aqui</p>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {aberta && <ExpedicaoModal pedido={aberta.p} exp={aberta.e} onClose={() => setAberta(null)} />}
    </div>
  );
}

function Cartao({ p, e, onClick, onEtiquetas }: { p: P; e?: Exp; onClick: () => void; onEtiquetas?: () => void }) {
  const nota = p.notas?.find((n) => n.status !== "cancelada");
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && onClick()}
      className="relative w-full cursor-pointer rounded-xl border border-slate-200 bg-surface p-2.5 text-left shadow-card transition hover:border-brand">
      {onEtiquetas && (
        <button type="button" aria-label={`Imprimir etiquetas do pedido ${p.numero}`} title="Imprimir etiquetas (um clique)"
          onClick={(ev) => { ev.stopPropagation(); onEtiquetas(); }}
          className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:border-brand hover:text-brand">
          <Printer size={15} />
        </button>
      )}
      <div className="flex items-center justify-between gap-1">
        <span className="text-sm font-bold text-fg">#{p.numero}<EtiquetaUnidade id={p.unidade_id} /></span>
        <span className="num text-sm font-semibold">{brl(p.valor_total)}</span>
      </div>
      <div className="truncate text-sm text-slate-600">{p.cliente?.nome}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{CANAIS[p.origem] ?? p.origem}</span>
        {p.status === "orcamento" && p.proposta_status && <Badge value={p.proposta_status} />}
        {p.status !== "orcamento" && (nota ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600"><FileText size={12} /> <Badge value={nota.status} /></span>
          : <span className="text-[11px] font-semibold text-amber-700">sem NF-e</span>)}
        {e && e.status !== "despachado" && e.status !== "entregue" && <Badge value={e.status === "separar" ? "pendente" : e.status === "separando" ? "em_producao" : "aprovado"} />}
        {e?.codigo_rastreio && <span className="text-[11px] text-slate-500">{e.codigo_rastreio}</span>}
      </div>
    </div>
  );
}

/* ------------------------------ Expedição ------------------------------ */

const PASSOS = ["separar", "separando", "conferido", "embalado", "despachado", "entregue"];

function ExpedicaoModal({ pedido: p, exp, onClose }: { pedido: P; exp: Exp; onClose: () => void }) {
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: comps = [] } = useRows<KitComponente>("kit_componentes", { order: "kit_id" });
  const { data: transp = [] } = useRows<Transportadora>("transportadoras", { order: "nome", ascending: true });
  const { data: cfg } = useConfig();
  const { nome: nomeUsuario } = usePerfil();
  const invalidar = useInvalidate();
  const [conf, setConf] = useState<Set<string>>(new Set(exp.itens_conferidos ?? []));
  const [f, setF] = useState({ volumes: String(exp.volumes ?? 1), peso_kg: String(exp.peso_kg ?? ""), transportadora_id: exp.transportadora_id ?? p.transportadora_id ?? "", codigo_rastreio: exp.codigo_rastreio ?? "", observacoes: "" });
  const [scan, setScan] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const etiquetasImp = useEtiquetas();
  const nota = p.notas?.find((n) => n.status === "autorizada" && n.ambiente !== "homologacao");
  const prod = (id: string) => produtos.find((x) => x.id === id);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const atual = PASSOS.indexOf(exp.status);

  async function avancar(etapa: string, dados: Record<string, unknown> = {}) {
    setOcupado(true);
    const { error } = await supabase.rpc("avancar_expedicao", { p_expedicao: exp.id, p_etapa: etapa, p_dados: dados });
    setOcupado(false);
    if (error) return notifyError(error);
    notify(etapa === "despachado" ? "Despachado: o cliente recebe o rastreio por e-mail" : "Expedição atualizada");
    invalidar("expedicoes", "pedidos");
    onClose();
  }
  async function emitirNota() {
    if (!(await confirmarSeTeste())) return;
    setOcupado(true);
    try { await callFunction("nfe-emitir", { pedido_id: p.id }); notify("NF-e enviada para a SEFAZ"); invalidar("pedidos", "notas_fiscais"); onClose(); }
    catch (e) { notifyError(e); } finally { setOcupado(false); }
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
        {!nota && !p.notas?.some((n) => ["processando", "contingencia"].includes(n.status)) && <Button type="button" variant="secondary" disabled={ocupado} onClick={emitirNota}><FileText size={15} /> Emitir NF-e</Button>}
        {!nota && p.notas?.some((n) => ["processando", "contingencia"].includes(n.status)) && <Badge value={p.notas.find((n) => ["processando", "contingencia"].includes(n.status))!.status} />}
      </div>

      {(exp.status === "separar" || exp.status === "separando") && (
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 font-semibold"><ClipboardCheck size={18} /> {exp.status === "separar" ? "Lista de separação" : "Conferência"}</h3>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {p.itens.map((i) => {
              const pr = prod(i.produto_id);
              const partes = pr?.kit ? composicao(i.produto_id, comps, i.kit_escolha) : [];
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
              : <Button type="button" disabled={ocupado || !nota} title={nota ? "" : "emita a NF-e antes"} onClick={() => avancar("despachado", { transportadora_id: f.transportadora_id || null, codigo_rastreio: f.codigo_rastreio })}><Send size={16} /> Despachar</Button>}
          </div>
        </div>
      )}

      {exp.status === "despachado" && (
        <div className="space-y-3 text-sm">
          <p>Despachado em <b>{dataBR(exp.despachado_em)}</b>{exp.codigo_rastreio ? <> · rastreio <b>{exp.codigo_rastreio}</b></> : null}{exp.volumes ? ` · ${exp.volumes} volume(s)` : ""}.</p>
          <div className="flex justify-end"><Button type="button" disabled={ocupado} onClick={() => avancar("entregue")}><CheckCircle2 size={16} /> Marcar entregue</Button></div>
        </div>
      )}
      {exp.status === "entregue" && <p className="text-sm text-emerald-700">Entregue em {dataBR(exp.entregue_em)}.</p>}
      {etiquetasImp.modal}
    </Modal>
  );
}
