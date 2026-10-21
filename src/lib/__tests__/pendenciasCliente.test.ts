import { describe, expect, it } from "vitest";
import { creditoDoCliente, pendenciasDoCliente } from "../pendenciasCliente";

describe("pendências do cadastro do cliente no pedido", () => {
  it("endereço incompleto e documento faltando", () => {
    const p = pendenciasDoCliente({ cpf_cnpj: "", cep: "8800", logradouro: "Rua A", numero: "", municipio: "Tubarão", uf: "SC", whatsapp: "48999" });
    expect(p.map((x) => x.texto)).toEqual(["sem CPF/CNPJ", "CEP incompleto", "sem número", "sem bairro", "sem e-mail"]);
    expect(p.filter((x) => x.grave).length).toBe(3);
  });
  it("cadastro completo não tem pendência", () => {
    expect(pendenciasDoCliente({ cpf_cnpj: "529.982.247-25", cep: "88701-000", logradouro: "Rua A", numero: "10", bairro: "Centro",
      municipio: "Tubarão", uf: "SC", whatsapp: "48999", email: "a@b.com" })).toEqual([]);
  });
  it("CNPJ baixado e contribuinte sem IE", () => {
    const p = pendenciasDoCliente({ cpf_cnpj: "11.222.333/0001-81", receita_situacao: "BAIXADA", contribuinte_icms: 1, cep: "88701000",
      logradouro: "R", numero: "1", bairro: "B", municipio: "M", uf: "SC", telefone: "1", email: "e" });
    expect(p.map((x) => x.texto)).toEqual(["CNPJ baixada na Receita", "contribuinte sem IE"]);
  });
  it("crédito: aberto, vencido e disponível", () => {
    expect(creditoDoCliente(5000, [{ valor: 1200, vencimento: "2026-10-01" }, { valor: 800, vencimento: "2026-11-10" }], "2026-10-21"))
      .toEqual({ aberto: 2000, vencido: 1200, limite: 5000, disponivel: 3000 });
    expect(creditoDoCliente(null, [], "2026-10-21").disponivel).toBeNull();
  });
});
