// Tabelas de preço (Marketplace, Revenda…): % sobre o preço de venda + arredondamento,
// com preço fixo opcional por produto. Espelha a função preco_tabela do banco.

export type TabelaPreco = {
  id: string; nome: string; canal: "marketplace" | "revenda" | "atacado" | "outro" | null;
  ajuste_percentual: number; arredondamento: "centavos" | "inteiro" | "final90"; observacoes: string | null; ativo: boolean;
};
export type PrecoFixo = { id: string; tabela_id: string; produto_id: string; preco: number };

export const CANAIS_TABELA: { value: NonNullable<TabelaPreco["canal"]>; label: string }[] = [
  { value: "marketplace", label: "Marketplace" }, { value: "revenda", label: "Revenda" },
  { value: "atacado", label: "Atacado" }, { value: "outro", label: "Outro" },
];
export const ARREDONDAMENTOS: { value: TabelaPreco["arredondamento"]; label: string }[] = [
  { value: "centavos", label: "Centavos (R$ 123,45)" }, { value: "inteiro", label: "Inteiro para cima (R$ 124,00)" },
  { value: "final90", label: "Final ,90 (R$ 123,90)" },
];

export function arredondar(v: number, modo: TabelaPreco["arredondamento"]) {
  if (modo === "inteiro") return Math.ceil(v - 1e-9);
  if (modo === "final90") return Math.round((Math.ceil(v + 0.1 - 1e-9) - 0.1) * 100) / 100;
  return Math.round(v * 100) / 100;
}

/** Preço do produto na tabela (sem tabela = preço de venda). fixo = veio de um preço digitado. */
export function precoNaTabela(
  tabela: TabelaPreco | null | undefined, produto: { id: string; preco_venda: number | string }, fixos: PrecoFixo[],
): { preco: number; fixo: boolean } {
  const base = Number(produto.preco_venda) || 0;
  if (!tabela) return { preco: base, fixo: false };
  const f = fixos.find((x) => x.tabela_id === tabela.id && x.produto_id === produto.id);
  if (f) return { preco: Number(f.preco), fixo: true };
  if (!tabela.ativo) return { preco: base, fixo: false };
  return { preco: arredondar(base * (1 + Number(tabela.ajuste_percentual) / 100), tabela.arredondamento), fixo: false };
}

export const ajusteTexto = (n: number) => (Number(n) === 0 ? "preço de venda" : `${Number(n) > 0 ? "+" : "−"}${Math.abs(Number(n)).toLocaleString("pt-BR")}%`);
