import { describe, expect, it } from "vitest";
import { contasRepetidas, ehCombustivel, estabelecimento, resumoPorMes, resumoPorTipo, tipoLancamento } from "../extratoTipos";

describe("tipoLancamento", () => {
  it("entradas", () => {
    expect(tipoLancamento("Pix 12.345.678 FULANO DE TAL", 500)).toBe("pix_recebido");
    expect(tipoLancamento("Vendas · Depósito InfinitePay", 21127.64)).toBe("vendas_cartao");
    expect(tipoLancamento("Reembolso FARMACIA CENTRAL · cartao", 20)).toBe("outra_entrada");
  });
  it("saídas", () => {
    expect(tipoLancamento("POSTO ESTRELA DO SUL LTDA · cartao", -200)).toBe("combustivel");
    expect(tipoLancamento("AUTO POSTO BOA VIAGEM · cartao", -150)).toBe("combustivel");
    expect(tipoLancamento("AUTOBAN · cartao", -12.3)).toBe("pedagio");
    expect(tipoLancamento("Pix FORNECEDOR EXEMPLO LTDA · Enviado", -100)).toBe("pix_enviado");
    expect(tipoLancamento("Tarifa de manutenção", -15)).toBe("tarifa");
    expect(tipoLancamento("SUPERMERCADO BOM PRECO · cartao", -80)).toBe("outra_saida");
  });
  it("imposto não é posto", () => {
    expect(tipoLancamento("Pagamento de imposto DARF", -900)).toBe("outra_saida");
    expect(ehCombustivel("Imposto")).toBe(false);
    expect(ehCombustivel("Comercial de Combustíveis Ltda")).toBe(true);
  });
});

describe("resumos", () => {
  const l = [
    { data: "2026-09-02", valor: 100, descricao: "Pix A", identificador: "1" },
    { data: "2026-09-03", valor: 50, descricao: "Pix B", identificador: "2" },
    { data: "2026-09-03", valor: 50, descricao: "Pix B", identificador: "2" }, // mesmo arquivo em outra conta
    { data: "2026-10-01", valor: -30, descricao: "POSTO X", identificador: "3" },
  ];
  it("conta cada lançamento uma vez", () => {
    const r = resumoPorTipo(l);
    expect(r.pix_recebido).toEqual({ n: 2, total: 150 });
    expect(r.combustivel).toEqual({ n: 1, total: -30 });
  });
  it("mês a mês", () => {
    expect(resumoPorMes(l)).toEqual([
      { mes: "2026-10", pix_n: 0, pix: 0, vendas: 0, entradas: 0, saidas: 30 },
      { mes: "2026-09", pix_n: 2, pix: 150, vendas: 0, entradas: 150, saidas: 0 },
    ]);
  });
  it("acha contas com o mesmo extrato", () => {
    const x = [...Array(6)].flatMap((_, i) => [{ conta_bancaria_id: "a", identificador: `f${i}` }, { conta_bancaria_id: "b", identificador: `f${i}` }]);
    expect(contasRepetidas([...x, { conta_bancaria_id: "c", identificador: "z" }])).toEqual([{ a: "a", b: "b", iguais: 6 }]);
  });
  it("nome do estabelecimento", () => {
    expect(estabelecimento("POSTO ESTRELA DO SUL LTDA · cartao")).toBe("Posto Estrela Do Sul Ltda");
  });
});
