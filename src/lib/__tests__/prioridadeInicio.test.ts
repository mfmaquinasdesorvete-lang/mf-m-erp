import { describe, expect, it } from "vitest";
import { ordenarAtencao } from "@/lib/prioridadeInicio";

describe("ordem do que pede atenção no início", () => {
  const itens = [
    { nivel: "acompanhar" as const, texto: "garantias vencendo" },
    { nivel: "urgente" as const, texto: "cobranças vencidas" },
    { nivel: "acompanhar" as const, texto: "orçamentos" },
    { nivel: "urgente" as const, texto: "OS atrasada" },
    { nivel: "acompanhar" as const, texto: "estoque" },
  ];

  it("urgentes primeiro, na ordem em que vieram", () => {
    expect(ordenarAtencao(itens).ordem.map((i) => i.texto)).toEqual(["cobranças vencidas", "OS atrasada", "garantias vencendo", "orçamentos", "estoque"]);
    expect(ordenarAtencao(itens).urgentes).toBe(2);
  });

  it("mostra só os primeiros e guarda o resto para o Ver mais", () => {
    const r = ordenarAtencao(itens, 3);
    expect(r.visiveis).toHaveLength(3);
    expect(r.escondidos.map((i) => i.texto)).toEqual(["orçamentos", "estoque"]);
  });

  it("lista vazia", () => {
    expect(ordenarAtencao([])).toEqual({ ordem: [], visiveis: [], escondidos: [], urgentes: 0 });
  });
});
