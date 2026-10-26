import { describe, expect, it } from "vitest";
import { noCartao, noEstado, resumoAgora, type RegrasAgora } from "../agoraContas";

type C = { status: string; vencimento: string; valor: number; pagar_em?: string | null; parada?: boolean; decidir?: boolean };
const r: RegrasAgora<C> = { dia: (c) => c.pagar_em ?? c.vencimento, parada: (c) => !!c.parada, decidir: (c) => !!c.decidir };
const H = "2026-10-26";
const c = (p: Partial<C>): C => ({ status: "aberto", vencimento: H, valor: 100, ...p });

describe("o que fazer agora nas contas", () => {
  it("separa vencidas, hoje e esta semana pelo dia de pagar", () => {
    expect(noCartao(c({ vencimento: "2026-10-20" }), "vencidas", H, r)).toBe(true);
    expect(noCartao(c({}), "hoje", H, r)).toBe(true);
    expect(noCartao(c({ vencimento: "2026-11-01" }), "semana", H, r)).toBe(true);
    expect(noCartao(c({ vencimento: "2026-11-02" }), "semana", H, r)).toBe(false);
    // programada para depois: sai de vencidas
    expect(noCartao(c({ vencimento: "2026-10-20", pagar_em: "2026-10-28" }), "vencidas", H, r)).toBe(false);
    expect(noCartao(c({ vencimento: "2026-10-20", pagar_em: "2026-10-28" }), "semana", H, r)).toBe(true);
  });

  it("segurada não conta como vencida e conta paga não entra nos cartões", () => {
    expect(noCartao(c({ vencimento: "2026-10-20", parada: true }), "vencidas", H, r)).toBe(false);
    expect(noCartao(c({ status: "pago", vencimento: "2026-10-20" }), "vencidas", H, r)).toBe(false);
    expect(noCartao(c({ decidir: true, parada: true }), "decidir", H, r)).toBe(true);
  });

  it("filtra a lista e soma os cartões", () => {
    expect(noEstado({ status: "pago" }, "pagas")).toBe(true);
    expect(noEstado({ status: "cancelado" }, "todas")).toBe(false);
    const s = resumoAgora([c({ vencimento: "2026-10-01", valor: 50 }), c({ valor: 30 }), c({ decidir: true, valor: 20 })], H, r);
    expect(s.vencidas).toEqual({ n: 1, total: 50 });
    expect(s.hoje).toEqual({ n: 2, total: 50 });
    expect(s.decidir).toEqual({ n: 1, total: 20 });
  });
});
