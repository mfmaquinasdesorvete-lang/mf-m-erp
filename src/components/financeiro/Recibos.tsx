// Recibos: de recebimento (a MF recebeu de um cliente) e de pagamento (a MF pagou alguém, que assina).
// Saem das contas pagas (botão Recibo), da busca de conta paga ou avulsos. Numeração própria; emitido não muda: é
// cancelado com motivo ou excluído pelo financeiro (o número não volta e a exclusão fica na auditoria). O histórico do
// recibo junta a conta (datas, mudanças, comprovantes anexados), os outros recibos dela e a renegociação, se houver.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Ban, FileText, History, Plus, ReceiptText, Search, Trash2 } from "lucide-react";
import { BotaoAtalho, Button, CampoMes, COR_ATALHO, Field, Modal, Table } from "@/components/ui";
import { PdfViewer } from "@/components/PdfViewer";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, docFormat, hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { useUnidade, type Unidade } from "@/lib/unidade";
import { useConfig } from "@/lib/useConfig";
import { MEIOS } from "@/lib/formasPagamento";
import { valorPorExtenso } from "@/lib/extenso";
import { pdfRecibo } from "@/lib/pdf";
import { formatarTelefone } from "@/lib/mascaras";
import type { Config } from "@/lib/types";
import { confirmar, pedirTexto } from "@/components/Dialogos";
import { Anexos } from "@/components/Anexos";
import { Historico } from "@/components/Historico";
import { ChipRenegociada, HistoricoNegociacao } from "@/components/financeiro/Renegociacao";

export type Recibo = {
  id: string; numero: number; tipo: "recebimento" | "pagamento"; unidade_id: string | null;
  conta_receber_id: string | null; conta_pagar_id: string | null;
  pagador_nome: string; pagador_doc: string | null; recebedor_nome: string; recebedor_doc: string | null;
  valor: number; referente: string; forma_pagamento: string | null; data_pagamento: string; cidade: string | null;
  observacoes: string | null; cancelado_em: string | null; cancelado_motivo: string | null; created_at: string;
};
export type RascunhoRecibo = Partial<Recibo>;

export const rotuloMeio = (m?: string | null) => MEIOS.find(([k]) => k === m)?.[1] ?? m ?? null;

/** Quem emite (a unidade): nome para o cabeçalho, razão social, CNPJ, endereço e contato. */
function emitente(u: Unidade | undefined, cfg: Config | undefined) {
  const endereco = u
    ? [[u.logradouro, u.numero].filter(Boolean).join(", "), u.bairro, u.municipio && `${u.municipio}/${u.uf ?? ""}`, u.cep && `CEP ${String(u.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2")}`].filter(Boolean).join(" - ")
    : [cfg?.endereco, cfg?.municipio && `${cfg.municipio}/${cfg.uf ?? ""}`].filter(Boolean).join(" - ");
  return {
    nome: cfg?.nome_fantasia || u?.razao_social || u?.nome || cfg?.razao_social || "MF Máquinas",
    razao_social: u?.razao_social ?? cfg?.razao_social ?? null,
    cnpj: u?.cnpj ?? cfg?.cnpj ?? null,
    endereco: endereco || null,
    contato: [formatarTelefone(u?.whatsapp || cfg?.whatsapp), u?.email || cfg?.email].filter(Boolean).join("  ·  ") || null,
    cidade: u?.municipio ? `${u.municipio}/${u.uf ?? ""}` : cfg?.municipio ? `${cfg.municipio}/${cfg.uf ?? ""}` : null,
  };
}

/** Rascunho a partir de uma conta a receber paga: o cliente pagou, a MF recebe. */
export function reciboDeReceber(c: { id: string; descricao: string; valor: number; valor_pago: number | null; data_pagamento: string | null; forma_pagamento: string | null; unidade_id?: string | null;
  cliente?: { nome: string; cpf_cnpj?: string | null } | null }, u: Unidade | undefined, cfg: Config | undefined): RascunhoRecibo {
  const e = emitente(u, cfg);
  return {
    tipo: "recebimento", unidade_id: c.unidade_id ?? u?.id ?? null, conta_receber_id: c.id,
    pagador_nome: c.cliente?.nome ?? "", pagador_doc: c.cliente?.cpf_cnpj ?? null,
    recebedor_nome: e.razao_social ?? e.nome, recebedor_doc: e.cnpj,
    valor: Number(c.valor_pago ?? c.valor), referente: c.descricao, forma_pagamento: rotuloMeio(c.forma_pagamento),
    data_pagamento: c.data_pagamento ?? hoje(), cidade: e.cidade,
  };
}

/** Rascunho a partir de uma conta a pagar: a MF paga, quem recebe assina (ex.: o advogado). */
export function reciboDePagar(c: { id: string; descricao: string; valor: number; valor_pago: number | null; data_pagamento: string | null; unidade_id?: string | null },
  fornecedor: { nome: string; cnpj?: string | null } | undefined, u: Unidade | undefined, cfg: Config | undefined, forma?: string | null): RascunhoRecibo {
  const e = emitente(u, cfg);
  return {
    tipo: "pagamento", unidade_id: c.unidade_id ?? u?.id ?? null, conta_pagar_id: c.id,
    pagador_nome: e.razao_social ?? e.nome, pagador_doc: e.cnpj,
    recebedor_nome: fornecedor?.nome ?? "", recebedor_doc: fornecedor?.cnpj ?? null,
    valor: Number(c.valor_pago ?? c.valor), referente: c.descricao.replace(/ · (\d{2})\/(\d{4})$/, " (competência $1/$2)"), forma_pagamento: forma ?? null,
    data_pagamento: c.data_pagamento ?? hoje(), cidade: e.cidade,
  };
}

// as mesmas consultas da tela de contas (a lista já carregada é reaproveitada)
const SELECT_PAGAR = "*, fornecedor:fornecedores(nome, cnpj, bloqueado, bloqueio_motivo)";
const SELECT_RECEBER = "*, cliente:clientes(*)";
type ContaPaga = {
  id: string; descricao: string; valor: number; valor_pago: number | null; data_pagamento: string | null; vencimento: string; status: string;
  unidade_id?: string | null; forma_pagamento?: string | null; negociacao_id?: string | null; negociacao_papel?: string | null; documento?: string | null;
  fornecedor?: { nome: string; cnpj?: string | null } | null; cliente?: { nome: string; nome_fantasia?: string | null; cpf_cnpj?: string | null } | null;
};
const nomeTerceiro = (c: ContaPaga) => c.fornecedor?.nome ?? c.cliente?.nome_fantasia?.trim() ?? c.cliente?.nome ?? "";

/** Busca uma conta já paga (a pagar ou a receber) para o recibo sair com os dados dela. */
function BuscarContaPaga({ tipo, onEscolher }: { tipo: "recebimento" | "pagamento"; onEscolher: (c: ContaPaga) => void }) {
  const { data: pagar = [] } = useRows<ContaPaga>("contas_pagar", { select: SELECT_PAGAR });
  const { data: receber = [] } = useRows<ContaPaga>("contas_receber", { select: SELECT_RECEBER });
  const { data: recibos = [] } = useRows<Recibo>("recibos", { order: "numero", ascending: false });
  const [termo, setTermo] = useState("");
  const t = termo.trim().toLowerCase();
  const comRecibo = useMemo(() => new Set(recibos.filter((r) => !r.cancelado_em).map((r) => r.conta_pagar_id ?? r.conta_receber_id)), [recibos]);
  const lista = (tipo === "pagamento" ? pagar : receber)
    .filter((c) => c.status === "pago" && (!t || [c.descricao, nomeTerceiro(c), c.documento, brl(Number(c.valor_pago ?? c.valor)), dataBR(c.data_pagamento ?? "")].join(" ").toLowerCase().includes(t)))
    .sort((a, b) => (b.data_pagamento ?? "").localeCompare(a.data_pagamento ?? ""))
    .slice(0, 8);
  return (
    <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-2.5 sm:col-span-2">
      <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><Search size={14} aria-hidden /> Buscar a conta {tipo === "pagamento" ? "paga" : "recebida"}
        <input className="input h-9 flex-1 font-normal" value={termo} onChange={(e) => setTermo(e.target.value)} placeholder={tipo === "pagamento" ? "Fornecedor, descrição, valor ou data" : "Cliente, descrição, valor ou data"} />
      </label>
      <ul className="mt-1.5 max-h-44 space-y-1 overflow-y-auto">
        {lista.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onEscolher(c)} className="flex w-full items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-left text-xs hover:bg-cyan-100">
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-fg">{nomeTerceiro(c) || c.descricao}</span><span className="block truncate text-xs text-slate-500">{c.descricao}</span></span>
              <span className="shrink-0 text-right"><span className="num block font-semibold">{brl(Number(c.valor_pago ?? c.valor))}</span><span className="num block text-xs text-slate-500">{c.data_pagamento ? `pago ${dataBR(c.data_pagamento)}` : ""}</span></span>
              {comRecibo.has(c.id) && <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 text-2xs font-bold text-emerald-800" title="Esta conta já tem recibo">tem recibo</span>}
            </button>
          </li>
        ))}
        {!lista.length && <li className="px-1 py-2 text-xs text-slate-500">Nenhuma conta {tipo === "pagamento" ? "paga" : "recebida"} com esse texto.</li>}
      </ul>
    </div>
  );
}

/** Emite (rascunho) ou mostra (recibo já emitido) o recibo. */
export function ReciboModal({ rascunho, onClose }: { rascunho: RascunhoRecibo; onClose: () => void }) {
  const { pode, tem } = usePerfil();
  const podeEmitir = pode("editar_financeiro") || tem("vendas");
  const { unidades } = useUnidade();
  const { data: cfg } = useConfig();
  const invalidar = useInvalidate();
  const [r, setR] = useState<RascunhoRecibo>(rascunho);
  const [vias, setVias] = useState<1 | 2>(2);
  const [pdf, setPdf] = useState<{ blob: Blob; numero: number } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const set = (p: RascunhoRecibo) => setR((x) => ({ ...x, ...p }));

  async function gerar(rec: Recibo, nVias: 1 | 2) {
    const u = unidades.find((x) => x.id === rec.unidade_id) ?? unidades.find((x) => x.matriz) ?? unidades[0];
    const blob = await pdfRecibo({ ...rec, emitente: emitente(u, cfg) }, nVias);
    setPdf({ blob, numero: rec.numero });
  }

  // recibo já emitido: abre direto o PDF
  const jaEmitido = !!rascunho.id;
  useEffect(() => {
    if (jaEmitido && cfg) gerar(rascunho as Recibo, 2).catch(notifyError);
  }, [jaEmitido, cfg]); // eslint-disable-line react-hooks/exhaustive-deps

  async function emitir(e: FormEvent) {
    e.preventDefault();
    if (!(Number(r.valor) > 0)) return notify("Informe o valor", "erro");
    setOcupado(true);
    try {
      const dados = {
        tipo: r.tipo ?? "recebimento", unidade_id: r.unidade_id ?? unidades.find((x) => x.matriz)?.id ?? null,
        conta_receber_id: r.conta_receber_id ?? null, conta_pagar_id: r.conta_pagar_id ?? null,
        pagador_nome: String(r.pagador_nome ?? "").trim(), pagador_doc: String(r.pagador_doc ?? "").replace(/\D/g, "") || null,
        recebedor_nome: String(r.recebedor_nome ?? "").trim(), recebedor_doc: String(r.recebedor_doc ?? "").replace(/\D/g, "") || null,
        valor: Number(String(r.valor).replace(",", ".")), referente: String(r.referente ?? "").trim(), forma_pagamento: r.forma_pagamento || null,
        data_pagamento: r.data_pagamento || hoje(), cidade: r.cidade || null, observacoes: r.observacoes?.trim() || null,
      };
      const { data, error } = await supabase.from("recibos").insert(dados).select("*").single();
      if (error) throw error;
      notify(`Recibo nº ${data.numero} emitido`);
      invalidar("recibos");
      await gerar(data as Recibo, vias);
    } catch (err) {
      notifyError(err);
    } finally {
      setOcupado(false);
    }
  }

  // conta escolhida na busca: o recibo sai com os dados dela (quem pagou, quem recebeu, valor, data, referente)
  function usarConta(c: ContaPaga) {
    const u = unidades.find((x) => x.id === c.unidade_id) ?? unidades.find((x) => x.matriz);
    const novo = r.tipo === "pagamento"
      ? reciboDePagar(c, c.fornecedor ?? undefined, u, cfg, rotuloMeio(c.forma_pagamento))
      : reciboDeReceber({ ...c, forma_pagamento: c.forma_pagamento ?? null, cliente: c.cliente ? { nome: c.cliente.nome, cpf_cnpj: c.cliente.cpf_cnpj } : null }, u, cfg);
    setR((x) => ({ ...x, ...novo, observacoes: x.observacoes }));
    notify("Dados da conta preenchidos: confira e emita");
  }

  // emitente da unidade escolhida, para trocar quem paga/recebe quando muda o tipo
  function trocarTipo(tipo: "recebimento" | "pagamento") {
    if (tipo === r.tipo) return;
    set({ tipo, pagador_nome: r.recebedor_nome, pagador_doc: r.recebedor_doc, recebedor_nome: r.pagador_nome, recebedor_doc: r.pagador_doc,
      ...(rascunho.conta_pagar_id || rascunho.conta_receber_id ? {} : { conta_pagar_id: null, conta_receber_id: null }) });
  }

  if (pdf) return <PdfViewer blob={pdf.blob} nome={`recibo-${String(pdf.numero).padStart(6, "0")}.pdf`} titulo={`Recibo nº ${pdf.numero}`} onClose={onClose} />;
  if (jaEmitido) return null;

  const valorNum = Number(String(r.valor ?? "").replace(",", "."));
  return (
    <Modal open onClose={onClose} title="Emitir recibo">
      <form onSubmit={emitir} className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <fieldset disabled={!podeEmitir} className="contents">
          <div className="flex gap-1 rounded-xl border border-slate-200 p-1 sm:col-span-2">
            {(["recebimento", "pagamento"] as const).map((t) => (
              <button key={t} type="button" onClick={() => trocarTipo(t)}
                className={`flex-1 rounded-lg px-3 py-2 text-left font-semibold ${r.tipo === t ? "bg-brand text-brand-fg" : "text-slate-600 hover:bg-slate-100"}`}>
                {t === "recebimento" ? "Recebimento" : "Pagamento"}
                <span className="block text-xs font-normal opacity-90">{t === "recebimento" ? "a MF recebeu de um cliente (a MF assina)" : "a MF pagou alguém (quem recebeu assina)"}</span>
              </button>
            ))}
          </div>
          {podeEmitir && !rascunho.conta_pagar_id && !rascunho.conta_receber_id && <BuscarContaPaga tipo={r.tipo ?? "recebimento"} onEscolher={usarConta} />}
          {(r.conta_pagar_id || r.conta_receber_id) && <p className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 sm:col-span-2">Ligado à conta {r.conta_pagar_id ? "a pagar" : "a receber"}: o recibo aparece no histórico dela.</p>}
          <Field label="Quem pagou"><input className="input" required minLength={2} value={r.pagador_nome ?? ""} onChange={(e) => set({ pagador_nome: e.target.value })} /></Field>
          <Field label="CPF/CNPJ de quem pagou"><input className="input" inputMode="numeric" value={docFormat(r.pagador_doc) || r.pagador_doc || ""} onChange={(e) => set({ pagador_doc: e.target.value })} /></Field>
          <Field label="Quem recebeu (assina)"><input className="input" required minLength={2} value={r.recebedor_nome ?? ""} onChange={(e) => set({ recebedor_nome: e.target.value })} /></Field>
          <Field label="CPF/CNPJ de quem recebeu"><input className="input" inputMode="numeric" value={docFormat(r.recebedor_doc) || r.recebedor_doc || ""} onChange={(e) => set({ recebedor_doc: e.target.value })} /></Field>
          <Field label="Valor (R$)"><input className="input" inputMode="decimal" required value={r.valor ?? ""} onChange={(e) => set({ valor: e.target.value as unknown as number })} /></Field>
          <Field label="Data do pagamento"><input className="input" type="date" required value={r.data_pagamento ?? ""} onChange={(e) => set({ data_pagamento: e.target.value })} /></Field>
          {valorNum > 0 && <p className="-mt-1 rounded-lg bg-slate-50 px-3 py-2 text-xs italic text-slate-600 sm:col-span-2">{brl(valorNum)} ({valorPorExtenso(valorNum)})</p>}
          <Field label="Referente a" className="sm:col-span-2"><input className="input" required minLength={3} value={r.referente ?? ""} onChange={(e) => set({ referente: e.target.value })} placeholder="Ex.: Honorários advocatícios de outubro/2026" /></Field>
          <Field label="Forma de pagamento">
            <input className="input" list="formas-recibo" value={r.forma_pagamento ?? ""} onChange={(e) => set({ forma_pagamento: e.target.value })} />
            <datalist id="formas-recibo">{MEIOS.map(([, l]) => <option key={l} value={l} />)}</datalist>
          </Field>
          <Field label="Cidade (local da assinatura)"><input className="input" value={r.cidade ?? ""} onChange={(e) => set({ cidade: e.target.value })} /></Field>
          <Field label="Observação (opcional)" className="sm:col-span-2"><input className="input" value={r.observacoes ?? ""} onChange={(e) => set({ observacoes: e.target.value })} /></Field>
          <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={vias === 2} onChange={(e) => setVias(e.target.checked ? 2 : 1)} /> Duas vias na folha (uma para cada lado, com linha de corte)</label>
        </fieldset>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          {podeEmitir && <Button disabled={ocupado}><ReceiptText size={16} /> {ocupado ? "Emitindo…" : "Emitir recibo"}</Button>}
        </div>
      </form>
    </Modal>
  );
}

/** Aba Financeiro → Recibos: todos os recibos emitidos, com reimpressão e cancelamento. */
export function Recibos() {
  const { pode, tem } = usePerfil();
  const podeEmitir = pode("editar_financeiro") || tem("vendas");
  const podeExcluir = pode("editar_financeiro");
  const [historico, setHistorico] = useState<Recibo | null>(null);
  // a conta de cada recibo, para buscar pelo fornecedor/cliente e pela descrição dela
  const { data: pagar = [] } = useRows<ContaPaga>("contas_pagar", { select: SELECT_PAGAR });
  const { data: receber = [] } = useRows<ContaPaga>("contas_receber", { select: SELECT_RECEBER });
  const contaDe = useMemo(() => {
    const m = new Map<string, ContaPaga>();
    for (const c of pagar) m.set(c.id, c);
    for (const c of receber) m.set(c.id, c);
    return (r: Recibo) => m.get(r.conta_pagar_id ?? r.conta_receber_id ?? "") ?? null;
  }, [pagar, receber]);
  const { filtrar, padrao, unidades } = useUnidade();
  const { data: cfg } = useConfig();
  const invalidar = useInvalidate();
  const { data: todos = [] } = useRows<Recibo>("recibos", { order: "numero", ascending: false });
  const [aberto, setAberto] = useState<RascunhoRecibo | null>(null);
  const [tipo, setTipo] = useState<"" | "recebimento" | "pagamento">("");
  const [busca, setBusca] = useState("");
  const [mes, setMes] = useState("");
  const termo = busca.trim().toLowerCase();
  const lista = useMemo(() => filtrar(todos).filter((r) =>
    (!tipo || r.tipo === tipo) && (!mes || r.data_pagamento.startsWith(mes))
    && (!termo || [r.numero, r.pagador_nome, r.recebedor_nome, r.referente, contaDe(r)?.descricao, contaDe(r) && nomeTerceiro(contaDe(r)!), contaDe(r)?.documento]
      .join(" ").toLowerCase().includes(termo))), [todos, tipo, mes, termo, filtrar, contaDe]);
  const total = lista.filter((r) => !r.cancelado_em).reduce((s, r) => s + Number(r.valor), 0);
  const [lote, setLote] = useState<{ blob: Blob; n: number } | null>(null);
  const [gerando, setGerando] = useState(false);

  /** Os recibos da lista (sem os cancelados) num PDF só, um por página, para assinar digitalmente de uma vez. */
  async function pdfLote() {
    const validos = lista.filter((r) => !r.cancelado_em).slice().sort((a, b) => a.data_pagamento.localeCompare(b.data_pagamento) || a.numero - b.numero);
    if (!validos.length) return notify("Nenhum recibo na lista", "erro");
    setGerando(true);
    try {
      const blob = await pdfRecibo(validos.map((r) => ({ ...r, emitente: emitente(unidades.find((u) => u.id === r.unidade_id), cfg) })), 1);
      setLote({ blob, n: validos.length });
    } catch (e) { notifyError(e); } finally { setGerando(false); }
  }

  function novo() {
    const u = unidades.find((x) => x.id === padrao) ?? unidades[0];
    const e = emitente(u, cfg);
    setAberto({ tipo: "recebimento", unidade_id: u?.id ?? null, recebedor_nome: e.razao_social ?? e.nome, recebedor_doc: e.cnpj, data_pagamento: hoje(), cidade: e.cidade });
  }

  async function cancelar(r: Recibo) {
    const motivo = (await pedirTexto(`Cancelar o recibo nº ${r.numero}? Informe o motivo:`))?.trim();
    if (!motivo) return;
    if (motivo.length < 3) return notify("Escreva o motivo (pelo menos 3 letras)", "erro");
    const { error } = await supabase.from("recibos").update({ cancelado_em: new Date().toISOString(), cancelado_motivo: motivo }).eq("id", r.id);
    if (error) return notifyError(error);
    notify(`Recibo nº ${r.numero} cancelado`);
    invalidar("recibos");
  }

  async function excluir(r: Recibo) {
    if (!(await confirmar(`Excluir o recibo nº ${r.numero}? O número não volta a ser usado e a exclusão fica registrada na auditoria (quem e quando).`, { perigo: true, ok: "Excluir" }))) return;
    const { error } = await supabase.from("recibos").delete().eq("id", r.id);
    if (error) return notifyError(error);
    notify(`Recibo nº ${r.numero} excluído`);
    invalidar("recibos", "auditoria");
  }

  return (
    <div>
      {aberto && <ReciboModal rascunho={aberto} onClose={() => setAberto(null)} />}
      {historico && <HistoricoRecibo recibo={historico} conta={contaDe(historico)} todos={todos} onClose={() => setHistorico(null)} onAbrir={(x) => { setHistorico(null); setAberto(x); }} />}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Field label="Buscar"><input className="input w-64 max-w-full" placeholder="Nº, nome, referência ou a conta" value={busca} onChange={(e) => setBusca(e.target.value)} /></Field>
        <Field label="Tipo">
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            <option value="">Todos</option><option value="recebimento">Recebimento</option><option value="pagamento">Pagamento</option>
          </select>
        </Field>
        <Field label="Mês"><CampoMes value={mes} onChange={setMes} vazio="Todos os meses" /></Field>
        <p className="mb-2 ml-auto text-sm text-slate-600">{lista.length} {pl(lista.length, "recibo", "recibos")} · <b>{brl(total)}</b></p>
        {lista.length > 1 && <Button variant="secondary" disabled={gerando} onClick={pdfLote} title="Um PDF com todos os recibos da lista, um por página, para assinar de uma vez">
          <FileText size={16} /> {gerando ? "Gerando…" : `PDF em lote (${lista.filter((r) => !r.cancelado_em).length})`}</Button>}
        {podeEmitir && <Button onClick={novo}><Plus size={16} /> Novo recibo</Button>}
      </div>
      {lote && <PdfViewer blob={lote.blob} nome={`recibos-${lote.n}.pdf`} titulo={`${lote.n} recibos em um PDF`} onClose={() => setLote(null)} />}
      <Table empty={!lista.length}
        head={<><th className="th">Nº</th><th className="th">Data</th><th className="th">Tipo</th><th className="th">Quem pagou → quem recebeu</th><th className="th">Referente a</th><th className="th text-right">Valor</th><th className="th" /></>}>
        {lista.map((r) => (
          <tr key={r.id} className={r.cancelado_em ? "opacity-90" : ""}>
            <td className="td font-mono text-xs">{String(r.numero).padStart(6, "0")}</td>
            <td className="td whitespace-nowrap">{dataBR(r.data_pagamento)}</td>
            <td className="td">
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.tipo === "recebimento" ? "bg-emerald-100 text-emerald-800" : "bg-orange-100 text-orange-800"}`}>{r.tipo === "recebimento" ? "recebimento" : "pagamento"}</span>
              {r.cancelado_em && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800" title={r.cancelado_motivo ?? ""}>cancelado</span>}
            </td>
            <td className="td">{r.pagador_nome} <span className="text-slate-400">→</span> {r.recebedor_nome}</td>
            <td className="td">{r.referente}<div className="text-xs text-slate-500">{[r.forma_pagamento, (r.conta_pagar_id || r.conta_receber_id) && (contaDe(r) ? `conta: ${contaDe(r)!.descricao}` : "ligado a uma conta")].filter(Boolean).join(" · ")}</div></td>
            <td className="td text-right font-semibold">{brl(r.valor)}</td>
            <td className="td whitespace-nowrap text-right">
              <Button variant="secondary" onClick={() => setAberto(r)}><FileText size={15} /> PDF</Button>
              <Button variant="ghost" title="Histórico: a conta, as datas, os arquivos e os outros recibos" aria-label={`Histórico do recibo ${r.numero}`} onClick={() => setHistorico(r)}><History size={15} /></Button>
              {podeEmitir && !r.cancelado_em && <Button variant="ghost" className="!text-red-600" title="Cancelar recibo (informando o motivo)" aria-label={`Cancelar o recibo ${r.numero}`} onClick={() => cancelar(r)}><Ban size={15} /></Button>}
              {podeExcluir && <Button variant="ghost" className="!text-red-600" title="Excluir o recibo (o número não volta)" aria-label={`Excluir o recibo ${r.numero}`} onClick={() => excluir(r)}><Trash2 size={15} /></Button>}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/** Histórico completo do recibo: quando foi emitido/cancelado, a conta (datas, mudanças e comprovantes), os outros recibos dela e a renegociação. */
function HistoricoRecibo({ recibo: r, conta, todos, onClose, onAbrir }: { recibo: Recibo; conta: ContaPaga | null; todos: Recibo[]; onClose: () => void; onAbrir: (r: Recibo) => void }) {
  const [negociacao, setNegociacao] = useState<string | null>(null);
  const { data: pagar = [] } = useRows<ContaPaga>("contas_pagar", { select: SELECT_PAGAR });
  const entidade = r.conta_pagar_id ? "conta_pagar" : "conta_receber";
  const tabela = r.conta_pagar_id ? "contas_pagar" : "contas_receber";
  const contaId = r.conta_pagar_id ?? r.conta_receber_id;
  const outros = contaId ? todos.filter((x) => x.id !== r.id && (x.conta_pagar_id ?? x.conta_receber_id) === contaId) : [];
  const datas = [
    conta?.vencimento && { quando: conta.vencimento, texto: "Vencimento da conta" },
    conta?.data_pagamento && { quando: conta.data_pagamento, texto: `${r.conta_pagar_id ? "Pago" : "Recebido"} · ${brl(Number(conta.valor_pago ?? conta.valor))}` },
    { quando: r.data_pagamento, texto: "Data do pagamento no recibo" },
    { quando: r.created_at.slice(0, 10), texto: `Recibo nº ${r.numero} emitido` },
    r.cancelado_em && { quando: r.cancelado_em.slice(0, 10), texto: `Recibo cancelado${r.cancelado_motivo ? `: ${r.cancelado_motivo}` : ""}` },
    ...outros.map((x) => ({ quando: x.created_at.slice(0, 10), texto: `Recibo nº ${x.numero} emitido${x.cancelado_em ? " (cancelado)" : ""}` })),
  ].filter(Boolean) as { quando: string; texto: string }[];
  datas.sort((a, b) => a.quando.localeCompare(b.quando));
  return (
    <>
      <Modal open onClose={onClose} title={`Histórico do recibo nº ${r.numero}`} wide>
        <div className="space-y-4 text-sm">
          <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
            <div><span className="text-xs font-semibold text-slate-500">Quem pagou → quem recebeu</span><div className="font-semibold text-fg">{r.pagador_nome} → {r.recebedor_nome}</div></div>
            <div><span className="text-xs font-semibold text-slate-500">Valor</span><div className="num font-bold text-fg">{brl(r.valor)}</div></div>
            <div className="sm:col-span-2"><span className="text-xs font-semibold text-slate-500">Referente a</span><div className="text-fg">{r.referente}</div></div>
            {conta && <div className="flex flex-wrap items-center gap-2 sm:col-span-2"><span className="text-xs font-semibold text-slate-500">Conta {r.conta_pagar_id ? "a pagar" : "a receber"}:</span>
              <span className="font-semibold text-fg">{conta.descricao}</span>
              {conta.negociacao_id && <ChipRenegociada papel={conta.negociacao_papel} onClick={() => setNegociacao(conta.negociacao_id!)} />}</div>}
            {!contaId && <p className="text-xs text-slate-500 sm:col-span-2">Recibo avulso (sem conta ligada).</p>}
          </div>
          <section aria-label="Datas">
            <h3 className="mb-1.5 font-bold text-fg">Datas</h3>
            <ol className="space-y-1">
              {datas.map((d, i) => <li key={i} className="flex gap-3"><span className="num w-24 shrink-0 font-semibold text-fg">{dataBR(d.quando)}</span><span className="text-slate-700">{d.texto}</span></li>)}
            </ol>
          </section>
          {outros.length > 0 && (
            <section aria-label="Outros recibos da conta">
              <h3 className="mb-1.5 font-bold text-fg">Outros recibos desta conta</h3>
              <div className="flex flex-wrap gap-2">{outros.map((x) => <Button key={x.id} variant="secondary" onClick={() => onAbrir(x)}><FileText size={14} /> Nº {x.numero}{x.cancelado_em ? " (cancelado)" : ""}</Button>)}</div>
            </section>
          )}
          {contaId && <Anexos entidade={entidade} id={contaId} titulo="Arquivos da conta (comprovante, boleto, nota)" />}
          {contaId && <section aria-label="Mudanças na conta"><h3 className="mb-1 font-bold text-fg">Mudanças na conta</h3><Historico tabela={tabela} id={contaId} /></section>}
          <section aria-label="Mudanças no recibo"><h3 className="mb-1 font-bold text-fg">Mudanças no recibo</h3><Historico tabela="recibos" id={r.id} /></section>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => onAbrir(r)}><FileText size={15} /> Abrir o PDF</Button><Button onClick={onClose}>Fechar</Button></div>
        </div>
      </Modal>
      {negociacao && <HistoricoNegociacao id={negociacao} contas={pagar as any} onClose={() => setNegociacao(null)} />}
    </>
  );
}

/** Botão "Recibo" nas contas pagas: abre o recibo já emitido ou prepara um novo. */
export function BotaoRecibo({ contaId, tipo, montar, atalho = false }: { contaId: string; tipo: "receber" | "pagar"; montar: () => RascunhoRecibo; atalho?: boolean }) {
  const { data: recibos = [] } = useRows<Recibo>("recibos", { order: "numero", ascending: false });
  const [aberto, setAberto] = useState<RascunhoRecibo | null>(null);
  const existente = recibos.find((r) => !r.cancelado_em && (tipo === "receber" ? r.conta_receber_id : r.conta_pagar_id) === contaId);
  return (
    <>
      {aberto && <ReciboModal rascunho={aberto} onClose={() => setAberto(null)} />}
      {atalho ? (
        <BotaoAtalho icon={ReceiptText} label={existente ? `Recibo ${existente.numero}` : "Recibo"} cor={COR_ATALHO.ciano}
          title={existente ? `Recibo nº ${existente.numero} (abrir de novo)` : "Emitir recibo"} onClick={() => setAberto(existente ?? montar())} />
      ) : <Button variant="ghost" title={existente ? `Recibo nº ${existente.numero} (abrir de novo)` : "Emitir recibo"} onClick={() => setAberto(existente ?? montar())}>
        <ReceiptText size={15} className={existente ? "text-emerald-600" : ""} />{existente ? <span className="text-xs">{existente.numero}</span> : null}
      </Button>}
    </>
  );
}
