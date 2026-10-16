// Mercado Livre: o estoque e o preço que o ERP manda para cada anúncio.
// Arquivo puro (sem Deno e sem navegador): a função mercadolivre usa para enviar e o ERP usa para mostrar o que vai
// ser enviado (lista de anúncios e ficha do produto). Testes em src/lib/__tests__/mlAnuncios.test.ts.

/** Ajustes da conta do Mercado Livre (ml_contas). */
export type ConfigEnvio = {
  enviar_estoque: boolean;
  enviar_preco: boolean;
  /** % sobre o preço base (10 = +10%; −5 = −5%) */
  preco_ajuste?: number | string | null;
  /** unidades que ficam guardadas: não aparecem no anúncio */
  estoque_seguranca?: number | string | null;
  /** o anúncio mostra no máximo isso (vazio = sem limite) */
  estoque_maximo?: number | string | null;
  /** mudança de preço maior que isso (%) espera aprovação no ERP (0 ou vazio = sem trava) */
  trava_preco?: number | string | null;
};

/** O que o ERP sabe de um anúncio e do produto ligado (função ml_anuncios_dados do banco). */
export type AnuncioCalculo = {
  produto_id: string | null;
  produto_ativo?: boolean | null;
  kit?: boolean | null;
  /** exceções do anúncio: false = não mexe nisso neste anúncio */
  enviar_estoque?: boolean | null;
  enviar_preco?: boolean | null;
  /** estoque do produto na unidade da conta */
  saldo?: number | string | null;
  /** kit: cada peça (quantidade por kit) e o estoque dela na unidade */
  componentes?: { quantidade: number | string; saldo: number | string | null }[] | null;
  /** preço de venda do produto ou o preço dele na tabela escolhida */
  preco_base?: number | string | null;
  custo?: number | string | null;
  /** false = a tabela de preço escolhida está desativada */
  tabela_ok?: boolean | null;
  /** "fulfillment" = Full: o estoque fica no depósito do Mercado Livre */
  logistica?: string | null;
  ultimo_estoque?: number | string | null;
  ultimo_preco?: number | string | null;
  /** preço que estava no anúncio quando o ERP leu (vale como referência antes do primeiro envio) */
  preco_ml?: number | string | null;
  /** preço aprovado por alguém (passa pela trava) */
  preco_aprovado?: number | string | null;
};

export type PlanoEnvio = {
  /** quanto o anúncio deve mostrar (null = o ERP não cuida do estoque deste anúncio) */
  estoque: number | null;
  /** preço calculado (null = o ERP não cuida do preço ou o preço deu erro) */
  preco: number | null;
  /** o estoque do anúncio precisa mudar */
  enviarEstoque: boolean;
  /** o preço do anúncio precisa mudar (e pode: não está travado nem com erro) */
  enviarPreco: boolean;
  /** mudança acima da trava: espera aprovação */
  travado: { de: number; para: number; variacao: number } | null;
  erro: string | null;
  aviso: string | null;
};

export type Situacao = "sem_produto" | "desligado" | "aguardando" | "erro" | "na_fila" | "a_enviar" | "em_dia";

export const SITUACOES: { id: Situacao; nome: string; cor: string }[] = [
  { id: "em_dia", nome: "em dia", cor: "bg-emerald-100 text-emerald-800" },
  { id: "na_fila", nome: "na fila", cor: "bg-sky-100 text-sky-800" },
  { id: "a_enviar", nome: "a enviar", cor: "bg-sky-100 text-sky-800" },
  { id: "aguardando", nome: "aguardando aprovação", cor: "bg-purple-100 text-purple-800" },
  { id: "erro", nome: "erro", cor: "bg-red-100 text-red-800" },
  { id: "sem_produto", nome: "sem produto", cor: "bg-amber-100 text-amber-900" },
  { id: "desligado", nome: "envio desligado", cor: "bg-slate-100 text-slate-600" },
];

const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? 0 : Number(v));
const ou = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Arredonda para centavos como o banco (round(v, 2)): limpa o resto da conta do computador antes. */
export function centavos(v: number) {
  return Math.round(Number((v * 100).toFixed(6))) / 100;
}

/** 1234.5 → "R$ 1.234,50" (sem depender do idioma do servidor). */
export function reais(v: number) {
  const [inteiro, dec] = Math.abs(v).toFixed(2).split(".");
  return `${v < 0 ? "−" : ""}R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

/** Quantas unidades inteiras cabem (2,9999999 por conta do computador vira 3; 2,5 vira 2). */
const inteiras = (v: number) => Math.max(0, Math.floor(v + 1e-6));

/**
 * Estoque que o anúncio mostra: o da unidade da conta, menos o estoque de segurança (nunca negativo), até o limite.
 * Kit: o menor número de kits que dá para montar com as peças da unidade. Produto inativo: zero.
 */
export function estoqueDisponivel(p: {
  saldo?: number | string | null; kit?: boolean | null; componentes?: AnuncioCalculo["componentes"]; ativo?: boolean | null;
  seguranca?: number | string | null; maximo?: number | string | null;
}): number {
  if (p.ativo === false) return 0;
  let base: number;
  if (p.kit) {
    const pecas = (p.componentes ?? []).filter((c) => num(c.quantidade) > 0);
    base = pecas.length ? Math.min(...pecas.map((c) => inteiras(Math.max(0, num(c.saldo)) / num(c.quantidade)))) : 0;
  } else {
    base = inteiras(num(p.saldo));
  }
  let q = Math.max(0, base - inteiras(num(p.seguranca)));
  const max = ou(p.maximo);
  if (max !== null && max > 0) q = Math.min(q, inteiras(max));
  return q;
}

/**
 * Preço para o anúncio: preço base × (1 + ajuste), em centavos. Nunca zero e nunca abaixo do custo
 * (nesses casos volta o erro e o preço não é enviado).
 */
export function precoAEnviar(p: { base?: number | string | null; ajuste?: number | string | null; custo?: number | string | null; tabelaOk?: boolean | null }):
  { preco: number; erro: null } | { preco: number | null; erro: string } {
  if (p.tabelaOk === false) return { preco: null, erro: "a tabela de preço escolhida está desativada" };
  const base = num(p.base);
  if (!(base > 0)) return { preco: null, erro: "produto sem preço de venda no ERP" };
  const preco = centavos(base * (1 + num(p.ajuste) / 100));
  if (!(preco > 0)) return { preco: null, erro: "preço zerado (confira o ajuste em %)" };
  const custo = num(p.custo);
  if (custo > 0 && preco < custo) return { preco, erro: `preço abaixo do custo (${reais(preco)}; custo ${reais(custo)})` };
  return { preco, erro: null };
}

/** Variação entre dois preços, em % (uma casa). */
export function variacaoPreco(de: number, para: number) {
  return de > 0 ? Math.round((Math.abs(para - de) / de) * 1000) / 10 : 0;
}

/**
 * Trava de preço: mudança maior que a trava (%) em relação ao preço que está no anúncio espera aprovação.
 * Sem referência (anúncio nunca lido) ou trava zero, passa. Preço aprovado igual ao novo, passa.
 */
export function travaPreco(p: { novo: number; referencia?: number | string | null; trava?: number | string | null; aprovado?: number | string | null }) {
  const ref = num(p.referencia);
  const limite = num(p.trava);
  if (!(ref > 0)) return { travado: false, variacao: null as number | null };
  const variacao = variacaoPreco(ref, p.novo);
  const acima = Math.abs(p.novo - ref) / ref * 100 > limite + 1e-9;
  if (!(limite > 0) || !acima) return { travado: false, variacao };
  const aprovado = ou(p.aprovado);
  if (aprovado !== null && Math.abs(aprovado - p.novo) < 0.005) return { travado: false, variacao };
  return { travado: true, variacao };
}

const mesmoPreco = (a: number | null, b: number | null) => a !== null && b !== null && Math.abs(a - b) < 0.005;

/**
 * O que fazer com um anúncio agora: estoque e preço calculados, se mudam no anúncio, trava e erro.
 * forcar = manda mesmo que seja igual ao último enviado (botão "Sincronizar agora").
 */
export function planejarEnvio(cfg: ConfigEnvio, a: AnuncioCalculo, opcoes: { forcar?: boolean } = {}): PlanoEnvio {
  const plano: PlanoEnvio = { estoque: null, preco: null, enviarEstoque: false, enviarPreco: false, travado: null, erro: null, aviso: null };
  if (!a.produto_id) { plano.aviso = "ligue o anúncio a um produto do ERP"; return plano; }
  const forcar = !!opcoes.forcar;

  if (cfg.enviar_estoque && a.enviar_estoque !== false) {
    if (a.logistica === "fulfillment") {
      plano.aviso = "anúncio no Full: o estoque fica no depósito do Mercado Livre";
    } else {
      plano.estoque = estoqueDisponivel({
        saldo: a.saldo, kit: a.kit, componentes: a.componentes, ativo: a.produto_ativo,
        seguranca: cfg.estoque_seguranca, maximo: cfg.estoque_maximo,
      });
      const ultimo = ou(a.ultimo_estoque);
      plano.enviarEstoque = forcar || ultimo === null || ultimo !== plano.estoque;
    }
  }

  if (cfg.enviar_preco && a.enviar_preco !== false) {
    const p = precoAEnviar({ base: a.preco_base, ajuste: cfg.preco_ajuste, custo: a.custo, tabelaOk: a.tabela_ok });
    if (p.erro !== null) {
      plano.erro = p.erro;
    } else {
      plano.preco = p.preco;
      // referência: o último preço enviado; antes do primeiro envio, o preço que estava no anúncio
      const atual = ou(a.ultimo_preco) ?? ou(a.preco_ml);
      if (forcar || !mesmoPreco(atual, p.preco)) {
        const t = travaPreco({ novo: p.preco, referencia: atual, trava: cfg.trava_preco, aprovado: a.preco_aprovado });
        if (t.travado && atual !== null) plano.travado = { de: atual, para: p.preco, variacao: t.variacao ?? 0 };
        else plano.enviarPreco = true;
      }
    }
  }
  return plano;
}

/** Situação do anúncio para a lista: em dia, na fila, a enviar, aguardando aprovação, erro… */
export function situacaoAnuncio(
  cfg: ConfigEnvio | null,
  a: AnuncioCalculo & { na_fila?: boolean | null; erro?: string | null },
  plano: PlanoEnvio,
): Situacao {
  if (!a.produto_id) return "sem_produto";
  const estoqueLigado = !!cfg?.enviar_estoque && a.enviar_estoque !== false;
  const precoLigado = !!cfg?.enviar_preco && a.enviar_preco !== false;
  if (!estoqueLigado && !precoLigado) return "desligado";
  if (precoLigado && plano.travado) return "aguardando";
  if (plano.erro) return "erro";
  // na fila: o erro da última tentativa ainda aparece, mas vai tentar de novo
  if (a.na_fila) return "na_fila";
  if (a.erro) return "erro";
  if (plano.enviarEstoque || plano.enviarPreco) return "a_enviar";
  return "em_dia";
}

/** Linha de ml_contas → ajustes do envio. */
export function configDaConta(c: Partial<Record<keyof ConfigEnvio, unknown>> | null | undefined): ConfigEnvio {
  return {
    enviar_estoque: !!c?.enviar_estoque,
    enviar_preco: !!c?.enviar_preco,
    preco_ajuste: ou(c?.preco_ajuste) ?? 0,
    estoque_seguranca: ou(c?.estoque_seguranca) ?? 0,
    estoque_maximo: ou(c?.estoque_maximo),
    trava_preco: ou(c?.trava_preco) ?? 0,
  };
}

// ---------------------------------------------------------------------
// Anúncios da conta (busca na API do Mercado Livre)
// ---------------------------------------------------------------------
export type AnuncioML = {
  item_id: string; variation_id: string; sku: string | null; titulo: string;
  preco: number | null; estoque: number | null; status: string | null; logistica: string | null;
};

const texto = (v: unknown) => { const s = String(v ?? "").trim(); return s ? s : null; };
const skuDe = (x: any): string | null =>
  texto(x?.seller_custom_field) ?? texto((Array.isArray(x?.attributes) ? x.attributes : []).find((a: any) => a?.id === "SELLER_SKU")?.value_name);

/** Um anúncio do Mercado Livre (GET /items) → uma linha por anúncio, ou uma por variação. */
export function anunciosDoItem(item: any): AnuncioML[] {
  const id = String(item?.id ?? "");
  if (!/^[A-Z]{3}\d+$/.test(id)) return [];
  const titulo = String(item?.title ?? "").trim().slice(0, 300) || id;
  const base = { item_id: id, status: texto(item?.status), logistica: texto(item?.shipping?.logistic_type) };
  const variacoes: any[] = Array.isArray(item?.variations) ? item.variations : [];
  if (!variacoes.length) return [{ ...base, variation_id: "", titulo, sku: skuDe(item), preco: ou(item?.price), estoque: ou(item?.available_quantity) }];
  return variacoes.filter((v) => v?.id).map((v) => {
    const nomes = (Array.isArray(v?.attribute_combinations) ? v.attribute_combinations : []).map((c: any) => texto(c?.value_name)).filter(Boolean).join(" / ");
    return {
      ...base, variation_id: String(v.id), titulo: (nomes ? `${titulo} (${nomes})` : titulo).slice(0, 300),
      sku: skuDe(v), preco: ou(v?.price) ?? ou(item?.price), estoque: ou(v?.available_quantity),
    };
  });
}

/** Caminho da API para mudar um anúncio (ou uma variação dele). */
export const caminhoAnuncio = (itemId: string, variationId?: string | null) =>
  variationId ? `/items/${encodeURIComponent(itemId)}/variations/${encodeURIComponent(variationId)}` : `/items/${encodeURIComponent(itemId)}`;

/** Erro que não se resolve tentando de novo (dados do anúncio) x erro passageiro (Mercado Livre fora, internet). */
export const erroPassageiro = (status: number | null | undefined) => !status || status === 429 || status >= 500;

/** Espera antes de tentar de novo: 1, 2, 4, 8… minutos (no máximo 1 hora). */
export const esperaMinutos = (tentativas: number) => Math.min(60, 2 ** Math.max(0, tentativas - 1));
