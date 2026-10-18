import { describe, expect, it } from "vitest";
import { gerarTestes } from "../assistenteItem";
import { REGRAS_MF } from "../cenariosMf";
import { maximoDesconto, type RegraDesconto } from "../descontos";
import { separarCenarios } from "../fluxoBdd";

describe("Regras da MF em cenários", () => {
  it("toda regra tem cenários Dado/Quando/Então que viram casos de teste", () => {
    for (const r of REGRAS_MF) {
      const cen = separarCenarios(r.cenarios);
      expect(cen.length, r.titulo).toBeGreaterThan(1);
      for (const c of cen) expect(c.linhas.some((l) => l.startsWith("Então")), `${r.titulo} / ${c.nome}`).toBe(true);
      expect(gerarTestes(r.cenarios).length).toBe(cen.length);
    }
    expect(new Set(REGRAS_MF.map((r) => r.titulo)).size).toBe(REGRAS_MF.length);
  });
});

// Funcionalidade: Limite de desconto — os cenários da regra rodando contra o código de verdade
describe("Funcionalidade: Limite de desconto", () => {
  const regra = (canal: string, forma: string, max: number): RegraDesconto => ({ id: `${canal}-${forma}`, canal, forma_pagamento: forma, maximo_percentual: max, ativo: true, observacao: null });
  const regras = [regra("todos", "qualquer", 10), regra("balcao", "pix", 5)];

  it("Cenário: Desconto dentro do limite — 5% no balcão no Pix segue sem senha", () => {
    expect(5 <= maximoDesconto(regras, "balcao", "pix")!.max).toBe(true);
  });
  it("Cenário: Desconto acima do limite — 8% no balcão no Pix pede senha", () => {
    expect(8 > maximoDesconto(regras, "balcao", "pix")!.max).toBe(true);
  });
  it("Cenário: Regra mais específica vale primeiro — balcão no Pix usa 5%, não 10%", () => {
    expect(maximoDesconto(regras, "balcao", "pix")!.max).toBe(5);
    expect(maximoDesconto(regras, "whatsapp", "cartao")!.max).toBe(10);
  });
});
