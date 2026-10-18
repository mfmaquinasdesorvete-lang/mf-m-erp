import { createPortal } from "react-dom";
import { cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, MoreHorizontal, X, type LucideIcon } from "lucide-react";
import { achatar, celulasDa, ordenarLinhas, sentidoNatural, temInterativo, textoDoNo, valorDaCelula } from "@/lib/ordenarColunas";
import { useModulo } from "@/lib/modulo";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-fg shadow-sm hover:bg-brand-dark",
  secondary: "border border-slate-300 bg-surface text-slate-700 shadow-sm hover:bg-slate-50",
  danger: "bg-solido-vermelho text-white shadow-sm hover:opacity-90",
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
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200/80 bg-surface shadow-card ${className}`}>{children}</div>;
}

/** compacto: uma linha só (ícone menor, sem a explicação embaixo — ela fica no título ao passar o mouse) e as ações ao lado. */
export function PageHeader({ title, subtitle, actions, compacto }: { title: string; subtitle?: string; actions?: ReactNode; compacto?: boolean }) {
  const modulo = useModulo();
  const Icone = modulo?.icone;
  if (compacto) {
    return (
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2" title={subtitle}>
          {Icone && (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-modulo to-modulo-escuro text-white" aria-hidden>
              <Icone size={17} />
            </span>
          )}
          <h1 className="text-lg font-bold leading-tight tracking-tight text-fg">{title}</h1>
          {subtitle && <span className="sr-only">{subtitle}</span>}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>
      </div>
    );
  }
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {Icone && (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-modulo to-modulo-escuro text-white shadow-card" aria-hidden>
            <Icone size={22} />
          </span>
        )}
        <div className="min-w-0">
          {modulo?.titulo && modulo.titulo !== title && <p className="text-[11px] font-bold uppercase tracking-wider text-modulo-texto">{modulo.titulo}</p>}
          <h1 className="text-xl font-bold leading-tight tracking-tight text-fg sm:text-2xl">{title}</h1>
          {/* no celular a explicação fica em 2 linhas (tocar mostra tudo): antes empurrava a tela 4 ou 5 linhas para baixo */}
          {subtitle && <p className="mt-0.5 line-clamp-2 text-sm text-slate-500 sm:line-clamp-none" title={subtitle}
            onClick={(e) => e.currentTarget.classList.toggle("line-clamp-2")}>{subtitle}</p>}
        </div>
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
        <h2 className="flex items-center gap-2 text-sm font-bold text-fg"><span className="h-4 w-1 rounded-full bg-modulo" aria-hidden />{title}</h2>
        {actions}
      </div>
      {children}
    </Card>
  );
}

/**
 * Cores dos cartões de indicador: fundo levemente tingido, faixa colorida à esquerda e ícone na mesma cor.
 * A cor diz o assunto (dinheiro, prazo, alerta…), para achar o número sem ler tudo.
 */
export type CorCartao = "neutro" | "azul" | "verde" | "ambar" | "vermelho" | "roxo" | "indigo" | "laranja";
const coresCartao: Record<CorCartao, { caixa: string; icone: string; valor: string }> = {
  neutro: { caixa: "border-slate-200 bg-surface before:bg-modulo", icone: "bg-modulo/15 text-modulo-texto", valor: "text-fg" },
  azul: { caixa: "border-sky-200 bg-sky-50 before:bg-sky-500", icone: "bg-sky-100 text-sky-700", valor: "text-fg" },
  verde: { caixa: "border-emerald-200 bg-emerald-50 before:bg-emerald-500", icone: "bg-emerald-100 text-emerald-700", valor: "text-emerald-700" },
  ambar: { caixa: "border-amber-200 bg-amber-50 before:bg-amber-500", icone: "bg-amber-100 text-amber-700", valor: "text-amber-700" },
  vermelho: { caixa: "border-red-200 bg-red-50 before:bg-red-500", icone: "bg-red-100 text-red-700", valor: "text-red-700" },
  roxo: { caixa: "border-purple-200 bg-purple-50 before:bg-purple-500", icone: "bg-purple-100 text-purple-700", valor: "text-fg" },
  indigo: { caixa: "border-indigo-200 bg-indigo-50 before:bg-indigo-500", icone: "bg-indigo-100 text-indigo-700", valor: "text-fg" },
  laranja: { caixa: "border-orange-200 bg-orange-50 before:bg-orange-500", icone: "bg-orange-100 text-orange-700", valor: "text-fg" },
};
const caixaCartao = "relative min-w-0 overflow-hidden rounded-xl border shadow-card before:absolute before:inset-y-0 before:left-0 before:w-1";

/**
 * Para o .valor-fit: a letra diminui conforme o tamanho do texto, para o valor caber inteiro no cartão; número curto
 * ("6", "12") fica no tamanho máximo. Texto que não é string/número usa o padrão do CSS.
 */
export const fitValor = (v: ReactNode): CSSProperties | undefined =>
  typeof v === "string" || typeof v === "number" ? ({ "--valor-cq": `${(150 / Math.max(4, String(v).length)).toFixed(1)}cqi` } as CSSProperties) : undefined;

/** Cartão de indicador compacto (fichas e janelas): rótulo, número em destaque e linha de apoio. */
export function Indicador({ rotulo, valor, sub, icon: Icon, cor = "neutro" }: {
  rotulo: string; valor: ReactNode; sub?: ReactNode; icon?: LucideIcon; cor?: CorCartao;
}) {
  const c = coresCartao[cor];
  return (
    // o ícone flutua no canto: o rótulo passa por baixo dele e usa a largura toda (no celular não fica espremido)
    <div className={`${caixaCartao} cartao-fit p-3 pl-4 ${c.caixa}`}>
      <div className="flow-root text-sm leading-tight">
        {Icon && <span className={`float-right mb-1 ml-2 grid h-7 w-7 place-items-center rounded-lg ${c.icone}`} aria-hidden><Icon size={15} /></span>}
        <span className="text-sm font-semibold leading-tight text-slate-700">{rotulo}</span>
      </div>
      <div className={`num valor-fit mt-0.5 font-bold [--valor-max:1.375rem] ${c.valor}`} style={fitValor(valor)}>{valor}</div>
      {sub && <div className="text-[13px] leading-snug text-slate-600">{sub}</div>}
    </div>
  );
}

/** Cores dos botões em ícone (as mesmas dos atalhos da tela inicial; mudam com o tema). */
export const COR_ATALHO = {
  verde: "var(--kpi-verde)", azul: "var(--kpi-azul)", ciano: "var(--kpi-ciano)", laranja: "var(--kpi-laranja)",
  roxo: "var(--kpi-roxo)", rosa: "var(--kpi-rosa)", cinza: "rgb(var(--slate-500))",
};

/**
 * Botão de ação em ícone colorido com o nome embaixo, como os atalhos da tela inicial.
 * `ativo` (escolha feita) pinta o ícone com a cor sólida e letra branca.
 */
export function BotaoAtalho({ icon: Icon, label, cor, corAtiva, ativo, onClick, href, title, disabled }: {
  icon: LucideIcon; label: string; cor: string; corAtiva?: string; ativo?: boolean; onClick?: () => void;
  href?: string; title?: string; disabled?: boolean;
}) {
  const estilo = ativo
    ? { background: corAtiva ?? cor, color: "#fff" }
    : { background: `color-mix(in srgb, ${cor} 16%, transparent)`, color: cor, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${cor} 40%, transparent)` };
  const corpo = (<>
    <span className="grid h-11 w-11 place-items-center rounded-2xl transition group-hover:scale-105 group-active:scale-95" style={estilo}>
      <Icon size={20} aria-hidden />
    </span>
    <span className="max-w-full text-[11px] font-semibold leading-tight text-slate-700">{label}</span>
  </>);
  const cls = "group flex min-w-0 flex-col items-center gap-1 rounded-xl px-0.5 py-1 text-center transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";
  if (href) return <a href={href} target="_blank" rel="noreferrer" title={title} className={cls}>{corpo}</a>;
  return <button type="button" title={title} aria-pressed={ativo} disabled={disabled} onClick={onClick} className={cls}>{corpo}</button>;
}

type Tom = "neutro" | "bom" | "atencao" | "critico" | "info";
const corDoTom: Record<Tom, CorCartao> = { neutro: "neutro", info: "azul", bom: "verde", atencao: "ambar", critico: "vermelho" };

/** Indicador (número de destaque) com ícone e linha de apoio. */
export function Stat({ label, valor, sub, icon: Icon, tom = "neutro", onClick }: {
  label: string; valor: ReactNode; sub?: ReactNode; icon?: LucideIcon; tom?: Tom; onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  const c = coresCartao[corDoTom[tom]];
  return (
    // o ícone flutua no canto: o nome passa por baixo dele e número e explicação usam a largura toda (no celular,
    // com o ícone ao lado, o texto ficava numa coluna de 70 px)
    <Tag onClick={onClick}
      className={`${caixaCartao} cartao-fit block w-full p-3.5 pl-4 text-left sm:p-4 sm:pl-5 ${c.caixa}
        ${onClick ? "transition hover:shadow-pop hover:brightness-[1.03]" : ""}`}>
      <span className="flow-root text-[13px] leading-tight">
        {Icon && <span className={`float-right mb-1 ml-2 grid h-8 w-8 place-items-center rounded-lg sm:h-9 sm:w-9 ${c.icone}`}><Icon size={17} /></span>}
        <span className="text-[13px] font-semibold leading-tight text-slate-600">{label}</span>
      </span>
      <span className={`num valor-fit mt-1 block font-bold tracking-tight [--valor-max:1.375rem] ${tom === "bom" || tom === "info" ? "text-fg" : c.valor}`} style={fitValor(valor)}>{valor}</span>
      {sub && <span className="mt-0.5 block text-[13px] leading-snug text-slate-600">{sub}</span>}
    </Tag>
  );
}

const badgeColors: Record<string, string> = {
  orcamento: "bg-purple-100 text-purple-800 ring-1 ring-inset ring-purple-200",
  aprovado: "bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-200",
  faturado: "bg-indigo-100 text-indigo-800 ring-1 ring-inset ring-indigo-200",
  entregue: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  cancelado: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200",
  cancelada: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200",
  aberto: "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200",
  pago: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  vencido: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200",
  aberta: "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200",
  em_diagnostico: "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200",
  aguardando_aprovacao: "bg-purple-100 text-purple-800 ring-1 ring-inset ring-purple-200",
  aguardando_peca: "bg-orange-100 text-orange-800 ring-1 ring-inset ring-orange-200",
  em_reparo: "bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-200",
  concluida: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  processando: "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200",
  autorizada: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  erro: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200",
  enviado: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  em_transito: "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200",
  recebida: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  rascunho: "bg-slate-100 text-slate-700",
  enviando: "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200",
  pendente: "bg-slate-100 text-slate-700",
  aguardando_xml: "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200",
  aguardando_vinculo: "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200",
  revisao: "bg-purple-100 text-purple-800 ring-1 ring-inset ring-purple-200",
  concluido: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  ignorada: "bg-slate-100 text-slate-500",
  ativo: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  inativo: "bg-slate-100 text-slate-500",
  ferias: "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200",
  afastado: "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200",
  desligado: "bg-slate-100 text-slate-500",
  em_garantia: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  vence_logo: "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200",
  fora_garantia: "bg-slate-100 text-slate-600",
  planejada: "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200",
  em_producao: "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200",
  pc_cotacao: "bg-purple-100 text-purple-800 ring-1 ring-inset ring-purple-200",
  pc_enviado: "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200",
  pc_parcial: "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200",
  pc_recebido: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  pc_cancelado: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200",
  escolhida: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  contingencia: "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200",
  denegada: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200",
  enviada: "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200",
  visualizada: "bg-purple-100 text-purple-800 ring-1 ring-inset ring-purple-200",
  aprovada: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  rejeitada: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200",
  expirada: "bg-slate-100 text-slate-600",
  conciliado: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  ignorado: "bg-slate-100 text-slate-500",
  transferencia: "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200",
  indicio: "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200",
  confirmado: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200",
  resolvido: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
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
  transferencia: "transferência", indicio: "indício", ferias: "em férias",
};

/** Selo cheio (fundo forte e letra branca) para a etapa da venda: a lista fica colorida nos dois temas. */
const badgeForte: Record<string, string> = {
  orcamento: "bg-[#7c3aed]", aprovado: "bg-solido-azul", faturado: "bg-[#4338ca]", entregue: "bg-solido-verde", cancelado: "bg-solido-vermelho",
};

export function Badge({ value, forte }: { value: string | null | undefined; forte?: boolean }) {
  if (!value) return <span className="text-slate-400">—</span>;
  const cheio = forte ? badgeForte[value] : undefined;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${cheio ? `${cheio} text-white shadow-card` : badgeColors[value] ?? "bg-slate-100 text-slate-700"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {badgeLabel[value] ?? value.replace(/_/g, " ")}
    </span>
  );
}

const pilhaModais: symbol[] = [];

/**
 * Esc fecha só a janela de cima (ex.: o PDF aberto por cima da ficha). A janela entra na pilha quando abre e não sai
 * quando é redesenhada (o onClose fica numa referência): senão a janela de baixo voltava para o topo ao receber dados
 * novos e o Esc seguinte fechava ela. Esc já tratado por um campo (lista de busca aberta) não fecha a janela.
 */
export function useFecharComEsc(open: boolean, onClose: () => void) {
  const fechar = useRef(onClose);
  fechar.current = onClose;
  useEffect(() => {
    if (!open) return;
    const id = Symbol();
    pilhaModais.push(id);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && pilhaModais[pilhaModais.length - 1] === id && fechar.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      pilhaModais.splice(pilhaModais.indexOf(id), 1);
    };
  }, [open]);
}

export function Modal({
  open, onClose, title, children, wide,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useFecharComEsc(open, onClose);
  const tituloId = useId();
  const caixa = useRef<HTMLDivElement>(null);
  // leitor de tela e teclado entram na janela ao abrir e voltam para onde estavam ao fechar
  useEffect(() => {
    if (!open) return;
    const antes = document.activeElement as HTMLElement | null;
    if (caixa.current && !caixa.current.contains(document.activeElement)) caixa.current.focus({ preventScroll: true });
    return () => { if (antes && document.contains(antes)) antes.focus({ preventScroll: true }); };
  }, [open]);

  if (!open) return null;
  // Portal: a janela fica fora do formulário que a abriu (formulário dentro de formulário recarregava a página),
  // e o "enviar" de dentro dela não chega ao formulário de trás.
  // Centralizada com mx-auto (não com flex): se algo ficar mais largo, nunca some para a esquerda; e o fundo
  // não desliza para os lados (overflow-x-hidden), só rola para baixo.
  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden overscroll-contain bg-ink/50 p-2 backdrop-blur-[2px] sm:p-6"
      onSubmit={(e) => e.stopPropagation()}>
      <div ref={caixa} role="dialog" aria-modal="true" aria-labelledby={tituloId} tabIndex={-1}
        className={`mx-auto w-full min-w-0 ${wide ? "max-w-5xl" : "max-w-2xl"} rounded-2xl bg-surface shadow-pop focus:outline-none`}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
          <h2 id={tituloId} className="min-w-0 text-base font-bold text-fg">{title}</h2>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="modal-corpo min-w-0 break-words p-4 sm:p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const somarMes = (ym: string, n: number) => {
  const [a, m] = ym.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
/** "2026-10" → "outubro de 2026" */
export const nomeMes = (ym: string) => { const [a, m] = ym.split("-"); return `${NOMES_MES[Number(m) - 1] ?? m} de ${a}`; };

/**
 * Escolha de mês (valor "AAAA-MM") em português e igual em todo navegador: o campo de mês nativo aparece em inglês
 * ou como "--------- ----" no Safari e no Firefox. Setas para o mês anterior e o seguinte; "vazio" = opção de todos os meses.
 */
export function CampoMes({ value, onChange, min = "2020-01", max, vazio, className = "", rotulo = "Mês" }: {
  value: string; onChange: (v: string) => void; min?: string; max?: string; vazio?: string; className?: string; rotulo?: string;
}) {
  const atual = new Date().toISOString().slice(0, 7);
  const fim = max ?? somarMes(atual, 12);
  const opcoes: string[] = [];
  for (let m = fim; m >= min && opcoes.length < 240; m = somarMes(m, -1)) opcoes.push(m);
  if (value && !opcoes.includes(value)) { opcoes.push(value); opcoes.sort().reverse(); }
  const mover = (n: number) => {
    const novo = somarMes(value || atual, n);
    if (novo >= min && novo <= fim) onChange(novo);
  };
  const seta = "grid h-9 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 sm:h-8";
  return (
    <div className={`inline-flex min-w-0 items-center gap-0.5 ${className}`} role="group" aria-label={rotulo}>
      <button type="button" className={seta} aria-label="Mês anterior" title="Mês anterior" disabled={!!value && value <= min} onClick={() => mover(-1)}><ChevronLeft size={16} /></button>
      <select className="input w-auto min-w-0" value={value} onChange={(e) => onChange(e.target.value)} aria-label={rotulo}>
        {vazio && <option value="">{vazio}</option>}
        {opcoes.map((o) => <option key={o} value={o}>{nomeMes(o)}</option>)}
      </select>
      <button type="button" className={seta} aria-label="Próximo mês" title="Próximo mês" disabled={!!value && value >= fim} onClick={() => mover(1)}><ChevronRight size={16} /></button>
    </div>
  );
}

/**
 * Caixa que rola para o lado e mostra que há mais conteúdo: uma seta no lado que continua (clicar rola).
 * No celular a seta não aparece (o dedo já arrasta); lá as tabelas viram cartões.
 */
export function RolagemLateral({ children, className = "", caixa = "" }: { children: ReactNode; className?: string; caixa?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [lados, setLados] = useState({ esq: false, dir: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      const esq = el.scrollLeft > 4, dir = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setLados((l) => (l.esq === esq && l.dir === dir ? l : { esq, dir }));
    };
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => { el.removeEventListener("scroll", medir); ro.disconnect(); };
  }, []);
  const rolar = (lado: number) => ref.current?.scrollBy({ left: lado * ref.current.clientWidth * 0.7, behavior: "smooth" });
  const seta = "absolute top-[min(50%,9rem)] z-10 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-slate-300 bg-surface text-slate-700 shadow-pop hover:bg-slate-50 md:grid";
  return (
    <div className={`relative ${className}`}>
      <div ref={ref} className={`overflow-x-auto ${caixa}`}>{children}</div>
      {lados.esq && <button type="button" aria-label="Rolar para a esquerda" title="Tem mais à esquerda" onClick={() => rolar(-1)} className={`${seta} left-1`}><ChevronLeft size={18} /></button>}
      {lados.dir && <button type="button" aria-label="Rolar para a direita" title="Tem mais à direita" onClick={() => rolar(1)} className={`${seta} right-1`}><ChevronRight size={18} /></button>}
    </div>
  );
}

/**
 * Tabela que vira lista de cartões no celular: cada célula ganha o nome da coluna
 * (data-label) e o CSS (.tabela em index.css) empilha "rótulo: valor".
 * A coluna sem título é a das ações (botões ocupam a linha toda no celular).
 */
/**
 * Tabela das listas. Clicar no título da coluna ordena (setinhas como no Tiny): texto de A a Z, número, valor e data
 * do maior para o menor; o segundo clique inverte e o terceiro volta à ordem da tela. A ordem vale para todas as linhas
 * que a tela mandar; com `limite`, ordena todas e mostra só as primeiras (o "Mostrar mais" continua igual).
 * Coluna sem texto, com botão/caixinha no título, com `aria-sort` próprio ou `data-sem-ordem` não ordena.
 */
export function Table({ head, children, empty, limite }: { head: ReactNode; children: ReactNode; empty?: boolean; limite?: number }) {
  const ref = useRef<HTMLTableElement>(null);
  const [ordem, setOrdem] = useState<{ col: number; crescente: boolean } | null>(null);
  const titulos = achatar(head).filter((t) => isValidElement(t)) as ReactElement<Record<string, unknown> & { children?: ReactNode }>[];
  const linhas = achatar(children);
  // só ordena quando dá para ler as células de todas as linhas (linha feita por componente próprio fica como está)
  const legivel = linhas.length > 1 && linhas.every((u) => celulasDa(u));
  const ordenavel = (t: (typeof titulos)[number], i: number) => legivel && t.type === "th" && t.props["aria-sort"] === undefined
    && t.props["data-sem-ordem"] === undefined && !!textoDoNo(t.props.children).trim() && !temInterativo(t.props.children)
    && linhas.some((u) => valorDaCelula(u, i));
  const clicar = (i: number) => setOrdem((o) => {
    const natural = sentidoNatural(linhas, i);
    if (o?.col !== i) return { col: i, crescente: natural };
    return o.crescente === natural ? { col: i, crescente: !natural } : null;
  });
  const ativa = ordem && ordem.col < titulos.length && ordenavel(titulos[ordem.col], ordem.col) ? ordem : null;
  const ordenadas = ativa ? ordenarLinhas(linhas, ativa.col, ativa.crescente) : linhas;
  const mostradas = limite != null ? ordenadas.slice(0, limite) : ordenadas;
  const cabecalho = titulos.map((t, i) => {
    if (!ordenavel(t, i)) return t;
    const esta = ativa?.col === i;
    const Icone = !esta ? ArrowUpDown : ativa.crescente ? ArrowUp : ArrowDown;
    return cloneElement(t, { "aria-sort": esta ? (ativa.crescente ? "ascending" : "descending") : "none" } as Record<string, unknown>,
      <button type="button" onClick={() => clicar(i)} title={esta ? "Clique para inverter a ordem" : "Ordenar por esta coluna"}
        className={`inline-flex items-center gap-1 text-inherit hover:text-fg ${esta ? "text-fg" : ""}`}>
        {t.props.children}<Icone size={12} className={esta ? "" : "opacity-50"} aria-hidden />
      </button>);
  });
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
    <Card className="tabela-caixa overflow-hidden">
      <RolagemLateral>
        <table ref={ref} className="tabela w-full divide-y divide-slate-100 md:min-w-[720px]">
          <thead className="bg-slate-50/80"><tr>{cabecalho}</tr></thead>
          <tbody className="divide-y divide-slate-100">{mostradas}</tbody>
        </table>
      </RolagemLateral>
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
  // no celular, muitas abas viravam 3 ou 4 linhas antes do conteúdo: lá vira uma lista de escolha de uma linha só
  const lista = options.length > 3;
  return (
    <>
    {lista && (
      <label className="mb-4 flex items-center gap-2 md:hidden">
        <span className="sr-only">Seção</span>
        <select className="input border-modulo/50 font-semibold text-fg" value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    )}
    <div className={`mb-4 flex-wrap gap-1 rounded-xl border border-slate-200 bg-surface p-1 shadow-card ${lista ? "hidden md:inline-flex" : "inline-flex"}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
            value === o.value ? "bg-modulo-escuro text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
    </>
  );
}

/**
 * Ações secundárias de uma barra: entram num botão "Mais", no celular e no computador (a ação principal fica de fora, à vista).
 * O menu fica montado mesmo fechado, para não perder um arquivo escolhido num botão de importar.
 */
export function MaisAcoes({ children, rotulo = "Mais" }: { children: ReactNode; rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  // o menu abre logo abaixo do botão, alinhado pela direita dele, mas sempre dentro da tela (com 16px de folga)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  useFecharComEsc(aberto, () => setAberto(false));
  // igual no celular e no computador: as ações de apoio ficam no "Mais" e a principal fica à vista (antes, no computador,
  // eram até 6 botões em fila antes da lista)
  return (
    <div className="relative">
      <Button type="button" variant="secondary" aria-expanded={aberto} aria-haspopup="menu" onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const largura = Math.min(window.innerWidth - 32, 18 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16));
        setPos({ top: r.bottom + 4, left: Math.max(16, Math.min(r.right - largura, window.innerWidth - largura - 16)), width: largura });
        setAberto((a) => !a);
      }}><MoreHorizontal size={16} /> {rotulo}</Button>
      {aberto && <div className="fixed inset-0 z-40" aria-hidden onClick={() => setAberto(false)} />}
      <div role="menu" onClick={() => setAberto(false)} style={pos ? { top: pos.top, left: pos.left, width: pos.width } : undefined}
        className={`${aberto ? "flex" : "hidden"} fixed z-50 max-h-[70vh] flex-col gap-1 overflow-y-auto rounded-xl border border-slate-200 bg-surface p-2 shadow-pop [&>*]:w-full [&>*]:justify-start`}>
        {children}
      </div>
    </div>
  );
}
