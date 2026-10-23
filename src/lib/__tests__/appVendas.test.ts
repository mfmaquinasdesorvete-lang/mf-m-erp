import { describe, expect, it } from "vitest";
import { abrirAppVendas, combina, numeroWhatsApp, resumoVendas, type PedidoApp } from "../appVendas";

const p = (o: Partial<PedidoApp>): PedidoApp => ({ id: Math.random().toString(), numero: 1, status: "aprovado", valor_total: 100, created_at: "2026-10-05T10:00:00Z", ...o });

describe("app de vendas", () => {
  it("vendas do mês, comparação até o mesmo dia e orçamentos", () => {
    const r = resumoVendas([
      p({ valor_total: 1000, aprovado_em: "2026-10-10T10:00:00Z" }),
      p({ valor_total: 500, status: "faturado", aprovado_em: "2026-10-02T10:00:00Z" }),
      p({ valor_total: 999, status: "orcamento" }),
      p({ valor_total: 300, status: "cancelado" }),
      p({ valor_total: 1000, aprovado_em: "2026-09-15T10:00:00Z", created_at: "2026-09-15T10:00:00Z" }),
      p({ valor_total: 800, aprovado_em: "2026-09-25T10:00:00Z", created_at: "2026-09-25T10:00:00Z" }), // depois do dia 19: não entra
    ], "2026-10-19");
    expect(r.valor).toBe(1500);
    expect(r.qtd).toBe(2);
    expect(r.ticket).toBe(750);
    expect(r.variacao).toBe(50);
    expect(r.orcamentos).toBe(1);
    expect(r.valorOrcamentos).toBe(999);
    expect(r.aprovados).toBe(3);
  });
  it("venda aprovada às 22h de 31/10 (01h de 01/11 em UTC) conta em outubro", () => {
    const r = resumoVendas([p({ valor_total: 700, aprovado_em: "2026-11-01T01:00:00Z" })], "2026-10-31");
    expect(r.valor).toBe(700);
  });
  it("só os pedidos do vendedor", () => {
    const r = resumoVendas([p({ vendedor_id: "a", aprovado_em: "2026-10-10" }), p({ vendedor_id: "b", aprovado_em: "2026-10-10" })], "2026-10-19", "a");
    expect(r.qtd).toBe(1);
    expect(r.variacao).toBeNull();
  });
  it("WhatsApp com 55", () => {
    expect(numeroWhatsApp("(48) 99999-0000")).toBe("5548999990000");
    expect(numeroWhatsApp("5548999990000")).toBe("5548999990000");
    expect(numeroWhatsApp("1234")).toBeNull();
  });
  it("busca sem acento e por documento", () => {
    expect(combina("Sorveteria São João · Joinville", "sao joao")).toBe(true);
    expect(combina("Cliente 12.345.678/0001-90", "12345678")).toBe(true);
    expect(combina("Outro", "joao")).toBe(false);
  });
  it("abre no app pelo celular para quem é de vendas", () => {
    expect(abrirAppVendas(null, 400, "vendas")).toBe(true);
    expect(abrirAppVendas(null, 400, "admin")).toBe(false);
    expect(abrirAppVendas("1", 400, "admin")).toBe(true);
    expect(abrirAppVendas("0", 400, "vendas")).toBe(false);
    expect(abrirAppVendas(null, 1200, "vendas")).toBe(false);
  });
});
