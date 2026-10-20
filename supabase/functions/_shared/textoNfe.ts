// Texto das informações complementares da NF-e com chaves ({pedido}, {vendedor}, {forma_pagamento}, {telefone}, {cliente}):
// cada chave vira o valor do pedido; chave sem valor sai junto com o rótulo dela ("Vendedor: {vendedor}." some inteiro),
// para nunca ir "{vendedor}" escrito na nota.
export type CamposNfe = Partial<Record<"pedido" | "vendedor" | "forma_pagamento" | "telefone" | "cliente", string | number | null | undefined>>;

export function preencherTextoNfe(texto: string | null | undefined, campos: CamposNfe): string {
  if (!texto) return "";
  const valor = (k: string) => {
    const v = (campos as Record<string, unknown>)[k];
    return v == null ? "" : String(v).trim();
  };
  return texto
    // frase curta com a chave vazia ("Vendedor: {vendedor}.") sai inteira
    .replace(/[^.;\n{}]*\{([a-z_]+)\}[^.;\n{}]*[.;]?/g, (frase, k) => (valor(k) ? frase.replace(/\{([a-z_]+)\}/g, (_, c) => valor(c)) : ""))
    .replace(/\s{2,}/g, " ")
    .trim();
}
