// Contatos do escritório de contabilidade (Painel do contador → Contabilidade): setores na ordem de uso, para que serve
// cada um, links de WhatsApp/telefone/e-mail e a busca "quem procurar para…". Os nomes ficam só no banco
// (tabela contabilidade_contatos); aqui só regras. Arquivo puro (testado).

export type SetorContabil =
  | "recepcao" | "contabil" | "fiscal" | "pessoal" | "societario" | "financeiro" | "certificado"
  | "relacionamento" | "comercial" | "apoio" | "portador" | "outro";
export type ContatoContabil = {
  id: string; setor: SetorContabil; nome: string; email: string | null; whatsapp: string | null; observacao: string | null; ordem: number; ativo: boolean;
};
export type DadosEscritorio = { razao?: string; telefone?: string; site?: string; instagram?: string; endereco?: string };

/** Setores na ordem da lista, com o que cada um resolve (as palavras alimentam a busca). */
export const SETORES: { id: SetorContabil; rotulo: string; paraQue: string; palavras: string }[] = [
  { id: "fiscal", rotulo: "Fiscal", paraQue: "Guias de ICMS, IPI, PIS e COFINS, notas fiscais, SPED e EFD, DIFAL, créditos",
    palavras: "imposto guia darf dare icms ipi pis cofins nota nf nfe sped efd difal credito apuracao gnre st" },
  { id: "pessoal", rotulo: "Pessoal", paraQue: "Folha, admissão, férias, rescisão, pró-labore, FGTS, INSS e eSocial",
    palavras: "folha salario holerite admissao demissao ferias rescisao pro labore fgts inss esocial funcionario ponto 13" },
  { id: "contabil", rotulo: "Contábil", paraQue: "Balancete, DRE, balanço, lançamentos, conciliação e IRPJ/CSLL",
    palavras: "balancete dre balanco lancamento conciliacao irpj csll lucro real lalur ecd ecf resultado" },
  { id: "societario", rotulo: "Societário", paraQue: "Contrato social, alterações, filial, certidões, alvarás e licenças",
    palavras: "contrato social alteracao filial cnpj certidao alvara licenca junta inscricao estadual municipal" },
  { id: "certificado", rotulo: "Certificado digital", paraQue: "Emitir e renovar o certificado A1/A3 das unidades",
    palavras: "certificado digital a1 a3 renovar renovacao ecnpj vencimento" },
  { id: "financeiro", rotulo: "Administrativo e financeiro", paraQue: "Honorários, boletos e notas do próprio escritório",
    palavras: "honorario boleto mensalidade pagamento escritorio cobranca" },
  { id: "recepcao", rotulo: "Recepção", paraQue: "Primeiro atendimento e quando não sabe a quem falar", palavras: "atendimento duvida geral" },
  { id: "relacionamento", rotulo: "Relacionamento", paraQue: "Elogios, reclamações e o que não andou", palavras: "reclamacao elogio atraso relacionamento" },
  { id: "apoio", rotulo: "Apoio administrativo", paraQue: "Apoio ao atendimento", palavras: "apoio" },
  { id: "portador", rotulo: "Portador", paraQue: "Levar e buscar documentos em papel", palavras: "documento papel entrega buscar levar portador motoboy" },
  { id: "comercial", rotulo: "Comercial", paraQue: "Contrato e serviços do escritório", palavras: "contrato servico proposta comercial" },
  { id: "outro", rotulo: "Outros", paraQue: "", palavras: "" },
];
export const ROTULO_SETOR = Object.fromEntries([...SETORES.map((s) => [s.id, s.rotulo]), ["escritorio", "Escritório"]]) as Record<SetorContabil | "escritorio", string>;

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const digitos = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");

/** Celular brasileiro (DDD + 9 dígitos começando por 9): tem WhatsApp; fixo vira só telefone. */
export function ehCelular(numero: string | null | undefined) {
  const d = digitos(numero).replace(/^55(?=\d{10,11}$)/, "");
  return d.length === 11 && d[2] === "9";
}
/** wa.me com o 55 do Brasil; null se não for celular. */
export function linkWhatsApp(numero: string | null | undefined) {
  if (!ehCelular(numero)) return null;
  return `https://wa.me/55${digitos(numero).replace(/^55(?=\d{11}$)/, "")}`;
}
export const linkTelefone = (numero: string | null | undefined) => (digitos(numero).length >= 10 ? `tel:+55${digitos(numero).replace(/^55(?=\d{10,11}$)/, "")}` : null);

/** Contatos ativos por setor, na ordem dos setores e, dentro, na ordem da lista. Setor sem ninguém some. */
export function porSetor(contatos: ContatoContabil[]) {
  return SETORES.map((s) => ({ ...s, contatos: contatos.filter((c) => c.ativo && c.setor === s.id).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)) }))
    .filter((s) => s.contatos.length);
}

/** "Quem procurar para…": setores pelo assunto (palavras), pelo nome do setor ou pelo nome/e-mail da pessoa. */
export function buscarSetores(contatos: ContatoContabil[], termo: string) {
  const t = sem(termo.trim());
  const grupos = porSetor(contatos);
  if (!t) return grupos;
  const palavras = t.split(/\s+/).filter((p) => p.length >= 2);
  return grupos.flatMap((g) => {
    const doSetor = palavras.some((p) => sem(`${g.rotulo} ${g.paraQue} ${g.palavras}`).includes(p));
    if (doSetor) return [g];
    const pessoas = g.contatos.filter((c) => palavras.every((p) => sem(`${c.nome} ${c.email ?? ""}`).includes(p)));
    return pessoas.length ? [{ ...g, contatos: pessoas }] : [];
  });
}

/** E-mails do campo "e-mail do contador" (pode ter mais de um, separados por vírgula ou ponto e vírgula), em minúsculas. */
export const emailsDaLista = (texto: string | null | undefined) => String(texto ?? "").split(/[;,]/).map((e) => e.trim().toLowerCase()).filter(Boolean);

/** Setor de quem recebe o pacote do mês (o e-mail do contador nas Configurações), se for de um contato. */
export function setorDoEmail(contatos: ContatoContabil[], email: string | null | undefined) {
  const e = String(email ?? "").trim().toLowerCase();
  return e ? contatos.find((c) => c.ativo && c.email?.toLowerCase() === e) ?? null : null;
}
