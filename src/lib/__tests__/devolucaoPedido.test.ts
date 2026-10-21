import { describe, expect, it } from "vitest";
import { caminhoDevolucao, qtdDigitada, saldoDevolucao } from "../devolucaoPedido";

describe("saldoDevolucao", () => {
  it("desconta o que já voltou em devoluções anteriores", () => {
    const s = saldoDevolucao([{ id: "a", quantidade: 3 }, { id: "b", quantidade: 1 }], [
      { itens: [{ item_id: "a", quantidade: 1 }] }, { itens: [{ item_id: "a", quantidade: 1 }, { item_id: "b", quantidade: 1 }] },
    ]);
    expect(s.get("a")).toEqual({ vendido: 3, devolvido: 2, disponivel: 1 });
    expect(s.get("b")?.disponivel).toBe(0);
  });
  it("sem devolução, tudo disponível", () => {
    expect(saldoDevolucao([{ id: "a", quantidade: 2 }], []).get("a")?.disponivel).toBe(2);
  });
});

describe("caminhoDevolucao", () => {
  it("NF autorizada de produção vai pela NF de devolução", () => {
    expect(caminhoDevolucao([{ id: "t", status: "autorizada", ambiente: "homologacao" }, { id: "n", status: "autorizada", ambiente: "producao" }]))
      .toEqual({ tipo: "nf", nota: { id: "n", status: "autorizada", ambiente: "producao" } });
  });
  it("NF ainda na SEFAZ espera", () => {
    expect(caminhoDevolucao([{ id: "n", status: "processando" }]).tipo).toBe("aguardar");
  });
  it("nota de teste ou cancelada não conta: devolve pelo pedido", () => {
    expect(caminhoDevolucao([{ id: "t", status: "autorizada", ambiente: "homologacao" }, { id: "c", status: "cancelada" }]).tipo).toBe("sem_nf");
    expect(caminhoDevolucao().tipo).toBe("sem_nf");
  });
});

it("qtdDigitada aceita vírgula", () => {
  expect(qtdDigitada("1,5")).toBe(1.5);
  expect(qtdDigitada("")).toBe(0);
});
