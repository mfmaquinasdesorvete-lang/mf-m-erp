import { describe, expect, it } from "vitest";
import { RAIO, TAILWIND, TEXTO, variaveis } from "@/design/tokens.js";
import { cssDaAparencia, raiosDosCantos } from "@/lib/aparencia";

describe("tokens do design system", () => {
  it("cada token vira variável CSS e as classes apontam para ela", () => {
    const v = variaveis();
    expect(v["--raio-xl"]).toBe(RAIO.escala.xl);
    expect(v["--raio-cartao"]).toBe("var(--raio-xl)");
    expect(v["--texto-sm"]).toBe(TEXTO.sm[0]);
    expect(TAILWIND.borderRadius.cartao).toBe("var(--raio-cartao)");
    expect(TAILWIND.borderRadius.full).toBe("9999px");
    expect(TAILWIND.fontSize["2xs"]).toEqual(["var(--texto-2xs)", { lineHeight: "1rem" }]);
    expect(TAILWIND.zIndex.janela).toBe("50");
  });

  it("nomes de uso dos cantos apontam para um passo da escala", () => {
    for (const passo of Object.values(RAIO.uso)) expect(RAIO.escala).toHaveProperty(passo);
  });
});

describe("cantos da aparência", () => {
  it("padrão não muda nada", () => {
    expect(raiosDosCantos(null)).toEqual({});
    expect(raiosDosCantos("padrao")).toEqual({});
    expect(cssDaAparencia({})).not.toContain("--raio-");
  });

  it("retos e redondos multiplicam a escala", () => {
    expect(raiosDosCantos("retos")["raio-xl"]).toBe("0.375rem");
    expect(raiosDosCantos("redondos")["raio-xl"]).toBe("1.125rem");
    expect(raiosDosCantos("redondos")["raio-linha-celular"]).toBe("21px");
    expect(raiosDosCantos("retos")).not.toHaveProperty("raio-full");
    expect(cssDaAparencia({ cantos: "retos" })).toContain(":root:root:root:root:root { --raio-sm: 0.0625rem;");
  });
});
