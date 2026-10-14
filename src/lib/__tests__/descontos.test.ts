import { describe, expect, it } from "vitest";
import { formaPdv, maximoDesconto, pctTexto, rotuloRegra, type RegraDesconto } from "../descontos";

const regra = (id: string, canal: string, forma_pagamento: string, maximo_percentual: number, ativo = true): RegraDesconto =>
  ({ id, canal, forma_pagamento, maximo_percentual, ativo, observacao: null });

const REGRAS: RegraDesconto[] = [
  regra("geral", "todos", "qualquer", 5),
  regra("pix", "todos", "pix", 8),
  regra("balcao", "balcao", "qualquer", 3),
  regra("balcao-dinheiro", "balcao", "dinheiro", 10),
  regra("rep-cartao-inativa", "representante", "cartao", 30, false),
];

describe("maximoDesconto (tipo de venda + pagamento > tipo de venda > pagamento > todas)", () => {
  it("a regra mais específica vence", () => {
    expect(maximoDesconto(REGRAS, "balcao", "dinheiro")?.max).toBe(10);
    expect(maximoDesconto(REGRAS, "balcao", "pix")?.regra.id).toBe("balcao"); // tipo de venda ganha do pagamento
    expect(maximoDesconto(REGRAS, "whatsapp", "pix")?.max).toBe(8);
    expect(maximoDesconto(REGRAS, "whatsapp", "boleto")?.max).toBe(5);
  });

  it("regra inativa não vale; sem canal ou forma usa 'todos'/'qualquer'", () => {
    expect(maximoDesconto(REGRAS, "representante", "cartao")?.regra.id).toBe("geral");
    expect(maximoDesconto(REGRAS, null, undefined)?.regra.id).toBe("geral");
    expect(maximoDesconto(REGRAS, "", "")?.regra.id).toBe("geral");
  });

  it("sem regra que sirva: sem limite (null)", () => {
    expect(maximoDesconto([], "balcao", "pix")).toBeNull();
    expect(maximoDesconto([regra("so-loja", "loja", "qualquer", 4)], "balcao", "pix")).toBeNull();
  });

  it("percentual gravado como texto vira número", () => {
    const r = maximoDesconto([{ ...regra("x", "todos", "qualquer", 0), maximo_percentual: "7.5" as unknown as number }], "loja", "pix");
    expect(r?.max).toBe(7.5);
  });
});

describe("formaPdv (forma da venda do PDV = a do maior pagamento)", () => {
  it("mapeia o meio do maior pagamento", () => {
    expect(formaPdv([{ meio: "pix", valor: 100 }, { meio: "dinheiro", valor: 250.5 }])).toBe("dinheiro");
    expect(formaPdv([{ meio: "cartao_debito", valor: 80 }])).toBe("cartao");
    expect(formaPdv([{ meio: "cartao_credito", valor: 80 }])).toBe("cartao");
    expect(formaPdv([{ meio: "prazo", valor: 1500 }, { meio: "pix", valor: 500 }])).toBe("boleto");
    expect(formaPdv([{ meio: "transferencia", valor: 10 }])).toBe("transferencia");
    expect(formaPdv([{ meio: "outro", valor: 10 }])).toBe("pix");
  });

  it("sem pagamento: null; não mexe na lista recebida", () => {
    expect(formaPdv([])).toBeNull();
    const pags = [{ meio: "pix", valor: 1 }, { meio: "dinheiro", valor: 2 }];
    formaPdv(pags);
    expect(pags[0].meio).toBe("pix");
  });
});

describe("textos", () => {
  it("percentual e rótulo da regra", () => {
    expect(pctTexto(12.5)).toBe("12,5%");
    expect(pctTexto(7.456)).toBe("7,46%");
    expect(rotuloRegra("balcao", "dinheiro")).toBe("Balcão (PDV) · Dinheiro");
    expect(rotuloRegra("todos", "qualquer")).toBe("Todas as vendas");
  });
});
