import { describe, expect, it } from "vitest";
import { aplicarRegras, lerRegras, mensagemCotacao, REGRAS_PADRAO, volumesDosItens } from "../../../supabase/functions/_shared/frete-cotar";

const borracha = { id: "1", descricao: "Borracha da porta", preco_venda: 25, peso_kg: 0.1, embalagem: { largura_cm: 20, altura_cm: 5, comprimento_cm: 15, peso_kg: 0.05 } };
const maquina = { id: "2", descricao: "Máquina de sorvete", preco_venda: 15000, peso_kg: 180, largura_cm: 70, altura_cm: 160, profundidade_cm: 80 };
const semPeso = { id: "3", descricao: "Peça sem cadastro", preco_venda: 10 };

describe("volumes dos itens", () => {
  it("usa a embalagem, o produto ou o padrão", () => {
    const r = volumesDosItens([{ produto: borracha, quantidade: 2 }, { produto: maquina, quantidade: 1 }], REGRAS_PADRAO);
    expect(r.volumes).toEqual([
      { quantidade: 2, peso_kg: 0.1, largura_cm: 20, altura_cm: 5, comprimento_cm: 15 },
      { quantidade: 1, peso_kg: 180, largura_cm: 70, altura_cm: 160, comprimento_cm: 80 },
    ]);
    expect(r.peso_total).toBe(180.2);
    expect(r.valor_produtos).toBe(15050);
    expect(r.faltam).toEqual([]);
  });

  it("produto sem peso fica de fora, a não ser que haja padrão", () => {
    expect(volumesDosItens([{ produto: semPeso, quantidade: 1 }], REGRAS_PADRAO).faltam).toEqual(["Peça sem cadastro"]);
    const regras = { ...REGRAS_PADRAO, peso_padrao_kg: 0.5, medidas_padrao: { largura_cm: 20, altura_cm: 10, comprimento_cm: 15 } };
    expect(volumesDosItens([{ produto: semPeso, quantidade: 3 }], regras).volumes).toEqual([{ quantidade: 3, peso_kg: 0.5, largura_cm: 20, altura_cm: 10, comprimento_cm: 15 }]);
  });
});

describe("regras de frete", () => {
  const opcoes = [
    { id: "a", transportadora: "Jadlog", servico: ".Package", prazo: 6, valor: 40 },
    { id: "b", transportadora: "Correios", servico: "SEDEX", prazo: 2, valor: 30 },
    { id: "c", transportadora: "Loggi", servico: null, prazo: 4, valor: 0 },
  ];

  it("lê as regras gravadas com o padrão no que faltar", () => {
    expect(lerRegras(null)).toEqual(REGRAS_PADRAO);
    expect(lerRegras({ loja_ligada: true, gratis_acima: "500", gratis_ufs: ["sc", "x", "SP"], acrescimo_percentual: 10, retirada: false })).toMatchObject({
      loja_ligada: true, gratis_acima: 500, gratis_ufs: ["SC", "SP"], acrescimo_percentual: 10, retirada: false,
    });
  });

  it("ordena, tira valor zero e soma o acréscimo", () => {
    const r = aplicarRegras(opcoes, { ...REGRAS_PADRAO, acrescimo_percentual: 10, acrescimo_fixo: 2 }, { valor_produtos: 100, uf: "PR" });
    expect(r.map((o) => [o.id, o.valor_cliente])).toEqual([["b", 35], ["a", 46]]);
  });

  it("frete grátis na mais barata pelo valor ou pelo estado", () => {
    const pelo = aplicarRegras(opcoes, { ...REGRAS_PADRAO, gratis_acima: 300 }, { valor_produtos: 300, uf: "PR" });
    expect(pelo.map((o) => [o.id, o.valor_cliente, !!o.gratis])).toEqual([["b", 0, true], ["a", 40, false]]);
    expect(aplicarRegras(opcoes, { ...REGRAS_PADRAO, gratis_ufs: ["SC"] }, { valor_produtos: 10, uf: "sc" })[0].valor_cliente).toBe(0);
    expect(aplicarRegras(opcoes, { ...REGRAS_PADRAO, gratis_acima: 300 }, { valor_produtos: 299.99, uf: "SC" })[0].valor_cliente).toBe(30);
  });

  it("mensagem para o WhatsApp", () => {
    const m = mensagemCotacao({ cep: "88100000", cidade: "São José/SC", itens: [{ descricao: "Borracha da porta", quantidade: 2 }], opcoes: aplicarRegras(opcoes, REGRAS_PADRAO, { valor_produtos: 50, uf: "SC" }) });
    expect(m).toContain("Frete para o CEP 88100-000 (São José/SC):");
    expect(m).toContain("• 2 × Borracha da porta");
    expect(m).toMatch(/Correios SEDEX: R\$\s?30,00 · 2 dias úteis/);
  });
});
