import { describe, expect, it } from "vitest";
import { categoriaDe, proximos, resumoMes, saldoConta, type ContaPessoal, type LancPessoal } from "../pessoal";

const conta: ContaPessoal = { id: "c1", nome: "Conta", tipo: "corrente", banco: null, cor: "sky", saldo_inicial: 1000, saldo_inicial_em: "2026-10-01", limite: null, ativa: true, ordem: 0 };
const l = (x: Partial<LancPessoal>): LancPessoal => ({ id: Math.random().toString(), conta_id: "c1", data: "2026-10-05", descricao: "", valor: -10, categoria: "Outros", situacao: "realizado", anulado: false, ...x });

describe("painel pessoal", () => {
  it("adivinha a categoria pelo texto do extrato", () => {
    expect(categoriaDe("PIX ENVIADO SUPERMERCADO EXEMPLO")).toBe("Mercado");
    expect(categoriaDe("DROGARIA EXEMPLO 123")).toBe("Saúde");
    expect(categoriaDe("NETFLIX.COM")).toBe("Assinaturas");
    expect(categoriaDe("Pró-labore outubro")).toBe("Salário e pró-labore");
    expect(categoriaDe("PAGAMENTO FATURA CARTAO")).toBe("Cartão (fatura)");
    expect(categoriaDe("algo sem regra")).toBe("Outros");
  });

  it("saldo: inicial mais o realizado desde a data do saldo inicial (sem previstos nem anulados)", () => {
    const lancs = [l({ valor: -100 }), l({ valor: 50, data: "2026-09-30" }), l({ valor: -30, situacao: "previsto" }), l({ valor: -40, anulado: true }), l({ valor: 200, data: "2026-10-10" })];
    expect(saldoConta(conta, lancs)).toBe(1100);
    expect(saldoConta(conta, lancs, "2026-10-06")).toBe(900);
  });

  it("resumo do mês sem transferências entre as próprias contas e fatura do cartão", () => {
    const r = resumoMes([l({ valor: 5000, categoria: "Salário e pró-labore" }), l({ valor: -300, categoria: "Mercado" }), l({ valor: -100, categoria: "Mercado" }),
      l({ valor: -80, categoria: "Saúde" }), l({ valor: -1000, categoria: "Transferências" }), l({ valor: -900, categoria: "Cartão (fatura)" }), l({ valor: -50, data: "2026-09-01" })], "2026-10");
    expect(r.entrou).toBe(5000);
    expect(r.saiu).toBe(480);
    expect(r.categorias[0]).toEqual({ nome: "Mercado", valor: 400 });
  });

  it("próximos: só previstos de hoje em diante, em ordem", () => {
    const p = proximos([l({ situacao: "previsto", data: "2026-10-20" }), l({ situacao: "previsto", data: "2026-10-18" }), l({ situacao: "previsto", data: "2026-10-01" })], "2026-10-17");
    expect(p.map((x) => x.data)).toEqual(["2026-10-18", "2026-10-20"]);
  });
});
