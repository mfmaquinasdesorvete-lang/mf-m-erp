import { describe, expect, it } from "vitest";
import { MODELOS_REGRA, cargaEfetiva, exemploRegra, lerReducoes, oQueMuda, quandoVale, simularVenda, textoReducoes } from "../regrasTributacao";
import type { RegraTributaria } from "../../../supabase/functions/_shared/nfe-impostos";

const maquinasSc: RegraTributaria = {
  nome: "Máquinas SC", prioridade: 10, ativo: true, unidade_id: "sc", operacao: "venda", tipo_produto: "maquina", ncm_prefixo: "84186910",
  icms_cst: "20", icms_reducao_por_aliquota: { "17": 48.23, "12": 26.66, "7": 26.57 }, codigo_beneficio: "SC820028", icms_desonerar: true, icms_motivo_desoneracao: "9",
};
const unidadeSc = { id: "sc", uf: "SC", icms_cst: "00", icms_aliquota_interna: 17, icms_reducao_base: 0, difal_ativo: true };
const aliquotasUf = { SC: 17, PR: 19.5, BA: 20.5, SP: 18 };

describe("regras de tributação em português", () => {
  it("carga efetiva e exemplo em reais da redução por alíquota", () => {
    expect(cargaEfetiva(17, 48.23)).toBe(8.8);
    expect(cargaEfetiva(7, 26.57)).toBe(5.14);
    const ex = exemploRegra(maquinasSc, 10000);
    expect(ex.map((x) => x.aliquota)).toEqual([17, 12, 7]);
    expect(ex[0]).toMatchObject({ reducao: 48.23, base: 5177, icms: 880.09, carga: 8.8, semRegra: 1700, desonerado: 819.91 });
  });

  it("explica quando vale e o que muda", () => {
    expect(quandoVale(maquinasSc, () => "Matriz SC")).toBe("Nas vendas, de máquinas, da Matriz SC, com NCM começando em 84186910.");
    const muda = oQueMuda(maquinasSc).join(" ");
    expect(muda).toContain("CST 20: tributado com redução da base de cálculo");
    expect(muda).toContain("17% → reduz 48,23%, sobra 8,8%");
    expect(muda).toContain("SC820028");
    expect(muda).toContain("ICMS desonerado");
    expect(oQueMuda({ nome: "vazia", prioridade: 1 })).toEqual(["Ainda não troca nada: preencha o que a regra deve aplicar."]);
  });

  it("teste de venda: a regra certa e o ICMS estimado", () => {
    const base = { unidade: unidadeSc, operacao: "venda" as const, tipo: "maquina", ncm: "8418.69.10", importada: false, valor: 10000, aliquotasUf };
    const pr = simularVenda([maquinasSc], { ...base, ufDestino: "PR", contribuinte: true });
    expect(pr).toMatchObject({ interestadual: true, cst: "20", aliquota: 12, reducao: 26.66, base: 7334, icms: 880.08, cbenef: "SC820028", difal: null });
    expect(pr.regra?.nome).toBe("Máquinas SC");
    const ba = simularVenda([maquinasSc], { ...base, ufDestino: "BA", contribuinte: false });
    expect(ba).toMatchObject({ aliquota: 7, reducao: 26.57, icms: 514.01, difal: 1350 });
    const interna = simularVenda([maquinasSc], { ...base, ufDestino: "SC", contribuinte: true });
    expect(interna).toMatchObject({ interestadual: false, aliquota: 17, icms: 880.09, carga: 8.8 });
    // peça não combina com a regra de máquinas: vale o padrão da unidade
    const peca = simularVenda([maquinasSc], { ...base, tipo: "peca", ufDestino: "SC", contribuinte: true });
    expect(peca).toMatchObject({ regra: null, cst: "00", aliquota: 17, icms: 1700 });
    // remessa (conserto) não usa a regra de venda
    expect(simularVenda([maquinasSc], { ...base, operacao: "remessa", ufDestino: "PR", contribuinte: true }).regra).toBeNull();
  });

  it("modelos prontos: redução que dá a carga certa e texto de redução que vai e volta", () => {
    for (const m of MODELOS_REGRA) {
      if (!m.regra.reducoes) continue;
      const red = lerReducoes(m.regra.reducoes)!;
      for (const [a, r] of Object.entries(red)) expect([8.8, 5.14]).toContain(cargaEfetiva(Number(a), r));
      expect(lerReducoes(textoReducoes(red))).toEqual(red);
    }
    expect(new Set(MODELOS_REGRA.map((m) => m.id)).size).toBe(MODELOS_REGRA.length);
    expect(MODELOS_REGRA.every((m) => m.base.length > 10 && m.paraQue.length > 10)).toBe(true);
  });
});
