// Lê a planilha de produtos exportada do Tiny / Olist ERP (.xls, .xlsx ou .csv)
// e converte para os campos do ERP Line.
export type ProdutoImportado = {
  id_externo: string; sku: string; descricao: string; tipo: "maquina" | "peca" | "acessorio" | "insumo";
  unidade: string; ncm: string; cest: string; origem: number; preco_venda: number; preco_custo: number;
  estoque: number; estoque_minimo: number; estoque_maximo: number; localizacao: string; codigo_barras: string;
  marca: string; categoria: string; observacoes: string; descricao_catalogo: string; garantia_meses: number | null;
  peso_kg: number; altura_cm: number; largura_cm: number; profundidade_cm: number;
  sob_encomenda: boolean; vendavel: boolean; ativo: boolean; kit: boolean; foto: string; fornecedor: string; codigo_fornecedor: string;
};

export type Leitura = { itens: ProdutoImportado[]; ignorados: { descricao: string; motivo: string }[] };

const num = (v: unknown) => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
};
const txt = (v: unknown) => String(v ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const sim = (v: unknown) => /^s(im)?$/i.test(txt(v));

/** HTML da descrição complementar -> texto simples para o catálogo. */
export function htmlParaTexto(html: string) {
  if (!html) return "";
  const comQuebras = html.replace(/<\s*(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, "\n").replace(/<li[^>]*>/gi, "• ");
  const d = new DOMParser().parseFromString(comQuebras, "text/html");
  return (d.body.textContent ?? "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n").slice(0, 3000);
}

/** "30 dias", "3 meses", "1 ano", "365 dias" -> meses */
export function garantiaEmMeses(v: unknown): number | null {
  const s = txt(v).toLowerCase();
  const n = parseFloat(s.replace(",", "."));
  if (!s || !Number.isFinite(n)) return null;
  if (s.includes("ano")) return Math.round(n * 12);
  if (s.includes("dia")) return Math.max(1, Math.round(n / 30));
  return Math.round(n);
}

function unidadeMedida(v: unknown) {
  const u = txt(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!u || /^\d+$/.test(u) || u === "UNID" || u === "UND") return "UN";
  return u.slice(0, 6);
}

/** Tiny: S simples, K kit, V com variações, F fabricado, M matéria-prima */
function tipoProduto(tipoTiny: string, descricao: string, categoria: string): ProdutoImportado["tipo"] {
  if (tipoTiny === "F" || /^máquina|^my frost (a|top|slim|queen|prime|sb)\b/i.test(descricao) && /máquina/i.test(categoria)) return "maquina";
  if (tipoTiny === "M") return "insumo";
  if (/\bbatedor\b|acess[oó]rio/i.test(descricao + " " + categoria)) return "acessorio";
  return "peca";
}

export function converterLinhas(linhas: Record<string, unknown>[]): Leitura {
  const itens: ProdutoImportado[] = [];
  const ignorados: Leitura["ignorados"] = [];
  for (const r of linhas) {
    const descricao = txt(r["Descrição"]);
    if (!descricao) continue;
    const tipoTiny = txt(r["Tipo do produto"]).toUpperCase();
    // O "pai" de variações não é um item físico: cada variação entra como produto próprio
    if (tipoTiny === "V") { ignorados.push({ descricao, motivo: "agrupador de variações (as variações entram uma a uma)" }); continue; }
    const categoria = txt(r["Categoria"]);
    const pesoBruto = num(r["Peso bruto (Kg)"]), pesoLiq = num(r["Peso líquido (Kg)"]);
    itens.push({
      id_externo: txt(r["ID"]),
      sku: txt(r["Código (SKU)"]),
      descricao,
      tipo: tipoProduto(tipoTiny, descricao, categoria),
      unidade: unidadeMedida(r["Unidade"]),
      ncm: txt(r["Classificação fiscal"]).replace(/\D/g, ""),
      cest: txt(r["CEST"]).replace(/\D/g, ""),
      origem: Math.min(8, Math.max(0, parseInt(txt(r["Origem"])) || 0)),
      preco_venda: num(r["Preço"]),
      preco_custo: num(r["Preço de custo"]),
      estoque: num(r["Estoque"]),
      estoque_minimo: num(r["Estoque mínimo"]),
      estoque_maximo: num(r["Estoque máximo"]),
      localizacao: txt(r["Localização"]),
      codigo_barras: txt(r["GTIN/EAN"]).replace(/\D/g, ""),
      marca: txt(r["Marca"]),
      categoria,
      observacoes: txt(r["Observações"]),
      descricao_catalogo: htmlParaTexto(String(r["Descrição complementar"] ?? "")),
      garantia_meses: garantiaEmMeses(r["Garantia"]),
      peso_kg: pesoBruto || pesoLiq,
      altura_cm: num(r["Altura embalagem"]),
      largura_cm: num(r["Largura embalagem"]),
      profundidade_cm: num(r["Comprimento embalagem"]),
      sob_encomenda: sim(r["Sob encomenda"]),
      kit: tipoTiny === "K",
      vendavel: txt(r["Permitir inclusão nas vendas"]) ? sim(r["Permitir inclusão nas vendas"]) : true,
      ativo: !/inativo|exclu/i.test(txt(r["Situação"])),
      foto: /^https?:\/\//.test(txt(r["URL imagem 1"])) ? txt(r["URL imagem 1"]) : "",
      fornecedor: txt(r["Fornecedor"]),
      codigo_fornecedor: txt(r["Cód do Fornecedor"]),
    });
  }
  return { itens, ignorados };
}

/** Abre o arquivo (a biblioteca de planilhas só é baixada quando alguém importa). */
export async function lerPlanilha(arquivo: File): Promise<Leitura> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array", codepage: 1252 });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });
  if (!linhas.length || !("Descrição" in linhas[0])) throw new Error("Não parece a planilha de produtos do Tiny/Olist (falta a coluna Descrição).");
  return converterLinhas(linhas);
}
