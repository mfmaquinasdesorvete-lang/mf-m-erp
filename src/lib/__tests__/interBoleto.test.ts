import { describe, expect, it } from "vitest";
import {
  codigosDoAviso, corpoCobranca, enderecoBoleto, formatarLinha, lerCobranca, limparTexto, pagadorInter, seuNumero,
} from "../../../supabase/functions/_shared/inter-boleto";

const cliente = {
  nome: "Sorveteria Exemplo Ltda", cpf_cnpj: "12.345.678/0001-90", email: "financeiro@exemplo.com.br; outro@exemplo.com.br",
  whatsapp: "+55 (48) 99999-1234", cep: "88000-000", logradouro: "Rua das Flores", numero: "100", complemento: "Sala 2",
  bairro: "Centro", municipio: "Florianópolis", uf: "sc",
};

describe("pagador do boleto", () => {
  it("monta o pagador com o tipo de pessoa pelo documento, telefone em DDD + número e o primeiro e-mail válido", () => {
    const { pagador, faltando } = pagadorInter(cliente);
    expect(faltando).toEqual([]);
    expect(pagador).toMatchObject({
      cpfCnpj: "12345678000190", tipoPessoa: "JURIDICA", cep: "88000000", uf: "SC", cidade: "Florianopolis",
      email: "financeiro@exemplo.com.br", ddd: "48", telefone: "999991234",
    });
    expect(pagadorInter({ ...cliente, cpf_cnpj: "123.456.789-01" }).pagador?.tipoPessoa).toBe("FISICA");
  });
  it("diz o que falta no cadastro", () => {
    expect(pagadorInter({ nome: "Fulano", cpf_cnpj: "123" }).faltando).toEqual(["CPF ou CNPJ", "CEP", "endereço (rua)", "cidade", "UF"]);
    expect(pagadorInter(null).faltando).toEqual(["cliente na conta"]);
  });
  it("usa o endereço de cobrança quando o cliente tem um diferente e completo", () => {
    const outro = { ...cliente, cobranca_diferente: true, cobranca_cep: "01001-000", cobranca_logradouro: "Praça da Sé", cobranca_municipio: "São Paulo", cobranca_uf: "SP" };
    expect(enderecoBoleto(outro).municipio).toBe("São Paulo");
    expect(enderecoBoleto({ ...outro, cobranca_cep: "" }).municipio).toBe("Florianópolis");
  });
  it("tira acentos e símbolos e respeita o tamanho", () => {
    expect(limparTexto("Açaí & Cia — Ltda.", 100)).toBe("Acai & Cia Ltda.");
    expect(limparTexto("x".repeat(120), 100)).toHaveLength(100);
  });
});

describe("pedido de emissão", () => {
  it("valor, vencimento, multa, juros, dias para baixa e formas Boleto + Pix", () => {
    const corpo = corpoCobranca({
      contaId: "0a1b2c3d-4e5f-6789-abcd-ef0123456789", valor: 1500.456, vencimento: "2026-11-10", pagador: { nome: "X" },
      regras: { multa_pct: 2, juros_mes_pct: 1, dias_baixa: 90, mensagem: "Não receber após 30 dias" }, descricao: "Venda 123 · parcela 1/3",
    });
    expect(corpo).toMatchObject({
      seuNumero: "0A1B2C3D4E5F", valorNominal: 1500.46, dataVencimento: "2026-11-10", numDiasAgenda: 60,
      multa: { codigo: "PERCENTUAL", taxa: 2 }, mora: { codigo: "TAXAMENSAL", taxa: 1 }, formasRecebimento: ["BOLETO", "PIX"],
      mensagem: { linha1: "Venda 123 parcela 1/3", linha2: "Nao receber apos 30 dias" },
    });
  });
  it("sem multa e juros quando zerados e recusa valor abaixo de R$ 2,50", () => {
    const corpo = corpoCobranca({ contaId: "a", valor: 10, vencimento: "2026-11-10", pagador: {}, regras: { multa_pct: 0, juros_mes_pct: 0 } });
    expect(corpo).not.toHaveProperty("multa");
    expect(corpo).not.toHaveProperty("mora");
    expect(() => corpoCobranca({ contaId: "a", valor: 2, vencimento: "2026-11-10", pagador: {} })).toThrow(/2,50/);
  });
  it("seu número tem até 15 caracteres e muda na reemissão", () => {
    expect(seuNumero("0a1b2c3d-4e5f-6789-abcd-ef0123456789", 2)).toBe("0A1B2C3D4E5F-2");
    expect(seuNumero("0a1b2c3d-4e5f-6789-abcd-ef0123456789", 12).length).toBeLessThanOrEqual(15);
  });
});

describe("resposta e aviso do Inter", () => {
  it("lê situação, valores, linha digitável e Pix", () => {
    const r = lerCobranca({
      cobranca: { situacao: "RECEBIDO", dataSituacao: "2026-11-09T10:00:00", valorTotalRecebido: "1530.10", origemRecebimento: "PIX" },
      boleto: { nossoNumero: "123", linhaDigitavel: "07790.00116 12345.678901 23456.789012 3 98760000150046", codigoBarras: "0779" },
      pix: { txid: "abc", pixCopiaECola: "000201..." },
    });
    expect(r).toMatchObject({ situacao: "RECEBIDO", situacao_data: "2026-11-09", valor_recebido: 1530.1, origem_recebimento: "PIX", pix_copia_cola: "000201..." });
    expect(r.linha_digitavel).toHaveLength(47);
    expect(lerCobranca({ cobranca: { situacao: "OUTRA" } }).situacao).toBe("EM_PROCESSAMENTO");
  });
  it("aceita só códigos no formato do Inter, sem repetir", () => {
    const id = "0a1b2c3d-4e5f-6789-abcd-ef0123456789";
    expect(codigosDoAviso([{ codigoSolicitacao: id }, { codigoSolicitacao: id }, { codigoSolicitacao: "x; drop" }])).toEqual([id]);
    expect(codigosDoAviso({ codigoSolicitacao: id })).toEqual([id]);
    expect(codigosDoAviso("texto")).toEqual([]);
  });
  it("formata a linha digitável", () => {
    expect(formatarLinha("07790001161234567890123456789012398760000150046")).toBe("07790.00116 12345.678901 23456.789012 3 98760000150046");
  });
});
