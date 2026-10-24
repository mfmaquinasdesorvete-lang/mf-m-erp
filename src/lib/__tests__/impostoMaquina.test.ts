// Previsão de impostos na venda de uma máquina: destinos típicos, DIFAL para consumidor de fora, crédito e IRPJ/CSLL.
// Dados inventados.
import { describe, expect, it } from "vitest";
import type { UnidadeFiscal } from "../../../supabase/functions/_shared/nfe-impostos";
import { cenariosDe, previsaoImpostos } from "../impostoMaquina";

const sc: UnidadeFiscal & { id: string } = {
  id: "u-sc", uf: "SC", fabrica: true, natureza_operacao: "Venda", cfop_venda_producao: "5101", cfop_venda_revenda: "5102",
  icms_cst: "00", icms_aliquota_interna: 17, icms_reducao_base: 0, pis_cst: "01", pis_aliquota: 1.65, cofins_cst: "01", cofins_aliquota: 7.6,
  pis_cofins_exclui_icms: true, ipi_cst: "50", ipi_enquadramento: "999", difal_ativo: true, ipi_cst_aliquota_zero: "51",
  transf_icms_cst: "41", transf_pis_cofins_cst: "08", transf_destacar_ipi: true,
};
const maquina = { id: "m1", sku: "MAQ", descricao: "Máquina de teste", ncm: "84186910", unidade: "UN", origem: 0, tipo: "maquina" };
const ufs = { SP: { aliquota_interna: 18, fcp: 0 }, BA: { aliquota_interna: 20.5, fcp: 2 }, SC: { aliquota_interna: 17, fcp: 0 } };

describe("previsão de impostos da máquina", () => {
  const linhas = previsaoImpostos({ produto: maquina, preco: 10000, custo: 4000, unidade: sc, ufs, regras: [] });
  const de = (id: string) => linhas.find((l) => l.cenario.id === id)!;

  it("seis destinos a partir de SC", () => {
    expect(cenariosDe("SC").map((c) => c.uf)).toEqual(["SC", "SC", "SP", "SP", "BA", "BA"]);
    expect(cenariosDe("SP")[2].uf).toBe("SC");
  });
  it("ICMS no estado 17%, Sul/Sudeste 12%, Nordeste 7%", () => {
    expect(de("dentro_empresa").icms).toBe(1700);
    expect(de("sul_empresa").icms).toBe(1200);
    expect(de("ne_empresa").icms).toBe(700);
  });
  it("DIFAL só para consumidor de outro estado (com FCP)", () => {
    expect(de("dentro_consumidor").difal).toBe(0);
    expect(de("sul_empresa").difal).toBe(0);
    expect(de("sul_consumidor").difal).toBe(600);          // 18% - 12%
    expect(de("ne_consumidor").difal).toBe(1550);          // 20,5% - 7% + 2% FCP
  });
  it("PIS/COFINS sem o ICMS na base; crédito, IRPJ/CSLL e o que sobra", () => {
    const l = de("dentro_empresa");
    expect(l.pis).toBe(136.95);                            // (10000 - 1700) × 1,65%
    expect(l.cofins).toBe(630.8);
    expect(l.credito).toBe(850);                           // 4000 × (12% + 9,25%)
    expect(l.impostoLiquido).toBe(r(1700 + 136.95 + 630.8 - 850));
    expect(l.irCsll).toBe(r((10000 - 4000 - l.impostoLiquido) * 0.24));
    expect(l.sobra).toBe(r(10000 - 4000 - l.impostoLiquido - l.irCsll));
  });
  it("sem preço não calcula", () => {
    expect(previsaoImpostos({ produto: maquina, preco: 0, custo: 100, unidade: sc, ufs, regras: [] })).toEqual([]);
  });
});

function r(v: number) { return Math.round(v * 100) / 100; }
