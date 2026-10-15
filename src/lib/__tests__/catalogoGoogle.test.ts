import { describe, expect, it } from "vitest";
import { dataEnvio, disponibilidadeGoogle, feedGoogleXml, gtinConfere, type ProdutoLoja } from "../../../supabase/functions/_shared/catalogo";

const base: ProdutoLoja = { id: "u1", sku: "MF-100", nome: "Máquina de sorvete", tipo: "maquina", preco: 12990.5, foto: "a.jpg", disponibilidade: "in stock" };
const opcoes = {
  marca: "MF Máquinas", linkLoja: "https://erp.exemplo.com.br/loja",
  linkProduto: (id: string) => `https://erp.exemplo.com.br/loja/${id}`,
  urlFoto: (c: string) => `https://fotos.exemplo.com.br/${c}`,
  hoje: new Date("2026-10-14T15:00:00Z"),
};
const itens = (x: string) => x.match(/<item>.*?<\/item>/g) ?? [];

describe("Google Shopping (feed do Merchant Center)", () => {
  it("confere o código de barras pelo dígito verificador", () => {
    expect(gtinConfere("7891000315507")).toBe(true);
    expect(gtinConfere("7891000315508")).toBe(false);
    expect(gtinConfere("123")).toBe(false);
    expect(gtinConfere("0000000000000")).toBe(false);
  });

  it("troca a disponibilidade para o vocabulário do Google", () => {
    expect(disponibilidadeGoogle("in stock")).toBe("in_stock");
    expect(disponibilidadeGoogle("available for order")).toBe("backorder");
    expect(disponibilidadeGoogle("out of stock")).toBe("out_of_stock");
  });

  it("calcula a data de envio de quem é sob encomenda", () => {
    expect(dataEnvio(opcoes.hoje, 30)).toBe("2026-11-13T00:00-0300");
    expect(dataEnvio(opcoes.hoje, 0)).toBe("2026-10-15T00:00-0300");
  });

  it("monta o item com SKU como identificador, preço em BRL, link da loja e foto", () => {
    const x = feedGoogleXml([{ ...base, titulo: "Máquina de Sorvete Expresso 3 Sabores", peso_kg: 95, categoria: "Máquinas", gtin: "7891000315507" }], opcoes);
    expect(x.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(x).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    const [i] = itens(x);
    expect(i).toContain("<g:id>MF-100</g:id>");
    expect(i).toContain("<g:title>Máquina de Sorvete Expresso 3 Sabores</g:title>");
    expect(i).toContain("<g:price>12990.50 BRL</g:price>");
    expect(i).toContain("<g:link>https://erp.exemplo.com.br/loja/u1</g:link>");
    expect(i).toContain("<g:image_link>https://fotos.exemplo.com.br/a.jpg</g:image_link>");
    expect(i).toContain("<g:availability>in_stock</g:availability>");
    expect(i).toContain("<g:gtin>7891000315507</g:gtin>");
    expect(i).toContain("<g:mpn>MF-100</g:mpn>");
    expect(i).toContain("<g:brand>MF Máquinas</g:brand>");
    expect(i).toContain("<g:product_type>Máquinas</g:product_type>");
    expect(i).toContain("<g:shipping_weight>95.00 kg</g:shipping_weight>");
    expect(i).not.toContain("availability_date");
    expect(i).not.toContain("identifier_exists");
  });

  it("sob encomenda leva a data de envio; código de barras errado não vai", () => {
    const [i] = itens(feedGoogleXml([{ ...base, disponibilidade: "available for order", prazo_dias: 20, gtin: "7891000315508" }], opcoes));
    expect(i).toContain("<g:availability>backorder</g:availability>");
    expect(i).toContain("<g:availability_date>2026-11-03T00:00-0300</g:availability_date>");
    expect(i).not.toContain("<g:gtin>");
  });

  it("sem SKU nem código de barras avisa que não há identificador", () => {
    const [i] = itens(feedGoogleXml([{ ...base, sku: null }], opcoes));
    expect(i).toContain("<g:id>u1</g:id>");
    expect(i).toContain("<g:identifier_exists>no</g:identifier_exists>");
  });

  it("escapa caracteres especiais e deixa de fora quem não tem foto ou preço", () => {
    const x = feedGoogleXml([
      { ...base, nome: 'Batedor 5" & copo <inox>', descricao: "Linha 1\nLinha 2" },
      { ...base, id: "u2", sku: "SEM-FOTO", foto: null },
      { ...base, id: "u3", sku: "SEM-PRECO", preco: 0 },
    ], opcoes);
    expect(itens(x)).toHaveLength(1);
    expect(x).toContain("<g:title>Batedor 5&quot; &amp; copo &lt;inox&gt;</g:title>");
    expect(x).toContain("<g:description>Linha 1 Linha 2.");
    expect(x).not.toContain("SEM-FOTO");
  });
});
