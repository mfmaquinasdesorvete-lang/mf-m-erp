import { describe, expect, it } from "vitest";
import { pedidoRepetido } from "../pedidoRepetido";

const agora = new Date("2026-10-21T15:00:00Z");
const v = (id: string, valor: number, status = "aprovado", created_at = "2026-10-21T10:00:00Z") => ({ id, numero: Number(id), valor_total: valor, status, created_at });

describe("pedidoRepetido", () => {
  it("acha a venda do mesmo valor nas últimas 24 horas", () => {
    expect(pedidoRepetido({ id: "616", total: 1500 }, [v("617", 1500)], agora)?.numero).toBe(617);
  });
  it("ignora a própria venda, a cancelada, valor diferente e a antiga", () => {
    expect(pedidoRepetido({ id: "616", total: 1500 }, [
      v("616", 1500), v("1", 1500, "cancelado"), v("2", 1499.5), v("3", 1500, "aprovado", "2026-10-19T10:00:00Z"),
    ], agora)).toBeNull();
  });
});
