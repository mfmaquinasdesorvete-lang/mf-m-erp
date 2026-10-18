import { createElement as h, Fragment } from "react";
import { describe, expect, it } from "vitest";
import { achatar, compararValores, ordenarLinhas, sentidoNatural, temInterativo, textoDoNo, valorOrdenavel } from "../ordenarColunas";

const linha = (id: string, ...celulas: unknown[]) => h("tr", { key: id }, ...celulas.map((c, i) => h("td", { key: i }, c as string)));
const ids = (linhas: unknown[]) => linhas.map((l) => String((l as { key: string }).key).replace(/^.*\$/, ""));

describe("ordenar pelas colunas", () => {
  it("lê data, dinheiro, número, porcentagem e texto pelo que a célula mostra", () => {
    expect(valorOrdenavel("26/05/2026")).toEqual({ tipo: "numero", v: 202605260000 });
    expect(valorOrdenavel("26/05/2026 14:30")).toEqual({ tipo: "numero", v: 202605261430 });
    expect(valorOrdenavel("R$ 1.234,56")).toEqual({ tipo: "numero", v: 1234.56 });
    expect(valorOrdenavel("-R$ 1.462,50")).toEqual({ tipo: "numero", v: -1462.5 });
    expect(valorOrdenavel("12,5%")).toEqual({ tipo: "numero", v: 12.5 });
    expect(valorOrdenavel("432 pedido #12")).toEqual({ tipo: "numero", v: 432 });
    expect(valorOrdenavel("#15")).toEqual({ tipo: "numero", v: 15 });
    expect(valorOrdenavel("11.222.333/0001-81")).toEqual({ tipo: "texto", v: "11.222.333/0001-81" });
    expect(valorOrdenavel("SC")).toEqual({ tipo: "texto", v: "SC" });
    expect(valorOrdenavel("—")).toBeNull();
    expect(valorOrdenavel("  ")).toBeNull();
  });

  it("texto em ordem alfabética sem ligar para acento e maiúscula; vazio sempre no fim", () => {
    const vals = ["Ágata", "beta", null, "alfa"].map((t) => (t == null ? null : valorOrdenavel(t)));
    const az = [...vals].sort((a, b) => compararValores(a, b, true)).map((v) => v?.v ?? null);
    expect(az).toEqual(["Ágata", "alfa", "beta", null]);
    const za = [...vals].sort((a, b) => compararValores(a, b, false)).map((v) => v?.v ?? null);
    expect(za).toEqual(["beta", "alfa", "Ágata", null]);
  });

  it("ordena as linhas pela coluna e mantém a ordem de antes no empate", () => {
    const linhas = [linha("a", "SP", "R$ 977,67", "26/05/2026"), linha("b", "SC", "R$ 668,46", "05/05/2026"), linha("c", "SC", "R$ 1.200,00", "—")];
    expect(ids(ordenarLinhas(linhas, 0, true))).toEqual(["b", "c", "a"]);
    expect(ids(ordenarLinhas(linhas, 1, false))).toEqual(["c", "a", "b"]);
    expect(ids(ordenarLinhas(linhas, 2, false))).toEqual(["a", "b", "c"]);
    // primeiro clique: texto de A a Z, valor e data do maior para o menor
    expect(sentidoNatural(linhas, 0)).toBe(true);
    expect(sentidoNatural(linhas, 1)).toBe(false);
  });

  it("linha com detalhe (fragmento com chave) anda junto; fragmento sem chave é aberto", () => {
    const comDetalhe = h(Fragment, { key: "x" }, linha("x1", "Beta"), h("tr", { key: "x2" }, h("td", { colSpan: 2 }, "detalhe")));
    const linhas = achatar(h(Fragment, null, [comDetalhe, linha("y", "Alfa")]));
    expect(linhas).toHaveLength(2);
    expect(ids(ordenarLinhas(linhas, 0, true))).toEqual(["y", "x"]);
  });

  it("texto do título e títulos que já fazem outra coisa", () => {
    expect(textoDoNo(h("span", null, "Valor ", h("small", null, "(R$)")))).toBe("Valor  (R$)");
    // componente que se desenha sozinho: o nome do cadastro ou o valor que recebe
    const NomeCadastro = (_: { r: { nome: string } }) => null;
    const Badge = (_: { value: string }) => null;
    expect(textoDoNo(h(NomeCadastro, { r: { nome: "Cliente Exemplo" } }))).toBe("Cliente Exemplo");
    expect(textoDoNo(h(Badge, { value: "pago" }))).toBe("pago");
    expect(textoDoNo(h("span", { title: "não é texto" }))).toBe("");
    expect(temInterativo(h("input", { type: "checkbox" }))).toBe(true);
    expect(temInterativo(h("span", null, "Cliente"))).toBe(false);
  });
});
