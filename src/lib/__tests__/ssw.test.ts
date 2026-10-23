import { describe, expect, it } from "vitest";
import { chaveValida, eventoDeEntrega, lerTrackingSsw, resumoEvento } from "../../../supabase/functions/_shared/ssw";

// resposta inventada no formato do trackingdanfe do SSW (empresas e cidades de exemplo)
const RESPOSTA = {
  success: true,
  message: "Documento localizado com sucesso",
  documento: {
    header: { remetente: "EMPRESA EXEMPLO LTDA", destinatario: "CLIENTE EXEMPLO" },
    tracking: [
      { data_hora: "2026-10-20T18:10:00", dominio: "XYZ", filial: "SJO", cidade: "SAO JOSE / SC", ocorrencia: "DOCUMENTO DE TRANSPORTE EMITIDO (80)", descricao: "Documento emitido.", tipo: "Informativo" },
      { data_hora: "2026-10-22T09:30:00", data_hora_efetiva: "2026-10-22T09:25:00", filial: "POA", cidade: "PORTO ALEGRE / RS", ocorrencia: "MERCADORIA ENTREGUE (01)", descricao: "Entregue.", tipo: "Entrega", nome_recebedor: "FULANO" },
      { data_hora: "2026-10-21T07:00:00", filial: "POA", cidade: "PORTO ALEGRE / RS", ocorrencia: "SAIDA PARA ENTREGA (85)", tipo: "Informativo" },
    ],
  },
};

describe("SSW: rastreio pela chave da nota", () => {
  it("lê os eventos em ordem e vê a entrega", () => {
    const r = lerTrackingSsw(RESPOSTA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eventos.map((e) => e.ocorrencia)).toEqual(["DOCUMENTO DE TRANSPORTE EMITIDO (80)", "SAIDA PARA ENTREGA (85)", "MERCADORIA ENTREGUE (01)"]);
    expect(r.entregue).toBe(true);
    expect(r.entregue_em).toBe("2026-10-22T09:25:00");
    expect(r.ultimo?.recebedor).toBe("FULANO");
    expect(resumoEvento(r.ultimo)).toBe("MERCADORIA ENTREGUE (01) · PORTO ALEGRE / RS");
  });

  it("nota que o SSW não conhece vira erro com a mensagem dele", () => {
    expect(lerTrackingSsw({ success: false, message: "Nenhum documento localizado" })).toEqual({ ok: false, erro: "Nenhum documento localizado" });
    expect(lerTrackingSsw({ success: true, documento: { tracking: [] } }).ok).toBe(false);
    expect(lerTrackingSsw(null).ok).toBe(false);
  });

  it("ainda na estrada não é entrega", () => {
    const r = lerTrackingSsw({ success: true, documento: { tracking: [RESPOSTA.documento.tracking[0]] } });
    expect(r.ok && r.entregue).toBe(false);
  });

  it("tentativa ou recusa não contam como entrega", () => {
    expect(eventoDeEntrega({ ocorrencia: "MERCADORIA ENTREGUE (01)", tipo: null })).toBe(true);
    expect(eventoDeEntrega({ ocorrencia: "ENTREGA NAO REALIZADA - CLIENTE AUSENTE (03)", tipo: "Pendência" })).toBe(false);
    expect(eventoDeEntrega({ ocorrencia: "MERCADORIA RECUSADA PELO DESTINATARIO (02)", tipo: "Entrega" })).toBe(false);
  });

  it("confere a chave da nota", () => {
    expect(chaveValida("42260511222333000144550010000123451000000017")).toBe(true);
    expect(chaveValida("42260511222333000144550010000123451000000018")).toBe(false);
    expect(chaveValida("123")).toBe(false);
  });
});

describe("SSW: fuso da hora", () => {
  it("hora sem fuso vira horário de Brasília", async () => {
    const { comFuso } = await import("../../../supabase/functions/_shared/ssw");
    expect(comFuso("2026-10-22T09:25:00")).toBe("2026-10-22T09:25:00-03:00");
    expect(comFuso("2026-10-22T09:25:00-03:00")).toBe("2026-10-22T09:25:00-03:00");
    expect(comFuso("2026-10-22T12:25:00Z")).toBe("2026-10-22T12:25:00Z");
    expect(comFuso(null)).toBeNull();
  });
});
