// Máscaras dos cadastros: a tela mostra formatado, o banco guarda só os números.
import { digitos } from "./format";
import { cnpjValido, cpfValido } from "./compliance";

export type Mascara = "doc" | "cnpj" | "telefone" | "whatsapp" | "cep" | "email" | "uf" | "ie";

/** CPF enquanto tem até 11 dígitos, CNPJ a partir do 12º. */
export function formatarDoc(v: string | null | undefined, so?: "cnpj") {
  const d = digitos(v).slice(0, 14);
  if (so !== "cnpj" && d.length <= 11)
    return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

/** (48) 3375-5280, (48) 99999-1234, 0800 123 4567 ou +55 quando vier com DDI. */
export function formatarTelefone(v: string | null | undefined) {
  let d = digitos(v);
  if (d.startsWith("0800")) return d.slice(0, 11).replace(/^(\d{4})(\d{0,3})(\d{0,4}).*/, (_m, a, b, c) => [a, b, c].filter(Boolean).join(" "));
  let ddi = "";
  if (d.length > 11 && d.startsWith("55")) { ddi = "+55 "; d = d.slice(2); }
  d = d.slice(0, 11);
  if (d.length <= 2) return ddi + (d ? `(${d}` : "");
  const meio = d.length === 11 ? 5 : 4;
  const resto = d.slice(2);
  return `${ddi}(${d.slice(0, 2)}) ${resto.slice(0, meio)}${resto.length > meio ? "-" + resto.slice(meio) : ""}`;
}

export const formatarCep = (v: string | null | undefined) => digitos(v).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");

/** Valor mostrado no campo. */
export function mostrar(m: Mascara | undefined, v: unknown): string {
  const s = v == null ? "" : String(v);
  switch (m) {
    case "doc": return formatarDoc(s);
    case "cnpj": return formatarDoc(s, "cnpj");
    case "telefone": case "whatsapp": return formatarTelefone(s);
    case "cep": return formatarCep(s);
    default: return s;
  }
}

/** Valor gravado a partir do que foi digitado. */
export function gravar(m: Mascara | undefined, v: string): string {
  switch (m) {
    case "doc": case "cnpj": return digitos(v).slice(0, 14);
    case "telefone": case "whatsapp": return digitos(v).slice(0, 13);
    case "cep": return digitos(v).slice(0, 8);
    case "email": return v.trim().toLowerCase();
    case "uf": return v.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase();
    case "ie": return /^i/i.test(v.trim()) ? "ISENTO" : v.replace(/[^\dA-Za-z]/g, "").slice(0, 14).toUpperCase();
    default: return v;
  }
}

export const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/** Mensagem de erro do campo (vazio é aceito; obrigatoriedade é outra regra). */
export function erroCampo(m: Mascara | undefined, v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  if (!s) return null;
  const d = digitos(s);
  switch (m) {
    case "doc":
      if (d.length === 11) return cpfValido(d) ? null : "CPF inválido";
      if (d.length === 14) return cnpjValido(d) ? null : "CNPJ inválido";
      return "Digite o CPF (11 números) ou o CNPJ (14)";
    case "cnpj": return d.length === 14 && cnpjValido(d) ? null : "CNPJ inválido";
    case "telefone": case "whatsapp": return d.length >= 10 || d.startsWith("0800") ? null : "Telefone com DDD: (48) 3375-5280";
    case "cep": return d.length === 8 ? null : "CEP com 8 números";
    case "email": return emailValido(s) ? null : "E-mail inválido";
    case "uf": return /^[A-Z]{2}$/.test(s.toUpperCase()) ? null : "UF com 2 letras";
    default: return null;
  }
}
