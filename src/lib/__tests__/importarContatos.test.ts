import { describe, expect, it } from "vitest";
import { converterContatos, dataPlanilha } from "../importarContatos";

describe("planilha de contatos do Tiny: campos além do básico", () => {
  const cab = ["ID", "Código", "Nome", "Fantasia", "Endereço", "Número", "CEP", "Cidade", "Estado", "Fone", "Fax", "Celular", "E-mail",
    "E-mail para envio NFe", "Web Site", "Tipo pessoa", "CNPJ / CPF", "IE / RG", "Inscrição Municipal", "Data de cadastro",
    "Limite de crédito", "Vendedor", "Pessoa de contato", "Endereço cobrança", "CEP cobrança", "UF cobrança", "Recebe avisos por e-mail", "Coluna estranha"];
  const linha = ["123", "10/2020", "Sorveteria Teste Ltda", "Gelato", "Rua A", "10", "88000000", "Florianópolis", "SC", "4833334444", "4833335555",
    "48999990000", "a@teste.com.br", "nfe@teste.com.br", "teste.com.br", "J", "12345678000190", "123456789", "5555", "20/05/2019 10:30:00",
    "1.500,00", "Ana", "Carlos (compras)", "Rua B", "88000-100", "Santa Catarina", "S", "x"];

  it("lê data de cadastro, site, fax, e-mail da NF-e, IM, limite, vendedor, pessoas de contato e cobrança", () => {
    const r = converterContatos([cab, linha], "cliente");
    const i = r.itens[0];
    expect(i.cadastro_em).toBe("2019-05-20");
    expect(i.site).toBe("teste.com.br");
    expect(i.fone2).toBe("4833335555");
    expect(i.email).toBe("a@teste.com.br");
    expect(i.email_nfe).toBe("nfe@teste.com.br");
    expect(i.im).toBe("5555");
    expect(i.limite_credito).toBe("1500.00");
    expect(i.vendedor).toBe("Ana");
    expect(i.pessoas_contato).toBe("Carlos (compras)");
    expect([i.cob_endereco, i.cob_cep, i.cob_uf]).toEqual(["Rua B", "88000100", "SC"]);
    expect(i.endereco).toBe("Rua A");
    expect(i.compra_maquina).toBe("2020-10-01");
  });

  it("aponta as colunas que ficaram de fora", () => {
    expect(converterContatos([cab, linha], "cliente").naoUsadas).toEqual(["Coluna estranha"]);
  });

  it("data da planilha: texto, ISO e número do Excel", () => {
    expect(dataPlanilha("05/03/2021")).toBe("2021-03-05");
    expect(dataPlanilha("2021-03-05T10:00:00")).toBe("2021-03-05");
    expect(dataPlanilha(44260)).toBe("2021-03-05");
    expect(dataPlanilha("31/02/2021")).toBe("");
    expect(dataPlanilha("")).toBe("");
  });
});
