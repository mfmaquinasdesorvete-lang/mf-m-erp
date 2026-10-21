import { describe, expect, it, vi } from "vitest";
vi.mock("../supabase", () => ({ supabase: {} }));
import { ehLinkCalameo, linkDocumento } from "../midia";

describe("documento por link", () => {
  it("Calameo vira o leitor público", () => {
    expect(linkDocumento("https://pt.calameo.com/read/004298899c5f991178b13")).toBe("https://www.calameo.com/read/004298899c5f991178b13");
    expect(linkDocumento("www.calameo.com/books/007036950abcdef12345?authid=x")).toBe("https://www.calameo.com/read/007036950abcdef12345");
    expect(linkDocumento("https://v.calameo.com/?bkcode=007036950abcdef12345")).toBe("https://www.calameo.com/read/007036950abcdef12345");
    expect(ehLinkCalameo("https://www.calameo.com/read/007036950abcdef12345")).toBe(true);
  });
  it("outros sites passam em https e texto solto é recusado", () => {
    expect(linkDocumento("http://exemplo.com.br/manual.pdf")).toBe("https://exemplo.com.br/manual.pdf");
    expect(linkDocumento("manual da prime")).toBeNull();
    expect(linkDocumento("javascript:alert(1)")).toBeNull();
  });
});
