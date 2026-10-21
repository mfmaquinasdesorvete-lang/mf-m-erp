import { describe, expect, it } from "vitest";
import { soDaMaster } from "../menu";

describe("soDaMaster", () => {
  it("usuários e configurações da empresa são só da conta master", () => {
    expect(soDaMaster("usuarios")).toBe(true);
    expect(soDaMaster("configuracoes", "/configuracoes")).toBe(true);
    expect(soDaMaster("configuracoes")).toBe(true);
  });
  it("categorias, bancos e cobrança continuam com os administradores", () => {
    expect(soDaMaster("configuracoes", "/configuracoes/cadastros")).toBe(false);
    expect(soDaMaster("configuracoes", "/configuracoes/bancos")).toBe(false);
    expect(soDaMaster("pedidos", "/pedidos")).toBe(false);
  });
});
