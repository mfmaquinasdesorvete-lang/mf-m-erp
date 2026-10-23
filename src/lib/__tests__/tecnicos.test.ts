import { describe, expect, it } from "vitest";
import { ehBannerDrFrost, linkInstagram } from "../tecnicos";

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
