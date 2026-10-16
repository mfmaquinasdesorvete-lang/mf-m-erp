import { describe, expect, it } from "vitest";
import { consertosDasNotas, ehEntradaConserto, ehRetornoConserto, type NotaConserto } from "../consertos";

const nf = (x: Partial<NotaConserto>): NotaConserto => ({
  id: "n", numero: "1", status: "autorizada", ambiente: "producao", tipo_operacao: "saida", finalidade: "normal",
  created_at: "2025-06-17T12:00:00-03:00", valor_total: 450, payload: { items: [] }, ...x,
});

describe("consertos pelas notas do cliente", () => {
  it("reconhece a entrada para conserto e o retorno", () => {
    expect(ehEntradaConserto(nf({ tipo_operacao: "entrada", payload: { items: [{ cfop: "2915" }] } }))).toBe(true);
    expect(ehEntradaConserto(nf({ tipo_operacao: "entrada", payload: { items: [{ cfop: "2949" }], natureza_operacao: "Entrada para conserto" } }))).toBe(true);
    expect(ehEntradaConserto(nf({ tipo_operacao: "entrada", finalidade: "devolucao", payload: { items: [{ cfop: "2202" }] } }))).toBe(false);
    expect(ehRetornoConserto(nf({ payload: { items: [{ cfop: "6.916" }] } }))).toBe(true);
    expect(ehRetornoConserto(nf({ payload: { items: [{ cfop: "6915" }] } }))).toBe(false); // remessa para conserto (outro sentido)
  });

  it("liga o retorno pela nota referenciada; sem ela, pelo primeiro retorno depois; o que não voltou conta os dias até hoje", () => {
    const e1 = nf({ id: "e1", numero: "53", tipo_operacao: "entrada", chave: "CH53", created_at: "2025-06-17T10:00:00-03:00", payload: { items: [{ cfop: "2915", descricao: "Máquina de sorvete exemplo" }] } });
    const e2 = nf({ id: "e2", numero: "125", tipo_operacao: "entrada", chave: "CH125", created_at: "2025-09-03T10:00:00-03:00", payload: { items: [{ cfop: "2915" }] } });
    const e3 = nf({ id: "e3", numero: "421", tipo_operacao: "entrada", chave: "CH421", created_at: "2026-09-11T10:00:00-03:00", payload: { items: [{ cfop: "1915" }] } });
    const r1 = nf({ id: "r1", numero: "197", chave_referenciada: "CH125", created_at: "2025-10-21T10:00:00-03:00", payload: { items: [{ cfop: "6916" }] } });
    const r2 = nf({ id: "r2", numero: "61", created_at: "2025-07-10T10:00:00-03:00", payload: { items: [{ cfop: "6916" }] } });
    const orfao = nf({ id: "r3", numero: "300", chave_referenciada: "OUTRA", created_at: "2026-01-05T10:00:00-03:00", payload: { items: [{ cfop: "5916" }] } });
    const cancelada = nf({ id: "x", numero: "62", status: "cancelada", created_at: "2025-07-01T10:00:00-03:00", payload: { items: [{ cfop: "6916" }] } });
    const c = consertosDasNotas([r1, e2, e1, r2, orfao, cancelada, e3], "2026-10-16");
    expect(c.map((x) => [x.entrada?.numero ?? null, x.retorno?.numero ?? null, x.dias])).toEqual([
      ["421", null, 35], // ainda na MF
      [null, "300", null], // voltou, mas a entrada não está no ERP
      ["125", "197", 48], // pela nota referenciada
      ["53", "61", 23], // pelo primeiro retorno depois da entrada
    ]);
    expect(c[3].itens).toEqual(["Máquina de sorvete exemplo"]);
  });
});
