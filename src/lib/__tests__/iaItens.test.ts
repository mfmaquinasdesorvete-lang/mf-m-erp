import { describe, expect, it } from "vitest";
import { normalizarItens, type ItemIA } from "../../../supabase/functions/_shared/ia-itens";

const itens: ItemIA[] = [
  { chave: "a", descricao: "ROLAMENTO 6206 2RS", candidatos: [{ id: "p1", descricao: "Rolamento 6206-2RS" }] },
  { chave: "b", descricao: "DETERGENTE 5L", candidatos: [] },
  { chave: "c", descricao: "CORREIA A-32", candidatos: [{ id: "p2", descricao: "Correia A-30" }] },
];

describe("IA nos itens das notas", () => {
  it("aceita só candidatos e itens pedidos", () => {
    const r = normalizarItens({ itens: [
      { chave: "a", decisao: "ligar", produto_id: "p1", fator: 10, motivo: "mesmo código", confianca: "alta" },
      { chave: "c", decisao: "ligar", produto_id: "inventado", fator: 1, motivo: "x", confianca: "alta" },
      { chave: "zz", decisao: "consumo", produto_id: null, fator: 1, motivo: "x", confianca: "alta" },
      { chave: "a", decisao: "consumo", produto_id: null, fator: 1, motivo: "repetido", confianca: "alta" },
    ] }, itens);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ chave: "a", decisao: "ligar", produto_id: "p1", fator: 10, confianca: "alta" });
    expect(r[1]).toMatchObject({ chave: "c", decisao: "duvida", produto_id: null });
  });
  it("produto novo precisa de nome; tipo padrão componente; fator fora do ligar é 1", () => {
    const r = normalizarItens({ itens: [
      { chave: "b", decisao: "consumo", produto_id: "p1", fator: 5, motivo: "limpeza", confianca: "alta" },
      { chave: "c", decisao: "criar", produto_id: null, fator: 1, nome_novo: "Correia A-32", tipo_novo: null, motivo: "medida diferente", confianca: "media" },
      { chave: "a", decisao: "criar", produto_id: null, fator: 1, nome_novo: " ", tipo_novo: "peca", motivo: "", confianca: "qualquer" as never },
    ] }, itens);
    expect(r[0]).toMatchObject({ decisao: "consumo", produto_id: null, fator: 1 });
    expect(r[1]).toMatchObject({ decisao: "criar", nome_novo: "Correia A-32", tipo_novo: "insumo" });
    expect(r[2]).toMatchObject({ decisao: "duvida", confianca: "baixa" });
  });
});
