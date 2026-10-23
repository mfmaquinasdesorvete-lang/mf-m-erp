import { describe, expect, it } from "vitest";
import { mensagemNota, mensagemPeca, mensagemRastreio } from "../respostasWhatsapp";

const AREA = "https://erp.exemplo/cliente/sorveteria-abc123";

describe("respostas do WhatsApp", () => {
  it("nota com DANFE e XML, e o link da Área do Cliente", () => {
    const m = mensagemNota("Maria Souza", { numero: 1520, data: "2026-10-21", valor: 350, chave: "4226", danfe_url: "https://x/d.pdf", xml_url: "https://x/n.xml" }, AREA);
    expect(m).toContain("Olá, Maria!");
    expect(m).toContain("nota fiscal nº 1520 de 21/10/2026");
    expect(m).toContain("DANFE (PDF): https://x/d.pdf");
    expect(m).toContain("XML: https://x/n.xml");
    expect(m).not.toContain("Chave de acesso");
    expect(m).toContain(AREA);
  });
  it("nota sem arquivos manda a chave de acesso", () => {
    const m = mensagemNota(null, { numero: 9, data: "2026-10-01", valor: null, chave: "42261012345678901234550010000000091000000099", danfe_url: null, xml_url: null });
    expect(m.startsWith("Olá!")).toBe(true);
    expect(m).toContain("Chave de acesso: 4226");
    expect(m).not.toContain("página da MF");
  });
  it("rastreio: saiu com transportadora e link; ou ainda em separação", () => {
    const m = mensagemRastreio("João", { pedido: 1520, enviado_em: "2026-10-21T14:00:00Z", transportadora: "Braspress", codigo: "BR123", link: "https://r/BR123" }, AREA);
    expect(m).toContain("Seu pedido nº 1520 saiu dia 21/10/2026 pela Braspress.");
    expect(m).toContain("Código de rastreio: BR123");
    expect(m).toContain("Acompanhe aqui: https://r/BR123");
    expect(mensagemRastreio("João", { pedido: 7, enviado_em: null, transportadora: null, codigo: null, link: null })).toContain("ainda está em separação");
  });
  it("peça: preço e estoque por unidade, sem estoque e sob encomenda", () => {
    const com = mensagemPeca("Ana", { descricao: "Pá batedora", codigo: "PB-01", preco: 89.9, estoque: 5, porUnidade: [{ unidade: "SC", qtd: 3 }, { unidade: "SP", qtd: 2 }] });
    expect(com).toMatch(/A peça Pá batedora \(cód\. PB-01\) custa R\$\s?89,90\. Temos 5 em estoque \(3 em SC e 2 em SP\)\./);
    expect(mensagemPeca("Ana", { descricao: "Pá", preco: 10, estoque: 2, porUnidade: [{ unidade: "SC", qtd: 2 }, { unidade: "SP", qtd: 0 }] })).toContain("Temos 2 em estoque.");
    expect(mensagemPeca("Ana", { descricao: "Pá", preco: 10, estoque: 0 })).toContain("sem estoque");
    expect(mensagemPeca("Ana", { descricao: "Pá", preco: 10, estoque: 0, sobEncomenda: true, prazoDias: 15 })).toContain("sob encomenda: prazo de cerca de 15 dias");
  });
});
