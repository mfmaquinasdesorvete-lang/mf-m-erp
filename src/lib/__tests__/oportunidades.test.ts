import { describe, expect, it } from "vitest";
import { caminho, metricasOp, situacaoOp, type EventoOp, type Oportunidade } from "../oportunidades";

const D = 86_400_000;
const T0 = new Date("2026-10-01T12:00:00Z").getTime();
const iso = (dia: number) => new Date(T0 + dia * D).toISOString();

const op = (id: string, etapa: Oportunidade["etapa"], extra: Partial<Oportunidade> = {}): Oportunidade => ({
  id, numero: 1, titulo: "t", cliente_id: null, contato_nome: "c", contato_whatsapp: null, contato_email: null,
  etapa, etapa_desde: iso(0), valor: null, vendedor_id: null, marcadores: [], origem: null, previsao: null,
  motivo_perda: null, pedido_id: null, fechada_em: null, created_at: iso(0), excluida_em: null, ...extra,
});
const ev = (opId: string, para: Oportunidade["etapa"], dia: number, tipo: EventoOp["tipo"] = "etapa"): EventoOp =>
  ({ id: `${opId}${para}${dia}`, oportunidade_id: opId, tipo, de: null, para, texto: null, por_nome: null, criado_em: iso(dia) });

describe("oportunidades: o que pede ação", () => {
  it("novo contato parado 1 dia já avisa; 3 dias é urgente", () => {
    expect(situacaoOp({ etapa: "novo", etapa_desde: iso(0) }, T0 + 0.5 * D).nivel).toBe(0);
    expect(situacaoOp({ etapa: "novo", etapa_desde: iso(0) }, T0 + 1 * D)).toMatchObject({ nivel: 1, alerta: "sem primeiro contato" });
    expect(situacaoOp({ etapa: "novo", etapa_desde: iso(0) }, T0 + 3 * D).nivel).toBe(2);
  });
  it("proposta sem resposta: aviso em 5 dias, urgente em 10; ganho e perdido não pedem nada", () => {
    expect(situacaoOp({ etapa: "proposta", etapa_desde: iso(0) }, T0 + 4 * D).nivel).toBe(0);
    expect(situacaoOp({ etapa: "proposta", etapa_desde: iso(0) }, T0 + 5 * D)).toMatchObject({ nivel: 1, alerta: "proposta sem resposta" });
    expect(situacaoOp({ etapa: "proposta", etapa_desde: iso(0) }, T0 + 10 * D).nivel).toBe(2);
    expect(situacaoOp({ etapa: "ganho", etapa_desde: iso(0) }, T0 + 99 * D).nivel).toBe(0);
  });
});

describe("oportunidades: caminho e tempo em cada etapa", () => {
  it("soma o tempo em cada etapa pelo histórico; a etapa aberta conta até agora", () => {
    const o = op("a", "proposta");
    const c = caminho(o, [ev("a", "novo", 0, "criada"), ev("a", "conversa", 2), ev("a", "proposta", 5)], T0 + 8 * D);
    expect([...c.passou]).toEqual(["novo", "conversa", "proposta"]);
    expect(c.tempo.get("novo")).toBe(2 * D);
    expect(c.tempo.get("conversa")).toBe(3 * D);
    expect(c.tempo.get("proposta")).toBe(3 * D);
  });
});

describe("oportunidades: métricas", () => {
  const ops = [
    op("a", "ganho", { vendedor_id: "v1", valor: 1000, fechada_em: iso(10) }),
    op("b", "perdido", { vendedor_id: "v1", valor: 500, motivo_perda: "Preço", fechada_em: iso(6) }),
    op("c", "proposta", { vendedor_id: "v2", valor: 2000 }),
    op("d", "novo", { vendedor_id: "v2", valor: 300 }),
  ];
  const eventos = [
    ev("a", "novo", 0, "criada"), ev("a", "conversa", 1), ev("a", "proposta", 3), ev("a", "ganho", 10),
    ev("b", "novo", 0, "criada"), ev("b", "conversa", 2), ev("b", "perdido", 6),
    ev("c", "proposta", 0, "criada"),
    ev("d", "novo", 0, "criada"),
  ];
  const m = metricasOp(ops, eventos, (id) => (id === "v1" ? "Ana" : id === "v2" ? "Bia" : "Sem responsável"), T0 + 12 * D);

  it("taxa de ganho, valor ganho e valor no funil", () => {
    expect(m.ganhas).toBe(1);
    expect(m.perdidas).toBe(1);
    expect(m.taxaGanho).toBe(50);
    expect(m.valorGanho).toBe(1000);
    expect(m.valorFunil).toBe(2300);
    expect(m.diasAteFechar).toBe(8);
  });

  it("conversão de uma etapa para a seguinte (quem pulou etapa conta como tendo passado por ela)", () => {
    const [novoConversa, conversaProposta, propostaGanho] = m.conversao;
    expect(novoConversa).toMatchObject({ chegaram: 4, seguiram: 3 });
    expect(conversaProposta).toMatchObject({ chegaram: 3, seguiram: 2 });
    expect(propostaGanho).toMatchObject({ chegaram: 2, seguiram: 1, taxa: 50 });
  });

  it("por vendedor e motivos de perda", () => {
    expect(m.porVendedor[0]).toMatchObject({ vendedor: "Ana", total: 2, ganhas: 1, perdidas: 1, taxa: 50, valorGanho: 1000 });
    expect(m.porVendedor[1]).toMatchObject({ vendedor: "Bia", total: 2, abertas: 2, taxa: null });
    expect(m.motivos).toEqual([{ motivo: "Preço", quantidade: 1 }]);
  });

  it("tempo médio em cada etapa aberta", () => {
    const novo = m.tempoMedio.find((t) => t.etapa === "novo")!;
    // a: 1 dia, b: 2 dias, d: 12 dias (ainda lá) → média 5
    expect(novo).toMatchObject({ oportunidades: 3, dias: 5 });
  });
});
