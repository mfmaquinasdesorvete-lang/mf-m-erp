import { describe, expect, it } from "vitest";
import { desdeDe, filaPorEtapa, tempo } from "../filaExpedicao";

const exp = (o: Record<string, unknown>) => ({ id: String(Math.random()), pedido_id: "p1", status: "separar", itens_conferidos: [], volumes: null, peso_kg: null, transportadora_id: null,
  codigo_rastreio: null, responsavel: null, observacoes: null, separando_em: null, conferido_em: null, embalado_em: null, despachado_em: null, entregue_em: null,
  created_at: "2026-10-19T08:00:00Z", ...o }) as any;
const ped = (id: string, notas: { status: string; ambiente?: string }[] = []) => ({ id, numero: 1, aprovado_em: "2026-10-19T07:00:00Z", notas, itens: [], cliente: {} }) as any;

describe("fila da expedição", () => {
  it("desde quando está na etapa", () => {
    expect(desdeDe(exp({ status: "separando", separando_em: "2026-10-19T09:00:00Z" }), {})).toBe("2026-10-19T09:00:00Z");
    expect(desdeDe(exp({ status: "separar" }), { aprovado_em: "2026-10-19T07:00:00Z" })).toBe("2026-10-19T07:00:00Z");
  });
  it("separa por etapa, ignora despachados e nota de teste", () => {
    const agora = Date.parse("2026-10-19T12:00:00Z");
    const { porEtapa } = filaPorEtapa(
      [ped("p1"), ped("p2", [{ status: "autorizada", ambiente: "homologacao" }]), ped("p3", [{ status: "autorizada" }])],
      [exp({ pedido_id: "p1" }), exp({ pedido_id: "p2", status: "embalado", embalado_em: "2026-10-19T10:00:00Z" }),
        exp({ pedido_id: "p3", status: "embalado" }), exp({ pedido_id: "p3", status: "despachado" })], agora);
    expect(porEtapa.separar).toHaveLength(1);
    expect(porEtapa.separar[0].horas).toBe(5);
    expect(porEtapa.despachar.map((l) => l.p.id)).toEqual(["p3", "p2"]);
    expect(porEtapa.despachar[1].nota).toBeUndefined();
    expect(porEtapa.despachar[0].nota).toBeDefined();
  });
  it("tempo em palavras", () => {
    expect(tempo(0.5)).toBe("agora há pouco");
    expect(tempo(5)).toBe("há 5 h");
    expect(tempo(49)).toBe("há 2 dias");
  });
});
