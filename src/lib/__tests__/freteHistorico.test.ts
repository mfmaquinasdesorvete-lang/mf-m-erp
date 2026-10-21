import { describe, expect, it } from "vitest";
import { referenciasFrete, type FretePassado } from "../freteHistorico";

const h = (frete: number, data: string, municipio: string, uf: string, cliente_id: string | null = null, transportadora_id: string | null = null): FretePassado =>
  ({ frete, data, municipio, uf, cliente_id, transportadora_id });

describe("referência de frete pelo histórico", () => {
  const hist = [
    h(300, "2026-09-01", "Tubarão", "SC", "c1", "t1"), h(350, "2026-10-01", "Tubarão", "SC", null, "t1"),
    h(500, "2026-08-01", "Joinville", "SC", null, "t2"), h(0, "2026-10-05", "Tubarão", "SC"), h(900, "2026-07-01", "Recife", "PE"),
  ];
  it("cliente, cidade e estado, do mais parecido ao mais geral", () => {
    const r = referenciasFrete(hist, { cliente_id: "c1", municipio: "tubarao", uf: "sc" });
    expect(r.map((x) => [x.onde, x.quantas, x.mediana])).toEqual([["cliente", 1, 300], ["cidade", 2, 325], ["uf", 3, 350]]);
    expect(r[1].ultimo.frete).toBe(350);
    expect(r[2].porTransportadora[0]).toEqual({ transportadora_id: "t1", quantas: 2, ultimo: 350 });
  });
  it("sem histórico no destino não sugere nada", () => {
    expect(referenciasFrete(hist, { municipio: "Manaus", uf: "AM" })).toEqual([]);
  });
  it("cidade com os mesmos fretes do estado não repete", () => {
    expect(referenciasFrete(hist, { municipio: "Recife", uf: "PE" }).map((x) => x.onde)).toEqual(["cidade"]);
  });
});
