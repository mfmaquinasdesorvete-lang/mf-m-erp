import { describe, expect, it } from "vitest";
import {
  atrasada, ganhoRapido, indicadoresHandoff, indicadoresIdeias, ordenarIdeias, ordenarPendencias, proximosPassos, rotuloSituacao,
  textoHandoff, type ItemProjeto,
} from "../projeto";

const HOJE = "2026-10-16";
let n = 0;
const item = (x: Partial<ItemProjeto>): ItemProjeto => ({
  id: `i${++n}`, tipo: "pendencia", titulo: "Item", detalhe: null, area: "geral", responsavel: "empresa", prioridade: "media", esforco: null,
  situacao: "aberta", prazo: null, motivo: null, votos: [], criado_por: null, criado_nome: "Claude", concluido_em: null,
  atualizado_em: "2026-10-16T10:00:00Z", created_at: "2026-10-16T10:00:00Z", ...x,
});

describe("pendências do handoff", () => {
  it("rótulos por tipo e atraso só para pendência ativa com prazo vencido", () => {
    expect(rotuloSituacao("pendencia", "aberta")).toBe("A fazer");
    expect(rotuloSituacao("ideia", "aberta")).toBe("Nova");
    expect(rotuloSituacao("decisao", "descartada")).toBe("Revogada");
    expect(atrasada(item({ prazo: "2026-10-15" }), HOJE)).toBe(true);
    expect(atrasada(item({ prazo: "2026-10-15", situacao: "feita" }), HOJE)).toBe(false);
    expect(atrasada(item({ prazo: HOJE }), HOJE)).toBe(false);
  });

  it("ordem de fazer: atrasada, prioridade, fazendo, prazo; aguardando depois; feitas no fim, as mais recentes primeiro", () => {
    const l = [
      item({ titulo: "feita antiga", situacao: "feita", concluido_em: "2026-10-10T10:00:00Z" }),
      item({ titulo: "baixa", prioridade: "baixa" }),
      item({ titulo: "aguardando alta", prioridade: "alta", situacao: "aguardando", motivo: "o contador" }),
      item({ titulo: "alta", prioridade: "alta" }),
      item({ titulo: "atrasada baixa", prioridade: "baixa", prazo: "2026-10-01" }),
      item({ titulo: "alta fazendo", prioridade: "alta", situacao: "andamento" }),
      item({ titulo: "feita nova", situacao: "feita", concluido_em: "2026-10-15T10:00:00Z" }),
    ];
    expect(ordenarPendencias(l, HOJE).map((i) => i.titulo)).toEqual([
      "atrasada baixa", "alta fazendo", "alta", "baixa", "aguardando alta", "feita nova", "feita antiga",
    ]);
    expect(proximosPassos(l, HOJE, 3).map((i) => i.titulo)).toEqual(["atrasada baixa", "alta fazendo", "alta"]);
  });

  it("indicadores: abertas, alta, atrasadas, por responsável e feitas na semana", () => {
    const l = [
      item({ prioridade: "alta" }), item({ responsavel: "claude", situacao: "andamento" }),
      item({ responsavel: "contador", situacao: "aguardando", prazo: "2026-10-01" }), item({ responsavel: "advogado" }),
      item({ situacao: "feita", concluido_em: "2026-10-12T10:00:00Z" }), item({ situacao: "feita", concluido_em: "2026-09-01T10:00:00Z" }),
      item({ tipo: "decisao", responsavel: null, situacao: "feita" }), item({ tipo: "ideia", responsavel: null }),
    ];
    expect(indicadoresHandoff(l, HOJE)).toMatchObject({
      abertas: 4, fazendo: 1, aguardando: 1, alta: 1, atrasadas: 1, terceiros: 2, feitasSemana: 1, decisoes: 1, ideiasNovas: 1,
      porResponsavel: { empresa: 1, claude: 1, contador: 1, advogado: 1, fornecedor: 0 },
    });
  });
});

describe("ideias", () => {
  const ideia = (x: Partial<ItemProjeto>) => item({ tipo: "ideia", responsavel: null, ...x });
  it("ordena por votos, por ganho rápido ou pelas mais recentes", () => {
    const a = ideia({ titulo: "A", votos: ["u1"], prioridade: "baixa", created_at: "2026-10-01T00:00:00Z" });
    const b = ideia({ titulo: "B", votos: ["u1", "u2"], prioridade: "media", esforco: "grande", created_at: "2026-10-02T00:00:00Z" });
    const c = ideia({ titulo: "C", prioridade: "alta", esforco: "pequeno", created_at: "2026-10-03T00:00:00Z" });
    expect(ordenarIdeias([a, b, c], "votos").map((i) => i.titulo)).toEqual(["B", "A", "C"]);
    expect(ordenarIdeias([a, b, c], "ganho").map((i) => i.titulo)).toEqual(["C", "B", "A"]); // empate: o maior impacto antes
    expect(ordenarIdeias([a, b, c], "recentes").map((i) => i.titulo)).toEqual(["C", "B", "A"]);
    expect([a, b, c].map(ganhoRapido)).toEqual([false, false, true]);
    expect(indicadoresIdeias([a, b, c, ideia({ situacao: "descartada" })])).toMatchObject({ ativas: 3, novas: 3, descartadas: 1, ganhoRapido: 1, maisVotada: b });
  });
});

it("texto do handoff: situação, próximos passos, pendências por responsável, decisões e ideias", () => {
  const t = textoHandoff([
    item({ titulo: "Rodar o Action", prioridade: "alta", prazo: "2026-10-10" }),
    item({ titulo: "Responder perguntas", responsavel: "contador", situacao: "aguardando", motivo: "respostas do contador" }),
    item({ tipo: "decisao", responsavel: null, situacao: "feita", titulo: "Venda não é NF" }),
    item({ tipo: "ideia", responsavel: null, titulo: "App dos técnicos", votos: ["u1"] }),
  ], HOJE, { numero: "1.9.26", hash: "abc1234" });
  expect(t).toContain("Handoff do ERP Line · 16/10/2026");
  expect(t).toContain("Versão 1.9.26 (código abc1234)");
  expect(t).toContain("Situação: 2 pendências abertas (1 de alta prioridade, 1 atrasadas, 1 aguardando).");
  expect(t).toContain("1. Rodar o Action (Empresa, alta)");
  expect(t).toContain("Com a empresa (1)\n- [Alta] Rodar o Action (prazo 10/10) — ATRASADA");
  expect(t).toContain("Com o contador (1)\n- [Média] Responder perguntas — aguardando respostas do contador");
  expect(t).toContain("Decisões em vigor\n- Venda não é NF");
  expect(t).toContain("Ideias em aberto\n- App dos técnicos (1 voto)");
  expect(t).not.toMatch(/\n\n\n/);
});
