import { describe, expect, it } from "vitest";
import { dominioDoCliente, extrairRedes, linkRede, linksBusca } from "../../../supabase/functions/_shared/redes-sociais";

describe("dominioDoCliente", () => {
  it("usa o campo Site", () => {
    expect(dominioDoCliente({ website: "https://www.sorveteriaboa.com.br/contato" })).toBe("sorveteriaboa.com.br");
  });
  it("sem site, usa o domínio do e-mail que não é gratuito", () => {
    expect(dominioDoCliente({ email: "compras@gelatobom.com.br" })).toBe("gelatobom.com.br");
    expect(dominioDoCliente({ email: "fulano@gmail.com" })).toBeNull();
    expect(dominioDoCliente({ email: "a@hotmail.com; vendas@acai.com" })).toBe("acai.com");
  });
  it("Instagram no campo Site não é site", () => {
    expect(dominioDoCliente({ website: "instagram.com/loja", email: "x@uol.com.br" })).toBeNull();
  });
});

describe("extrairRedes", () => {
  it("acha o perfil de cada rede e ignora botões de compartilhar", () => {
    const html = `<a href="https://www.facebook.com/sharer/sharer.php?u=x">c</a>
      <a href="https://www.instagram.com/p/abc123/">post</a>
      <a href="https://www.instagram.com/Sorveteria.Boa/">ig</a>
      <a href="https://www.facebook.com/sorveteriaboa">fb</a>
      <a href="https://www.tiktok.com/@SorveteriaBoa">tt</a>`;
    expect(extrairRedes(html)).toEqual({ instagram: "@sorveteria.boa", facebook: "facebook.com/sorveteriaboa", tiktok: "@sorveteriaboa" });
  });
  it("lê links escapados em JSON", () => {
    expect(extrairRedes('{"ig":"https:\\/\\/instagram.com\\/acai_top"}').instagram).toBe("@acai_top");
  });
  it("sem links, nada", () => expect(extrairRedes("<p>oi</p>")).toEqual({}));
});

describe("links", () => {
  it("monta a busca sem LTDA", () => {
    const l = linksBusca({ nome: "Gelato Bom LTDA", municipio: "Joinville", uf: "SC" });
    expect(decodeURIComponent(l.google)).toContain("Gelato Bom Joinville SC instagram");
  });
  it("link do perfil", () => {
    expect(linkRede("instagram", "@acai_top")).toBe("https://www.instagram.com/acai_top");
    expect(linkRede("facebook", "facebook.com/x")).toBe("https://facebook.com/x");
    expect(linkRede("tiktok", "")).toBeNull();
  });
});
