import { describe, expect, it } from "vitest";
import { contasRepetidas, ehCombustivel, esferaImposto, estabelecimento, funcionarioDoLancamento, origemTarifa, resumoPorMes, resumoPorTipo, tipoLancamento, transferenciasInternas } from "../extratoTipos";

describe("tipoLancamento", () => {
  it("entradas", () => {
    expect(tipoLancamento("Pix 12.345.678 FULANO DE TAL", 500)).toBe("pix_recebido");
    expect(tipoLancamento("Vendas · Depósito InfinitePay", 21127.64)).toBe("vendas_cartao");
    expect(tipoLancamento("Reembolso FARMACIA CENTRAL · cartao", 20)).toBe("outra_entrada");
  });
  it("saídas", () => {
    expect(tipoLancamento("POSTO ESTRELA DO SUL LTDA · cartao", -200)).toBe("combustivel");
    expect(tipoLancamento("AUTO POSTO BOA VIAGEM · cartao", -150)).toBe("combustivel");
    expect(tipoLancamento("AUTOBAN · cartao", -12.3)).toBe("pedagio");
    expect(tipoLancamento("Pix FORNECEDOR EXEMPLO LTDA · Enviado", -100)).toBe("pix_enviado");
    expect(tipoLancamento("Tarifa de manutenção", -15)).toBe("tarifa");
    expect(tipoLancamento("SUPERMERCADO BOM PRECO · cartao", -80)).toBe("outra_saida");
  });
  it("oficina diesel é manutenção de veículo, não posto; posto que vende diesel continua posto", () => {
    expect(tipoLancamento("Transferência enviada por Boleto - OFICINA EXEMPLO DIESEL LTDA - ***000000001** - Ref. 1", -614.17)).toBe("veiculo");
    expect(tipoLancamento("Pix EXEMPLO DIESEL LTDA · Enviado", -1000)).toBe("veiculo");
    expect(ehCombustivel("Exemplo Diesel Ltda")).toBe(false);
    expect(tipoLancamento("POSTO EXEMPLO DIESEL · cartao", -300)).toBe("combustivel");
    expect(tipoLancamento("BORRACHARIA DO EXEMPLO · cartao", -80)).toBe("veiculo");
  });
  it("imposto não é posto", () => {
    expect(tipoLancamento("Pagamento de imposto DARF", -900)).toBe("imposto");
    expect(ehCombustivel("Imposto")).toBe(false);
    expect(ehCombustivel("Comercial de Combustíveis Ltda")).toBe(true);
    // nomes colados das maquininhas
    for (const d of ["FininhoAutoPosto · cartao", "PostoAtlantica · cartao", "RODOPOSTO TURMALINA · cartao", "HL COMERCIO DE COMBUST · cartao"]) expect(ehCombustivel(d)).toBe(true);
    expect(ehCombustivel("Pagamento de imposto federal")).toBe(false);
  });
  it("guias de imposto por esfera", () => {
    expect(esferaImposto("Pix SECRETARIA DE ESTADO DA FAZENDA · Enviado")).toBe("Estadual");
    expect(esferaImposto("DARE SANTA CATARINA · Pagamento efetuado")).toBe("Estadual");
    expect(esferaImposto("Transferência enviada por boleto - DAR-AM - ref. CP-12")).toBe("Estadual");
    expect(esferaImposto("Transferência enviada por boleto - PREFEITURA MUNICIPAL DE EXEMPLO")).toBe("Municipal");
    expect(esferaImposto("MUNICIPIO DE EXEMPLO · Pagamento efetuado")).toBe("Municipal");
    expect(esferaImposto("DEPARTAMENTO ESTADUAL DE TRANSITO · Pagamento efetuado")).toBe("Veículos (Detran)");
    expect(esferaImposto("Documento de Arrecadação do Simples Nacional")).toBe("Federal");
    expect(esferaImposto("RESTAURANTE DA FAZENDA · cartao")).toBeNull();
    expect(esferaImposto("CASA DAS MANGUEIRAS · cartao")).toBeNull();
    expect(tipoLancamento("Pix SECRETARIA DE ESTADO DA FAZENDA · Enviado", -350)).toBe("imposto");
  });
  it("tarifa escrita vem antes do Pix", () => {
    expect(tipoLancamento("OLIST SERVICOS DIGITAIS LTDA · Tarifa Pix recebido - ref. 123", -0.5)).toBe("tarifa");
    expect(origemTarifa("OLIST SERVICOS DIGITAIS LTDA · Tarifa lembretes de pagamento")).toBe("OLIST");
    expect(origemTarifa("Taxa do cartão Olist (Zoop) · pedido Tiny nº 1")).toBe("OLIST");
    expect(origemTarifa("Tarifa de manutenção")).toBe("Banco");
  });
  it("Pix para funcionário do cadastro", () => {
    const f = [{ nome: "Fulano de Tal Exemplo" }];
    expect(tipoLancamento("Pix FULANO DE TAL EXEMPLO · Enviado", -1500, f)).toBe("funcionario");
    expect(tipoLancamento("FULANO DE TAL EXEMPLO · Transferência enviada pelo Pix", -50, f)).toBe("funcionario");
    expect(tipoLancamento("Pix FULANO DE TAL EXEMPLO · Enviado", -1500)).toBe("pix_enviado");
    expect(tipoLancamento("Pix FULANO DE TAL EXEMPLOS LTDA · Enviado", -1500, f)).toBe("pix_enviado");
    expect(funcionarioDoLancamento("Pix Fulano de Tal Exemplo · Enviado", [{ nome: "Fulano" }])).toBeNull();
  });
});

describe("resumos", () => {
  const l = [
    { data: "2026-09-02", valor: 100, descricao: "Pix A", identificador: "1" },
    { data: "2026-09-03", valor: 50, descricao: "Pix B", identificador: "2" },
    { data: "2026-09-03", valor: 50, descricao: "Pix B", identificador: "2" }, // mesmo arquivo em outra conta
    { data: "2026-10-01", valor: -30, descricao: "POSTO X", identificador: "3" },
  ];
  it("conta cada lançamento uma vez", () => {
    const r = resumoPorTipo(l);
    expect(r.pix_recebido).toEqual({ n: 2, total: 150 });
    expect(r.combustivel).toEqual({ n: 1, total: -30 });
  });
  it("mês a mês", () => {
    expect(resumoPorMes(l)).toEqual([
      { mes: "2026-10", pix_n: 0, pix: 0, vendas: 0, entradas: 0, saidas: 30 },
      { mes: "2026-09", pix_n: 2, pix: 150, vendas: 0, entradas: 150, saidas: 0 },
    ]);
  });
  it("acha contas com o mesmo extrato", () => {
    const x = [...Array(6)].flatMap((_, i) => [{ conta_bancaria_id: "a", identificador: `f${i}` }, { conta_bancaria_id: "b", identificador: `f${i}` }]);
    expect(contasRepetidas([...x, { conta_bancaria_id: "c", identificador: "z" }])).toEqual([{ a: "a", b: "b", iguais: 6 }]);
  });
  it("nome do estabelecimento", () => {
    expect(estabelecimento("POSTO ESTRELA DO SUL LTDA · cartao")).toBe("Posto Estrela Do Sul Ltda");
  });
});

describe("transferenciasInternas", () => {
  it("mesmo valor saindo de uma conta e entrando em outra no mesmo dia ou no seguinte", () => {
    const l = [
      { id: "s1", conta_bancaria_id: "A", data: "2026-10-03", valor: -5000 },
      { id: "e1", conta_bancaria_id: "B", data: "2026-10-04", valor: 5000 },
      { id: "s2", conta_bancaria_id: "A", data: "2026-10-03", valor: -300 },
      { id: "e2", conta_bancaria_id: "A", data: "2026-10-03", valor: 300 }, // mesma conta: estorno, não transferência
      { id: "e3", conta_bancaria_id: "B", data: "2026-10-09", valor: 300 }, // longe demais
    ];
    expect([...transferenciasInternas(l)].sort()).toEqual(["e1", "s1"]);
  });
});
