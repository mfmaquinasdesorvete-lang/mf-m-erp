import { describe, expect, it } from "vitest";
import { paraEnvio, type PropostaLida } from "../propostasTiny";

// dados inventados
const proposta: PropostaLida = {
  tiny_id: "900", numero: "12", data: "2024-05-10", proximo_contato: null, situacao: "Aprovada", vendedor: "Vendedor Teste",
  contato_id: "55", nome: "Sorveteria Exemplo", tipo_pessoa: "J", cpf_cnpj: "11222333000181", ie: "", cep: "", municipio: "", uf: "",
  endereco: "", numero_end: "", complemento: "", bairro: "", fone: "", celular: "", email: "", aos_cuidados: "", validade: "15",
  prazo_entrega: "30 dias", observacoes: "Pagamento em 3x", desconto: 100, frete: 50,
  itens: [{ descricao: "Máquina de sorvete", quantidade: 1, valor_unitario: 20000, tiny_produto_id: "777" }],
};

describe("propostas do Tiny: o que vai para o banco", () => {
  it("MF vai inteira, com o produto do Tiny", () => {
    expect(paraEnvio(proposta, "mf")).toBe(proposta);
  });
  it("My Frost vai com valores, desconto, frete e condições, sem o produto do Tiny", () => {
    const p = paraEnvio(proposta, "my_frost");
    expect(p).toMatchObject({ desconto: 100, frete: 50, prazo_entrega: "30 dias", observacoes: "Pagamento em 3x" });
    expect(p.itens).toEqual([{ descricao: "Máquina de sorvete", quantidade: 1, valor_unitario: 20000 }]);
  });
});
