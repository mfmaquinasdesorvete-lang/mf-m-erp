import { describe, expect, it } from "vitest";
import { avisosCadeia, forcaCadeia, problemaCadeia, textoCadeia, type Elo } from "../causas";

const fato = (texto: string, ligacao: Elo["ligacao"] = "comprovada"): Elo => ({ texto, tipo: "fato", evidencia: "visto na tela X", ligacao });
const hip = (texto: string, ligacao: Elo["ligacao"] = "provavel"): Elo => ({ texto, tipo: "hipotese", evidencia: null, ligacao });

describe("cadeia de causas: correlação não vira causa comprovada", () => {
  it("fato precisa de evidência; sem ela, é hipótese", () => {
    expect(problemaCadeia([{ texto: "Algo aconteceu", tipo: "fato", evidencia: "", ligacao: "provavel" }])).toMatch(/precisa da evidência/);
    expect(problemaCadeia([hip("Talvez isso")])).toBeNull();
    expect(problemaCadeia([])).toMatch(/pelo menos um elo/);
  });

  it("'comprovada' só entre dois fatos com evidência (o efeito conta como fato)", () => {
    expect(problemaCadeia([fato("Importação pela planilha"), fato("Sem campo de pagamento")])).toBeNull();
    expect(problemaCadeia([hip("Talvez isso", "comprovada")])).toMatch(/elo 1: só dá para dizer "comprovada"/);
    expect(problemaCadeia([fato("Fato um"), hip("Talvez")])).toMatch(/elo 1: só dá para dizer "comprovada"/);
    expect(problemaCadeia([fato("Fato um", "provavel"), hip("Talvez")])).toBeNull();
  });

  it("a força da explicação é a do elo mais fraco, e os avisos apontam o que conferir", () => {
    expect(forcaCadeia([fato("A"), fato("B")])).toBe("comprovada");
    expect(forcaCadeia([fato("A", "provavel"), fato("B")])).toBe("provavel");
    expect(forcaCadeia([fato("A"), hip("B", "correlacao")])).toBe("correlacao");
    expect(avisosCadeia({ elos: [hip("A", "correlacao")], conclusao: null })).toEqual([
      "Nenhum elo é fato: a cadeia inteira ainda é suposição.",
      "1 hipótese precisa ser conferida antes de agir como se fosse certa.",
      "Há ligação que é só correlação: não diga que uma coisa causou a outra.",
      "Escreva a conclusão: o que está provado, o que não está e o que fazer.",
    ]);
  });

  it("texto para a equipe com fatos, hipóteses, ligações e a força", () => {
    const t = textoCadeia({ titulo: "Vendas sem conta", efeito: "Aparecem como Sem conta", situacao: "em_revisao", conclusao: "Conferir no extrato.",
      elos: [fato("Importação pela planilha"), hip("A maioria já foi recebida", "correlacao")] });
    expect(t).toContain("Vendas sem conta (em revisão)");
    expect(t).toContain("1. [Fato] Importação pela planilha — evidência: visto na tela X\n   ↓ causa comprovada");
    expect(t).toContain("2. [Hipótese] A maioria já foi recebida\n   ↓ só correlação");
    expect(t).toContain("Efeito: Aparecem como Sem conta");
    expect(t).toContain("Força da explicação: só correlação.");
  });
});
