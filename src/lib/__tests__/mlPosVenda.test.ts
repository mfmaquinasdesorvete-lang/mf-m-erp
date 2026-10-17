import { describe, expect, it } from "vitest";
import { envioProprio, pedeAtencao, situacaoNota, situacaoRastreio, textoEnvio, textoModo, textoResumoPosVenda, type VendaML } from "../mlPosVenda";

const base: VendaML = {
  id: "v1", ml_order_id: 2000001, ml_pack_id: null, pedido_id: "p1", data_venda: "2026-10-15T10:00:00Z", comprador: "Comprador Teste", total: 100,
  logistica: "cross_docking", situacao: "importada", pendencia: null,
  envio_status: "ready_to_ship", envio_substatus: "ready_to_print", envio_modo: "me2", rastreio_ml: null, envio_atualizado_em: null,
  nota_enviada_em: null, nota_erro: null, nota_tentativas: 0, rastreio_enviado_em: null, rastreio_erro: null, rastreio_tentativas: 0,
};

describe("Mercado Livre depois da venda: textos da tela", () => {
  it("situação do envio em português, com o detalhe", () => {
    expect(textoEnvio("shipped", "out_for_delivery")).toEqual({ texto: "A caminho", tom: "fila", detalhe: "saiu para entrega" });
    expect(textoEnvio("delivered")).toEqual({ texto: "Entregue", tom: "ok", detalhe: undefined });
    expect(textoEnvio("shipped", "delayed").tom).toBe("atencao");
    expect(textoEnvio("not_delivered", "lost").tom).toBe("erro");
    expect(textoEnvio(null).texto).toBe("Sem informação");
    expect(textoEnvio("novo_status", "algo_novo")).toEqual({ texto: "novo_status", tom: "neutro", detalhe: "algo novo" });
  });

  it("modo do envio", () => {
    expect(textoModo("me2", "fulfillment")).toMatch(/^Full/);
    expect(textoModo("me2", "self_service")).toBe("Mercado Envios Flex");
    expect(textoModo("me2", "cross_docking")).toBe("Mercado Envios");
    expect(textoModo("custom")).toBe("Envio próprio");
    expect(envioProprio("me1")).toBe(true);
    expect(envioProprio("me2")).toBe(false);
  });

  it("NF-e: enviada, na fila, esperando a nota, erro e parada", () => {
    expect(situacaoNota({ ...base, nota_enviada_em: "2026-10-15T11:00:00Z" }, true, true).tom).toBe("ok");
    expect(situacaoNota(base, false, true).texto).toBe("Não vai pelo ERP");
    expect(situacaoNota(base, true, false).texto).toBe("Esperando a NF-e");
    expect(situacaoNota(base, true, true).tom).toBe("fila");
    expect(situacaoNota({ ...base, nota_erro: "falhou", nota_tentativas: 2 }, true, true)).toMatchObject({ tom: "atencao", detalhe: "falhou" });
    expect(situacaoNota({ ...base, nota_erro: "falhou", nota_tentativas: 5 }, true, true).tom).toBe("erro");
    expect(situacaoNota({ ...base, situacao: "cancelada" }, true, true).texto).toBe("Venda cancelada");
    expect(situacaoNota({ ...base, pedido_id: null }, true, false).texto).toBe("Venda ainda não entrou");
  });

  it("rastreio só no envio próprio", () => {
    expect(situacaoRastreio(base)).toBeNull();
    const propria = { ...base, envio_modo: "me1", envio_status: "handling", envio_substatus: null };
    expect(situacaoRastreio(propria)?.texto).toBe("Esperando o despacho com rastreio");
    expect(situacaoRastreio({ ...propria, rastreio_enviado_em: "2026-10-16T09:00:00Z" })?.tom).toBe("ok");
    expect(situacaoRastreio({ ...propria, rastreio_erro: "recusado", rastreio_tentativas: 5 })?.tom).toBe("erro");
    expect(situacaoRastreio({ ...propria, envio_status: "shipped" })?.tom).toBe("ok");
  });

  it("pede atenção: venda que não entrou ou com erro", () => {
    expect(pedeAtencao(base, true, true)).toBe(false);
    expect(pedeAtencao({ ...base, situacao: "pendente" }, true, true)).toBe(true);
    expect(pedeAtencao({ ...base, nota_erro: "x", nota_tentativas: 1 }, true, true)).toBe(true);
    expect(pedeAtencao({ ...base, envio_substatus: "delayed", envio_status: "shipped" }, true, true)).toBe(true);
  });

  it("resumo do Mandar agora", () => {
    expect(textoResumoPosVenda({ aviso: "nenhuma conta do Mercado Livre conectada" })).toBe("Nenhuma conta do Mercado Livre conectada.");
    expect(textoResumoPosVenda({ notas: { enviadas: 0, erros: 0 }, rastreios: { enviados: 0, erros: 0 } })).toMatch(/^Nada na fila/);
    expect(textoResumoPosVenda({ notas: { enviadas: 2, erros: 1 }, rastreios: { enviados: 1, erros: 0 } }))
      .toBe("2 NF-e enviadas, 1 rastreio informado, 1 com erro (veja na lista).");
  });
});
