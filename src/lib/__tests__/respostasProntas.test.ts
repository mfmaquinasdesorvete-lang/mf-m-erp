import { describe, expect, it } from "vitest";
import { ehPergunta, freteDemorando, inicioDaSemana, pecasFaltando, reconhecer, somar } from "../respostasProntas";

describe("perguntas prontas", () => {
  it("reconhece as perguntas da equipe", () => {
    expect(reconhecer("O que foi vendido hoje?")).toBe("vendas_hoje");
    expect(reconhecer("quanto vendemos na semana")).toBe("vendas_semana");
    expect(reconhecer("Quanto tem de saldo?")).toBe("saldo");
    expect(reconhecer("quais peças estão faltando")).toBe("pecas_faltando");
    expect(reconhecer("tem frete que está demorando?")).toBe("fretes_demorando");
    expect(reconhecer("entrega atrasada")).toBe("fretes_demorando");
    expect(reconhecer("máquinas vendidas em SP com a preventiva vencida")).toBeNull();
    expect(reconhecer("vendas de setembro em MG")).toBeNull();
  });
  it("semana começa na segunda", () => {
    expect(inicioDaSemana("2026-10-23")).toBe("2026-10-19"); // sexta
    expect(inicioDaSemana("2026-10-19")).toBe("2026-10-19"); // segunda
    expect(inicioDaSemana("2026-10-25")).toBe("2026-10-19"); // domingo
  });
  it("peças abaixo do mínimo, sem kit e sem sob encomenda", () => {
    const l = pecasFaltando([
      { id: "a", descricao: "Pá", sku: null, estoque_atual: 1, estoque_minimo: 5 },
      { id: "b", descricao: "Correia", sku: null, estoque_atual: -2, estoque_minimo: 3 },
      { id: "c", descricao: "Motor", sku: null, estoque_atual: 5, estoque_minimo: 5 },
      { id: "d", descricao: "Kit", sku: null, estoque_atual: 0, estoque_minimo: 2, kit: true },
      { id: "e", descricao: "Sem mínimo", sku: null, estoque_atual: 0, estoque_minimo: 0 },
      { id: "f", descricao: "Encomenda", sku: null, estoque_atual: 0, estoque_minimo: 1, sob_encomenda: true },
    ]);
    expect(l.map((p) => [p.id, p.falta])).toEqual([["a", 4], ["b", 3]]);
  });
  it("frete demorando: passou da previsão, não coletou, estrada sem previsão", () => {
    const base = { id: "1", status: "transito", entrega_prevista: null, coleta_prevista: null, coletado_em: null, entregue_em: null };
    expect(freteDemorando({ ...base, entrega_prevista: "2026-10-20" }, "2026-10-23")).toEqual({ motivo: "passou da entrega prevista", dias: 3 });
    expect(freteDemorando({ ...base, status: "aprovacao", coleta_prevista: "2026-10-22" }, "2026-10-23")?.motivo).toBe("a transportadora ainda não coletou");
    expect(freteDemorando({ ...base, coletado_em: "2026-10-10T15:00:00Z" }, "2026-10-23")?.dias).toBe(13);
    expect(freteDemorando({ ...base, entrega_prevista: "2026-10-25" }, "2026-10-23")).toBeNull();
    expect(freteDemorando({ ...base, entrega_prevista: "2026-10-01", entregue_em: "2026-10-02" }, "2026-10-23")).toBeNull();
  });
  it("soma em centavos certos", () => {
    expect(somar([0.1, 0.2, "10.005", null])).toBe(10.31);
  });
});

describe("ehPergunta", () => {
  it("pergunta vai para o Perguntar à IA; acontecimento vira anotação", () => {
    expect(ehPergunta("e oque entrou nas contas destes pedidos")).toBe(true);
    expect(ehPergunta("Quanto vendi de pás em setembro")).toBe(true);
    expect(ehPergunta("tem cliente sem pagar")).toBe(true);
    expect(ehPergunta("clientes que não compram desde abril?")).toBe(true);
    expect(ehPergunta("A cliente Maria pagou a vídeo chamada")).toBe(false);
    expect(ehPergunta("A Braspress coletou a máquina do pedido 1520")).toBe(false);
  });
});
