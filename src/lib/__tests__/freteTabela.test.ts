import { describe, expect, it } from "vitest";
import { acharDestino, aliquotaIcms, cotarPelaTabela, kgDaColuna, type DestinoTabela, type TabelaFrete } from "../../../supabase/functions/_shared/frete-tabela";

const tabela: TabelaFrete = {
  id: "t", nome: "São Miguel 2026", transportadora: "São Miguel", fator_cubagem: 300, ad_valorem_pct: 0.5, gris_pct: 0.3, gris_minimo: 5,
  pedagio_valor: 4, pedagio_fracao_kg: 100, taxa_despacho: 10, frete_minimo: 60, icms_por_fora: false, icms_interno_pct: 17,
};
const d = (x: Partial<DestinoTabela>): DestinoTabela => ({
  uf: "RS", cidade: null, cep_inicio: null, cep_fim: null, prazo_dias: 3, faixas: [], excedente_kg: null, frete_kg: null,
  frete_minimo: null, ad_valorem_pct: null, taxa_extra: null, ...x,
});
const rs = d({ faixas: [{ ate_kg: 10, valor: 50 }, { ate_kg: 30, valor: 80 }, { ate_kg: 50, valor: 100 }], excedente_kg: 1.5 });
const caxias = d({ cidade: "Caxias do Sul", prazo_dias: 2, faixas: [{ ate_kg: 10, valor: 40 }, { ate_kg: 30, valor: 70 }], excedente_kg: 1.2 });
const poa = d({ cep_inicio: "90000000", cep_fim: "91999999", prazo_dias: 1, frete_kg: 2, frete_minimo: 70 });
const volume = (peso: number, cm = 20) => ({ quantidade: 1, peso_kg: peso, largura_cm: cm, altura_cm: cm, comprimento_cm: cm });

describe("tabela de frete", () => {
  it("acha o destino pela faixa de CEP, pela cidade ou pelo estado", () => {
    expect(acharDestino([rs, caxias, poa], { cep: "90010000", cidade: "Porto Alegre", uf: "RS" })).toBe(poa);
    expect(acharDestino([rs, caxias, poa], { cep: "95010000", cidade: "Caxias do Sul", uf: "RS" })).toBe(caxias);
    expect(acharDestino([rs, caxias, poa], { cep: "98700000", cidade: "Ijuí", uf: "RS" })).toBe(rs);
    expect(acharDestino([rs], { cep: "01310100", cidade: "São Paulo", uf: "SP" })).toBeNull();
  });

  it("soma faixa de peso, % da nota, GRIS, pedágio e taxa", () => {
    const r = cotarPelaTabela(tabela, [rs], { volumes: [volume(25)], peso_kg: 25, valor_nf: 1000 }, { cep: "98700000", cidade: "Ijuí", uf: "RS" }, "SC")!;
    // 80 + 5 (0,5%) + 5 (GRIS 3 < mínimo 5) + 4 (pedágio 1 fração) + 10
    expect(r.valor).toBe(104);
    expect(r.prazo).toBe(3);
  });

  it("acima da última faixa usa o excedente; cubado maior que o real vale o cubado", () => {
    // 60×60×60 cm = 0,216 m³ × 300 = 64,8 kg taxados
    const r = cotarPelaTabela(tabela, [rs], { volumes: [volume(20, 60)], peso_kg: 20, valor_nf: 0 }, { cep: "98700000", cidade: null, uf: "RS" }, "SC")!;
    expect(r.peso_taxado).toBe(64.8);
    // 100 + 14,8 × 1,5 = 122,2 + GRIS 5 + pedágio 4 + 10
    expect(r.valor).toBe(141.2);
  });

  it("R$/kg direto, frete mínimo do destino e ICMS por fora", () => {
    const r = cotarPelaTabela({ ...tabela, icms_por_fora: true }, [poa], { volumes: [volume(5)], peso_kg: 5, valor_nf: 100 }, { cep: "90010000", cidade: "Porto Alegre", uf: "RS" }, "SC")!;
    // 10 + 0,5 + 5 + 4 + 10 = 29,5 → mínimo 70 → /0,88
    expect(r.valor).toBe(79.55);
    expect(aliquotaIcms("SC", "BA", 17)).toBe(7);
    expect(aliquotaIcms("SC", "SP", 17)).toBe(12);
    expect(aliquotaIcms("SC", "SC", 17)).toBe(17);
  });

  it("sem preço para o peso não cota", () => {
    const so10 = d({ faixas: [{ ate_kg: 10, valor: 50 }] });
    expect(cotarPelaTabela(tabela, [so10], { volumes: [volume(20)], peso_kg: 20, valor_nf: 0 }, { cep: "98700000", cidade: null, uf: "RS" }, "SC")).toBeNull();
  });

  it("lê o peso do título da coluna", () => {
    expect(kgDaColuna("até 10 kg")).toBe(10);
    expect(kgDaColuna("Até 100kg")).toBe(100);
    expect(kgDaColuna("31 a 50 kg")).toBe(50);
    expect(kgDaColuna("Excedente R$/kg")).toBeNull();
    expect(kgDaColuna("Prazo")).toBeNull();
  });
});

describe("planilha da tabela de frete", () => {
  it("lê o modelo com faixas, CEP e números em português", async () => {
    const { destinosDaPlanilha, numeroPlanilha } = await import("../../../supabase/functions/_shared/frete-tabela");
    expect(numeroPlanilha("R$ 1.234,56")).toBe(1234.56);
    expect(numeroPlanilha("0,5%")).toBe(0.5);
    const r = destinosDaPlanilha([
      { UF: "rs", Cidade: "Caxias do Sul", "Prazo (dias úteis)": 2, "até 10 kg": "40,00", "até 30 kg": 70, "Excedente R$/kg": "1,20" },
      { UF: "RS", "CEP inicial": "90000-000", "CEP final": "91999-999", "Frete R$/kg": 2, "Frete mínimo": 70 },
      { Cidade: "Sem estado", "até 10 kg": 10 },
      { UF: "SP", Cidade: "Campinas" },
    ]);
    expect(r.destinos[0]).toMatchObject({ uf: "RS", cidade: "Caxias do Sul", prazo_dias: 2, faixas: [{ ate_kg: 10, valor: 40 }, { ate_kg: 30, valor: 70 }], excedente_kg: 1.2 });
    expect(r.destinos[1]).toMatchObject({ cep_inicio: "90000000", cep_fim: "91999999", frete_kg: 2, frete_minimo: 70 });
    expect(r.erros).toEqual(["linha 4: falta a UF", "linha 5: sem faixa de peso nem R$/kg"]);
  });
});
