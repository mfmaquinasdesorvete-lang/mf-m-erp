import { describe, expect, it } from "vitest";
import { CONDICAO_REMOTA, deCampoHora, osDoPedido, paraCampoHora, quandoAgendado, valorVideo } from "../osVideo";

describe("OS por vídeo chamada", () => {
  it("mão de obra = horas × valor da hora, zero na garantia", () => {
    expect(valorVideo(1, 150)).toBe(150);
    expect(valorVideo(1.5, 150)).toBe(225);
    expect(valorVideo(null, 150)).toBe(0);
    expect(valorVideo(2, 150, true)).toBe(0);
  });

  it("campo de data e hora vai e volta", () => {
    const iso = deCampoHora("2026-10-20T14:30")!;
    expect(paraCampoHora(iso)).toBe("2026-10-20T14:30");
    expect(quandoAgendado(iso)).toBe("20/10 às 14:30");
    expect(deCampoHora("")).toBeNull();
  });

  it("pedido só de peças abre OS por vídeo com a peça no defeito", () => {
    const os = osDoPedido({ id: "p1", numero: 609, cliente_id: "c1", itens: [{ produto_id: "x", descricao: "Anel de vedação" }] }, () => false);
    expect(os.atendimento).toBe("video");
    expect(os.equipamento).toBe("");
    expect(os.horas_tecnicas).toBe(1);
    expect(os.condicao_entrada).toBe(CONDICAO_REMOTA);
    expect(os.defeito_relatado).toContain("Anel de vedação");
    expect(os.defeito_relatado).toContain("#609");
  });

  it("pedido com máquina abre OS na oficina com a máquina", () => {
    const os = osDoPedido({ id: "p1", numero: 7, cliente_id: "c1", itens: [{ produto_id: "pc", descricao: "Peça" }, { produto_id: "m", descricao: "Máquina Soft", numero_serie: "S1" }] }, (id) => id === "m");
    expect(os.atendimento).toBe("oficina");
    expect(os.equipamento).toBe("Máquina Soft");
    expect(os.numero_serie).toBe("S1");
  });
});

describe("termo e passos da vídeo chamada", () => {
  it("termo traz valor, Pix antes de agendar e pede ACEITO", async () => {
    const { termoVideo } = await import("../osVideo");
    const t = termoVideo({ numero: 93, horas: 1, valorHora: 150, nome: "Ana", pix: "000201PIX" });
    expect(t).toContain("OS #93");
    expect(t).toMatch(/150,00/);
    expect(t).toContain("antes");
    expect(t).toContain("ACEITO");
    expect(t).toContain("000201PIX");
    const g = termoVideo({ numero: 1, horas: 1, valorHora: 150, emGarantia: true, pix: "000201PIX" });
    expect(g).toContain("garantia");
    expect(g).not.toContain("000201PIX");
  });
  it("passos: aceite → Pix → agendar (garantia pula o Pix)", async () => {
    const { passoVideo } = await import("../osVideo");
    expect(passoVideo({})).toBe(1);
    expect(passoVideo({ aceito: true })).toBe(2);
    expect(passoVideo({ aceito: true, emGarantia: true })).toBe(3);
    expect(passoVideo({ aceito: true, pago: true, agendado: true })).toBe(4);
  });
});
