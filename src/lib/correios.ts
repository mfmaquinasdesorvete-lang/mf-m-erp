// Envio pelos Correios a partir do cadastro do cliente: monta a declaração de conteúdo no modelo dos Correios
// (remetente = unidade da MF, destinatário = cliente) ou, quando vai com nota fiscal, só a etiqueta com o nº da NF.
// Arquivo puro (testado).

export type Endereco = {
  nome: string; doc: string | null; logradouro: string | null; numero: string | null; complemento: string | null;
  bairro: string | null; municipio: string | null; uf: string | null; cep: string | null; telefone: string | null;
};
export type ItemDeclaracao = { conteudo: string; quantidade: number; valor: number };
export type Declaracao = {
  remetente: Endereco; destinatario: Endereco; itens: ItemDeclaracao[]; pesoKg: number | null;
  notaFiscal: string | null; cidadeData: string;
};

type ComEndereco = {
  logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null;
  municipio?: string | null; uf?: string | null; cep?: string | null; telefone?: string | null; whatsapp?: string | null;
};

const limpo = (s: string | null | undefined) => (s ?? "").trim() || null;

export function enderecoDaUnidade(u: ComEndereco & { razao_social?: string | null; nome: string; cnpj?: string | null }): Endereco {
  return {
    nome: limpo(u.razao_social) ?? u.nome, doc: limpo(u.cnpj), logradouro: limpo(u.logradouro), numero: limpo(u.numero),
    complemento: limpo(u.complemento), bairro: limpo(u.bairro), municipio: limpo(u.municipio), uf: limpo(u.uf)?.toUpperCase() ?? null,
    cep: limpo(u.cep), telefone: limpo(u.telefone) ?? limpo(u.whatsapp),
  };
}

export function enderecoDoCliente(c: ComEndereco & { nome: string; cpf_cnpj?: string | null }): Endereco {
  return {
    nome: c.nome.trim(), doc: limpo(c.cpf_cnpj), logradouro: limpo(c.logradouro), numero: limpo(c.numero),
    complemento: limpo(c.complemento), bairro: limpo(c.bairro), municipio: limpo(c.municipio), uf: limpo(c.uf)?.toUpperCase() ?? null,
    cep: limpo(c.cep), telefone: limpo(c.whatsapp) ?? limpo(c.telefone),
  };
}

/** "Rua X, 120 - sala 2 · Centro" */
export const linhaEndereco = (e: Endereco) =>
  [[e.logradouro, e.numero].filter(Boolean).join(", ") + (e.complemento ? ` - ${e.complemento}` : ""), e.bairro].filter(Boolean).join(" · ");

export const cepFormatado = (cep: string | null) => {
  const d = (cep ?? "").replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (cep ?? "");
};

/** O que falta para os Correios aceitarem (endereço completo de quem manda e de quem recebe, ao menos um item). */
export function pendenciasEnvio(d: Pick<Declaracao, "remetente" | "destinatario" | "itens" | "notaFiscal">): string[] {
  const p: string[] = [];
  for (const [quem, e] of [["remetente", d.remetente], ["destinatário", d.destinatario]] as const) {
    if ((e.cep ?? "").replace(/\D/g, "").length !== 8) p.push(`CEP do ${quem}`);
    if (!e.logradouro) p.push(`endereço do ${quem}`);
    if (!e.municipio || !e.uf) p.push(`cidade/UF do ${quem}`);
  }
  if (!d.notaFiscal && !d.itens.some((i) => i.conteudo.trim() && i.quantidade > 0)) p.push("ao menos um item com conteúdo e quantidade");
  return p;
}

export function totaisDeclaracao(itens: ItemDeclaracao[]) {
  const validos = itens.filter((i) => i.conteudo.trim());
  return {
    quantidade: validos.reduce((s, i) => s + (Number(i.quantidade) || 0), 0),
    valor: Math.round(validos.reduce((s, i) => s + (Number(i.quantidade) || 0) * (Number(i.valor) || 0), 0) * 100) / 100,
  };
}

/** Texto oficial da declaração dos Correios (quem assina declara não ser contribuinte ou estar dispensado da NF). */
export const TEXTO_DECLARACAO =
  "Declaro que não me enquadro no conceito de contribuinte previsto no art. 4º da Lei Complementar nº 87/1996, uma vez que não realizo, " +
  "com habitualidade ou em volume que caracterize intuito comercial, operações de circulação de mercadoria, ainda que se iniciem no exterior, " +
  "ou estou dispensado da emissão da nota fiscal por força da legislação tributária vigente, responsabilizando-me, nos termos da lei e a quem " +
  "de direito, por informações inverídicas. Declaro ainda que não estou postando conteúdo inflamável, explosivo, causador de combustão espontânea, " +
  "tóxico, corrosivo, gás ou qualquer outro conteúdo que constitua perigo, conforme o art. 13 da Lei Postal nº 6.538/78.";
