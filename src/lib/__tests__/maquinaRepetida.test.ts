import { describe, expect, it } from "vitest";
import { semMaquinaRepetida } from "@/components/clientes/MaquinasCliente";

describe("máquina repetida (base da My Frost sem data × nota com data)", () => {
  it("fica só a que tem data quando o modelo é o mesmo", () => {
    const l = [
      { id: "a", descricao: "My Frost Queen", data_venda: null, origem: "My Frost" },
      { id: "b", descricao: "My Frost QUEEN - Maquina de Sorvete 5 Sabores", data_venda: "2025-11-12", origem: null },
    ];
    expect(semMaquinaRepetida(l).map((m) => m.id)).toEqual(["b"]);
  });
  it("modelos diferentes, número de série ou máquina da MF sem data ficam", () => {
    const l = [
      { id: "a", descricao: "My Frost Top 300", data_venda: null, origem: "My Frost" },
      { id: "b", descricao: "My Frost Queen", data_venda: "2025-11-12", origem: null },
      { id: "c", descricao: "My Frost Queen", data_venda: null, origem: "My Frost", numero_serie: "Q-1" },
      { id: "d", descricao: "My Frost Queen", data_venda: null, origem: null },
    ];
    expect(semMaquinaRepetida(l).map((m) => m.id)).toEqual(["a", "b", "c", "d"]);
  });
});
