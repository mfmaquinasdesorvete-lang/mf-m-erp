import { describe, expect, it } from "vitest";
import { dadosDaChave, lerCte, situacaoFocus } from "../../../supabase/functions/_shared/cte-xml";

// CT-e inventado (empresas, CNPJs e valores de exemplo)
const CHAVE = "42260511222333000144570010030671931000000010";
const NFE1 = "42260599888777000166550010000123451000000017";
const NFE2 = "42260599888777000166550010000123461000000025";
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<cteProc xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><CTe><infCte versao="4.00" Id="CTe${CHAVE}">
<ide><cUF>42</cUF><cCT>00000001</cCT><CFOP>5353</CFOP><natOp>PRESTACAO DE SERVICO DE TRANSPORTE</natOp><mod>57</mod><serie>1</serie><nCT>3067193</nCT>
<dhEmi>2026-05-26T10:20:30-03:00</dhEmi><tpImp>1</tpImp><tpEmis>1</tpEmis><tpAmb>1</tpAmb><tpCTe>0</tpCTe><modal>01</modal><tpServ>0</tpServ>
<cMunIni>4211900</cMunIni><xMunIni>PALHOCA</xMunIni><UFIni>SC</UFIni><cMunFim>3501608</cMunFim><xMunFim>AMERICANA</xMunFim><UFFim>SP</UFFim>
<retira>1</retira><indIEToma>1</indIEToma><toma3><toma>3</toma></toma3></ide>
<compl><xObs>Transportadora &amp; Cia</xObs></compl>
<emit><CNPJ>11222333000144</CNPJ><IE>123</IE><xNome>TRANSPORTES EXEMPLO LTDA</xNome><enderEmit><xLgr>Rua A</xLgr><UF>SC</UF></enderEmit></emit>
<rem><CNPJ>99888777000166</CNPJ><IE>1</IE><xNome>FORNECEDOR TESTE SA</xNome><enderReme><xLgr>Rua B</xLgr><UF>RS</UF></enderReme></rem>
<dest><CNPJ>55444333000122</CNPJ><IE>2</IE><xNome>FABRICA EXEMPLO LTDA</xNome><enderDest><xLgr>Rua C</xLgr><UF>SC</UF></enderDest></dest>
<vPrest><vTPrest>212.37</vTPrest><vRec>212.37</vRec><Comp><xNome>FRETE PESO</xNome><vComp>150.00</vComp></Comp></vPrest>
<imp><ICMS><ICMS00><CST>00</CST><vBC>212.37</vBC><pICMS>12.00</pICMS><vICMS>25.48</vICMS></ICMS00></ICMS><vTotTrib>30.00</vTotTrib></imp>
<infCTeNorm><infCarga><vCarga>4850.90</vCarga><proPred>PECAS</proPred>
<infQ><cUnid>01</cUnid><tpMed>PESO BASE DE CALCULO</tpMed><qCarga>80.0000</qCarga></infQ>
<infQ><cUnid>01</cUnid><tpMed>PESO REAL</tpMed><qCarga>62.5000</qCarga></infQ>
<infQ><cUnid>03</cUnid><tpMed>VOLUMES</tpMed><qCarga>3.0000</qCarga></infQ></infCarga>
<infDoc><infNFe><chave>${NFE1}</chave><dPrev>2026-05-29</dPrev></infNFe><infNFe><chave>${NFE2}</chave></infNFe><infNFe><chave>${NFE1}</chave></infNFe></infDoc>
<infModal versaoModal="4.00"><rodo><RNTRC>12345678</RNTRC></rodo></infModal>
<cobr><fat><nFat>FAT-889</nFat><vOrig>212.37</vOrig><vLiq>212.37</vLiq></fat><dup><nDup>001</nDup><dVenc>2026-06-15</dVenc><vDup>212.37</vDup></dup></cobr>
</infCTeNorm></infCte></CTe>
<protCTe versao="4.00"><infProt><tpAmb>1</tpAmb><chCTe>${CHAVE}</chCTe><cStat>100</cStat><xMotivo>Autorizado o uso do CT-e</xMotivo></infProt></protCTe></cteProc>`;

describe("CT-e da SEFAZ: leitura do XML", () => {
  const c = lerCte(XML);

  it("chave, número, série, tipo e emissão", () => {
    expect(c).toMatchObject({ chave: CHAVE, modelo: "57", numero: "3067193", serie: "1", tipo: "CT-e", emissao: "2026-05-26", cfop: "5353", situacao: "autorizado" });
    expect([c.municipio_inicio, c.uf_inicio, c.municipio_fim, c.uf_fim]).toEqual(["PALHOCA", "SC", "AMERICANA", "SP"]);
  });

  it("transportadora, remetente e destinatário", () => {
    expect(c.emitente).toEqual({ cnpj: "11222333000144", nome: "TRANSPORTES EXEMPLO LTDA", uf: "SC" });
    expect(c.remetente).toEqual({ cnpj: "99888777000166", nome: "FORNECEDOR TESTE SA", uf: "RS" });
    expect(c.destinatario?.cnpj).toBe("55444333000122");
    expect(c.expedidor).toBeNull();
  });

  it("quem paga o frete: toma3 = 3 é o destinatário", () => {
    expect(c.tomador).toBe("destinatario");
    expect(c.tomador_cnpj).toBe("55444333000122");
    expect(c.tomador_nome).toBe("FABRICA EXEMPLO LTDA");
  });

  it("valores, carga (peso real, não o de cálculo), ICMS", () => {
    expect(c.valor).toBe(212.37);
    expect(c.valor_carga).toBe(4850.9);
    expect(c.produto).toBe("PECAS");
    expect(c.peso_kg).toBe(62.5);
    expect(c.volumes).toBe(3);
    expect(c.icms).toBe(25.48);
  });

  it("notas transportadas sem repetir, previsão de entrega e fatura do próprio CT-e", () => {
    expect(c.nfe_chaves).toEqual([NFE1, NFE2]);
    expect(c.prev_entrega).toBe("2026-05-29");
    expect(c.cobranca).toEqual({ fatura: "FAT-889", valor: 212.37, duplicatas: [{ numero: "001", vencimento: "2026-06-15", valor: 212.37 }] });
  });

  it("toma3 = 0: o remetente paga (frete pago / CIF)", () => {
    const r = lerCte(XML.replace("<toma>3</toma>", "<toma>0</toma>"));
    expect(r.tomador).toBe("remetente");
    expect(r.tomador_cnpj).toBe("99888777000166");
  });

  it("toma4 = outros, com o CNPJ dele; layout antigo com toma03", () => {
    const outros = lerCte(XML.replace("<toma3><toma>3</toma></toma3>",
      "<toma4><toma>4</toma><CNPJ>12312312000199</CNPJ><xNome>TERCEIRO PAGADOR</xNome><enderToma><UF>PR</UF></enderToma></toma4>"));
    expect(outros).toMatchObject({ tomador: "outros", tomador_cnpj: "12312312000199", tomador_nome: "TERCEIRO PAGADOR" });
    const antigo = lerCte(XML.replace("<toma3><toma>3</toma></toma3>", "<toma03><toma>1</toma></toma03>"));
    expect(antigo.tomador).toBe("expedidor");
    expect(antigo.tomador_cnpj).toBeNull();
  });

  it("CT-e complementar, peso em tonelada, ICMS de outra UF, sem protocolo e com prefixo de namespace", () => {
    const x = XML.replace("<tpCTe>0</tpCTe>", "<tpCTe>1</tpCTe>")
      .replace("<cUnid>01</cUnid><tpMed>PESO REAL</tpMed><qCarga>62.5000", "<cUnid>02</cUnid><tpMed>PESO BRUTO</tpMed><qCarga>1.2000")
      .replace(/<ICMS00>[\s\S]*<\/ICMS00>/, "<ICMSOutraUF><CST>90</CST><vICMSOutraUF>9.90</vICMSOutraUF></ICMSOutraUF>")
      .replace(/<protCTe[\s\S]*<\/protCTe>/, "")
      .replace(/<(\/?)rem>/g, "<$1cte:rem>");
    const r = lerCte(x);
    expect(r.tipo).toBe("CT-e complementar");
    expect(r.peso_kg).toBe(1200);
    expect(r.icms).toBe(9.9);
    expect(r.situacao).toBe("sem_protocolo");
    expect(r.remetente?.cnpj).toBe("99888777000166");
  });

  it("CT-e OS (modelo 67): tomador em bloco próprio", () => {
    const os = `<cteOSProc><CTeOS><infCte versao="4.00" Id="CTe${CHAVE.slice(0, 20)}67${CHAVE.slice(22)}"><ide><mod>67</mod><serie>2</serie><nCT>15</nCT>
      <dhEmi>2026-07-01T08:00:00-03:00</dhEmi></ide><emit><CNPJ>11222333000144</CNPJ><xNome>TRANSPORTES EXEMPLO LTDA</xNome></emit>
      <toma><CNPJ>55444333000122</CNPJ><xNome>FABRICA EXEMPLO LTDA</xNome></toma><vPrest><vTPrest>90.00</vTPrest></vPrest></infCte></CTeOS></cteOSProc>`;
    const r = lerCte(os);
    expect(r).toMatchObject({ modelo: "67", tipo: "CT-e OS", numero: "15", serie: "2", tomador: "outros", tomador_cnpj: "55444333000122", valor: 90, nfe_chaves: [] });
  });

  it("recusa arquivo que não é CT-e", () => {
    expect(() => lerCte("<nfeProc><NFe><infNFe/></NFe></nfeProc>")).toThrow(/não é o XML de um CT-e/);
    expect(() => lerCte("<CTe><infCte versao=\"4.00\"><ide/></infCte></CTe>")).toThrow(/chave/);
  });
});

describe("CT-e da SEFAZ: lista da Focus", () => {
  it("situação no padrão do ERP", () => {
    expect(situacaoFocus("autorizado")).toBe("autorizado");
    expect(situacaoFocus("Cancelado")).toBe("cancelado");
    expect(situacaoFocus("cancelada")).toBe("cancelado");
    expect(situacaoFocus("denegado")).toBe("denegado");
    expect(situacaoFocus(undefined)).toBe("autorizado");
  });

  it("número, série e emitente pela chave", () => {
    expect(dadosDaChave(CHAVE)).toEqual({ modelo: "57", serie: "1", numero: "3067193", emitente_cnpj: "11222333000144" });
  });
});
