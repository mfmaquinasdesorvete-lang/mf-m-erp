import { describe, expect, it } from "vitest";
import { prazoPagar, raizCnpj, resumoPorTipo, tipoPagar } from "../tiposPagar";
import type { ContaDecisao } from "../programacao";

const HOJE = "2026-10-17";
const TRANSP = new Set(["11222333"]);

describe("tipo da conta a pagar", () => {
  it.each([
    [{ categoria: "folha", descricao: "Salário outubro" }, "pessoal"],
    [{ categoria: "pró-labore", descricao: "Retirada" }, "pessoal"],
    [{ categoria: "impostos", descricao: "DARF IRPJ" }, "imposto"],
    [{ categoria: "aluguel", descricao: "Aluguel do galpão" }, "casa"],
    [{ categoria: "energia/água/internet", descricao: "Energia" }, "casa"],
    [{ categoria: "serviços profissionais", descricao: "Honorários" }, "servico"],
    [{ categoria: "manutenção", descricao: "Empilhadeira" }, "servico"],
    [{ categoria: "tarifas bancárias", descricao: "Tarifa" }, "outros"],
    [{ categoria: "fornecedores", descricao: "NF 123 - Peças" }, "fornecedor"],
    [{ categoria: "frete", descricao: "Fatura" }, "transportadora"],
    [{ categoria: "fretes", descricao: "Fatura" }, "transportadora"],
  ])("%o → %s", (c, t) => expect(tipoPagar(c)).toBe(t));

  it("transportadora pelo CNPJ (matriz ou filial), mesmo lançada como fornecedores", () => {
    expect(tipoPagar({ categoria: "fornecedores", descricao: "Fatura 991", fornecedor: { cnpj: "11.222.333/0004-81" } }, TRANSP)).toBe("transportadora");
    expect(tipoPagar({ categoria: "fornecedores", descricao: "Fatura 991", fornecedor: { cnpj: "99.888.777/0001-00" } }, TRANSP)).toBe("fornecedor");
  });

  it("frete ou CT-e na descrição vira transportadora; imposto e folha não mudam pelo texto", () => {
    expect(tipoPagar({ categoria: "fornecedores", descricao: "Frete Exemplo - NF 1290" })).toBe("transportadora");
    expect(tipoPagar({ categoria: null, descricao: "Fatura de CT-e 55" })).toBe("transportadora");
    expect(tipoPagar({ categoria: "impostos", descricao: "ICMS do frete" }, TRANSP)).toBe("imposto");
    expect(tipoPagar({ categoria: "folha", descricao: "Ajuda de custo motorista", fornecedor: { cnpj: "11222333000199" } }, TRANSP)).toBe("pessoal");
  });

  it("categoria fora do plano: pelo texto; sem pista, fornecedor se tiver fornecedor", () => {
    expect(tipoPagar({ categoria: "Parcelamento ICMS", descricao: "Parcela 3/60" })).toBe("imposto");
    expect(tipoPagar({ categoria: "", descricao: "Condomínio sala" })).toBe("casa");
    expect(tipoPagar({ categoria: "", descricao: "Diversos", fornecedor_id: "f1" })).toBe("fornecedor");
    expect(tipoPagar({ categoria: "", descricao: "Diversos" })).toBe("outros");
  });

  it("raiz do CNPJ só com 14 dígitos", () => {
    expect(raizCnpj("11.222.333/0001-81")).toBe("11222333");
    expect(raizCnpj("123.456.789-00")).toBe("");
    expect(raizCnpj(null)).toBe("");
  });
});

const conta = (x: Partial<ContaDecisao> & { categoria?: string }): ContaDecisao & { categoria?: string } =>
  ({ id: Math.random().toString(36), valor: 100, vencimento: "2026-10-20", status: "aberto", ...x });

describe("quanto tem para pagar", () => {
  it("soma por tipo, do maior para o menor, com vencido, 7 dias e falta aprovar; não pagar e golpe à parte", () => {
    const l = [
      conta({ categoria: "fornecedores", valor: 500, vencimento: "2026-10-10" }),
      conta({ categoria: "fornecedores", valor: 300, vencimento: "2026-10-30", revisao: "em_revisao" }),
      conta({ categoria: "frete", valor: 200, vencimento: "2026-10-18" }),
      conta({ categoria: "impostos", valor: 50, vencimento: "2026-10-10", decisao: "agendado", pagar_em: "2026-10-19" }),
      conta({ categoria: "fornecedores", valor: 999, decisao: "nao_pagar" }),
      conta({ categoria: "fornecedores", valor: 77, fornecedor: { bloqueado: true } }),
      conta({ categoria: "fornecedores", valor: 1000, status: "pago" }),
      conta({ categoria: "aluguel", valor: 10, status: "cancelado" }),
    ];
    const r = resumoPorTipo(l, (c) => tipoPagar(c), HOJE);
    expect(r.linhas.map((x) => [x.tipo, x.total, x.n])).toEqual([["fornecedor", 800, 2], ["transportadora", 200, 1], ["imposto", 50, 1]]);
    expect([r.total, r.n, r.vencido, r.nVencidas, r.semana, r.aprovar, r.nAprovar]).toEqual([1050, 4, 500, 1, 250, 300, 1]);
    expect([r.seguradas, r.nSeguradas]).toEqual([1076, 2]);
  });
});

describe("prazo em palavras", () => {
  it("pelo dia do pagamento", () => {
    expect(prazoPagar(conta({ vencimento: "2026-10-14" }), HOJE)).toEqual({ texto: "venceu há 3 dias", tom: "atrasada" });
    expect(prazoPagar(conta({ vencimento: "2026-10-17" }), HOJE).texto).toBe("vence hoje");
    expect(prazoPagar(conta({ vencimento: "2026-10-18" }), HOJE).texto).toBe("vence amanhã");
    expect(prazoPagar(conta({ vencimento: "2026-10-22" }), HOJE).texto).toBe("vence em 5 dias");
    expect(prazoPagar(conta({ vencimento: "2026-11-30" }), HOJE)).toEqual({ texto: "vence 30/11", tom: "longe" });
    expect(prazoPagar(conta({ vencimento: "2026-10-30", decisao: "agendado", pagar_em: "2026-10-20" }), HOJE).texto).toBe("pagar em 3 dias");
    expect(prazoPagar({ ...conta({ status: "pago" }), data_pagamento: "2026-10-05" }, HOJE)).toEqual({ texto: "paga em 05/10", tom: "paga" });
  });
});
