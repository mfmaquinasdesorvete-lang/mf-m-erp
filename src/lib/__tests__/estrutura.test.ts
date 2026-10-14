import { describe, expect, it } from "vitest";
import { consumoEstrutura, contemNaEstrutura, custoEstrutura, niveis, type LinhaFicha } from "../estrutura";
import type { KitComponente } from "../types";

const f = (produto_id: string, componente_id: string, quantidade: number): LinhaFicha => ({ produto_id, componente_id, quantidade });
const kc = (kit_id: string, componente_id: string, quantidade: number): KitComponente => ({
  id: `${kit_id}>${componente_id}`, kit_id, componente_id, quantidade, opcional: false, grupo: null, padrao: true,
});

// Máquina Q050: gabinete (montado junto), motor (subconjunto com estoque próprio), mecânica (kit) e cabo em metros
const FICHAS: LinhaFicha[] = [
  f("MAQ", "GAB", 1), f("MAQ", "MOT", 1), f("MAQ", "MEC", 1), f("MAQ", "CABO", 1.5),
  f("GAB", "CHAPA", 2), f("GAB", "PAR", 8),
  f("MOT", "BOB", 1), f("MOT", "ROT", 1),
];
const KITS: KitComponente[] = [kc("MEC", "ROL", 2), kc("MEC", "RET", 1), kc("MEC", "EIXO", 1)];
const PRODUTOS = [
  { id: "MAQ", preco_custo: 0 }, { id: "GAB", preco_custo: 999 }, { id: "MOT", preco_custo: 999, subconjunto_estocado: true },
  { id: "MEC", preco_custo: 999 }, { id: "CABO", preco_custo: 12.4 }, { id: "CHAPA", preco_custo: 150 }, { id: "PAR", preco_custo: 0.35 },
  { id: "BOB", preco_custo: 200 }, { id: "ROT", preco_custo: 180 }, { id: "ROL", preco_custo: 25.5 }, { id: "RET", preco_custo: 8.9 },
  { id: "EIXO", preco_custo: 120 },
];

describe("consumoEstrutura (o que a OP consome)", () => {
  it("abre o subconjunto montado junto e o kit; o subconjunto com estoque próprio sai pronto", () => {
    const c = consumoEstrutura(FICHAS, PRODUTOS, "MAQ", 3, KITS);
    expect(Object.fromEntries([...c].sort(([a], [b]) => a.localeCompare(b)))).toEqual({
      CABO: 4.5, CHAPA: 6, EIXO: 3, MOT: 3, PAR: 24, RET: 3, ROL: 6,
    });
    expect(c.has("GAB")).toBe(false);
    expect(c.has("MEC")).toBe(false);
    expect(c.has("BOB")).toBe(false);
  });

  it("a mesma peça em dois subconjuntos é somada", () => {
    const fichas = [f("M", "S1", 1), f("M", "S2", 2), f("S1", "PAR", 4), f("S2", "PAR", 3)];
    expect(consumoEstrutura(fichas, [], "M", 2).get("PAR")).toBe(20); // 2×(4 + 2×3)
  });

  it("ficha que dá volta não trava", () => {
    const fichas = [f("A", "B", 1), f("B", "A", 1), f("B", "P", 2)];
    expect([...consumoEstrutura(fichas, [], "A", 1)]).toEqual([["P", 2]]);
  });

  it("produto sem ficha não consome nada", () => {
    expect(consumoEstrutura(FICHAS, PRODUTOS, "CHAPA", 10).size).toBe(0);
  });
});

describe("custoEstrutura (custo de 1 unidade)", () => {
  it("soma todos os níveis: subconjunto e kit entram pelo custo das peças, não pelo preço de custo deles", () => {
    // GAB 2×150 + 8×0,35 = 302,80 · MOT 200 + 180 = 380 · MEC 2×25,50 + 8,90 + 120 = 179,90 · CABO 1,5×12,40 = 18,60
    expect(custoEstrutura(FICHAS, PRODUTOS, "MAQ", KITS)).toBeCloseTo(881.3, 2);
    expect(custoEstrutura(FICHAS, PRODUTOS, "GAB", KITS)).toBeCloseTo(302.8, 2);
  });

  it("sem ficha: preço de custo do cadastro (kit = soma das peças); sem custo = 0", () => {
    expect(custoEstrutura(FICHAS, PRODUTOS, "CABO", KITS)).toBe(12.4);
    expect(custoEstrutura(FICHAS, PRODUTOS, "MEC", KITS)).toBeCloseTo(179.9, 2);
    expect(custoEstrutura(FICHAS, PRODUTOS, "MEC", [])).toBe(999); // sem a composição do kit, vale o cadastro
    expect(custoEstrutura(FICHAS, PRODUTOS, "NAO_EXISTE", KITS)).toBe(0);
  });

  it("ficha que dá volta: o ramo repetido conta zero e a conta termina", () => {
    const fichas = [f("A", "B", 1), f("B", "A", 1), f("B", "P", 2)];
    expect(custoEstrutura(fichas, [{ id: "P", preco_custo: 10 }, { id: "A", preco_custo: 1000 }], "A")).toBe(20);
  });
});

describe("contemNaEstrutura e niveis", () => {
  it("acha o item em qualquer nível e evita ficha que dá volta", () => {
    expect(contemNaEstrutura(FICHAS, "MAQ", "CHAPA")).toBe(true);
    expect(contemNaEstrutura(FICHAS, "GAB", "MAQ")).toBe(false);
    expect(contemNaEstrutura(FICHAS, "GAB", "GAB")).toBe(true);
  });

  it("conta os níveis (1 = só peças)", () => {
    expect(niveis(FICHAS, "MAQ")).toBe(2);
    expect(niveis(FICHAS, "GAB")).toBe(1);
    expect(niveis(FICHAS, "CHAPA")).toBe(0);
  });
});
