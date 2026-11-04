import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ supabase: {}, callFunction: vi.fn() }));
import { juntarXmls, nomeArquivoXml } from "../xmlNotas";

const CHAVE = "42261046942855000102550010000004381000004380";

describe("nomeArquivoXml", () => {
  it("usa a chave de acesso só com números", () => {
    expect(nomeArquivoXml({ id: "x", chave: `NFe${CHAVE}` })).toBe(`${CHAVE}.xml`);
  });
  it("sem chave usa o número da nota", () => {
    expect(nomeArquivoXml({ id: "abcdef123456", chave: null, numero: 438 })).toBe("NF-438.xml");
    expect(nomeArquivoXml({ id: "abcdef123456", chave: null })).toBe("NF-abcdef12.xml");
  });
});

describe("juntarXmls", () => {
  it("junta as que vieram, lista as que falharam e não para no primeiro erro", async () => {
    const notas = [
      { id: "1", chave: CHAVE, numero: 1 },
      { id: "2", chave: null, numero: 2 },
      { id: "3", chave: CHAVE, numero: 3 }, // mesma chave: não sobrescreve
      { id: "4", chave: null, numero: 4 },
    ];
    const vistos: number[] = [];
    const r = await juntarXmls(notas, async (n) => {
      if (n.id === "2") throw new Error("Focus fora");
      return `<nfe>${n.id}</nfe>`;
    }, (f) => vistos.push(f));
    expect(Object.keys(r.arquivos).sort()).toEqual([`${CHAVE}-2.xml`, `${CHAVE}.xml`, "NF-4.xml"].sort());
    expect(r.falhas.map((f) => [f.nota.id, f.erro])).toEqual([["2", "Focus fora"]]);
    expect(vistos.at(-1)).toBe(4);
  });
  it("lista vazia não busca nada", async () => {
    const buscar = vi.fn();
    expect(await juntarXmls([], buscar)).toEqual({ arquivos: {}, falhas: [] });
    expect(buscar).not.toHaveBeenCalled();
  });
});
