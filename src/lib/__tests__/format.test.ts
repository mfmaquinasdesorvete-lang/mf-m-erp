import { afterEach, describe, expect, it, vi } from "vitest";
import { brl, docFormat, hoje, somarDias, whatsappLink } from "../format";

// o Intl separa "R$" do número com espaço não separável (U+00A0)
const sp = (s: string) => s.replace(/\s/g, " ");

describe("brl", () => {
  it("formata em reais com milhar e 2 casas", () => {
    expect(sp(brl(1234.56))).toBe("R$ 1.234,56");
    expect(sp(brl(18900))).toBe("R$ 18.900,00");
    expect(sp(brl("249.9"))).toBe("R$ 249,90");
    expect(sp(brl(0.1 + 0.2))).toBe("R$ 0,30");
  });

  it("vazio vira R$ 0,00 e negativo leva o sinal", () => {
    expect(sp(brl(null))).toBe("R$ 0,00");
    expect(sp(brl(undefined))).toBe("R$ 0,00");
    expect(sp(brl(-10))).toBe("-R$ 10,00");
  });
});

describe("documentos e contato", () => {
  it("CPF e CNPJ formatados", () => {
    expect(docFormat("12345678901")).toBe("123.456.789-01");
    expect(docFormat("12.345.678/0001-95")).toBe("12.345.678/0001-95");
    expect(docFormat("123")).toBe("123");
  });

  it("WhatsApp sem DDI ganha +55", () => {
    expect(whatsappLink("(48) 99999-0000", "Olá, tudo bem?")).toBe("https://wa.me/5548999990000?text=Ol%C3%A1%2C%20tudo%20bem%3F");
    expect(whatsappLink("+55 48 99999-0000", "x")).toBe("https://wa.me/5548999990000?text=x");
  });

  it("somarDias conta a partir da data base", () => {
    expect(somarDias(30, new Date("2026-10-14T12:00:00Z"))).toBe("2026-11-13");
  });
});

describe("hoje no horário de Brasília", () => {
  afterEach(() => vi.useRealTimers());
  it("às 22h de 31/10 em Brasília (01h de 01/11 em UTC) ainda é 31/10", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T01:00:00Z"));
    expect(hoje()).toBe("2026-10-31");
    expect(somarDias(1)).toBe("2026-11-01");
    expect(somarDias(-1)).toBe("2026-10-30");
  });
  it("de manhã é o mesmo dia nos dois horários", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T13:00:00Z"));
    expect(hoje()).toBe("2026-10-23");
  });
});
