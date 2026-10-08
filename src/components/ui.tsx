import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { ChevronRight, X, type LucideIcon } from "lucide-react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-fg shadow-sm hover:bg-brand-dark",
  secondary: "border border-slate-300 bg-surface text-slate-700 shadow-sm hover:bg-slate-50",
  danger: "bg-red-500 text-white shadow-sm hover:opacity-90",
  ghost: "text-slate-600 hover:bg-slate-100",
};

export function Button({
  variant = "primary", className = "", ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold sm:min-h-0
        transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200/80 bg-surface shadow-card ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

/** Seção com título dentro de um card. */
export function Section({ title, actions, children, className = "" }: { title: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={`p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-fg">{title}</h2>
        {actions}
      </div>
      {children}
    </Card>
  );
}

type Tom = "neutro" | "bom" | "atencao" | "critico" | "info";
const tons: Record<Tom, { icone: string; valor: string }> = {
  neutro: { icone: "bg-slate-100 text-slate-600", valor: "text-fg" },
  info: { icone: "bg-brand-light text-brand", valor: "text-fg" },
  bom: { icone: "bg-emerald-50 text-emerald-700", valor: "text-fg" },
  atencao: { icone: "bg-amber-50 text-amber-700", valor: "text-amber-700" },
  critico: { icone: "bg-red-50 text-red-600", valor: "text-red-600" },
};

/** Indicador (número de destaque) com ícone e linha de apoio. */
export function Stat({ label, valor, sub, icon: Icon, tom = "neutro", onClick }: {
  label: string; valor: ReactNode; sub?: ReactNode; icon?: LucideIcon; tom?: Tom; onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl border border-slate-200/80 bg-surface p-4 text-left shadow-card
        ${onClick ? "transition hover:border-brand/40 hover:shadow-pop" : ""}`}>
      {Icon && <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tons[tom].icone}`}><Icon size={18} /></span>}
      <span className="min-w-0">
        <span className="block text-xs font-medium text-slate-500">{label}</span>
        <span className={`num mt-0.5 block text-xl font-bold tracking-tight ${tons[tom].valor}`}>{valor}</span>
        {sub && <span className="mt-0.5 block text-xs text-slate-500">{sub}</span>}
      </span>
    </Tag>
  );
}

const badgeColors: Record<string, string> = {
  orcamento: "bg-slate-100 text-slate-700",
  aprovado: "bg-blue-50 text-blue-700",
  faturado: "bg-indigo-50 text-indigo-700",
  entregue: "bg-emerald-50 text-emerald-700",
  cancelado: "bg-red-50 text-red-700",
  cancelada: "bg-red-50 text-red-700",
  aberto: "bg-amber-50 text-amber-800",
  pago: "bg-emerald-50 text-emerald-700",
  vencido: "bg-red-50 text-red-700",
  aberta: "bg-amber-50 text-amber-800",
  em_diagnostico: "bg-sky-50 text-sky-700",
  aguardando_aprovacao: "bg-purple-50 text-purple-700",
  aguardando_peca: "bg-orange-50 text-orange-700",
  em_reparo: "bg-blue-50 text-blue-700",
  concluida: "bg-emerald-50 text-emerald-700",
  processando: "bg-sky-50 text-sky-700",
  autorizada: "bg-emerald-50 text-emerald-700",
  erro: "bg-red-50 text-red-700",
  enviado: "bg-emerald-50 text-emerald-700",
  em_transito: "bg-sky-50 text-sky-700",
  recebida: "bg-emerald-50 text-emerald-700",
  rascunho: "bg-slate-100 text-slate-700",
  enviando: "bg-sky-50 text-sky-700",
  pendente: "bg-slate-100 text-slate-700",
  aguardando_xml: "bg-sky-50 text-sky-700",
  aguardando_vinculo: "bg-amber-50 text-amber-800",
  revisao: "bg-purple-50 text-purple-700",
  concluido: "bg-emerald-50 text-emerald-700",
  ignorada: "bg-slate-100 text-slate-500",
  ativo: "bg-emerald-50 text-emerald-700",
  inativo: "bg-slate-100 text-slate-500",
  em_garantia: "bg-emerald-50 text-emerald-700",
  vence_logo: "bg-amber-50 text-amber-800",
  fora_garantia: "bg-slate-100 text-slate-600",
  planejada: "bg-sky-50 text-sky-700",
  em_producao: "bg-amber-50 text-amber-800",
  pc_cotacao: "bg-purple-50 text-purple-700",
  pc_enviado: "bg-sky-50 text-sky-700",
  pc_parcial: "bg-amber-50 text-amber-800",
  pc_recebido: "bg-emerald-50 text-emerald-700",
  pc_cancelado: "bg-red-50 text-red-700",
  escolhida: "bg-emerald-50 text-emerald-700",
  contingencia: "bg-amber-50 text-amber-800",
  denegada: "bg-red-50 text-red-700",
  enviada: "bg-sky-50 text-sky-700",
  visualizada: "bg-purple-50 text-purple-700",
  aprovada: "bg-emerald-50 text-emerald-700",
  rejeitada: "bg-red-50 text-red-700",
  expirada: "bg-slate-100 text-slate-600",
  conciliado: "bg-emerald-50 text-emerald-700",
  ignorado: "bg-slate-100 text-slate-500",
  transferencia: "bg-sky-50 text-sky-700",
  indicio: "bg-amber-50 text-amber-800",
  confirmado: "bg-red-50 text-red-700",
  resolvido: "bg-emerald-50 text-emerald-700",
  descartado: "bg-slate-100 text-slate-500",
};

const badgeLabel: Record<string, string> = {
  em_transito: "em trânsito",
  orcamento: "orçamento", em_diagnostico: "em diagnóstico", aguardando_aprovacao: "aguardando aprovação",
  aguardando_peca: "aguardando peça", concluida: "concluída", aguardando_xml: "aguardando XML",
  aguardando_vinculo: "aguardando vínculo", revisao: "revisão", concluido: "concluído",
  em_garantia: "em garantia", vence_logo: "garantia vence em breve", fora_garantia: "fora da garantia",
  em_producao: "em produção", pc_cotacao: "em cotação", pc_enviado: "pedido enviado", pc_parcial: "recebido em parte",
  pc_recebido: "recebido", pc_cancelado: "cancelado", contingencia: "em contingência (fila)",
  transferencia: "transferência", indicio: "indício",
};

export function Badge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeColors[value] ?? "bg-slate-100 text-slate-700"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {badgeLabel[value] ?? value.replace(/_/g, " ")}
    </span>
  );
}

const pilhaModais: symbol[] = [];

export function Modal({
  open, onClose, title, children, wide,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const id = Symbol();
    pilhaModais.push(id);
    // Esc fecha só a janela de cima (ex.: o PDF aberto por cima da ficha)
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && pilhaModais[pilhaModais.length - 1] === id && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      pilhaModais.splice(pilhaModais.indexOf(id), 1);
    };
  }, [open, onClose]);

  if (!open) return null;
  // Portal: a janela fica fora do formulário que a abriu (formulário dentro de formulário recarregava a página),
  // e o "enviar" de dentro dela não chega ao formulário de trás.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/50 p-2 backdrop-blur-[2px] sm:p-6"
      onSubmit={(e) => e.stopPropagation()}>
      <div className={`w-full ${wide ? "max-w-5xl" : "max-w-2xl"} rounded-2xl bg-surface shadow-pop`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-fg">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Tabela que vira lista de cartões no celular: cada célula ganha o nome da coluna
 * (data-label) e o CSS (.tabela em index.css) empilha "rótulo: valor".
 * A coluna sem título é a das ações (botões ocupam a linha toda no celular).
 */
export function Table({ head, children, empty }: { head: ReactNode; children: ReactNode; empty?: boolean }) {
  const ref = useRef<HTMLTableElement>(null);
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    const rotular = () => {
      const titulos = Array.from(t.querySelectorAll("thead th")).map((th) => th.textContent?.trim() ?? "");
      t.querySelectorAll("tbody > tr").forEach((tr) =>
        Array.from(tr.children).forEach((td, i) => {
          const l = titulos[i] ?? "";
          if (td.getAttribute("data-label") !== l) td.setAttribute("data-label", l);
        }));
    };
    rotular();
    const obs = new MutationObserver(rotular);
    obs.observe(t, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);
  return (
    <Card className="overflow-x-auto">
      <table ref={ref} className="tabela w-full divide-y divide-slate-100 md:min-w-[720px]">
        <thead className="bg-slate-50/80"><tr>{head}</tr></thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty && <p className="p-8 text-center text-sm text-slate-500">Nenhum registro encontrado.</p>}
    </Card>
  );
}

/** Última célula das linhas que abrem ao tocar: deixa claro que dá para ver/editar. */
export function CelulaAbrir({ texto = "Abrir" }: { texto?: string }) {
  return (
    <td className="td whitespace-nowrap text-right">
      <span className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-sm font-semibold text-brand">{texto} <ChevronRight size={16} /></span>
    </td>
  );
}

export function Tabs<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="mb-4 inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-surface p-1 shadow-card">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
            value === o.value ? "bg-brand text-brand-fg shadow-sm" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
