import { describe, expect, it } from "vitest";
import { ehLicenciado, tagsComLicenciado, TAG_LICENCIADO } from "@/components/clientes/Licenciado";

describe("licenciados da My Frost Sorveterias", () => {
  it("marca e desmarca sem repetir nem mexer nas outras etiquetas", () => {
    expect(tagsComLicenciado(null, true)).toEqual([TAG_LICENCIADO]);
    expect(tagsComLicenciado(["revenda", TAG_LICENCIADO], true)).toEqual(["revenda", TAG_LICENCIADO]);
    expect(tagsComLicenciado(["revenda", TAG_LICENCIADO, "compra_usada"], false)).toEqual(["revenda", "compra_usada"]);
    expect(tagsComLicenciado(undefined, false)).toEqual([]);
  });

  it("reconhece o cliente licenciado", () => {
    expect(ehLicenciado({ tags: ["revenda", TAG_LICENCIADO] })).toBe(true);
    expect(ehLicenciado({ tags: ["revenda"] })).toBe(false);
    expect(ehLicenciado(null)).toBe(false);
  });
});
