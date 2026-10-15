import { describe, expect, it } from "vitest";
import { casarPagamentos, formatarCnpj, marketplaceDaNota, marketplaceDoExtrato, passaMarketplace } from "../marketplaces";
import { tipoLancamento } from "../extratoTipos";

describe("marketplaceDaNota", () => {
  it("pelo CNPJ do intermediador", () => {
    expect(marketplaceDaNota({ intermediador_cnpj: "03007331000141" })).toBe("mercado_livre");
    expect(marketplaceDaNota({ intermediador_cnpj: "03.361.252/0001-34" })).toBe("mercado_livre");
  });
  it("CNPJ desconhecido: pelo nome citado, senão outro", () => {
    expect(marketplaceDaNota({ intermediador_cnpj: "11222333000181", citado: "tiktok" })).toBe("tiktok");
    expect(marketplaceDaNota({ intermediador_cnpj: "11222333000181", citado: null })).toBe("outro");
  });
  it("sem intermediador: só pelo nome", () => {
    expect(marketplaceDaNota({ citado: "mercadolivre" })).toBe("mercado_livre");
    expect(marketplaceDaNota({ citado: "Shopee" })).toBe("shopee");
    expect(marketplaceDaNota({})).toBeNull();
  });
});

describe("marketplaceDoExtrato", () => {
  it("Pix e cartão", () => {
    expect(marketplaceDoExtrato("Pix BYTEDANCE BRASIL TECNOLOGIA LTDA · Enviado", -98.75)).toBe("tiktok");
    expect(marketplaceDoExtrato("MERCADOLIVRE*LOJAEXEMPLO · cartao", -120)).toBe("mercado_livre");
    expect(marketplaceDoExtrato("Pix PIX Marketplace · Enviado", -59)).toBe("outro");
    expect(marketplaceDoExtrato("SHOPEE *LOJA · cartao", -40)).toBe("shopee");
  });
  it("maquininha do Mercado Pago, entrada e AWS não contam", () => {
    expect(marketplaceDoExtrato("MP *RESTAURANTEEXEMPLO · cartao", -60)).toBeNull();
    expect(marketplaceDoExtrato("Pix BYTEDANCE · Recebido", 100)).toBeNull();
    expect(marketplaceDoExtrato("AMAZON WEB SERVICES · cartao", -300)).toBeNull();
    expect(marketplaceDoExtrato("AMAZON MARKETPLACE · cartao", -300)).toBe("amazon");
  });
  it("vira um tipo próprio no resumo do extrato", () => {
    expect(tipoLancamento("Pix BYTEDANCE BRASIL TECNOLOGIA LTDA · Enviado", -98.75)).toBe("marketplace");
    expect(tipoLancamento("MP *RESTAURANTEEXEMPLO · cartao", -60)).toBe("outra_saida");
    expect(tipoLancamento("Pix FORNECEDOR EXEMPLO LTDA · Enviado", -100)).toBe("pix_enviado");
  });
});

describe("casarPagamentos", () => {
  it("mesmo valor, nota até 10 dias depois, cada nota uma vez", () => {
    const pags = [{ id: "p1", data: "2026-07-01", valor: -221.45 }, { id: "p2", data: "2026-07-02", valor: -221.45 }, { id: "p3", data: "2026-07-01", valor: -50 }];
    const notas = [{ id: "n1", data: "2026-07-03", valor: 221.45 }, { id: "n2", data: "2026-08-30", valor: 221.45 }, { id: "n3", data: "2026-07-01", valor: 49 }];
    const r = casarPagamentos(pags, notas);
    expect(r.get("p1")).toBe("n1");
    expect(r.has("p2")).toBe(false);
    expect(r.has("p3")).toBe(false);
  });
});

describe("filtro e CNPJ", () => {
  it("passaMarketplace", () => {
    expect(passaMarketplace(undefined, "")).toBe(true);
    expect(passaMarketplace(undefined, "fora")).toBe(true);
    expect(passaMarketplace("tiktok", "qualquer")).toBe(true);
    expect(passaMarketplace("tiktok", "mercado_livre")).toBe(false);
  });
  it("formatarCnpj", () => expect(formatarCnpj("03007331000141")).toBe("03.007.331/0001-41"));
});
