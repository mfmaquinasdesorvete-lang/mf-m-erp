import { describe, expect, it } from "vitest";
import { composicao, custoKit, ehKitAberto, estoqueKit, pecasDoKit } from "../kits";
import type { KitComponente } from "../types";

const kc = (kit_id: string, componente_id: string, quantidade: number, padrao = true): KitComponente => ({
  id: `${kit_id}>${componente_id}`, kit_id, componente_id, quantidade, opcional: !padrao, grupo: null, padrao,
});

// Mecânica Q 050 (peças) → Mecânica Dupla (2 mecânicas + parafusos) → Kit Manutenção (mecânica dupla + chave + graxa)
const COMPS: KitComponente[] = [
  kc("MEC", "ROL", 2), kc("MEC", "RET", 1), kc("MEC", "EIXO", 1),
  kc("MECD", "MEC", 2), kc("MECD", "PAR", 4),
  kc("CHV", "HASTE", 1), kc("CHV", "PONTA", 1), kc("CHV", "ESTOJO", 1, false),
  kc("KMC", "MECD", 1), kc("KMC", "CHV", 1), kc("KMC", "GRX", 0.1),
];

const ordenar = (l: { componente_id: string; quantidade: number }[]) =>
  Object.fromEntries([...l].sort((a, b) => a.componente_id.localeCompare(b.componente_id)).map((c) => [c.componente_id, c.quantidade]));

describe("composicao (1º nível do kit)", () => {
  it("sem escolha usa só os componentes padrão", () => {
    expect(composicao("CHV", COMPS)).toEqual([{ componente_id: "HASTE", quantidade: 1 }, { componente_id: "PONTA", quantidade: 1 }]);
  });

  it("com escolha: aceita opcional do kit, descarta o que não é do kit e quantidade zero", () => {
    const escolha = [
      { componente_id: "HASTE", quantidade: 1 }, { componente_id: "ESTOJO", quantidade: 1 },
      { componente_id: "ROL", quantidade: 5 }, { componente_id: "PONTA", quantidade: 0 },
    ];
    expect(composicao("CHV", COMPS, escolha)).toEqual([{ componente_id: "HASTE", quantidade: 1 }, { componente_id: "ESTOJO", quantidade: 1 }]);
  });

  it("escolha vazia ou nula volta para o padrão; quantidade vinda do banco como texto vira número", () => {
    expect(composicao("CHV", COMPS, [])).toHaveLength(2);
    expect(composicao("CHV", COMPS, null)).toHaveLength(2);
    const texto = [{ ...kc("K", "A", 0), quantidade: "2.5" as unknown as number }];
    expect(composicao("K", texto)).toEqual([{ componente_id: "A", quantidade: 2.5 }]);
  });
});

describe("ehKitAberto", () => {
  it("só é kit aberto quem tem componente padrão", () => {
    expect(ehKitAberto("MEC", COMPS)).toBe(true);
    expect(ehKitAberto("ROL", COMPS)).toBe(false);
    expect(ehKitAberto("SO_OPC", [kc("SO_OPC", "X", 1, false)])).toBe(false);
  });
});

describe("pecasDoKit (o que sai do estoque)", () => {
  it("kit dentro de kit multiplica as quantidades até as peças", () => {
    expect(ordenar(pecasDoKit("MECD", COMPS))).toEqual({ EIXO: 2, PAR: 4, RET: 2, ROL: 4 });
  });

  it("três níveis: soma peças de kits diferentes e ignora o opcional não escolhido", () => {
    expect(ordenar(pecasDoKit("KMC", COMPS))).toEqual({ EIXO: 2, GRX: 0.1, HASTE: 1, PAR: 4, PONTA: 1, RET: 2, ROL: 4 });
  });

  it("a escolha do pedido vale só no 1º nível; os kits de dentro saem pelo padrão", () => {
    expect(ordenar(pecasDoKit("KMC", COMPS, [{ componente_id: "MECD", quantidade: 2 }]))).toEqual({ EIXO: 4, PAR: 8, RET: 4, ROL: 8 });
  });

  it("a mesma peça em dois lugares é somada e arredondada em 3 casas", () => {
    const comps = [kc("K1", "PECA", 0.1), kc("K1", "K2", 1), kc("K2", "PECA", 0.2)];
    // 0,1 + 0,2 em ponto flutuante dá 0,30000000000000004
    expect(pecasDoKit("K1", comps)).toEqual([{ componente_id: "PECA", quantidade: 0.3 }]);
  });

  it("kit só com opcionais dentro de outro kit sai do estoque como peça", () => {
    const comps = [kc("K", "SO_OPC", 2), kc("K", "P1", 1), kc("SO_OPC", "X", 1, false)];
    expect(ordenar(pecasDoKit("K", comps))).toEqual({ P1: 1, SO_OPC: 2 });
  });

  it("kit que dá volta (A leva B e B leva A) não trava e não conta o kit repetido", () => {
    const comps = [kc("A", "B", 1), kc("A", "P1", 1), kc("B", "A", 1), kc("B", "P2", 2)];
    expect(ordenar(pecasDoKit("A", comps))).toEqual({ P1: 1, P2: 2 });
    expect(ordenar(pecasDoKit("A", [kc("A", "A", 1), kc("A", "P1", 3)]))).toEqual({ P1: 3 });
  });

  it("limite de 10 níveis: a peça no 10º nível entra; num kit mais fundo, o que passa do limite fica de fora", () => {
    const cadeia = (n: number) => [...Array.from({ length: n }, (_, i) => kc(`K${i}`, `K${i + 1}`, 2)), kc(`K${n}`, "PECA", 2)];
    // K0 → K1 … → K9 → PECA: 10 níveis, cada um × 2
    expect(pecasDoKit("K0", cadeia(9))).toEqual([{ componente_id: "PECA", quantidade: 1024 }]);
    // K0 → … → K10 → PECA: o K10 (10º nível) não é aberto e, por ser kit, também não sai do estoque
    expect(pecasDoKit("K0", cadeia(10))).toEqual([]);
  });

  it("kit sem componentes não tira nada do estoque", () => {
    expect(pecasDoKit("NADA", COMPS)).toEqual([]);
  });
});

describe("estoqueKit (quantos kits dá para montar)", () => {
  const saldos: Record<string, number> = { ROL: 9, RET: 5, EIXO: 3, PAR: 100, HASTE: 4, PONTA: 7, GRX: 2 };
  const saldo = (id: string) => saldos[id] ?? 0;

  it("a peça que mais falta manda", () => {
    expect(estoqueKit("MEC", COMPS, saldo)).toBe(3); // EIXO 3 ÷ 1
    expect(estoqueKit("MECD", COMPS, saldo)).toBe(1); // EIXO 3 ÷ 2 = 1
  });

  it("saldo negativo não dá kit negativo; kit sem componentes dá zero", () => {
    expect(estoqueKit("MEC", COMPS, (id) => (id === "ROL" ? -4 : 50))).toBe(0);
    expect(estoqueKit("NADA", COMPS, saldo)).toBe(0);
  });

  it("respeita a escolha do pedido", () => {
    expect(estoqueKit("CHV", COMPS, saldo, [{ componente_id: "HASTE", quantidade: 2 }])).toBe(2);
  });

  // BUG (src/lib/kits.ts:39): Math.floor(saldo / quantidade) em ponto flutuante. Kit com 0,1 kg de graxa e 0,3 kg no
  // estoque: 0.3 / 0.1 = 2.9999999999999996 → floor = 2, mas dá para montar 3 kits. Afeta a tela de pedido/kits.
  it("quantidade fracionada: 0,3 kg de graxa para kits de 0,1 kg dá 3 kits", () => {
    const comps = [kc("KG", "GRX", 0.1)];
    expect(estoqueKit("KG", comps, () => 0.3)).toBe(3);
  });
});

describe("custoKit", () => {
  const custos: Record<string, number> = { ROL: 25.5, RET: 8.9, EIXO: 120, PAR: 0.35, HASTE: 45, PONTA: 18.75, ESTOJO: 32, GRX: 89.9 };
  const custo = (id: string) => custos[id] ?? 0;

  it("soma as peças, abrindo o kit de dentro (R$)", () => {
    expect(custoKit("MEC", COMPS, custo)).toBeCloseTo(179.9, 2);
    // 4×25,50 + 2×8,90 + 2×120,00 + 4×0,35
    expect(custoKit("MECD", COMPS, custo)).toBeCloseTo(361.2, 2);
    // + 45,00 + 18,75 + 0,1×89,90
    expect(custoKit("KMC", COMPS, custo)).toBeCloseTo(433.94, 2);
  });

  it("com a escolha do pedido entra o opcional escolhido", () => {
    const escolha = [{ componente_id: "HASTE", quantidade: 1 }, { componente_id: "PONTA", quantidade: 1 }, { componente_id: "ESTOJO", quantidade: 1 }];
    expect(custoKit("CHV", COMPS, custo, escolha)).toBeCloseTo(95.75, 2);
  });
});
