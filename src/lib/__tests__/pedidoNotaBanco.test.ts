import { describe, expect, it } from "vitest";
import { conferirVenda, resumoConferencia, type VendaConferir } from "../pedidoNotaBanco";

const v = (x: Partial<VendaConferir>): VendaConferir => ({ id: "1", numero: 1, data: "2026-10-01", cliente: "A", total: 100, frete: 0, notas: [], notaOutra: null, contas: 0, baixado: 0, banco: 0, ...x });

describe("pedido x nota x banco", () => {
  it("classifica a nota", () => {
    expect(conferirVenda(v({ notas: [100] })).sNota).toBe("bate");
    expect(conferirVenda(v({ total: 120, frete: 20, notas: [100] })).sNota).toBe("sem_frete");
    expect(conferirVenda(v({ total: 5800, notas: [580] })).sNota).toBe("menor");
    expect(conferirVenda(v({ notas: [60, 60] })).sNota).toBe("maior");
    expect(conferirVenda(v({})).sNota).toBe("sem_nota");
    expect(conferirVenda(v({ notaOutra: { numero: "9", valor: 100 } })).sNota).toBe("outra_empresa");
  });
  it("classifica o banco", () => {
    expect(conferirVenda(v({ banco: 100 })).sBanco).toBe("entrou");
    expect(conferirVenda(v({ banco: 96 })).sBanco).toBe("parcial");
    expect(conferirVenda(v({ contas: 100, baixado: 100 })).sBanco).toBe("baixado_sem_extrato");
    expect(conferirVenda(v({ contas: 100 })).sBanco).toBe("a_receber");
    expect(conferirVenda(v({})).sBanco).toBe("sem_conta");
  });
  it("resume", () => {
    const r = resumoConferencia([v({ notas: [100], banco: 100 }), v({ id: "2", total: 5800, notas: [580] }), v({ id: "3", total: 120, frete: 20, notas: [100] })]);
    expect(r.tudoBate).toBe(1);
    expect(r.notaMenor).toBe(5220);
    expect(r.freteFora).toBe(20);
    expect(r.porNota).toEqual({ bate: 1, menor: 1, sem_frete: 1 });
  });
});
