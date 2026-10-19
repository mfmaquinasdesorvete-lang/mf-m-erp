import { describe, expect, it } from "vitest";
import { referenteCurto } from "../reciboTexto";

const nome = "Fulano de Tal Silva";
describe("referenteCurto", () => {
  it("tira nome repetido, documento mascarado e código da transação", () => {
    expect(referenteCurto("FULANO DE TAL SILVA · Transferência enviada pelo Pix - FULANO DE TAL SILVA - ***9** - Ref. e34df27ac9f7905d8d7cd79dc4466330", [nome])).toBe("Pix enviado");
    expect(referenteCurto("FULANO DE TAL SILVA · Transferência enviada pelo Pix - FULANO DE TAL SILVA - ***484909** - Ref. CP-926095405", [nome])).toBe("Pix enviado");
  });
  it("Pix com nome e Enviado vira Pix enviado", () => {
    expect(referenteCurto("Pix FULANO DE TAL SILVA · Enviado", [nome])).toBe("Pix enviado");
    expect(referenteCurto("Pix · Fulano de Tal Silva", [nome])).toBe("Pix enviado");
  });
  it("texto normal fica como está", () => {
    expect(referenteCurto("Honorários advocatícios (competência 10/2026)", [nome])).toBe("Honorários advocatícios (competência 10/2026)");
  });
});
