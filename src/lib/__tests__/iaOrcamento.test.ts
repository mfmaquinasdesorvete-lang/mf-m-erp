import { describe, expect, it } from "vitest";
import { montarCatalogo, normalizarOrcamento, observacaoDoPedido } from "../../../supabase/functions/_shared/ia-orcamento";

const { texto, codigos } = montarCatalogo([
  { id: "a", sku: "BIC-01", descricao: "Bico estrela", modelo: "A 200" },
  { id: "b", sku: null, descricao: "Correia   dentada", modelo: null },
]);

describe("IA do orçamento", () => {
  it("catálogo com código curto no lugar do id", () => {
    expect(texto).toBe("P1 · BIC-01 · Bico estrela · A 200\nP2 · - · Correia dentada");
    expect(codigos.get("P2")?.id).toBe("b");
  });
  it("só produtos do catálogo; código inventado vai para não achados; repetido soma", () => {
    const r = normalizarOrcamento({
      cliente: { nome: " Gelato  Nobre ", cpf_cnpj: "11.222.333/0001-81", telefone: "(48) 99999-1234", cidade: null },
      itens: [
        { codigo: "p1", quantidade: 2, como_pediu: "2 bicos" },
        { codigo: "P1", quantidade: 1.4, como_pediu: "mais um bico" },
        { codigo: "P9", quantidade: 1, como_pediu: "freezer horizontal" },
        { codigo: "P2", quantidade: 0, como_pediu: "correia" },
      ],
      nao_achados: ["casquinha"], pagamento: " Pix ", observacao: null,
    }, codigos);
    expect(r.cliente).toEqual({ nome: "Gelato Nobre", cpf_cnpj: "11222333000181", telefone: "48999991234", cidade: null });
    expect(r.itens).toEqual([
      { produto_id: "a", descricao: "Bico estrela", quantidade: 3, como_pediu: "2 bicos" },
      { produto_id: "b", descricao: "Correia   dentada", quantidade: 1, como_pediu: "correia" },
    ]);
    expect(r.nao_achados).toEqual(["casquinha", "freezer horizontal"]);
    expect(r.pagamento).toBe("Pix");
  });
  it("resposta vazia não quebra", () => {
    const r = normalizarOrcamento({}, codigos);
    expect(r.itens).toEqual([]);
    expect(r.cliente.nome).toBeNull();
  });
  it("observação do pedido junta pagamento, prazo e o que faltou", () => {
    expect(observacaoDoPedido({ pagamento: "Pix", observacao: "Inaugura em dezembro", nao_achados: ["casquinha"] }))
      .toBe("Pagamento que o cliente pediu: Pix\nInaugura em dezembro\nPediu também (fora do catálogo): casquinha");
    expect(observacaoDoPedido({ pagamento: null, observacao: null, nao_achados: [] })).toBe("");
  });
});
