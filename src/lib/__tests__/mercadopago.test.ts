import { describe, expect, it } from "vitest";
import { conferirPagamentoMP, erroMP, pagamentoDoAviso, preferenciaMP, secretsMP, tokenMP, type PagamentoMP } from "../../../supabase/functions/_shared/mercadopago";

const LINK = "11111111-2222-3333-4444-555555555555";

describe("link do Mercado Pago (Checkout)", () => {
  it("chave da unidade antes da geral, sem espaços colados", () => {
    expect(secretsMP("sp")).toEqual(["MERCADOPAGO_ACCESS_TOKEN_SP", "MERCADOPAGO_ACCESS_TOKEN"]);
    const env = (n: string) => ({ MERCADOPAGO_ACCESS_TOKEN: " APP_USR-geral \n", MERCADOPAGO_ACCESS_TOKEN_SP: "APP_USR-sp" } as Record<string, string>)[n];
    expect(tokenMP("SP", env)).toEqual({ token: "APP_USR-sp", secret: "MERCADOPAGO_ACCESS_TOKEN_SP" });
    expect(tokenMP("SC", env)).toEqual({ token: "APP_USR-geral", secret: "MERCADOPAGO_ACCESS_TOKEN" });
    expect(tokenMP("SC", () => undefined)).toBeNull();
  });

  it("preferência só no cartão (sem Pix e boleto), até 12x, com o link do ERP e o aviso de volta", () => {
    const p = preferenciaMP({ id: LINK, descricao: "Pedido #12", valor: 1000.005, cliente: { nome: "Cliente Exemplo", email: "sem-email" }, avisoUrl: "https://x.supabase.co/functions/v1/infinitepay" });
    expect(p.external_reference).toBe(LINK);
    expect(p.notification_url).toBe(`https://x.supabase.co/functions/v1/infinitepay?mp=${LINK}`);
    expect(p.items[0]).toMatchObject({ title: "Pedido #12", quantity: 1, currency_id: "BRL", unit_price: 1000.01 });
    expect(p.payment_methods.excluded_payment_types.map((t) => t.id)).toEqual(["ticket", "bank_transfer", "atm"]);
    expect(p.payment_methods.installments).toBe(12);
    expect(p.payer).toEqual({ name: "Cliente Exemplo" });
  });

  it("número do pagamento no aviso: no corpo ou na URL; outros avisos são ignorados", () => {
    const u = (q: string) => new URL(`https://x.supabase.co/functions/v1/infinitepay?mp=${LINK}${q}`);
    expect(pagamentoDoAviso(u(""), { type: "payment", data: { id: "123456789" } })).toBe("123456789");
    expect(pagamentoDoAviso(u("&data.id=987654321&type=payment"), null)).toBe("987654321");
    expect(pagamentoDoAviso(u("&topic=payment&id=55556666"), null)).toBe("55556666");
    expect(pagamentoDoAviso(u("&topic=merchant_order&id=55556666"), null)).toBeNull();
    expect(pagamentoDoAviso(u(""), { type: "payment", data: { id: "abc" } })).toBeNull();
  });

  it("confere o pagamento: aprovado, do link, em reais, valor certo; taxa só a paga pela MF", () => {
    const pg = (x: Partial<PagamentoMP>): PagamentoMP => ({
      id: 123, status: "approved", external_reference: LINK, currency_id: "BRL", transaction_amount: 1000, installments: 3, payment_type_id: "credit_card",
      fee_details: [{ type: "mercadopago_fee", amount: 29.9, fee_payer: "collector" }, { type: "financing_fee", amount: 28.5, fee_payer: "collector" }, { type: "financing_fee", amount: 40, fee_payer: "payer" }],
      ...x,
    });
    expect(conferirPagamentoMP(pg({}), LINK, 1000)).toMatchObject({ ok: true, nsu: "123", taxa: 58.4, parcelas: 3, metodo: "credit_card", valor: 1000 });
    expect(conferirPagamentoMP(pg({ status: "pending" }), LINK, 1000).ok).toBe(false);
    expect(conferirPagamentoMP(pg({ external_reference: "outro" }), LINK, 1000).ok).toBe(false);
    expect(conferirPagamentoMP(pg({ transaction_amount: 999.99 }), LINK, 1000)).toMatchObject({ ok: false });
    expect(conferirPagamentoMP(pg({ currency_id: "USD" }), LINK, 1000).ok).toBe(false);
  });

  it("chave recusada vira mensagem clara", () => {
    expect(erroMP(401, null)).toMatch(/Access Token/);
    expect(erroMP(400, { message: "invalid unit_price" })).toBe("O Mercado Pago recusou o pedido (400): invalid unit_price");
  });
});
