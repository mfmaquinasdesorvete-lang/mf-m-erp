// Configurações em páginas: a lista de seções (painel e menu da página), o cabeçalho com "voltar" e o formulário que
// salva só os campos da própria página (uma página não apaga o que outra mudou).
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, BadgePercent, Bell, Landmark, Percent, Building2, Calculator, Database, FileText, FolderTree, HandCoins, Mail, Package, Palette, ShoppingBag, type LucideIcon,
} from "lucide-react";
import { Button, Card } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { useConfig } from "@/lib/useConfig";

export type SecaoId = "empresa" | "unidades" | "recebimentos" | "bancos" | "orcamentos" | "comissoes" | "descontos" | "pedidos" | "notas" | "catalogo" | "avisos" | "email" | "contador" | "dados" | "cadastros";
export type Secao = { id: SecaoId; titulo: string; resumo: string; icone: LucideIcon; cor: string; grupo: string };

export const SECOES: Secao[] = [
  { id: "empresa", grupo: "Empresa", titulo: "Empresa e marca", resumo: "Dados gerais, logo, ícone, cores e o cabeçalho dos PDFs", icone: Palette, cor: "from-[#a855f7] to-[#6d28d9]" },
  { id: "unidades", grupo: "Empresa", titulo: "Unidades", resumo: "Matriz e filial: CNPJ, IE, endereço e série da NF-e", icone: Building2, cor: "from-[#64748b] to-[#334155]" },
  { id: "recebimentos", grupo: "Empresa", titulo: "Recebimentos e taxas", resumo: "Pix, banco e InfinitePay de cada unidade, taxas, multa e juros", icone: BadgePercent, cor: "from-[#10b981] to-[#047857]" },
  { id: "bancos", grupo: "Empresa", titulo: "Bancos e extratos", resumo: "Extrato automático (Open Finance), API do Inter e extrato OFX por e-mail", icone: Landmark, cor: "from-[#0ea5e9] to-[#4f46e5]" },
  { id: "orcamentos", grupo: "Vendas", titulo: "Orçamentos e garantia", resumo: "Validade, prazos, layout da proposta, garantia e laudo da OS", icone: FileText, cor: "from-[#0ea5e9] to-[#2563eb]" },
  { id: "descontos", grupo: "Vendas", titulo: "Descontos", resumo: "Máximo por tipo de venda e senha de aprovação do administrador", icone: Percent, cor: "from-[#ef4444] to-[#b91c1c]" },
  { id: "comissoes", grupo: "Vendas", titulo: "Comissões", resumo: "Percentual padrão e regras por vendedor e categoria", icone: HandCoins, cor: "from-[#f59e0b] to-[#b45309]" },
  { id: "catalogo", grupo: "Vendas", titulo: "Catálogo e vitrine", resumo: "Catálogo do WhatsApp, vitrine do site e loja virtual", icone: ShoppingBag, cor: "from-[#ec4899] to-[#be185d]" },
  { id: "pedidos", grupo: "Operação", titulo: "Pedidos e expedição", resumo: "O que acontece sozinho na venda, etiquetas e impressora Zebra", icone: Package, cor: "from-[#f97316] to-[#c2410c]" },
  { id: "notas", grupo: "Operação", titulo: "Notas fiscais", resumo: "NF-e geral, Focus NFe, notas de fornecedores e impostos", icone: FileText, cor: "from-[#06b6d4] to-[#0e7490]" },
  { id: "avisos", grupo: "Comunicação", titulo: "Avisos automáticos", resumo: "Telegram da equipe e e-mails para os clientes", icone: Bell, cor: "from-[#eab308] to-[#a16207]" },
  { id: "email", grupo: "Comunicação", titulo: "Caixa de e-mail", resumo: "E-mail da empresa (IMAP/SMTP) para enviar e receber pelo ERP", icone: Mail, cor: "from-[#3b82f6] to-[#1d4ed8]" },
  { id: "contador", grupo: "Comunicação", titulo: "Contador", resumo: "Envio automático do fechamento do mês", icone: Calculator, cor: "from-[#8b5cf6] to-[#5b21b6]" },
  { id: "cadastros", grupo: "Cadastros", titulo: "Categorias e marcadores", resumo: "Categorias dos produtos e os marcadores coloridos de todos os cadastros", icone: FolderTree, cor: "from-[#a855f7] to-[#6d28d9]" },
  { id: "dados", grupo: "Dados", titulo: "Dados e backup", resumo: "Backup diário, exportar tudo e apagar dados de teste", icone: Database, cor: "from-[#475569] to-[#0f172a]" },
];
export const secaoPorId = (id?: string | null) => SECOES.find((s) => s.id === id) ?? null;

/** Ícone da seção no quadrado colorido (painel e cabeçalho). */
export function IconeSecao({ s, tamanho = 22 }: { s: Secao; tamanho?: number }) {
  const I = s.icone;
  return <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${s.cor} text-white shadow-card`} aria-hidden><I size={tamanho} /></span>;
}

/** Cabeçalho das páginas: voltar ao painel, ícone, título e o que a página faz. */
export function CabecalhoSecao({ s, acoes, voltar = { to: "/configuracoes", rotulo: "Configurações" } }: { s: Secao; acoes?: ReactNode; voltar?: { to: string; rotulo: string } }) {
  return (
    <div className="mb-5">
      <Link to={voltar.to} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-fg">
        <ArrowLeft size={16} aria-hidden /> {voltar.rotulo}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconeSecao s={s} />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-fg sm:text-2xl">{s.titulo}</h1>
            <p className="text-sm text-slate-500">{s.resumo}</p>
          </div>
        </div>
        {acoes}
      </div>
    </div>
  );
}

/** Bloco da página: título, explicação e conteúdo; `fechado` começa recolhido (tocar no título abre). */
export function Bloco({ titulo, descricao, children, fechado, id }: { titulo: ReactNode; descricao?: ReactNode; children: ReactNode; fechado?: boolean; id?: string }) {
  const corpo = (<>{descricao && <p className="mb-3 text-sm text-slate-500">{descricao}</p>}{children}</>);
  if (fechado === undefined) {
    return <Card className="scroll-mt-20 p-4 sm:p-5"><div id={id}><h2 className="mb-1 font-semibold text-fg">{titulo}</h2>{corpo}</div></Card>;
  }
  return (
    <Card className="scroll-mt-20 p-0">
      <details id={id} open={!fechado} className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 font-semibold text-fg sm:p-5 [&::-webkit-details-marker]:hidden">
          {titulo}<span className="text-slate-400 transition group-open:rotate-180" aria-hidden>▾</span>
        </summary>
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">{corpo}</div>
      </details>
    </Card>
  );
}

/**
 * Formulário de uma página: carrega as configurações e salva só as `chaves` dela (o resto fica como está).
 * `converter` ajusta os valores antes de gravar (números, maiúsculas…).
 */
export function useCfgPagina(chaves: string[], converter?: (row: Record<string, any>) => Record<string, any>) {
  const { data } = useConfig();
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<Record<string, any> | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (data && !cfg) setCfg(data); }, [data, cfg]);
  const set = (k: string) => (e: { target: { value: string } }) => setCfg((c) => ({ ...(c ?? {}), [k]: e.target.value }));
  const mudar = (patch: Record<string, any>) => setCfg((c) => ({ ...(c ?? {}), ...patch }));
  async function salvar(e?: FormEvent) {
    e?.preventDefault();
    if (!cfg) return;
    setSalvando(true);
    try {
      let row: Record<string, any> = {};
      for (const k of chaves) row[k] = cfg[k] === "" ? null : cfg[k];
      if (converter) row = converter(row);
      const { error } = await supabase.from("configuracoes").update({ ...row, updated_at: new Date().toISOString() }).eq("id", 1);
      if (error) throw error;
      notify("Configurações salvas");
      qc.invalidateQueries({ queryKey: ["configuracoes"] });
    } catch (err) { notifyError(err); } finally { setSalvando(false); }
  }
  return { cfg, set, mudar, salvar, salvando };
}

/** Botão Salvar do cabeçalho (envia o formulário da página). */
export const BotaoSalvar = ({ form, salvando }: { form: string; salvando: boolean }) => (
  <Button form={form} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
);

/** Campo de texto ligado ao formulário da página. */
export function campo(cfg: Record<string, any>, set: (k: string) => (e: { target: { value: string } }) => void) {
  return (k: string, label: string, cls = "", type = "text", extra: Record<string, unknown> = {}) => (
    <label className={`block min-w-0 ${cls}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <input className="input" type={type} step={type === "number" ? "any" : undefined} value={cfg[k] ?? ""} onChange={set(k)} {...extra} />
    </label>
  );
}

/** Interruptor com texto (liga/desliga uma opção). */
export function Opcao({ ligado, onChange, children }: { ligado: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-start gap-2.5 rounded-lg p-1 text-sm">
      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={ligado} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}
