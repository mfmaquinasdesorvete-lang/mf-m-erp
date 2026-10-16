import { describe, expect, it } from "vitest";
import { auditarMenu, textoAuditoria, type GrupoAud, type ItemAud } from "../auditoriaMenu";
import { grupos, grupoDaRota, itensForaDoMenu } from "../menu";
import { SOBRE_TELAS } from "../modulos";

const it_ = (to: string, label: string, tela = "x", busca = "a b"): ItemAud => ({ to, label, tela, busca });

describe("auditoria do menu", () => {
  const G: GrupoAud[] = [
    { id: "a", titulo: "Vendas", cor: "verde", itens: [it_("/v", "Pedidos", "ped"), it_("/c", "Compras", "comp"), it_("/x", "Pedidos", "ped")] },
    { id: "b", titulo: "Cadastros", cor: "roxo", itens: [it_("/t", "Técnicos", "assist"), it_("/c2", "Compras em marketplaces", "fin", "")] },
    { id: "d", titulo: "Logística", cor: "roxo", itens: [it_("/v", "Pedidos de novo", "ped")] },
    { id: "e", titulo: "Assistência", cor: "azul", itens: [it_("/os", "Ordens de serviço", "assist"), it_("/g", "Garantias", "assist")] },
  ];
  const fora = [it_("/painel/t", "Painel dos técnicos", "assist")];
  const achados = auditarMenu(G, fora, { "/v": "x", "/c": "x", "/t": "x", "/c2": "x", "/os": "x", "/g": "x", "/painel/t": "x" }, (r) => (r === "/painel/t" ? "a" : null));
  const ids = achados.map((a) => a.id);

  it("acha rota repetida, nome repetido, nome parecido, mesma cor e tela sem texto", () => {
    expect(ids).toContain("rota:/v");
    expect(ids).toContain("nome:pedidos");
    expect(ids).toContain("parecido:/c:/c2");
    expect(ids).toContain("cor:b+d");
    expect(ids).toContain("texto:/x");
    expect(achados[0].gravidade).toBe("alta");
  });

  it("aponta permissão emprestada de outra área e tela fora do menu que abre na área errada", () => {
    expect(ids).toContain("perm:/t"); // Técnicos em Cadastros usa a permissão da Assistência
    expect(ids).toContain("fora:/painel/t"); // abre como Vendas, mas a permissão é da Assistência
    expect(ids).toContain("busca:/c2");
  });

  it("texto para a equipe por gravidade", () => {
    const t = textoAuditoria(achados, { areas: 4, telas: 7, fora: 1 });
    expect(t).toMatch(/^Auditoria do menu do ERP Line\n4 áreas · 7 telas no menu · 1 fora do menu/);
    expect(t).toContain("Corrigir (1)");
  });

  it("no menu de verdade não há endereço repetido nem tela sem explicação", () => {
    const real = auditarMenu(grupos, itensForaDoMenu, SOBRE_TELAS, grupoDaRota);
    expect(real.filter((a) => a.gravidade === "alta")).toEqual([]);
    expect(real.filter((a) => a.id.startsWith("texto:"))).toEqual([]);
  });
});
