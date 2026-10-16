// Cadastro de cliente novo passo a passo (estilo onboarding): uma pergunta por vez, com o que impede seguir (campo
// inválido) separado do que só deixa a ficha incompleta (aviso). O cadastro completo em abas continua para editar.
import { digitos } from "./format";
import { erroCampo, formatarCep, formatarDoc, formatarTelefone, type Mascara } from "./mascaras";
import { pendenciasCadastro, type Aba, type ClienteFicha } from "./fichaCadastral";
import { mesAnoCompra } from "../../supabase/functions/_shared/compra-maquina";

export type Passo = "quem" | "contato" | "endereco" | "venda" | "revisao";

export const PASSOS: { id: Passo; titulo: string; pergunta: string; dica: string }[] = [
  { id: "quem", titulo: "Quem é", pergunta: "Quem é o cliente?", dica: "Com o CNPJ, a razão social, o endereço e a inscrição estadual vêm da Receita." },
  { id: "contato", titulo: "Contato", pergunta: "Como falamos com ele?", dica: "O WhatsApp é o principal: avisos, propostas, cobrança e o link da ficha vão por ele." },
  { id: "endereco", titulo: "Endereço", pergunta: "Onde ele fica?", dica: "Digite o CEP: rua, bairro, cidade e UF vêm sozinhos. É o endereço da nota fiscal." },
  { id: "venda", titulo: "Venda", pergunta: "Como vendemos para ele?", dica: "Vendedor, forma de pagamento e tabela de preço já entram no próximo pedido." },
  { id: "revisao", titulo: "Revisão", pergunta: "Confira e cadastre", dica: "Toque numa parte para corrigir. O que faltar dá para completar depois." },
];

/** Campos com formato conferido em cada passo (os de cobrança só quando há endereço de cobrança). */
const CAMPOS: Record<Passo, [string, Mascara, string][]> = {
  quem: [["cpf_cnpj", "doc", "CPF/CNPJ"]],
  contato: [["whatsapp", "whatsapp", "WhatsApp"], ["telefone", "telefone", "Telefone"], ["telefone_adicional", "telefone", "Telefone adicional"], ["email", "email", "E-mail"], ["email_nfe", "email", "E-mail para NF-e"]],
  endereco: [["cep", "cep", "CEP"], ["uf", "uf", "UF"], ["cobranca_cep", "cep", "CEP de cobrança"], ["cobranca_uf", "uf", "UF de cobrança"]],
  venda: [],
  revisao: [],
};

const PASSO_DA_ABA: Record<Aba, Passo> = {
  gerais: "quem", contato: "contato", endereco: "endereco", complementares: "venda", anexos: "revisao", observacoes: "revisao", assinatura: "revisao",
};

type Cli = ClienteFicha & Record<string, unknown>;

/** O que impede seguir: campo obrigatório vazio ou com formato errado. */
export function errosDoPasso(passo: Passo, c: Cli): { campo: string; erro: string }[] {
  const out: { campo: string; erro: string }[] = [];
  if (passo === "quem" && !String(c.nome ?? "").trim()) out.push({ campo: "nome", erro: c.tipo_pessoa === "PJ" ? "Informe a razão social" : "Informe o nome do cliente" });
  for (const [campo, m, rotulo] of CAMPOS[passo]) {
    if (campo.startsWith("cobranca_") && !c.cobranca_diferente) continue;
    const e = erroCampo(m, c[campo]);
    if (e) out.push({ campo, erro: `${rotulo}: ${e}` });
  }
  return out;
}

/** O que só deixa a ficha incompleta (não impede seguir). A assinatura fica para depois do cadastro. */
export const faltasDoPasso = (passo: Passo, c: Cli) =>
  pendenciasCadastro(c).filter((p) => p.aba !== "assinatura" && PASSO_DA_ABA[p.aba] === passo).map((p) => p.item);

/** Último passo que dá para abrir: o primeiro com erro segura os seguintes. */
export function passoLiberado(c: Cli) {
  const i = PASSOS.findIndex((p) => errosDoPasso(p.id, c).length > 0);
  return i === -1 ? PASSOS.length - 1 : i;
}

/** O documento é para procurar repetido só quando está completo e certo. */
export function docParaConferir(v: string | null | undefined) {
  const d = digitos(v);
  return (d.length === 11 || d.length === 14) && !erroCampo("doc", d) ? d : null;
}

const junta = (...xs: unknown[]) => xs.map((x) => String(x ?? "").trim()).filter(Boolean).join(" · ");

/** As linhas do resumo de cada parte, na revisão. */
export function resumoDoPasso(passo: Passo, c: Cli, nomes: { vendedor?: string | null; forma?: string | null; tabela?: string | null; tipos?: string[] } = {}): string[] {
  const pj = c.tipo_pessoa === "PJ";
  switch (passo) {
    case "quem": return [
      junta(pj ? "Pessoa jurídica" : "Pessoa física", c.cpf_cnpj && formatarDoc(c.cpf_cnpj)),
      junta(c.nome, c.nome_fantasia && c.nome_fantasia !== c.nome ? `"${c.nome_fantasia}"` : ""),
      pj ? junta(Number(c.contribuinte_icms) === 1 ? "Contribuinte de ICMS" : Number(c.contribuinte_icms) === 2 ? "Isento de inscrição" : "Não contribuinte", c.inscricao_estadual ? `IE ${c.inscricao_estadual}` : "") : "",
    ].filter(Boolean);
    case "contato": return [junta(c.whatsapp ? `WhatsApp ${formatarTelefone(c.whatsapp)}` : "", c.telefone ? `Tel. ${formatarTelefone(c.telefone)}` : ""), junta(c.email)].filter(Boolean);
    case "endereco": return [
      junta([c.logradouro, c.numero].filter(Boolean).join(", "), c.complemento),
      junta(c.bairro, c.municipio && `${c.municipio}/${c.uf ?? ""}`, c.cep && `CEP ${formatarCep(c.cep)}`),
      c.cobranca_diferente ? `Cobrança em outro endereço${c.cobranca_municipio ? `: ${c.cobranca_municipio}/${c.cobranca_uf ?? ""}` : ""}` : "",
    ].filter(Boolean);
    case "venda": return [
      junta(nomes.vendedor ? `Vendedor: ${nomes.vendedor}` : "", nomes.forma, c.condicao_pagamento, nomes.tabela),
      nomes.tipos?.length ? `Também é: ${nomes.tipos.join(", ")}` : "",
      c.compra_maquina_em ? `Comprou máquina em ${mesAnoCompra(String(c.compra_maquina_em))}` : "",
    ].filter(Boolean);
    default: return [];
  }
}
