import { describe, expect, it } from "vitest";
import { acharCadastro, ehBannerDrFrost, linkInstagram } from "../tecnicos";

describe("linkInstagram", () => {
  it("mantém o endereço completo do Instagram", () => {
    expect(linkInstagram("https://www.instagram.com/perfil.teste/")).toBe("https://www.instagram.com/perfil.teste/");
  });
  it("monta o link a partir de @perfil ou do perfil", () => {
    expect(linkInstagram("@perfil_teste")).toBe("https://instagram.com/perfil_teste");
    expect(linkInstagram("instagram.com/perfil")).toBe("https://instagram.com/perfil");
  });
  it("outro site ou vazio não vira link", () => {
    expect(linkInstagram("https://exemplo.com.br")).toBeNull();
    expect(linkInstagram("")).toBeNull();
    expect(linkInstagram(null)).toBeNull();
  });
});

describe("ehBannerDrFrost", () => {
  it("reconhece a imagem do anúncio", () => {
    expect(ehBannerDrFrost("https://drfrost.com.br/wp-content/uploads/2025/07/x-300x300.webp")).toBe(true);
    expect(ehBannerDrFrost("https://exemplo.supabase.co/storage/v1/object/public/tecnicos/logo.png")).toBe(false);
  });
});

describe("acharCadastro", () => {
  const lista = [
    { nome: "Joao Parceiro", tipo: "parceiro" },
    { nome: "João da Equipe", tipo: "interno" },
    { nome: "Maria Souza", tipo: "interno" },
  ];
  it("acha pelo nome completo, sem acento", () => {
    expect(acharCadastro(lista, "maria souza")?.nome).toBe("Maria Souza");
  });
  it("pelo primeiro nome, só entre os da equipe", () => {
    expect(acharCadastro(lista, "João")?.nome).toBe("João da Equipe");
  });
  it("sem nome ou sem cadastro: nada", () => {
    expect(acharCadastro(lista, "")).toBeNull();
    expect(acharCadastro(lista, "Pedro")).toBeNull();
  });
});
