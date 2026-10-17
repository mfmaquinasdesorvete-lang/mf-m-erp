import { describe, expect, it } from "vitest";
import { lerExtratoTexto } from "../extratoPdf";

// texto como sai de um extrato em PDF (dados inventados)
const ITAU = [
  "Extrato conta corrente",
  "Período de visualização: 01/09/2026 até 30/09/2026",
  "data lançamentos valor (R$) saldo (R$)",
  "01/09/2026 SALDO ANTERIOR 1.200,00",
  "02/09/2026 PIX TRANSF EXEMPLO SILVA02/09 -150,00",
  "02/09/2026 PIX TRANSF EXEMPLO SILVA02/09 -150,00",
  "02/09/2026 SALDO DO DIA 900,00",
  "05/09 PAG BOLETO ENERGIA -312,45 587,55",
  "10/09/2026 TED RECEBIDA EMPRESA EXEMPLO 4.500,00",
  "12/09/2026 COMPRA CARTAO MERCADO",
  "EXEMPLO LTDA 89,90-",
  "15/09/2026 TAR PACOTE SERVICOS 45,00 D",
  "Total de entradas 4.500,00",
];

describe("extrato em PDF", () => {
  it("lê data, descrição e valor; saldo e totais ficam de fora; sem ano usa o do período", () => {
    const { linhas, ignoradas } = lerExtratoTexto(ITAU);
    expect(linhas.map((l) => [l.data, l.descricao, l.valor])).toEqual([
      ["2026-09-02", "PIX TRANSF EXEMPLO SILVA02/09", -150],
      ["2026-09-02", "PIX TRANSF EXEMPLO SILVA02/09", -150],
      ["2026-09-05", "PAG BOLETO ENERGIA", -312.45],
      ["2026-09-10", "TED RECEBIDA EMPRESA EXEMPLO", 4500],
      ["2026-09-12", "COMPRA CARTAO MERCADO EXEMPLO LTDA", -89.9],
      ["2026-09-15", "TAR PACOTE SERVICOS", -45],
    ]);
    expect(ignoradas).toBe(3);
  });

  it("dois lançamentos iguais no mesmo dia não se confundem; ler de novo dá os mesmos identificadores", () => {
    const a = lerExtratoTexto(ITAU).linhas;
    expect(a[0].identificador).not.toBe(a[1].identificador);
    expect(lerExtratoTexto(ITAU).linhas.map((l) => l.identificador)).toEqual(a.map((l) => l.identificador));
  });
});
