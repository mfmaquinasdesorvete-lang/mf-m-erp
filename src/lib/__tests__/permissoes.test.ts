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
    expect(itemVisivel("vendas", ["marketplace"], "estoque", "/transferencias", {})).toBe(true);
  });
  it("pode ser papel adicional de outro perfil", () => {
    expect(podeVer("vendas", "estoque", ["marketplace"])).toBe(true);
    expect(pode("vendas", "editar_produtos", ["marketplace"])).toBe(true);
  });
});

describe("perfil Compras", () => {
  it("vê compras, notas, fornecedores, produtos e documentos; não vê o financeiro nem as vendas", () => {
    for (const t of ["producao", "notas", "fornecedores", "estoque", "documentos"] as const) expect(podeVer("compras", t)).toBe(true);
    for (const t of ["financeiro", "conciliacao", "pedidos", "clientes", "relatorios", "usuarios", "contador"] as const) {
      expect(podeVer("compras", t)).toBe(false);
    }
  });
  it("faz OC, recebe, cuida das notas de fornecedor e dos fornecedores; não mexe em contas nem emite nota", () => {
    for (const a of ["editar_producao", "receber_compras", "nfe_recebidas", "editar_fornecedores"] as const) expect(pode("compras", a)).toBe(true);
    for (const a of ["contas_pagar", "editar_financeiro", "emitir_nfe", "movimentar_estoque", "editar_produtos", "editar_pedidos"] as const) {
      expect(pode("compras", a)).toBe(false);
    }
    expect(temPapel("compras", [], "financeiro")).toBe(false);
  });
  it("fica na tela de Compras: sem ordens de produção, painel fiscal e transferências", () => {
    expect(itemVisivel("compras", [], "producao", "/compras", {})).toBe(true);
    for (const to of ["/producao", "/painel/notas", "/transferencias"]) expect(itemVisivel("compras", [], to === "/painel/notas" ? "notas" : to === "/transferencias" ? "estoque" : "producao", to, {})).toBe(false);
    expect(itemVisivel("compras", [], "notas", "/notas", {})).toBe(true);
  });
  it("pode ser papel adicional", () => {
    expect(podeVer("tecnico", "notas", ["compras"])).toBe(true);
    expect(pode("vendas", "receber_compras", ["compras"])).toBe(true);
  });
});

describe("financeiro vê só financeiro (27/10)", () => {
  it("abre a área Financeiro, notas, fornecedores, relatórios, margem e funcionários", () => {
    for (const t of ["financeiro", "conciliacao", "auditoria", "notas", "fornecedores", "relatorios", "margem", "funcionarios"] as const)
      expect(podeVer("financeiro", t)).toBe(true);
  });
  it("não abre vendas, clientes, logística, fábrica e estoque nem o início geral", () => {
    for (const t of ["painel", "pedidos", "clientes", "expedicao", "fretes", "estoque", "producao", "assistencia", "importar"] as const)
      expect(podeVer("financeiro", t)).toBe(false);
  });
});
