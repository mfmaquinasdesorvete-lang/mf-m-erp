// Compliance fiscal: confere cadastros e documentos antes que virem problema na SEFAZ.
// Regras gerais de validação; não substituem a análise do contador.
import type { Cliente, Produto } from "./types";
import type { Unidade } from "./unidade";

export type Pendencia = { nivel: "erro" | "alerta"; texto: string };

const dig = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

export function cpfValido(v: string | null | undefined) {
  const c = dig(v);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

export function cnpjValido(v: string | null | undefined) {
  const c = dig(v);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = pesos.reduce((s, p, i) => s + p * Number(c[i]), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

export const documentoValido = (v: string | null | undefined) => (dig(v).length === 14 ? cnpjValido(v) : cpfValido(v));

/** Problemas do cadastro do cliente que impedem ou arriscam a NF-e. */
export function conferirCliente(c: Cliente | undefined): Pendencia[] {
  if (!c) return [{ nivel: "erro", texto: "Pedido sem cliente" }];
  const p: Pendencia[] = [];
  if (!documentoValido(c.cpf_cnpj)) p.push({ nivel: "erro", texto: `${c.nome}: CPF/CNPJ ${c.cpf_cnpj ? "inválido (dígito verificador não confere)" : "não informado"}` });
  if (c.tipo_pessoa === "PF" && dig(c.cpf_cnpj).length === 14) p.push({ nivel: "alerta", texto: `${c.nome}: cadastrado como pessoa física, mas o documento é CNPJ` });
  if (c.tipo_pessoa === "PJ" && Number(c.contribuinte_icms) === 1 && !dig(c.inscricao_estadual)) p.push({ nivel: "erro", texto: `${c.nome}: marcado como contribuinte de ICMS sem inscrição estadual` });
  const falta = [!c.logradouro && "rua", !c.numero && "número", !c.bairro && "bairro", !c.municipio && "cidade", dig(c.cep).length !== 8 && "CEP"].filter(Boolean);
  if (falta.length) p.push({ nivel: "erro", texto: `${c.nome}: endereço incompleto (${falta.join(", ")})` });
  if (c.uf && !UFS.includes(c.uf.toUpperCase())) p.push({ nivel: "erro", texto: `${c.nome}: UF "${c.uf}" inválida` });
  if (!c.uf) p.push({ nivel: "erro", texto: `${c.nome}: sem UF` });
  return p;
}

/** Problemas do produto para sair em NF-e. */
export function conferirProduto(p: Produto, fabricaNaUnidade = false): Pendencia[] {
  const r: Pendencia[] = [];
  if (dig(p.ncm).length !== 8) r.push({ nivel: "erro", texto: `${p.descricao}: NCM ${p.ncm ? `"${p.ncm}" inválido` : "não informado"} (precisa de 8 dígitos)` });
  if (p.cest && dig(p.cest).length !== 7) r.push({ nivel: "alerta", texto: `${p.descricao}: CEST "${p.cest}" deve ter 7 dígitos` });
  if (p.cfop && !/^[1-7]\d{3}$/.test(dig(p.cfop))) r.push({ nivel: "erro", texto: `${p.descricao}: CFOP próprio "${p.cfop}" inválido` });
  if (p.tipo === "maquina" && fabricaNaUnidade && (p as any).ipi_aliquota == null) r.push({ nivel: "alerta", texto: `${p.descricao}: máquina fabricada sem alíquota de IPI (confira a TIPI do NCM)` });
  if (Number(p.preco_venda) <= 0 && p.vendavel !== false && p.ativo) r.push({ nivel: "alerta", texto: `${p.descricao}: sem preço de venda` });
  return r;
}

/** Cadastro da unidade emitente. */
export function conferirUnidade(u: Unidade | undefined): Pendencia[] {
  if (!u) return [{ nivel: "erro", texto: "Unidade emitente não encontrada" }];
  const r: Pendencia[] = [];
  if (!cnpjValido(u.cnpj)) r.push({ nivel: "erro", texto: `${u.nome}: CNPJ ${u.cnpj ? "inválido" : "não informado"}` });
  if (!dig(u.inscricao_estadual)) r.push({ nivel: "erro", texto: `${u.nome}: sem inscrição estadual` });
  const falta = [!u.logradouro && "rua", !u.numero && "número", !u.bairro && "bairro", !u.municipio && "cidade", dig(u.cep).length !== 8 && "CEP", !u.uf && "UF"].filter(Boolean);
  if (falta.length) r.push({ nivel: "erro", texto: `${u.nome}: endereço incompleto (${falta.join(", ")})` });
  return r;
}

/** Conferência completa antes de emitir a NF-e de um pedido. */
export function conferirPedido(a: { cliente?: Cliente; unidade?: Unidade; produtos: Produto[]; itens: { produto_id: string; valor_unitario: number; quantidade: number }[]; aliquotasUf?: string[] }): Pendencia[] {
  const r = [...conferirUnidade(a.unidade), ...conferirCliente(a.cliente)];
  const vistos = new Set<string>();
  for (const i of a.itens) {
    const p = a.produtos.find((x) => x.id === i.produto_id);
    if (!p) { r.push({ nivel: "erro", texto: "Item sem produto cadastrado" }); continue; }
    if (Number(i.valor_unitario) <= 0) r.push({ nivel: "erro", texto: `${p.descricao}: valor unitário zerado` });
    if (vistos.has(p.id)) continue;
    vistos.add(p.id);
    r.push(...conferirProduto(p, !!a.unidade?.fabrica).filter((x) => !x.texto.includes("sem preço")));
  }
  const inter = a.cliente?.uf && a.unidade?.uf && a.cliente.uf.toUpperCase() !== a.unidade.uf.toUpperCase();
  const consumidorFinal = a.cliente && !(a.cliente.tipo_pessoa === "PJ" && Number(a.cliente.contribuinte_icms) === 1);
  if (inter && consumidorFinal && a.aliquotasUf && !a.aliquotasUf.includes(a.cliente!.uf!.toUpperCase())) {
    r.push({ nivel: "alerta", texto: `Venda para consumidor final em ${a.cliente!.uf}: cadastre a alíquota interna e o FCP dessa UF para o DIFAL` });
  }
  if (inter && a.cliente?.tipo_pessoa === "PJ" && Number(a.cliente.contribuinte_icms) === 9) {
    r.push({ nivel: "alerta", texto: `${a.cliente.nome}: empresa de outro estado marcada como não contribuinte. Se tiver IE ativa, a nota sai sem DIFAL e com a alíquota errada` });
  }
  return r;
}

/** Números de NF-e que ficaram para trás (por unidade e série): candidatos a inutilização. */
export function buracosNumeracao(notas: { unidade_id?: string | null; serie: string | null; numero: string | null }[]) {
  const grupos = new Map<string, number[]>();
  for (const n of notas) {
    if (!n.numero) continue;
    const k = `${n.unidade_id ?? ""}|${n.serie ?? "1"}`;
    grupos.set(k, [...(grupos.get(k) ?? []), Number(n.numero)]);
  }
  const out: { unidade_id: string; serie: string; faltando: number[] }[] = [];
  for (const [k, nums] of grupos) {
    const ord = [...new Set(nums)].sort((a, b) => a - b);
    const faltando: number[] = [];
    for (let i = 1; i < ord.length; i++) for (let x = ord[i - 1] + 1; x < ord[i] && faltando.length < 50; x++) faltando.push(x);
    if (faltando.length) { const [u, s] = k.split("|"); out.push({ unidade_id: u, serie: s, faltando }); }
  }
  return out;
}

// ---------------------------------------------------------------------
// Reforma tributária (EC 132/2023, LC 214/2025): IBS e CBS
// ---------------------------------------------------------------------
export const REFORMA = [
  { ano: "2026", texto: "Ano de teste: CBS 0,9% e IBS 0,1% destacados na NF-e, compensáveis com PIS/COFINS. Nada muda no valor pago se as obrigações acessórias forem cumpridas." },
  { ano: "2027", texto: "CBS passa a valer de verdade e PIS/COFINS acabam. IPI zera (exceto Zona Franca). Começa o Imposto Seletivo." },
  { ano: "2029–2032", texto: "ICMS e ISS caem aos poucos (10% ao ano) e o IBS sobe na mesma proporção." },
  { ano: "2033", texto: "Fim do ICMS e do ISS: só IBS + CBS (IVA dual), cobrados no destino, com crédito amplo." },
];
export const TESTE_2026 = { cbs: 0.9, ibs: 0.1 };
