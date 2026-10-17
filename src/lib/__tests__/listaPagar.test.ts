import { describe, expect, it } from "vitest";
import { colunaPagar, naVisaoPagar, situacaoPagar, soltarNaColuna, VISOES_PAGAR, type ContaDecisao } from "../programacao";

const HOJE = "2026-10-16";
const conta = (x: Partial<ContaDecisao & { data_pagamento: string | null }>) =>
  ({ id: "c", valor: 100, vencimento: "2026-10-20", status: "aberto", revisao: "historico", ...x });

describe("contas a pagar: visões e situação", () => {
  it("uma etiqueta por conta, na ordem do que importa", () => {
    expect(situacaoPagar(conta({ status: "pago", data_pagamento: "2026-10-10" }), HOJE)).toMatchObject({ texto: "Paga em 10/10", tom: "ok" });
    expect(situacaoPagar(conta({ fornecedor: { bloqueado: true, bloqueio_motivo: "golpe" } }), HOJE)).toMatchObject({ texto: "Golpe · não pagar", sub: "golpe" });
    expect(situacaoPagar(conta({ decisao: "nao_pagar", decisao_motivo: "Cobrança indevida", decisao_por_nome: "Ana" }), HOJE))
      .toMatchObject({ texto: "Não pagar", sub: "Cobrança indevida · por Ana" });
    expect(situacaoPagar(conta({ revisao: "em_revisao", vencimento: "2026-10-10" }), HOJE)).toMatchObject({ texto: "Falta aprovar", sub: "venceu há 6 dias" });
    expect(situacaoPagar(conta({ decisao: "agendado", pagar_em: "2026-10-25" }), HOJE)).toMatchObject({ texto: "Agendada 25/10", tom: "agenda" });
    expect(situacaoPagar(conta({ decisao: "pagar", vencimento: "2026-10-14" }), HOJE)).toMatchObject({ texto: "Pagar hoje" });
    expect(situacaoPagar(conta({ vencimento: "2026-08-20" }), HOJE)).toMatchObject({ texto: "Vencida há 57 dias", tom: "atrasada" });
    expect(situacaoPagar(conta({ vencimento: HOJE }), HOJE)).toMatchObject({ texto: "Vence hoje" });
    expect(situacaoPagar(conta({}), HOJE)).toMatchObject({ texto: "A decidir", sub: "vence em 4 dias" });
  });

  it("visões: não pagar e golpe ficam fora do que é para pagar", () => {
    const l = [
      conta({ id: "venc", vencimento: "2026-08-20" }),
      conta({ id: "semana" }),
      conta({ id: "longe", vencimento: "2026-12-01" }),
      conta({ id: "nao", decisao: "nao_pagar", vencimento: "2026-08-20" }),
      conta({ id: "golpe", fornecedor: { bloqueado: true } }),
      conta({ id: "prog", decisao: "agendado", pagar_em: "2026-10-18", vencimento: "2026-10-30" }),
      conta({ id: "aprovar", revisao: "em_revisao" }),
      conta({ id: "paga", status: "pago" }),
      conta({ id: "canc", status: "cancelado" }),
    ];
    const ids = (v: (typeof VISOES_PAGAR)[number]["v"]) => l.filter((c) => naVisaoPagar(c, v, HOJE)).map((c) => c.id);
    expect(ids("para_pagar")).toEqual(["venc", "semana", "longe", "prog", "aprovar"]);
    expect(ids("vencidas")).toEqual(["venc"]);
    expect(ids("semana")).toEqual(["semana", "prog", "aprovar"]); // a programada conta pelo dia escolhido
    expect(ids("decidir")).toEqual(["venc", "semana", "longe", "aprovar"]);
    expect(ids("falta_aprovar")).toEqual(["aprovar"]);
    expect(ids("agendadas")).toEqual(["prog"]);
    expect(ids("nao_pagar")).toEqual(["nao", "golpe"]);
    expect(ids("pagas")).toEqual(["paga"]);
    expect(ids("todas")).not.toContain("canc");
  });
});

describe("quadro (Kanban) das contas a pagar", () => {
  it("cada conta numa coluna, pelo caminho até o pagamento", () => {
    expect(colunaPagar(conta({ decisao: null }), HOJE)).toBe("decidir");
    expect(colunaPagar(conta({ decisao: null, revisao: "em_revisao" }), HOJE)).toBe("aprovar");
    expect(colunaPagar(conta({ decisao: "agendado", pagar_em: "2026-10-20" }), HOJE)).toBe("programadas");
    expect(colunaPagar(conta({ decisao: "pagar", pagar_em: "2026-10-16" }), HOJE)).toBe("hoje");
    expect(colunaPagar(conta({ decisao: "nao_pagar", decisao_motivo: "duplicada" }), HOJE)).toBe("nao_pagar");
    expect(colunaPagar(conta({ fornecedor: { bloqueado: true } }), HOJE)).toBe("nao_pagar");
    expect(colunaPagar(conta({ status: "pago", data_pagamento: "2026-10-10" }), HOJE)).toBe("pagas");
    expect(colunaPagar(conta({ status: "cancelado" }), HOJE)).toBeNull();
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
    expect(soltarNaColuna(livre, "aprovar", HOJE)).toHaveProperty("motivo");
    expect(soltarNaColuna(conta({ fornecedor: { bloqueado: true } }), "hoje", HOJE)).toHaveProperty("motivo");
    expect(soltarNaColuna(conta({ status: "pago" }), "decidir", HOJE)).toHaveProperty("motivo");
  });
});
