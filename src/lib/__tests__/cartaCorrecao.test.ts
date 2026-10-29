// Troca da transportadora pela carta de correção e a leitura de volta (etiquetas e tela). Dados inventados.
import { describe, expect, it } from "vitest";
import { documentoTransportador, juntarCorrecao, semTrocaTransportadora, textoTrocaTransportadora, transportadoraDaUltimaCarta } from "../cartaCorrecao";

describe("carta de correção da transportadora", () => {
  const nova = { nome: "Transportes Exemplo Ltda", cnpj: "11222333000181", inscricao_estadual: "123456", logradouro: "Rua A", numero: "10", bairro: "Centro", municipio: "Joinville", uf: "sc" };
  const naNota = { nome_transportador: "Velha Cargas", cnpj_transportador: "99888777000166", modalidade_frete: 0 };

  it("texto a partir do XML, numa linha só", () => {
    const t = textoTrocaTransportadora(naNota, nova);
    expect(t).toBe('Transportadora: onde se lê "Velha Cargas" (CNPJ 99.888.777/0001-66), leia-se "Transportes Exemplo Ltda" (CNPJ 11.222.333/0001-81; IE 123456; Rua A, 10, Centro; Joinville/SC).');
    expect(t).not.toMatch(/\n/);
    expect(textoTrocaTransportadora({ modalidade_frete: 1 }, { nome: "Só Nome" })).toBe('Transportadora: onde se lê "sem transportadora", leia-se "Só Nome".');
  });

  it("CPF sai como CPF", () => {
    expect(documentoTransportador("12345678909")).toBe("CPF 123.456.789-09");
    expect(textoTrocaTransportadora({ nome_transportador: "Fulano", cpf_transportador: "12345678909", modalidade_frete: 0 }, { nome: "Fretes", cnpj: "98765432100" }))
      .toBe('Transportadora: onde se lê "Fulano" (CPF 123.456.789-09), leia-se "Fretes" (CPF 987.654.321-00).');
  });

  it("nota sem frete: corrige também quem paga", () => {
    const t = textoTrocaTransportadora({ modalidade_frete: 9 }, { nome: "X Log" }, 0);
    expect(t).toMatch(/^Modalidade do frete: onde se lê "9 - Sem ocorrência de transporte", leia-se "0 - Por conta do remetente"\. Transportadora:/);
  });

  it("junta com as outras correções e troca a troca anterior", () => {
    const outras = 'Endereço de entrega: onde se lê "Rua 1", leia-se "Rua 2".';
    const c1 = juntarCorrecao(outras, textoTrocaTransportadora(naNota, nova));
    expect(c1.startsWith(outras)).toBe(true);
    const c2 = juntarCorrecao(c1, textoTrocaTransportadora(naNota, { nome: "Outra Log" }));
    expect(semTrocaTransportadora(c2)).toBe(outras);
    expect(c2.match(/Transportadora:/g)).toHaveLength(1);
  });

  it("só a última carta vale", () => {
    const c1 = textoTrocaTransportadora(naNota, nova);
    const so2 = 'Endereço: onde se lê "Rua 1", leia-se "Rua 2".';
    expect(transportadoraDaUltimaCarta([c1])).toBe("Transportes Exemplo Ltda");
    expect(transportadoraDaUltimaCarta([c1, so2])).toBeNull();
    expect(transportadoraDaUltimaCarta([so2, textoTrocaTransportadora(naNota, { nome: "Sem Doc", logradouro: "Rua B", municipio: "Itajaí", uf: "SC" })])).toBe("Sem Doc");
    expect(transportadoraDaUltimaCarta([])).toBeNull();
  });
});
