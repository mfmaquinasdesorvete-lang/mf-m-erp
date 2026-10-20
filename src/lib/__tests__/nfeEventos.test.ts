import { describe, expect, it } from "vitest";
import { eventosNaResposta, infoEvento, lerEventosXml, resumoPostos } from "../../../supabase/functions/_shared/nfe-eventos";

const CH = "42261011222333000181550010000012341000012346";
const evento = (tp: string, desc: string, dh: string, orgao: string, det = "", seq = 1) => `
<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
 <evento versao="1.00"><infEvento Id="ID${tp}${CH}0${seq}">
  <cOrgao>${orgao}</cOrgao><tpAmb>1</tpAmb><CNPJ>11222333000181</CNPJ><chNFe>${CH}</chNFe>
  <dhEvento>${dh}</dhEvento><tpEvento>${tp}</tpEvento><nSeqEvento>${seq}</nSeqEvento><verEvento>1.00</verEvento>
  <detEvento versao="1.00"><descEvento>${desc}</descEvento>${det}</detEvento>
 </infEvento></evento>
 <retEvento versao="1.00"><infEvento><tpAmb>1</tpAmb><cOrgao>${orgao}</cOrgao><cStat>135</cStat><chNFe>${CH}</chNFe>
  <tpEvento>${tp}</tpEvento><nSeqEvento>${seq}</nSeqEvento><nProt>1412600000${seq}</nProt></infEvento></retEvento>
</procEventoNFe>`;

describe("eventos da NF-e (postos fiscais)", () => {
  it("lê passagem, MDF-e e confirmação, com UF e protocolo", () => {
    const xml = `<lote>${evento("610610", "MDF-e Autorizado", "2026-10-15T11:00:00-03:00", "42", "<chMDFe>42261011222333000181580010000004561000004561</chMDFe>")}
      ${evento("610500", "Registro de Passagem", "2026-10-15T18:20:00-03:00", "41", "<xObs>Posto Fiscal de Guaratuba</xObs>")}
      ${evento("610500", "Registro de Passagem", "2026-10-16T02:10:00-03:00", "35", "<xObs>Posto Fiscal de Registro</xObs>", 2)}
      ${evento("210200", "Confirmacao da Operacao", "2026-10-17T09:00:00-03:00", "91")}</lote>`;
    const ev = lerEventosXml(xml);
    expect(ev).toHaveLength(4);
    expect(ev[0]).toMatchObject({ chave: CH, tp_evento: "610610", orgao: "SC", protocolo: "14126000001" });
    expect(ev[0].detalhe).toContain("MDF-e nº 456");
    expect(ev[1]).toMatchObject({ tp_evento: "610500", orgao: "PR", detalhe: "Posto Fiscal de Guaratuba" });
    const r = resumoPostos(ev);
    expect(r.passagens).toHaveLength(2);
    expect(r.ufs).toEqual(["PR", "SP"]);
    expect(r.transporte).toBe(true);
    expect(r.confirmada).toBe(true);
    expect(r.ultima?.orgao).toBe("SP");
  });

  it("cancelamento de passagem tira uma da conta", () => {
    const ev = lerEventosXml(evento("610500", "Registro de Passagem", "2026-10-15T18:20:00-03:00", "41") + evento("610550", "Cancelamento de Registro de Passagem", "2026-10-15T19:00:00-03:00", "41"));
    expect(resumoPostos(ev).passagens).toHaveLength(0);
  });

  it("acha os eventos dentro de uma resposta JSON qualquer", () => {
    const corpo = { status: "autorizado", eventos: [{ xml: evento("610500", "Registro de Passagem", "2026-10-15T18:20:00-03:00", "41") }] };
    expect(eventosNaResposta(corpo)).toHaveLength(1);
    expect(eventosNaResposta({ status: "autorizado" })).toEqual([]);
  });

  it("nomes dos tipos", () => {
    expect(infoEvento("610500").grupo).toBe("passagem");
    expect(infoEvento("610599").grupo).toBe("passagem");
    expect(infoEvento("210200").grupo).toBe("destinatario");
    expect(infoEvento("999999").grupo).toBe("outro");
  });
});
