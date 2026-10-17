import { describe, expect, it } from "vitest";
import { origemNoTexto } from "../auditoria";

const pedidos = [{ id: "p1", numero: 410, numero_externo: "580" }, { id: "p2", numero: 580, numero_externo: null }];

describe("origem escrita na descrição da conta", () => {
  it("pedido do Tiny citado que existe no ERP é a origem", () => {
    const o = origemNoTexto("Venda no cartão por link Olist · pedido Tiny nº 580 · Cliente (3×)", pedidos);
    expect(o?.tipo === "pedido" && o.pedido.id).toBe("p1");
  });
  it("pedido citado que não está no ERP continua sem origem, com o número", () => {
    expect(origemNoTexto("pedido Tiny nº 999", pedidos)).toEqual({ tipo: "pedido_ausente", citado: "999" });
  });
  it("número ambíguo (Tiny e ERP) sem dizer Tiny não decide sozinho", () => {
    expect(origemNoTexto("pedido nº 580", pedidos)?.tipo).toBe("pedido_ausente");
  });
  it("recebido por conta de terceiros vira a sua própria exceção", () => {
    expect(origemNoTexto("Licenciamento — recebido pela InfinitePay SP por conta de terceiros · aguardando o contador", pedidos)).toEqual({ tipo: "terceiros" });
    expect(origemNoTexto("Pix recebido", pedidos)).toBeNull();
  });
});
