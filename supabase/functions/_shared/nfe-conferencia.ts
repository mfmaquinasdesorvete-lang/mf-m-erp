// Conferência fiscal antes de emitir a NF-e e a rejeição da SEFAZ em português claro.
// Arquivo puro (sem dependências): usado pelas funções (bloqueio no servidor) e pelas telas (aviso antes de enviar).
// Bloquear aqui evita gastar um número de nota com uma rejeição certa.

export type Pendencia = { nivel: "erro" | "alerta"; texto: string };

/**
 * CST do ICMS que exigem o código de benefício fiscal (cBenef) por UF de quem emite.
 * SC: a SEFAZ/SC recusa (rejeição 930) os CST 20, 30, 40, 41, 50, 51 e 70 sem o código; o 90 passa sem ele.
 * Outras UFs não estão na lista: confirmar com o contador se a UF passar a exigir.
 */
export const CST_EXIGE_CBENEF: Record<string, string[]> = {
  SC: ["20", "30", "40", "41", "50", "51", "70"],
};

/** A UF de quem emite exige o cBenef neste CST? */
export function cbenefObrigatorio(uf: string | null | undefined, cst: string | null | undefined) {
  return (CST_EXIGE_CBENEF[String(uf ?? "").toUpperCase()] ?? []).includes(String(cst ?? ""));
}

type ItemNota = Record<string, unknown>;

/** Itens (número e CST) que vão sem o cBenef que a UF exige. */
export function itensSemCbenef(uf: string | null | undefined, itens: ItemNota[]) {
  return itens
    .map((i, k) => ({ numero: Number(i.numero_item ?? k + 1), cst: String(i.icms_situacao_tributaria ?? ""), cbenef: String(i.codigo_beneficio_fiscal ?? "").trim() }))
    .filter((i) => !i.cbenef && cbenefObrigatorio(uf, i.cst));
}

/** Pendência (erro) quando falta o cBenef; `comoResolver` diz onde configurar. */
export function pendenciaCbenef(uf: string | null | undefined, itens: ItemNota[], comoResolver: string): Pendencia | null {
  const faltam = itensSemCbenef(uf, itens);
  if (!faltam.length) return null;
  const csts = [...new Set(faltam.map((i) => i.cst))].join(", ");
  const quais = itens.length > 1 ? ` (item ${faltam.map((i) => i.numero).join(", ")})` : "";
  return {
    nivel: "erro",
    texto: `${String(uf).toUpperCase()} exige o código de benefício fiscal (cBenef) no ICMS CST ${csts}${quais}. Sem ele a SEFAZ rejeita a nota. ${comoResolver}`,
  };
}

// ---------------------------------------------------------------------
// Rejeição da SEFAZ explicada
// ---------------------------------------------------------------------
export type Explicacao = { titulo: string; oQueFazer: string; item: number | null; original: string };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const CASOS: { teste: RegExp; titulo: string; oQueFazer: string }[] = [
  { teste: /beneficio fiscal.*nao informado|nao informado.*beneficio fiscal|codigo de beneficio fiscal.*obrigatorio/,
    titulo: "Faltou o código de benefício fiscal (cBenef)",
    oQueFazer: "SC exige o cBenef quando o ICMS sai sem destaque (CST 40, 41, 50…). Na transferência: informe o código em Notas fiscais → Configurações da NF-e → Transferência (unidade que envia), ou escolha destacar o ICMS (CST 00). Nas outras notas: ponha o código na regra de tributação. Confirme o código com o contador e emita de novo." },
  { teste: /beneficio fiscal|cbenef/,
    titulo: "Código de benefício fiscal (cBenef) não aceito",
    oQueFazer: "A SEFAZ liga cada código a um CST. Confira o código com o contador (tabela de benefícios da SEFAZ do estado) e corrija na configuração da transferência ou na regra de tributação." },
  { teste: /duplicidade/,
    titulo: "A SEFAZ já tem uma nota com este número",
    oQueFazer: "Não emita de novo antes de conferir: veja em Notas fiscais se a nota já foi autorizada. Se não foi, confira a numeração na Focus." },
  { teste: /uso denegado|denegad/,
    titulo: "Uso denegado: cadastro irregular na SEFAZ",
    oQueFazer: "A inscrição estadual de quem emite ou de quem recebe está irregular. Confira a situação no SINTEGRA e fale com o contador. Nota denegada não pode ser reenviada com o mesmo número." },
  { teste: /(\bie\b|inscricao estadual).*(destinatario|remetente|emitente)|(destinatario|emitente).*(\bie\b|inscricao estadual)/,
    titulo: "Inscrição estadual não confere",
    oQueFazer: "Confira a inscrição estadual das unidades em Configurações → Unidades (ou do cliente no cadastro) e emita de novo." },
  { teste: /cfop/,
    titulo: "CFOP não aceito para esta operação",
    oQueFazer: "Confira o CFOP (dentro do estado 5xxx, para outro estado 6xxx; transferência 5151/6151 ou 5152/6152) e a regra de tributação que mudou o CFOP." },
  { teste: /ncm/,
    titulo: "NCM inválido",
    oQueFazer: "Corrija o NCM do produto (8 números, conforme a TIPI) no cadastro e emita de novo." },
  { teste: /ibs|cbs|ibscbs|classtrib|cclasstrib/,
    titulo: "Grupo IBS/CBS (reforma tributária) com problema",
    oQueFazer: "Confira o CST e a classificação (cClassTrib) do IBS/CBS em Notas fiscais → Configurações da NF-e (aba IBS/CBS ou Transferência)." },
  { teste: /certificado/,
    titulo: "Certificado digital com problema",
    oQueFazer: "O certificado da unidade pode estar vencido ou não cadastrado na Focus. Renove ou envie o certificado na Focus e emita de novo." },
  { teste: /total|somatorio|vnf|vprod|valor do icms difere|valor.*difere/,
    titulo: "Valores da nota não batem",
    oQueFazer: "A soma dos itens não confere com o total. Confira quantidade, custo e impostos dos itens; se continuar, mande a mensagem ao suporte." },
];

/** A mensagem de rejeição da SEFAZ em português claro, com o que fazer. Sem mensagem: null. */
export function explicarRejeicao(mensagem: string | null | undefined): Explicacao | null {
  const original = String(mensagem ?? "").trim();
  if (!original) return null;
  const t = semAcento(original);
  const item = Number(/nitem\s*:?\s*(\d+)/i.exec(original)?.[1]) || null;
  const caso = CASOS.find((c) => c.teste.test(t));
  return caso
    ? { titulo: caso.titulo, oQueFazer: caso.oQueFazer, item, original }
    : { titulo: "A SEFAZ recusou a nota", oQueFazer: "Leia o motivo abaixo, corrija o cadastro e emita de novo. Se não entender, mande a mensagem para o contador.", item, original };
}
