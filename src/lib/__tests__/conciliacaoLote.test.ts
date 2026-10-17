import { describe, expect, it } from "vitest";
import {
  agrupar, cadastroDoFavorecido, chaveContraparte, contraparte, emPedacos, regrasDasLinhas, resumoErros, textoRegra,
  type LinhaLote, type RegraConciliacao,
} from "../conciliacaoLote";

const linha = (id: string, descricao: string, valor: number, data = "2026-09-10", conta = "olist"): LinhaLote => ({ id, conta_bancaria_id: conta, data, valor, descricao });

describe("conciliação em lote: favorecido pela descrição do banco", () => {
  it("cada formato de extrato dá o nome de quem recebeu ou pagou", () => {
    expect(contraparte("FULANO DE TAL · Transferência enviada pelo Pix - FULANO DE TAL - ***123456** - Ref. CP-991")).toBe("FULANO DE TAL");
    expect(contraparte("Transferência enviada por Boleto - REFRIGERACAO EXEMPLO LTDA - 12345678000199 - Ref. CP-12")).toBe("REFRIGERACAO EXEMPLO LTDA");
    expect(contraparte("Transferência enviada por Boleto - DAS - SIMPLES NACIONAL -  - Ref. CP-7")).toBe("DAS - SIMPLES NACIONAL");
    expect(contraparte("Transferência enviada pelo Pix - CICLANA SOUZA - •••.456.789-•• - BANCO EXEMPLO (341) Agência: 1 Conta: 2-3")).toBe("CICLANA SOUZA");
    expect(contraparte("Transferência recebida - SORVETERIA EXEMPLO - 123 - Ref. 9a8b7c")).toBe("SORVETERIA EXEMPLO");
    expect(contraparte("AUTO POSTO EXEMPLO 10 · mfmaquinas")).toBe("AUTO POSTO EXEMPLO 10");
    expect(contraparte("Pix FULANO DE TAL · Enviado")).toBe("FULANO DE TAL");
    expect(contraparte("PIX Marketplace · Transferência enviada pelo Pix - PIX Marketplace - 1 - Ref. CP-1")).toBe("PIX Marketplace");
    expect(contraparte("OLIST · Tarifa Pix recebido")).toBe("Tarifa Pix recebido");
    expect(contraparte("ACAI &amp; ACAI · Recebido")).toBe("ACAI & ACAI");
    expect(contraparte("TARIFA PACOTE DE SERVICOS")).toBe("TARIFA PACOTE DE SERVICOS");
    expect(contraparte(null)).toBe("");
  });

  it("a chave junta o mesmo favorecido escrito de jeitos diferentes", () => {
    expect(chaveContraparte("Refrigeração Exemplo Ltda.")).toBe("REFRIGERACAO EXEMPLO");
    expect(chaveContraparte("REFRIGERACAO EXEMPLO LTDA - ME")).toBe("REFRIGERACAO EXEMPLO");
    expect(chaveContraparte("AUTO POSTO EXEMPLO 10")).toBe(chaveContraparte("Auto Posto Exemplo 12"));
    expect(chaveContraparte("S.A.")).toBe("S"); // nunca fica vazia por tirar o sufixo
  });

  it("agrupa por favorecido e sentido, soma, conta as contas e põe o maior primeiro", () => {
    const g = agrupar([
      linha("1", "Pix FULANO DE TAL · Enviado", -100, "2026-09-01", "infinite"),
      linha("2", "FULANO DE TAL · Transferência enviada pelo Pix - FULANO DE TAL - 1 - Ref. CP-1", -50.1, "2026-09-20"),
      linha("3", "Fulano de Tal · Recebido", 30, "2026-09-05", "infinite"),
      linha("4", "AUTO POSTO EXEMPLO 10 · mfmaquinas", -200),
      linha("5", "AUTO POSTO EXEMPLO 12 · mfmaquinas", -100),
      linha("6", "AUTO POSTO EXEMPLO 10 · mfmaquinas", -80),
    ]);
    expect(g.map((x) => [x.chave, x.direcao, x.qtd, x.total])).toEqual([
      ["AUTO POSTO EXEMPLO", "saida", 3, -380],
      ["FULANO DE TAL", "saida", 2, -150.1],
      ["FULANO DE TAL", "entrada", 1, 30],
    ]);
    expect(g[0].rotulo).toBe("AUTO POSTO EXEMPLO 10");
    expect([g[1].primeira, g[1].ultima, g[1].contas]).toEqual(["2026-09-01", "2026-09-20", ["infinite", "olist"]]);
  });

  it("regra ligada vira sugestão só no mesmo sentido; desligada não vale", () => {
    const regra = (x: Partial<RegraConciliacao>): RegraConciliacao => ({
      id: "r1", chave: "AUTO POSTO EXEMPLO", direcao: "saida", rotulo: "AUTO POSTO EXEMPLO 10", acao: "lancar", categoria: "combustível",
      motivo: null, fornecedor_id: null, cliente_id: null, ativo: true, usos: 0, ...x,
    });
    const linhas = [linha("a", "AUTO POSTO EXEMPLO 99 · mfmaquinas", -10), linha("b", "AUTO POSTO EXEMPLO · Recebido", 10), linha("c", "OUTRO · x", -5)];
    expect([...regrasDasLinhas(linhas, [regra({})]).keys()]).toEqual(["a"]);
    expect(regrasDasLinhas(linhas, [regra({ ativo: false })]).size).toBe(0);
    expect(textoRegra(regra({}))).toBe("lançar em combustível");
    expect(textoRegra(regra({ acao: "ignorar", motivo: "estorno do banco" }))).toBe("ignorar (estorno do banco)");
  });

  it("fornecedor do cadastro pelo nome (inteiro ou começo do nome cortado), nunca no empate", () => {
    const cad = [
      { id: "f1", nome: "Refrigeração Exemplo Ltda", nome_fantasia: null },
      { id: "f2", nome: "Comercial de Ferragens Exemplo Sul Ltda", nome_fantasia: "Ferragens Sul" },
      { id: "f3", nome: "Posto A", nome_fantasia: null }, { id: "f4", nome: "POSTO A LTDA", nome_fantasia: null },
    ];
    expect(cadastroDoFavorecido("REFRIGERACAO EXEMPLO", cad)?.id).toBe("f1");
    expect(cadastroDoFavorecido("FERRAGENS SUL", cad)?.id).toBe("f2");
    expect(cadastroDoFavorecido("COMERCIAL DE FERRAGENS EX", cad)?.id).toBe("f2"); // nome cortado pela maquininha
    expect(cadastroDoFavorecido("POSTO A", cad)).toBeNull();
    expect(cadastroDoFavorecido("COMERCIAL", cad)).toBeNull();
  });

  it("erros do lote juntos por motivo e pedaços de 150", () => {
    expect(resumoErros([{ erro: "mês fechado" }, { erro: "x" }, { erro: "mês fechado" }])).toEqual([{ erro: "mês fechado", qtd: 2 }, { erro: "x", qtd: 1 }]);
    expect(emPedacos(Array.from({ length: 320 }, (_, i) => i)).map((p) => p.length)).toEqual([150, 150, 20]);
  });
});
