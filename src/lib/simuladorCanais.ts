// Simulador de canais: para um produto e um preço, quanto fica para a MF em cada canal (loja e Mercado Livre),
// o preço mínimo (lucro zero), o preço para o lucro desejado e quanto dá para gastar em anúncio por venda.
// Cada desconto guarda a conta e de onde veio o número (fonte), para a tela mostrar "como foi calculado".
// Testes em src/lib/__tests__/simuladorCanais.test.ts.

export type Percentual = { nome: string; pct: number; fonte: string };
export type Canal = {
  id: string; nome: string;
  /** descontos em % do preço (imposto, taxa do cartão, tarifa do Mercado Livre) */
  percentuais: Percentual[];
  /** tarifa fixa por venda (Mercado Livre abaixo de R$ 79) */
  fixa?: { valor: (preco: number) => number; fonte: string };
  /** frete grátis que a MF paga a partir de `desde` */
  frete?: { valor: number; desde: number; fonte: string };
};
export type Linha = { nome: string; valor: number; conta: string; fonte: string };
export type Resultado = {
  preco: number; linhas: Linha[]; lucro: number; margemPct: number | null;
  precoMinimo: number | null; precoComLucro: number | null;
  /** publicidade: verba máxima por venda mantendo o lucro desejado, e o ACoS e o ROAS que isso dá */
  anuncio: { verba: number; acosPct: number | null; roas: number | null };
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const pctTxt = (p: number) => `${p.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const somaPct = (c: Canal) => c.percentuais.reduce((s, p) => s + p.pct, 0);

/** Quanto sai em cada desconto e quanto sobra, com a conta de cada um. */
export function calcularCanal(c: Canal, preco: number, custo: number, custoFonte: string, lucroDesejadoPct: number): Resultado {
  const linhas: Linha[] = c.percentuais.filter((p) => p.pct).map((p) => ({ nome: p.nome, valor: r2((preco * p.pct) / 100), conta: `${pctTxt(p.pct)} de ${r2(preco).toFixed(2)}`, fonte: p.fonte }));
  const fixa = c.fixa ? r2(c.fixa.valor(preco)) : 0;
  if (fixa) linhas.push({ nome: "Tarifa fixa por venda", valor: fixa, conta: "abaixo de R$ 79", fonte: c.fixa!.fonte });
  if (c.frete && preco >= c.frete.desde && c.frete.valor) linhas.push({ nome: "Frete grátis (a MF paga)", valor: r2(c.frete.valor), conta: `a partir de R$ ${c.frete.desde}`, fonte: c.frete.fonte });
  if (custo > 0) linhas.push({ nome: "Custo do produto", valor: r2(custo), conta: "por unidade", fonte: custoFonte });
  const lucro = r2(preco - linhas.reduce((s, l) => s + l.valor, 0));
  const margemPct = preco > 0 ? Math.round((lucro / preco) * 1000) / 10 : null;
  const verba = Math.max(0, r2(lucro - (preco * lucroDesejadoPct) / 100));
  return {
    preco: r2(preco), linhas, lucro, margemPct,
    precoMinimo: custo > 0 ? precoPara(c, custo, 0) : null,
    precoComLucro: custo > 0 ? precoPara(c, custo, lucroDesejadoPct) : null,
    anuncio: { verba, acosPct: preco > 0 && verba > 0 ? Math.round((verba / preco) * 1000) / 10 : null, roas: verba > 0 ? Math.round((preco / verba) * 10) / 10 : null },
  };
}

/**
 * Menor preço (em centavos) que deixa `lucroPct` do preço depois de todos os descontos:
 *   preço × (1 − soma dos % − lucro %) = custo + tarifa fixa (abaixo de 79) + frete grátis (a partir de 79).
 * Procura nas duas faixas (sem e com frete grátis) e fica com o menor que fecha a conta.
 */
export function precoPara(c: Canal, custo: number, lucroPct: number): number | null {
  const fator = 1 - (somaPct(c) + lucroPct) / 100;
  if (!(fator > 0.02) || !(custo > 0)) return null;
  const sobra = (p: number) => p * fator - custo - (c.fixa ? c.fixa.valor(p) : 0) - (c.frete && p >= c.frete.desde ? c.frete.valor : 0);
  const candidatos: number[] = [];
  const desde = c.frete?.valor ? c.frete.desde : Infinity;
  // faixa sem frete grátis: a tarifa fixa depende do preço, então repete a conta até parar de mudar
  let p = custo / fator;
  for (let i = 0; i < 8; i++) p = (custo + (c.fixa ? c.fixa.valor(p) : 0)) / fator;
  p = Math.ceil(p * 100 - 1e-6) / 100;
  if (p < desde && sobra(p) >= -0.005) candidatos.push(p);
  // faixa com frete grátis
  if (Number.isFinite(desde)) {
    let q = Math.max(desde, (custo + c.frete!.valor) / fator);
    q = Math.ceil(q * 100 - 1e-6) / 100;
    if (sobra(q) >= -0.005) candidatos.push(q);
  }
  return candidatos.length ? Math.min(...candidatos) : null;
}
