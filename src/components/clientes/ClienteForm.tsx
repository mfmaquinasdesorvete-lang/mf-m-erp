// Cadastro completo do cliente, em abas (como no Tiny): dados gerais, contato e pessoas de contato, endereço e cobrança,
// dados complementares (fiscal, comercial e crédito), anexos, observações e a assinatura eletrônica da ficha.
// Em cima, a barra de "cadastro x% completo" mostra o que falta e leva direto à aba.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, BadgeCheck, BriefcaseBusiness, Building2, CircleCheck, Copy, Globe, HandCoins, IdCard, Landmark, Mail, MapPin, MapPinned,
  MessageCircle, Paperclip, PenLine, Pencil, Phone, Receipt, Save, StickyNote, Tags, Truck, UserRound, Users, Wallet, X, type LucideIcon,
} from "lucide-react";
import { Button, Field, useFecharComEsc } from "../ui";
import { CampoMascara } from "../CrudPage";
import { Anexos } from "../Anexos";
import { VendedorSelect } from "../VendedorSelect";
import { EtiquetasCliente } from "./QualidadeClientes";
import { PessoasContato, type PessoaEditada } from "./PessoasContato";
import { AssinaturaFicha, useAssinaturasFicha } from "./AssinaturaFicha";
import { CategoriasContato, corTipo, useTiposContato } from "./TiposContato";
import { limpar, useInvalidate, useSave } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { brl, dataBR, digitos, whatsappLink } from "@/lib/format";
import { erroCampo, type Mascara } from "@/lib/mascaras";
import { completarPorCep, completarPorCnpj } from "@/lib/cadastro";
import { useFormasPagamento } from "@/lib/formasPagamento";
import { usePerfil } from "@/lib/auth";
import {
  CONDICOES, completude, iniciais, numeroBR, pendenciasCadastro, REGIMES, rotuloCrm, STATUS_CRM, type Aba,
} from "@/lib/fichaCadastral";
import type { PessoaContato } from "@/lib/types";

/** Campos preenchidos pela Receita ao digitar o CNPJ. */
export const CAMPOS_RECEITA = ["nome", "nome_fantasia", "email", "telefone", "cep", "logradouro", "numero", "complemento", "bairro", "municipio", "uf", "inscricao_estadual"];

const ABAS: { id: Aba; label: string; Icon: LucideIcon }[] = [
  { id: "gerais", label: "Dados gerais", Icon: IdCard },
  { id: "contato", label: "Contato", Icon: Phone },
  { id: "endereco", label: "Endereço", Icon: MapPin },
  { id: "complementares", label: "Complementares", Icon: BriefcaseBusiness },
  { id: "anexos", label: "Anexos", Icon: Paperclip },
  { id: "observacoes", label: "Observações", Icon: StickyNote },
  { id: "assinatura", label: "Assinatura", Icon: PenLine },
];

const MASCARAS: Record<string, Mascara> = {
  cpf_cnpj: "doc", inscricao_estadual: "ie", whatsapp: "whatsapp", telefone: "telefone", telefone_adicional: "telefone", email: "email",
  email_nfe: "email", cep: "cep", uf: "uf", cobranca_cep: "cep", cobranca_uf: "uf",
};
const ABA_DO_CAMPO: Record<string, Aba> = {
  nome: "gerais", cpf_cnpj: "gerais", inscricao_estadual: "gerais", whatsapp: "contato", telefone: "contato", telefone_adicional: "contato",
  email: "contato", email_nfe: "contato", cep: "endereco", uf: "endereco", cobranca_cep: "endereco", cobranca_uf: "endereco",
};
const ROTULO: Record<string, string> = {
  cpf_cnpj: "CPF/CNPJ", inscricao_estadual: "Inscrição estadual", whatsapp: "WhatsApp", telefone: "Telefone", telefone_adicional: "Telefone adicional",
  email: "E-mail", email_nfe: "E-mail para NF-e", cep: "CEP", uf: "UF", cobranca_cep: "CEP de cobrança", cobranca_uf: "UF de cobrança",
};
const SPAN = { 2: "sm:col-span-2", 3: "sm:col-span-3", 4: "sm:col-span-4", 5: "sm:col-span-5", 6: "sm:col-span-6", 7: "sm:col-span-7", 8: "sm:col-span-8", 12: "sm:col-span-12" } as const;
type Span = keyof typeof SPAN;

const COR_SECAO = {
  sky: "bg-sky-50 text-sky-600", emerald: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600",
  purple: "bg-purple-50 text-purple-600", indigo: "bg-indigo-50 text-indigo-600", slate: "bg-slate-100 text-slate-600",
};

function Secao({ icone: Icon, titulo, sub, cor = "sky", acao, children }: {
  icone: LucideIcon; titulo: string; sub?: string; cor?: keyof typeof COR_SECAO; acao?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-surface p-4 shadow-card sm:p-5">
      <header className="mb-4 flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${COR_SECAO[cor]}`}><Icon size={18} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold leading-tight text-fg">{titulo}</h3>
          {sub && <p className="text-xs text-slate-500">{sub}</p>}
        </div>
        {acao}
      </header>
      {children}
    </section>
  );
}

const enderecoTexto = (c: Record<string, any>, p = "") =>
  [[c[`${p}logradouro`], c[`${p}numero`]].filter(Boolean).join(", "), c[`${p}bairro`], c[`${p}municipio`] && `${c[`${p}municipio`]}/${c[`${p}uf`] ?? ""}`].filter(Boolean).join(" - ");

export function ClienteForm({ registro, onClose }: { registro: Record<string, any>; onClose: () => void }) {
  const [c, setC] = useState<Record<string, any>>(() => ({ cobranca_diferente: false, tags: [], ...registro }));
  const base = useRef(JSON.stringify(c));
  const [aba, setAba] = useState<Aba>("gerais");
  const [tocados, setTocados] = useState<Set<string>>(new Set());
  const [buscando, setBuscando] = useState<string | null>(null);
  const [pessoas, setPessoas] = useState<PessoaEditada[]>([]);
  const pessoasCarregadas = useRef(false);
  const [salvando, setSalvando] = useState(false);
  const save = useSave("clientes");
  const invalidar = useInvalidate();
  const { papel } = usePerfil();
  const podeEditar = papel === "admin" || papel === "vendas" || papel === "financeiro" || papel === "tecnico";
  // mandar para Fornecedores e mexer nas categorias: vendas e financeiro (e admin)
  const podeMover = papel === "admin" || papel === "vendas" || papel === "financeiro";
  const tipos = useTiposContato();
  const [gerirTipos, setGerirTipos] = useState(false);
  /** Desmarcou "Cliente": ao salvar, vai para Fornecedores e sai da lista de clientes. */
  const [deixaCliente, setDeixaCliente] = useState(false);
  const tagsAntes = useRef<string[]>(registro.tags ?? []);
  const { data: formas = [] } = useFormasPagamento();
  const { data: assinaturas = [] } = useAssinaturasFicha();
  const assinado = !!c.id && assinaturas.some((a) => a.cliente_id === c.id && a.status === "assinado");

  // pessoas de contato do banco (uma vez; depois a lista é a que está sendo editada)
  const { data: pessoasBanco } = useQuery({
    queryKey: ["clientes_pessoas", c.id],
    enabled: !!c.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes_pessoas").select("*").eq("cliente_id", c.id).eq("ativo", true).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PessoaContato[];
    },
  });
  useEffect(() => {
    if (pessoasBanco && !pessoasCarregadas.current) {
      pessoasCarregadas.current = true;
      setPessoas(pessoasBanco.map((p) => ({ ...p, chave: p.id! })));
    }
  }, [pessoasBanco]);

  // contas em aberto (para o limite de crédito); quem não vê o financeiro fica sem o número
  const { data: emAberto } = useQuery({
    queryKey: ["contas_receber", "aberto_cliente", c.id],
    enabled: !!c.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("contas_receber").select("valor,status").eq("cliente_id", c.id).eq("status", "aberto");
      if (error) return null;
      return (data ?? []).reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
    },
  });

  const pend = useMemo(() => pendenciasCadastro(c, assinado), [c, assinado]);
  const pct = completude(c, assinado);
  const sujo = JSON.stringify(c) !== base.current || pessoas.some((p) => p.alterada || p.removida) || deixaCliente;
  const pj = c.tipo_pessoa === "PJ";
  const crm = rotuloCrm(c.status_crm);
  const nomeTopo = String(c.nome_fantasia || c.nome || "").trim();

  const fechar = () => { if (!sujo || confirm("Sair sem salvar as alterações?")) onClose(); };
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;
  const fecharEstavel = useCallback(() => fecharRef.current(), []);
  useFecharComEsc(true, fecharEstavel);

  // ------------------------------------------------------------------ campos
  function reagir(nome: string, valor: any, row: Record<string, any>, forcar: boolean): Promise<Record<string, any> | null> | null {
    if (nome === "cep" && (forcar || digitos(valor).length === 8)) return completarPorCep(valor, forcar);
    if (nome === "cobranca_cep" && (forcar || digitos(valor).length === 8)) {
      return completarPorCep(valor, forcar).then((r) => r && { cobranca_logradouro: r.logradouro, cobranca_bairro: r.bairro, cobranca_municipio: r.municipio, cobranca_uf: r.uf });
    }
    if (nome !== "cpf_cnpj") return null;
    const d = digitos(valor);
    if (d.length === 11) return Promise.resolve(row.tipo_pessoa === "PF" ? null : { tipo_pessoa: "PF" });
    if (d.length === 14) {
      return completarPorCnpj(row, d, CAMPOS_RECEITA, forcar).then((p) => ({ tipo_pessoa: "PJ", ...(p ?? {}), ...(p?.inscricao_estadual ? { contribuinte_icms: 1 } : {}) }));
    }
    if (forcar) notify("Digite o CNPJ completo (14 números) para buscar na Receita", "erro");
    return null;
  }

  function set(nome: string, valor: any, forcar = false) {
    setC((r) => ({ ...r, [nome]: valor }));
    const p = reagir(nome, valor, { ...c, [nome]: valor }, forcar);
    if (!p) return;
    const t = setTimeout(() => setBuscando(nome), 150); // só mostra "buscando" se demorar
    p.then((extra) => { if (extra) setC((r) => ({ ...r, ...extra })); })
      .catch(notifyError)
      .finally(() => { clearTimeout(t); setBuscando((b) => (b === nome ? null : b)); });
  }

  const tocar = (nome: string) => setTocados((t) => new Set(t).add(nome));

  /** Campo do formulário (função, não componente: o campo não perde o foco ao digitar). */
  const campo = (nome: string, rotulo: string, o: { span?: Span; tipo?: string; placeholder?: string; buscar?: boolean; ajuda?: string; obrigatorio?: boolean; linhas?: number } = {}) => {
    const mask = MASCARAS[nome];
    return (
      <Field key={nome} label={rotulo + (o.obrigatorio ? " *" : "")} className={`col-span-1 ${SPAN[o.span ?? 6]}`}>
        {mask ? (
          <CampoMascara f={{ name: nome, label: rotulo, mask, buscar: o.buscar, placeholder: o.placeholder }} valor={c[nome]} row={c}
            buscando={buscando === nome} mostrarErro={tocados.has(nome)} onBlur={() => tocar(nome)}
            onChange={(v) => set(nome, v)} onBuscar={() => set(nome, c[nome], true)} />
        ) : o.tipo === "textarea" ? (
          <textarea className="input" rows={o.linhas ?? 3} value={c[nome] ?? ""} placeholder={o.placeholder} disabled={!podeEditar} onChange={(e) => set(nome, e.target.value)} />
        ) : (
          <input className="input" type={o.tipo ?? "text"} value={c[nome] ?? ""} placeholder={o.placeholder} disabled={!podeEditar}
            inputMode={o.tipo === "decimal" ? "decimal" : undefined} onChange={(e) => set(nome, e.target.value)} />
        )}
        {o.ajuda && <span className="mt-1 block text-xs text-slate-500">{o.ajuda}</span>}
      </Field>
    );
  };

  const toggleTag = (tag: string) => {
    const tags: string[] = c.tags ?? [];
    set("tags", tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]);
  };

  // ------------------------------------------------------------------ gravar
  async function gravar(): Promise<Record<string, any> | null> {
    const errados = Object.entries(MASCARAS).filter(([k, m]) => (k.startsWith("cobranca_") && !c.cobranca_diferente ? false : !!erroCampo(m, c[k])));
    if (!String(c.nome ?? "").trim()) {
      setAba("gerais");
      notify(pj ? "Informe a razão social" : "Informe o nome do cliente", "erro");
      return null;
    }
    if (errados.length) {
      setTocados(new Set(errados.map(([k]) => k)));
      setAba(ABA_DO_CAMPO[errados[0][0]] ?? "gerais");
      notify(`Confira: ${errados.map(([k, m]) => `${ROTULO[k] ?? k} (${erroCampo(m, c[k])})`).join(", ")}`, "erro");
      return null;
    }
    setSalvando(true);
    try {
      const row = limpar({
        ...c,
        nome: String(c.nome).trim(),
        contribuinte_icms: Number(c.contribuinte_icms ?? 9),
        uf: c.uf ? String(c.uf).toUpperCase() : null,
        cobranca_uf: c.cobranca_uf ? String(c.cobranca_uf).toUpperCase() : null,
        regime_tributario: c.regime_tributario ? Number(c.regime_tributario) : null,
        desconto_padrao: numeroBR(c.desconto_padrao),
        limite_credito: numeroBR(c.limite_credito),
        website: c.website ? String(c.website).trim().replace(/^(?!https?:\/\/)(?=.)/i, "https://") : null,
      });
      const salvo = await save.mutateAsync(row);
      // pessoas de contato: novas, alteradas e retiradas (fica inativa, não some do histórico)
      const finais: PessoaEditada[] = [];
      for (const p of pessoas) {
        const dados = { nome: p.nome, setor: p.setor, email: p.email, telefone: p.telefone, ramal: p.ramal };
        if (p.removida) {
          if (p.id) { const { error } = await supabase.from("clientes_pessoas").update({ ativo: false }).eq("id", p.id); if (error) throw error; }
          continue;
        }
        if (!p.id) {
          const { data, error } = await supabase.from("clientes_pessoas").insert({ ...dados, cliente_id: salvo.id }).select().single();
          if (error) throw error;
          finais.push({ ...(data as PessoaContato), chave: (data as PessoaContato).id! });
          continue;
        }
        if (p.alterada) { const { error } = await supabase.from("clientes_pessoas").update(dados).eq("id", p.id); if (error) throw error; }
        finais.push({ ...p, alterada: false });
      }
      invalidar("clientes_pessoas");
      pessoasCarregadas.current = true;
      setPessoas(finais);
      const novo = { cobranca_diferente: false, tags: [], ...salvo };
      base.current = JSON.stringify(novo);
      setC(novo);
      return novo;
    } catch (e) {
      notifyError(e);
      return null;
    } finally {
      setSalvando(false);
    }
  }

  async function salvar() {
    const eraNovo = !c.id;
    const quem = nomeTopo || "Este cadastro";
    if (deixaCliente && !confirm(`${quem} vai para Fornecedores e sai da lista de clientes. Os anexos vão junto; pedidos, notas e contas antigos continuam no histórico. Continuar?`)) return;
    const salvo = await gravar();
    if (!salvo) return;
    if (deixaCliente) {
      setSalvando(true);
      try {
        const { data, error } = await supabase.rpc("clientes_virar_fornecedor", { p_ids: [salvo.id], p_manter_cliente: false });
        if (error) throw error;
        invalidar("clientes", "fornecedores", "documentos");
        notify(`${quem} agora está em Fornecedores${data?.fornecedores_criados ? "" : " (juntou com o fornecedor do mesmo CNPJ)"} e saiu da lista de clientes`);
        onClose();
      } catch (e) {
        notifyError(e);
      } finally {
        setSalvando(false);
      }
      return;
    }
    // marcou "Fornecedor": continua cliente e passa a existir também em Fornecedores (para notas de entrada e contas a pagar)
    const virouFornecedor = podeMover && (salvo.tags ?? []).includes("fornecedor") && !tagsAntes.current.includes("fornecedor");
    tagsAntes.current = salvo.tags ?? [];
    if (virouFornecedor) {
      const { error } = await supabase.rpc("clientes_virar_fornecedor", { p_ids: [salvo.id], p_manter_cliente: true });
      if (error) notifyError(error); else invalidar("fornecedores");
    }
    if (eraNovo) {
      notify("Cliente cadastrado. Agora é só pedir a assinatura da ficha.");
      setAba("assinatura");
    } else {
      notify(virouFornecedor ? "Salvo. Ele continua cliente e também está em Fornecedores" : "Salvo com sucesso");
      onClose();
    }
  }

  /** A assinatura usa a ficha gravada: grava antes o que foi mexido. */
  const salvarAntes = async () => (c.id && !sujo ? (c.id as string) : ((await gravar())?.id as string) ?? null);

  const i = ABAS.findIndex((a) => a.id === aba);
  const pendAba = (id: Aba) => pend.filter((p) => p.aba === id).length;

  // ------------------------------------------------------------------ tela
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/50 backdrop-blur-[2px] sm:p-6"
      role="dialog" aria-modal="true" aria-label={c.id ? `Cadastro de ${nomeTopo}` : "Novo cliente"}>
      <div className="flex min-h-full w-full max-w-5xl flex-col bg-canvas shadow-pop sm:min-h-0 sm:rounded-2xl">
        {/* topo: quem é + quanto falta */}
        <div className="bg-gradient-to-br from-ink via-ink-soft to-ink px-4 pb-4 pt-4 text-white sm:rounded-t-2xl sm:px-6 sm:pt-5">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 to-emerald-500 text-lg font-extrabold shadow-lg sm:h-14 sm:w-14">
              {c.id || nomeTopo ? iniciais(nomeTopo) : <UserRound size={24} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-200">{c.id ? `Cliente${c.codigo ? ` nº ${c.codigo}` : ""}` : "Novo cliente"}</div>
              <h2 className="truncate text-lg font-extrabold leading-tight sm:text-xl">{nomeTopo || "Cadastro de cliente"}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">{pj ? "Pessoa jurídica" : "Pessoa física"}</span>
                {crm && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${crm.cor}`}>{crm.label}</span>}
                {assinado && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-semibold"><BadgeCheck size={12} /> ficha assinada</span>}
                <EtiquetasCliente c={c as any} tipos={tipos} />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {c.whatsapp && (
                <a href={whatsappLink(c.whatsapp, `Olá, ${nomeTopo.split(" ")[0]}! Aqui é da MF Máquinas.`)} target="_blank" rel="noreferrer" title="Chamar no WhatsApp"
                  className="hidden rounded-lg p-2 text-emerald-300 hover:bg-white/10 sm:block"><MessageCircle size={18} /></a>
              )}
              {c.email && <a href={`mailto:${c.email}`} title="Enviar e-mail" className="hidden rounded-lg p-2 text-sky-200 hover:bg-white/10 sm:block"><Mail size={18} /></a>}
              <button type="button" onClick={fechar} className="rounded-lg p-2 text-white/80 hover:bg-white/10" aria-label="Fechar"><X size={20} /></button>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>{pct === 100 ? "Cadastro completo" : `Cadastro ${pct}% completo`}</span>
              {pct === 100 && <span className="inline-flex items-center gap-1 text-emerald-300"><CircleCheck size={14} /> pronto para vender e faturar</span>}
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Cadastro completo">
              <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            {pend.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pend.map((p) => (
                  <button key={p.item} type="button" onClick={() => setAba(p.aba)}
                    className="rounded-full border border-white/20 px-2 py-0.5 text-[11px] font-medium text-white/90 transition hover:bg-white/15">+ {p.item}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* abas */}
        <nav className="sticky top-0 z-10 border-b border-slate-200 bg-surface/95 backdrop-blur" aria-label="Partes do cadastro">
          <div className="flex gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none] sm:px-4">
            {ABAS.map((a) => {
              const n = pendAba(a.id);
              const ativa = a.id === aba;
              return (
                <button key={a.id} type="button" onClick={() => setAba(a.id)} aria-current={ativa ? "page" : undefined}
                  className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${ativa ? "bg-brand text-brand-fg shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
                  <a.Icon size={16} /> {a.label}
                  {n > 0 && <span className={`grid h-4 min-w-[1rem] place-items-center rounded-full px-1 text-[10px] font-bold ${ativa ? "bg-white/25" : "bg-amber-100 text-amber-800"}`}>{n}</span>}
                </button>
              );
            })}
          </div>
        </nav>

        {/* conteúdo */}
        <div className="flex-1 space-y-4 p-3 sm:p-6">
          {aba === "gerais" && (<>
            <Secao icone={IdCard} titulo="Identificação" sub="Digite o CNPJ: nome, endereço e inscrição estadual vêm da Receita">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                <div className="col-span-1 sm:col-span-5">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">Tipo de pessoa</span>
                  <div role="radiogroup" aria-label="Tipo de pessoa" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                    {([["PJ", "Jurídica", Building2], ["PF", "Física", UserRound]] as const).map(([v, l, Icon]) => (
                      <button key={v} type="button" role="radio" aria-checked={c.tipo_pessoa === v} disabled={!podeEditar} onClick={() => set("tipo_pessoa", v)}
                        className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition ${c.tipo_pessoa === v ? "bg-surface text-fg shadow-sm" : "text-slate-500 hover:text-fg"}`}>
                        <Icon size={15} /> {l}
                      </button>
                    ))}
                  </div>
                </div>
                {campo("cpf_cnpj", pj ? "CNPJ" : "CPF", { span: 5, buscar: true })}
                <Field label="Código" className="col-span-1 sm:col-span-2">
                  <div className="input flex items-center bg-slate-50 font-mono text-slate-600">{c.codigo ?? <span className="font-sans text-slate-400">automático</span>}</div>
                </Field>
                {campo("nome", pj ? "Razão social" : "Nome completo", { span: 7, obrigatorio: true })}
                {campo("nome_fantasia", pj ? "Nome fantasia" : "Apelido / como chamamos", { span: 5, placeholder: "Ex.: Gelato Nobre" })}
                <Field label="Contribuinte de ICMS" className="col-span-1 sm:col-span-4">
                  <select className="input" value={c.contribuinte_icms ?? 9} disabled={!podeEditar} onChange={(e) => set("contribuinte_icms", Number(e.target.value))}>
                    <option value={9}>Não contribuinte (consumidor final)</option>
                    <option value={1}>Contribuinte (tem IE)</option>
                    <option value={2}>Isento de inscrição</option>
                  </select>
                </Field>
                {campo("inscricao_estadual", "Inscrição estadual", { span: 4 })}
                {campo("inscricao_municipal", "Inscrição municipal", { span: 4 })}
              </div>
            </Secao>
            <Secao icone={Tags} titulo="Tipo de contato" cor="purple"
              sub={c.id && podeMover ? "O que ele é para a MF. Desmarque Cliente para mandar o cadastro para Fornecedores" : "Além de cliente, o que mais ele é para a MF"}
              acao={podeMover ? (
                <button type="button" onClick={() => setGerirTipos(true)} title="Criar, renomear e trocar a cor das categorias"
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                  <Pencil size={13} /> <span className="hidden sm:inline">Editar categorias</span>
                </button>
              ) : undefined}>
              <div className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={!deixaCliente} disabled={!c.id || !podeMover} onClick={() => setDeixaCliente((v) => !v)}
                  title={!c.id ? "Cadastro novo de cliente" : deixaCliente ? "Continuar como cliente" : "Desmarque para mandar para Fornecedores (sai da lista de clientes)"}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition disabled:cursor-default ${deixaCliente
                    ? "border-dashed border-slate-300 text-slate-500 line-through hover:bg-slate-50"
                    : "border-transparent bg-brand text-brand-fg"}`}>
                  {deixaCliente ? <span className="text-base leading-none">+</span> : <CircleCheck size={15} />} Cliente
                </button>
                {tipos.filter((t) => t.ativo || (c.tags ?? []).includes(t.chave)).map((t) => {
                  const on = (c.tags ?? []).includes(t.chave);
                  return (
                    <button key={t.chave} type="button" aria-pressed={on} disabled={!podeEditar} onClick={() => toggleTag(t.chave)}
                      title={t.ativo ? undefined : "Categoria fora da lista: desmarque para tirar a etiqueta"}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${on ? corTipo(t.cor).chip : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                      {on ? <CircleCheck size={15} /> : <span className="text-base leading-none">+</span>} {t.nome}
                    </button>
                  );
                })}
              </div>
              {deixaCliente && (
                <div className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <Truck size={18} className="mt-0.5 shrink-0" />
                  <div>
                    <b>Ao salvar, {nomeTopo || "este cadastro"} vai para Fornecedores e sai da lista de clientes.</b> Os anexos vão junto;
                    pedidos, notas e contas antigos continuam no histórico. Se já existe fornecedor com o mesmo CNPJ, os dois se juntam.
                  </div>
                </div>
              )}
            </Secao>
            <CategoriasContato open={gerirTipos} onClose={() => setGerirTipos(false)} podeEditar={podeMover} />
          </>)}

          {aba === "contato" && (<>
            <Secao icone={Phone} titulo="Canais de contato" sub="O WhatsApp é o principal: avisos, propostas, cobrança e o link da ficha vão por ele" cor="emerald">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                {campo("whatsapp", "Celular / WhatsApp", { span: 4 })}
                {campo("telefone", "Telefone", { span: 4 })}
                {campo("telefone_adicional", "Telefone adicional", { span: 4 })}
                {campo("email", "E-mail", { span: 6 })}
                {campo("email_nfe", "E-mail para envio da NF-e", { span: 6, ajuda: "Vazio: a nota vai para o e-mail principal" })}
                <Field label="Site" className="col-span-1 sm:col-span-6">
                  <div className="relative">
                    <Globe size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input className="input pl-9" value={c.website ?? ""} placeholder="www.empresa.com.br" disabled={!podeEditar} onChange={(e) => set("website", e.target.value)} />
                  </div>
                </Field>
                <label className="col-span-1 flex items-center gap-2 self-end rounded-xl border border-slate-200 px-3 py-2.5 text-sm sm:col-span-6">
                  <input type="checkbox" className="h-5 w-5" checked={c.avisos_email !== false} disabled={!podeEditar} onChange={(e) => set("avisos_email", e.target.checked)} />
                  Recebe avisos por e-mail (pedido, nota, entrega, garantia)
                </label>
                {campo("contato_observacoes", "Observações do contato", { span: 12, tipo: "textarea", linhas: 2, placeholder: "Ex.: prefere ligação depois das 14h; falar com o Marcos no financeiro" })}
              </div>
            </Secao>
            <Secao icone={Users} titulo="Pessoas de contato" sub="Quem compra, quem paga e quem recebe a máquina" cor="indigo">
              <PessoasContato pessoas={pessoas} onChange={setPessoas} disabled={!podeEditar} />
            </Secao>
          </>)}

          {aba === "endereco" && (<>
            <Secao icone={MapPin} titulo="Endereço" sub="Digite o CEP: rua, bairro, cidade e UF vêm sozinhos" cor="sky"
              acao={enderecoTexto(c) ? (
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${enderecoTexto(c)} ${c.cep ?? ""}`)}`} target="_blank" rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-brand hover:bg-brand-light"><MapPinned size={15} /> Mapa</a>
              ) : undefined}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                {campo("cep", "CEP", { span: 3, buscar: true })}
                {campo("logradouro", "Endereço", { span: 7 })}
                {campo("numero", "Número", { span: 2 })}
                {campo("complemento", "Complemento", { span: 4 })}
                {campo("bairro", "Bairro", { span: 4 })}
                {campo("municipio", "Município", { span: 3 })}
                {campo("uf", "UF", { span: 2 })}
              </div>
            </Secao>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-surface p-4 shadow-card">
              <input type="checkbox" className="h-5 w-5" checked={!!c.cobranca_diferente} disabled={!podeEditar} onChange={(e) => set("cobranca_diferente", e.target.checked)} />
              <span><span className="block font-semibold text-fg">Possui endereço de cobrança diferente</span>
                <span className="text-xs text-slate-500">Boletos e correspondência de cobrança vão para outro endereço</span></span>
            </label>
            {c.cobranca_diferente && (
              <Secao icone={Receipt} titulo="Endereço de cobrança" cor="amber"
                acao={podeEditar ? (
                  <Button type="button" variant="ghost" onClick={() => setC((r) => ({ ...r, cobranca_cep: r.cep, cobranca_logradouro: r.logradouro, cobranca_numero: r.numero,
                    cobranca_complemento: r.complemento, cobranca_bairro: r.bairro, cobranca_municipio: r.municipio, cobranca_uf: r.uf }))}>
                    <Copy size={15} /> Copiar do principal
                  </Button>
                ) : undefined}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                  {campo("cobranca_cep", "CEP", { span: 3, buscar: true })}
                  {campo("cobranca_logradouro", "Endereço", { span: 7 })}
                  {campo("cobranca_numero", "Número", { span: 2 })}
                  {campo("cobranca_complemento", "Complemento", { span: 4 })}
                  {campo("cobranca_bairro", "Bairro", { span: 4 })}
                  {campo("cobranca_municipio", "Município", { span: 3 })}
                  {campo("cobranca_uf", "UF", { span: 2 })}
                </div>
              </Secao>
            )}
          </>)}

          {aba === "complementares" && (<>
            <Secao icone={Landmark} titulo="Dados fiscais" cor="slate">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                <Field label="Código de regime tributário" className="col-span-1 sm:col-span-6">
                  <select className="input" value={c.regime_tributario ?? ""} disabled={!podeEditar} onChange={(e) => set("regime_tributario", e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Não informado</option>
                    {REGIMES.map((r) => <option key={r.value} value={r.value}>{r.value} - {r.label}</option>)}
                  </select>
                </Field>
                {campo("inscricao_suframa", "Inscrição Suframa", { span: 3, ajuda: "Zona Franca de Manaus" })}
                {campo("data_nascimento", pj ? "Data de abertura" : "Data de nascimento", { span: 3, tipo: "date" })}
              </div>
            </Secao>
            <Secao icone={HandCoins} titulo="Comercial" sub="Vendedor, forma e condição de pagamento já entram no próximo pedido deste cliente" cor="emerald">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                <div className="col-span-1 sm:col-span-12">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">Status no CRM</span>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Status no CRM">
                    {STATUS_CRM.map((s) => (
                      <button key={s.value} type="button" role="radio" aria-checked={c.status_crm === s.value} disabled={!podeEditar}
                        onClick={() => set("status_crm", c.status_crm === s.value ? null : s.value)}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${c.status_crm === s.value ? `${s.cor} shadow-sm ring-1 ring-black/10` : "border border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Field label="Vendedor" className="col-span-1 sm:col-span-6">
                  <VendedorSelect value={c.vendedor_id} disabled={!podeEditar} onChange={(id) => set("vendedor_id", id)} />
                </Field>
                <Field label="Forma de pagamento padrão" className="col-span-1 sm:col-span-6">
                  <select className="input" value={c.forma_pagamento_id ?? ""} disabled={!podeEditar} onChange={(e) => set("forma_pagamento_id", e.target.value || null)}>
                    <option value="">— escolher no pedido</option>
                    {formas.filter((f) => f.uso !== "pagar" && (f.ativo || f.id === c.forma_pagamento_id)).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </Field>
                <div className="col-span-1 sm:col-span-6">
                  {campo("condicao_pagamento", "Condição de pagamento", { span: 12, placeholder: "Ex.: 30 60, 3x, 15 +2x" })}
                  {podeEditar && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {CONDICOES.map((x) => (
                        <button key={x} type="button" onClick={() => set("condicao_pagamento", x)}
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.condicao_pagamento === x ? "bg-brand text-brand-fg" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{x}</button>
                      ))}
                    </div>
                  )}
                </div>
                {campo("desconto_padrao", "Lista de preço: desconto padrão (%)", { span: 3, tipo: "decimal", placeholder: "0" })}
                <Field label="Cliente desde" className="col-span-1 sm:col-span-3">
                  <div className="input flex items-center bg-slate-50 text-slate-600">{c.created_at ? dataBR(c.created_at) : "hoje"}</div>
                </Field>
              </div>
            </Secao>
            <Secao icone={Wallet} titulo="Financeiro" sub="Limite para vender a prazo" cor="amber">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                {campo("limite_credito", "Limite de crédito (R$)", { span: 4, tipo: "decimal", placeholder: "0,00" })}
                {emAberto != null && (() => {
                  const limite = numeroBR(c.limite_credito);
                  const livre = limite != null ? limite - emAberto : null;
                  return (
                    <div className="col-span-1 grid grid-cols-2 gap-3 sm:col-span-8">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-500">Em aberto</div>
                        <div className="num text-lg font-bold text-fg">{brl(emAberto)}</div>
                      </div>
                      <div className={`rounded-xl p-3 ${livre != null && livre < 0 ? "bg-red-50" : "bg-emerald-50"}`}>
                        <div className="text-xs font-semibold text-slate-500">Disponível</div>
                        <div className={`num text-lg font-bold ${livre != null && livre < 0 ? "text-red-700" : "text-emerald-700"}`}>{livre != null ? brl(livre) : "sem limite"}</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </Secao>
          </>)}

          {aba === "anexos" && (
            <Secao icone={Paperclip} titulo="Anexos" sub="Contrato social, documentos, comprovante de endereço, fotos do ponto" cor="slate">
              <Anexos entidade="cliente" id={c.id} titulo="Documentos do cliente" />
            </Secao>
          )}

          {aba === "observacoes" && (
            <Secao icone={StickyNote} titulo="Observações" cor="amber">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                {campo("observacoes", "Observações", { span: 12, tipo: "textarea", linhas: 5 })}
                {campo("preferencias", "Preferências (como gosta de ser atendido, forma de pagamento, linhas que trabalha)", { span: 12, tipo: "textarea", linhas: 4 })}
              </div>
            </Secao>
          )}

          {aba === "assinatura" && (
            <Secao icone={PenLine} titulo="Assinatura eletrônica da ficha" sub="O cliente confirma os dados e autoriza o uso (LGPD), com registro de data, hora e IP" cor="emerald">
              <AssinaturaFicha cliente={c} salvarAntes={salvarAntes} podeEditar={podeEditar} />
            </Secao>
          )}
        </div>

        {/* rodapé fixo */}
        <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-slate-200 bg-surface/95 px-3 py-3 backdrop-blur sm:rounded-b-2xl sm:px-6">
          <Button type="button" variant="ghost" disabled={i === 0} onClick={() => setAba(ABAS[i - 1].id)} aria-label="Aba anterior"><ArrowLeft size={16} /> <span className="hidden sm:inline">Anterior</span></Button>
          <span className="hidden text-xs text-slate-500 sm:inline">{i + 1} de {ABAS.length}</span>
          <Button type="button" variant="ghost" disabled={i === ABAS.length - 1} onClick={() => setAba(ABAS[i + 1].id)} aria-label="Próxima aba"><span className="hidden sm:inline">Próximo</span> <ArrowRight size={16} /></Button>
          <div className="flex-1" />
          {sujo && <span className="hidden text-xs font-semibold text-amber-700 sm:inline">Alterações não salvas</span>}
          <Button type="button" variant="secondary" onClick={fechar} className="hidden sm:inline-flex">Cancelar</Button>
          {podeEditar && (
            <Button type="button" disabled={salvando} onClick={salvar}>
              {deixaCliente ? <Truck size={16} /> : <Save size={16} />} {salvando ? "Salvando…" : deixaCliente ? <><span className="sm:hidden">Mover para fornecedores</span><span className="hidden sm:inline">Salvar e mover para fornecedores</span></> : "Salvar"}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
