// Cotação de frete por CEP e produtos (cotação rápida da equipe e "Calcule o frete" da loja). Funções puras, testadas
// no Vitest; as chamadas às transportadoras ficam em functions/frete-cotar.
// Cada item vira um volume: medidas da embalagem do produto (ou do próprio produto, ou o padrão das regras) e o peso do
// produto mais o da embalagem. O preço para o cliente segue as regras de frete (Configurações → Fretes → Regras da loja).

export type ProdutoFrete = {
  id: string; descricao: string; preco_venda?: number | string | null;
  peso_kg?: number | string | null; altura_cm?: number | string | null; largura_cm?: number | string | null; profundidade_cm?: number | string | null;
  embalagem?: { largura_cm?: number | string | null; altura_cm?: number | string | null; comprimento_cm?: number | string | null; peso_kg?: number | string | null } | null;
};

export type RegrasFrete = {
  /** "Calcule o frete" aparece na loja */
  loja_ligada: boolean;
  /** frete grátis (a opção mais barata) com os produtos a partir deste valor; null = nunca */
  gratis_acima: number | null;
  /** frete grátis (a opção mais barata) para estes estados */
  gratis_ufs: string[];
  /** acréscimo sobre o frete cobrado do cliente (embalagem, manuseio) */
  acrescimo_percentual: number;
  acrescimo_fixo: number;
  /** "Retirar na fábrica" grátis como opção */
  retirada: boolean;
  /** produto sem peso ou sem medidas: usa estes (null = fica "sob consulta") */
  peso_padrao_kg: number | null;
  medidas_padrao: { largura_cm: number; altura_cm: number; comprimento_cm: number } | null;
};

export const REGRAS_PADRAO: RegrasFrete = {
  loja_ligada: false, gratis_acima: null, gratis_ufs: [], acrescimo_percentual: 0, acrescimo_fixo: 0, retirada: true,
  peso_padrao_kg: null, medidas_padrao: null,
};

const n = (v: unknown) => { const x = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Regras gravadas (configuracoes.frete_regras) com o padrão no que faltar ou vier errado. */
export function lerRegras(x: unknown): RegrasFrete {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const m = (o.medidas_padrao ?? null) as Record<string, unknown> | null;
  const medidas = m && n(m.largura_cm) > 0 && n(m.altura_cm) > 0 && n(m.comprimento_cm) > 0
    ? { largura_cm: n(m.largura_cm), altura_cm: n(m.altura_cm), comprimento_cm: n(m.comprimento_cm) } : null;
  return {
    loja_ligada: o.loja_ligada === true,
    gratis_acima: n(o.gratis_acima) > 0 ? r2(n(o.gratis_acima)) : null,
    gratis_ufs: Array.isArray(o.gratis_ufs) ? o.gratis_ufs.map((u) => String(u).trim().toUpperCase()).filter((u) => /^[A-Z]{2}$/.test(u)) : [],
    acrescimo_percentual: Math.max(0, n(o.acrescimo_percentual)),
    acrescimo_fixo: Math.max(0, r2(n(o.acrescimo_fixo))),
    retirada: o.retirada !== false,
    peso_padrao_kg: n(o.peso_padrao_kg) > 0 ? n(o.peso_padrao_kg) : null,
    medidas_padrao: medidas,
  };
}

export type VolumeFrete = { quantidade: number; peso_kg: number; largura_cm: number; altura_cm: number; comprimento_cm: number };

/** Volumes dos itens e os produtos que ficaram sem peso ou medidas (nem padrão nas regras). */
export function volumesDosItens(itens: { produto: ProdutoFrete; quantidade: number }[], regras: RegrasFrete) {
  const volumes: VolumeFrete[] = [];
  const faltam: string[] = [];
  let valor = 0;
  for (const { produto: p, quantidade } of itens) {
    const qtd = Math.floor(n(quantidade));
    if (qtd <= 0) continue;
    valor += n(p.preco_venda) * qtd;
    const e = p.embalagem;
    const daEmbalagem = e && n(e.largura_cm) > 0 && n(e.altura_cm) > 0 && n(e.comprimento_cm) > 0
      ? { largura_cm: n(e.largura_cm), altura_cm: n(e.altura_cm), comprimento_cm: n(e.comprimento_cm) } : null;
    const doProduto = n(p.largura_cm) > 0 && n(p.altura_cm) > 0 && n(p.profundidade_cm) > 0
      ? { largura_cm: n(p.largura_cm), altura_cm: n(p.altura_cm), comprimento_cm: n(p.profundidade_cm) } : null;
    const medidas = daEmbalagem ?? doProduto ?? regras.medidas_padrao;
    const peso = n(p.peso_kg) > 0 ? n(p.peso_kg) + n(e?.peso_kg) : regras.peso_padrao_kg;
    if (!medidas || !peso) { faltam.push(p.descricao); continue; }
    volumes.push({ quantidade: qtd, peso_kg: Math.round(peso * 1000) / 1000, ...medidas });
  }
  const peso_total = Math.round(volumes.reduce((s, v) => s + v.quantidade * v.peso_kg, 0) * 1000) / 1000;
  return { volumes, faltam, peso_total, valor_produtos: r2(valor) };
}

export type OpcaoFrete = {
  id: string; transportadora: string; servico: string | null; prazo: number | null;
  /** o que a MF paga à transportadora */
  valor: number;
  /** o que o cliente paga (regras aplicadas) */
  valor_cliente: number;
  gratis?: boolean;
};

/** Ordena da mais barata e aplica as regras: acréscimo e frete grátis na mais barata. */
export function aplicarRegras(opcoes: Omit<OpcaoFrete, "valor_cliente">[], regras: RegrasFrete, ctx: { valor_produtos: number; uf: string | null }): OpcaoFrete[] {
  const ordem = [...opcoes].filter((o) => o.valor > 0).sort((a, b) => a.valor - b.valor || (a.prazo ?? 99) - (b.prazo ?? 99));
  const gratis = (regras.gratis_acima != null && ctx.valor_produtos >= regras.gratis_acima) || (!!ctx.uf && regras.gratis_ufs.includes(ctx.uf.toUpperCase()));
  return ordem.map((o, i) => {
    if (gratis && i === 0) return { ...o, valor_cliente: 0, gratis: true };
    return { ...o, valor_cliente: r2(o.valor * (1 + regras.acrescimo_percentual / 100) + regras.acrescimo_fixo) };
  });
}

/** Mensagem pronta para o WhatsApp do cliente. */
export function mensagemCotacao(d: { cep: string; cidade?: string | null; itens: { descricao: string; quantidade: number }[]; opcoes: OpcaoFrete[] }) {
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const cep = d.cep.replace(/\D/g, "").replace(/^(\d{5})(\d{3})$/, "$1-$2");
  return [
    `Frete para o CEP ${cep}${d.cidade ? ` (${d.cidade})` : ""}:`,
    ...d.itens.map((i) => `• ${i.quantidade} × ${i.descricao}`),
    "",
    ...d.opcoes.slice(0, 5).map((o) => `${o.transportadora}${o.servico ? ` ${o.servico}` : ""}: ${o.gratis || o.valor_cliente === 0 ? "grátis" : brl(o.valor_cliente)}${o.prazo != null ? ` · ${o.prazo} ${o.prazo === 1 ? "dia útil" : "dias úteis"}` : ""}`),
    "",
    "Valores válidos para hoje.",
  ].join("\n");
}
