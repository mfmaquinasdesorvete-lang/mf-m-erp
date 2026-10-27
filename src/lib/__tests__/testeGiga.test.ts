import { describe, expect, it } from "vitest";
import {
  agrupar, aguardandoReteste, avisoConclusaoOp, dataHoraBR, diaBrasil, divergencias, falhas, filtrarTestes, fmtNum, historicoPorNs, lerNumero,
  linhaReg006, mesesAte, normalizarNs, nsDaOp, nsSemAprovacao, parametrosDoModelo, planilhaTestes, primeiraPassagem, primeirosTestes,
  reprovacoesPorTipo, resultadoGeral, seloGiga, serieMensal, sugerirAterramento, sugerirTensao, PARAMETROS_VAZIOS,
  type Parametros, type SituacaoNs, type TesteGiga,
} from "../testeGiga";
import { pode, podeVer } from "../permissoes";
import { TEXTOS_PADRAO, textoPadrao } from "../textosPadrao";

// dados inventados
let seq = 0;
const teste = (x: Partial<TesteGiga>): TesteGiga => ({
  id: `t${++seq}`, numero: seq, testado_em: "2026-10-10T13:00:00Z", produto_id: "mA", numero_serie: "NS-1", operador_nome: "Operador Um",
  funcional: "aprovado", aterramento: "aprovado", tensao: "aprovado", ...x,
});
const limites: Parametros = { ...PARAMETROS_VAZIOS, aterramento_resistencia_max_ohm: 0.1, aterramento_corrente_a: 10, tensao_v: 1000, tensao_tempo_s: 1, tensao_fuga_max_ma: 5 };

describe("resultado geral", () => {
  it("aprovada só com os três aprovados", () => {
    expect(resultadoGeral({ funcional: "aprovado", aterramento: "aprovado", tensao: "aprovado" })).toBe("aprovada");
    expect(resultadoGeral({ funcional: "aprovado", aterramento: "reprovado", tensao: "aprovado" })).toBe("reprovada");
    expect(resultadoGeral({ funcional: "reprovado", aterramento: "reprovado", tensao: "reprovado" })).toBe("reprovada");
  });
  it("fica em aberto enquanto falta marcar", () => {
    expect(resultadoGeral({ funcional: "aprovado", aterramento: "aprovado" })).toBeNull();
    expect(resultadoGeral({})).toBeNull();
  });
  it("lista os testes reprovados na ordem do formulário", () => {
    expect(falhas({ funcional: "reprovado", aterramento: "aprovado", tensao: "reprovado" })).toEqual(["funcional", "tensao"]);
    expect(falhas({ funcional: "aprovado", aterramento: "aprovado", tensao: "aprovado" })).toEqual([]);
  });
});

describe("números digitados", () => {
  it("vírgula, ponto e milhar", () => {
    expect(lerNumero("0,08")).toBe(0.08);
    expect(lerNumero("0.08")).toBe(0.08);
    expect(lerNumero("0.080")).toBe(0.08);
    expect(lerNumero("1.250")).toBe(1250);
    expect(lerNumero("1.250,5")).toBe(1250.5);
    expect(lerNumero("1.5")).toBe(1.5);
    expect(lerNumero(" 10 ")).toBe(10);
    expect(lerNumero(3)).toBe(3);
  });
  it("vazio é nulo e texto inválido é NaN", () => {
    expect(lerNumero("")).toBeNull();
    expect(lerNumero(null)).toBeNull();
    expect(lerNumero("abc")).toBeNaN();
    expect(lerNumero("-1")).toBeNaN();
  });
  it("escreve no jeito brasileiro", () => {
    expect(fmtNum(0.08)).toBe("0,08");
    expect(fmtNum(1250)).toBe("1.250");
    expect(fmtNum(null)).toBe("");
  });
});

describe("limites por modelo", () => {
  const lista = [
    { produto_id: null, aterramento_resistencia_max_ohm: 0.1, tensao_fuga_max_ma: 5 },
    { produto_id: "mA", tensao_fuga_max_ma: 3 },
    { produto_id: "mB", tensao_fuga_max_ma: 2, ativo: false },
  ];
  it("o do modelo vale; o que falta vem do padrão geral", () => {
    const p = parametrosDoModelo(lista, "mA");
    expect(p.valores.tensao_fuga_max_ma).toBe(3);
    expect(p.valores.aterramento_resistencia_max_ohm).toBe(0.1);
    expect(p.origem.tensao_fuga_max_ma).toBe("modelo");
    expect(p.origem.aterramento_resistencia_max_ohm).toBe("geral");
    expect(p.origem.tensao_v).toBeNull();
    expect(p.temAlgum).toBe(true);
  });
  it("modelo desativado volta ao padrão geral", () => {
    expect(parametrosDoModelo(lista, "mB").valores.tensao_fuga_max_ma).toBe(5);
  });
  it("sem cadastro: tudo vazio", () => {
    expect(parametrosDoModelo([], "mA").temAlgum).toBe(false);
  });
});

describe("sugestão pelo limite", () => {
  it("aterramento: aprovado até a resistência máxima", () => {
    expect(sugerirAterramento(0.08, 10, limites).sugestao).toBe("aprovado");
    expect(sugerirAterramento(0.1, 10, limites).sugestao).toBe("aprovado");
    const r = sugerirAterramento(0.15, 10, limites);
    expect(r.sugestao).toBe("reprovado");
    expect(r.motivo).toBe("0,15 Ω > limite de 0,1 Ω");
  });
  it("aterramento: corrente abaixo da de teste vira alerta", () => {
    expect(sugerirAterramento(0.05, 5, limites).alertas).toEqual(["Corrente de 5 A abaixo da corrente de teste (10 A)"]);
  });
  it("sem medida ou sem limite: não sugere", () => {
    expect(sugerirAterramento(null, null, limites).sugestao).toBeNull();
    expect(sugerirAterramento(0.5, null, PARAMETROS_VAZIOS).sugestao).toBeNull();
    expect(sugerirTensao(1000, 1, null, limites).sugestao).toBeNull();
  });
  it("tensão: aprovado até a corrente de fuga máxima; tensão e tempo curtos viram alerta", () => {
    expect(sugerirTensao(1000, 1, 0.8, limites).sugestao).toBe("aprovado");
    expect(sugerirTensao(1000, 1, 6, limites).sugestao).toBe("reprovado");
    expect(sugerirTensao(900, 0.5, 1, limites).alertas).toHaveLength(2);
  });
  it("medida fora do limite marcada como aprovada", () => {
    expect(divergencias({ aterramento: "aprovado", aterramento_resistencia_ohm: 0.2, tensao: "aprovado", tensao_fuga_ma: 4.5 }, { ...limites, tensao_fuga_max_ma: 3 })).toEqual([
      "Continuidade do aterramento aprovada com 0,2 Ω (limite 0,1 Ω)",
      "Tensão suportável aprovada com fuga de 4,5 mA (limite 3 mA)",
    ]);
    expect(divergencias({ aterramento: "reprovado", aterramento_resistencia_ohm: 0.2 }, limites)).toEqual([]);
    expect(divergencias({ aterramento: "aprovado", aterramento_resistencia_ohm: 0.05 }, limites)).toEqual([]);
  });
});

describe("número de série", () => {
  it("normaliza como o banco", () => {
    expect(normalizarNs("  ab-12  3 ")).toBe("AB-12 3");
    expect(normalizarNs(null)).toBe("");
  });
  it("lê os NS da OP sem repetir", () => {
    expect(nsDaOp("t-1, T-2; t-3\nT-1")).toEqual(["T-1", "T-2", "T-3"]);
    expect(nsDaOp(null)).toEqual([]);
  });
});

describe("datas no horário de Brasília", () => {
  it("noite no Brasil ainda é o mesmo dia", () => {
    expect(diaBrasil("2026-10-16T01:30:00Z")).toBe("2026-10-15");
    expect(diaBrasil("2026-10-16T03:00:00Z")).toBe("2026-10-16");
    expect(diaBrasil("2026-10-16")).toBe("2026-10-16");
    expect(dataHoraBR("2026-10-16T17:05:00Z")).toBe("16/10/2026 14:05");
  });
  it("meses até o atual", () => {
    expect(mesesAte("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});

describe("primeira passagem, retestes e agrupamentos", () => {
  // NS-1: reprovado e aprovado no reteste · NS-2: aprovado de primeira · NS-3: reprovado (aguarda) · NS-4: anulado
  const t1 = teste({ numero_serie: "NS-1", aterramento: "reprovado", testado_em: "2026-09-30T13:00:00Z", operador_nome: "Operador Um" });
  const t2 = teste({ numero_serie: "NS-1", testado_em: "2026-10-02T13:00:00Z", tentativa: 2, reteste_de: t1.id, operador_nome: "Operador Dois" });
  const t3 = teste({ numero_serie: "ns-2", produto_id: "mB", testado_em: "2026-10-05T13:00:00Z" });
  const t4 = teste({ numero_serie: "NS-3", tensao: "reprovado", funcional: "reprovado", testado_em: "2026-10-06T13:00:00Z", operador_nome: "Operador Dois" });
  const t5 = teste({ numero_serie: "NS-4", aterramento: "reprovado", testado_em: "2026-10-07T13:00:00Z", anulado_em: "2026-10-07T14:00:00Z", anulado_motivo: "lançado errado" });
  const todos = [t5, t4, t3, t2, t1];

  it("histórico por NS ignora os anulados e põe em ordem", () => {
    const h = historicoPorNs(todos);
    expect([...h.keys()].sort()).toEqual(["NS-1", "NS-2", "NS-3"]);
    expect(h.get("NS-1")!.map((t) => t.id)).toEqual([t1.id, t2.id]);
  });
  it("aprovadas de primeira no período", () => {
    expect(primeiraPassagem(todos)).toEqual({ maquinas: 3, dePrimeira: 1, pct: (1 / 3) * 100 });
    // em outubro só entram NS-2 e NS-3 (o primeiro teste do NS-1 foi em setembro)
    expect(primeiraPassagem(todos, ["2026-10-01", "2026-10-31"])).toEqual({ maquinas: 2, dePrimeira: 1, pct: 50 });
    expect(primeiraPassagem([], ["2026-10-01", "2026-10-31"]).pct).toBeNull();
  });
  it("máquinas aguardando reteste", () => {
    const a = aguardandoReteste(todos);
    expect(a.map((s) => s.ns)).toEqual(["NS-3"]);
    expect(a[0].tentativas).toBe(1);
  });
  it("reprovações por tipo de teste", () => {
    expect(reprovacoesPorTipo(todos)).toEqual({ funcional: 1, aterramento: 1, tensao: 1 });
  });
  it("aprovadas × reprovadas por mês", () => {
    expect(serieMensal(todos, ["2026-09", "2026-10"])).toEqual([
      { mes: "2026-09", aprovadas: 0, reprovadas: 1 },
      { mes: "2026-10", aprovadas: 2, reprovadas: 1 },
    ]);
  });
  it("por modelo e por operador, com a aprovação de primeira do grupo", () => {
    const prim = primeirosTestes(todos);
    const modelos = agrupar(todos, (t) => t.produto_id, (k) => (k === "mA" ? "Modelo A" : "Modelo B"), prim);
    expect(modelos[0]).toMatchObject({ chave: "mA", testes: 3, aprovadas: 1, reprovadas: 2, maquinas: 2, primeiros: 2, dePrimeira: 0, fpy: 0 });
    expect(modelos[1]).toMatchObject({ chave: "mB", testes: 1, fpy: 100 });
    const ops = agrupar(todos, (t) => t.operador_nome, (k) => k, prim);
    const dois = ops.find((g) => g.chave === "Operador Dois")!;
    // o reteste do Operador Dois não entra na aprovação de primeira
    expect(dois).toMatchObject({ testes: 2, primeiros: 1, dePrimeira: 0, fpy: 0 });
  });
  it("filtros da lista", () => {
    expect(filtrarTestes(todos, {}).map((t) => t.id)).toEqual([t4.id, t3.id, t2.id, t1.id]);
    expect(filtrarTestes(todos, { anulados: true })).toHaveLength(5);
    expect(filtrarTestes(todos, { de: "2026-10-01", ate: "2026-10-05" }).map((t) => t.id)).toEqual([t3.id, t2.id]);
    expect(filtrarTestes(todos, { ns: "ns-" })).toHaveLength(4);
    expect(filtrarTestes(todos, { resultado: "reprovada" }).map((t) => t.id)).toEqual([t4.id, t1.id]);
    expect(filtrarTestes(todos, { operador: "operador dois" })).toHaveLength(2);
    expect(filtrarTestes(todos, { produtoId: "mB" })).toEqual([t3]);
  });
});

describe("REG-006 e planilha", () => {
  const ant = teste({ numero: 7, numero_serie: "NS-9", aterramento: "reprovado" });
  const t = teste({
    numero: 8, numero_serie: "NS-9", testado_em: "2026-10-16T17:05:00Z", tentativa: 2, reteste_de: ant.id, giga: "G2",
    aterramento_resistencia_ohm: 0.05, aterramento_corrente_a: 10, tensao_aplicada_v: 1000, tensao_tempo_s: 1, tensao_fuga_ma: 0.8,
    observacoes: "Cabo trocado", divergencias: [], ordem_producao_id: "op1",
  });
  const numeroDe = (id: string) => (id === ant.id ? ant.numero : null);
  it("linha com as colunas do papel", () => {
    const l = linhaReg006(t, "Modelo A", numeroDe);
    expect(l).toMatchObject({
      data: "16/10/2026 14:05", maquina: "Modelo A", ns: "NS-9", operador: "Operador Um", funcional: "Aprovado",
      aterramento: "Aprovado\n0,05 Ω · 10 A", tensao: "Aprovado\n1.000 V · 1 s · 0,8 mA", reprovados: [], anulado: false,
    });
    expect(l.observacoes).toBe("Reteste (2ª tentativa, do nº 7) · Cabo trocado · Giga G2");
  });
  it("anulado aparece como anulado", () => {
    const l = linhaReg006({ ...ant, anulado_em: "2026-10-16T18:00:00Z", anulado_motivo: "NS errado" }, "Modelo A");
    expect(l.anulado).toBe(true);
    expect(l.observacoes).toBe("ANULADO: NS errado");
    expect(l.aterramento).toBe("Reprovado");
    expect(l.reprovados).toEqual(["aterramento"]);
  });
  it("planilha com todos os campos", () => {
    const [p] = planilhaTestes([t], { maquina: () => "Modelo A", op: () => 101, numeroDe });
    expect(p).toMatchObject({ "Nº": 8, NS: "NS-9", OP: 101, "Resistência (Ω)": 0.05, Resultado: "Aprovada", Tentativa: 2, "Reteste do nº": 7, Giga: "G2" });
  });
  it("revisão do formulário editável nas configurações", () => {
    expect(TEXTOS_PADRAO.reg006_revisao).toBe("Revisão 00");
    expect(textoPadrao({ textos: { reg006_revisao: "Revisão 01" } }, "reg006_revisao")).toBe("Revisão 01");
    expect(textoPadrao(null, "reg006_revisao")).toBe("Revisão 00");
  });
});

describe("rastreabilidade", () => {
  const sit = (x: Partial<SituacaoNs>): SituacaoNs => ({
    numero_serie: "NS-1", testes: 1, ultimo_numero: 3, ultimo_em: "2026-10-16T17:05:00Z", ultimo_resultado: "aprovada", ultimo_operador: "Operador Um",
    ultimo_falhas: [], aprovado_numero: 3, aprovado_em: "2026-10-16T17:05:00Z", aprovado_operador: "Operador Um", ...x,
  });
  it("selo do teste do NS", () => {
    expect(seloGiga(sit({}))).toMatchObject({ tom: "aprovada", texto: "Giga aprovada em 16/10/2026" });
    const r = seloGiga(sit({ ultimo_resultado: "reprovada", ultimo_falhas: ["aterramento"], aprovado_numero: null, aprovado_em: null }));
    expect(r.tom).toBe("reprovada");
    expect(r.detalhe).toContain("reprovou em: Continuidade do aterramento");
    expect(seloGiga(sit({ testes: 0 })).tom).toBe("sem");
    expect(seloGiga(null).tom).toBe("sem");
  });
  it("aviso ao concluir a OP (não bloqueia)", () => {
    const s = [sit({ numero_serie: "NS-1" }), sit({ numero_serie: "NS-2", aprovado_numero: null })];
    expect(nsSemAprovacao(["ns-1", "NS-2", "NS-3"], s)).toEqual(["NS-2", "NS-3"]);
    expect(avisoConclusaoOp("NS-1, NS-2, NS-3", s)).toBe("2 máquinas estão sem teste do giga aprovado: NS-2, NS-3.");
    expect(avisoConclusaoOp("NS-1", s)).toBeNull();
    expect(avisoConclusaoOp("", s)).toContain("não tem número de série");
    // sem a situação (banco antigo): não avisa
    expect(avisoConclusaoOp("NS-9", null)).toBeNull();
  });
});

describe("permissões do teste do giga", () => {
  // desde 27/10 o técnico da equipe vê só as OS dele e o próprio cadastro; o teste é do papel "giga"
  it("lança: giga e administrador", () => {
    expect(pode("giga", "lancar_teste_giga")).toBe(true);
    expect(pode("admin", "lancar_teste_giga")).toBe(true);
    expect(pode("tecnico", "lancar_teste_giga")).toBe(false);
    expect(pode("financeiro", "lancar_teste_giga")).toBe(false);
    expect(pode("vendas", "lancar_teste_giga")).toBe(false);
  });
  it("vê o painel: giga e administrador (o financeiro vê só financeiro e o técnico só as OS dele, desde 27/10)", () => {
    expect(podeVer("giga", "testegiga")).toBe(true);
    expect(podeVer("admin", "testegiga")).toBe(true);
    for (const p of ["tecnico", "vendas", "financeiro", "contador", "expedicao", "marketplace"] as const) expect(podeVer(p, "testegiga")).toBe(false);
  });
});
