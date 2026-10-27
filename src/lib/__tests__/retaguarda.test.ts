import { describe, expect, it } from "vitest";
import { soDaMaster, soDaMasterParaAdmin } from "../menu";

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

describe("soDaMasterParaAdmin", () => {
  it("auditoria, bancos e importar: entre os administradores, só a master", () => {
    expect(soDaMasterParaAdmin("admin", "/auditoria")).toBe(true);
    expect(soDaMasterParaAdmin("admin", "/configuracoes/bancos")).toBe(true);
    expect(soDaMasterParaAdmin("admin", "/importar")).toBe(true);
    expect(soDaMasterParaAdmin("admin", "/pedidos")).toBe(false);
  });

  it("o financeiro continua com a auditoria e os bancos", () => {
    expect(soDaMasterParaAdmin("financeiro", "/auditoria")).toBe(false);
    expect(soDaMasterParaAdmin("financeiro", "/configuracoes/bancos")).toBe(false);
  });
});
