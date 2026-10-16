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

describe("entradas do menu por perfil", async () => {
  const { RAPIDOS, ATALHOS_CELULAR } = await import("../menu");
  const { auditarNavegacao, menuDoPerfil } = await import("../auditoriaMenu");
  const { PAPEIS_INTERNOS, acoesDoPapel, itemVisivel } = await import("../permissoes");
  const perfis = PAPEIS_INTERNOS.filter((p) => p.value !== "admin").map((p) => ({
    id: p.value, nome: p.label, ve: (i: { to: string; tela: string }) => itemVisivel(p.value, [], i.tela as never, i.to, {}),
    pode: (a: string) => acoesDoPapel(p.value).includes(a as never),
  }));
  const ent = { rapidos: RAPIDOS, atalhos: ATALHOS_CELULAR };
  const achados = auditarNavegacao(grupos, itensForaDoMenu, ent, perfis);

  it("nenhum perfil fica com a barra do celular vazia, e nenhum botão + aparece para quem não pode", () => {
    expect(achados.filter((a) => a.gravidade === "alta")).toEqual([]);
    const contador = menuDoPerfil(grupos, itensForaDoMenu, ent, perfis.find((p) => p.id === "contador")!);
    expect(contador.areas.filter((a) => a.mais)).toEqual([]);
    expect(menuDoPerfil(grupos, itensForaDoMenu, ent, perfis.find((p) => p.id === "compras")!).barra.map((i) => i.to)).toEqual(["/compras", "/notas", "/fornecedores", "/estoque"]);
  });

  it("no menu de verdade: botões rápidos com o nome certo, nomes curtos únicos, nenhuma área vazia e todas abrem um painel", () => {
    expect(achados.filter((a) => a.gravidade !== "info")).toEqual([]);
    expect(achados.filter((a) => /^(rapido|curto|so-uma|titulo-area)/.test(a.id))).toEqual([]);
    expect(grupos.find((g) => g.id === "financeiro")!.itens.length).toBeLessThanOrEqual(8);
  });

  it("acusa o botão rápido com nome de outra tela, nome curto repetido, área com uma tela só e área sem painel", () => {
    const it2 = (to: string, label: string, curto: string, tela = "t") => ({ to, label, curto, tela, busca: "a" });
    const G = [
      { id: "fis", titulo: "Fiscal", cor: "a", itens: [it2("/painel/f", "Painel fiscal", "Painel"), it2("/nf", "Notas fiscais", "Notas")] },
      { id: "ges", titulo: "Gestão", cor: "b", itens: [it2("/g1", "G1", "G1", "g"), it2("/g2", "G2", "G2", "g"), it2("/g3", "G3", "G3", "g"), it2("/doc", "Documentos", "Docs", "doc")] },
      { id: "ven", titulo: "Vendas", cor: "c", itens: [it2("/pecas", "Venda de Peças", "Peças")] },
      { id: "pro", titulo: "Produtos", cor: "d", painel: "/cat", itens: [it2("/cat", "Peças de reposição", "Peças")] },
    ];
    const ps = ["a", "b", "c"].map((id) => ({ id, nome: id.toUpperCase(), ve: (i: { tela: string }) => i.tela !== "g", pode: () => true }));
    const ids = auditarNavegacao(G, [], { rapidos: [{ to: "/painel/f", label: "Notas fiscais" }], atalhos: { admin: ["/pecas", "/cat"] } }, ps).map((a) => a.id);
    expect(ids).toContain("rapido:/painel/f");
    expect(ids).toContain("curto:pecas");
    expect(ids).toContain("so-uma:ges:/doc");
    expect(ids).toContain("titulo-area"); // Gestão e Vendas sem painel; Produtos tem (painel: "/cat")
  });
});
