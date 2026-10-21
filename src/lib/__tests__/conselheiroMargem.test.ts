import { describe, expect, it } from "vitest";
import { conselhosMargem, type GrupoMargem } from "../conselheiroMargem";
import { zero } from "../margem";

const g = (chave: string, nome: string, receita: number, mc: number, extra: Partial<GrupoMargem> = {}): GrupoMargem =>
  ({ ...zero(), chave, nome, qtd: 1, receita, mc, ...extra });

describe("conselheiro da margem", () => {
  it("sem vendas: um aviso só", () => {
    expect(conselhosMargem({ total: zero(), produtos: [], canais: [], vendedores: [], clientes: [] }).map((c) => c.id)).toEqual(["sem-vendas"]);
  });
  it("produto no prejuízo e margem apertada vêm primeiro, com a conta", () => {
    const total = { ...zero(), receita: 100000, mc: 10000, frete: 7000 };
    const c = conselhosMargem({
      total, produtos: [g("a", "Máquina A", 60000, 12000), g("b", "Peça B", 10000, -2000), g("c", "Peça C", 30000, 0)],
      canais: [g("whatsapp", "WhatsApp", 100000, 10000)], vendedores: [], clientes: [],
    });
    expect(c[0].id).toBe("produtos-prejuizo");
    expect(c[0].porque).toContain("Peça B");
    expect(c.map((x) => x.id)).toContain("mc-baixa");
    expect(c.map((x) => x.id)).toContain("custo-frete");
    expect(c.find((x) => x.id === "custo-frete")!.titulo).toContain("7%");
  });
  it("canal abaixo da média aponta o custo que mais pesa", () => {
    const total = { ...zero(), receita: 100000, mc: 35000 };
    const c = conselhosMargem({
      total, produtos: [], vendedores: [], clientes: [],
      canais: [g("marketplace", "Marketplace", 30000, 3000, { taxa: 6000, frete: 1000 }), g("whatsapp", "WhatsApp", 70000, 32000)],
    });
    const canal = c.find((x) => x.id === "canal-baixo")!;
    expect(canal.titulo).toContain("Marketplace");
    expect(canal.porque).toContain("taxas");
    expect(c.find((x) => x.id === "mc-boa")).toBeTruthy();
  });
  it("cliente que concentra a receita e itens sem custo", () => {
    const total = { ...zero(), receita: 100000, mc: 25000 };
    const c = conselhosMargem({
      total, produtos: [], canais: [], vendedores: [], semCusto: 3,
      clientes: [g("1", "Cliente Grande", 50000, 12000), g("2", "B", 30000, 8000), g("3", "C", 20000, 5000)],
    });
    expect(c.map((x) => x.id)).toEqual(expect.arrayContaining(["cliente-concentrado", "sem-custo"]));
  });
});
