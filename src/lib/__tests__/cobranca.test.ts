import { describe, expect, it } from "vitest";
import { dataDaEtapa, filaCobranca, resumoCobranca, type ContaCobranca, type Etapa } from "../cobranca";

describe("resumoCobranca", () => {
  const conta = (p: Partial<ContaCobranca>): ContaCobranca => ({ id: Math.random().toString(), cliente_id: "a", descricao: "x", valor: 100, vencimento: "2026-10-01", status: "aberto", ...p });
  it("separa atrasado por faixa, a vencer, recebido no mês e devedores", () => {
    const r = resumoCobranca([
      conta({ vencimento: "2026-10-10", valor: 100 }),                       // 9 dias
      conta({ vencimento: "2026-07-01", valor: 300, cliente_id: "b" }),      // 110 dias
      conta({ vencimento: "2026-10-22", valor: 50 }),                        // a vencer
      conta({ vencimento: "2026-10-05", status: "pago", valor_pago: 200, data_pagamento: "2026-10-06" }),
      conta({ vencimento: "2026-09-01", status: "cancelado", valor: 999 }),
    ], "2026-10-19");
    expect(r.atrasado).toBe(400);
    expect(r.aVencer).toBe(50);
    expect(r.recebidoMes).toBe(200);
    expect(r.faixas[0]).toMatchObject({ valor: 100, qtd: 1 });
    expect(r.faixas[4]).toMatchObject({ valor: 300, qtd: 1 });
    expect(r.devedores[0]).toMatchObject({ cliente_id: "b", valor: 300, dias: 110 });
    expect(r.meses[r.meses.length - 1]).toEqual({ mes: "2026-10", recebido: 200 });
    expect(r.inadimplencia).toBe(80); // 400 atrasado ÷ 500 vencido no ano (a cancelada não conta)
  });
});

describe("parcela no cartão", () => {
  const etapa = (evento: "vencimento" | "criacao" | "pagamento", dias = 0): Etapa => ({ id: evento, evento, dias, nome: evento, canal_email: true, canal_whatsapp: true, assunto: "", mensagem: "", ativo: true, ordem: 1 });
  const conta = (p: Partial<ContaCobranca>): ContaCobranca => ({ id: "c", cliente_id: "a", descricao: "x", valor: 315, vencimento: "2026-10-20", status: "aberto", created_at: "2026-10-01T10:00:00Z", ...p });
  it("quem paga é a maquininha: sem lembrete nem cobrança ao cliente", () => {
    expect(dataDaEtapa(etapa("vencimento", -3), conta({ forma_pagamento: "cartao" }))).toBeNull();
    expect(dataDaEtapa(etapa("criacao"), conta({ forma_pagamento: "cartao" }))).toBeNull();
    expect(filaCobranca([conta({ forma_pagamento: "cartao" })], [etapa("vencimento")], [], "2026-10-20")).toHaveLength(0);
  });
  it("boleto e Pix continuam na régua; o obrigado do pagamento vale para o cartão", () => {
    expect(dataDaEtapa(etapa("vencimento"), conta({ forma_pagamento: "boleto" }))).toBe("2026-10-20");
    expect(dataDaEtapa(etapa("pagamento"), conta({ forma_pagamento: "cartao", status: "pago", data_pagamento: "2026-10-21" }))).toBe("2026-10-21");
  });
});
