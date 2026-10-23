import type { ReactNode } from "react";
import { Mail, MessageCircle, Phone } from "lucide-react";
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
        <a href={`mailto:${r.email}`} title={r.email} className="flex min-w-0 max-w-60 items-center gap-1 text-xs text-slate-500 hover:underline"><Mail size={12} className="shrink-0" /> <span className="truncate">{r.email}</span></a>
      )}
    </div>
  );
}

const so = (v?: string | null) => (v ?? "").replace(/\D/g, "");

/** Botões grandes de contato para o celular: WhatsApp, ligar e e-mail, já prontos para tocar. */
export function ContatoBotoes({ r, mensagem }: { r: { whatsapp?: string | null; telefone?: string | null; email?: string | null }; mensagem: string }) {
  const tel = so(r.telefone) && so(r.telefone) !== so(r.whatsapp) ? r.telefone : null;
  if (!r.whatsapp && !tel && !r.email) return <p className="text-xs text-slate-400">sem contato cadastrado</p>;
  const pilula = "inline-flex min-h-[36px] min-w-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition active:scale-[.98]";
  const parar = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <div className="flex flex-wrap gap-1.5">
      {r.whatsapp && (
        <a href={whatsappLink(r.whatsapp, mensagem)} target="_blank" rel="noreferrer" onClick={parar} title={`WhatsApp ${formatarTelefone(r.whatsapp)}`}
          className={`${pilula} bg-emerald-600 text-white hover:bg-emerald-700`}>
          <MessageCircle size={15} aria-hidden /> {formatarTelefone(r.whatsapp)}
        </a>
      )}
      {(tel || r.whatsapp) && (
        <a href={`tel:+55${so(tel || r.whatsapp)}`} onClick={parar} title={`Ligar ${formatarTelefone(tel || r.whatsapp)}`}
          className={`${pilula} border border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100`}>
          <Phone size={15} aria-hidden /> {tel ? formatarTelefone(tel) : "Ligar"}
        </a>
      )}
      {r.email && (
        <a href={`mailto:${r.email}`} onClick={parar} title={r.email}
          className={`${pilula} max-w-full border border-slate-300 bg-surface text-slate-700 hover:bg-slate-50`}>
          <Mail size={15} className="shrink-0" aria-hidden /> <span className="truncate">{r.email}</span>
        </a>
      )}
    </div>
  );
}

const CORES_INICIAIS = ["bg-violet-600", "bg-sky-600", "bg-emerald-600", "bg-amber-600", "bg-rose-600", "bg-teal-600", "bg-indigo-600", "bg-orange-600"];

/** Quadradinho com as iniciais do nome, sempre na mesma cor para o mesmo cadastro. */
export function Iniciais({ nome, tamanho = 40 }: { nome: string; tamanho?: number }) {
  const ini = nome.split(/\s+/).filter((p) => /[A-Za-zÀ-ú0-9]/.test(p)).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-xl text-sm font-extrabold text-white ${CORES_INICIAIS[h % CORES_INICIAIS.length]}`}
      style={{ width: tamanho, height: tamanho }}>{ini}</span>
  );
}

/** Cartão de cadastro do celular: iniciais (ou logo), nome em destaque, linha de apoio, selos e os botões de contato. */
export function CartaoCadastro({ avatar, titulo, subtitulo, meta, selos, contato, onAbrir }: {
  avatar: ReactNode; titulo: ReactNode; subtitulo?: ReactNode; meta?: ReactNode; selos?: ReactNode; contato: ReactNode; onAbrir: () => void;
}) {
  return (
    <div className="space-y-2.5">
      <button type="button" onClick={onAbrir} className="flex w-full items-start gap-3 pr-8 text-left">
        {avatar}
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold leading-snug text-fg">{titulo}</span>
          {subtitulo && <span className="block truncate text-xs text-slate-500">{subtitulo}</span>}
          {meta && <span className="mt-0.5 block text-xs text-slate-500">{meta}</span>}
        </span>
      </button>
      {selos && <div className="flex flex-wrap gap-1">{selos}</div>}
      {contato}
    </div>
  );
}

/** Na lista do computador: iniciais à esquerda e o conteúdo da coluna do nome ao lado. */
export function ComAvatar({ nome, children }: { nome: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Iniciais nome={nome} tamanho={34} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
