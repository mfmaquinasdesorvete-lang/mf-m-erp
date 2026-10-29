// Bloco de transporte da NF-e (Focus NFe): a transportadora escolhida no pedido vai para a nota.
// Sem dependência do Deno, para o teste do site (vitest) também rodar.
const digitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/** Transportadora do pedido no bloco de transporte da NF-e (28/10: ela escolhia no pedido e não saía na nota).
 * Só quando há frete (modalidade diferente de 9 "sem frete") e a transportadora tem nome. */
export function transportadorNfe(modalidade: number | null | undefined, t: any): Record<string, string> {
  if (!t?.nome || Number(modalidade ?? 9) === 9) return {};
  const doc = digitos(t.cnpj);
  const ie = digitos(t.inscricao_estadual);
  const endereco = [t.logradouro, t.numero, t.bairro].filter((x: unknown) => String(x ?? "").trim()).join(", ");
  return {
    nome_transportador: String(t.nome).slice(0, 60),
    ...(doc.length === 14 ? { cnpj_transportador: doc } : doc.length === 11 ? { cpf_transportador: doc } : {}),
    // a SEFAZ exige a UF junto com a IE do transportador (rejeição 559): sem UF no cadastro, a IE fica de fora
    ...(ie && t.uf ? { inscricao_estadual_transportador: ie } : {}),
    ...(endereco ? { endereco_transportador: endereco.slice(0, 60) } : {}),
    ...(t.municipio ? { municipio_transportador: String(t.municipio).slice(0, 60) } : {}),
    ...(t.uf ? { uf_transportador: String(t.uf).toUpperCase() } : {}),
  };
}
