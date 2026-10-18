import { describe, expect, it } from "vitest";
import {
  acimaDaCapacidade, burndown, diasDaSprint, diasRestantes, iniciais, moverNoBacklog, ordenarBacklog, pontosPorPessoa, proximaSprint,
  resumoDaily, ritmoSprint, sprintsParaBacklog, velocidade, type Daily, type ItemScrum, type Sprint,
} from "../scrum";

const sprint = (p: Partial<Sprint> = {}): Sprint => ({
  id: "s1", time_id: "t1", numero: 1, objetivo: null, inicio: "2026-10-05", fim: "2026-10-16", status: "ativa",
  pontos_planejados: 20, pontos_feitos: null, revisao: null, retro_bom: null, retro_melhorar: null, retro_acoes: null, encerrada_em: null, ...p,
});
const item = (p: Partial<ItemScrum> = {}): ItemScrum => ({
  id: "i", time_id: "t1", sprint_id: "s1", tipo: "historia", titulo: "Item", descricao: null, criterio_aceite: null, pontos: 5,
  prioridade: 10, status: "a_fazer", responsavel_id: null, ideia_id: null, created_by: null, concluido_em: null, created_at: "2026-10-01T10:00:00Z", ...p,
});

describe("dias da sprint", () => {
  it("conta só os dias úteis", () => {
    // 05/10/2026 é segunda; duas semanas = 10 dias úteis
    expect(diasDaSprint("2026-10-05", "2026-10-18")).toHaveLength(10);
    expect(diasDaSprint("2026-10-05", "2026-10-18")).not.toContain("2026-10-10");
  });
  it("sprint só de fim de semana usa os dias corridos", () => {
    expect(diasDaSprint("2026-10-10", "2026-10-11")).toEqual(["2026-10-10", "2026-10-11"]);
  });
  it("dias restantes contam hoje e param no fim", () => {
    const s = sprint();
    expect(diasRestantes(s, "2026-10-15")).toBe(2);
    expect(diasRestantes(s, "2026-10-20")).toBe(0);
    expect(diasRestantes(s, "2026-10-01")).toBe(10);
    // sábado e domingo depois do último dia útil: nada a fazer
    expect(diasRestantes(sprint({ inicio: "2026-10-12", fim: "2026-10-18" }), "2026-10-17")).toBe(0);
  });
});

describe("burndown", () => {
  it("linha ideal vai dos pontos do início a zero e a real desce com o que foi feito", () => {
    const itens = [
      item({ id: "a", pontos: 8, status: "feito", concluido_em: "2026-10-06T15:00:00Z" }),
      item({ id: "b", pontos: 12 }),
    ];
    const b = burndown(sprint(), itens, "2026-10-07");
    expect(b.dias).toHaveLength(10);
    expect(b.ideal[0]).toBe(20);
    expect(b.ideal[9]).toBe(0);
    expect(b.real.slice(0, 4)).toEqual([20, 12, 12, null]);
  });
  it("conclusão de madrugada conta no dia de Brasília", () => {
    // 01:00 UTC de 07/10 = 22:00 de 06/10 em Brasília
    const b = burndown(sprint(), [item({ pontos: 20, status: "feito", concluido_em: "2026-10-07T01:00:00Z" })], "2026-10-07");
    expect(b.real[1]).toBe(0);
  });
  it("sprint encerrada parte dos pontos planejados (o que não terminou voltou ao backlog)", () => {
    const s = sprint({ status: "encerrada", pontos_planejados: 20, pontos_feitos: 8 });
    const b = burndown(s, [item({ pontos: 8, status: "feito", concluido_em: "2026-10-08T15:00:00Z" })], "2026-10-30");
    expect(b.real[9]).toBe(12);
  });
});

describe("ritmo, velocidade e capacidade", () => {
  it("ritmo compara o feito com o tempo que passou", () => {
    const itens = [item({ id: "a", pontos: 2, status: "feito" }), item({ id: "b", pontos: 18 })];
    expect(ritmoSprint(sprint(), itens, "2026-10-12").situacao).toBe("atrasada");
    expect(ritmoSprint(sprint(), itens, "2026-10-05").situacao).toBe("no_ritmo");
    expect(ritmoSprint(sprint(), [], "2026-10-12").situacao).toBe("sem_pontos");
  });
  it("velocidade é a média das últimas 3 encerradas", () => {
    const ss = [
      sprint({ id: "1", numero: 1, status: "encerrada", pontos_planejados: 10, pontos_feitos: 100 }),
      sprint({ id: "2", numero: 2, status: "encerrada", pontos_planejados: 20, pontos_feitos: 10 }),
      sprint({ id: "3", numero: 3, status: "encerrada", pontos_planejados: 20, pontos_feitos: 20 }),
      sprint({ id: "4", numero: 4, status: "encerrada", pontos_planejados: 20, pontos_feitos: 15 }),
      sprint({ id: "5", numero: 5, status: "ativa" }),
    ];
    const v = velocidade(ss);
    expect(v.media).toBe(15);
    expect(v.entrega).toBeCloseTo(45 / 60);
    expect(v.historico.map((s) => s.numero)).toEqual([1, 2, 3, 4]);
    expect(velocidade([]).media).toBeNull();
  });
  it("backlog em sprints e alerta de capacidade", () => {
    expect(sprintsParaBacklog(40, 15)).toBe(3);
    expect(sprintsParaBacklog(40, null)).toBeNull();
    expect(acimaDaCapacidade(19, 15)).toBe(true);
    expect(acimaDaCapacidade(18, 15)).toBe(false);
    expect(acimaDaCapacidade(50, null)).toBe(false);
  });
});

describe("próxima sprint", () => {
  it("começa no dia depois da última ou hoje", () => {
    const t = { sprint_dias: 14 };
    expect(proximaSprint(t, [], "2026-10-19")).toEqual({ numero: 1, inicio: "2026-10-19", fim: "2026-11-01" });
    expect(proximaSprint(t, [sprint({ numero: 3, fim: "2026-10-25" })], "2026-10-19")).toEqual({ numero: 4, inicio: "2026-10-26", fim: "2026-11-08" });
    expect(proximaSprint({ sprint_dias: 7 }, [sprint({ numero: 1, fim: "2026-10-01" })], "2026-10-19").inicio).toBe("2026-10-19");
  });
});

describe("backlog", () => {
  const lista = [item({ id: "a", prioridade: 10 }), item({ id: "b", prioridade: 10, created_at: "2026-10-02T00:00:00Z" }), item({ id: "c", prioridade: 30 })];
  it("ordena pela prioridade e, no empate, pelo mais antigo", () => {
    expect(ordenarBacklog(lista).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
  it("subir troca com o de cima e devolve só o que muda", () => {
    expect(moverNoBacklog(lista, "c", -1)).toEqual([{ id: "c", prioridade: 20 }, { id: "b", prioridade: 30 }]);
    expect(moverNoBacklog(lista, "a", -1)).toEqual([]);
    expect(moverNoBacklog(lista, "c", 1)).toEqual([]);
  });
});

describe("daily e pessoas", () => {
  const d = (p: Partial<Daily>): Daily => ({ id: "d", sprint_id: "s1", user_id: "u1", nome: null, dia: "2026-10-06", fiz: null, vou_fazer: null, impedimentos: null, impedimento_resolvido: false, ...p });
  it("quem falta e impedimentos abertos", () => {
    const r = resumoDaily([d({ user_id: "u1", impedimentos: "sem acesso" }), d({ id: "2", user_id: "u2", dia: "2026-10-05", impedimentos: "x", impedimento_resolvido: true })], ["u1", "u2", "u3"], "2026-10-06");
    expect(r.doDia).toHaveLength(1);
    expect(r.faltam).toEqual(["u2", "u3"]);
    expect(r.impedimentos.map((x) => x.impedimentos)).toEqual(["sem acesso"]);
  });
  it("pontos por pessoa", () => {
    const p = pontosPorPessoa([item({ responsavel_id: "u1", pontos: 3, status: "feito" }), item({ responsavel_id: "u1", pontos: 5 }), item({ pontos: 2 })]);
    expect(p).toEqual([{ id: "u1", feito: 3, aberto: 5 }, { id: "", feito: 0, aberto: 2 }]);
  });
  it("iniciais", () => {
    expect(iniciais("Maria da Silva")).toBe("MD");
    expect(iniciais("")).toBe("?");
  });
});
