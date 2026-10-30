// Atalhos na linha da lista de clientes: enviar a ficha cadastral para assinar (WhatsApp com o link pronto) e ver a
// página do cliente como ele vê. Mensagem só sai quando a pessoa toca em Enviar no WhatsApp.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Loader2, Send } from "lucide-react";
import { DEMO, supabase } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { useConfig } from "@/lib/useConfig";
import { notify, notifyError } from "@/lib/notify";
import { whatsappLink } from "@/lib/format";
import { linkFicha, mensagemFicha } from "@/lib/fichaCadastral";
import { pedirTexto } from "@/components/Dialogos";
import type { Cliente } from "@/lib/types";

const ICONE = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50";

export function AcoesClienteLista({ c, ficha, soFicha }: { c: Cliente; ficha?: string;
  /** só o botão da ficha (na Ficha 360 o "Ver como o cliente vê" já está ao lado) */
  soFicha?: boolean }) {
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
        <button type="button" className={ICONE} onClick={enviarFicha} disabled={ocupado}
          aria-label="Enviar a ficha cadastral para assinar"
          title={c.whatsapp ? "Enviar a ficha cadastral para assinar (abre o WhatsApp com o link)" : "Copiar o link da ficha cadastral para assinar"}>
          {ocupado ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} className="text-emerald-600" />}
        </button>
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
