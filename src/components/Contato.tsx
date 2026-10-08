import { Mail, MessageCircle } from "lucide-react";
import { whatsappLink } from "@/lib/format";
import { formatarTelefone } from "@/lib/mascaras";

/** Nome fantasia em destaque, razão social e código embaixo. */
export function NomeCadastro({ r }: { r: { nome: string; nome_fantasia?: string | null; codigo?: number | null } }) {
  const fantasia = r.nome_fantasia && r.nome_fantasia.trim().toLowerCase() !== r.nome.trim().toLowerCase() ? r.nome_fantasia : null;
  return (
    <div className="min-w-0">
      <div className="font-semibold text-fg">{fantasia ?? r.nome}</div>
      {fantasia && <div className="text-xs text-slate-500">{r.nome}</div>}
    </div>
  );
}

/** WhatsApp pronto para clicar (abre a conversa) e telefone/e-mail formatados. */
export function Contato({ r, mensagem }: { r: { whatsapp?: string | null; telefone?: string | null; email?: string | null }; mensagem: string }) {
  if (!r.whatsapp && !r.telefone && !r.email) return <>—</>;
  return (
    <div className="space-y-0.5 text-sm">
      {r.whatsapp && (
        <a href={whatsappLink(r.whatsapp, mensagem)} target="_blank" rel="noreferrer" title="Chamar no WhatsApp"
          className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-emerald-700 hover:underline">
          <MessageCircle size={14} /> {formatarTelefone(r.whatsapp)}
        </a>
      )}
      {r.telefone && r.telefone !== r.whatsapp && <div className="whitespace-nowrap text-slate-600">{formatarTelefone(r.telefone)}</div>}
      {r.email && (
        <a href={`mailto:${r.email}`} className="flex items-center gap-1 text-xs text-slate-500 hover:underline"><Mail size={12} /> {r.email}</a>
      )}
    </div>
  );
}
