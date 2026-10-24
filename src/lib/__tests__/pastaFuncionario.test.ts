import { describe, expect, it } from "vitest";
import { contarPorPasta, pastaDo, pastaDoNomeDaPasta, planejarImportacao } from "../pastaFuncionario";

describe("pasta do funcionário", () => {
  it("sem divisão ou com divisão desconhecida cai em Outros", () => {
    expect(pastaDo({ pasta: "contrato" })).toBe("contrato");
    expect(pastaDo({ pasta: null })).toBe("outros");
    expect(pastaDo({})).toBe("outros");
    expect(pastaDo({ pasta: "qualquer" })).toBe("outros");
  });
  it("conta por pessoa e divisão, ignorando anexo sem pessoa", () => {
    const m = contarPorPasta([
      { entidade_id: "a", pasta: "contrato" }, { entidade_id: "a", pasta: "contrato" }, { entidade_id: "a", pasta: null },
      { entidade_id: "b", pasta: "exames" }, { entidade_id: null, pasta: "contrato" },
    ]);
    expect(m.get("a")).toEqual({ contrato: 2, outros: 1 });
    expect(m.get("b")).toEqual({ exames: 1 });
    expect(m.size).toBe(2);
  });
});

describe("importar pasta", () => {
  const pessoas = [{ id: "a", nome: "Ana Exemplo da Silva", apelido: "Aninha" }, { id: "b", nome: "Beto Teste" }];
  const raiz = "ERP – Pastas dos funcionários";
  it("acha pessoa e divisão pelo caminho, sem acento e sem diferença de maiúscula", () => {
    const { itens, semPessoa, repetidos } = planejarImportacao([
      { caminho: `${raiz}/Ana Exemplo da Silva/Férias/aviso.pdf` },
      { caminho: `${raiz}/ana exemplo da silva/CONTRATO/ficha.pdf` },
      { caminho: `${raiz}/Aninha/ASO/aso.pdf` },
      { caminho: `${raiz}/Beto Teste/rescisao.pdf` },
      { caminho: `${raiz}/Beto Teste/Pasta qualquer/foto.jpg` },
      { caminho: `${raiz}/Fulano Desconhecido/Contrato/x.pdf` },
      { caminho: `${raiz}/Beto Teste/.DS_Store` },
    ], pessoas, []);
    expect(itens.map((i) => [i.pessoaId, i.pasta, i.nome])).toEqual([
      ["a", "ferias", "aviso.pdf"], ["a", "contrato", "ficha.pdf"], ["a", "exames", "aso.pdf"],
      ["b", "outros", "rescisao.pdf"], ["b", "outros", "foto.jpg"],
    ]);
    expect(semPessoa).toEqual(["Fulano Desconhecido"]);
    expect(repetidos).toBe(0);
  });
  it("não repete o que já está guardado nem o mesmo arquivo duas vezes", () => {
    const { itens, repetidos } = planejarImportacao([
      { caminho: `${raiz}/Beto Teste/Contrato/ficha.pdf` },
      { caminho: `${raiz}/Beto Teste/Contrato/ficha.pdf` },
      { caminho: `${raiz}/Beto Teste/Outros/termo.pdf` },
    ], pessoas, [{ entidade_id: "b", nome: "termo.pdf", pasta: null }]);
    expect(itens.map((i) => i.nome)).toEqual(["ficha.pdf"]);
    expect(repetidos).toBe(2);
  });
  it("divisão pelo nome da subpasta", () => {
    expect(pastaDoNomeDaPasta("Holerites")).toBe("holerites");
    expect(pastaDoNomeDaPasta("ferias")).toBe("ferias");
    expect(pastaDoNomeDaPasta("Recibos de pagamento")).toBe("holerites");
    expect(pastaDoNomeDaPasta("Fotos")).toBeNull();
  });
});
