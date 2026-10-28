// Regras tiradas de dentro das telas (28/10, Clean Code): avisos do sino e atalhos dos campos com máscara.
import { describe, expect, it } from "vitest";
import { acaoDoHistorico, dicaDoSom, linhaRemetente } from "@/components/Notificacoes";
import { atalhoDoCampo, tecladoDoCampo } from "@/components/CrudPage";

describe("avisos do sino", () => {
  it("falta o meu ciente: volta para o meio da tela, mesmo com link ou conversa", () => {
    expect(acaoDoHistorico({ conversa_id: 1, link: "/x" }, true)).toBe("meio_da_tela");
  });
  it("conversa sem link abre a conversa; com link abre o link", () => {
    expect(acaoDoHistorico({ conversa_id: 1, link: null }, false)).toBe("conversa");
    expect(acaoDoHistorico({ conversa_id: 1, link: "/x" }, false)).toBe("abrir");
    expect(acaoDoHistorico({ conversa_id: null, link: null }, false)).toBe("abrir");
  });
  it("linha de quem mandou", () => {
    const quando = "2026-10-27T13:00:00Z";
    expect(linhaRemetente({ remetente_nome: "Ana", created_at: quando }, false)).toMatch(/^De Ana · \d/);
    expect(linhaRemetente({ remetente_nome: "Ana", created_at: quando }, true)).toMatch(/^Você enviou · \d/);
    expect(linhaRemetente({ remetente_nome: null, created_at: quando }, false)).toMatch(/^\d/);
  });
  it("dica do som só no urgente e nos chats", () => {
    expect(dicaDoSom(true, false, false)).toMatch(/urgente repete/);
    expect(dicaDoSom(false, true, true)).toMatch(/30 segundos/);
    expect(dicaDoSom(false, true, false)).toBe("Som desligado.");
    expect(dicaDoSom(false, false, true)).toBeNull();
  });
});

describe("atalhos dos campos com máscara", () => {
  it("WhatsApp com o primeiro nome na saudação", () => {
    const a = atalhoDoCampo("whatsapp", "48999998888", { nome_fantasia: "Açaí Bom" });
    expect(a?.titulo).toBe("Chamar no WhatsApp");
    expect(decodeURIComponent(a!.href)).toContain("Olá, Açaí!");
  });
  it("telefone sem o 55 repetido; e-mail; outras máscaras sem atalho", () => {
    expect(atalhoDoCampo("telefone", "554833334444", {})?.href).toBe("tel:+554833334444");
    expect(atalhoDoCampo("email", "a@b.com", {})?.href).toBe("mailto:a@b.com");
    expect(atalhoDoCampo("cep", "88000000", {})).toBeNull();
  });
  it("teclado do celular", () => {
    expect(tecladoDoCampo("email")).toBe("email");
    expect(tecladoDoCampo("ie")).toBe("text");
    expect(tecladoDoCampo("cnpj")).toBe("numeric");
  });
});
