import { describe, expect, it } from "vitest";
import { dataDoCodigo, mesAnoCompra } from "../../../supabase/functions/_shared/compra-maquina";
import { converterContatos } from "../importarContatos";
import { textoUtf8 } from "../planilha";

describe("dataDoCodigo", () => {
  it("lê mês/ano do jeito que se escrevia no Tiny", () => {
    expect(dataDoCodigo("10/2020")).toBe("2020-10-01");
    expect(dataDoCodigo("5/2021")).toBe("2021-05-01");
    expect(dataDoCodigo("10/20")).toBe("2020-10-01");
    expect(dataDoCodigo("11-2022")).toBe("2022-11-01");
    expect(dataDoCodigo(" 07 / 2023 ")).toBe("2023-07-01");
  });
  it("data completa e duas datas (fica a mais recente)", () => {
    expect(dataDoCodigo("29/09/2022")).toBe("2022-09-29");
    expect(dataDoCodigo("05/2021-11/2021")).toBe("2021-11-01");
  });
  it("ignora códigos que não são data", () => {
    for (const v of ["22072971", "285", "Cliente", "13/2020", "31/02/2022", "06/202", "Cliente -10/201", "", null, 37032]) {
      expect(dataDoCodigo(v)).toBe("");
    }
  });
});

describe("mesAnoCompra", () => {
  it("mostra mês/ano, ou a data inteira quando tem o dia", () => {
    expect(mesAnoCompra("2020-10-01")).toBe("10/2020");
    expect(mesAnoCompra("2022-09-29")).toBe("29/09/2022");
    expect(mesAnoCompra(null)).toBe("");
  });
});

describe("planilha de contatos do Tiny", () => {
  it("o Código mês/ano vira a data de compra da máquina", () => {
    const r = converterContatos([
      ["ID", "Código", "Nome", "Endereço", "Número", "CNPJ / CPF", "Tipos de Contatos"],
      ["1", "10/2020", "Sorveteria A", "Rua X", "10", "11222333000181", "Cliente"],
      ["2", "22072971", "Sorveteria B", "", "", "", "Cliente"],
    ], "cliente");
    expect(r.itens.map((i) => i.compra_maquina)).toEqual(["2020-10-01", ""]);
    expect(r.itens[0].endereco).toBe("Rua X");
    expect(r.itens[0].numero).toBe("10");
  });
  it("datas no nome fantasia vão para as observações", () => {
    const r = converterContatos([
      ["Nome", "Fantasia", "Observações"],
      ["Sorveteria A", "08/2023 - 05/2023", "cliente antigo"],
      ["Sorveteria B", "Gelato B", ""],
    ], "cliente");
    expect(r.itens.map((i) => i.fantasia)).toEqual(["", "Gelato B"]);
    expect(r.itens[0].obs).toBe("cliente antigo\nDatas que estavam no nome fantasia (vindas do Tiny): 08/2023 - 05/2023");
    expect(r.itens[1].obs).toBe("");
  });
  it("CSV em UTF-8 sem marca é lido como UTF-8", () => {
    expect(textoUtf8(new TextEncoder().encode('"Endereço";"Número"'))).toBe('"Endereço";"Número"');
    expect(textoUtf8(new Uint8Array([0x45, 0x6e, 0x64, 0xe7, 0x6f]))).toBeNull(); // "Endço" em Windows-1252
    expect(textoUtf8(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBeNull(); // .xlsx
  });
});
