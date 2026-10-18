import { describe, expect, it } from "vitest";
import { arquivoFeature, arquivoPlaywright, cenariosRepetidos, nomeArquivo, regrasDaConversa, rodarFluxo, separarCenarios } from "../fluxoBdd";

const conversa = [
  { nome: "Ana Exemplo", texto: "Combinamos que a foto tem que aparecer no PDF da OS. Dá para mandar vídeo?", created_at: "2026-10-14T10:00:00Z" },
  { nome: "Bruno Exemplo", texto: "Ok. Nunca apagar a foto depois que a OS for entregue.", created_at: "2026-10-15T09:00:00Z" },
  { nome: "Ana Exemplo", texto: "combinamos que a foto tem que aparecer no PDF da OS", created_at: "2026-10-16T09:00:00Z" },
];
const rascunho = { titulo: "Técnico anexa fotos na OS pelo celular", tipo: "historia" as const, descricao: "", criterio_aceite: "", pontos: null, responsavel_id: "", cenarios: "", testes: [] };

describe("Fluxo BDD", () => {
  it("Summarizer: tira as regras da conversa com quem e quando, sem perguntas e sem repetir", () => {
    const r = regrasDaConversa(conversa);
    expect(r.map((x) => x.texto)).toEqual(["Combinamos que a foto tem que aparecer no PDF da OS", "Nunca apagar a foto depois que a OS for entregue"]);
    expect(r[0]).toMatchObject({ nome: "Ana", data: "2026-10-14" });
  });

  it("encadeia: regra vira critério com origem, cenário próprio e caso de teste", () => {
    const f = rodarFluxo(rascunho, conversa, []);
    expect(f.criterio_aceite).toContain("Regra combinada: Nunca apagar a foto depois que a OS for entregue (Bruno, 15/10)");
    expect(f.cenarios).toContain("# Regras combinadas na conversa da equipe:");
    expect(f.cenarios).toMatch(/Cenário: Regra 2 — Nunca apagar/);
    expect(f.testes.some((t) => t.nome.startsWith("Regra 1"))).toBe(true);
    expect(f.novosTestes).toBe(f.testes.length);
    // rodar de novo não duplica critérios nem testes
    const g = rodarFluxo({ ...rascunho, criterio_aceite: f.criterio_aceite, cenarios: f.cenarios, testes: f.testes }, conversa, []);
    expect(g.novosCriterios).toBe(0);
    expect(g.novosTestes).toBe(0);
  });

  it("AI Suggest: acha cenário parecido em outro item e ignora os cenários padrão", () => {
    const meu = "Cenário: Importar duas vezes\n  Dado que já importei o arquivo de exemplo\n  Quando importo o mesmo arquivo de novo\n  Então nada é duplicado\n\nCenário: No celular\n  Dado que estou no celular\n  Então nada sai da tela";
    const outros = [{ id: "x", titulo: "Importar extrato OFX", cenarios: "Cenário: Importar o mesmo arquivo duas vezes\n  Dado que já importei o arquivo\n  Quando importo o mesmo arquivo de novo\n  Então nada é duplicado\n\nCenário: No celular\n  Dado que estou no celular\n  Então nada sai da tela" }];
    const r = cenariosRepetidos(meu, outros);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ cenario: "Importar duas vezes", itemTitulo: "Importar extrato OFX" });
    expect(cenariosRepetidos(meu, outros, "x")).toHaveLength(0);
  });

  it("Test-Gen: .feature com cabeçalho e teste do Playwright pendente (nunca passa sem programar)", () => {
    const cen = "Cenário: Caminho principal\n  Dado que abri a OS\n  Quando anexo a foto\n  Então a foto aparece";
    expect(arquivoFeature("Fotos na OS", cen)).toMatch(/^# language: pt\nFuncionalidade: Fotos na OS\n/);
    const spec = arquivoPlaywright("Fotos na OS", cen);
    expect(spec).toContain('test("Caminho principal"');
    expect(spec).toContain("test.fixme(true");
    expect(spec).toContain('await test.step("Quando anexo a foto"');
    expect(separarCenarios(cen)[0]!.linhas).toHaveLength(3);
    expect(nomeArquivo("Técnico anexa fotos!")).toBe("tecnico-anexa-fotos");
  });
});
