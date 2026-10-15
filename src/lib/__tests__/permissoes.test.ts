import { describe, expect, it } from "vitest";
import { itemVisivel, pode, podeVer, temPapel } from "../permissoes";

describe("perfil Marketplaces", () => {
  it("vê só os cadastros dos produtos e os documentos", () => {
    expect(podeVer("marketplace", "estoque")).toBe(true);
    expect(podeVer("marketplace", "documentos")).toBe(true);
    for (const t of ["financeiro", "conciliacao", "relatorios", "pedidos", "clientes", "notas", "funcionarios", "usuarios"] as const) {
      expect(podeVer("marketplace", t)).toBe(false);
    }
  });
  it("edita produtos, mas não estoque, financeiro nem notas", () => {
    expect(pode("marketplace", "editar_produtos")).toBe(true);
    for (const a of ["movimentar_estoque", "editar_financeiro", "contas_pagar", "emitir_nfe", "editar_fornecedores", "editar_pedidos"] as const) {
      expect(pode("marketplace", a)).toBe(false);
    }
    expect(temPapel("marketplace", [], "financeiro")).toBe(false);
  });
  it("não vê as transferências de estoque", () => {
    expect(itemVisivel("marketplace", [], "estoque", "/transferencias", {})).toBe(false);
    expect(itemVisivel("marketplace", [], "estoque", "/estoque", {})).toBe(true);
    expect(itemVisivel("financeiro", ["marketplace"], "estoque", "/transferencias", {})).toBe(true);
  });
  it("pode ser papel adicional de outro perfil", () => {
    expect(podeVer("vendas", "estoque", ["marketplace"])).toBe(true);
    expect(pode("vendas", "editar_produtos", ["marketplace"])).toBe(true);
  });
});
