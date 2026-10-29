// Troca da transportadora pela carta de correção e a leitura de volta para as etiquetas. Dados inventados.
import { describe, expect, it } from "vitest";
import { textoTrocaTransportadora } from "../cartaCorrecao";
import { transportadoraDasCartas } from "../etiquetaDados";

describe("carta de correção da transportadora", () => {
  const nova = { nome: "Transportes Exemplo Ltda", cnpj: "11222333000181", inscricao_estadual: "123456", logradouro: "Rua A", numero: "10", bairro: "Centro", municipio: "Joinville", uf: "sc" };

  it("texto com a atual e a nova, numa linha só", () => {
    const t = textoTrocaTransportadora({ nome_transportador: "Velha Cargas", cnpj_transportador: "99888777000166" }, nova);
    expect(t).toBe('Transportadora: onde se lê "Velha Cargas, CNPJ 99.888.777/0001-66", leia-se "Transportes Exemplo Ltda, CNPJ 11.222.333/0001-81, IE 123456, Rua A, 10, Centro, Joinville/SC".');
    expect(t).not.toMatch(/\n/);
    expect(textoTrocaTransportadora({}, { nome: "Só Nome" })).toBe('Transportadora: onde se lê "sem transportadora", leia-se "Só Nome".');
  });

  it("as etiquetas pegam o nome da última carta que trocou", () => {
    const c1 = textoTrocaTransportadora({}, nova);
    const c2 = `Endereço corrigido. ${textoTrocaTransportadora({ nome_transportador: "Transportes Exemplo Ltda" }, { nome: "Outra Log", cnpj: "11222333000181" })}`;
    expect(transportadoraDasCartas([c1])).toBe("Transportes Exemplo Ltda");
    expect(transportadoraDasCartas([c1, c2])).toBe("Outra Log");
    expect(transportadoraDasCartas(["Onde se lê rua 1, leia-se rua 2"])).toBeNull();
  });
});
