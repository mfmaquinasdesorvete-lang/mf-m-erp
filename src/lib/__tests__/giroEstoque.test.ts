import { describe, expect, it } from "vitest";
import { calcularGiro, situacao, totaisGiro, type ProdutoGiro } from "../giroEstoque";

const prod = (id: string, extra: Partial<ProdutoGiro> = {}): ProdutoGiro => ({ id, descricao: id, preco_custo: 10, categoria: "Peças > Motor", ...extra });

describe("giro de estoque", () => {
  const inicio = "2026-01-01", fim = "2026-12-31"; // 365 dias
  const produtos = [prod("a"), prod("b"), prod("c"), prod("kit", { kit: true }), prod("srv", { tipo: "servico" }), prod("d", { categoria: "Elétrica" })];
  const saldos = new Map([["a", 10], ["b", 5], ["c", 0], ["d", 0]]);
  const saidas = [
    { produto_id: "a", quantidade: 73, data: "2026-06-01" },
    { produto_id: "c", quantidade: 2, data: "2026-03-01" },
    { produto_id: "b", quantidade: 1, data: "2025-11-10" }, // fora do período: só conta como última saída
  ];
  const linhas = calcularGiro(produtos, saldos, saidas, inicio, fim);

  it("tira kits e serviços", () => expect(linhas.map((l) => l.id)).toEqual(["a", "b", "c", "d"]));
  it("giro, cobertura e situação", () => {
    const a = linhas.find((l) => l.id === "a")!;
    expect(a.giro).toBe(7.3);
    expect(a.cobertura).toBe(50); // 10 ÷ (73/365)
    expect(a.situacao).toBe("normal");
    const b = linhas.find((l) => l.id === "b")!;
    expect(b.situacao).toBe("parado");
    expect(b.ultimaSaida).toBe("2025-11-10");
    expect(b.diasSemVenda).toBe(416);
    expect(linhas.find((l) => l.id === "c")!.situacao).toBe("ruptura");
    expect(linhas.find((l) => l.id === "d")!.situacao).toBe("sem_movimento");
  });
  it("classes pela cobertura", () => {
    expect(situacao(5, 10, 10)).toBe("rapido");
    expect(situacao(50, 1, 400)).toBe("lento");
  });
  it("totais por categoria principal", () => {
    const t = totaisGiro(linhas, inicio, fim);
    const pecas = t.find((x) => x.chave === "Peças")!;
    expect(pecas.itens).toBe(3);
    expect(pecas.valorEstoque).toBe(150);
    expect(pecas.parados).toBe(1);
    expect(pecas.valorParado).toBe(50);
    expect(pecas.giro).toBe(5); // 750 ÷ 150
  });
});
