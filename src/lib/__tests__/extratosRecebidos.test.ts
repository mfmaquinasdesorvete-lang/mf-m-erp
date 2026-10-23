import { describe, expect, it } from "vitest";
import { extratosRecebidos } from "@/lib/extratosRecebidos";
import type { ContaPessoal, LancPessoal } from "@/lib/pessoal";

const conta: ContaPessoal = { id: "c", nome: "Conta corrente", tipo: "corrente", banco: "Banco", cor: "sky", saldo_inicial: 0, saldo_inicial_em: "2026-01-01", limite: null, ativa: true, ordem: 0 };
const l = (data: string, identificador: string | null, extra: Partial<LancPessoal> = {}): LancPessoal =>
  ({ id: `${data}${identificador}`, conta_id: "c", data, descricao: "x", valor: -1, categoria: null, situacao: "realizado", anulado: false, identificador, ...extra });

describe("extratosRecebidos", () => {
  it("separa os meses com extrato, só digitados e faltando", () => {
    const [r] = extratosRecebidos([conta], [
      l("2026-06-02", "pdf:1"), l("2026-06-29", "pdf:2"),
      l("2026-08-10", null),
      l("2026-09-03", "ofx:1"), l("2026-09-12", "pluggy:9"),
      l("2026-07-10", "pdf:3", { anulado: true }),
    ], "2026-10-23");
    expect(r.meses.map((m) => [m.mes, m.situacao])).toEqual([
      ["2026-06", "extrato"], ["2026-07", "falta"], ["2026-08", "digitado"], ["2026-09", "extrato"], ["2026-10", "falta"],
    ]);
    expect(r.faltam).toEqual(["2026-07", "2026-08"]);
    // o último extrato para no dia 12 de setembro
    expect(r.parciais).toEqual(["2026-09"]);
    expect(r.meses[3].origens.sort()).toEqual(["arquivo", "pluggy"]);
    expect(r.ultimo).toBe("2026-09-12");
  });
});
