import { describe, expect, it } from "vitest";
import { categoriaPorParecidos, linhasDaSugestao, sugestaoLocal, unirEspecificacoes, valorParaForm } from "../autoFill";
import { montarPedido, normalizarSugestao } from "../../../supabase/functions/_shared/ia-produto";

const produtos = [
  { id: "a", descricao: "Pá batedora inox para máquina soft", categoria: "Peças > Batedores" },
  { id: "b", descricao: "Pá batedora plástica 2 sabores", categoria: "Peças > Batedores" },
  { id: "c", descricao: "Motor redutor 1/2 cv", categoria: "Peças > Motores" },
];

describe("Auto-Fill pelas regras do ERP", () => {
  it("acha a categoria pelos produtos de nome parecido e não chuta quando nada parece", () => {
    expect(categoriaPorParecidos("Pá batedora inox 3 sabores", produtos)?.categoria).toBe("Peças > Batedores");
    expect(categoriaPorParecidos("Etiqueta adesiva", produtos)).toBeNull();
  });

  it("sugere título, palavras-chave, textos e canais; componente interno não vai para a loja", () => {
    const s = sugestaoLocal({ id: "n", descricao: "Pá batedora inox 3 sabores", tipo: "peca" } as any, produtos);
    expect(s.titulo_anuncio.length).toBeLessThanOrEqual(60);
    expect(s.palavras_chave.length).toBeGreaterThan(2);
    expect(s.categoria).toBe("Peças > Batedores");
    expect(s.canais.loja_e_whatsapp).toBe(true);
    expect(s.status).toBe("rascunho");
    expect(s.conferir.some((c) => c.includes("marca"))).toBe(true);
    expect(sugestaoLocal({ id: "m", descricao: "Chapa de aço 2 mm", tipo: "componente" } as any, produtos).canais.loja_e_whatsapp).toBe(false);
  });

  it("mostra só o que muda, marca de saída o campo vazio e não troca o que alguém escreveu", () => {
    const s = sugestaoLocal({ id: "n", descricao: "Pá batedora inox 3 sabores", tipo: "peca" } as any, produtos);
    const linhas = linhasDaSugestao({ id: "n", descricao: "Pá batedora inox 3 sabores", tipo: "peca", titulo_anuncio: "Meu título", no_catalogo: true, vendavel: true }, s);
    const titulo = linhas.find((l) => l.campo === "titulo_anuncio")!;
    expect(titulo.marcada).toBe(false);
    expect(linhas.find((l) => l.campo === "palavras_chave")!.marcada).toBe(true);
    expect(linhas.some((l) => l.campo === "no_catalogo")).toBe(false);
    expect(valorParaForm({ campo: "palavras_chave", nome: "", atual: [], sugerido: ["a", "b"] })).toBe("a, b");
  });

  it("une os campos técnicos sem repetir pelo nome", () => {
    expect(unirEspecificacoes([{ nome: "Voltagem", valor: "220 V" }], [{ nome: "voltagem", valor: "110 V" }, { nome: "Material", valor: "Inox" }]))
      .toEqual([{ nome: "Voltagem", valor: "220 V" }, { nome: "Material", valor: "Inox" }]);
  });
});

describe("resposta da IA conferida antes de mostrar", () => {
  it("corta os tamanhos, tira contato do anúncio, acerta a categoria da lista e não repete palavras", () => {
    const s = normalizarSugestao({
      titulo_anuncio: "Pá batedora em aço inox para máquina de sorvete expresso soft de três sabores",
      palavras_chave: ["Pá Batedora", "pá batedora", "batedor inox"],
      meta_descricao: "x".repeat(300),
      descricao_anuncio: "Peça original. Chame no WhatsApp (11) 99999-0000 ou contato@exemplo.com.br",
      categoria: "peças > batedores", status: "pronto",
      especificacoes: [{ nome: "Material", valor: "Inox" }, { nome: "material", valor: "Aço" }],
      confianca: { categoria: "alta", marca_modelo: "x" as any, especificacoes: "media" },
    }, ["Peças > Batedores"]);
    expect(s.titulo_anuncio.length).toBeLessThanOrEqual(60);
    expect(s.meta_descricao.length).toBeLessThanOrEqual(160);
    expect(s.descricao_anuncio).not.toMatch(/9999|@|whats/i);
    expect(s.conferir.some((c) => c.includes("telefone"))).toBe(true);
    expect(s.categoria).toBe("Peças > Batedores");
    expect(s.categoria_nova).toBe(false);
    expect(s.palavras_chave).toEqual(["pá batedora", "batedor inox"]);
    expect(s.especificacoes).toHaveLength(1);
    expect(s.confianca.marca_modelo).toBe("baixa");
  });

  it("categoria fora da lista vira sugestão de categoria nova; resposta vazia não quebra", () => {
    expect(normalizarSugestao({ categoria: "Acessórios" }, ["Peças"]).categoria_nova).toBe(true);
    const vazia = normalizarSugestao(null, []);
    expect(vazia.status).toBe("rascunho");
    expect(vazia.palavras_chave).toEqual([]);
  });

  it("o pedido leva só os campos preenchidos e a lista de categorias", () => {
    const t = montarPedido({ descricao: "Pá batedora", marca: null, palavras_chave: [] }, ["Peças"], { temFoto: true, temDocumento: false });
    expect(t).toContain("\"nome\": \"Pá batedora\"");
    expect(t).not.toContain("marca");
    expect(t).toContain("Peças");
    expect(t).toContain("Veio uma foto");
  });
});
