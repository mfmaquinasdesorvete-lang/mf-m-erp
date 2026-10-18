import { describe, expect, it } from "vitest";
import { cepBR, enderecoCompleto, faltaNaFicha, linkMapa, nomeContrato, nomeModelo, resumoUnidade, type CustoLoja, type Loja, type MaquinaLoja, type PagamentoLoja } from "../licenciados";

const loja = (extra: Partial<Loja> = {}): Loja => ({
  id: "l1", nome: "Unidade Exemplo", cidade: "Cidade Teste", uf: "SP", responsavel: null, documento: null, telefone: null, nomes_extrato: [], cliente_id: null,
  situacao: "ativa", inicio: null, valor_combinado: null, mensalidade: null, cor: null, observacoes: null, ordem: 0, ...extra,
});
const custo = (valor: number, extra: Partial<CustoLoja> = {}): CustoLoja => ({
  id: Math.random().toString(36), loja_id: "l1", data: "2026-01-10", categoria: "maquinas", descricao: null, valor, observacao: null, anulado: false, ...extra,
});
const maq = (situacao: MaquinaLoja["situacao"], loja_id = "l1"): MaquinaLoja => ({
  id: Math.random().toString(36), loja_id, descricao: "Máquina exemplo", numero_serie: null, data_compra: "2026-01-05", valor: null, situacao, observacao: null,
});
const pag = (valor: number, extra: Partial<PagamentoLoja> = {}): PagamentoLoja => ({
  id: Math.random().toString(36), loja_id: "l1", data: "2026-03-01", valor, taxa: 0, tipo: "licenca", forma: "pix", origem: "manual",
  origem_id: null, onde: null, descricao: null, observacao: null, descartado: false, anulado: false, ...extra,
});

describe("unidades My Frost", () => {
  it("monta o endereço numa linha, com CEP formatado, e o link do mapa só quando há endereço", () => {
    expect(cepBR("01234567")).toBe("01234-567");
    expect(cepBR("123")).toBe("123");
    expect(cepBR(null)).toBe("");
    const l = loja({ endereco: "Rua Exemplo, 10 - Centro", cep: "01234567" });
    expect(enderecoCompleto(l)).toBe("Rua Exemplo, 10 - Centro – Cidade Teste/SP – CEP 01234-567");
    expect(linkMapa(l)).toContain("google.com/maps/search/?api=1&query=Rua%20Exemplo");
    expect(linkMapa(loja())).toBeNull();
  });

  it("lista o que falta na ficha e dá nome ao modelo e ao contrato", () => {
    expect(faltaNaFicha(loja())).toEqual(["endereço", "CPF/CNPJ", "telefone", "data de abertura", "contrato"]);
    expect(faltaNaFicha(loja({ endereco: "Rua", documento: "12345678901", telefone: "1", inicio: "2026-01-01", contrato: "assinado" }))).toEqual([]);
    expect(nomeModelo("loja_cafeteria")).toBe("Loja com cafeteria");
    expect(nomeModelo(null)).toBeNull();
    expect(nomeContrato(null)).toBe("Sem contrato");
    expect(nomeContrato("assinado")).toBe("Contrato assinado");
  });

  it("soma o custo de montar sem os anulados, o recebido líquido e o saldo da unidade", () => {
    const custos = [custo(20000), custo(5000, { categoria: "moveis" }), custo(999, { anulado: true }), custo(7000, { loja_id: "l2" })];
    const maquinas = [maq("na_loja"), maq("manutencao"), maq("devolvida"), maq("na_loja", "l2")];
    const pagamentos = [pag(10000, { taxa: 300 }), pag(4000, { anulado: true }), pag(2000, { descartado: true, loja_id: null }), pag(1500, { loja_id: "l2" })];
    const r = resumoUnidade("l1", custos, maquinas, pagamentos);
    expect(r.custo).toBe(25000);
    expect(r.recebido).toBe(9700);
    expect(r.saldo).toBe(-15300);
    expect(r.maquinas).toBe(2);
    expect(r.porCategoria.map((k) => [k.id, k.valor])).toEqual([["maquinas", 20000], ["moveis", 5000]]);
  });
});
