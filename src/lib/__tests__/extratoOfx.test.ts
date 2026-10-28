import { describe, expect, it } from "vitest";
import { lerOfx } from "../extrato";

const ofx = (transacoes: string) => `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>136<ACCTID>12345</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260701000000<DTEND>20260731235959
${transacoes}
</BANKTRANLIST><LEDGERBAL><BALAMT>28.09<DTASOF>20260731</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("extrato OFX: período do arquivo (pedido de 28/10)", () => {
  it("lê o período e o saldo mesmo sem nenhum lançamento", () => {
    const r = lerOfx(ofx(""));
    expect(r.linhas).toEqual([]);
    expect(r.periodoInicio).toBe("2026-07-01");
    expect(r.periodoFim).toBe("2026-07-31");
    expect(r.saldoFinal).toBe(28.09);
  });

  it("o período vem da lista do banco, não da data de um lançamento", () => {
    const r = lerOfx(ofx("<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260715<TRNAMT>-10.00<FITID>a1<MEMO>Tarifa</STMTTRN>"));
    expect(r.linhas).toHaveLength(1);
    expect(r.periodoInicio).toBe("2026-07-01");
    expect(r.periodoFim).toBe("2026-07-31");
  });
});

import { contaDoArquivo } from "../extrato";

describe("conta do extrato pelo arquivo (pedido de 28/10)", () => {
  const contas = [
    { id: "inter", nome: "Banco Inter SC", banco: "inter", numero: "1234567" },
    { id: "fab", nome: "Infinite SP - FABIANO", banco: "infinitepay", numero: "26441264-5" },
    { id: "infsc", nome: "InfinitePay SC", banco: "infinitepay", numero: null },
    { id: "uni", nome: "Unicred MF SC", banco: "unicred", numero: "999888" },
  ];
  it("acha pelo número da conta do OFX", () => expect(contaDoArquivo("x.ofx", "264412645", contas)).toBe("fab"));
  it("\"Infinit fa\" não cai na primeira conta: Infinit + fa é ambíguo entre as duas InfinitePay → pede para escolher", () =>
    expect(contaDoArquivo("Infinit fa.ofx", null, contas)).toBeNull());
  it("acha pelo nome do titular", () => expect(contaDoArquivo("Infinit Fabiano 27.ofx", null, contas)).toBe("fab"));
  it("acha a Unicred pelo nome", () => expect(contaDoArquivo("extrato unicred jun.ofx", null, contas)).toBe("uni"));
  it("sem pista nenhuma devolve null (não escolhe a primeira em silêncio)", () => expect(contaDoArquivo("extrato.ofx", null, contas)).toBeNull());
});
