import { describe, expect, it } from "vitest";
import { montarNotasMyFrost, nomeParaComparar, tipoDaNota } from "../notasMyFrost";

// nomes e documentos inventados
const EMP = "Empresa Antiga de Sorvetes Ltda";
const nf = (numero: string, destinatario: string, data: string, valor: number | string, natureza = "Venda de producao do estabelecimento", emitente = EMP) =>
  ({ emitente, cnpj: "11222333000181", destinatario, data_emissao: `${data}T10:00:00`, valor_nf: valor, numero, natureza });

describe("notas fiscais da empresa anterior", () => {
  it("compara nomes sem acento, pontuação, números e LTDA/ME", () => {
    expect(nomeParaComparar("Sorveteria Açaí  Exemplo LTDA - ME")).toBe("SORVETERIA ACAI EXEMPLO");
    expect(nomeParaComparar("João da Silva 123.456.789-09")).toBe("JOAO DA SILVA");
  });

  it("acha o CPF/CNPJ pelo nome nos contatos e nos pedidos, ou escrito no próprio nome", () => {
    const notas = montarNotasMyFrost(
      [
        nf("000101", "Sorveteria Exemplo Ltda", "2024-03-10", 15000),
        nf("102", "Maria Exemplo - 529.982.247-25", "2024-04-01", 980.5),
        nf("103", "Açaí do Pedido", "2024-05-02", "2500"),
        nf("104", "Pessoa Sem Cadastro", "2024-05-03", 100),
      ],
      [{ Nome: "SORVETERIA EXEMPLO", Fantasia: "", "CNPJ / CPF": "11.444.777/0001-61" }],
      [{ "Nome do contato": "Acai do Pedido", "Destinatário": "", "CPF/CNPJ": "39053344705", Data: "2024-04-28" }],
    );
    expect(notas.map((n) => [n.numero, n.docs])).toEqual([
      ["101", ["11444777000161"]], ["102", ["52998224725"]], ["103", ["39053344705"]], ["104", []],
    ]);
    expect(notas[0]).toMatchObject({ data: "2024-03-10", valor: 15000, natureza: "Venda de producao do estabelecimento" });
    expect(notas[2].valor).toBe(2500);
  });

  it("nome com dois documentos: vale o pedido feito até 90 dias antes; senão vão os dois", () => {
    const contatos = [
      { Nome: "Gelateria Exemplo", "CNPJ / CPF": "11444777000161" },
      { Nome: "Gelateria Exemplo", "CNPJ / CPF": "52998224725" },
    ];
    const pedidos = [{ "Nome do contato": "Gelateria Exemplo", "CPF/CNPJ": "52998224725", Data: "2024-06-01" }];
    const [perto, longe] = montarNotasMyFrost(
      [nf("201", "Gelateria Exemplo", "2024-06-20", 9000), nf("202", "Gelateria Exemplo", "2025-02-01", 300)], contatos, pedidos);
    expect(perto.docs).toEqual(["52998224725"]);
    expect(longe.docs.sort()).toEqual(["11444777000161", "52998224725"]);
  });

  it("só entram as notas do emitente principal e cada número uma vez", () => {
    const notas = montarNotasMyFrost(
      [nf("301", "A", "2024-01-01", 1), nf("302", "B", "2024-01-02", 2), nf("301", "A", "2024-01-01", 1), nf("9", "C", "2024-01-03", 3, "Venda", "Outra Pessoa")],
      [], []);
    expect(notas.map((n) => n.numero)).toEqual(["301", "302"]);
  });

  it("tipo curto pela natureza da operação", () => {
    expect(tipoDaNota("Venda de mercadoria adquirida ou recebida de terceiros")).toBe("Venda");
    expect(tipoDaNota("Remessa de mercadoria ou bem para conserto ou reparo")).toBe("Conserto");
    expect(tipoDaNota("Retorno de mercadoria ou bem recebido p/ conserto")).toBe("Retorno de conserto");
    expect(tipoDaNota("Devolucao de venda")).toBe("Devolução");
    expect(tipoDaNota("999 - Estorno de NF-e nao cancelada no prazo legal")).toBe("Estorno");
    expect(tipoDaNota("Remessa de Garantia")).toBe("Garantia");
  });
});
