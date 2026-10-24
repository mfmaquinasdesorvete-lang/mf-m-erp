// Lista de produtos no formato do Gerenciador de Comércio da Meta (catálogo do WhatsApp) e do Google Merchant Center
// (Google Shopping). Arquivo sem dependências: usado pela função catalogo-feed e pelo ERP (resumo em Configurações).
export type ProdutoLoja = {
  id: string; sku?: string | null; nome: string; descricao?: string | null; tipo: string; preco: number;
  /** linha abaixo do nome (ex.: Compatível com máquinas My Frost Top 200) */
  subtitulo?: string | null;
  foto?: string | null; disponibilidade: string; garantia_meses?: number | null; marca?: string | null;
  /** título do anúncio (cadastro → marketplace), código de barras, categoria, peso e prazo de envio de quem é sob encomenda */
  titulo?: string | null; gtin?: string | null; categoria?: string | null; peso_kg?: number | null; prazo_dias?: number | null;
};

const COLUNAS = ["id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand", "google_product_category"];
const CATEGORIA: Record<string, string> = {
  maquina: "Business & Industrial > Food Service > Food Service Equipment",
  peca: "Business & Industrial > Food Service > Food Service Equipment",
  acessorio: "Business & Industrial > Food Service",
  insumo: "Food, Beverages & Tobacco",
};

/** Por que um produto marcado não vai para o catálogo (vazio = vai). */
export function pendenciaCatalogo(p: Pick<ProdutoLoja, "foto" | "preco">): string {
  if (!p.foto) return "sem foto";
  if (!(Number(p.preco) > 0)) return "sem preço de venda";
  return "";
}

/** Título para o Google (até 150 letras): o título do anúncio ou o nome, com o subtítulo quando couber. */
export function tituloCatalogo(p: ProdutoLoja) {
  const base = ((p.titulo ?? "").trim() || p.nome).trim();
  const sub = (p.subtitulo ?? "").trim();
  const junto = sub && !base.toLowerCase().includes(sub.toLowerCase()) ? `${base} - ${sub}` : base;
  return (junto.length <= 150 ? junto : base).slice(0, 150);
}

export function descricaoCatalogo(p: ProdutoLoja) {
  const texto = ((p.descricao ?? "").trim() || p.nome).replace(/\s*\n+\s*/g, " ");
  const sub = (p.subtitulo ?? "").trim().replace(/[.!?]$/, "");
  const base = sub && !texto.toLowerCase().includes(sub.toLowerCase()) ? `${sub}. ${texto}` : texto;
  const comPonto = /[.!?]$/.test(base) ? base : `${base}.`;
  const garantia = p.tipo === "maquina" && p.garantia_meses && !/garantia/i.test(base) ? ` Garantia de ${p.garantia_meses} meses.` : "";
  return (comPonto + garantia).slice(0, 9999);
}

const celula = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

export function feedCsv(produtos: ProdutoLoja[], o: { marca: string; linkProduto: (id: string) => string; urlFoto: (caminho: string) => string }) {
  const linhas = produtos.filter((p) => !pendenciaCatalogo(p)).map((p) => [
    p.sku || p.id,
    p.nome.slice(0, 200),
    descricaoCatalogo(p),
    p.disponibilidade,
    "new",
    `${Number(p.preco).toFixed(2)} BRL`,
    o.linkProduto(p.id),
    /^https?:\/\//.test(p.foto!) ? p.foto! : o.urlFoto(p.foto!),
    p.marca || o.marca,
    CATEGORIA[p.tipo] ?? "",
  ].map(celula).join(","));
  return [COLUNAS.join(","), ...linhas].join("\n") + "\n";
}

// ---------------------------------------------------------------------
// Google Merchant Center (Google Shopping): XML no padrão RSS 2.0 com os campos "g:"
// ---------------------------------------------------------------------

/** Código de barras GTIN (8, 12, 13 ou 14 dígitos) com o dígito verificador certo. */
export function gtinConfere(codigo?: string | null): boolean {
  const d = String(codigo ?? "").replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(d.length) || /^0+$/.test(d)) return false;
  const soma = d.slice(0, -1).split("").reverse().reduce((t, x, i) => t + Number(x) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (soma % 10)) % 10 === Number(d[d.length - 1]);
}

/** Disponibilidade no vocabulário do Google (sob encomenda = "backorder", que exige a data de envio). */
export function disponibilidadeGoogle(d: string): "in_stock" | "out_of_stock" | "backorder" {
  return d === "in stock" ? "in_stock" : d === "available for order" ? "backorder" : "out_of_stock";
}

/** Data de envio prevista (hoje + prazo), no formato que o Google aceita. */
export function dataEnvio(hoje: Date, dias: number): string {
  const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + Math.max(1, Math.round(dias))));
  return `${d.toISOString().slice(0, 10)}T00:00-0300`;
}

// texto seguro dentro do XML (tira caracteres de controle que o XML não aceita)
const xml = (v: unknown) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const campo = (nome: string, v: unknown) => (v === null || v === undefined || v === "" ? "" : `<g:${nome}>${xml(v)}</g:${nome}>`);

export function feedGoogleXml(produtos: ProdutoLoja[], o: {
  marca: string; linkLoja: string; linkProduto: (id: string) => string; urlFoto: (caminho: string) => string; hoje?: Date;
}) {
  const hoje = o.hoje ?? new Date();
  const itens = produtos.filter((p) => !pendenciaCatalogo(p)).map((p) => {
    const disp = disponibilidadeGoogle(p.disponibilidade);
    const gtin = gtinConfere(p.gtin) ? String(p.gtin).replace(/\D/g, "") : "";
    const mpn = (p.sku ?? "").trim();
    return [
      "<item>",
      campo("id", p.sku || p.id),
      campo("title", tituloCatalogo(p)),
      campo("description", descricaoCatalogo(p).slice(0, 5000)),
      campo("link", o.linkProduto(p.id)),
      campo("image_link", /^https?:\/\//.test(p.foto!) ? p.foto : o.urlFoto(p.foto!)),
      campo("availability", disp),
      disp === "backorder" ? campo("availability_date", dataEnvio(hoje, p.prazo_dias ?? 30)) : "",
      campo("price", `${Number(p.preco).toFixed(2)} BRL`),
      campo("condition", "new"),
      campo("brand", p.marca || o.marca),
      campo("gtin", gtin),
      campo("mpn", mpn),
      !gtin && !mpn ? campo("identifier_exists", "no") : "",
      campo("product_type", p.categoria),
      Number(p.peso_kg) > 0 ? campo("shipping_weight", `${Number(p.peso_kg).toFixed(2)} kg`) : "",
      "</item>",
    ].filter(Boolean).join("");
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>`
    + `<title>${xml(o.marca)}</title><link>${xml(o.linkLoja)}</link><description>${xml(`Produtos de ${o.marca}`)}</description>\n`
    + itens.join("\n") + `\n</channel></rss>\n`;
}
