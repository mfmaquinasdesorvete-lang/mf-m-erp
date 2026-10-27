// Colunas que as listas de produtos baixam: todas menos os textos longos que só o formulário usa (anúncio,
// palavras-chave, meta-descrição, observações). O cadastro (Produtos.tsx) segue com "*", porque abre o formulário
// a partir da lista. Coluna nova que uma lista use: acrescente aqui.
export const SELECT_LISTA_PRODUTOS = [
  "id", "sku", "descricao", "tipo", "unidade", "ncm", "cest", "cfop", "origem", "icms_situacao", "preco_custo", "preco_venda",
  "estoque_atual", "estoque_minimo", "localizacao", "ativo", "created_at", "codigo_barras", "garantia_meses",
  "fornecedor_padrao_id", "peso_kg", "altura_cm", "largura_cm", "profundidade_cm", "no_catalogo", "descricao_catalogo",
  "foto_caminho", "ipi_aliquota", "id_externo", "marca", "categoria", "estoque_maximo", "sob_encomenda", "vendavel", "kit",
  "modelo", "codigo_fabricante", "codigos_alternativos", "fora_de_linha", "prazo_reposicao_dias", "compra_minima",
  "embalagem_id", "titulo_anuncio", "slug", "gtin_isento", "unificado_em", "unificado_quando", "margem_desejada",
  "subconjunto_estocado", "marcadores", "video_url", "linha_id", "origem_producao", "subtitulo", "agrupador",
  "produto_pai_id", "variacao",
].join(", ");
