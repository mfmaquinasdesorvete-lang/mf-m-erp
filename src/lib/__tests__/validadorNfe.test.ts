import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";
import * as xmldsig from "xmldsigjs";
import { setNodeDependencies } from "xml-core";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import * as xpath from "xpath";
import {
  cnpjValido, conferirRegras, cpfValido, dadosDoTitular, dvChave, gtinValido, traduzirErroXsd, validarEstrutura, validarNfe,
  verificarAssinatura,
} from "../validadorNfe";
import { CHAVE_EXEMPLO, nfeExemplo } from "./fixtures/nfeExemplo";

const pasta = fileURLToPath(new URL("../../../public/xsd/nfe/", import.meta.url));
const carregarXsd = (nome: string) => readFile(pasta + nome, "utf8");
const AGORA = new Date("2026-10-20T12:00:00-03:00");

setNodeDependencies({ DOMParser, XMLSerializer, xpath });
xmldsig.Application.setEngine("NodeJS", globalThis.crypto);

/** Certificado de teste (inventado) no formato do e-CNPJ, emitido por "ICP-Brasil" de mentira. */
async function certificadoTeste(cnpj = "11222333000181") {
  const alg = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-1" };
  const chaves = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]) as CryptoKeyPair;
  const cert = new pkijs.Certificate();
  cert.version = 2;
  cert.serialNumber = new asn1js.Integer({ value: 1 });
  const nome = (o: string, cn: string) => [
    new pkijs.AttributeTypeAndValue({ type: "2.5.4.10", value: new asn1js.Utf8String({ value: o }) }),
    new pkijs.AttributeTypeAndValue({ type: "2.5.4.3", value: new asn1js.Utf8String({ value: cn }) }),
  ];
  cert.issuer.typesAndValues.push(...nome("ICP-Brasil", "AC TESTE"));
  cert.subject.typesAndValues.push(...nome("ICP-Brasil", `EMPRESA EXEMPLO LTDA:${cnpj}`));
  cert.notBefore.value = new Date("2026-01-01");
  cert.notAfter.value = new Date("2027-01-01");
  await cert.subjectPublicKeyInfo.importKey(chaves.publicKey);
  await cert.sign(chaves.privateKey, "SHA-1");
  const der = new Uint8Array(cert.toSchema().toBER());
  return { chaves, b64: btoa(String.fromCharCode(...der)) };
}

/** Assina como a SEFAZ exige: referência ao infNFe, enveloped + C14N, RSA. */
async function assinar(xml: string, cnpjCert?: string) {
  const { chaves, b64 } = await certificadoTeste(cnpjCert);
  const doc = xmldsig.Parse(xml);
  const nfe = doc.getElementsByTagNameNS("http://www.portalfiscal.inf.br/nfe", "NFe")[0];
  const signed = new xmldsig.SignedXml();
  const sig = await signed.Sign({ name: "RSASSA-PKCS1-v1_5" }, chaves.privateKey, doc, {
    x509: [b64],
    references: [{ uri: `#NFe${CHAVE_EXEMPLO}`, hash: "SHA-1", transforms: ["enveloped", "c14n"] }],
  });
  nfe.appendChild(sig.GetXml()!);
  const digest = nfe.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "DigestValue")[0].textContent!;
  const texto = new XMLSerializer().serializeToString(doc as never);
  return texto.replace(/<digVal>[^<]*<\/digVal>/, `<digVal>${digest}</digVal>`);
}

describe("dígitos verificadores", () => {
  it("chave, CNPJ, CPF e GTIN", () => {
    expect(dvChave(CHAVE_EXEMPLO.slice(0, 43))).toBe(6);
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("52998224726")).toBe(false);
    expect(gtinValido("7891000315507")).toBe(true);
    expect(gtinValido("7891000315508")).toBe(false);
  });
  it("titular do certificado e-CNPJ", () => {
    expect(dadosDoTitular("C=BR, O=ICP-Brasil, CN=EMPRESA X LTDA:11222333000181")).toEqual({ nome: "EMPRESA X LTDA", cnpj: "11222333000181" });
  });
});

describe("regras de rejeição e protocolo", () => {
  it("nota certa passa nas regras", () => {
    const r = conferirRegras(nfeExemplo(), AGORA);
    expect(r.chave).toBe(CHAVE_EXEMPLO);
    expect(r.valor).toBe(1500);
    expect(r.achados.filter((a) => a.grupo === "regras" && a.nivel !== "ok")).toEqual([]);
  });
  it("total da nota diferente da soma acusa a rejeição 610", () => {
    const r = conferirRegras(nfeExemplo({ vNF: "1600.00" }), AGORA);
    expect(r.achados.some((a) => a.nivel === "erro" && a.texto.includes("610"))).toBe(true);
  });
  it("item com valor diferente de quantidade × unitário acusa 629 e 564", () => {
    const r = conferirRegras(nfeExemplo({ vProdItem: "1400.00" }), AGORA);
    const textos = r.achados.map((a) => a.texto).join("\n");
    expect(textos).toContain("629");
    expect(textos).toContain("564");
  });
  it("chave adulterada e protocolo denegado", () => {
    const r = conferirRegras(nfeExemplo({ cStat: "302" }).replace(/<nNF>1234</, "<nNF>1235<"), AGORA);
    expect(r.achados.some((a) => a.texto.includes("não bate com a nota em: número"))).toBe(true);
    expect(r.achados.some((a) => a.grupo === "protocolo" && a.texto.includes("DENEGADO"))).toBe(true);
    expect(r.nivel).toBe("erro");
  });
  it("XML quebrado", () => {
    expect(conferirRegras("<NFe><infNFe>", AGORA).nivel).toBe("erro");
  });
});

describe("estrutura (XSD oficial) e assinatura", () => {
  it("nota assinada: estrutura válida, assinatura confere, protocolo bate", async () => {
    const xml = await assinar(nfeExemplo());
    const est = await validarEstrutura(xml, carregarXsd);
    expect(est, JSON.stringify(est)).toEqual([expect.objectContaining({ nivel: "ok" })]);
    const ass = await verificarAssinatura(xml);
    expect(ass[0]).toMatchObject({ nivel: "ok" });
    expect(ass.some((a) => a.texto.includes("EMPRESA EXEMPLO LTDA"))).toBe(true);
    expect(ass.filter((a) => a.nivel === "erro")).toEqual([]);
    const r = await validarNfe(xml, { carregarXsd, agora: AGORA });
    expect(r.achados.filter((a) => a.nivel === "erro")).toEqual([]);
    expect(r.achados.some((a) => a.texto.includes("resumo digital confere"))).toBe(true);
  }, 30_000);

  it("XML alterado depois de assinado é pego", async () => {
    const xml = (await assinar(nfeExemplo())).replace("Maquina de sorvete exemplo", "Maquina de sorvete trocada");
    const ass = await verificarAssinatura(xml);
    expect(ass[0], JSON.stringify(ass)).toMatchObject({ nivel: "erro" });
  }, 30_000);

  it("certificado de outra empresa", async () => {
    const ass = await verificarAssinatura(await assinar(nfeExemplo(), "11444777000161"));
    expect(ass.some((a) => a.codigo === "213")).toBe(true);
  }, 30_000);

  it("campo fora do formato oficial vira erro de estrutura legível", async () => {
    const xml = (await assinar(nfeExemplo())).replace("<NCM>84186940</NCM>", "<NCM>8418</NCM>");
    const est = await validarEstrutura(xml, carregarXsd);
    expect(est[0].nivel).toBe("erro");
    expect(est.map((a) => a.texto).join(" ")).toMatch(/NCM.*8418/);
  }, 30_000);

  it("tradução das mensagens do xmllint", () => {
    expect(traduzirErroXsd("nota.xml:1: element NCM: Schemas validity error : Element '{http://www.portalfiscal.inf.br/nfe}NCM': [facet 'pattern'] The value '8418' is not accepted by the pattern '[0-9]{2}|[0-9]{8}'."))
      .toBe('NCM: o valor "8418" não está no formato exigido');
  });
});
