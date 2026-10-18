// NF da venda emitida por outra empresa (ex.: a empresa ligada emitiu porque a unidade não tinha como emitir na hora).
// A chave de acesso de 44 números já traz o CNPJ de quem emitiu, a série, o número e o mês da nota.

export type DadosChave = { cnpj: string; serie: string; numero: string; mes: string };

/** Lê a chave da NF-e: UF (2) · AAMM (4) · CNPJ (14) · modelo (2) · série (3) · número (9) · … */
export function dadosDaChave(chave: string | null | undefined): DadosChave | null {
  const d = String(chave ?? "").replace(/\D/g, "");
  if (d.length !== 44) return null;
  return {
    cnpj: d.slice(6, 20), serie: String(Number(d.slice(22, 25))), numero: String(Number(d.slice(25, 34))),
    mes: `20${d.slice(2, 4)}-${d.slice(4, 6)}`,
  };
}

/** Rótulo curto da nota para listas e cartões: "NF 123 · Empresa". */
export function rotuloNfOutra(p: { nf_outra_numero?: string | null; nf_outra_empresa?: string | null }): string | null {
  if (!p.nf_outra_numero) return null;
  const empresa = String(p.nf_outra_empresa ?? "").trim().split(/\s+/)[0] ?? "";
  return `NF ${p.nf_outra_numero}${empresa ? ` · ${empresa}` : ""}`;
}
