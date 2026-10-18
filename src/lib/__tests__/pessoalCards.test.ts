import { describe, expect, it } from "vitest";
import {
  bancoDoCartao, cardsDasRegras, cardsDoPeriodo, classificar, idDoCard, metasDasRegras, paresEntreContas, regraDo, repetidosDeArquivo, semRepetidos,
  textoSugerido, textosDaRegra, tipoImposto, type RegraPessoal,
} from "../pessoalCards";
import type { ContaPessoal, LancPessoal } from "../pessoal";

let n = 0;
const l = (x: Partial<LancPessoal>): LancPessoal => ({ id: `l${++n}`, conta_id: "c1", data: "2026-10-05", descricao: "", valor: -10, categoria: null, situacao: "realizado", anulado: false, ...x });
const regra = (x: Partial<RegraPessoal>): RegraPessoal => ({
  id: `r${++n}`, texto: "", card: "comissoes", rotulo: null, sentido: "ambos", da_empresa: false, observacao: null, meta_total: null, parcelas: null, ativa: true, ordem: 0, ...x,
});
const e = { nomes: ["ALFA MAQUINAS LTDA"], documentos: [] };
const ctx = (regras: RegraPessoal[] = []) => ({ empresas: e, regras });
const card = (descricao: string, x: Partial<LancPessoal> = {}, regras: RegraPessoal[] = []) => classificar(l({ descricao, ...x }), ctx(regras))?.card ?? null;

describe("cards do painel pessoal", () => {
  it("os jeitos como os bancos escrevem caem no card certo", () => {
    expect(card("JUROS LIMITE DA CONTA")).toBe("juros_limite");
    expect(card("JUROS EXCESSO LIM CONTA")).toBe("juros_limite");
    expect(card("ADIANT.DEPOSITANTE")).toBe("juros_limite");
    expect(card("PAGTO FINANC VEIC 08/48")).toBe("veiculo");
    expect(card("MULTA FINANC VEIC 3/36")).toBe("veiculo");
    expect(card("PAG BOLETO GCI CAIXA HABITACAO")).toBe("habitacao");
    expect(card("PAG BOLETO ITAU UNIBANCO HOLDING SA")).toBe("cartoes");
    expect(card("FATURA PAGA ITAU GOLD")).toBe("cartoes");
    expect(card("PAG BOLETO MIDWAY")).toBe("cartoes");
    expect(card("PGTO MINITAUCARD")).toBe("cartoes");
    expect(card("PAG BOLETO TAB DE NOTAS")).toBe("protestos");
    expect(card("PIX QRS CONECTCAR")).toBe("pedagio");
    expect(card("COMPRA NO DEBITO POSTO EXEMPLO")).toBe("postos");
    expect(card("PIX QRS FACEBOOK SE")).toBe("redes");
    expect(card("PIX QRS BYTEDANCE B")).toBe("redes");
    expect(card("PIX QRS PIX MARKETP")).toBe("mercadolivre");
    expect(card("COMPRA NO DEBITO KOMPRAO")).toBe("mercado");
    expect(card("COMPRA NO DEBITO JARDIM EXEMPLO SUPERM")).toBe("mercado");
    expect(card("ITAU SEG AP PF")).toBe("seguros");
    expect(card("PGTO PROTECAO FAMILIAR MES")).toBe("seguros");
    expect(card("DEB AUTOR LBV")).toBe("doacoes");
    expect(card("PAG BOLETO UNIMED EXEMPLO")).toBe("saude");
    expect(card("IOF")).toBe("tarifas");
    expect(card("PAG BOLETO DEPARTAMENTO ESTADUAL DE TRA")).toBe("impostos");
    expect(card("REND PAGO APLIC AUT MAIS", { valor: 0.03 })).toBe("rendimentos");
    // nem tudo é card
    expect(card("PIX TRANSF FULANO")).toBeNull();
    expect(card("PIX RECEBIDO FULANO", { valor: 50 })).toBeNull();
  });

  it("estorno volta para o card do gasto e desconta", () => {
    const c = classificar(l({ descricao: "EST ITAU SEG AP PF", valor: 58.99 }), ctx());
    expect(c).toMatchObject({ card: "seguros", estorno: true });
    const r = cardsDoPeriodo([l({ descricao: "ITAU SEG AP PF", valor: -60 }), l({ descricao: "EST ITAU SEG AP PF", valor: 20 })],
      { de: "2026-10-01", ate: "2026-10-31" }, { de: "2026-09-01", ate: "2026-09-30" }, ctx());
    expect(r.find((x) => x.id === "seguros")).toMatchObject({ saiu: 40, entrou: 0, qtd: 2 });
  });

  it("impostos separados por tipo e cartões por banco", () => {
    expect(tipoImposto(" pagamento darf 2089 ")).toBe("DARF (Receita Federal)");
    expect(tipoImposto(" pgto das simples nacional ")).toBe("DAS (Simples ou MEI)");
    expect(tipoImposto(" pag boleto departamento estadual de tra ")).toBe("Detran (licenciamento e multas)");
    expect(tipoImposto(" ipva 2026 ")).toBe("IPVA");
    expect(tipoImposto(" prefeitura municipal ")).toBe("Prefeitura (ISS, alvará e taxas)");
    expect(bancoDoCartao(" fatura paga itau platinu ")).toBe("Itaú");
    expect(bancoDoCartao(" pag boleto banco bv sa ")).toBe("BV");
    expect(bancoDoCartao(" pag boleto banco pan sa ")).toBe("Pan");
    expect(bancoDoCartao(" pag boleto midway ")).toBe("Midway (Riachuelo)");
  });

  it("multa e juros do financiamento do carro aparecem à parte, em vermelho", () => {
    const r = cardsDoPeriodo([l({ descricao: "PAGTO FINANC VEIC 08/48", valor: -1900 }), l({ descricao: "MULTA FINANC VEIC", valor: -77.54 }), l({ descricao: "C PERM FINANC VEIC", valor: -53.92 })],
      { de: "2026-10-01", ate: "2026-10-31" }, { de: "2026-09-01", ate: "2026-09-30" }, ctx());
    const v = r.find((x) => x.id === "veiculo")!;
    expect(v.saiu).toBe(2031.46);
    expect(v.atraso).toBe(131.46);
    expect(v.partes.map((p) => p.nome)).toEqual(["Parcelas", "Multa e juros (pagas com atraso)"]);
  });

  it("juros do limite em destaque, primeiro, com o total de 12 meses", () => {
    const r = cardsDoPeriodo([l({ descricao: "IFOOD", valor: -30 }), l({ descricao: "JUROS LIMITE DA CONTA", valor: -400 }), l({ descricao: "JUROS LIMITE DA CONTA", valor: -350, data: "2026-03-06" })],
      { de: "2026-10-01", ate: "2026-10-31" }, { de: "2026-09-01", ate: "2026-09-30" }, ctx(), { de: "2025-11-01", ate: "2026-10-31" });
    expect(r[0]).toMatchObject({ id: "juros_limite", destaque: true, total: 400, doze: 750 });
  });

  it("as regras da pessoa valem antes das prontas, juntam nomes e criam cards", () => {
    const regras = [
      regra({ texto: "transf fulan / fulano exemplo", card: "comissoes", rotulo: "Fulano", sentido: "saida", ordem: 1 }),
      regra({ texto: "unifique / claro celular", card: "Telefones da fábrica", da_empresa: true, ordem: 2 }),
      regra({ texto: "transf beltr", card: "emprestimos", rotulo: "Empréstimo", meta_total: 21000, parcelas: 3, ordem: 3 }),
    ];
    expect(textosDaRegra("Itaú Gold / ITAU PLATINU; midway")).toEqual(["itau gold", "itau platinu", "midway"]);
    // o banco corta o nome: o texto vale do começo da palavra
    expect(classificar(l({ descricao: "PIX TRANSF FULANO02 08", valor: -200 }), ctx(regras))).toMatchObject({ card: "comissoes", sub: "Fulano" });
    expect(classificar(l({ descricao: "Transferência enviada pelo Pix - FULANO EXEMPLO DE TAL", valor: -1500 }), ctx(regras))).toMatchObject({ card: "comissoes", sub: "Fulano" });
    // a regra só de saída não pega a entrada
    expect(classificar(l({ descricao: "PIX TRANSF FULANO", valor: 300 }), ctx(regras))).toBeNull();
    // antes da regra pronta (casa): o card próprio
    expect(card("PAG BOLETO UNIFIQUE TELECOMUNICACOES", {}, regras)).toBe(idDoCard("Telefones da fábrica"));
    const proprios = cardsDasRegras(regras);
    expect(proprios).toHaveLength(1);
    expect(proprios[0]).toMatchObject({ nome: "Telefones da fábrica", naMF: { tipo: "casa", categoria: "energia/água/internet" } });
    expect(proprios[0].aviso).toMatch(/contador/);
    // meta: 1 de 3 pagas
    const lancs = [l({ descricao: "PIX TRANSF BELTRANO R07 10", valor: -7000 })];
    expect(metasDasRegras(lancs, regras)[0]).toMatchObject({ pago: 7000, vezes: 1, falta: 14000, pct: 33 });
    expect(regraDo(lancs[0], regras)?.card).toBe("emprestimos");
  });

  it("entre as suas contas: saída numa conta e entrada igual na outra em até 2 dias (sem cartão)", () => {
    const contas = [{ id: "c1", tipo: "corrente" }, { id: "c2", tipo: "corrente" }, { id: "k", tipo: "cartao" }] as ContaPessoal[];
    const lancs = [
      l({ id: "a", conta_id: "c1", descricao: "PIX TRANSF FULANA", valor: -500, data: "2026-10-01" }),
      l({ id: "b", conta_id: "c2", descricao: "Transferência recebida pelo Pix", valor: 500, data: "2026-10-02" }),
      l({ id: "c", conta_id: "c1", descricao: "PIX TRANSF X", valor: -80, data: "2026-10-01" }),
      l({ id: "d", conta_id: "c2", descricao: "PIX RECEBIDO", valor: 80, data: "2026-10-06" }),
      l({ id: "e", conta_id: "c1", descricao: "PAGAMENTO FATURA", valor: -300, data: "2026-10-03" }),
      l({ id: "f", conta_id: "k", descricao: "PAGAMENTO RECEBIDO", valor: 300, data: "2026-10-03" }),
    ];
    expect([...paresEntreContas(lancs, contas)].sort()).toEqual(["a", "b"]);
    const r = cardsDoPeriodo(lancs, { de: "2026-10-01", ate: "2026-10-31" }, { de: "2026-09-01", ate: "2026-09-30" }, { ...ctx(), pares: paresEntreContas(lancs, contas) });
    expect(r.find((x) => x.id === "entre_contas")).toMatchObject({ fora: true, saiu: 500, entrou: 500 });
  });

  it("Pix com a própria empresa entra no card das empresas nos dois sentidos", () => {
    const r = cardsDoPeriodo([l({ descricao: "PIX QRS ALFA MAQUINAS", valor: -1000 }), l({ descricao: "PIX TRANSF ALFA MAQUINAS", valor: 3000 })],
      { de: "2026-10-01", ate: "2026-10-31" }, { de: "2026-09-01", ate: "2026-09-30" }, ctx());
    expect(r.find((x) => x.id === "empresas")).toMatchObject({ saiu: 1000, entrou: 3000, total: 4000 });
  });

  it("o mesmo extrato em PDF e OFX: anula a cópia do PDF (e duas linhas iguais do mesmo arquivo não são repetidas)", () => {
    const lancs = [
      l({ id: "ofx1", identificador: "20260625001", descricao: "DA CLARO BL IT 19478721", valor: -317.17, data: "2026-06-25" }),
      l({ id: "pdf1", identificador: "pdf:2026-06-25:-317.17:daclaroblit", descricao: "DA CLARO BL/IT 19478721", valor: -317.17, data: "2026-06-25" }),
      l({ id: "pdf2", identificador: "pdf:a", descricao: "PIX TRANSF X", valor: -50, data: "2026-06-26" }),
      l({ id: "pdf3", identificador: "pdf:b", descricao: "PIX TRANSF X", valor: -50, data: "2026-06-26" }),
    ];
    expect(repetidosDeArquivo(lancs).map((x) => x.id)).toEqual(["pdf1"]);
    // na importação: a linha que já está por outro arquivo fica de fora
    const novas = [
      { conta_id: "c1", data: "2026-06-25", valor: -317.17, descricao: "DA CLARO BL/IT 19478721", identificador: "pdf:novo" },
      { conta_id: "c1", data: "2026-06-27", valor: -10, descricao: "OUTRA", identificador: "pdf:outra" },
    ];
    const { ficam, fora } = semRepetidos(novas, lancs);
    expect(fora.map((x) => x.identificador)).toEqual(["pdf:novo"]);
    expect(ficam.map((x) => x.identificador)).toEqual(["pdf:outra"]);
  });

  it("Pix para a empresa com a data colada no nome e a fatura sem nome pelo banco da conta", () => {
    expect(card("PIX QRS ALFA MAQUINAS03 01", { valor: -1000 })).toBe("empresas");
    const c = classificar(l({ descricao: "Pagamento de fatura", valor: -900, conta_id: "nu" }), { ...ctx(), bancos: { nu: "Nubank" } });
    expect(c).toMatchObject({ card: "cartoes", sub: "Nubank" });
  });

  it("texto sugerido para a regra: sem datas e números", () => {
    expect(textoSugerido("PIX TRANSF FULANO08 10")).toBe("pix transf fulano");
    expect(textoSugerido("PAG BOLETO EXEMPLO TELECOMUNICACOES S A")).toBe("pag boleto exemplo telecomunicacoes");
  });
});
