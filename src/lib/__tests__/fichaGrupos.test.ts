import { describe, expect, it } from "vitest";
import { custoPorGrupo, etapasDoProduto, grupoDaLinha, grupoPorNome, gruposDosCalculosInternos, nomeEtapaOp } from "../fichaGrupos";

describe("ficha técnica por grupo", () => {
  it("sugere o grupo pelo nome e pela categoria da peça", () => {
    expect(grupoPorNome({ descricao: "Compressor 1,5 HP 220 V R404A" })).toBe("refrigeracao");
    expect(grupoPorNome({ descricao: "Motor Ventilador Exaustor 300 mm 220 V" })).toBe("refrigeracao");
    expect(grupoPorNome({ descricao: "Válvula Solenoide 1/4" })).toBe("refrigeracao");
    expect(grupoPorNome({ descricao: "Relé de Estado Sólido 40 A" })).toBe("eletrica");
    expect(grupoPorNome({ descricao: "CLP do Cilindro - Máquina de Sorvete" })).toBe("eletrica");
    expect(grupoPorNome({ descricao: "Pá Batedora + Vedação" })).toBe("cilindro");
    expect(grupoPorNome({ descricao: "Redutor completo com motor" })).toBe("mecanica");
    expect(grupoPorNome({ descricao: "Chapa lateral inox" })).toBe("estrutura");
    expect(grupoPorNome({ descricao: "Adesivo frontal com logo" })).toBe("acabamento");
    expect(grupoPorNome({ descricao: "Peça qualquer", categoria: "Peças Elétricas - My Frost" })).toBe("eletrica");
    expect(grupoPorNome({ descricao: "Item sem pista" })).toBe("outros");
  });

  it("vale o grupo gravado; senão o dos Cálculos Internos do Tiny; senão o nome", () => {
    const kits = [{ kit_id: "k1", componente_id: "p1" }, { kit_id: "k2", componente_id: "p2" }, { kit_id: "k3", componente_id: "p3" }];
    const sku: Record<string, string> = { k1: "CI-ELE-004", k2: "CI-REF-001", k3: "OUTRO-KIT" };
    const ci = gruposDosCalculosInternos(kits, (id) => sku[id]);
    expect([...ci.entries()]).toEqual([["p1", "eletrica"], ["p2", "refrigeracao"]]);
    expect(grupoDaLinha({ grupo: "estrutura" }, { id: "p1", descricao: "Cabo" }, ci)).toBe("estrutura");
    expect(grupoDaLinha({ grupo: null }, { id: "p1", descricao: "Peça sem pista" }, ci)).toBe("eletrica");
    expect(grupoDaLinha({}, { id: "p3", descricao: "Polia do motor" }, ci)).toBe("mecanica");
  });

  it("soma o custo de cada grupo na ordem da máquina", () => {
    const g = custoPorGrupo([{ grupo: "eletrica", custo: 100 }, { grupo: "estrutura", custo: 300 }, { grupo: "eletrica", custo: 100 }]);
    expect(g.map((x) => [x.id, x.custo, x.itens, x.pct])).toEqual([["estrutura", 300, 1, 0.6], ["eletrica", 200, 2, 0.4]]);
  });

  it("etapas: as gravadas com detalhe ou as antigas só com o nome; a feita fora diz quem faz", () => {
    expect(etapasDoProduto({ etapas_producao: ["Montar", "Testar"] })).toEqual([
      { nome: "Montar", externa: false, quem: null, dias: null }, { nome: "Testar", externa: false, quem: null, dias: null }]);
    const e = etapasDoProduto({ etapas: [{ nome: "Enviar para a injeção", externa: true, quem: "Injetora Exemplo", dias: 7 }], etapas_producao: ["x"] });
    expect(e).toHaveLength(1);
    expect(nomeEtapaOp(e[0])).toBe("Enviar para a injeção (fora: Injetora Exemplo)");
    expect(nomeEtapaOp({ nome: " Acabamento " })).toBe("Acabamento");
  });
});
