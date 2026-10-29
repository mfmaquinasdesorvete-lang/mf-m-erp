import { describe, expect, it } from "vitest";
import { chavePessoa, pessoaDoRecibo, recibosPorPessoa } from "../recibosPorPessoa";

const r = (nome: string, valor: number, data: string, cancelado_em: string | null = null) =>
  ({ tipo: "pagamento", recebedor_nome: nome, pagador_nome: "Empresa Exemplo", valor, data_pagamento: data, cancelado_em });

describe("recibos por pessoa", () => {
  it("junta a mesma pessoa (com ou sem acento), soma sem os cancelados e põe o mais recente primeiro", () => {
    const g = recibosPorPessoa([
      r("José Exemplo", 100.1, "2026-01-10"), r("jose exemplo ", 200.2, "2026-03-05"), r("José Exemplo", 50, "2026-02-01", "2026-02-02"),
      r("Ana Teste", 10, "2026-04-01"),
    ]);
    expect(g.map((x) => [x.nome, x.qtd, x.total, x.ultimo])).toEqual([
      ["Ana Teste", 1, 10, "2026-04-01"], ["José Exemplo", 3, 300.3, "2026-03-05"],
    ]);
  });
  it("no recebimento a pessoa é quem pagou", () => {
    expect(pessoaDoRecibo({ ...r("Empresa Exemplo", 1, "2026-01-01"), tipo: "recebimento", pagador_nome: "Ana Teste" })).toBe("Ana Teste");
    expect(chavePessoa("Ána  Teste")).toBe(chavePessoa("ana teste"));
  });
});
