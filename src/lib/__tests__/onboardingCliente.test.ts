import { describe, expect, it } from "vitest";
import { docParaConferir, errosDoPasso, faltasDoPasso, PASSOS, passoLiberado, resumoDoPasso } from "../onboardingCliente";

const CNPJ = "11222333000181"; // CNPJ de exemplo (dígitos certos)

describe("cadastro de cliente passo a passo", () => {
  it("o nome é o único obrigatório; formato errado segura o passo, campo vazio não", () => {
    expect(errosDoPasso("quem", { tipo_pessoa: "PJ" }).map((e) => e.erro)).toEqual(["Informe a razão social"]);
    expect(errosDoPasso("quem", { tipo_pessoa: "PF", nome: "Ana", cpf_cnpj: "123" })[0].erro).toMatch(/^CPF\/CNPJ: /);
    expect(errosDoPasso("quem", { tipo_pessoa: "PJ", nome: "Gelato", cpf_cnpj: CNPJ })).toEqual([]);
    expect(errosDoPasso("contato", {})).toEqual([]);
    expect(errosDoPasso("contato", { email: "ana@" }).map((e) => e.campo)).toEqual(["email"]);
  });

  it("o endereço de cobrança só é conferido quando é diferente", () => {
    expect(errosDoPasso("endereco", { cobranca_cep: "1" })).toEqual([]);
    expect(errosDoPasso("endereco", { cobranca_diferente: true, cobranca_cep: "1" }).map((e) => e.campo)).toEqual(["cobranca_cep"]);
  });

  it("o que falta para a ficha completa aparece no passo certo, sem a assinatura", () => {
    const c = { tipo_pessoa: "PJ", nome: "Gelato", cpf_cnpj: CNPJ, contribuinte_icms: 1 };
    expect(faltasDoPasso("quem", c)).toEqual(["Inscrição estadual"]);
    expect(faltasDoPasso("contato", c)).toEqual(["WhatsApp ou telefone", "E-mail"]);
    expect(faltasDoPasso("venda", c)).toEqual(["Vendedor"]);
    expect(faltasDoPasso("revisao", c)).toEqual([]);
  });

  it("um passo com erro segura os seguintes", () => {
    expect(passoLiberado({})).toBe(0);
    expect(passoLiberado({ nome: "Ana", email: "x" })).toBe(1);
    expect(passoLiberado({ nome: "Ana" })).toBe(PASSOS.length - 1);
  });

  it("só procura repetido com o documento completo e válido", () => {
    expect(docParaConferir("11.222.333/0001-81")).toBe(CNPJ);
    expect(docParaConferir("11.222.333/0001-80")).toBeNull();
    expect(docParaConferir("123")).toBeNull();
  });

  it("resumo da revisão em poucas linhas", () => {
    const c = { tipo_pessoa: "PJ", nome: "Gelato Nobre Ltda", nome_fantasia: "Gelato Nobre", cpf_cnpj: "11.222.333/0001-81", contribuinte_icms: 1, inscricao_estadual: "123",
      logradouro: "Rua A", numero: "10", bairro: "Centro", municipio: "Tubarão", uf: "SC", cep: "88700-000", compra_maquina_em: "2020-10-01", condicao_pagamento: "30 60" };
    expect(resumoDoPasso("quem", c)).toEqual(["Pessoa jurídica · 11.222.333/0001-81", 'Gelato Nobre Ltda · "Gelato Nobre"', "Contribuinte de ICMS · IE 123"]);
    expect(resumoDoPasso("endereco", c)).toEqual(["Rua A, 10", "Centro · Tubarão/SC · CEP 88700-000"]);
    expect(resumoDoPasso("venda", c, { vendedor: "Bia", forma: "Pix", tipos: ["Revenda"] })).toEqual(["Vendedor: Bia · Pix · 30 60", "Também é: Revenda", "Comprou máquina em 10/2020"]);
    expect(resumoDoPasso("contato", {})).toEqual([]);
    expect(resumoDoPasso("contato", { whatsapp: "48999990000", email: "a@b.com" })).toEqual(["WhatsApp (48) 99999-0000", "a@b.com"]);
    expect(resumoDoPasso("quem", { tipo_pessoa: "PJ", cpf_cnpj: "11222333000181", nome: "X" })[0]).toBe("Pessoa jurídica · 11.222.333/0001-81");
  });
});
