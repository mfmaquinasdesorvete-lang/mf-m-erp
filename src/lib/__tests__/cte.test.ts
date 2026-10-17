import { describe, expect, it } from "vitest";
import {
  atrasoDias, conferenciaMensal, dataIso, faturasSugeridas, faturavel, lerPlanilhaCtes, numeroBR, pagamentoDaTransportadora, pesoDoFrete, porMes, porRemetente,
  resumoCtes, tipoFrete, valido, type Cte,
} from "../cte";

// planilha no formato da transportadora (dados de exemplo)
const CAB = "Documento;Tipo;Nota Fiscal;CNPJ Dest;Cliente Dest;CNPJ Rem;Cliente Rem;Ag Rem;Ag Dest;Frete;Peso/M3;Peso;Volumes;Valor Documento;Série NF;Valor NF;Emissão;Prev Entrega;Ocorrência;Data;Hora";
const PLANILHA = [
  "﻿" + CAB,
  "1001;CT-e;555;11111111000111;EMPRESA EXEMPLO LTDA;22222222000122;FORNECEDOR EXEMPLO LTDA;CAMPO BOM;PALHOCA;À pagar;Peso;3;1;62.49;419;300;03/02/2026;04/02/2026;ENTREGUE;05/02/2026;14:14",
  "1002;CT-e;77;33333333000133;CLIENTE EXEMPLO LTDA;11111111000111;EMPRESA EXEMPLO LTDA;PALHOCA;PORTO ALEGRE;Pago;M3;0,3792;4;2.732,56;1;20000;26/02/2026;27/02/2026;EM TRANSITO;;",
  ";CT-e;;;;;;;;;;;;;;;;;;;",
  "",
].join("\r\n");

const cte = (x: Partial<Cte>): Cte => ({
  id: "c", numero: "1", tipo: "CT-e", nf_numero: null, nf_serie: null, nf_valor: null, destinatario_cnpj: null, destinatario_nome: null,
  remetente_cnpj: null, remetente_nome: null, ag_origem: null, ag_destino: null, frete: "a_pagar", peso_tipo: null, peso: null, volumes: null,
  valor: 100, emissao: "2026-01-10", prev_entrega: null, ocorrencia: null, ocorrencia_em: null, sentido: "entrada", mf_paga: true, unidade_id: null,
  transportadora_id: "t", nfe_recebida_id: null, nota_fiscal_id: null, fatura_id: null, origem: "planilha", ...x,
});

describe("planilha de CT-e da transportadora", () => {
  it("números com ponto ou vírgula, datas e tipo de frete", () => {
    expect(numeroBR("102.5")).toBe(102.5);
    expect(numeroBR("2.732,56")).toBe(2732.56);
    expect(numeroBR("0,3792")).toBe(0.3792);
    expect(numeroBR("")).toBeNull();
    expect(dataIso("01/04/2026")).toBe("2026-04-01");
    expect(dataIso("2026-04-01")).toBeNull();
    expect(tipoFrete("À pagar")).toBe("a_pagar");
    expect(tipoFrete("FOB")).toBe("a_pagar");
    expect(tipoFrete("Pago")).toBe("pago");
    expect(tipoFrete("CIF")).toBe("pago");
    expect(tipoFrete("")).toBeNull();
  });

  it("lê as linhas (cabeçalho com acento e BOM), entrega com hora e aponta a linha sem número", () => {
    const { linhas, erros } = lerPlanilhaCtes(PLANILHA);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({
      numero: "1001", nf_numero: "555", nf_serie: "419", nf_valor: 300, destinatario_cnpj: "11111111000111", remetente_cnpj: "22222222000122",
      ag_origem: "CAMPO BOM", frete: "a_pagar", peso: 3, volumes: 1, valor: 62.49, emissao: "2026-02-03", prev_entrega: "2026-02-04",
      ocorrencia: "ENTREGUE", ocorrencia_em: "2026-02-05T14:14:00-03:00",
    });
    expect(linhas[1]).toMatchObject({ frete: "pago", peso_tipo: "M3", peso: 0.3792, valor: 2732.56, ocorrencia_em: null });
    expect(erros).toEqual(["linha 4: sem número ou data de emissão"]);
  });

  it("recusa planilha que não é de CT-e", () => {
    const r = lerPlanilhaCtes("Nome;Valor\nx;1");
    expect(r.linhas).toEqual([]);
    expect(r.erros[0]).toMatch(/não tem as colunas: numero, emissao/);
    expect(lerPlanilhaCtes("").erros).toEqual(["arquivo vazio"]);
  });
});

describe("contas do painel", () => {
  it("entrega no prazo, atraso em dias e peso do frete sobre a nota", () => {
    const ok = cte({ prev_entrega: "2026-02-04", ocorrencia: "ENTREGUE", ocorrencia_em: "2026-02-04T10:00:00-03:00" });
    const atrasou = cte({ prev_entrega: "2026-02-04", ocorrencia: "ENTREGUE", ocorrencia_em: "2026-02-06T10:00:00-03:00" });
    expect(atrasoDias(ok)).toBe(0);
    expect(atrasoDias(atrasou)).toBe(2);
    expect(atrasoDias(cte({ prev_entrega: "2026-02-04", ocorrencia: "EM TRANSITO" }))).toBeNull();
    expect(pesoDoFrete(cte({ valor: 50, nf_valor: 1000 }))).toBe(0.05);
    expect(pesoDoFrete(cte({ nf_valor: 0 }))).toBeNull();
  });

  it("resumo: só o que a MF paga entra no frete; compras, vendas, transferências e o que falta faturar", () => {
    const l = [
      cte({ id: "1", valor: 100, nf_valor: 1000, sentido: "entrada" }),
      cte({ id: "2", valor: 50, nf_valor: 500, sentido: "saida", frete: "pago", fatura_id: "f" }),
      cte({ id: "3", valor: 30, sentido: "transferencia" }),
      cte({ id: "4", valor: 999, sentido: "entrada", frete: "pago", mf_paga: false }),
    ];
    expect(resumoCtes(l)).toMatchObject({
      qtd: 4, fretePagoMF: 180, qtdPagoMF: 3, compras: 100, vendas: 50, transferencias: 30, nfCompras: 1000, nfVendas: 500, semFatura: 130, qtdSemFatura: 2,
    });
    expect(faturavel(l[0])).toBe(true);
    expect(faturavel(l[1])).toBe(false);
    expect(faturavel(l[3])).toBe(false);
  });

  it("mês a mês do mais novo e fornecedores que mais geram frete na compra", () => {
    const l = [
      cte({ emissao: "2026-01-05", valor: 10, remetente_cnpj: "A", remetente_nome: "Fornecedor A", nf_valor: 100 }),
      cte({ emissao: "2026-02-05", valor: 30, remetente_cnpj: "B", remetente_nome: "Fornecedor B", nf_valor: 200 }),
      cte({ emissao: "2026-02-06", valor: 15, remetente_cnpj: "A", remetente_nome: "Fornecedor A", nf_valor: 100 }),
      cte({ emissao: "2026-02-07", valor: 500, remetente_cnpj: "C", sentido: "saida" }),
    ];
    expect(porMes(l).map((m) => [m.mes, m.qtd, m.compras])).toEqual([["2026-02", 3, 45], ["2026-01", 1, 10]]);
    expect(porRemetente(l)).toEqual([{ nome: "Fornecedor B", qtd: 1, frete: 30, nf: 200 }, { nome: "Fornecedor A", qtd: 2, frete: 25, nf: 200 }]);
  });
});

describe("conferência com o extrato", () => {
  it("acha o pagamento pelo nome (sem acento e sem S/A) ou pelo CNPJ mascarado do banco", () => {
    expect(pagamentoDaTransportadora("EXPRESSO EXEMPLO S A · Pagamento efetuado", "Expresso Exemplo")).toBe(true);
    expect(pagamentoDaTransportadora("Pix EXPRESSO EXEMPLO S/A · Enviado", "Expresso Exêmplo S.A.")).toBe(true);
    expect(pagamentoDaTransportadora("Transferência enviada por Boleto - TRANSP X - ***283070001** - Ref. 1", "Outro nome", "00428307")).toBe(true);
    expect(pagamentoDaTransportadora("Transferência enviada por Boleto - TRANSP X - ***999990001** - Ref. 1", "Outro nome", "00428307")).toBe(false);
    expect(pagamentoDaTransportadora("POSTO EXEMPLO", "Expresso Exemplo")).toBe(false);
  });

  it("em aberto acumulado (a fatura de um mês paga no outro) e pagamento antigo fora da conta", () => {
    const ctes = [cte({ emissao: "2026-01-10", valor: 100 }), cte({ emissao: "2026-02-10", valor: 50 }), cte({ emissao: "2026-02-11", valor: 80, mf_paga: false })];
    const pagos = [{ data: "2025-12-20", valor: -300 }, { data: "2026-02-05", valor: -100 }, { data: "2026-03-05", valor: -50 }];
    expect(conferenciaMensal(ctes, pagos)).toEqual([
      { mes: "2026-03", frete: 0, pago: 50, emAberto: 0 },
      { mes: "2026-02", frete: 50, pago: 100, emAberto: 50 },
      { mes: "2026-01", frete: 100, pago: 0, emAberto: 100 },
    ]);
  });
});

describe("CT-e da SEFAZ no painel", () => {
  it("cancelado fica fora das contas, do que falta faturar e da fatura", () => {
    const l = [
      cte({ id: "1", valor: 100, chave: "4".repeat(44), situacao: "autorizado" }),
      cte({ id: "2", valor: 70, chave: "5".repeat(44), situacao: "cancelado" }),
      cte({ id: "3", valor: 30 }),
    ];
    expect(resumoCtes(l)).toMatchObject({ qtd: 2, fretePagoMF: 130, semFatura: 130, qtdSemFatura: 2, cancelados: 1 });
    expect(valido(l[0])).toBe(true);
    expect(valido(l[1])).toBe(false);
    expect(valido(l[2])).toBe(true);
    expect(faturavel(l[1])).toBe(false);
    expect(conferenciaMensal(l, []).map((m) => m.frete)).toEqual([130]);
  });

  it("faturas para montar: por transportadora e pelo nº da fatura do CT-e, com o vencimento da duplicata", () => {
    const cob = (fatura: string, venc: string) => ({ fatura, valor: null, duplicatas: [{ numero: "1", vencimento: venc, valor: null }] });
    const l = [
      cte({ id: "a", transportadora_id: "t1", valor: 100, emissao: "2026-09-10" }),
      cte({ id: "b", transportadora_id: "t1", valor: 50.5, emissao: "2026-09-02", chave: "4".repeat(44) }),
      cte({ id: "c", transportadora_id: "t2", valor: 80, emissao: "2026-09-20", chave: "5".repeat(44), cobranca: cob("FT-9", "2026-10-15") }),
      cte({ id: "d", transportadora_id: "t2", valor: 20, emissao: "2026-09-21", chave: "6".repeat(44), cobranca: cob("FT-9", "2026-10-10") }),
      cte({ id: "e", transportadora_id: "t2", valor: 999, fatura_id: "f" }),
      cte({ id: "f", transportadora_id: "t2", valor: 999, situacao: "cancelado" }),
      cte({ id: "g", transportadora_id: "t2", valor: 999, mf_paga: false }),
    ];
    expect(faturasSugeridas(l)).toEqual([
      { chave: "t1|", transportadora_id: "t1", fatura: null, vencimento: null, ids: ["a", "b"], qtd: 2, total: 150.5, desde: "2026-09-02", ate: "2026-09-10", daSefaz: 1 },
      { chave: "t2|FT-9", transportadora_id: "t2", fatura: "FT-9", vencimento: "2026-10-10", ids: ["c", "d"], qtd: 2, total: 100, desde: "2026-09-20", ate: "2026-09-21", daSefaz: 2 },
    ]);
  });
});
