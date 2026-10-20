import { describe, expect, it } from "vitest";
import { contarRetestes, filtrarRetestes, testesParaLigar, type LinhaReteste } from "../gigaReteste";
import type { TesteGiga } from "../testeGiga";

const linha = (id: string, situacao: LinhaReteste["situacao"], venda: string, cidade: string, desc = "Máquina Soft"): LinhaReteste => ({
  id, situacao, motivo: null, teste_id: null, atualizado_em: "2026-10-20",
  equipamento: { id: `e${id}`, descricao: desc, numero_serie: null, data_venda: venda, origem: "My Frost", produto_id: "p1",
    cliente: { id: "c", nome: "Sorveteria X", nome_fantasia: null, municipio: cidade, uf: "SP" } },
});

describe("lista de reteste do giga", () => {
  const linhas = [linha("1", "pendente", "2024-05-01", "Guarujá"), linha("2", "testado", "2023-02-01", "Natal"), linha("3", "pendente", "2023-08-01", "São José")];

  it("filtra por situação, busca sem acento e põe a venda mais antiga primeiro", () => {
    expect(filtrarRetestes(linhas, "pendente", "").map((l) => l.id)).toEqual(["3", "1"]);
    expect(filtrarRetestes(linhas, "todas", "guaruja").map((l) => l.id)).toEqual(["1"]);
    expect(filtrarRetestes(linhas, "todas", "sao jose sorveteria").map((l) => l.id)).toEqual(["3"]);
  });

  it("conta por situação", () => {
    expect(contarRetestes(linhas)).toEqual({ pendente: 2, testado: 1, dispensado: 0 });
  });

  it("só oferece testes válidos do mesmo modelo e ainda não ligados", () => {
    const t = (id: string, produto: string, em: string, anulado = false) =>
      ({ id, produto_id: produto, testado_em: em, anulado_em: anulado ? em : null } as unknown as TesteGiga);
    const testes = [t("a", "p1", "2026-10-01"), t("b", "p1", "2026-10-10"), t("c", "p2", "2026-10-11"), t("d", "p1", "2026-10-12", true), t("e", "p1", "2026-10-13")];
    expect(testesParaLigar(testes, "p1", new Set(["e"])).map((x) => x.id)).toEqual(["b", "a"]);
  });
});
