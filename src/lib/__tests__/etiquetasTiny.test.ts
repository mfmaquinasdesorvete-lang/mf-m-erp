import { describe, expect, it } from "vitest";
import { etiquetasTiny, soPessoalInterno } from "../../../supabase/functions/_shared/etiquetas-tiny";
import { converterContatos, tiposDoTexto } from "../importarContatos";

describe("tags do Tiny nos cadastros", () => {
  it("guarda as tags da empresa e tira os tipos de cadastro", () => {
    expect(etiquetasTiny(["Cliente", "Garantia", "MF - A 200", "garantia", "Fornecedor", "Outros"])).toEqual(["Garantia", "MF - A 200"]);
  });
  it("só vendedor ou funcionário não entra; só tags da empresa entra como cliente", () => {
    expect(soPessoalInterno(["Vendedor", "Funcionário"])).toBe(true);
    expect(soPessoalInterno(["Garantia"])).toBe(false);
    expect(tiposDoTexto("Vendedor", "cliente")).toBeNull();
    expect(tiposDoTexto("Garantia", "cliente")).toEqual(["cliente"]);
    expect(tiposDoTexto("Cliente, Garantia", "cliente")).toEqual(["cliente"]);
  });
  it("a planilha leva as tags para o cadastro", () => {
    const { itens } = converterContatos([["Nome", "Tipos de contatos"], ["Sorveteria Exemplo", "Cliente, Garantia"]], "cliente");
    expect(itens[0].etiquetas).toEqual(["Garantia"]);
  });
});
