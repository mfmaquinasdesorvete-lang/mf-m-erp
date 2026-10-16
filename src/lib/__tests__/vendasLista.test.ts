import { describe, expect, it } from "vitest";
import { contasDaVenda, envioDaVenda, meioDaVenda, meioDoTexto, pagamentoDaVenda, sinaisDaVenda, type ContaVenda } from "../vendasLista";

const conta = (x: Partial<ContaVenda>): ContaVenda => ({ id: "c", status: "aberto", valor: 100, vencimento: "2026-10-20", ...x });
const HOJE = "2026-10-16";

describe("pagamento da venda pelas contas a receber", () => {
  it("orçamento e venda cancelada não têm situação de pagamento", () => {
    expect(pagamentoDaVenda({ status: "orcamento" }, [conta({})], HOJE)).toBeNull();
    expect(pagamentoDaVenda({ status: "cancelado" }, [], HOJE)).toBeNull();
  });

  it("sem conta, recebido, a receber, vencido e em parte", () => {
    expect(pagamentoDaVenda({ status: "entregue" }, [], HOJE)?.situacao).toBe("sem_conta");
    const pago = pagamentoDaVenda({ status: "entregue" }, [conta({ id: "a", status: "pago", data_pagamento: "2026-10-01" }), conta({ id: "b", status: "pago", data_pagamento: "2026-10-10" })], HOJE)!;
    expect([pago.situacao, pago.sub, pago.recebido]).toEqual(["recebido", "em 10/10/2026", 200]);
    expect(pagamentoDaVenda({ status: "faturado" }, [conta({ vencimento: HOJE })], HOJE)?.sub).toBe("vence hoje");
    expect(pagamentoDaVenda({ status: "faturado" }, [conta({})], HOJE)).toMatchObject({ situacao: "a_receber", sub: "vence 20/10" });
    expect(pagamentoDaVenda({ status: "faturado" }, [conta({ vencimento: "2026-10-06" })], HOJE)).toMatchObject({ situacao: "vencido", sub: "há 10 dias" });
    const parte = pagamentoDaVenda({ status: "aprovado" }, [conta({ id: "a", status: "pago" }), conta({ id: "b" })], HOJE)!;
    expect(parte.situacao).toBe("parcial");
    expect(parte.sub).toMatch(/100,00 de .*200,00/);
  });

  it("junta as contas do pedido e das notas, sem repetir e sem as canceladas", () => {
    const c = contasDaVenda({ contas: [conta({ id: "a" }), conta({ id: "x", status: "cancelado" })], notas: [{ contas: [conta({ id: "a" }), conta({ id: "b" })] }, {}] });
    expect(c.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("forma de pagamento", () => {
  it("lê o texto do ERP e do Tiny", () => {
    expect(meioDoTexto("Pix")).toBe("pix");
    expect(meioDoTexto("Link de pagamento")).toBe("link");
    expect(meioDoTexto("Cartão de crédito")).toBe("cartao");
    expect(meioDoTexto("Depósito bancário")).toBe("transferencia");
    expect(meioDoTexto("")).toBeNull();
  });
  it("pedido primeiro; sem ele, a das contas; sem contas, a do Tiny", () => {
    expect(meioDaVenda({ forma_pagamento: "boleto", parcelas: 3 }, [], null)).toEqual({ meio: "boleto", rotulo: "Boleto · 3x" });
    expect(meioDaVenda({ forma_pagamento: null }, [conta({ forma_pagamento: "cartao" })], "Pix")?.meio).toBe("cartao");
    expect(meioDaVenda({ forma_pagamento: null }, [], "Pix")?.meio).toBe("pix");
    expect(meioDaVenda({ forma_pagamento: null }, [], null)).toBeNull();
  });
});

describe("forma de envio", () => {
  const loggi = { nome: "Loggi Tecnologia", nome_fantasia: "Loggi", tipo: "transportadora" as const, rastreio_url: "https://exemplo.com/r/{codigo}" };
  it("pelo envio do painel de fretes, com o rastreio e a entrega", () => {
    const e = envioDaVenda({ modalidade_frete: 9, numero_externo: "10" }, [
      { id: "1", status: "cancelado", created_at: "2026-10-02", transportadora_nome: "Outra" },
      { id: "2", status: "entregue", created_at: "2026-10-01", codigo_rastreio: "AB1", entregue_em: "2026-10-05", transportadora: loggi },
    ]);
    expect(e).toMatchObject({ tipo: "transportadora", rotulo: "Loggi", rastreio: "AB1", link: "https://exemplo.com/r/AB1", andamento: "Entregue 05/10", entregue: true });
  });
  it("pela transportadora do pedido, pelo código dos Correios ou pela modalidade", () => {
    expect(envioDaVenda({ transportadora: { nome: "Correios / Sedex", tipo: "correios" } }).tipo).toBe("correios");
    expect(envioDaVenda({ codigo_rastreio: "AA123456789BR" })).toMatchObject({ tipo: "correios", rotulo: "Correios" });
    expect(envioDaVenda({ modalidade_frete: 9 }).tipo).toBe("sem_frete");
    expect(envioDaVenda({ modalidade_frete: 9, numero_externo: "55" }).tipo).toBe("nao_informado");
    expect(envioDaVenda({ modalidade_frete: 0 }).tipo).toBe("a_definir");
    expect(envioDaVenda({ modalidade_frete: 4 }).tipo).toBe("proprio");
  });
});

it("sinais: estoque, contas, NF-e autorizada (fora a de teste) e proposta enviada", () => {
  expect(sinaisDaVenda({ estoque_baixado: true, notas: [{ status: "autorizada", ambiente: "homologacao" }] }, [])).toEqual({ estoque: true, contas: false, nfe: false, proposta: false });
  expect(sinaisDaVenda({ notas: [{ status: "autorizada", ambiente: "producao" }], proposta_enviada_em: "2026-10-01" }, [conta({})])).toEqual({ estoque: false, contas: true, nfe: true, proposta: true });
});
