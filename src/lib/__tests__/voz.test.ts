import { describe, expect, it } from "vitest";
import { melhorVoz, pontuarVoz, vozesPortugues } from "../voz";

const vozes = [
  { name: "Microsoft Maria - Portuguese (Brazil)", lang: "pt-BR" },
  { name: "Microsoft Francisca Online (Natural) - Portuguese (Brazil)", lang: "pt-BR" },
  { name: "Google português do Brasil", lang: "pt-BR" },
  { name: "Joana", lang: "pt-PT" },
  { name: "Samantha", lang: "en-US" },
  { name: "eSpeak Portuguese", lang: "pt" },
];

describe("voz dos avisos", () => {
  it("prefere a voz natural do Brasil e deixa de fora as outras línguas", () => {
    expect(melhorVoz(vozes)?.name).toContain("Francisca");
    expect(vozesPortugues(vozes).map((v) => v.name)).not.toContain("Samantha");
    expect(pontuarVoz({ name: "Google português do Brasil", lang: "pt-BR" })).toBeGreaterThan(pontuarVoz({ name: "Joana", lang: "pt-PT" }));
    const lista = vozesPortugues(vozes);
    expect(lista[lista.length - 1].name).toBe("eSpeak Portuguese");
  });

  it("usa a voz escolhida enquanto ela existir no aparelho", () => {
    expect(melhorVoz(vozes, "Google português do Brasil")?.name).toBe("Google português do Brasil");
    expect(melhorVoz(vozes, "Voz que sumiu")?.name).toContain("Francisca");
    expect(melhorVoz([{ name: "Samantha", lang: "en-US" }])).toBeUndefined();
  });
});
