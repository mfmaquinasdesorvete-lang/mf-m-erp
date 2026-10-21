import { describe, expect, it } from "vitest";
import { interpretarLancPessoal } from "../gastoPessoal";

const contas = [
  { id: "itau", nome: "Itaú", banco: "Itaú", tipo: "corrente" as const },
  { id: "nu", nome: "Nubank", banco: "Nubank", tipo: "cartao" as const },
  { id: "carteira", nome: "Carteira", banco: null, tipo: "dinheiro" as const },
];

describe("gasto pessoal falado ou escrito", () => {
  it("tira valor, data, conta, categoria e descrição", () => {
    const g = interpretarLancPessoal("gastei 45,90 no almoço ontem no Nubank", "2026-10-21", contas);
    expect(g).toMatchObject({ valor: 45.9, data: "2026-10-20", sentido: "saida", conta_id: "nu", categoria: "Lazer" });
    expect(g.descricao).toBe("Almoço");
    expect(interpretarLancPessoal("paguei 89,90 de pão de queijo no Itaú", "2026-10-21", contas).descricao).toBe("Pão de queijo");
  });
  it("cartão e dinheiro escolhem a conta pelo tipo", () => {
    expect(interpretarLancPessoal("paguei 120 de gasolina no cartão", "2026-10-21", contas)).toMatchObject({ conta_id: "nu", categoria: "Transporte", valor: 120 });
    expect(interpretarLancPessoal("padaria 12 reais em dinheiro", "2026-10-21", contas).conta_id).toBe("carteira");
  });
  it("entrada quando recebeu", () => {
    const g = interpretarLancPessoal("recebi 3.500 de pró-labore dia 5 no Itaú", "2026-10-21", contas);
    expect(g).toMatchObject({ sentido: "entrada", valor: 3500, data: "2026-10-05", conta_id: "itau", categoria: "Salário e pró-labore" });
  });
  it("sem conta reconhecida fica para escolher", () => {
    expect(interpretarLancPessoal("farmácia 30", "2026-10-21", contas)).toMatchObject({ conta_id: null, categoria: "Saúde", valor: 30 });
  });
});
