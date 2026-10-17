import { describe, expect, it } from "vitest";
import { situacaoHistorico, trouxeAlgo } from "../tinyHistorico";

const agora = Date.parse("2026-10-17T20:00:00Z");

describe("importação dos pedidos do Tiny pela API: situação", () => {
  it("sem importação, concluída e bloqueada", () => {
    expect(situacaoHistorico(null, agora)).toEqual({ tipo: "nunca" });
    expect(situacaoHistorico({ etapa: "concluida" }, agora)).toEqual({ tipo: "concluida" });
    expect(situacaoHistorico({ etapa: "notas", totais: { bloqueio: { mensagem: "API bloqueada", em: "2026-10-16T15:50:00Z" } } }, agora))
      .toEqual({ tipo: "bloqueada", mensagem: "API bloqueada", em: "2026-10-16T15:50:00Z" });
  });

  it("parada: horas sem andar e sem trazer nada", () => {
    expect(situacaoHistorico({ etapa: "notas", atualizado_em: "2026-10-16T15:50:00Z", totais: { conta: null, limite: 60 } }, agora))
      .toEqual({ tipo: "parada", desde: "2026-10-16T15:50:00Z" });
    // há pouco: ainda pode estar andando
    expect(situacaoHistorico({ etapa: "notas", atualizado_em: "2026-10-17T19:30:00Z", totais: {} }, agora).tipo).toBe("andando");
    // já trouxe notas: não é parada, é só uma pausa
    expect(situacaoHistorico({ etapa: "pedidos", atualizado_em: "2026-10-10T10:00:00Z", totais: { notas: { lidas: 300 } } }, agora).tipo).toBe("andando");
  });

  it("o que conta como ter trazido algo", () => {
    expect(trouxeAlgo(null)).toBe(false);
    expect(trouxeAlgo({ conta: { nome: "Empresa Teste" } })).toBe(true);
    expect(trouxeAlgo({ pedidos: { pulados: 3 } })).toBe(true);
    expect(trouxeAlgo({ pedidos: {}, notas: { lidas: 0 } })).toBe(false);
  });
});
