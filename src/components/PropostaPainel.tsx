// Dentro do orçamento: enviar como proposta (e-mail ou WhatsApp), acompanhar se o cliente abriu,
// aprovou ou recusou, e registrar o motivo quando a venda não sai.
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, ExternalLink, Mail, MessageCircle, ThumbsDown } from "lucide-react";
import { Badge, Button, Field, Modal } from "./ui";
import { callFunction, DEMO, supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { dataBR, whatsappLink } from "@/lib/format";
import { linkProposta, MOTIVOS, STATUS_PROPOSTA } from "@/lib/propostas";
import type { Cliente, Pedido } from "@/lib/types";

type Props = {
  pedido: Partial<Pedido>; cliente?: Cliente; podeEditar: boolean;
  /** grava o orçamento antes de enviar (devolve o id) */
  gravar: () => Promise<string>;
  /** PDF da proposta (base64) para anexar no e-mail */
  pdfBase64: () => Promise<string | null>;
  onAlterado: () => void;
};

const quando = (d?: string | null) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

export function PropostaPainel({ pedido: p, cliente, podeEditar, gravar, pdfBase64, onAlterado }: Props) {
  const [email, setEmail] = useState(false);
  const [recusa, setRecusa] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const navigate = useNavigate();
  const st = p.proposta_status;
  const aberta = p.status === "orcamento";
  if (!aberta && !st) return null;

  async function marcar(): Promise<string> {
    const id = await gravar();
    const { data, error } = await supabase.rpc("marcar_proposta_enviada", { p_pedido: id });
    if (error) throw error;
    return data as string;
  }
  async function pelaWhats() {
    if (!cliente?.whatsapp) return notify("Cadastre o WhatsApp do cliente", "erro");
    const janela = window.open("", "_blank");
    setOcupado(true);
    try {
      const token = await marcar();
      const texto = `Olá ${cliente.nome.split(" ")[0]}! Segue a nossa proposta${p.numero ? ` nº ${p.numero}` : ""}. Veja os detalhes e aprove por aqui:\n${linkProposta(token)}`;
      if (janela) janela.location.href = whatsappLink(cliente.whatsapp, texto); else window.open(whatsappLink(cliente.whatsapp, texto), "_blank");
      notify("Proposta enviada. Você recebe um aviso quando o cliente abrir e responder.");
      onAlterado();
    } catch (e) { janela?.close(); notifyError(e); } finally { setOcupado(false); }
  }
  const copiar = () => p.proposta_token && navigator.clipboard.writeText(linkProposta(p.proposta_token)).then(() => notify("Link copiado"));
  const verComoCliente = () => {
    if (!p.proposta_token) return;
    if (DEMO) navigate(`/proposta/${p.proposta_token}`); else window.open(linkProposta(p.proposta_token), "_blank", "noopener");
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Proposta comercial</span>
        {st ? <Badge value={st} /> : <span className="text-xs text-slate-500">ainda não enviada</span>}
        {st && <span className="text-xs text-slate-500">{STATUS_PROPOSTA[st]}</span>}
      </div>
      {st && (
        <ul className="mb-2 space-y-0.5 text-xs text-slate-600">
          {p.proposta_enviada_em && <li>Enviada em {quando(p.proposta_enviada_em)}{p.proposta_validade ? ` · válida até ${dataBR(p.proposta_validade)}` : ""}</li>}
          {p.proposta_visualizada_em && <li>Cliente abriu em {quando(p.proposta_visualizada_em)}</li>}
          {p.proposta_respondida_em && <li>{st === "aprovada" ? "Aprovada" : "Respondida"} por {p.proposta_resposta_nome ?? "cliente"} em {quando(p.proposta_respondida_em)}</li>}
          {st === "rejeitada" && <li className="font-semibold text-red-700">Motivo: {MOTIVOS[p.motivo_rejeicao ?? ""] ?? "—"}{p.motivo_rejeicao_texto ? ` · “${p.motivo_rejeicao_texto}”` : ""}{p.concorrente ? ` · concorrente: ${p.concorrente}` : ""}</li>}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {aberta && podeEditar && <Button type="button" variant="secondary" disabled={ocupado} onClick={() => setEmail(true)}><Mail size={15} /> {st ? "Reenviar por e-mail" : "Enviar por e-mail"}</Button>}
        {aberta && podeEditar && <Button type="button" variant="secondary" disabled={ocupado} onClick={pelaWhats}><MessageCircle size={15} /> Link no WhatsApp</Button>}
        {st && <Button type="button" variant="ghost" onClick={copiar}><Copy size={15} /> Copiar link</Button>}
        {st && <Button type="button" variant="ghost" onClick={verComoCliente}><ExternalLink size={15} /> Ver como o cliente</Button>}
        {aberta && podeEditar && st !== "rejeitada" && p.id && <Button type="button" variant="ghost" className="!text-red-600" onClick={() => setRecusa(true)}><ThumbsDown size={15} /> Cliente recusou</Button>}
      </div>
      {email && <EmailModal pedido={p} cliente={cliente} gravar={gravar} pdfBase64={pdfBase64} onClose={(ok) => { setEmail(false); if (ok) onAlterado(); }} />}
      {recusa && p.id && <RecusaModal pedidoId={p.id} onClose={(ok) => { setRecusa(false); if (ok) onAlterado(); }} />}
    </div>
  );
}

function EmailModal({ pedido, cliente, gravar, pdfBase64, onClose }: { pedido: Partial<Pedido>; cliente?: Cliente; gravar: () => Promise<string>; pdfBase64: () => Promise<string | null>; onClose: (ok: boolean) => void }) {
  const [para, setPara] = useState(cliente?.email ?? "");
  const [mensagem, setMensagem] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function enviar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      const id = await gravar();
      const r = await callFunction("proposta-enviar", { pedido_id: id, para, mensagem: mensagem || undefined, pdf_base64: await pdfBase64() });
      notify(`Proposta enviada para ${r.para}`);
      onClose(true);
    } catch (err) { notifyError(err); } finally { setOcupado(false); }
  }
  return (
    <Modal open onClose={() => onClose(false)} title={`Enviar proposta${pedido.numero ? ` nº ${pedido.numero}` : ""} por e-mail`}>
      <form onSubmit={enviar} className="space-y-3">
        <Field label="Para"><input className="input" type="email" value={para} onChange={(e) => setPara(e.target.value)} required /></Field>
        <Field label="Mensagem (opcional)"><textarea className="input" rows={4} value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Ex.: Conforme conversamos, segue a proposta com a instalação inclusa." /></Field>
        <p className="text-xs text-slate-500">O cliente recebe o PDF e um botão para ver a proposta e aprovar com um clique. Quando ele abrir ou responder, aparece um aviso na sua tela.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onClose(false)}>Cancelar</Button>
          <Button disabled={ocupado}>{ocupado ? "Enviando…" : "Enviar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function RecusaModal({ pedidoId, onClose }: { pedidoId: string; onClose: (ok: boolean) => void }) {
  const [motivo, setMotivo] = useState("preco");
  const [texto, setTexto] = useState("");
  const [concorrente, setConcorrente] = useState("");
  async function salvar(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("pedidos").update({
      proposta_status: "rejeitada", proposta_respondida_em: new Date().toISOString(), motivo_rejeicao: motivo,
      motivo_rejeicao_texto: texto || null, concorrente: concorrente || null,
    }).eq("id", pedidoId);
    if (error) return notifyError(error);
    notify("Recusa registrada: entra na análise de propostas em Relatórios");
    onClose(true);
  }
  return (
    <Modal open onClose={() => onClose(false)} title="Registrar proposta recusada">
      <form onSubmit={salvar} className="space-y-3">
        <Field label="Motivo">
          <select className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            {Object.entries(MOTIVOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        {motivo === "concorrente" && <Field label="Qual concorrente?"><input className="input" value={concorrente} onChange={(e) => setConcorrente(e.target.value)} /></Field>}
        <Field label="O que o cliente disse (opcional)"><textarea className="input" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onClose(false)}>Cancelar</Button>
          <Button>Registrar</Button>
        </div>
      </form>
    </Modal>
  );
}
