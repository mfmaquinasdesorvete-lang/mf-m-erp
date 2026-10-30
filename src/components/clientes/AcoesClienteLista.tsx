// Atalhos na linha da lista de clientes: enviar a ficha cadastral para assinar (WhatsApp com o link pronto) e ver a
// página do cliente como ele vê. Mensagem só sai quando a pessoa toca em Enviar no WhatsApp.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, Clock, Eye, FileX, Send } from "lucide-react";
import { Button } from "@/components/ui";
import { DEMO, supabase } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { useConfig } from "@/lib/useConfig";
import { notify, notifyError } from "@/lib/notify";
import { whatsappLink } from "@/lib/format";
import { linkFicha, mensagemFicha } from "@/lib/fichaCadastral";
import { pedirTexto } from "@/components/Dialogos";
import type { Cliente } from "@/lib/types";

const ICONE = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50";

export function AcoesClienteLista({ c, ficha, soFicha, comTexto }: { c: Cliente; ficha?: string;
  /** só o botão da ficha (na Ficha 360 o "Ver como o cliente vê" já está ao lado) */
  soFicha?: boolean;
  /** botão com o nome escrito ("Enviar ficha"), como os outros do alto da Ficha 360 */
  comTexto?: boolean }) {
  const [ocupado, setOcupado] = useState(false);
  const { data: cfg } = useConfig();
  const invalidar = useInvalidate();
  const navigate = useNavigate();
  const portal = c.portal_link || c.portal_token;

  async function enviarFicha() {
    // abre a janela já (o celular bloqueia janela aberta depois de esperar a resposta)
    const janela = c.whatsapp ? window.open("", "_blank") : null;
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc("ficha_cadastral_link", { p_cliente: c.id });
      if (error) throw error;
      invalidar("clientes_assinaturas");
      const link = linkFicha((data as { token: string }).token);
      const empresa = cfg?.nome_fantasia || cfg?.razao_social || "MF Máquinas";
      if (janela) { janela.location.href = whatsappLink(c.whatsapp ?? "", mensagemFicha(String(c.nome_fantasia || c.nome || ""), empresa, link)); return; }
      try { await navigator.clipboard.writeText(link); notify("Sem WhatsApp no cadastro: link da ficha copiado"); } catch { await pedirTexto("Copie o link da ficha:", link); }
    } catch (e) { janela?.close(); notifyError(e); } finally { setOcupado(false); }
  }

  return (
    <span className="inline-flex items-center gap-1">
      {ficha !== "assinado" && (
        <Button type="button" variant="secondary" tamanho={comTexto ? undefined : "mini"} onClick={enviarFicha} carregando={ocupado}
          aria-label="Enviar a ficha cadastral para assinar"
          title={c.whatsapp ? "Enviar a ficha cadastral para assinar (abre o WhatsApp com o link)" : "Copiar o link da ficha cadastral para assinar"}>
          {!ocupado && <Send size={15} className="text-emerald-600" />}{comTexto && " Enviar ficha"}
        </Button>
      )}
      {portal && !soFicha && (
        <a href={`/cliente/${portal}`} target="_blank" rel="noreferrer" className={ICONE}
          aria-label="Ver como o cliente vê" title="Ver como o cliente vê (a página dele, sem login)"
          onClick={(e) => { if (DEMO) { e.preventDefault(); navigate(`/cliente/${portal}`); } }}>
          <Eye size={15} />
        </a>
      )}
    </span>
  );
}

/** Situação da ficha cadastral do cliente: assinada, aguardando a assinatura ou não assinada. */
export function SeloAssinatura({ f }: { f?: string }) {
  if (f === "assinado") return <span title="Ficha cadastral assinada" className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-1.5 py-0.5 text-2xs font-semibold text-emerald-800"><BadgeCheck size={12} aria-hidden /> assinada</span>;
  if (f === "pendente") return <span title="Link da ficha enviado, aguardando a assinatura" className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sky-100 px-1.5 py-0.5 text-2xs font-semibold text-sky-800"><Clock size={12} aria-hidden /> aguardando assinatura</span>;
  return <span title="Ficha cadastral ainda não assinada" className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-slate-100 px-1.5 py-0.5 text-2xs font-semibold text-slate-600"><FileX size={12} aria-hidden /> não assinada</span>;
}
