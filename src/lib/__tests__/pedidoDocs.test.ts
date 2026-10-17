import { describe, expect, it } from "vitest";
import { arquivoPedido, nomeCliente, pixDoPedido, tituloPedido } from "../pedidoDocs";

describe("documentos do pedido", () => {
  it("título e arquivo com o nº e o nome do cliente", () => {
    const cli = { nome: "Sorvetes Exemplo Ltda", nome_fantasia: "Gelato  Teste" };
    expect(nomeCliente(cli)).toBe("Gelato Teste");
    expect(tituloPedido({ numero: 1234, status: "orcamento" }, cli, "Proposta comercial")).toBe("Proposta comercial 1234 - Gelato Teste");
    expect(tituloPedido({ numero: 1234, status: "aprovado" }, cli)).toBe("Pedido 1234 - Gelato Teste");
    expect(tituloPedido({ status: "orcamento" }, null)).toBe("Proposta (rascunho)");
    expect(arquivoPedido({ numero: 7, status: "orcamento" }, { nome: "A/B: Comércio *Teste*" })).toBe("Proposta 7 - A B Comércio Teste.pdf");
  });

  it("Pix: à vista ou 1ª parcela, só com chave na unidade", () => {
    const u = { pix_chave: "12345678000199", pix_nome: "Empresa Teste", pix_cidade: "Cidade" };
    const a = pixDoPedido(u, { numero: 55, valor_total: 1000, parcelas: 1 })!;
    expect(a.valor).toBe(1000);
    expect(a.rotulo).toBe("Pagamento à vista");
    expect(a.copiaECola).toContain("54071000.00");
    expect(a.copiaECola).toContain("0505PED55");
    const b = pixDoPedido(u, { numero: 55, valor_total: 1000, parcelas: 3 })!;
    expect(b.valor).toBe(333.33);
    expect(b.rotulo).toBe("1ª parcela de 3");
    expect(pixDoPedido({ pix_chave: "" }, { valor_total: 10 })).toBeNull();
    expect(pixDoPedido(u, { valor_total: 0 })).toBeNull();
  });
});
