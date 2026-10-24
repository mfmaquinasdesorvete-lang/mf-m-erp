import { describe, expect, it } from "vitest";
import { montarPedidoTexto, normalizarTexto } from "../../../supabase/functions/_shared/ia-texto";

describe("IA do texto para o cliente", () => {
  it("o pedido leva os dados do cliente, as contas vencidas e as OS", () => {
    const t = montarPedidoTexto("Cobrar a parcela", null, "curto", {
      cliente: { nome: "Gelato Nobre", pessoa_fisica: false, cidade: "Florianópolis" },
      pedidos: [{ numero: 12, status: "faturado", total: 1500, data: "10/10/2026", rastreio: null }],
      contas: [{ descricao: "Parcela 2/3", valor: 500, vencimento: "20/10/2026", vencida: true }],
      os: [],
    }, "24/10/2026");
    expect(t).toContain("Tom: curto");
    expect(t).toContain("Gelato Nobre (empresa), Florianópolis");
    expect(t).toMatch(/Parcela 2\/3 · R\$\s?500,00 · vence 20\/10\/2026 · VENCIDA/);
    expect(t).toContain("OS em andamento:\n(nenhum)");
    expect(t).toContain("O cliente não mandou mensagem");
  });
  it("limpa o texto e os avisos", () => {
    expect(normalizarTexto({ texto: "\"Olá!  \n\n\n\nTudo bem?\"", avisos: ["  Confira o prazo ", 3, ""] }))
      .toEqual({ texto: "Olá!\n\nTudo bem?", avisos: ["Confira o prazo"] });
    expect(normalizarTexto({})).toEqual({ texto: "", avisos: [] });
  });
});
