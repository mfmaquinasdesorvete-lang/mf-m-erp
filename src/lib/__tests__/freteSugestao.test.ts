import { describe, expect, it } from "vitest";
import { atendeDestino, sugerirTransportadoras } from "../freteSugestao";

const t = (id: string, regioes: string | null, whatsapp: string | null = "48999990000", abrangencia: string[] = []) =>
  ({ id, nome: `Transp ${id}`, regioes, whatsapp, telefone: null, abrangencia, ativo: true }) as any;

describe("cotação rápida de frete", () => {
  it("sabe se atende o destino pela UF, pela cidade ou por atender o Brasil todo", () => {
    expect(atendeDestino(t("a", "SC, PR, RS"), "SP")).toBe(false);
    expect(atendeDestino(t("a", "SC, PR, RS"), "PR")).toBe(true);
    expect(atendeDestino(t("b", "Atende todo o Brasil"), "AM")).toBe(true);
    expect(atendeDestino(t("c", null), "SP")).toBe(null);
    expect(atendeDestino(t("d", "Grande São Paulo e Campinas"), "MG", "Campinas")).toBe(true);
  });

  it("mostra só as poucas que atendem, com WhatsApp e já usadas primeiro; as que não atendem ficam fora", () => {
    const lista = [t("sul", "SC, PR, RS"), t("br", "todo o Brasil"), t("sp", "SP"), t("sem", null, null), t("sp2", "SP", null), t("x", "SP"), t("y", "SP")];
    const r = sugerirTransportadoras(lista, "SP", "Campinas", ["y"]);
    expect(r).toHaveLength(4);
    expect(r[0]!.id).toBe("y");
    expect(r.map((x) => x.id)).not.toContain("sul");
  });
});
