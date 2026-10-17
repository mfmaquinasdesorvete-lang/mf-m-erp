import { describe, expect, it } from "vitest";
import { lerRelatorioTinyNfse, lerXmlNfse, liquidoNfse, retencoes, situacaoImportada, valorNumero } from "../nfseImportada";

const ABRASF = `<?xml version="1.0" encoding="UTF-8"?>
<ConsultarNfseResposta xmlns="http://www.abrasf.org.br/nfse.xsd"><ListaNfse>
<CompNfse><Nfse versao="2.02"><InfNfse Id="n1">
  <Numero>123</Numero><CodigoVerificacao>AB12CD</CodigoVerificacao><DataEmissao>2026-09-30T10:15:00</DataEmissao>
  <ValoresNfse><BaseCalculo>1500.00</BaseCalculo><ValorIss>30.00</ValorIss><ValorLiquidoNfse>1407.75</ValorLiquidoNfse></ValoresNfse>
  <PrestadorServico><IdentificacaoPrestador><CpfCnpj><Cnpj>11222333000181</Cnpj></CpfCnpj></IdentificacaoPrestador>
    <RazaoSocial>Escritório Contábil &amp; Cia</RazaoSocial></PrestadorServico>
  <DeclaracaoPrestacaoServico><InfDeclaracaoPrestacaoServico>
    <Rps><IdentificacaoRps><Numero>77</Numero><Serie>1</Serie></IdentificacaoRps></Rps>
    <Competencia>2026-09-01</Competencia>
    <Servico><Valores><ValorServicos>1500.00</ValorServicos><ValorPis>9.75</ValorPis><ValorCofins>45.00</ValorCofins>
      <ValorCsll>15.00</ValorCsll><ValorIr>22.50</ValorIr><ValorIss>30.00</ValorIss></Valores>
      <IssRetido>1</IssRetido><ItemListaServico>17.19</ItemListaServico><Discriminacao>Honorários contábeis de setembro</Discriminacao>
      <CodigoMunicipio>4216602</CodigoMunicipio></Servico>
    <Prestador><CpfCnpj><Cnpj>11222333000181</Cnpj></CpfCnpj></Prestador>
    <Tomador><IdentificacaoTomador><CpfCnpj><Cnpj>99888777000166</Cnpj></CpfCnpj></IdentificacaoTomador><RazaoSocial>MF Teste</RazaoSocial></Tomador>
  </InfDeclaracaoPrestacaoServico></DeclaracaoPrestacaoServico>
</InfNfse></Nfse></CompNfse>
</ListaNfse></ConsultarNfseResposta>`;

const NACIONAL = `<NFSe versao="1.00" xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS42166022299888777000166000000000004526090000000012">
<xLocEmi>São José</xLocEmi><xLocPrestacao>São José</xLocPrestacao><nNFSe>45</nNFSe><dhProc>2026-09-10T08:00:00-03:00</dhProc>
<emit><CNPJ>99888777000166</CNPJ><xNome>MF Teste Ltda</xNome></emit>
<valores><vBC>800.00</vBC><vISSQN>16.00</vISSQN><vLiq>800.00</vLiq></valores>
<DPS versao="1.00"><infDPS Id="DPS1"><dhEmi>2026-09-10T07:59:00-03:00</dhEmi><nDPS>12</nDPS><dCompet>2026-09-10</dCompet>
<prest><CNPJ>99888777000166</CNPJ></prest><toma><CPF>12345678909</CPF><xNome>Cliente Pessoa</xNome></toma>
<serv><cServ><cTribNac>140101</cTribNac><xDescServ>Conserto de máquina de sorvete</xDescServ></cServ></serv>
<valores><vServPrest><vServ>800.00</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun></trib></valores>
</infDPS></DPS></infNFSe></NFSe>`;

describe("NFS-e de fora do ERP", () => {
  it("lê o XML ABRASF 2 (número da nota, RPS, prestador, tomador, retenções)", () => {
    const [n] = lerXmlNfse(ABRASF, "a.xml");
    expect(n.numero).toBe("123");
    expect(n.rps).toBe("77");
    expect(n.codigo_verificacao).toBe("AB12CD");
    expect(n.data_emissao).toBe("2026-09-30");
    expect(n.competencia).toBe("2026-09-01");
    expect([n.prestador_doc, n.prestador_nome]).toEqual(["11222333000181", "Escritório Contábil & Cia"]);
    expect([n.tomador_doc, n.tomador_nome]).toEqual(["99888777000166", "MF Teste"]);
    expect(n.valor_servicos).toBe("1500.00");
    expect([n.valor_iss, n.iss_retido, n.valor_ir, n.valor_pis, n.valor_cofins, n.valor_csll]).toEqual([30, true, 22.5, 9.75, 45, 15]);
    expect(n.valor_liquido).toBe(1407.75);
    expect(n.codigo_servico).toBe("17.19");
    expect(n.discriminacao).toBe("Honorários contábeis de setembro");
  });

  it("lê a NFS-e Nacional (chave, DPS, ISS não retido)", () => {
    const [n] = lerXmlNfse(NACIONAL, "b.xml");
    expect(n.numero).toBe("45");
    expect(n.chave_acesso).toHaveLength(50);
    expect(n.rps).toBe("12");
    expect(n.data_emissao).toBe("2026-09-10");
    expect([n.prestador_doc, n.tomador_doc, n.tomador_nome]).toEqual(["99888777000166", "12345678909", "Cliente Pessoa"]);
    expect([n.valor_servicos, n.valor_iss, n.iss_retido, n.valor_liquido]).toEqual(["800.00", 16, false, 800]);
    expect(n.codigo_servico).toBe("140101");
    expect(n.municipio).toBe("São José");
  });

  it("arquivo que não é NFS-e não vira nota", () => {
    expect(lerXmlNfse("<nfeProc><NFe/></nfeProc>")).toEqual([]);
  });

  it("lê o relatório de notas de serviço do Tiny (RPS sem número)", () => {
    const linhas = [
      ["Número RPS", "Número NFSe", "Cliente", "Data de emissão", "Valor Líquido", "Valor IR", "Valor INSS", "Valor ISS", "Valor Cofins", "Valor PIS", "Valor CSLL", "Total serviços"],
      ["0002426", "", "Cliente Franquia Ltda", "18/03/2026", "6292.61", "0.0", "0.0", "0.0", "188.78", "40.9", "62.93", "6000.0"],
    ];
    const [n] = lerRelatorioTinyNfse(linhas, "u1");
    expect(n).toMatchObject({ origem: "tiny", tipo: "emitida", unidade_id: "u1", rps: "0002426", numero: "", data_emissao: "2026-03-18",
      valor_servicos: "6000.00", valor_pis: 40.9, valor_cofins: 188.78, valor_csll: 62.93 });
  });

  it("soma das retenções e valores em formato brasileiro", () => {
    expect(retencoes({ valor_ir: 22.5, valor_inss: 0, valor_pis: 9.75, valor_cofins: 45, valor_csll: 15, valor_iss: 30, iss_retido: true })).toBe(122.25);
    expect(valorNumero("1.234,56")).toBe(1234.56);
  });

  it("serviço tomado lançado na tela: sem nota e valor a pagar sem as retenções", () => {
    expect(situacaoImportada({ origem: "manual", situacao: "sem_numero" }).label).toBe("Sem nota");
    expect(situacaoImportada({ origem: "xml", situacao: "sem_numero" }).label).toBe("Sem número");
    expect(situacaoImportada({ origem: "manual", situacao: "normal" }).label).toBe("Autorizada");
    const base = { valor_servicos: 1000, valor_ir: 15, valor_inss: 0, valor_pis: 0, valor_cofins: 0, valor_csll: 0, valor_iss: 50 };
    expect(liquidoNfse({ ...base, iss_retido: true, valor_liquido: null })).toBe(935);
    expect(liquidoNfse({ ...base, iss_retido: false, valor_liquido: null })).toBe(985);
    expect(liquidoNfse({ ...base, iss_retido: true, valor_liquido: 940 })).toBe(940);
  });
});
