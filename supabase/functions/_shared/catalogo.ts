// Lista de produtos no formato do Gerenciador de Comércio da Meta (catálogo do WhatsApp).
// Arquivo sem dependências: usado pela função catalogo-feed e pelo ERP (resumo em Configurações).
export type ProdutoLoja = {
  id: string; sku?: string | null; nome: string; descricao?: string | null; tipo: string; preco: number;
  foto?: string | null; disponibilidade: string; garantia_meses?: number | null; marca?: string | null;
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

export function descricaoCatalogo(p: ProdutoLoja) {
  const base = ((p.descricao ?? "").trim() || p.nome).replace(/\s*\n+\s*/g, " ");
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
