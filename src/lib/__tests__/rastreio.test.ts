import { describe, expect, it } from "vitest";
import { grupoRastreio, mensagemRastreio } from "../rastreio";

const base = { status: "transito" as const, codigo_rastreio: "RDN1", entrega_prevista: "2026-10-25", entregue_em: null };

describe("rastreio das entregas", () => {
  it("separa sem código, a caminho, atrasado e entregue", () => {
    expect(grupoRastreio({ ...base, codigo_rastreio: null }, "2026-10-21")).toBe("sem_codigo");
    expect(grupoRastreio(base, "2026-10-21")).toBe("a_caminho");
    expect(grupoRastreio(base, "2026-10-26")).toBe("atrasado");
    expect(grupoRastreio({ ...base, status: "entregue", entregue_em: "2026-10-20" }, "2026-10-21")).toBe("entregue");
    expect(grupoRastreio({ ...base, status: "entregue", entregue_em: "2026-09-01" }, "2026-10-21")).toBeNull();
    expect(grupoRastreio({ ...base, status: "cotacao" }, "2026-10-21")).toBeNull();
    expect(grupoRastreio({ ...base, status: "coleta", codigo_rastreio: null }, "2026-10-21")).toBeNull();
  });
  it("mensagem do WhatsApp com o primeiro nome, código e link", () => {
    const m = mensagemRastreio({ cliente: "Maria Souza", pedido: 103, transportadora: "Rodonaves", codigo: "RDN1", link: "https://x.com/r/RDN1", previsao: "2026-10-25" });
    expect(m).toContain("Olá, Maria!");
    expect(m).toContain("#103");
    expect(m).toContain("Código de rastreio: RDN1");
    expect(m).toContain("25/10/2026");
    expect(m).toContain("https://x.com/r/RDN1");
    expect(mensagemRastreio({ codigo: "X" })).not.toContain("Transportadora");
  });
});
