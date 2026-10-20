import { describe, expect, it } from "vitest";
import { PRECO_PADRAO, configPreco, despesasPct, foraDaFaixa, margemAlvo, margemLiquida, precoNoMeio, precoSugerido, type ConfigPreco } from "../precificacao";

const cfg = (c: Partial<ConfigPreco> = {}): ConfigPreco => ({ ...PRECO_PADRAO, ...c });

describe("configPreco", () => {
  it("sem configuração salva usa o padrão", () => {
    expect(configPreco(null)).toEqual(PRECO_PADRAO);
  });

  it("completa o que falta, aceita número em texto e ignora valor inválido", () => {
    const c = configPreco({
      margens: { maquina: 70 } as Record<string, number>, impostos_pct: "12" as unknown as number, taxa_pct: "" as unknown as number,
      comissao_pct: "abc" as unknown as number, arredondar: "qualquer" as ConfigPreco["arredondar"], sugerir_reducao: 1 as unknown as boolean,
    });
    expect(c.margens).toEqual({ maquina: 70, peca: 65, acessorio: 65, insumo: 65 });
    expect(c.impostos_pct).toBe(12);
    expect(c.taxa_pct).toBe(0);
    expect(c.comissao_pct).toBe(0);
    expect(c.arredondar).toBe("centavos");
    expect(c.sugerir_reducao).toBe(true);
    expect(despesasPct(configPreco({ impostos_pct: 9.25, taxa_pct: 3, comissao_pct: 5, frete_pct: 2 }))).toBeCloseTo(19.25, 10);
  });
});

describe("margemAlvo (produto > categoria > categoria-mãe > tipo > padrão)", () => {
  const categorias = [{ nome: "Peças", margem_desejada: 55 }, { nome: "Peças > Vedação", margem_desejada: 70 }, { nome: "Insumos", margem_desejada: null }];

  it("margem do próprio produto vence, mesmo zero", () => {
    expect(margemAlvo({ tipo: "peca", categoria: "Peças", margem_desejada: 40 }, cfg(), categorias)).toEqual({ margem: 40, origem: "do produto" });
    expect(margemAlvo({ tipo: "peca", categoria: "Peças", margem_desejada: 0 }, cfg(), categorias).margem).toBe(0);
  });

  it("categoria exata, depois a categoria-mãe", () => {
    expect(margemAlvo({ tipo: "peca", categoria: "Peças > Vedação" }, cfg(), categorias)).toEqual({ margem: 70, origem: "da categoria Peças > Vedação" });
    expect(margemAlvo({ tipo: "peca", categoria: "Peças > Motor" }, cfg(), categorias)).toEqual({ margem: 55, origem: "da categoria Peças" });
  });

  it("categoria sem margem cai no tipo; tipo desconhecido cai no padrão", () => {
    expect(margemAlvo({ tipo: "insumo", categoria: "Insumos" }, cfg(), categorias)).toEqual({ margem: 65, origem: "do tipo" });
    expect(margemAlvo({ tipo: "maquina", categoria: null }, cfg(), [])).toEqual({ margem: 75, origem: "do tipo" });
    expect(margemAlvo({ tipo: "servico" }, cfg(), [])).toEqual({ margem: 60, origem: "padrão" });
  });
});

describe("precoSugerido = custo / (1 − (margem + despesas)/100)", () => {
  it("arredonda para cima no centavo, como o banco", () => {
    expect(precoSugerido(1000, 75, cfg())).toBe(4000);
    expect(precoSugerido(1234.56, 65, cfg())).toBe(3527.32); // 3.527,3142… → 3.527,32
  });

  it("conta exata não sobe um centavo por erro de ponto flutuante", () => {
    // 70 / 0.35 dá 200.00000000000003 em ponto flutuante; o banco (numeric) dá 200,00
    expect(precoSugerido(70, 65, cfg())).toBe(200);
  });

  it("despesas entram no divisor", () => {
    // 1 − (50 + 9,25 + 3 + 5 + 2,75)/100 = 0,30 → 300 / 0,30
    expect(precoSugerido(300, 50, cfg({ impostos_pct: 9.25, taxa_pct: 3, comissao_pct: 5, frete_pct: 2.75 }))).toBe(1000);
  });

  it("arredondamento inteiro e final ,90", () => {
    expect(precoSugerido(1234.56, 65, cfg({ arredondar: "inteiro" }))).toBe(3528);
    expect(precoSugerido(1000, 75, cfg({ arredondar: "inteiro" }))).toBe(4000);
    expect(precoSugerido(1234.56, 65, cfg({ arredondar: "final90" }))).toBe(3527.9);
    expect(precoSugerido(1000, 75, cfg({ arredondar: "final90" }))).toBe(4000.9);
    expect(precoSugerido(35.96, 60, cfg({ arredondar: "final90" }))).toBe(89.9); // 89,90 exato fica 89,90
  });

  it("sem custo ou com margem + despesas acima de 95% não sugere", () => {
    expect(precoSugerido(0, 60, cfg())).toBeNull();
    expect(precoSugerido(-10, 60, cfg())).toBeNull();
    expect(precoSugerido(Number.NaN, 60, cfg())).toBeNull();
    expect(precoSugerido(100, 91, cfg({ impostos_pct: 5 }))).toBeNull();
    expect(precoSugerido(100, 90, cfg({ impostos_pct: 5 }))).toBe(2000); // exatamente 95% ainda vale
  });
});

describe("margemLiquida e foraDaFaixa", () => {
  it("margem que sobra no preço, já sem as despesas, com 1 casa", () => {
    expect(margemLiquida(200, 70, cfg())).toBe(65);
    expect(margemLiquida(3527.32, 1234.56, cfg({ impostos_pct: 9.25 }))).toBe(55.8);
    expect(margemLiquida(0, 70, cfg())).toBeNull();
    expect(margemLiquida(200, 0, cfg())).toBeNull();
  });

  it("preço zerado ou abaixo do sugerido além da tolerância (5%) sai da faixa", () => {
    expect(foraDaFaixa(0, 200, cfg())).toBe(true);
    expect(foraDaFaixa(189.99, 200, cfg())).toBe(true);
    expect(foraDaFaixa(190, 200, cfg())).toBe(false);
    expect(foraDaFaixa(260, 200, cfg())).toBe(false);
  });

  it("acima do sugerido só sai da faixa com sugerir_reducao ligado", () => {
    expect(foraDaFaixa(210, 200, cfg({ sugerir_reducao: true }))).toBe(false);
    expect(foraDaFaixa(210.01, 200, cfg({ sugerir_reducao: true }))).toBe(true);
  });
});

describe("precoNoMeio (taxa diferente na maquininha e no link)", () => {
  const c = cfg({ taxa_pct: 0, taxas_meio: { pix: 0, debito: 1.5, credito: 3.5, parcelado: 9, link: 5 } });

  it("Pix fica no preço do cadastro; cartão e link sobem para a MF receber o mesmo", () => {
    expect(precoNoMeio(1000, "pix", c)).toBe(1000);
    expect(precoNoMeio(1000, "link", c)).toBe(1052.64);          // 1000 / 0,95 = 1052,63… → para cima
    expect(precoNoMeio(1000, "credito", c)).toBe(1036.27);
    expect(precoNoMeio(1000, "link", c) * 0.95).toBeGreaterThanOrEqual(1000);
  });

  it("taxa já embutida no preço: só cobra a diferença; menor que a embutida não dá desconto", () => {
    const e = cfg({ taxa_pct: 3.5, taxas_meio: { pix: 0, debito: 1.5, credito: 3.5, parcelado: 9, link: 5 } });
    expect(precoNoMeio(1000, "credito", e)).toBe(1000);
    expect(precoNoMeio(1000, "pix", e)).toBe(1000);
    expect(precoNoMeio(1000, "link", e)).toBe(1015.79);           // 1000 × 0,965 / 0,95
  });

  it("arredonda como o preço do cadastro e aceita configuração antiga sem as taxas", () => {
    expect(precoNoMeio(1000, "link", { ...c, arredondar: "inteiro" })).toBe(1053);
    expect(configPreco({ taxa_pct: 2 } as Partial<ConfigPreco>).taxas_meio).toEqual({ pix: 0, debito: 0, credito: 0, parcelado: 0, link: 0 });
    expect(configPreco({ taxas_meio: { link: "4,5" as unknown as number } } as Partial<ConfigPreco>).taxas_meio.link).toBe(0);
    expect(configPreco({ taxas_meio: { link: "4.5" as unknown as number } } as Partial<ConfigPreco>).taxas_meio.link).toBe(4.5);
  });
});
