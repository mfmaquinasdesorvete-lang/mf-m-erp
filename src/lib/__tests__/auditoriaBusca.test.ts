import { describe, expect, it } from "vitest";
import {
  alvoDaLinha, camposAchados, casaBusca, consultaHistorico, descricaoLinha, destacar, FILTROS_EXCECOES, FILTROS_HISTORICO, faixaValor,
  filtrarExcecoes, filtrarHistorico, indexarHistorico, intervalo, lerConsulta, lerValor, mapaNomes, montarAlvo, normalizar,
  painelChecklist, painelExcecoes, painelHistorico, somarDiasData, somarMes, valoresDinheiro, type FiltrosHistorico, type LinhaHistorico,
} from "../auditoriaBusca";
import { ITENS_CHECKLIST } from "../checklistAuditoria";
import type { Excecao } from "../auditoria";

// meio-dia em UTC: cai no mesmo dia em qualquer fuso do Brasil (e do teste)
const em = (dia: string) => `${dia}T12:00:00Z`;
const HOJE = "2026-10-15";

let seq = 0;
const linha = (p: Partial<LinhaHistorico>): LinhaHistorico => ({
  id: ++seq, tabela: "contas_pagar", registro_id: `reg-${seq}`, acao: "update", usuario_nome: "Ana Souza", campos: null,
  antes: null, depois: null, motivo: null, origem: "usuario", created_at: em(HOJE), ...p,
});
const busca = (l: LinhaHistorico, q: string) => casaBusca(alvoDaLinha(l), lerConsulta(q));

describe("lerValor", () => {
  it("o mesmo número digitado de qualquer jeito", () => {
    for (const s of ["1.234,56", "1234,56", "1234.56", "R$ 1.234,56", "R$1.234,56", "r$ 1234,56", "1,234.56"]) expect(lerValor(s)).toBe(1234.56);
  });
  it("milhar com ponto, inteiro e negativo", () => {
    expect(lerValor("1.234")).toBe(1234);
    expect(lerValor("1.234.567")).toBe(1234567);
    expect(lerValor("12.345,6")).toBe(12345.6);
    expect(lerValor("1500")).toBe(1500);
    expect(lerValor("-50")).toBe(-50);
    expect(lerValor("1,5")).toBe(1.5);
    expect(lerValor("0.500")).toBe(0.5);
  });
  it("o que não é número devolve null", () => {
    for (const s of ["", "R$", "abc", "12.34.5", "123.456.789-09", "12/10"]) expect(lerValor(s)).toBeNull();
  });
});

describe("lerConsulta", () => {
  it("R$ sozinho some, valor vira decimal, documento guarda os dígitos", () => {
    const t = lerConsulta('R$ 1.234,56 Aluguel 12.345.678/0001-90 "nota fiscal" 15/10');
    expect(t.map((x) => x.tipo)).toEqual(["decimal", "texto", "numero", "texto", "data"]);
    expect(t[0].valor).toBe(1234.56);
    expect(t[1].texto).toBe("aluguel");
    expect(t[2].digitos).toBe("12345678000190");
    expect(t[3].texto).toBe("nota fiscal");
    expect(t[4].texto).toBe("15/10");
  });
  it("normaliza acento e maiúscula", () => {
    expect(normalizar("  Exclusão  ÁGUA ")).toBe("exclusao agua");
    expect(lerConsulta("CONCEIÇÃO")[0].texto).toBe("conceicao");
  });
});

describe("busca no histórico", () => {
  const aluguel = linha({
    usuario_nome: "José Conceição", campos: ["valor"], antes: { valor: 1200 }, depois: { valor: 1234.56 }, motivo: "Reajuste anual do contrato",
  });
  const fornecedor = linha({
    tabela: "fornecedores", acao: "delete", usuario_nome: "Bia", antes: { nome: "Refrigeração Exemplo Ltda", cnpj: "12.345.678/0001-90", telefone: "(16) 98888-7777" },
  });
  const cliente = linha({ tabela: "clientes", campos: ["cpf_cnpj"], antes: { cpf_cnpj: "12345678909" }, depois: { cpf_cnpj: "98765432100" } });

  it("ignora acento e maiúscula e acha em qualquer campo", () => {
    expect(busca(aluguel, "jose conceicao")).toBe(true);
    expect(busca(aluguel, "REAJUSTE")).toBe(true);
    expect(busca(aluguel, "conta a pagar")).toBe(true);
    expect(busca(aluguel, "alterou")).toBe(true);
    expect(busca(fornecedor, "excluiu refrigeracao")).toBe(true);
  });
  it("várias palavras: todas precisam aparecer", () => {
    expect(busca(aluguel, "reajuste jose")).toBe(true);
    expect(busca(aluguel, "reajuste maria")).toBe(false);
  });
  it("valor de qualquer jeito acha o mesmo número", () => {
    for (const q of ["1.234,56", "1234,56", "1234.56", "R$ 1.234,56", "1200"]) expect(busca(aluguel, q)).toBe(true);
    expect(busca(aluguel, "1.234,57")).toBe(false);
  });
  it("número curto não acha pedaço de outro número", () => {
    expect(busca(aluguel, "234")).toBe(false);
    expect(busca(aluguel, "120")).toBe(false);
  });
  it("CPF/CNPJ com ou sem pontos e traços, inteiro ou um pedaço", () => {
    expect(busca(fornecedor, "12345678000190")).toBe(true);
    expect(busca(fornecedor, "12.345.678/0001-90")).toBe(true);
    expect(busca(fornecedor, "12.345.678")).toBe(true);
    expect(busca(fornecedor, "0001-90")).toBe(true);
    expect(busca(cliente, "123.456.789-09")).toBe(true);
    expect(busca(cliente, "987.654.321-00")).toBe(true);
    expect(busca(cliente, "111.222.333-44")).toBe(false);
    expect(busca(fornecedor, "98888-7777")).toBe(true);
  });
  it("data digitada acha a data do registro", () => {
    expect(busca(aluguel, "15/10")).toBe(true);
    expect(busca(aluguel, "15/10/2026")).toBe(true);
    expect(busca(aluguel, "16/10")).toBe(false);
  });
  it("código interno (uuid) não entra na busca", () => {
    const l = linha({ registro_id: "0bad0f00-1234-4abc-8def-0123456789ab", depois: { fornecedor_id: "0bad0f00-1234-4abc-8def-0123456789ab" }, campos: ["fornecedor_id"] });
    expect(busca(l, "bad")).toBe(false);
  });
  it("acha pelo nome atual do registro quando a alteração não tem a descrição", () => {
    const l = linha({ registro_id: "cp1", campos: ["vencimento"], antes: { vencimento: "2026-10-01" }, depois: { vencimento: "2026-10-20" } });
    const nomes = mapaNomes({ pagar: [{ id: "cp1", descricao: "Aluguel do galpão", fornecedor_id: "f1" }], fornecedores: [{ id: "f1", nome: "Imobiliária Exemplo" }] });
    const o = { nomeRegistro: (t: string, id: string | null) => nomes.get(`${t}:${id}`) };
    expect(casaBusca(alvoDaLinha(l, o), lerConsulta("galpao imobiliaria"))).toBe(true);
    expect(descricaoLinha(l, o.nomeRegistro)).toBe("Aluguel do galpão · Imobiliária Exemplo");
  });
  it("mostra em que campo achou (criação e exclusão)", () => {
    expect(camposAchados(fornecedor.antes, lerConsulta("12345678000190"))).toEqual(["cnpj"]);
  });
});

describe("destaque do termo achado", () => {
  const marcado = (texto: string, q: string) => destacar(texto, lerConsulta(q)).filter((t) => t.achou).map((t) => t.texto);
  it("sem acento e mantendo o texto original", () => {
    expect(marcado("Alteração do vencimento", "alteracao")).toEqual(["Alteração"]);
  });
  it("valor e documento no formato da tela", () => {
    expect(marcado("valor: R$ 1.200,00 → R$ 1.234,56", "1234,56")).toEqual(["1.234,56"]);
    expect(marcado("CNPJ 12.345.678/0001-90", "12345678000190")).toEqual(["12.345.678/0001-90"]);
    expect(marcado("R$ 150,00 e R$ 50,00", "50")).toEqual(["50"]);
  });
  it("sem busca devolve o texto inteiro", () => {
    expect(destacar("abc", [])).toEqual([{ texto: "abc", achou: false }]);
  });
});

describe("filtros do histórico", () => {
  const ontem = somarDiasData(HOJE, -1);
  const linhas = [
    linha({ id: 1, created_at: em(HOJE), campos: ["valor"], antes: { valor: 100 }, depois: { valor: 5000 } }),
    linha({ id: 2, created_at: em(ontem), acao: "delete", tabela: "clientes", usuario_nome: null, antes: { nome: "Cliente Teste", valor: 0 } }),
    linha({ id: 3, created_at: em("2026-09-20"), acao: "insert", depois: { descricao: "Nova", valor: 300 } }),
    linha({ id: 4, created_at: em("2026-09-01"), campos: ["descricao"], antes: { descricao: "a" }, depois: { descricao: "b" } }),
  ];
  const itens = indexarHistorico(linhas);
  const ids = (f: Partial<FiltrosHistorico>) => filtrarHistorico(itens, { ...FILTROS_HISTORICO, ...f }, HOJE).map((x) => x.l.id);

  it("períodos de atalho", () => {
    expect(intervalo({ periodo: "7d", de: "", ate: "" }, HOJE)).toEqual({ de: "2026-10-09", ate: HOJE });
    expect(intervalo({ periodo: "mes_passado", de: "", ate: "" }, HOJE)).toEqual({ de: "2026-09-01", ate: "2026-09-30" });
    expect(intervalo({ periodo: "livre", de: "2026-10-10", ate: "2026-10-01" }, HOJE)).toEqual({ de: "2026-10-01", ate: "2026-10-10" });
    expect(ids({ periodo: "hoje" })).toEqual([1]);
    expect(ids({ periodo: "mes" })).toEqual([1, 2]);
    expect(ids({ periodo: "livre", de: "2026-09-01", ate: "2026-09-30", acao: "" })).toEqual([3, 4]);
  });
  it("ação, pessoa, área e faixa de valor", () => {
    expect(ids({ periodo: "30d", acao: "delete" })).toEqual([2]);
    expect(ids({ periodo: "30d", acao: "" })).toEqual([1, 2, 3]);
    expect(ids({ periodo: "30d", pessoa: "sistema" })).toEqual([2]);
    expect(ids({ periodo: "30d", tabela: "clientes" })).toEqual([2]);
    expect(ids({ periodo: "30d", acao: "", valorMin: "1.000", valorMax: "R$ 10.000,00" })).toEqual([1]);
    expect(ids({ periodo: "30d", acao: "", valorMax: "300" })).toEqual([1, 2, 3]);
    expect(faixaValor("5000", "100")).toEqual({ min: 100, max: 5000 });
  });
  it("linhas escolhidas no painel passam por cima dos outros filtros", () => {
    expect(ids({ periodo: "hoje", ids: [4] })).toEqual([4]);
  });
  it("valores em dinheiro só dos campos de dinheiro", () => {
    expect(valoresDinheiro({ antes: { valor: 10, parcelas: 3 }, depois: { preco_custo: "12.5", saldo_inicial_data: "2026-01-01" } })).toEqual([10, 12.5]);
  });
  it("até 30 dias usa a consulta do painel; fora disso, só o período", () => {
    const painel = { de: "2026-09-16", ate: "", acoes: ["update", "delete"] };
    expect(consultaHistorico({ ...FILTROS_HISTORICO, periodo: "7d" }, HOJE)).toEqual(painel);
    expect(consultaHistorico({ ...FILTROS_HISTORICO, periodo: "30d", acao: "delete" }, HOJE)).toEqual(painel);
    expect(consultaHistorico({ ...FILTROS_HISTORICO, periodo: "mes_passado" }, HOJE)).toEqual({ de: "2026-09-01", ate: "2026-09-30", acoes: ["update", "delete"] });
    expect(consultaHistorico({ ...FILTROS_HISTORICO, periodo: "hoje", acao: "insert" }, HOJE)).toEqual({ de: HOJE, ate: HOJE, acoes: ["insert"] });
  });
});

describe("painel do histórico", () => {
  const linhas = [
    linha({ created_at: em(HOJE), usuario_nome: "Ana", tabela: "contas_pagar", campos: ["valor"], antes: { valor: 6200 }, depois: { valor: 6500 } }),
    linha({ created_at: em(HOJE), usuario_nome: "Ana", tabela: "produtos", campos: ["preco_custo", "preco_venda"], antes: { preco_custo: 10, preco_venda: 20 }, depois: { preco_custo: 11, preco_venda: 900 } }),
    linha({ created_at: em(somarDiasData(HOJE, -3)), usuario_nome: "Bia", acao: "delete", tabela: "clientes", antes: { nome: "X" } }),
    linha({ created_at: em(somarDiasData(HOJE, -20)), usuario_nome: "Bia", tabela: "contas_receber", campos: ["valor_pago", "status"], antes: { valor_pago: null, status: "aberto" }, depois: { valor_pago: 999999, status: "pago" } }),
    linha({ created_at: em(somarDiasData(HOJE, -40)), usuario_nome: "Carlos" }),
    linha({ created_at: em(HOJE), acao: "insert", usuario_nome: "Davi" }),
  ];
  const p = painelHistorico(linhas, HOJE);
  it("conta 7 e 30 dias, só alterações e exclusões", () => {
    expect([p.hoje, p.ultimos7, p.ultimos30, p.exclusoes30]).toEqual([2, 3, 4, 1]);
    expect(p.porDia).toHaveLength(30);
    expect(p.porDia[29]).toEqual({ dia: HOJE, total: 2, exclusoes: 0 });
    expect(p.porDia.find((d) => d.dia === somarDiasData(HOJE, -3))).toEqual({ dia: somarDiasData(HOJE, -3), total: 1, exclusoes: 1 });
  });
  it("quem mais alterou e áreas mais alteradas", () => {
    expect(p.pessoas).toEqual([{ nome: "Ana", n: 2 }, { nome: "Bia", n: 2 }]);
    expect(p.tabelas.map((t) => t.rotulo)).toContain("Cliente");
  });
  it("maiores mudanças de valor (a baixa, de vazio para pago, não entra)", () => {
    expect(p.maioresMudancas.map((m) => [m.campo, m.antes, m.depois, m.diferenca])).toEqual([["preco_venda", 20, 900, 880], ["valor", 6200, 6500, 300]]);
  });
  it("cada número do painel bate com a lista aberta por ele", () => {
    const itens = indexarHistorico(linhas);
    const n = (f: Partial<FiltrosHistorico>) => filtrarHistorico(itens, { ...FILTROS_HISTORICO, ...f }, HOJE).length;
    expect(n({ periodo: "7d" })).toBe(p.ultimos7);
    expect(n({ periodo: "30d" })).toBe(p.ultimos30);
    expect(n({ periodo: "30d", acao: "delete" })).toBe(p.exclusoes30);
    expect(n({ periodo: "30d", pessoa: "Bia" })).toBe(2);
    for (const d of p.porDia) expect(n({ periodo: "livre", de: d.dia, ate: d.dia })).toBe(d.total);
  });
});

describe("exceções", () => {
  const ex = (p: Partial<Excecao>): Excecao => ({ chave: `k${++seq}`, tipo: "duplicidade", titulo: "", detalhe: "", link: "/financeiro", gravidade: "media", ...p });
  const lista = [
    ex({ chave: "a", titulo: "Refrigeração Exemplo: R$ 1.234,56 duas vezes", valor: 1234.56, gravidade: "alta", data: "2026-08-01" }),
    ex({ chave: "b", tipo: "sem_documento", titulo: "Conta de luz", detalhe: "Pago em 10/10/2026", gravidade: "baixa", data: "2026-10-10" }),
    ex({ chave: "c", tipo: "sem_documento", titulo: "Internet", gravidade: "baixa", data: "2026-09-01" }),
  ];
  const trat = (e: Excecao) => (e.chave === "b" ? { situacao: "confirmado", prazo: "2026-10-01", responsavel: "Fábio" } : e.chave === "c" ? { situacao: "resolvido", prazo: null } : { situacao: "indicio", prazo: null });
  const chaves = (f: Partial<typeof FILTROS_EXCECOES>) => filtrarExcecoes(lista, { ...FILTROS_EXCECOES, ...f }, trat, HOJE).map((e) => e.chave);

  it("busca por texto, valor e responsável", () => {
    expect(chaves({ busca: "refrigeracao 1234,56" })).toEqual(["a"]);
    expect(chaves({ busca: "fabio" })).toEqual(["b"]);
    expect(chaves({ busca: "erro confirmado" })).toEqual(["b"]);
  });
  it("situação, gravidade, tipo e exceção escolhida", () => {
    expect(chaves({})).toEqual(["a", "b"]);
    expect(chaves({ ver: "prazo_vencido" })).toEqual(["b"]);
    expect(chaves({ ver: "fechadas" })).toEqual(["c"]);
    expect(chaves({ gravidade: "alta" })).toEqual(["a"]);
    expect(chaves({ tipo: "sem_documento", ver: "todas" })).toEqual(["b", "c"]);
    expect(chaves({ chave: "c" })).toEqual(["c"]);
  });
  it("números do painel", () => {
    const p = painelExcecoes(lista, trat, HOJE);
    expect(p.abertas).toBe(2);
    expect(p.porGravidade).toEqual({ alta: 1, media: 0, baixa: 1 });
    expect(p.prazoVencido).toBe(1);
    expect(p.confirmadas).toBe(1);
    expect(p.maisAntigas.map((x) => [x.e.chave, x.dias])).toEqual([["a", 75], ["b", 5]]);
  });
});

describe("checklist do mês", () => {
  it("percentual, o que falta e o mês anterior em atraso", () => {
    const [i1, i2] = ITENS_CHECKLIST;
    const respostas = [
      ...ITENS_CHECKLIST.map((i) => ({ competencia: "2026-08", item: i.id, situacao: "ok" })),
      { competencia: "2026-09", item: i1.id, situacao: "ok" },
      { competencia: "2026-10", item: i1.id, situacao: "ok" },
      { competencia: "2026-10", item: i2.id, situacao: "nao_conforme" },
    ];
    const p = painelChecklist(respostas, "2026-10");
    expect(p.conferidos).toBe(2);
    expect(p.faltam).toBe(ITENS_CHECKLIST.length - 2);
    expect(p.pct).toBe(Math.floor((2 / ITENS_CHECKLIST.length) * 100));
    expect(p.naoConformes).toBe(1);
    expect(p.atrasados.map((a) => [a.competencia, a.faltam])).toEqual([["2026-09", ITENS_CHECKLIST.length - 1]]);
    expect(p.atrasados[0].item.id).toBe(i2.id);
  });
  it("sem respostas antes do mês atual não há atraso", () => {
    expect(painelChecklist([], "2026-10").atrasados).toEqual([]);
    expect(somarMes("2026-12", 1)).toBe("2027-01");
  });
});

describe("montarAlvo", () => {
  it("data vira dd/mm/aaaa e número vai para os valores", () => {
    const a = montarAlvo([{ vencimento: "2026-10-20", valor: 10, ok: true }]);
    expect(a.texto).toContain("20/10/2026");
    expect(a.valores).toEqual([10]);
  });
});
