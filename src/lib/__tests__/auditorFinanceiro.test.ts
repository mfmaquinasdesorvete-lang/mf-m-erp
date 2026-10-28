import { describe, expect, it } from "vitest";
import { conferenciasAuditor, resumoRodada, type DadosAuditor } from "../auditorFinanceiro";
import { calcularExcecoes } from "../auditoria";

const LIM = { diasRecebimento: 7, toleranciaTaxa: 0.5, foraPadraoPct: 50, foraPadraoMinimo: 1000, diasExtrato: 7 };
const base = (x: Partial<DadosAuditor> = {}): DadosAuditor => ({
  receber: [], pagar: [], lancamentos: [], bancos: [], importacoes: [], pedidos: [], formas: [], fornecedores: [], hoje: "2026-10-27", corte: "2026-10-01", ...x,
});
const tipos = (d: DadosAuditor) => conferenciasAuditor(d, LIM).map((e) => e.tipo);
const conta = (x: Record<string, unknown>) => ({ id: "c", descricao: "Parcela", valor: 100, vencimento: "2026-10-05", status: "aberto", data_pagamento: null, valor_pago: null, ...x });
const lanc = (x: Record<string, unknown>) => ({ id: "l", conta_bancaria_id: "b1", data: "2026-10-10", valor: 100, status: "pendente", descricao: "Pix", conta_receber_id: null, conta_pagar_id: null, ...x });

describe("venda sem recebimento", () => {
  const pedido = { id: "p1", numero: 10, status: "entregue", valor_total: 1000, origem: "whatsapp", created_at: "2026-10-02T10:00:00Z" };
  it("parcela vencida há mais de 7 dias e não recebida vira alerta, com o valor em aberto", () => {
    const r = conferenciasAuditor(base({ pedidos: [pedido], receber: [conta({ pedido_id: "p1", valor: 1000, vencimento: "2026-10-10" })] }), LIM);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: "venda_sem_recebimento", gravidade: "alta", valor: 1000 });
  });
  it("parcela vencida há poucos dias, recebida ou pedido antes do corte não entram", () => {
    expect(tipos(base({ pedidos: [pedido], receber: [conta({ pedido_id: "p1", vencimento: "2026-10-25" })] }))).toEqual([]);
    expect(tipos(base({ pedidos: [pedido], receber: [conta({ pedido_id: "p1", status: "pago", valor_pago: 1000 })] }))).toEqual([]);
    expect(tipos(base({ pedidos: [{ ...pedido, origem: "whatsapp", created_at: "2026-09-20" }], receber: [conta({ pedido_id: "p1" })] }))).toEqual([]);
  });
  it("centavos sem erro de arredondamento", () => {
    const r = conferenciasAuditor(base({ pedidos: [pedido], receber: [
      conta({ id: "a", pedido_id: "p1", valor: 0.1, vencimento: "2026-10-01" }), conta({ id: "b", pedido_id: "p1", valor: 0.2, vencimento: "2026-10-02" }),
    ] }), LIM);
    expect(r[0].valor).toBe(0.3);
  });
});

describe("recebimento sem venda", () => {
  it("entrada ignorada sem conta nem transferência depois do corte vira alerta", () => {
    expect(tipos(base({ lancamentos: [lanc({ status: "ignorado" })] }))).toEqual(["recebimento_sem_venda"]);
  });
  it("saída, transferência, entrada ligada ou antes do corte não entram", () => {
    expect(tipos(base({ lancamentos: [
      lanc({ id: "1", status: "ignorado", valor: -50 }), lanc({ id: "2", status: "ignorado", par_transferencia_id: "x" }),
      lanc({ id: "3", status: "ignorado", conta_receber_id: "c" }), lanc({ id: "4", status: "ignorado", data: "2026-09-30" }),
    ] }))).toEqual([]);
  });
});

describe("bruto × taxa × líquido do cartão", () => {
  const recebida = conta({ status: "pago", forma_pagamento: "cartao", conta_bancaria_id: "b1", valor: 1000, valor_pago: 960, data_pagamento: "2026-10-12" });
  it("sem taxa contratada: aviso de dado incompleto com a taxa efetiva", () => {
    const r = conferenciasAuditor(base({ receber: [recebida] }), LIM);
    expect(r[0]).toMatchObject({ tipo: "taxa_cartao", gravidade: "baixa", valor: 40 });
    expect(r[0].detalhe).toContain("Sem taxa contratada");
  });
  it("dentro da contratada mais a tolerância não alerta; acima alerta com a diferença", () => {
    const formas = (t: number) => [{ meio: "cartao", taxa_percentual: t, conta_bancaria_id: "b1", ativo: true }];
    expect(tipos(base({ receber: [recebida], formas: formas(3.6) }))).toEqual([]);
    const r = conferenciasAuditor(base({ receber: [recebida], formas: formas(3) }), LIM);
    expect(r[0]).toMatchObject({ tipo: "taxa_cartao", gravidade: "media", valor: 10 });
  });
  it("tarifa do cartão separada no extrato (OLIST) entra na taxa; tarifa de Pix não", () => {
    const cheia = { ...recebida, valor_pago: 1000 };
    const r = conferenciasAuditor(base({ receber: [cheia], lancamentos: [
      lanc({ id: "t1", valor: -50, descricao: "OLIST · Tarifa cartão de crédito", status: "conciliado" }),
      lanc({ id: "t2", valor: -30, descricao: "OLIST · Tarifa PIX recebido", status: "conciliado" }),
    ], formas: [{ meio: "cartao", taxa_percentual: 4, conta_bancaria_id: "b1", ativo: true }] }), LIM);
    expect(r[0]).toMatchObject({ tipo: "taxa_cartao", valor: 10 });
  });
});

describe("despesa fora do padrão", () => {
  const paga = (mes: string, valor: number) => conta({ id: mes, status: "pago", fornecedor_id: "f1", valor, valor_pago: valor, data_pagamento: `${mes}-10` });
  const fornecedores = [{ id: "f1", nome: "Fornecedor A" }];
  it("mês bem acima da média dos anteriores é suspeita, não prova", () => {
    const r = conferenciasAuditor(base({ fornecedores, pagar: [paga("2026-07", 1000), paga("2026-08", 1000), paga("2026-09", 1000), paga("2026-10", 4000)] }), LIM);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: "despesa_fora_padrao", gravidade: "baixa", valor: 3000 });
    expect(r[0].detalhe).toContain("não prova");
  });
  it("sem 3 meses de histórico ou diferença pequena não alerta", () => {
    expect(tipos(base({ fornecedores, pagar: [paga("2026-09", 100), paga("2026-10", 4000)] }))).toEqual([]);
    expect(tipos(base({ fornecedores, pagar: [paga("2026-07", 100), paga("2026-08", 100), paga("2026-09", 100), paga("2026-10", 900)] }))).toEqual([]);
  });
});

describe("extrato com buraco", () => {
  const bancos = [{ id: "b1", nome: "Banco A", ativo: true }];
  it("conta que parou de receber extrato vira aviso; conta inativa ou sem extrato nunca não", () => {
    const r = conferenciasAuditor(base({ bancos, importacoes: [{ conta_bancaria_id: "b1", periodo_inicio: "2026-09-01", periodo_fim: "2026-10-05" }] }), LIM);
    expect(r[0]).toMatchObject({ tipo: "extrato_desatualizado" });
    expect(r[0].detalhe).toContain("06/10/2026 a 20/10/2026");
    expect(tipos(base({ bancos: [{ ...bancos[0], ativo: false }], importacoes: [{ conta_bancaria_id: "b1", periodo_inicio: "2026-09-01", periodo_fim: "2026-10-05" }] }))).toEqual([]);
    expect(tipos(base({ bancos }))).toEqual([]);
  });
  it("extrato em dia não avisa", () => {
    expect(tipos(base({ bancos, importacoes: [{ conta_bancaria_id: "b1", periodo_inicio: "2026-09-01", periodo_fim: "2026-10-26" }] }))).toEqual([]);
  });
});

describe("dado incompleto separado de divergência", () => {
  const vazio = { documentos: [], auditoria: [], ordens: [], fornecedores: [], hoje: "2026-10-27", corte: "2026-10-01" };
  it("pedido do Tiny antes do corte sem parcela vira um aviso só, não 'parcelas diferentes'", () => {
    const pedidos = [1, 2, 3].map((n) => ({ id: `p${n}`, numero: n, status: "entregue", valor_total: 100, origem: "tiny", created_at: "2025-05-01" }));
    const r = calcularExcecoes({ ...vazio, receber: [], pagar: [], lancamentos: [], bancos: [], importacoes: [], pedidos });
    expect(r.filter((e) => e.tipo === "parcelas_divergentes")).toHaveLength(0);
    expect(r.filter((e) => e.tipo === "dado_incompleto")).toHaveLength(1);
  });
  it("conta paga sem documento antes do corte entra no aviso; depois do corte, uma a uma", () => {
    const pagar = [
      conta({ id: "v", status: "pago", data_pagamento: "2026-05-01", valor_pago: 100 }),
      conta({ id: "n", status: "pago", data_pagamento: "2026-10-15", valor_pago: 100 }),
    ];
    const r = calcularExcecoes({ ...vazio, receber: [], pagar, lancamentos: [], bancos: [], importacoes: [], pedidos: [] });
    expect(r.filter((e) => e.tipo === "sem_documento").map((e) => e.chave)).toEqual(["sem_documento:n"]);
    expect(r.find((e) => e.tipo === "dado_incompleto")?.titulo).toContain("1 conta paga");
  });
});

describe("extrato na conta errada", () => {
  const bancos = [{ id: "inter", nome: "Banco Inter", banco: "inter", ativo: true }, { id: "ip", nome: "InfinitePay", banco: "infinitepay", ativo: true }];
  const importacoes = [{ id: "i1", conta_bancaria_id: "inter", periodo_inicio: "2026-10-02", periodo_fim: "2026-10-05", arquivo: "extrato.ofx" }];
  it("importação com a cara de outro banco vira um achado só, pela importação", () => {
    const lancamentos = [1, 2, 3, 4].map((n) => lanc({ id: `l${n}`, conta_bancaria_id: "inter", origem: "arquivo", importacao_id: "i1", descricao: `Cliente ${n} · mfmaquinas` }));
    const r = conferenciasAuditor(base({ bancos, importacoes, lancamentos }), LIM).filter((e) => e.tipo === "extrato_conta_errada");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ chave: "extrato_conta_errada:i1", gravidade: "alta" });
    expect(r[0].detalhe).toContain("InfinitePay");
  });
  it("a mesma cara na própria conta não é problema", () => {
    const lancamentos = [1, 2, 3].map((n) => lanc({ id: `l${n}`, conta_bancaria_id: "ip", origem: "arquivo", importacao_id: "i2", descricao: `Cliente ${n} · mfmaquinas` }));
    expect(tipos(base({ bancos, lancamentos }))).not.toContain("extrato_conta_errada");
  });
  it("arquivo numa conta que já recebe pela API, depois que a API começou", () => {
    const lancamentos = [
      lanc({ id: "a", conta_bancaria_id: "inter", origem: "inter", data: "2026-10-19" }),
      lanc({ id: "b", conta_bancaria_id: "inter", origem: "arquivo", importacao_id: "i1", data: "2026-10-20" }),
    ];
    expect(tipos(base({ bancos, importacoes, lancamentos, hoje: "2026-10-21" }))).toContain("extrato_conta_errada");
  });
});

describe("extrato automático parado", () => {
  const bancos = [{ id: "inter", nome: "Banco Inter", banco: "inter", ativo: true }];
  it("conta da API sem linha nova há mais de 3 dias vira alerta; em dia não", () => {
    const lancamentos = [lanc({ conta_bancaria_id: "inter", origem: "inter", data: "2026-10-22" })];
    expect(tipos(base({ bancos, lancamentos }))).toContain("extrato_atrasado");
    expect(tipos(base({ bancos, lancamentos, hoje: "2026-10-24" }))).not.toContain("extrato_atrasado");
  });
});

describe("resumo da rodada", () => {
  it("só conta como novo o que nunca apareceu, o mais grave primeiro", () => {
    const a = (chave: string, gravidade: "alta" | "media" | "baixa") => ({ chave, tipo: "taxa_cartao" as const, titulo: chave, detalhe: "", link: "/", gravidade });
    const r = resumoRodada([a("x", "baixa"), a("y", "alta"), a("z", "media")], new Set(["y"]));
    expect(r.novos.map((n) => n.chave)).toEqual(["z", "x"]);
    expect(r).toMatchObject({ total: 3, principal: "z", novosPorGravidade: { alta: 0, media: 1, baixa: 1 } });
  });
});
