import { describe, expect, it } from "vitest";
import { montarPedidoManutencao, normalizarManutencao, palavrasChave } from "../../../supabase/functions/_shared/ia-manutencao";

describe("IA de manutenção", () => {
  it("palavras-chave sem acento e sem palavras fracas", () => {
    expect(palavrasChave("A máquina não está congelando, o compressor liga e desliga")).toEqual(["congelando", "compressor", "desliga", "liga"]);
  });
  it("monta o pedido com as dicas, as OS e as peças do ERP", () => {
    const t = montarPedidoManutencao("não congela", {
      maquina: { descricao: "A 200" }, dicas: [{ id: 3, defeito: "Não congela", solucao: "Limpar o condensador" }],
      os: [{ numero: 76, defeito: "Revisão / Não congela", solucao: "Troca do capacitor" }], pecas: [{ sku: "PC-ELE-002", descricao: "CLP do Cilindro", estoque: 21 }],
    });
    expect(t).toContain("Máquina: A 200");
    expect(t).toContain("Dica nº 3: Não congela → Limpar o condensador");
    expect(t).toContain('OS nº 76: defeito "Revisão / Não congela"; solução "Troca do capacitor"');
    expect(t).toContain("PC-ELE-002 · CLP do Cilindro · estoque 21");
  });
  it("sku só se existir no ERP; confiança alta só com dica ou OS do ERP", () => {
    const r = normalizarManutencao({
      resumo: "Condensador sujo", causas: ["Condensador sujo"], passos: ["Desligar", "Limpar"], seguranca: "Desligue da tomada",
      pecas: [{ descricao: "CLP", sku: "pc-ele-002" }, { descricao: "Inventada", sku: "XX-999" }], chamar_tecnico: false, fontes: ["conhecimento geral"], confianca: "alta",
    }, ["PC-ELE-002"]);
    expect(r.pecas).toEqual([{ descricao: "CLP", sku: "pc-ele-002" }, { descricao: "Inventada", sku: null }]);
    expect(r.confianca).toBe("media");
    expect(normalizarManutencao({ resumo: "x", fontes: ["OS nº 76"], confianca: "alta" }, []).confianca).toBe("alta");
    expect(normalizarManutencao({}, []).fontes).toEqual(["conhecimento geral"]);
  });
});
