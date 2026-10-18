import { describe, expect, it } from "vitest";
import { conferirComReceita, type DadosCnpj } from "../cnpj";

const receita: DadosCnpj = {
  nome: "EMPRESA EXEMPLO LTDA", nome_fantasia: null, email: "contato@exemplo.com.br", telefone: "4833330000",
  cep: "88000000", logradouro: "Rua das Flores", numero: "S/N", complemento: "Galpão 2", bairro: "Centro",
  municipio: "Florianópolis", uf: "SC", situacao: "ATIVA",
  inscricoes: [{ numero: "123456789", uf: "SC", ativa: true }],
  cnae: { codigo: "2829-1/99", descricao: "Fabricação de outras máquinas" },
  cnaes_secundarios: [{ codigo: "3314-7/12", descricao: "Manutenção de máquinas" }, { codigo: "4661-3/00", descricao: "Comércio de máquinas" }],
};
const igual = {
  razao_social: "Empresa Exemplo Ltda", inscricao_estadual: "123.456.789", cep: "88000-000", logradouro: "R. das Flores",
  numero: "SN", complemento: "GALPAO 2", bairro: "centro", municipio: "Florianopolis", uf: "SC", telefone: "(48) 3333-0000",
  email: "Contato@Exemplo.com.br", cnae_principal: "2829199",
  cnaes_secundarios: [{ codigo: "3314-7/12", descricao: "" }, { codigo: "4661-3/00", descricao: "" }],
};

describe("conferirComReceita", () => {
  it("ignora máscara, acento, maiúsculas e abreviação de rua", () => {
    const r = conferirComReceita(igual, receita);
    expect(r.filter((c) => !c.igual)).toEqual([]);
  });
  it("marca para trocar o que vai na nota e deixa telefone e e-mail para a pessoa decidir", () => {
    const r = conferirComReceita({ ...igual, cep: "88111111", telefone: "48999990000", email: "outro@exemplo.com.br" }, receita);
    const por = Object.fromEntries(r.map((c) => [c.campo, c]));
    expect(por.cep).toMatchObject({ igual: false, sugerir: true });
    expect(por.telefone).toMatchObject({ igual: false, sugerir: false });
    expect(por.email).toMatchObject({ igual: false, sugerir: false });
  });
  it("campo vazio no ERP vem marcado, mesmo o telefone", () => {
    const r = conferirComReceita({ ...igual, telefone: "" }, receita);
    expect(r.find((c) => c.campo === "telefone")).toMatchObject({ igual: false, sugerir: true });
  });
  it("aponta os CNAEs secundários que faltam no ERP", () => {
    const r = conferirComReceita({ ...igual, cnaes_secundarios: [] }, receita);
    const sec = r.find((c) => c.campo === "cnaes_secundarios")!;
    expect(sec.igual).toBe(false);
    expect(sec.receita).toContain("3314-7/12");
  });
  it("CNAE principal diferente", () => {
    const r = conferirComReceita({ ...igual, cnae_principal: "3314-7/12" }, receita);
    expect(r.find((c) => c.campo === "cnae_principal")).toMatchObject({ igual: false, sugerir: true });
  });
});
