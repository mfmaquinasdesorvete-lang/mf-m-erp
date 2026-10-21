import { describe, expect, it } from "vitest";
import { camposMudados, mensagemConflito, mesmoValor, sincronizada } from "../sincronizacao";

describe("sincronização das gravações", () => {
  it("compara como o banco: vazio = vazio, número como número", () => {
    expect(mesmoValor(null, "")).toBe(true);
    expect(mesmoValor(undefined, null)).toBe(true);
    expect(mesmoValor("10.50", 10.5)).toBe(true);
    expect(mesmoValor(0, null)).toBe(false);
    expect(mesmoValor(["a"], ["a"])).toBe(true);
    expect(mesmoValor("aberto", "pago")).toBe(false);
  });
  it("manda só o que mudou, com o valor de antes", () => {
    const antes = { id: "1", versao: 3, valor: 100, descricao: "Peças", obs: null, cliente: { nome: "X" } };
    const depois = { id: "1", versao: 3, valor: "100.00", descricao: "Peças novas", obs: "", cliente: { nome: "X" }, __antes: antes, extra: undefined };
    expect(camposMudados(antes, depois)).toEqual({ descricao: { antes: "Peças", depois: "Peças novas" } });
  });
  it("não manda junção de outra tabela nem campos de controle", () => {
    expect(camposMudados({}, { numero: 5, created_at: "x", fornecedor: { nome: "Y" }, rateio: [{ c: 1 }] })).toEqual({ rateio: { antes: null, depois: [{ c: 1 }] } });
  });
  it("explica o conflito em português", () => {
    const m = mensagemConflito([{ campo: "vencimento", antes: "2026-10-20", seu: "2026-10-30", atual: "2026-10-25" }, { campo: "valor", antes: 10, seu: 1500, atual: 12 }]);
    expect(m).toContain("O vencimento: agora está 25/10/2026; você colocou 30/10/2026.");
    expect(m).toContain("O valor: agora está 12; você colocou 1.500.");
  });
  it("só pedidos e contas por enquanto", () => {
    expect(sincronizada("pedidos")).toBe(true);
    expect(sincronizada("contas_pagar")).toBe(true);
    expect(sincronizada("clientes")).toBe(false);
  });
});
