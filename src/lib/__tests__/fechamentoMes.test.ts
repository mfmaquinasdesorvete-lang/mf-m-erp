import { describe, expect, it } from "vitest";
import { cfopCompra, cfopVenda, conciliacaoDoMes, divergenciasDoMes, mesesComparacao, statusDoMes, variacao, type EntradaFechamento } from "../fechamentoMes";

const bancos = [{ id: "b1", nome: "Banco Exemplo", unidade_id: "sc" }, { id: "b2", nome: "Banco da Filial", unidade_id: "sp" }, { id: "b3", nome: "Conta antiga", unidade_id: "sc", ativo: false }];
const base = (x: Partial<EntradaFechamento> = {}): EntradaFechamento => ({ comp: "2026-09", unidadeId: "sc", extrato: [], bancos, contas: [], notas: [], recebidas: [], ...x });

describe("conciliação dos bancos no fechamento", () => {
  it("conta só as linhas do mês, da unidade e das contas ativas; separa entradas e saídas pendentes", () => {
    const r = conciliacaoDoMes([
      { conta_bancaria_id: "b1", data: "2026-09-02", valor: 1000, status: "conciliado" },
      { conta_bancaria_id: "b1", data: "2026-09-03", valor: 250, status: "pendente" },
      { conta_bancaria_id: "b1", data: "2026-09-04", valor: -80.5, status: "pendente" },
      { conta_bancaria_id: "b1", data: "2026-09-05", valor: -500, status: "transferencia" },
      { conta_bancaria_id: "b1", data: "2026-10-01", valor: 9999, status: "pendente" },
      { conta_bancaria_id: "b2", data: "2026-09-02", valor: 10, status: "pendente" },
      { conta_bancaria_id: "b3", data: "2026-09-02", valor: 10, status: "pendente" },
    ], bancos, "sc", "2026-09");
    expect(r).toEqual([{ id: "b1", nome: "Banco Exemplo", linhas: 4, tratadas: 2, pendentes: 2, entradasPendentes: 250, saidasPendentes: 80.5 }]);
  });
});

describe("pendências e divergências do mês", () => {
  it("extrato sem conciliar, lançamento sem aprovação e dúvida aberta impedem o fechamento; sem categoria só pede conferência", () => {
    const d = divergenciasDoMes(base({
      extrato: [{ conta_bancaria_id: "b1", data: "2026-09-10", valor: -120, status: "pendente" }],
      contas: [
        { tipo: "pagar", id: "p1", unidade_id: "sc", status: "pago", valor: 300, data_pagamento: "2026-09-12", categoria: "aluguel", revisao: "em_revisao" },
        { tipo: "pagar", id: "p2", unidade_id: "sc", status: "pago", valor: 50, data_pagamento: "2026-09-13", categoria: "", revisao: "aprovado" },
        { tipo: "receber", id: "r1", unidade_id: "sc", status: "pago", valor: 900, valor_pago: 880, data_pagamento: "2026-09-14", categoria: "vendas", revisao: "aprovado", contador_status: "duvida" },
        { tipo: "pagar", id: "p3", unidade_id: "sp", status: "pago", valor: 70, data_pagamento: "2026-09-12", revisao: "em_revisao" },
        { tipo: "pagar", id: "p4", unidade_id: "sc", status: "pago", valor: 70, data_pagamento: "2026-08-30", revisao: "em_revisao" },
      ],
    }));
    const por = Object.fromEntries(d.map((x) => [x.id, x]));
    expect(por["extrato-b1"]).toMatchObject({ bloqueia: true, quantidade: 1, valor: 120, link: "/conciliacao" });
    expect(por["nao-aprovados"]).toMatchObject({ bloqueia: true, quantidade: 1, valor: 300 });
    expect(por["duvidas"]).toMatchObject({ bloqueia: true, quantidade: 1, valor: 880 });
    expect(por["sem-categoria"]).toMatchObject({ bloqueia: false, quantidade: 1, valor: 50 });
    // as que impedem o fechamento vêm primeiro
    const ordem = d.map((x) => x.bloqueia);
    expect(ordem.indexOf(false)).toBeGreaterThan(ordem.lastIndexOf(true));
  });

  it("NF-e de venda sem conta a receber (pela nota ou pelo pedido) e nota de compra sem conta a pagar", () => {
    const d = divergenciasDoMes(base({
      notas: [
        { id: "n1", unidade_id: "sc", status: "autorizada", numero: "101", valor_total: 5000, created_at: "2026-09-05T10:00:00Z", payload: { items: [{ cfop: "6101" }] } },
        { id: "n2", unidade_id: "sc", status: "autorizada", numero: "102", valor_total: 800, created_at: "2026-09-06T10:00:00Z", pedido_id: "pd2", payload: { items: [{ cfop: "5102" }] } },
        { id: "n3", unidade_id: "sc", status: "autorizada", numero: "103", valor_total: 300, created_at: "2026-09-07T10:00:00Z", payload: { items: [{ cfop: "5915" }] } },
        { id: "n4", unidade_id: "sc", status: "autorizada", numero: "104", valor_total: 700, created_at: "2026-09-08T10:00:00Z", payload: { items: [{ cfop: "6101" }] } },
      ],
      recebidas: [
        { id: "f1", unidade_id: "sc", valor_total: 1200, data_emissao: "2026-09-03", itens: [{ cfop: "6102" }] },
        { id: "f2", unidade_id: "sc", valor_total: 400, data_emissao: "2026-09-04", itens: [{ cfop: "5403" }] },
        { id: "f3", unidade_id: "sc", valor_total: 90, data_emissao: "2026-09-04", itens: [{ cfop: "5949" }] },
        { id: "f4", unidade_id: "sc", valor_total: 90, data_emissao: "2026-09-04", situacao: "cancelada", itens: [{ cfop: "5102" }] },
      ],
      contas: [
        { tipo: "receber", id: "r1", status: "aberto", valor: 800, pedido_id: "pd2" },
        { tipo: "receber", id: "r2", status: "aberto", valor: 700, nota_fiscal_id: "n4" },
        { tipo: "pagar", id: "p1", status: "aberto", valor: 400, nfe_recebida_id: "f2" },
      ],
    }));
    const por = Object.fromEntries(d.map((x) => [x.id, x]));
    expect(por["venda-sem-conta"]).toMatchObject({ quantidade: 1, valor: 5000, bloqueia: false });
    expect(por["venda-sem-conta"].detalhe).toContain("nº 101");
    expect(por["compra-sem-conta"]).toMatchObject({ quantidade: 1, valor: 1200 });
  });

  it("mês sem nada a apontar não tem divergência", () => {
    expect(divergenciasDoMes(base())).toEqual([]);
  });
});

describe("situação do mês", () => {
  it("fechado > em andamento > com pendências > em revisão > enviado > pronto", () => {
    expect(statusDoMes({ fechado: true, enviado: true, terminou: true, bloqueantes: 3, aValidar: 2 }).status).toBe("fechado");
    expect(statusDoMes({ fechado: false, enviado: false, terminou: false, bloqueantes: 3, aValidar: 0 }).status).toBe("aberto");
    expect(statusDoMes({ fechado: false, enviado: true, terminou: true, bloqueantes: 2, aValidar: 1 }).status).toBe("com_pendencias");
    expect(statusDoMes({ fechado: false, enviado: true, terminou: true, bloqueantes: 0, aValidar: 1 }).status).toBe("em_revisao");
    expect(statusDoMes({ fechado: false, enviado: true, terminou: true, bloqueantes: 0, aValidar: 0 }).status).toBe("enviado");
    expect(statusDoMes({ fechado: false, enviado: false, terminou: true, bloqueantes: 0, aValidar: 0 }).status).toBe("pronto");
  });
});

describe("apoio", () => {
  it("CFOP de venda e de compra", () => {
    expect(["5101", "6.102", "7101"].every(cfopVenda)).toBe(true);
    expect(["5915", "6202", "5949", "1102"].some(cfopVenda)).toBe(false);
    expect(["5102", "6403", "5405"].every(cfopCompra)).toBe(true);
    expect(["5949", "6915", "5202"].some(cfopCompra)).toBe(false);
  });
  it("comparação com o mês anterior e com o mesmo mês do ano anterior", () => {
    expect(mesesComparacao("2026-01")).toEqual({ anterior: "2025-12", anoAnterior: "2025-01" });
    expect(mesesComparacao("2026-09")).toEqual({ anterior: "2026-08", anoAnterior: "2025-09" });
    expect(variacao(120, 100)).toBeCloseTo(0.2);
    expect(variacao(-50, -100)).toBeCloseTo(0.5);
    expect(variacao(10, 0)).toBeNull();
  });
});
