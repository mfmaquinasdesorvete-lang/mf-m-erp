// Compras feitas em marketplaces (Mercado Livre, TikTok Shop, Shopee, Amazon…), separadas do resto como o combustível.
// Na nota da loja vem o intermediador (grupo infIntermed da NF-e: CNPJ do marketplace); no extrato, o nome no Pix ou no cartão.
// "MP *LOJA" no cartão é a maquininha do Mercado Pago (restaurante, padaria…), não compra no Mercado Livre. Arquivo puro (testado).

export type Marketplace = "mercado_livre" | "tiktok" | "shopee" | "amazon" | "outro";

export const MARKETPLACES: { id: Marketplace; nome: string; barra: string; chip: string }[] = [
  { id: "mercado_livre", nome: "Mercado Livre", barra: "bg-yellow-400", chip: "bg-yellow-100 text-yellow-900 ring-yellow-300" },
  { id: "tiktok", nome: "TikTok Shop", barra: "bg-pink-500", chip: "bg-pink-100 text-pink-900 ring-pink-300" },
  { id: "shopee", nome: "Shopee", barra: "bg-orange-500", chip: "bg-orange-100 text-orange-900 ring-orange-300" },
  { id: "amazon", nome: "Amazon", barra: "bg-sky-500", chip: "bg-sky-100 text-sky-900 ring-sky-300" },
  { id: "outro", nome: "Outros marketplaces", barra: "bg-violet-500", chip: "bg-violet-100 text-violet-900 ring-violet-300" },
];
export const NOME_MARKETPLACE = Object.fromEntries(MARKETPLACES.map((m) => [m.id, m.nome])) as Record<Marketplace, string>;

/** CNPJ do intermediador na NF-e (grupo infIntermed) → marketplace. Os dois do Mercado Livre aparecem nas notas da MF. */
export const INTERMEDIADORES: Record<string, Marketplace> = {
  "03007331000141": "mercado_livre", // Ebazar.com.br (Mercado Livre)
  "03361252000134": "mercado_livre", // MercadoLivre.com Atividades de Internet
};

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const POR_NOME: [RegExp, Marketplace][] = [
  [/tik\s*tok|bytedance/, "tiktok"],
  [/shopee/, "shopee"],
  [/\bamazon\b(?!\s*(web|aws))|\bamzn\b/, "amazon"],
  [/mercado\s*livre|mercadolivre|ebazar|\bmeli\b/, "mercado_livre"],
  [/aliexpress|shein|\btemu\b|magalu|magazine\s*luiza|americanas/, "outro"],
];

const peloNome = (texto: unknown): Marketplace | null => {
  const t = sem(texto);
  return t ? POR_NOME.find(([re]) => re.test(t))?.[1] ?? null : null;
};

/** Marketplace da nota de compra: pelo CNPJ do intermediador; sem ele, pelo nome citado na nota. */
export function marketplaceDaNota(n: { intermediador_cnpj?: string | null; citado?: string | null }): Marketplace | null {
  const cnpj = String(n.intermediador_cnpj ?? "").replace(/\D/g, "");
  if (INTERMEDIADORES[cnpj]) return INTERMEDIADORES[cnpj];
  return peloNome(n.citado) ?? (cnpj ? "outro" : null);
}

/** Marketplace de uma saída do extrato (Pix ou cartão). "Pix Marketplace" sem o nome da loja fica em "outro". */
export function marketplaceDoExtrato(descricao: string | null | undefined, valor: number): Marketplace | null {
  if (!(valor < 0)) return null;
  const d = sem(descricao);
  if (/^mp\s*\*/.test(d)) return null; // maquininha do Mercado Pago
  return peloNome(d) ?? (/\bpix\s+marketplace\b/.test(d) ? "outro" : null);
}

/** Opções do filtro "Marketplace": qualquer um, cada um, ou fora de marketplace. */
export const OPCOES_FILTRO_MARKETPLACE = [
  { valor: "qualquer", rotulo: "Compras em marketplace" },
  ...MARKETPLACES.map((m) => ({ valor: m.id as string, rotulo: m.nome })),
  { valor: "fora", rotulo: "Fora de marketplace" },
];

export function passaMarketplace(m: Marketplace | undefined, filtro: string) {
  if (!filtro) return true;
  if (filtro === "fora") return !m;
  if (filtro === "qualquer") return !!m;
  return m === filtro;
}

type ComValor = { id: string; data: string; valor: number };
/** Liga cada pagamento do extrato à nota de mesmo valor emitida até 10 dias depois (ou 3 antes). Cada nota uma vez só. */
export function casarPagamentos(pagamentos: ComValor[], notas: ComValor[]): Map<string, string> {
  const usadas = new Set<string>();
  const r = new Map<string, string>();
  const dia = (s: string) => Date.parse(`${s.slice(0, 10)}T12:00:00Z`) / 86_400_000;
  for (const p of [...pagamentos].sort((a, b) => a.data.localeCompare(b.data))) {
    const alvo = Math.abs(Number(p.valor));
    const n = notas
      .filter((x) => !usadas.has(x.id) && Math.abs(Number(x.valor) - alvo) < 0.05)
      .map((x) => ({ x, dif: dia(x.data) - dia(p.data) }))
      .filter((c) => c.dif >= -3 && c.dif <= 10)
      .sort((a, b) => Math.abs(a.dif) - Math.abs(b.dif))[0];
    if (n) { usadas.add(n.x.id); r.set(p.id, n.x.id); }
  }
  return r;
}

export const formatarCnpj = (c: string | null | undefined) => {
  const d = String(c ?? "").replace(/\D/g, "");
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d;
};
