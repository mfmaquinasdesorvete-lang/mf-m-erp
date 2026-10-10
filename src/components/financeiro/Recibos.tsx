// Recibos: de recebimento (a MF recebeu de um cliente) e de pagamento (a MF pagou alguém, que assina).
// Saem das contas pagas (botão Recibo) ou avulsos. Numeração própria; emitido não muda, só é cancelado com motivo.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Ban, FileText, Plus, ReceiptText } from "lucide-react";
import { Button, Field, Modal, Table } from "@/components/ui";
import { PdfViewer } from "@/components/PdfViewer";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, docFormat, hoje } from "@/lib/format";
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

/** Emite (rascunho) ou mostra (recibo já emitido) o recibo. */
export function ReciboModal({ rascunho, onClose }: { rascunho: RascunhoRecibo; onClose: () => void }) {
  const { pode, papel } = usePerfil();
  const podeEmitir = pode("editar_financeiro") || papel === "vendas";
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

  // emitente da unidade escolhida, para trocar quem paga/recebe quando muda o tipo
  function trocarTipo(tipo: "recebimento" | "pagamento") {
    if (tipo === r.tipo) return;
    set({ tipo, pagador_nome: r.recebedor_nome, pagador_doc: r.recebedor_doc, recebedor_nome: r.pagador_nome, recebedor_doc: r.pagador_doc });
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
                <span className="block text-xs font-normal opacity-80">{t === "recebimento" ? "a MF recebeu de um cliente (a MF assina)" : "a MF pagou alguém (quem recebeu assina)"}</span>
              </button>
            ))}
          </div>
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
  const { pode, papel } = usePerfil();
  const podeEmitir = pode("editar_financeiro") || papel === "vendas";
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
    && (!termo || [r.numero, r.pagador_nome, r.recebedor_nome, r.referente].join(" ").toLowerCase().includes(termo))), [todos, tipo, mes, termo, filtrar]);
  const total = lista.filter((r) => !r.cancelado_em).reduce((s, r) => s + Number(r.valor), 0);

  function novo() {
    const u = unidades.find((x) => x.id === padrao) ?? unidades[0];
    const e = emitente(u, cfg);
    setAberto({ tipo: "recebimento", unidade_id: u?.id ?? null, recebedor_nome: e.razao_social ?? e.nome, recebedor_doc: e.cnpj, data_pagamento: hoje(), cidade: e.cidade });
  }

  async function cancelar(r: Recibo) {
    const motivo = prompt(`Cancelar o recibo nº ${r.numero}? Informe o motivo:`)?.trim();
    if (!motivo) return;
    if (motivo.length < 3) return notify("Escreva o motivo (pelo menos 3 letras)", "erro");
    const { error } = await supabase.from("recibos").update({ cancelado_em: new Date().toISOString(), cancelado_motivo: motivo }).eq("id", r.id);
    if (error) return notifyError(error);
    notify(`Recibo nº ${r.numero} cancelado`);
    invalidar("recibos");
  }

  return (
    <div>
      {aberto && <ReciboModal rascunho={aberto} onClose={() => setAberto(null)} />}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Field label="Buscar"><input className="input w-56" placeholder="Nº, nome ou referência" value={busca} onChange={(e) => setBusca(e.target.value)} /></Field>
        <Field label="Tipo">
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            <option value="">Todos</option><option value="recebimento">Recebimento</option><option value="pagamento">Pagamento</option>
          </select>
        </Field>
        <Field label="Mês"><input className="input" type="month" value={mes} onChange={(e) => setMes(e.target.value)} /></Field>
        <p className="mb-2 ml-auto text-sm text-slate-600">{lista.length} recibo(s) · <b>{brl(total)}</b></p>
        {podeEmitir && <Button onClick={novo}><Plus size={16} /> Novo recibo</Button>}
      </div>
      <Table empty={!lista.length}
        head={<><th className="th">Nº</th><th className="th">Data</th><th className="th">Tipo</th><th className="th">Quem pagou → quem recebeu</th><th className="th">Referente a</th><th className="th text-right">Valor</th><th className="th" /></>}>
        {lista.map((r) => (
          <tr key={r.id} className={r.cancelado_em ? "opacity-60" : ""}>
            <td className="td font-mono text-xs">{String(r.numero).padStart(6, "0")}</td>
            <td className="td whitespace-nowrap">{dataBR(r.data_pagamento)}</td>
            <td className="td">
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.tipo === "recebimento" ? "bg-emerald-100 text-emerald-800" : "bg-orange-100 text-orange-800"}`}>{r.tipo === "recebimento" ? "recebimento" : "pagamento"}</span>
              {r.cancelado_em && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800" title={r.cancelado_motivo ?? ""}>cancelado</span>}
            </td>
            <td className="td">{r.pagador_nome} <span className="text-slate-400">→</span> {r.recebedor_nome}</td>
            <td className="td">{r.referente}{r.forma_pagamento && <div className="text-xs text-slate-500">{r.forma_pagamento}</div>}</td>
            <td className="td text-right font-semibold">{brl(r.valor)}</td>
            <td className="td whitespace-nowrap text-right">
              <Button variant="secondary" onClick={() => setAberto(r)}><FileText size={15} /> PDF</Button>
              {podeEmitir && !r.cancelado_em && <Button variant="ghost" className="!text-red-600" title="Cancelar recibo (informando o motivo)" onClick={() => cancelar(r)}><Ban size={15} /></Button>}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/** Botão "Recibo" nas contas pagas: abre o recibo já emitido ou prepara um novo. */
export function BotaoRecibo({ contaId, tipo, montar }: { contaId: string; tipo: "receber" | "pagar"; montar: () => RascunhoRecibo }) {
  const { data: recibos = [] } = useRows<Recibo>("recibos", { order: "numero", ascending: false });
  const [aberto, setAberto] = useState<RascunhoRecibo | null>(null);
  const existente = recibos.find((r) => !r.cancelado_em && (tipo === "receber" ? r.conta_receber_id : r.conta_pagar_id) === contaId);
  return (
    <>
      {aberto && <ReciboModal rascunho={aberto} onClose={() => setAberto(null)} />}
      <Button variant="ghost" title={existente ? `Recibo nº ${existente.numero} (abrir de novo)` : "Emitir recibo"} onClick={() => setAberto(existente ?? montar())}>
        <ReceiptText size={15} className={existente ? "text-emerald-600" : ""} />{existente ? <span className="text-xs">{existente.numero}</span> : null}
      </Button>
    </>
  );
}
