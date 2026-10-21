import { describe, expect, it } from "vitest";
import { clonarVenda } from "../clonarVenda";

describe("clonar venda", () => {
  it("copia cliente, itens, pagamento e frete, sem número, situação, nota nem série", () => {
    const n = clonarVenda({
      id: "x", numero: 3121, status: "entregue", cliente_id: "c1", origem: "telefone", forma_pagamento: "pix", parcelas: 2, intervalo_dias: 15,
      modalidade_frete: 0, frete: 120, transportadora_id: "t1", desconto: 50, codigo_rastreio: "AA1", proposta_token: "tk", marcadores: ["m"],
      itens: [{ id: "i1", produto_id: "p1", descricao: "Máquina", quantidade: 1, valor_unitario: 20000, numero_serie: "031023" }],
    } as any);
    expect(n).toMatchObject({ status: "orcamento", cliente_id: "c1", origem: "telefone", forma_pagamento: "pix", parcelas: 2, frete: 120, transportadora_id: "t1", desconto: 50 });
    expect(n).not.toHaveProperty("id");
    expect(n).not.toHaveProperty("numero");
    expect(n).not.toHaveProperty("codigo_rastreio");
    expect(n).not.toHaveProperty("marcadores");
    expect(n.itens).toEqual([{ produto_id: "p1", descricao: "Máquina", quantidade: 1, valor_unitario: 20000 }]);
  });
});
