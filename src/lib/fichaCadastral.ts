// Cadastro completo do cliente: o que falta preencher (barra de "cadastro x% completo"), status no CRM,
// regime tributário e a assinatura eletrônica da ficha cadastral. Funções puras.
import { digitos } from "./format";

type ClienteFicha = {
  tipo_pessoa?: string | null; nome?: string | null; cpf_cnpj?: string | null; inscricao_estadual?: string | null; contribuinte_icms?: number | string | null;
  email?: string | null; whatsapp?: string | null; telefone?: string | null; cep?: string | null; logradouro?: string | null; numero?: string | null;
  bairro?: string | null; municipio?: string | null; uf?: string | null; data_nascimento?: string | null; status_crm?: string | null; vendedor_id?: string | null;
  cobranca_diferente?: boolean | null; cobranca_cep?: string | null; cobranca_logradouro?: string | null; cobranca_municipio?: string | null;
};

export type Aba = "gerais" | "contato" | "endereco" | "complementares" | "anexos" | "observacoes" | "assinatura";

/** Itens do cadastro que contam para o "completo", com a aba onde se preenche. */
export function pendenciasCadastro(c: ClienteFicha, assinado = false): { item: string; aba: Aba }[] {
  const doc = digitos(c.cpf_cnpj);
  const pj = c.tipo_pessoa === "PJ";
  const p: { item: string; aba: Aba }[] = [];
  if (!c.nome?.trim()) p.push({ item: pj ? "Razão social" : "Nome completo", aba: "gerais" });
  if (doc.length !== (pj ? 14 : 11)) p.push({ item: pj ? "CNPJ" : "CPF", aba: "gerais" });
  if (pj && Number(c.contribuinte_icms) === 1 && !c.inscricao_estadual?.trim()) p.push({ item: "Inscrição estadual", aba: "gerais" });
  if (!c.whatsapp && !c.telefone) p.push({ item: "WhatsApp ou telefone", aba: "contato" });
  if (!c.email?.trim()) p.push({ item: "E-mail", aba: "contato" });
  if (digitos(c.cep).length !== 8) p.push({ item: "CEP", aba: "endereco" });
  if (!c.logradouro?.trim() || !c.numero?.trim()) p.push({ item: "Rua e número", aba: "endereco" });
  if (!c.municipio?.trim() || !c.uf?.trim()) p.push({ item: "Cidade e UF", aba: "endereco" });
  if (c.cobranca_diferente && (!c.cobranca_logradouro?.trim() || !c.cobranca_municipio?.trim())) p.push({ item: "Endereço de cobrança", aba: "endereco" });
  if (!c.vendedor_id) p.push({ item: "Vendedor", aba: "complementares" });
  if (!assinado) p.push({ item: "Ficha assinada", aba: "assinatura" });
  return p;
}

/** 0 a 100. */
export function completude(c: ClienteFicha, assinado = false) {
  const total = 11 + (c.tipo_pessoa === "PJ" && Number(c.contribuinte_icms) === 1 ? 1 : 0) + (c.cobranca_diferente ? 1 : 0);
  return Math.round(((total - pendenciasCadastro(c, assinado).length) / total) * 100);
}

export const STATUS_CRM: { value: string; label: string; cor: string }[] = [
  { value: "lead", label: "Lead (primeiro contato)", cor: "bg-sky-100 text-sky-800" },
  { value: "negociacao", label: "Em negociação", cor: "bg-amber-100 text-amber-800" },
  { value: "cliente", label: "Cliente ativo", cor: "bg-emerald-100 text-emerald-800" },
  { value: "inativo", label: "Inativo", cor: "bg-slate-100 text-slate-600" },
];
export const rotuloCrm = (v: string | null | undefined) => STATUS_CRM.find((s) => s.value === v);

export const REGIMES = [
  { value: 1, label: "Simples Nacional" },
  { value: 2, label: "Simples Nacional (excesso de sublimite)" },
  { value: 3, label: "Regime normal (Lucro Presumido ou Real)" },
  { value: 4, label: "MEI" },
];

/** Iniciais para o avatar: "Gelato Nobre Ltda" → "GN". */
export function iniciais(nome: string | null | undefined) {
  const palavras = String(nome ?? "").replace(/\b(ltda|me|epp|eireli|s\/?a|mei)\b\.?/gi, "").trim().split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  if (!palavras.length) return "?";
  return (palavras[0][0] + (palavras.length > 1 ? palavras[palavras.length - 1][0] : palavras[0][1] ?? "")).toUpperCase();
}

/** Endereço do link que o cliente abre para conferir e assinar. */
export const linkFicha = (token: string, origem = typeof window !== "undefined" ? window.location.origin : "") => `${origem}/ficha/${token}`;

export function mensagemFicha(nome: string, empresa: string, link: string) {
  const primeiro = nome.trim().split(/\s+/)[0] || "";
  return `Olá${primeiro ? `, ${primeiro}` : ""}! Para concluir o seu cadastro na ${empresa}, confira os seus dados e assine a ficha cadastral por este link (leva 1 minuto): ${link}`;
}

/** Código de verificação em blocos, para ler e comparar: "9572 f403 59f9 …". */
export const hashLegivel = (h: string | null | undefined) => (h ? h.match(/.{1,4}/g)!.join(" ") : "");

/** Nome com sobrenome e CPF válido (mesmas regras do banco). */
export function erroAssinante(nome: string, cpf: string, cpfValido: (v: string) => boolean) {
  if (nome.trim().length < 5 || !/\s/.test(nome.trim())) return "Informe o nome completo de quem assina";
  if (digitos(cpf).length !== 11) return "Informe o CPF de quem assina (11 números)";
  if (!cpfValido(digitos(cpf))) return "CPF inválido: confira os números";
  return null;
}

/** Rótulos dos campos que o cliente pode corrigir pelo link. */
export const ROTULOS_FICHA: Record<string, string> = {
  email: "E-mail", email_nfe: "E-mail para nota fiscal", telefone: "Telefone", whatsapp: "WhatsApp", data_nascimento: "Data de nascimento",
  cep: "CEP", logradouro: "Endereço", numero: "Número", complemento: "Complemento", bairro: "Bairro", municipio: "Cidade", uf: "UF",
};

/** "15.000,50" → 15000.5; "1500" → 1500; vazio → null. */
export function numeroBR(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d,.-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return s && Number.isFinite(n) ? n : null;
}

/** Condições de pagamento mais usadas (como no Tiny). */
export const CONDICOES = ["À vista", "30", "30 60", "30 60 90", "3x", "15 +2x"];
