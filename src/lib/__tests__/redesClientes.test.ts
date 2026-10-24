import { describe, expect, it } from "vitest";
import { familiaRede, nomeRede, redesDoCliente } from "@/lib/redesClientes";

describe("redes de clientes", () => {
  it("só os marcadores que começam com F - são de rede", () => {
    expect(nomeRede("F - Açaí Super - Lucas")).toBe("Açaí Super - Lucas");
    expect(nomeRede("F -  JUISTREET")).toBe("JUISTREET");
    expect(nomeRede("MF - Top 300")).toBeNull();
    expect(nomeRede("Backup Tiny MF")).toBeNull();
  });

  it("separa as famílias pela cor", () => {
    expect(familiaRede("Milk Shake UP")).toBe("milkshake");
    expect(familiaRede("Milk Shake MIX")).toBe("milkshake");
    expect(familiaRede("Ki Açaí Benedito")).toBe("acai");
    expect(familiaRede("Acai Beat")).toBe("acai");
    expect(familiaRede("MY SORV")).toBe("myfrost");
    expect(familiaRede("Trololo")).toBe("outra");
  });

  it("licenciado My Frost vira a rede das My Frost Sorveterias, sem repetir", () => {
    expect(redesDoCliente([], ["licenciado_my_frost"])).toEqual([{ nome: "My Frost Sorveterias", familia: "myfrost", marcadorId: null }]);
    const r = redesDoCliente([{ id: "a", nome: "F - MY SORV" }], ["licenciado_my_frost"]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ nome: "My Frost Sorveterias", marcadorId: "a" });
  });

  it("açaí e milk shake vêm antes das outras (dão a cor do cartão)", () => {
    const r = redesDoCliente([{ id: "1", nome: "F - Trololo" }, { id: "2", nome: "F - Milk Shake UP" }, { id: "3", nome: "Backup Tiny MF" }], []);
    expect(r.map((x) => x.familia)).toEqual(["milkshake", "outra"]);
  });
});
