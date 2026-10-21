// O que falta ou está errado no cadastro do cliente para vender, emitir a NF-e e entregar.
// "grave" trava a NF-e ou a entrega (sem documento, endereço sem CEP/número/cidade); o resto é aviso.
import { cnpjValido, cpfValido } from "./compliance";

export type Pendencia = { campo: string; texto: string; grave: boolean };
type ClienteBasico = {
  tipo_pessoa?: string | null; cpf_cnpj?: string | null; inscricao_estadual?: string | null; contribuinte_icms?: number | null;
  cep?: string | null; logradouro?: string | null; numero?: string | null; bairro?: string | null; municipio?: string | null; uf?: string | null;
  email?: string | null; telefone?: string | null; whatsapp?: string | null; receita_situacao?: string | null;
};

const vazio = (v: unknown) => !String(v ?? "").trim();
const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export function pendenciasDoCliente(c: ClienteBasico | null | undefined): Pendencia[] {
  if (!c) return [];
  const p: Pendencia[] = [];
  const doc = dig(c.cpf_cnpj);
  if (!doc) p.push({ campo: "cpf_cnpj", texto: "sem CPF/CNPJ", grave: true });
  else if (doc.length === 11 ? !cpfValido(doc) : doc.length === 14 ? !cnpjValido(doc) : true) p.push({ campo: "cpf_cnpj", texto: "CPF/CNPJ inválido", grave: true });
  if (c.receita_situacao && !/ativa/i.test(c.receita_situacao)) p.push({ campo: "cpf_cnpj", texto: `CNPJ ${c.receita_situacao.toLowerCase()} na Receita`, grave: true });
  const cep = dig(c.cep);
  if (!cep) p.push({ campo: "cep", texto: "sem CEP", grave: true });
  else if (cep.length !== 8) p.push({ campo: "cep", texto: "CEP incompleto", grave: true });
  if (vazio(c.logradouro)) p.push({ campo: "logradouro", texto: "sem rua", grave: true });
  if (vazio(c.numero)) p.push({ campo: "numero", texto: "sem número", grave: true });
  if (vazio(c.bairro)) p.push({ campo: "bairro", texto: "sem bairro", grave: false });
  if (vazio(c.municipio) || vazio(c.uf)) p.push({ campo: "municipio", texto: "sem cidade/UF", grave: true });
  if (doc.length === 14 && Number(c.contribuinte_icms) === 1 && vazio(c.inscricao_estadual)) p.push({ campo: "inscricao_estadual", texto: "contribuinte sem IE", grave: true });
  if (vazio(c.whatsapp) && vazio(c.telefone)) p.push({ campo: "whatsapp", texto: "sem telefone", grave: false });
  if (vazio(c.email)) p.push({ campo: "email", texto: "sem e-mail", grave: false });
  return p;
}

/** Crédito do cliente: o que está em aberto e o que ainda cabe no limite (null = sem limite cadastrado). */
export function creditoDoCliente(limite: number | null | undefined, abertas: { valor: number; vencimento: string }[], hoje: string) {
  const aberto = abertas.reduce((s, c) => s + Number(c.valor || 0), 0);
  const vencido = abertas.filter((c) => c.vencimento < hoje).reduce((s, c) => s + Number(c.valor || 0), 0);
  const lim = limite == null ? null : Number(limite);
  return { aberto, vencido, limite: lim, disponivel: lim == null ? null : Math.max(0, lim - aberto) };
}
