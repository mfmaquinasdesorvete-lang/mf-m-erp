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
