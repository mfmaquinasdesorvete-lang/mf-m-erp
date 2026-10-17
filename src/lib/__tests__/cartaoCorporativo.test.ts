import { describe, expect, it } from "vitest";
import {
  casarNotas, categoriaCartao, estadoNota, intervaloCartao, lojaDoGasto, resumoCartao, type GastoCartao,
} from "../cartaoCorporativo";

const g = (x: Partial<GastoCartao>): GastoCartao => ({ id: "g", data: "2026-10-16", valor: -10, descricao: "LOJA · mfmaquinas", situacao: "pendente", ...x });

describe("categoria do gasto pela loja", () => {
  it.each([
    ["PADARIA CENTRAL · mfmaquinas", "alimentacao"],
    ["MP *RESTAURANTEX · mfmaquinas", "alimentacao"],
    ["JIM.COM* ESPETARIA DO ZE · mfmaquinas", "alimentacao"],
    ["SUPERMERCADO EXEMPLO · mfmaquinas", "mercado"],
    ["ATACADISTA EXEMPLO LJ1 · mfmaquinas", "mercado"],
    ["ExemploAutoPosto · mfmaquinas", "combustivel"],
    ["AUTO POSTO EXEMPLO · mfmaquinas", "combustivel"],
    ["ELETRO MATERIAIS EXEMPLO · mfmaquinas", "material"],
    ["CASA DOS PARAF · mfmaquinas", "material"],
    ["DROGARIA EXEMPLO · mfmaquinas", "farmacia"],
    ["ESTACIONAMENTO PARKING · mfmaquinas", "veiculo"],
    ["ENERGIA EXEMPLO · Pagamento efetuado", "contas"],
    ["DARE SANTA CATARINA · Pagamento efetuado", "imposto"],
    ["Pix FULANO DE TAL · Enviado", "pix"],
    ["Pix MF MAQUINAS LTDA · Enviado", "transferencia"],
    ["LOJA SEM PISTA · mfmaquinas", "outros"],
  ])("%s → %s", (d, c) => expect(categoriaCartao(d, -10)).toBe(c));

  it("imposto não vira posto de combustível e Pix a funcionário não pede nota", () => {
    expect(categoriaCartao("COMPOSTO QUIMICO LTDA · mfmaquinas", -10)).not.toBe("combustivel");
    expect(categoriaCartao("Pix JOAO DA SILVA · Enviado", -10, [{ nome: "João da Silva" }])).toBe("funcionario");
  });

  it("nome da loja legível", () => {
    expect(lojaDoGasto("MP *RESTAURANTEX · mfmaquinas")).toBe("Restaurantex");
    expect(lojaDoGasto("PADARIA CENTRAL ESQUI · mfmaquinas")).toBe("Padaria Central Esqui");
    expect(lojaDoGasto("Pix FULANO DE TAL · Enviado")).toBe("Fulano De Tal");
  });
});

describe("nota de cada compra", () => {
  it("casa compra × NF-e pelo valor e até 5 dias, uma nota por compra", () => {
    const gastos = [g({ id: "a", valor: -150.5, data: "2026-10-10" }), g({ id: "b", valor: -150.5, data: "2026-10-13" }), g({ id: "c", valor: -99, data: "2026-10-10" })];
    const m = casarNotas(gastos, [
      { id: "n1", emitente_nome: "Loja", valor_total: 150.5, data_emissao: "2026-10-12" },
      { id: "n2", emitente_nome: "Outra", valor_total: 99, data_emissao: "2026-10-30" },
    ]);
    expect(m.get("b")?.id).toBe("n1");
    expect(m.has("a")).toBe(false);
    expect(m.has("c")).toBe(false);
  });

  it("estado: ok, falta, pedida, sem nota, pessoal e não precisa", () => {
    expect(estadoNota(g({}), "alimentacao")).toBe("falta");
    expect(estadoNota(g({ situacao: "pedida" }), "alimentacao")).toBe("pedida");
    expect(estadoNota(g({ situacao: "recebida" }), "alimentacao")).toBe("ok");
    expect(estadoNota(g({ conta_pagar_id: "cp" }), "material")).toBe("ok");
    expect(estadoNota(g({}), "material", { id: "n", emitente_nome: null, valor_total: 10, data_emissao: "2026-10-16" })).toBe("ok");
    expect(estadoNota(g({}), "tarifa")).toBe("nao_precisa");
    expect(estadoNota(g({ situacao: "pessoal" }), "farmacia")).toBe("pessoal");
  });

  it("resumo do período sem transferências entre contas e sem repetidos", () => {
    const r = resumoCartao([
      g({ id: "1", valor: -30, descricao: "PADARIA X · mfmaquinas" }),
      g({ id: "2", valor: -200, descricao: "AUTO POSTO Y · mfmaquinas", situacao: "recebida" }),
      g({ id: "3", valor: -50, descricao: "DROGARIA Z · mfmaquinas", situacao: "pessoal" }),
      g({ id: "4", valor: -5000, descricao: "Pix MF MAQUINAS LTDA · Enviado" }),
      g({ id: "5", valor: -30, descricao: "PADARIA X · mfmaquinas", identificador: "dup" }),
      g({ id: "6", valor: -30, descricao: "PADARIA X · mfmaquinas", identificador: "dup" }),
    ]);
    expect(r.total).toBe(310);
    expect(r.n).toBe(4);
    expect(r.porCategoria.map((l) => l.categoria)).toEqual(["combustivel", "alimentacao", "farmacia"]);
    expect([r.precisam, r.comNota, r.falta, r.faltaValor, r.pessoal, r.pctComNota]).toEqual([3, 1, 2, 60, 1, 33]);
  });

  it("períodos", () => {
    expect(intervaloCartao("hoje", "2026-10-17")).toEqual({ de: "2026-10-17", ate: "2026-10-17" });
    expect(intervaloCartao("7dias", "2026-10-17")).toEqual({ de: "2026-10-11", ate: "2026-10-17" });
    expect(intervaloCartao("mes_passado", "2026-10-17")).toEqual({ de: "2026-09-01", ate: "2026-09-30" });
  });
});
