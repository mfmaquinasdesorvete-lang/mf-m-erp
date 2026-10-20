// Formação de preço: a mesma conta do banco (public.preco_sugerido), usada nas telas para mostrar
// o preço sugerido na hora e na prévia com dados de exemplo.
//   preço = custo / (1 - (margem + impostos + taxa + comissão + frete) / 100)
// A margem vem do produto, senão da categoria (ou da categoria-mãe "A > B" → "A"), senão do tipo.

export type ConfigPreco = {
  margens: Record<string, number>;
  margem_padrao: number;
  impostos_pct: number;
  taxa_pct: number;
  comissao_pct: number;
  frete_pct: number;
  arredondar: "centavos" | "inteiro" | "final90";
  tolerancia_pct: number;
  sugerir_reducao: boolean;
  /** Taxa de cada forma de pagamento (% da venda). O preço do cadastro já cobre a `taxa_pct`; nas outras formas o preço sobe
   *  só o necessário para a MF receber o mesmo líquido (ex.: no link a taxa é maior que na maquininha). */
  taxas_meio: Record<MeioPreco, number>;
};

export type MeioPreco = "pix" | "debito" | "credito" | "parcelado" | "link";
export const MEIOS_PRECO: { id: MeioPreco; rotulo: string; dica: string }[] = [
  { id: "pix", rotulo: "Pix / boleto / dinheiro", dica: "à vista, sem taxa de cartão" },
  { id: "debito", rotulo: "Maquininha · débito", dica: "" },
  { id: "credito", rotulo: "Maquininha · crédito à vista", dica: "" },
  { id: "parcelado", rotulo: "Maquininha · parcelado", dica: "com juros do parcelamento por conta da MF" },
  { id: "link", rotulo: "Link de pagamento", dica: "cartão pelo link (InfinitePay, Mercado Pago, OLIST)" },
];

export const PRECO_PADRAO: ConfigPreco = {
  margens: { maquina: 75, peca: 65, acessorio: 65, insumo: 65 },
  margem_padrao: 60, impostos_pct: 0, taxa_pct: 0, comissao_pct: 0, frete_pct: 0,
  arredondar: "centavos", tolerancia_pct: 5, sugerir_reducao: false,
  taxas_meio: { pix: 0, debito: 0, credito: 0, parcelado: 0, link: 0 },
};

const n = (v: unknown, padrao: number) => (v === "" || v == null || !Number.isFinite(Number(v)) ? padrao : Number(v));

/** Configuração salva (configuracoes.precificacao) completada com o padrão. */
export function configPreco(salva: Partial<ConfigPreco> | null | undefined): ConfigPreco {
  const s = salva ?? {};
  return {
    margens: { ...PRECO_PADRAO.margens, ...(s.margens ?? {}) },
    margem_padrao: n(s.margem_padrao, PRECO_PADRAO.margem_padrao),
    impostos_pct: n(s.impostos_pct, 0), taxa_pct: n(s.taxa_pct, 0), comissao_pct: n(s.comissao_pct, 0), frete_pct: n(s.frete_pct, 0),
    arredondar: s.arredondar === "inteiro" || s.arredondar === "final90" ? s.arredondar : "centavos",
    tolerancia_pct: n(s.tolerancia_pct, PRECO_PADRAO.tolerancia_pct),
    sugerir_reducao: !!s.sugerir_reducao,
    taxas_meio: Object.fromEntries(MEIOS_PRECO.map((m) => [m.id, n(s.taxas_meio?.[m.id], 0)])) as Record<MeioPreco, number>,
  };
}

function arredondar(v: number, modo: ConfigPreco["arredondar"]): number {
  if (modo === "inteiro") return Math.ceil(v - 1e-9);
  if (modo === "final90") return Math.round((Math.ceil(v + 0.1 - 1e-9) - 0.1) * 100) / 100;
  return Math.ceil(Math.round(v * 1000000) / 10000) / 100;   // como no banco: ceil(round(v * 100, 4)) / 100
}

/** Preço numa forma de pagamento: a MF recebe o mesmo líquido que no preço do cadastro (que já cobre a `taxa_pct`).
 *  Forma com taxa menor ou igual à embutida fica no preço do cadastro (não dá desconto sozinho). */
export function precoNoMeio(precoBase: number, meio: MeioPreco, cfg: ConfigPreco): number {
  const t = cfg.taxas_meio[meio] ?? 0;
  if (!(precoBase > 0) || t <= cfg.taxa_pct || t >= 95) return precoBase;
  return arredondar(precoBase * (1 - cfg.taxa_pct / 100) / (1 - t / 100), cfg.arredondar);
}

export const despesasPct = (c: ConfigPreco) => c.impostos_pct + c.taxa_pct + c.comissao_pct + c.frete_pct;

type ProdutoPreco = { tipo: string; categoria?: string | null; margem_desejada?: number | null };
type CategoriaPreco = { nome: string; margem_desejada?: number | null };

/** Margem desejada do produto e de onde ela veio. */
export function margemAlvo(p: ProdutoPreco, cfg: ConfigPreco, categorias: CategoriaPreco[]): { margem: number; origem: string } {
  if (p.margem_desejada != null && String(p.margem_desejada) !== "") return { margem: Number(p.margem_desejada), origem: "do produto" };
  const cat = String(p.categoria ?? "");
  const exata = categorias.find((c) => c.nome === cat && c.margem_desejada != null);
  if (exata) return { margem: Number(exata.margem_desejada), origem: `da categoria ${exata.nome}` };
  const mae = categorias.find((c) => c.nome === cat.split(" > ")[0] && c.margem_desejada != null);
  if (mae) return { margem: Number(mae.margem_desejada), origem: `da categoria ${mae.nome}` };
  if (cfg.margens[p.tipo] != null) return { margem: Number(cfg.margens[p.tipo]), origem: "do tipo" };
  return { margem: cfg.margem_padrao, origem: "padrão" };
}

/** Preço sugerido para um custo e uma margem (null sem custo ou se margem + despesas passar de 95%). */
export function precoSugerido(custo: number, margem: number, cfg: ConfigPreco): number | null {
  if (!(custo > 0)) return null;
  const den = 1 - (margem + despesasPct(cfg)) / 100;
  if (den < 0.05) return null;
  return arredondar(custo / den, cfg.arredondar);
}

/** Margem que sobra no preço, já descontadas as despesas (impostos, taxa, comissão, frete). */
export function margemLiquida(preco: number, custo: number, cfg: ConfigPreco): number | null {
  if (!(preco > 0) || !(custo > 0)) return null;
  return Math.round(((preco - custo) / preco * 100 - despesasPct(cfg)) * 10) / 10;
}

/** O preço atual saiu da faixa? (zerado, abaixo do sugerido além da tolerância ou, se ligado, acima) */
export function foraDaFaixa(precoAtual: number, sugerido: number, cfg: ConfigPreco) {
  return !(precoAtual > 0) || precoAtual < sugerido * (1 - cfg.tolerancia_pct / 100)
    || (cfg.sugerir_reducao && precoAtual > sugerido * (1 + cfg.tolerancia_pct / 100));
}
