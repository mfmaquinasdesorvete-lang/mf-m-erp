import { describe, expect, it } from "vitest";
import { chaveNoTexto, corpoPix, lerChavePix, situacaoDaConsulta, situacaoDoEnvio } from "../../../supabase/functions/_shared/pix-saida";

describe("Pix de saída", () => {
  it("reconhece os tipos de chave", () => {
    expect(lerChavePix("529.982.247-25")).toEqual({ chave: "52998224725", tipo: "cpf" });
    expect(lerChavePix("11.222.333/0001-81")).toEqual({ chave: "11222333000181", tipo: "cnpj" });
    expect(lerChavePix("Fulano@Email.com")).toEqual({ chave: "fulano@email.com", tipo: "email" });
    expect(lerChavePix("+55 48 99999-0000")).toEqual({ chave: "+5548999990000", tipo: "telefone" });
    expect(lerChavePix("(48) 99999-0000")).toEqual({ chave: "+5548999990000", tipo: "telefone" });
    expect(lerChavePix("123e4567-e89b-12d3-a456-426614174000")?.tipo).toBe("aleatoria");
  });
  it("recusa o que não é chave", () => {
    expect(lerChavePix("111.111.111-11")).toBeNull();
    expect(lerChavePix("abc")).toBeNull();
    expect(lerChavePix("")).toBeNull();
  });
  it("acha a chave na descrição da conta", () => {
    expect(chaveNoTexto("Saldo para envio · Pix 529.982.247-25")?.chave).toBe("52998224725");
    expect(chaveNoTexto("sem chave aqui")).toBeNull();
  });
  it("monta o pedido com valor em texto e descrição limpa", () => {
    expect(corpoPix({ chave: "x@y.com", valor: 500, descricao: "Adiantamento · Correios!" })).toEqual({ valor: "500.00", descricao: "Adiantamento Correios", destinatario: { tipo: "CHAVE", chave: "x@y.com" } });
  });
  it("lê a resposta e a consulta do Inter", () => {
    expect(situacaoDoEnvio("PROCESSADO")).toBe("pago");
    expect(situacaoDoEnvio("APROVACAO")).toBe("aguardando_aprovacao");
    expect(situacaoDaConsulta({ transacaoPix: { status: "EFETIVADO" } })).toBe("pago");
    expect(situacaoDaConsulta({ transacaoPix: { status: "CANCELADO" } })).toBe("falhou");
    expect(situacaoDaConsulta({ transacaoPix: { status: "AGUARDANDO_APROVACAO" } })).toBe("aguardando_aprovacao");
  });
});
