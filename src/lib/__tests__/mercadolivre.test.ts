import { describe, expect, it } from "vitest";
import { idDoRecurso, linkAutorizacao, normalizarPedido, siglaUF } from "../../../supabase/functions/_shared/mercadolivre";

// venda como a API do Mercado Livre devolve (só os campos que o ERP usa)
const order = {
  id: 2000009876543210, pack_id: 2000004444, status: "paid", date_created: "2026-10-15T09:10:00.000-03:00", date_closed: "2026-10-15T09:12:00.000-03:00",
  total_amount: 359.8,
  buyer: { id: 123, nickname: "COMPRADOR123", first_name: "Ana", last_name: "Souza" },
  order_items: [
    { item: { id: "MLB123456", title: "Anel de vedação do cilindro", variation_id: 180001, seller_sku: "AN-001" }, quantity: 2, unit_price: 89.9, sale_fee: 10.79 },
    { item: { id: "MLB654321", title: "Batedor inox", variation_id: null, seller_custom_field: "BT-77" }, quantity: 1, unit_price: 180, sale_fee: 21.6 },
  ],
  payments: [{ id: 99887766, status: "approved", date_approved: "2026-10-15T09:12:30.000-03:00", marketplace_fee: 43.18 }],
  shipping: { id: 41234567890 },
};
const billingV2 = {
  buyer: { billing_info: { name: "Ana", last_name: "Souza", identification: { type: "CPF", number: "111.444.777-35" },
    address: { street_name: "Rua das Flores", street_number: "100", city_name: "Campinas", state: { code: "SP", name: "São Paulo" }, zip_code: "13010-000", neighborhood: "Centro" } } },
};
const envio = { logistic: { mode: "me2", type: "cross_docking" }, destination: { receiver_name: "Ana Souza", receiver_phone: "19999990000",
  shipping_address: { zip_code: "13010000", city: { name: "Campinas" }, state: { id: "BR-SP" }, street_name: "Rua das Flores", street_number: "100" } } };
const custos = { senders: [{ user_id: 555, cost: 22.45 }], receiver: { cost: 0 } };

describe("Mercado Livre: venda no formato do ERP", () => {
  it("monta valores, tarifa, frete pago pela MF e liberação", () => {
    const v = normalizarPedido(order, { billing: billingV2, envio, custos, pagamento: { money_release_date: "2026-11-02T00:00:00.000-04:00" }, vendedorId: 555 });
    expect(v.order_id).toBe(2000009876543210);
    expect(v.pack_id).toBe(2000004444);
    expect(v.total).toBe(359.8);
    expect(v.tarifa).toBe(43.18);
    expect(v.frete_vendedor).toBe(22.45);
    expect(v.liberacao).toBe("2026-11-02");
    expect(v.logistica).toBe("cross_docking");
    expect(v.shipment_id).toBe(41234567890);
  });

  it("lê os itens com SKU (ou código do vendedor) e variação", () => {
    const v = normalizarPedido(order);
    expect(v.itens).toEqual([
      { item_id: "MLB123456", variation_id: "180001", sku: "AN-001", titulo: "Anel de vedação do cilindro", quantidade: 2, valor_unitario: 89.9 },
      { item_id: "MLB654321", variation_id: "", sku: "BT-77", titulo: "Batedor inox", quantidade: 1, valor_unitario: 180 },
    ]);
  });

  it("comprador pelos dados de faturamento (versão 2)", () => {
    const c = normalizarPedido(order, { billing: billingV2, envio }).comprador;
    expect(c).toMatchObject({ apelido: "COMPRADOR123", nome: "Ana Souza", doc: "11144477735", cep: "13010000", logradouro: "Rua das Flores",
      numero: "100", bairro: "Centro", municipio: "Campinas", uf: "SP", telefone: "19999990000" });
  });

  it("aceita o formato antigo dos dados de faturamento e cai no endereço de entrega", () => {
    const antigo = { billing_info: { doc_type: "CNPJ", doc_number: "11222333000181", additional_info: [{ type: "BUSINESS_NAME", value: "Sorveteria Boa Ltda" }] } };
    const c = normalizarPedido(order, { billing: antigo, envio }).comprador;
    expect(c.doc).toBe("11222333000181");
    expect(c.nome).toBe("Sorveteria Boa Ltda");
    expect(c.municipio).toBe("Campinas");
    expect(c.uf).toBe("SP");
  });

  it("sem pagamento registrado: tarifa pelos itens e liberação 30 dias depois da venda", () => {
    const v = normalizarPedido({ ...order, payments: [] });
    expect(v.tarifa).toBe(43.18); // 10,79 × 2 + 21,60
    expect(v.liberacao).toBe("2026-11-14");
    expect(v.frete_vendedor).toBe(0);
  });

  it("estado, recurso do aviso e link de autorização", () => {
    expect(siglaUF("BR-SP")).toBe("SP");
    expect(siglaUF("São Paulo")).toBe("SP");
    expect(siglaUF("santa catarina")).toBe("SC");
    expect(siglaUF("")).toBeNull();
    expect(idDoRecurso("/orders/2000001234", "orders")).toBe("2000001234");
    expect(idDoRecurso("/shipments/4123", "orders")).toBeNull();
    const u = new URL(linkAutorizacao("123", "https://erp.exemplo.com.br/mercado-livre/retorno", "abc"));
    expect(u.hostname).toBe("auth.mercadolivre.com.br");
    expect(u.searchParams.get("redirect_uri")).toBe("https://erp.exemplo.com.br/mercado-livre/retorno");
    expect(u.searchParams.get("state")).toBe("abc");
  });
});
