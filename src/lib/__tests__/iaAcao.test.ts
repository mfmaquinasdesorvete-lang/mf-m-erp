import { describe, expect, it } from "vitest";
import { limparNome, normalizarAcao, ordenarContas } from "../../../supabase/functions/_shared/ia-acao";

describe("IA que prepara ações", () => {
  it("ação fora da lista vira nenhuma; valor e data conferidos; mensagem só na ação mensagem", () => {
    expect(normalizarAcao({ acao: "apagar_tudo" }, "x").acao).toBe("nenhuma");
    const a = normalizarAcao({ acao: "baixa_receber", quem: " Gelato ", valor: 500.555, data: "24/10/2026", mensagem: "oi" }, "x");
    expect(a).toMatchObject({ acao: "baixa_receber", quem: "Gelato", valor: 500.56, data: null, mensagem: null });
    expect(normalizarAcao({ acao: "baixa_pagar", valor: -3 }, "x").valor).toBeNull();
    expect(normalizarAcao({ acao: "mensagem", mensagem: "máquina pronta" }, "x").mensagem).toBe("máquina pronta");
  });
  it("conta com o mesmo valor vem primeiro, depois a que vence antes", () => {
    const c = (id: string, valor: number, vencimento: string) => ({ id, descricao: null, valor, vencimento, quem: null });
    expect(ordenarContas([c("a", 300, "2026-09-01"), c("b", 500, "2026-11-01"), c("c", 200, "2026-08-01")], 500).map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(ordenarContas([c("a", 300, "2026-09-01"), c("c", 200, "2026-08-01")], null).map((x) => x.id)).toEqual(["c", "a"]);
  });
  it("nome sem os caracteres que quebram o filtro", () => {
    expect(limparNome("Gelato, (Nobre).")).toBe("Gelato Nobre");
  });
});
