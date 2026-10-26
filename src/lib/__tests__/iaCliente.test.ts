import { describe, expect, it } from "vitest";
import { docValido, normalizarCliente } from "../../../supabase/functions/_shared/ia-cliente";

describe("IA do cadastro de cliente", () => {
  it("CPF e CNPJ só com o dígito verificador certo", () => {
    expect(docValido("11.222.333/0001-81")).toBe(true);
    expect(docValido("11.222.333/0001-82")).toBe(false);
    expect(docValido("529.982.247-25")).toBe(true);
    expect(docValido("111.111.111-11")).toBe(false);
  });
  it("limpa os números, confere UF, e-mail e CEP e descobre PJ pelo CNPJ", () => {
    const { dados, avisos } = normalizarCliente({
      nome: "  Gelato Nobre  Ltda ", cpf_cnpj: "11.222.333/0001-81", whatsapp: "(48) 99999-1234", telefone: "1234",
      email: "Contato@Gelato.com.br", cep: "88010-000", uf: "sc", tipo_pessoa: null,
    });
    expect(dados.nome).toBe("Gelato Nobre Ltda");
    expect(dados.cpf_cnpj).toBe("11222333000181");
    expect(dados.tipo_pessoa).toBe("PJ");
    expect(dados.whatsapp).toBe("48999991234");
    expect(dados.telefone).toBeNull();
    expect(dados.email).toBe("contato@gelato.com.br");
    expect(dados.cep).toBe("88010000");
    expect(dados.uf).toBe("SC");
    expect(avisos).toEqual([]);
  });
  it("documento lido errado vira aviso e fica vazio", () => {
    const { dados, avisos } = normalizarCliente({ cpf_cnpj: "11.222.333/0001-99", uf: "XX", email: "sem-arroba" });
    expect(dados.cpf_cnpj).toBeNull();
    expect(dados.uf).toBeNull();
    expect(dados.email).toBeNull();
    expect(avisos[0]).toContain("não confere");
  });
});

describe("esquemas das IAs", () => {
  it("nenhum esquema usa enum junto com null (a API da Anthropic recusa o pedido)", async () => {
    const modulos = await Promise.all([
      import("../../../supabase/functions/_shared/ia-cliente"), import("../../../supabase/functions/_shared/ia-itens"),
      import("../../../supabase/functions/_shared/ia-produto"), import("../../../supabase/functions/_shared/ia-voz"),
      import("../../../supabase/functions/_shared/ia-busca"), import("../../../supabase/functions/_shared/ia-manutencao"),
      import("../../../supabase/functions/_shared/ia-orcamento"), import("../../../supabase/functions/_shared/ia-texto"),
      import("../../../supabase/functions/_shared/ia-titulos"), import("../../../supabase/functions/_shared/ia-resumo"),
      import("../../../supabase/functions/_shared/ia-busca-docs"), import("../../../supabase/functions/_shared/ia-acao"),
    ]);
    const ruins: string[] = [];
    const olhar = (n: unknown, onde: string) => {
      if (!n || typeof n !== "object") return;
      const o = n as Record<string, unknown>;
      if (Array.isArray(o.enum) && (o.enum.includes(null) || (Array.isArray(o.type) && o.type.includes("null")))) ruins.push(onde);
      for (const [k, v] of Object.entries(o)) olhar(v, `${onde}.${k}`);
    };
    modulos.forEach((m, i) => Object.entries(m).filter(([k]) => k.startsWith("ESQUEMA")).forEach(([k, v]) => olhar(v, `${i}:${k}`)));
    expect(ruins).toEqual([]);
  });
});
