// Pedido: enviar o código de rastreio ao cliente (como no Tiny), por WhatsApp (mensagem pronta) e por e-mail.
// Sem código ainda: digita aqui e salva; ao salvar, o e-mail "Seu pedido foi enviado" já sai sozinho.
import { useState } from "react";
import { Copy, ExternalLink, Mail, MessageCircle } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useInvalidate, useRows } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { whatsappLink } from "@/lib/format";
import { mensagemRastreio } from "@/lib/rastreio";
import { linkRastreio } from "@/lib/transportadoras";
import type { Cliente, Transportadora } from "@/lib/types";

type PedidoRastreio = { id: string; numero: number; codigo_rastreio?: string | null; transportadora_id?: string | null };

export function EnviarRastreio({ pedido, cliente, onClose, onSalvo }: { pedido: PedidoRastreio; cliente?: Cliente | null; onClose: () => void; onSalvo?: (codigo: string) => void }) {
  const invalidate = useInvalidate();
  const { data: transportadoras = [] } = useRows<Transportadora>("transportadoras", { order: "nome", ascending: true });
  const t = transportadoras.find((x) => x.id === pedido.transportadora_id);
  const [codigo, setCodigo] = useState(pedido.codigo_rastreio?.trim() ?? "");
  const [salvo, setSalvo] = useState(pedido.codigo_rastreio?.trim() ?? "");
  const [ocupado, setOcupado] = useState(false);
  const link = salvo ? linkRastreio(t?.rastreio_url, { codigo: salvo }) : null;
  const nomeT = t ? (t.nome_fantasia?.trim() || t.nome) : null;
  const msg = salvo ? mensagemRastreio({ cliente: cliente?.nome_fantasia || cliente?.nome, pedido: pedido.numero, transportadora: nomeT, codigo: salvo, link }) : "";
  const zap = cliente?.whatsapp || cliente?.telefone;

  async function salvar() {
    const c = codigo.trim();
    if (!c) return notify("Digite o código de rastreio", "erro");
    setOcupado(true);
    const { error } = await supabase.from("pedidos").update({ codigo_rastreio: c }).eq("id", pedido.id);
    setOcupado(false);
    if (error) return notifyError(error);
    setSalvo(c); onSalvo?.(c);
    invalidate("pedidos");
    notify(cliente?.email ? "Código salvo: o e-mail com o rastreio vai para o cliente" : "Código salvo (cliente sem e-mail: mande pelo WhatsApp)");
  }
  async function reenviarEmail() {
    setOcupado(true);
    const { data, error } = await supabase.rpc("reenviar_rastreio", { p_pedido: pedido.id });
    setOcupado(false);
    if (error) return notifyError(error);
    notify(data === "enviado" ? "E-mail do rastreio na fila para o cliente" : data === "sem_codigo" ? "Falta o código de rastreio"
      : "Não saiu: cliente sem e-mail, sem aceite de avisos ou avisos por e-mail desligados", data === "enviado" ? undefined : "erro");
  }

  return (
    <Modal open onClose={onClose} title={`Rastreio · pedido #${pedido.numero}`}>
      <div className="space-y-3">
        <Field label={`Código de rastreio${nomeT ? ` (${nomeT})` : ""}`}>
          <div className="flex gap-2">
            <input className="input min-w-0 flex-1" value={codigo} maxLength={80} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex.: AA123456789BR" />
            {codigo.trim() !== salvo && <Button type="button" onClick={salvar} disabled={ocupado}>Salvar</Button>}
          </div>
        </Field>
        {salvo ? (
          <>
            <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-fg ring-1 ring-slate-200">{msg}</pre>
            <div className="flex flex-wrap gap-2">
              {zap ? <a href={whatsappLink(zap, msg)} target="_blank" rel="noreferrer"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-solido-verde px-3 text-sm font-bold text-white"><MessageCircle size={16} aria-hidden /> WhatsApp</a>
                : <span className="text-xs text-slate-500">Cliente sem WhatsApp no cadastro.</span>}
              <Button type="button" variant="secondary" onClick={reenviarEmail} disabled={ocupado || !cliente?.email}
                title={cliente?.email ? `Manda de novo para ${cliente.email}` : "Cliente sem e-mail no cadastro"}><Mail size={16} /> E-mail</Button>
              <Button type="button" variant="ghost" onClick={() => navigator.clipboard.writeText(msg).then(() => notify("Mensagem copiada"), () => notify("Não deu para copiar", "erro"))}><Copy size={16} /> Copiar</Button>
              {link && <a href={link} target="_blank" rel="noreferrer" className="inline-flex min-h-[40px] items-center gap-1.5 px-2 text-sm font-semibold text-brand hover:underline"><ExternalLink size={15} aria-hidden /> Ver rastreio</a>}
            </div>
          </>
        ) : <p className="text-sm text-slate-600">Digite o código e salve: o cliente com e-mail recebe "Seu pedido foi enviado" sozinho.</p>}
      </div>
    </Modal>
  );
}
