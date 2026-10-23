import { describe, expect, it } from "vitest";
import { corpoCalculoMe, faltaParaCotarMe, lerCalculoMe, mensagemMe } from "../../../supabase/functions/_shared/melhorenvio";

const ENVIO = {
  cep_origem: "88100-000", cep_destino: "01001-000", valor_mercadoria: 1000,
  volumes: [{ quantidade: 2, peso_kg: 5, largura_cm: 30, altura_cm: 20, comprimento_cm: 40 }, { quantidade: 1, peso_kg: 2, largura_cm: 10, altura_cm: 10, comprimento_cm: 10 }],
};

describe("Melhor Envio", () => {
  it("monta o corpo com cada volume como produto e o seguro dividido", () => {
    const c = corpoCalculoMe(ENVIO);
    expect(c.from.postal_code).toBe("88100000");
    expect(c.to.postal_code).toBe("01001000");
    expect(c.products).toEqual([
      { id: "1", width: 30, height: 20, length: 40, weight: 5, insurance_value: 333.33, quantity: 2 },
      { id: "2", width: 10, height: 10, length: 10, weight: 2, insurance_value: 333.33, quantity: 1 },
    ]);
  });

  it("diz o que falta para cotar", () => {
    expect(faltaParaCotarMe(ENVIO)).toEqual([]);
    expect(faltaParaCotarMe({ ...ENVIO, cep_destino: "123", volumes: [{ quantidade: 1, peso_kg: 3 }] })).toEqual(["CEP de destino", "peso e medidas de cada volume"]);
    expect(faltaParaCotarMe({ cep_origem: "88100000", cep_destino: "01001000", volumes: [] })).toEqual(["volumes"]);
  });

  it("lê os serviços, do mais barato ao mais caro, e separa os que não atendem", () => {
    const r = lerCalculoMe([
      { id: 2, name: "SEDEX", price: "80.10", custom_price: "75.90", delivery_time: 3, custom_delivery_time: 4, company: { id: 1, name: "Correios" } },
      { id: 3, name: ".Package", price: "62.00", delivery_time: 6, company: { id: 2, name: "Jadlog" } },
      { id: 17, name: "Mini Envios", error: "Dimensões excedem o limite", company: { id: 1, name: "Correios" } },
    ]);
    expect("erro" in r).toBe(false);
    if ("erro" in r) return;
    expect(r.servicos).toEqual([
      { servico_id: 3, servico: ".Package", empresa: "Jadlog", valor: 62, prazo: 6 },
      { servico_id: 2, servico: "SEDEX", empresa: "Correios", valor: 75.9, prazo: 4 },
    ]);
    expect(r.sem).toEqual([{ servico: "Mini Envios", empresa: "Correios", motivo: "Dimensões excedem o limite" }]);
  });

  it("erro do Melhor Envio vira mensagem", () => {
    expect(lerCalculoMe({ message: "Unauthenticated." })).toEqual({ erro: "Unauthenticated." });
    expect(mensagemMe({ message: "The given data was invalid.", errors: { "to.postal_code": ["CEP inválido"] } })).toBe("CEP inválido");
  });
});

describe("empresa do Melhor Envio no cadastro", () => {
  it("acha a marca pela 1ª palavra", async () => {
    const { combinaNome } = await import("../transportadoras");
    const t = (nome: string) => ({ nome, nome_fantasia: null });
    expect(combinaNome(t("Azul Cargo"), "Azul Cargo Express")).toBe(true);
    expect(combinaNome(t("Latam Airlines Brasil"), "LATAM Cargo")).toBe(true);
    expect(combinaNome(t("J&T Express"), "J&T Express")).toBe(true);
    expect(combinaNome(t("J3k Trasportes"), "J&T Express")).toBe(false);
    expect(combinaNome(t("Correios"), "Correios")).toBe(true);
    expect(combinaNome(t("Jamef"), "Jadlog")).toBe(false);
  });
});

describe("integração ligada no ERP", () => {
  it("Rodonaves pelo Olist Envios fica sem a API direta", async () => {
    const { integracaoApi } = await import("../transportadoras");
    expect(integracaoApi({ nome: "Rodonaves", nome_fantasia: null, site: null })).toBe("rodonaves");
    expect(integracaoApi({ nome: "Rodonaves", nome_fantasia: null, site: null, integracoes: ["SSW", "Olist Envios"] })).toBeNull();
    expect(integracaoApi({ nome: "Braspress", nome_fantasia: null, site: null })).toBe("braspress");
    expect(integracaoApi({ nome: "Melhor Envio", nome_fantasia: null, site: null })).toBe("melhorenvio");
  });
});
