import { describe, expect, it } from "vitest";
import { descreverAparelho, duracao, online, quandoAcesso, ultimoPorPessoa, type Acesso } from "../acessos";

describe("acessos ao ERP", () => {
  it("aparelho e navegador pelo navegador da pessoa", () => {
    expect(descreverAparelho("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"))
      .toEqual({ dispositivo: "Celular · iPhone", navegador: "Safari" });
    expect(descreverAparelho("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0"))
      .toEqual({ dispositivo: "Computador · Windows", navegador: "Edge" });
    expect(descreverAparelho("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36"))
      .toEqual({ dispositivo: "Celular · Android", navegador: "Chrome" });
    expect(descreverAparelho("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) CriOS/120.0 Mobile/15E148").dispositivo).toBe("Tablet · iPad");
  });

  it("online, duração e quando", () => {
    const agora = Date.parse("2026-10-17T15:00:00Z");
    expect(online({ ultimo_sinal_em: "2026-10-17T14:55:00Z" }, agora)).toBe(true);
    expect(online({ ultimo_sinal_em: "2026-10-17T14:40:00Z" }, agora)).toBe(false);
    expect(duracao({ entrou_em: "2026-10-17T11:12:00Z", ultimo_sinal_em: "2026-10-17T12:40:00Z" })).toBe("1h28");
    expect(duracao({ entrou_em: "2026-10-17T11:12:00Z", ultimo_sinal_em: "2026-10-17T11:17:00Z" })).toBe("5 min");
    expect(quandoAcesso("2026-10-17T11:12:00Z", new Date(agora))).toBe("hoje às 08:12");
    expect(quandoAcesso("2026-10-16T20:40:00Z", new Date(agora))).toBe("ontem às 17:40");
    expect(quandoAcesso("2026-10-12T12:05:00Z", new Date(agora))).toBe("12/10 às 09:05");
  });

  it("último sinal de cada pessoa", () => {
    const a = (user_id: string, ultimo_sinal_em: string) => ({ id: 1, user_id, nome: null, entrou_em: ultimo_sinal_em, ultimo_sinal_em, dispositivo: null, navegador: null, ip: null }) as Acesso;
    const m = ultimoPorPessoa([a("u1", "2026-10-16T10:00:00Z"), a("u1", "2026-10-17T10:00:00Z"), a("u2", "2026-10-01T10:00:00Z")]);
    expect(m.get("u1")).toBe("2026-10-17T10:00:00Z");
    expect(m.get("u2")).toBe("2026-10-01T10:00:00Z");
  });
});
