import { describe, expect, it } from "vitest";
import { corpoCotacaoBp, dataBp, faltaParaCotarBp, lerCotacaoBp, lerRastreioBp } from "../../../supabase/functions/_shared/braspress";

// dados inventados (CNPJs e CEPs de exemplo)
const ENVIO = {
  cep_origem: "88100-000", cep_destino: "01001-000", valor_mercadoria: 15000.5, peso_total_kg: null, modalidade: "cif",
  volumes: [{ quantidade: 1, peso_kg: 180, largura_cm: 70, altura_cm: 160, comprimento_cm: 80 }, { quantidade: 2, peso_kg: 10, largura_cm: 30, altura_cm: 30, comprimento_cm: 40 }],
};
const CNPJ = "11.222.333/0001-44", DOC = "99.888.777/0001-66";

describe("Braspress: cotação", () => {
  it("monta o corpo com medidas em metros, peso total e CIF", () => {
    expect(corpoCotacaoBp(ENVIO, CNPJ, DOC)).toEqual({
      cnpjRemetente: 11222333000144, cnpjDestinatario: 99888777000166, modal: "R", tipoFrete: "1",
      cepOrigem: 88100000, cepDestino: 1001000, vlrMercadoria: 15000.5, peso: 200, volumes: 3,
      cubagem: [{ comprimento: 0.8, largura: 0.7, altura: 1.6, volumes: 1 }, { comprimento: 0.4, largura: 0.3, altura: 0.3, volumes: 2 }],
    });
    expect(corpoCotacaoBp({ ...ENVIO, modalidade: "fob" }, CNPJ, DOC).tipoFrete).toBe("2");
  });

  it("diz o que falta", () => {
    expect(faltaParaCotarBp(ENVIO, CNPJ, DOC)).toEqual([]);
    expect(faltaParaCotarBp({ ...ENVIO, volumes: [{ quantidade: 1, peso_kg: 5 }] }, CNPJ, "")).toEqual(["CPF/CNPJ do cliente", "medidas de cada volume"]);
  });

  it("lê valor e prazo", () => {
    expect(lerCotacaoBp({ id: 123, prazo: 5, totalFrete: 812.456 })).toEqual({ valor: 812.46, prazo: 5, id: "123" });
    expect(lerCotacaoBp({ message: "CEP de destino não atendido" })).toEqual({ erro: "CEP de destino não atendido" });
  });
});

describe("Braspress: rastreio", () => {
  it("lê a linha do tempo e a entrega", () => {
    const r = lerRastreioBp({ conhecimentos: [{
      statusEntrega: "ENTREGUE", numero: "123", previsaoEntrega: "16/10/2026", dataEntrega: "18/10/2026", cidade: "SAO PAULO", uf: "SP",
      dataOcorrencia: "18/10/2026 15:40", ultimaOcorrencia: "ENTREGA REALIZADA",
      timeLine: [{ descricao: "Encomenda na Origem (Braspress)", data: "14/10/2026" }, { descricao: "Em trânsito", data: "15/10/2026" }],
    }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eventos.map((e) => e.ocorrencia)).toEqual(["Encomenda na Origem (Braspress)", "Em trânsito", "ENTREGA REALIZADA"]);
    expect(r.ultimo?.cidade).toBe("SAO PAULO / SP");
    expect(r.entregue).toBe(true);
    expect(r.entregue_em).toBe("2026-10-18T12:00:00-03:00");
    expect(r.previsao).toBe("2026-10-16");
  });

  it("nota não achada e na estrada", () => {
    expect(lerRastreioBp({ conhecimentos: [] }).ok).toBe(false);
    const r = lerRastreioBp({ conhecimentos: [{ statusEntrega: "EM TRANSITO", ultimaOcorrencia: "Em trânsito", dataOcorrencia: "15/10/2026 08:00" }] });
    expect(r.ok && r.entregue).toBe(false);
    expect(dataBp("15/10/2026 08:00")).toBe("2026-10-15T08:00:00-03:00");
  });
});
