import { describe, expect, it } from "vitest";
import { codigosDaPeca, gruposRepetidos, nomesParecidos } from "../marketplace";

const p = (id: string, descricao: string, extra: Record<string, unknown> = {}) => ({ id, descricao, ativo: true, preco_venda: 10, ...extra }) as never;

describe("produtos quase iguais", () => {
  it("lê os códigos da peça e deixa medida e modelo de máquina de fora", () => {
    const c = codigosDaPeca("Retentor 30 x 52 x 10 mm (SAV 00949 / BR 6049) - Compatível com Máquinas My Frost");
    expect([...c.codigos].sort()).toEqual(["00949", "30x52x10", "6049"]);
    expect([...codigosDaPeca("Plugue ABB 216EP6 200/250V 16A - A 200").codigos]).toEqual(["216ep6"]);
  });
  it("mesmo código escrito de outro jeito é parecido", () => {
    expect(nomesParecidos(p("1", "Retentor 30 x 52 x 10 mm (SAV 00949 / BR 6049)"), p("2", "Retentor 30X52X10 5130.0 SAV 00949 BR 6049 BR"))).toBe(true);
    expect(nomesParecidos(p("1", "Botão WEG - Bloco de Contato BCE10F"), p("2", "Botão WEG Acionamento - Bloco Contato BCE10F"))).toBe(true);
    expect(nomesParecidos(p("1", "Vedação do Cilindro - A 200 Nova / P 386 (1 Un.)"), p("2", "Vedação Cilindro A 200 Nova - P 386"))).toBe(true);
  });
  it("modelos diferentes não", () => {
    expect(nomesParecidos(p("1", "Valv SOL Danf EVR 03 1/4S S/BOB"), p("2", "Valv SOL Danf EVR 02 1/4S S/BOB"))).toBe(false);
    expect(nomesParecidos(p("1", "Relé de Estado Sólido SSR-40AA 40 a"), p("2", "Relé de Estado Sólido SSR-40DA 40 a"))).toBe(false);
    expect(nomesParecidos(p("1", "Relé Monitor de Tensão WEG RMW17 380 V"), p("2", "Relé Monitor de Tensão WEG RMW17 SSM01D23 220 V Monofásico"))).toBe(false);
    expect(nomesParecidos(p("1", "Pá Batedora Aeradora - A 200"), p("2", "Chave Extratora Completa Portelo - A 200"))).toBe(false);
  });
  it("grupo de três vira um grupo só, para conferir", () => {
    const g = gruposRepetidos([p("1", "Vedação do Cilindro - A 200 Nova / P 386 (1 Un.)"), p("2", "Vedação Cilindro - A 200 Nova - P 386 UN"), p("3", "Vedação Cilindro A 200 Nova - P 386")]);
    expect(g).toHaveLength(1);
    expect(g[0].produtos).toHaveLength(3);
    expect(g[0].identicos).toBe(false);
  });
});
