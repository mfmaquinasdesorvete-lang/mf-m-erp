import { describe, expect, it } from "vitest";
import {
  comprovacaoSaidas, creditoFretes, ehFrete, grupoComprovacao, pendenciasBaixa, REGRAS_BAIXA, regraBaixa, resumoBaixas, servicoSemDocumento,
  type BaixaEstoque,
} from "../fiscalAvancado";

const baixa = (x: Partial<BaixaEstoque>): BaixaEstoque => ({
  id: "b", numero: 1, unidade_id: "u", motivo: "quebra_fabricacao", produto_id: "p", quantidade: 1, custo_unitario: 10, valor: 10,
  peso_kg: null, equipamento: null, fornecedor_id: null, nota_devolucao_id: null, evidencia: null, descricao: "teste", situacao: "registrada",
  cancelada_motivo: null, criado_por_nome: null, created_at: "2026-10-17T10:00:00Z", ...x,
});

describe("baixas de estoque com motivo fiscal", () => {
  it("cada motivo tem base legal e documento", () => {
    for (const r of REGRAS_BAIXA) {
      expect(r.base.length).toBeGreaterThan(20);
      expect(r.documento.length).toBeGreaterThan(5);
    }
    expect(regraBaixa("amostra_brinde")?.dedutivel).toBe("indedutivel");
    expect(regraBaixa("obsolescencia")?.estornaCredito).toBe(true);
  });

  it("aponta o que falta para a perda segurar a dedução", () => {
    expect(pendenciasBaixa(baixa({ motivo: "quebra_fabricacao" }))).toEqual([]);
    expect(pendenciasBaixa(baixa({ motivo: "furto_extravio" }))).toEqual(["boletim de ocorrência"]);
    expect(pendenciasBaixa(baixa({ motivo: "obsolescencia", evidencia: "Laudo 12/2026" }))).toEqual([]);
    expect(pendenciasBaixa(baixa({ motivo: "defeito_fornecedor" }))).toEqual(["fornecedor", "NF de devolução"]);
    expect(pendenciasBaixa(baixa({ motivo: "manutencao_fabrica" }))).toEqual(["máquina onde foi aplicada"]);
    expect(pendenciasBaixa(baixa({ motivo: "sucata", peso_kg: 12.5 }))).toEqual([]);
    expect(pendenciasBaixa(baixa({ motivo: "furto_extravio", situacao: "cancelada" }))).toEqual([]);
  });

  it("resume por motivo sem contar as canceladas", () => {
    const r = resumoBaixas([
      baixa({ motivo: "sucata", valor: 50 }), baixa({ motivo: "sucata", valor: 25, peso_kg: 3 }),
      baixa({ motivo: "furto_extravio", valor: 100 }), baixa({ motivo: "furto_extravio", valor: 999, situacao: "cancelada" }),
    ]);
    expect(r).toEqual([
      { motivo: "furto_extravio", n: 1, valor: 100, pendentes: 1 },
      { motivo: "sucata", n: 2, valor: 75, pendentes: 1 },
    ]);
  });
});

describe("pagamentos sem comprovação", () => {
  it("separa Pix para pessoa, para empresa, boleto, combustível e impostos", () => {
    expect(grupoComprovacao("PIX ENVIADO JOAO DA SILVA", -500)).toBe("pessoa");
    expect(grupoComprovacao("Pix enviado ACOS EXEMPLO LTDA", -500)).toBe("empresa");
    expect(grupoComprovacao("PAGAMENTO DE TITULO BANCO X", -500)).toBe("boleto");
    expect(grupoComprovacao("AUTO POSTO ESTRELA", -200)).toBe("combustivel_veiculo");
    expect(grupoComprovacao("DARF RECEITA FEDERAL", -300)).toBe("imposto_tarifa");
    expect(grupoComprovacao("PIX ENVIADO MARIA SOUZA", -900, [{ nome: "Maria Souza" }])).toBe("funcionario");
  });

  it("conta só o que não tem conta ligada, sem transferências nem repetidos", () => {
    const g = comprovacaoSaidas([
      { id: "1", data: "2026-09-01", valor: -100, descricao: "PIX ENVIADO JOAO", status: "pendente", conta_pagar_id: null, identificador: "a" },
      { id: "2", data: "2026-09-01", valor: -100, descricao: "PIX ENVIADO JOAO", status: "pendente", conta_pagar_id: null, identificador: "a" },
      { id: "3", data: "2026-09-02", valor: -50, descricao: "PIX ENVIADO PEDRO", status: "conciliado", conta_pagar_id: "c1" },
      { id: "4", data: "2026-09-03", valor: -999, descricao: "PIX ENVIADO MF", status: "transferencia", conta_pagar_id: null },
      { id: "5", data: "2026-09-03", valor: 999, descricao: "PIX RECEBIDO", status: "pendente", conta_pagar_id: null },
    ]);
    expect(g).toEqual([{ grupo: "pessoa", n: 2, total: 150, pendentes: 1, pendenteValor: 100 }]);
  });
});

describe("fretes e serviços", () => {
  it("crédito de PIS/COFINS só dos CT-e pagos pela MF em compras e vendas", () => {
    expect(creditoFretes([
      { mf_paga: true, sentido: "entrada", valor: 1000 }, { mf_paga: true, sentido: "saida", valor: 200 },
      { mf_paga: false, sentido: "entrada", valor: 500 }, { mf_paga: true, sentido: "transferencia", valor: 300 },
    ])).toEqual({ base: 1200, credito: 111, n: 2, daSefaz: 0 });
  });

  it("CT-e da SEFAZ conta; cancelado não dá crédito", () => {
    expect(creditoFretes([
      { mf_paga: true, sentido: "entrada", valor: 1000, chave: "4".repeat(44), situacao: "autorizado" },
      { mf_paga: true, sentido: "saida", valor: 400, chave: "5".repeat(44), situacao: "cancelado" },
    ])).toEqual({ base: 1000, credito: 92.5, n: 1, daSefaz: 1 });
  });

  it("frete e serviço sem documento", () => {
    expect(ehFrete({ categoria: "Fretes", descricao: "" })).toBe(true);
    expect(ehFrete({ categoria: "fornecedores", descricao: "Peças" })).toBe(false);
    expect(servicoSemDocumento({ categoria: "serviços profissionais" }, { cnpj: "" })).toBe(true);
    expect(servicoSemDocumento({ categoria: "serviços profissionais" }, { cnpj: "11.222.333/0001-81" })).toBe(false);
    expect(servicoSemDocumento({ categoria: "aluguel" }, null)).toBe(false);
  });
});
