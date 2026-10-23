import { describe, expect, it } from "vitest";
import { grupoDaNota, linhasParaPlanilha, resumoPorAno, resumoParaPlanilha, type NotaMyFrostRelatorio } from "../relatorioNotasMyFrost";

const nota = (p: Partial<NotaMyFrostRelatorio>): NotaMyFrostRelatorio => ({
  id: Math.random().toString(), numero: "1", data: "2022-05-10", valor: 100, natureza: "Venda de mercadoria",
  situacao: "autorizada", tipo: "saida", chave: null, dest_doc: null, dest_nome: null, cartas_correcao: 0, ...p,
});

describe("grupoDaNota", () => {
  it("separa vendas, remessas, devoluções, estornos e canceladas", () => {
    expect(grupoDaNota(nota({ natureza: "Venda de producao do estabelecimento" }))).toBe("Vendas");
    expect(grupoDaNota(nota({ natureza: "Remessa de mercadoria ou bem para conserto ou reparo" }))).toBe("Remessas");
    expect(grupoDaNota(nota({ natureza: "Remessa de Garentia" }))).toBe("Remessas");
    expect(grupoDaNota(nota({ natureza: "Outra saida de mercadoria" }))).toBe("Remessas");
    expect(grupoDaNota(nota({ natureza: "DEVOLUCAO DE COMPRA P/ COMERCI" }))).toBe("Devoluções");
    expect(grupoDaNota(nota({ natureza: "999 - Estorno de NF-e nao cancelada no prazo legal" }))).toBe("Estornos");
    expect(grupoDaNota(nota({ natureza: "Venda de mercadoria", situacao: "cancelada" }))).toBe("Canceladas");
  });
});

describe("resumoPorAno", () => {
  it("soma por ano e grupo; a cancelada fica fora das válidas", () => {
    const r = resumoPorAno([
      nota({ data: "2022-01-01", valor: 100 }),
      nota({ data: "2022-02-01", valor: 50.1, natureza: "Remessa de garantia" }),
      nota({ data: "2022-03-01", valor: 1000, situacao: "cancelada" }),
      nota({ data: "2021-03-01", valor: 20.2, natureza: "Devolucao de venda", tipo: "entrada" }),
    ]);
    expect(r.anos.map((a) => a.ano)).toEqual(["2021", "2022"]);
    const a22 = r.anos[1];
    expect(a22.grupos.Vendas).toEqual({ qtd: 1, valor: 100 });
    expect(a22.grupos.Remessas).toEqual({ qtd: 1, valor: 50.1 });
    expect(a22.grupos.Canceladas).toEqual({ qtd: 1, valor: 1000 });
    expect(a22.validas).toEqual({ qtd: 2, valor: 150.1 });
    expect(r.total.validas).toEqual({ qtd: 3, valor: 170.3 });
    expect(r.total.grupos.Canceladas.qtd).toBe(1);
    expect(resumoParaPlanilha(r)).toHaveLength(3);
  });
});

describe("linhasParaPlanilha", () => {
  it("ordena pela data e formata o documento", () => {
    const l = linhasParaPlanilha([
      nota({ numero: "9", data: "2023-01-02", dest_doc: "12345678000195", tipo: "entrada" }),
      nota({ numero: "8", data: "2022-01-02", dest_doc: "12345678909", dest_nome: null, cliente_nome: "Fulano", situacao: "cancelada" }),
    ]);
    expect(l[0]["NF nº"]).toBe(8);
    expect(l[0]["CPF/CNPJ"]).toBe("123.456.789-09");
    expect(l[0].Destinatário).toBe("Fulano");
    expect(l[0].Situação).toBe("Cancelada");
    expect(l[1]["CPF/CNPJ"]).toBe("12.345.678/0001-95");
    expect(l[1]["Entrada/Saída"]).toBe("Entrada");
  });
});
