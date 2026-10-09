// Cartão do pedido no fluxo: quem, quanto, há quanto tempo está na etapa, o próximo passo e o botão que faz esse passo.
import type { ReactNode } from "react";
import {
  AlertTriangle, CheckCircle2, ClipboardCheck, Clock, FileText, FileWarning, Loader2, MessageCircle, Package, PackageCheck, Printer, Send, Truck, User,
  type LucideIcon,
} from "lucide-react";
import { brl, whatsappLink } from "@/lib/format";
import { EtiquetaUnidade } from "@/lib/unidade";
import { CANAIS } from "@/lib/margem";
import { linkProposta } from "@/lib/propostas";
import type { Acao, PedidoFluxo, Situacao, TomNota } from "@/lib/fluxo";

const BOTAO: Record<Exclude<Acao, "cobrar_whatsapp">, { rotulo: string; icon: LucideIcon; secundario?: boolean }> = {
  enviar_proposta: { rotulo: "Enviar proposta", icon: Send },
  abrir_pedido: { rotulo: "Abrir pedido", icon: FileText, secundario: true },
  corrigir_nfe: { rotulo: "Ver o erro e corrigir", icon: FileWarning },
  emitir_nfe: { rotulo: "Emitir NF-e", icon: FileText },
  comecar_separar: { rotulo: "Começar a separar", icon: PackageCheck },
  conferir: { rotulo: "Conferir itens", icon: ClipboardCheck },
  embalar: { rotulo: "Embalar", icon: Package },
  despachar: { rotulo: "Despachar", icon: Send },
  informar_rastreio: { rotulo: "Informar rastreio", icon: Truck },
  marcar_entregue: { rotulo: "Marcar entregue", icon: CheckCircle2 },
};

const TOM_NOTA: Record<TomNota, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  info: "bg-sky-50 text-sky-700",
  atencao: "bg-amber-50 text-amber-800",
  erro: "bg-red-50 text-red-700",
};

/** Mensagem para cobrar a resposta da proposta (com o link, se já foi enviada). */
export function mensagemCobranca(p: PedidoFluxo) {
  const nome = p.cliente?.nome?.split(" ")[0] ?? "";
  return `Olá${nome ? ` ${nome}` : ""}! Tudo bem? Conseguiu ver a nossa proposta nº ${p.numero}? Fico à disposição para tirar qualquer dúvida.` +
    (p.proposta_token && p.proposta_status ? `\n${linkProposta(p.proposta_token)}` : "");
}

const Etiqueta = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <span className={`inline-flex max-w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${className}`}>{children}</span>
);

export function Cartao({ p, s, vendedor, ocupado, podeAgir, onAbrir, onAcao, onEtiquetas }: {
  p: PedidoFluxo; s: Situacao; vendedor?: string | null; ocupado: boolean;
  /** a pessoa pode fazer a ação do cartão (ex.: emitir NF-e) */
  podeAgir: boolean;
  onAbrir: () => void; onAcao: (a: Acao) => void; onEtiquetas?: () => void;
}) {
  const tomTempo = s.nivel === 2 ? "text-red-600" : s.nivel === 1 ? "text-amber-700" : "text-slate-500";
  const borda = s.nivel === 2 ? "border-red-200" : s.nivel === 1 ? "border-amber-200" : "border-slate-200";
  const parar = (ev: { stopPropagation: () => void }) => ev.stopPropagation();

  let botao: ReactNode = null;
  if (s.acao === "cobrar_whatsapp" && p.cliente?.whatsapp) {
    botao = (
      <a href={whatsappLink(p.cliente.whatsapp, mensagemCobranca(p))} target="_blank" rel="noreferrer" onClick={parar}
        className={`inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition sm:min-h-0 ${
          s.alerta ? "bg-emerald-600 text-white hover:opacity-90" : "border border-emerald-600 text-emerald-700 hover:bg-emerald-50"}`}>
        <MessageCircle size={15} /> {s.alerta ? "Cobrar resposta no WhatsApp" : "Falar no WhatsApp"}
      </a>
    );
  } else if (s.acao && s.acao !== "cobrar_whatsapp" && podeAgir) {
    const b = BOTAO[s.acao];
    const Icone = ocupado ? Loader2 : b.icon;
    botao = (
      <button type="button" disabled={ocupado} onClick={(ev) => { parar(ev); onAcao(s.acao!); }}
        className={`inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 sm:min-h-0 ${
          b.secundario ? "border border-slate-300 bg-surface text-slate-700 hover:bg-slate-50" : "bg-brand text-brand-fg shadow-sm hover:bg-brand-dark"}`}>
        <Icone size={15} className={ocupado ? "animate-spin" : ""} /> {b.rotulo}
      </button>
    );
  }

  return (
    <article role="button" tabIndex={0} onClick={onAbrir} onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && ev.target === ev.currentTarget && (ev.preventDefault(), onAbrir())}
      aria-label={`Pedido ${p.numero}, ${p.cliente?.nome ?? ""}. ${s.motivo ? `${s.motivo}. ` : ""}Próximo passo: ${s.passo}`}
      className={`relative w-full cursor-pointer overflow-hidden rounded-xl border bg-surface p-2.5 text-left shadow-card transition hover:border-brand sm:p-3 lg:p-2.5 ${borda}`}>
      {s.nivel > 0 && <span className={`absolute inset-y-0 left-0 w-1 ${s.nivel === 2 ? "bg-red-500" : "bg-amber-500"}`} aria-hidden />}

      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <span className="whitespace-nowrap text-sm font-bold text-fg">#{p.numero}<EtiquetaUnidade id={p.unidade_id} /></span>
        <span className="num whitespace-nowrap text-sm font-bold text-fg lg:text-[13px]">{brl(p.valor_total)}</span>
      </div>
      <div className="truncate text-sm text-slate-600" title={p.cliente?.nome}>{p.cliente?.nome ?? "—"}</div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <Etiqueta className="bg-slate-100 text-slate-600">{CANAIS[p.origem] ?? p.origem}</Etiqueta>
        {s.nota && <Etiqueta className={TOM_NOTA[s.nota.tom]}><FileText size={11} className="shrink-0" />{s.nota.rotulo}</Etiqueta>}
        {vendedor && <Etiqueta className="bg-slate-100 text-slate-500"><User size={11} className="shrink-0" />{vendedor}</Etiqueta>}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${tomTempo}`} title={`Nesta etapa desde ${new Date(s.desde).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`}>
          <Clock size={12} className="shrink-0" /> {s.tempo}
        </span>
        {s.motivo && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${s.nivel === 2 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
            <AlertTriangle size={11} className="shrink-0" /> {s.motivo}
          </span>
        )}
      </div>

      <div className="mt-2 border-t border-slate-100 pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{s.acao ? "Próximo passo" : "Situação"}</p>
        <p className="text-[13px] font-medium leading-snug text-fg">{s.passo}</p>
        {s.detalhe && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500" title={s.detalhe}>{s.detalhe}</p>}
        {(botao || onEtiquetas) && (
          <div className="mt-2 flex items-center gap-1.5">
            {botao ?? <span className="flex-1" />}
            {onEtiquetas && (
              <button type="button" aria-label={`Imprimir etiquetas do pedido ${p.numero}`} title="Imprimir etiquetas (um clique)"
                onClick={(ev) => { parar(ev); onEtiquetas(); }}
                className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-lg border border-slate-300 text-slate-600 hover:border-brand hover:text-brand sm:h-9 sm:w-9">
                <Printer size={15} />
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
