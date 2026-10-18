import { describe, expect, it } from "vitest";
import { naVisaoPagar, PASSOS_PAGAR, passoPagar, situacaoPagar, soltarNaColuna, VISOES_PAGAR, type ContaDecisao } from "../programacao";

const HOJE = "2026-10-16";
const conta = (x: Partial<ContaDecisao & { data_pagamento: string | null }>) =>
  ({ id: "c", valor: 100, vencimento: "2026-10-20", status: "aberto", revisao: "historico", ...x });

describe("contas a pagar: passos e situação", () => {
  it("os passos na ordem do código de cores (1, 2, 2.1, 2.2, 2.3, 3)", () => {
    expect(PASSOS_PAGAR.map((p) => `${p.passo} ${p.id}`)).toEqual(["1 decidir", "2 programadas", "2.1 hoje", "2.2 atrasadas", "2.3 nao_pagar", "3 pagas"]);
    expect(VISOES_PAGAR.map((v) => v.v).slice(-3)).toEqual(["renegociadas", "fixas", "todas"]);
  });

  it("uma etiqueta por conta, na ordem do que importa", () => {
    expect(situacaoPagar(conta({ status: "pago", data_pagamento: "2026-10-10" }), HOJE)).toMatchObject({ texto: "Paga em 10/10", tom: "paga" });
    expect(situacaoPagar(conta({ fornecedor: { bloqueado: true, bloqueio_motivo: "golpe" } }), HOJE)).toMatchObject({ texto: "Golpe · não pagar", sub: "golpe" });
    expect(situacaoPagar(conta({ decisao: "nao_pagar", decisao_motivo: "Cobrança indevida", decisao_por_nome: "Ana" }), HOJE))
      .toMatchObject({ texto: "Não pagar", tom: "parada", sub: "Cobrança indevida · por Ana" });
    expect(situacaoPagar(conta({ revisao: "em_revisao", vencimento: "2026-10-10" }), HOJE)).toMatchObject({ texto: "Falta aprovar", sub: "venceu há 6 dias" });
    expect(situacaoPagar(conta({ decisao: "agendado", pagar_em: "2026-10-25" }), HOJE)).toMatchObject({ texto: "Agendada 25/10", tom: "agenda" });
    expect(situacaoPagar(conta({ decisao: "pagar", pagar_em: HOJE }), HOJE)).toMatchObject({ texto: "Pagar hoje", tom: "hoje" });
    expect(situacaoPagar(conta({ decisao: "pagar", vencimento: "2026-10-14" }), HOJE)).toMatchObject({ texto: "Atrasada há 2 dias", tom: "atrasada", sub: "programada para 14/10" });
    expect(situacaoPagar(conta({ vencimento: "2026-08-20" }), HOJE)).toMatchObject({ texto: "Vencida há 57 dias", tom: "atrasada" });
    expect(situacaoPagar(conta({ vencimento: HOJE }), HOJE)).toMatchObject({ texto: "Vence hoje" });
    expect(situacaoPagar(conta({}), HOJE)).toMatchObject({ texto: "A decidir", tom: "decidir", sub: "vence em 4 dias" });
  });

  it("visões: aprovar e decidir juntos; não pagar e golpe à parte; renegociadas e fixas", () => {
    const l = [
      conta({ id: "venc", vencimento: "2026-08-20" }),
      conta({ id: "semana" }),
      conta({ id: "nao", decisao: "nao_pagar", vencimento: "2026-08-20" }),
      conta({ id: "golpe", fornecedor: { bloqueado: true } }),
      conta({ id: "prog", decisao: "agendado", pagar_em: "2026-10-18", vencimento: "2026-10-30" }),
      conta({ id: "hoje", decisao: "pagar", pagar_em: HOJE }),
      conta({ id: "atras", decisao: "agendado", pagar_em: "2026-10-12" }),
      conta({ id: "aprovar", revisao: "em_revisao", decisao: "agendado", pagar_em: "2026-10-18" }),
      conta({ id: "acordo", negociacao_id: "n1", negociacao_papel: "acordo", recorrente_id: "f1" }),
      conta({ id: "paga", status: "pago" }),
      conta({ id: "canc", status: "cancelado", negociacao_id: "n1", negociacao_papel: "original" }),
    ];
    const ids = (v: (typeof VISOES_PAGAR)[number]["v"]) => l.filter((c) => naVisaoPagar(c, v, HOJE)).map((c) => c.id);
    expect(ids("decidir")).toEqual(["venc", "semana", "aprovar", "acordo"]);
    expect(ids("programadas")).toEqual(["prog"]);
    expect(ids("hoje")).toEqual(["hoje"]);
    expect(ids("atrasadas")).toEqual(["atras"]);
    expect(ids("nao_pagar")).toEqual(["nao", "golpe"]);
    expect(ids("pagas")).toEqual(["paga"]);
    expect(ids("renegociadas")).toEqual(["acordo"]);
    expect(ids("fixas")).toEqual(["acordo"]);
    expect(ids("todas")).not.toContain("canc");
  });
});

describe("quadro (Kanban) das contas a pagar", () => {
  it("cada conta numa coluna, pelo caminho até o pagamento", () => {
    expect(passoPagar(conta({ decisao: null }), HOJE)).toBe("decidir");
    expect(passoPagar(conta({ decisao: "pagar", revisao: "em_revisao" }), HOJE)).toBe("decidir");
    expect(passoPagar(conta({ decisao: "agendado", pagar_em: "2026-10-20" }), HOJE)).toBe("programadas");
    expect(passoPagar(conta({ decisao: "pagar", pagar_em: "2026-10-16" }), HOJE)).toBe("hoje");
    expect(passoPagar(conta({ decisao: "pagar", pagar_em: "2026-10-15" }), HOJE)).toBe("atrasadas");
    expect(passoPagar(conta({ decisao: "nao_pagar", decisao_motivo: "duplicada" }), HOJE)).toBe("nao_pagar");
    expect(passoPagar(conta({ fornecedor: { bloqueado: true } }), HOJE)).toBe("nao_pagar");
    expect(passoPagar(conta({ status: "pago", data_pagamento: "2026-10-10" }), HOJE)).toBe("pagas");
    expect(passoPagar(conta({ status: "cancelado" }), HOJE)).toBeNull();
  });

  it("arrastar faz a ação da coluna, com as travas de aprovação, golpe e pagamento", () => {
    const livre = conta({ decisao: null });
    expect(soltarNaColuna(livre, "hoje", HOJE)).toEqual({ acao: "pagar_hoje" });
    expect(soltarNaColuna(livre, "programadas", HOJE)).toEqual({ acao: "agendar" });
    expect(soltarNaColuna(livre, "nao_pagar", HOJE)).toEqual({ acao: "nao_pagar" });
    expect(soltarNaColuna(livre, "pagas", HOJE)).toEqual({ acao: "registrar" });
    expect(soltarNaColuna(livre, "decidir", HOJE)).toBeNull();
    expect(soltarNaColuna(conta({ decisao: "nao_pagar" }), "decidir", HOJE)).toEqual({ acao: "limpar" });
    expect(soltarNaColuna(conta({ revisao: "em_revisao" }), "hoje", HOJE)).toHaveProperty("motivo");
    expect(soltarNaColuna(livre, "atrasadas", HOJE)).toHaveProperty("motivo");
    expect(soltarNaColuna(conta({ decisao: "pagar", pagar_em: "2026-10-12" }), "hoje", HOJE)).toEqual({ acao: "pagar_hoje" });
    expect(soltarNaColuna(conta({ fornecedor: { bloqueado: true } }), "hoje", HOJE)).toHaveProperty("motivo");
    expect(soltarNaColuna(conta({ status: "pago" }), "decidir", HOJE)).toHaveProperty("motivo");
  });
});
