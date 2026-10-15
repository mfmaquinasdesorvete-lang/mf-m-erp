import { describe, expect, it } from "vitest";
import { classificar, documentosNaDescricao, mascararDocumento, totais, type Parte, type Propria } from "../partesRelacionadas";

// nomes e documentos inventados
const SOCIO: Parte = { id: "s1", nome: "Ana Exemplo da Silva", tipo: "socio", documentos: ["12345678909"], nomes_extrato: [] };
const LIGADA: Parte = { id: "e1", nome: "Gelados Exemplo Indústria", tipo: "empresa", documentos: ["11222333000181", "11222333000262"], nomes_extrato: ["GELADOS EXEMPLO"] };
const MF: Propria = { nomes: ["MF MÁQUINAS LTDA"], documentos: ["99888777000166", "99888777000247"] };
const de = (descricao: string, status = "pendente") => classificar({ descricao, status }, [SOCIO, LIGADA], MF);

describe("documentosNaDescricao", () => {
  it("inteiro e mascarado", () => {
    expect(documentosNaDescricao("Pix - MF - 99.888.777/0001-66 - BANCO")).toEqual([{ digitos: "99888777000166", mascarado: false }]);
    expect(documentosNaDescricao("ANA EXEMPLO - •••.456.789-•• - ITAÚ")).toEqual([{ digitos: "456789", mascarado: true }]);
    expect(documentosNaDescricao("MF - ***877700")).toEqual([{ digitos: "877700", mascarado: true }]);
  });
  it("datas, valores e referências não são documento", () => {
    expect(documentosNaDescricao("Pagamento 15/04/2026 de 1.252,30 Ref. 2730042d-5c91-4c91-9776-cb3556c2")).toEqual([]);
  });
});

describe("classificar", () => {
  it("sócio pelo CPF mascarado e pelo nome", () => {
    expect(de("Transferência enviada pelo Pix - ANA EXEMPLO DA SILVA - •••.456.789-•• - ITAÚ")).toEqual({ grupo: "parte", parte: "s1", como: "documento" });
    expect(de("Pix Ana Exemplo da Silva · Recebido")).toEqual({ grupo: "parte", parte: "s1", como: "nome" });
  });
  it("empresa ligada: matriz ou filial, pelo nome do extrato", () => {
    expect(de("Pix GELADOS EXEMPLO INDUSTRIA E COMERCIO LTDA · Recebido")).toEqual({ grupo: "parte", parte: "e1", como: "nome" });
    expect(de("TED 11.222.333/0002-62 GELADOS")).toEqual({ grupo: "parte", parte: "e1", como: "documento" });
  });
  it("entre as contas da MF: CNPJ, nome sem LTDA, ou marcado na conciliação", () => {
    expect(de("Transferência recebida pelo Pix - MF MAQUINAS - 99.888.777/0001-66 - CLOUDWALK")).toEqual({ grupo: "entre_contas", como: "documento" });
    expect(de("Pix MF MAQUINAS · Enviado")).toEqual({ grupo: "entre_contas", como: "nome" });
    expect(de("Reembolso LOJA EXEMPLO · mfmaquinas", "transferencia")).toEqual({ grupo: "entre_contas", como: "marcado" });
  });
  it("o apelido da conta (mfmaquinas) e nomes parecidos não contam", () => {
    expect(de("POSTO EXEMPLO · mfmaquinas")).toBeNull();
    expect(de("Pix Ana Exemplo Souza · Enviado")).toBeNull();
    expect(classificar({ descricao: "Pix Ana Exemplo da Silva" }, [{ ...SOCIO, ativo: false }], MF)).toBeNull();
  });
});

describe("mascararDocumento e totais", () => {
  it("esconde o meio", () => {
    expect(mascararDocumento("123.456.789-09")).toBe("•••.456.789-••");
    expect(mascararDocumento("11222333000181")).toBe("11.222.333/0001-••");
  });
  it("recebido, enviado e saldo", () => {
    expect(totais([{ valor: 100 }, { valor: -30 }, { valor: -20 }])).toEqual({ entrou: 100, saiu: 50, saldo: 50, n: 3 });
  });
});
