// Carta de correção (CC-e): texto pronto para trocar a transportadora de uma NF-e já autorizada.
// Função pura: a tela (FiscalAvancado) e o teste usam a mesma regra; as etiquetas leem o nome de volta
// (transportadoraDasCartas, em etiquetaDados.ts).

const docTransp = (d: string | null | undefined) => {
  const x = String(d ?? "").replace(/\D/g, "");
  return x.length === 14 ? x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : x;
};

/** Texto da CC-e que troca a transportadora: a que está na nota e a nova com CNPJ, IE e endereço (a CC-e aceita
 *  corrigir o transportador; não aceita valores, impostos, destinatário nem data). */
export function textoTrocaTransportadora(payload: any, t: { nome: string; cnpj?: string | null; inscricao_estadual?: string | null; logradouro?: string | null; numero?: string | null; bairro?: string | null; municipio?: string | null; uf?: string | null }) {
  const atual = payload?.nome_transportador
    ? `${payload.nome_transportador}${payload.cnpj_transportador ? `, CNPJ ${docTransp(payload.cnpj_transportador)}` : ""}`
    : "sem transportadora";
  const ender = [t.logradouro, t.numero, t.bairro].filter((x) => String(x ?? "").trim()).join(", ");
  const nova = [t.nome, t.cnpj && `CNPJ ${docTransp(t.cnpj)}`, t.inscricao_estadual && `IE ${t.inscricao_estadual}`, ender,
    t.municipio && `${t.municipio}${t.uf ? `/${String(t.uf).toUpperCase()}` : ""}`].filter(Boolean).join(", ");
  return `Transportadora: onde se lê "${atual}", leia-se "${nova}".`;
}

