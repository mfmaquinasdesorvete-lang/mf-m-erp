import { describe, expect, it } from "vitest";
import { pedidoGrava } from "../verComo";

const U = "https://projeto.supabase.co";

describe("Ver como: o que fica travado enquanto simula", () => {
  it("leitura passa", () => {
    expect(pedidoGrava(`${U}/rest/v1/clientes?select=*`, "GET")).toBe(false);
    expect(pedidoGrava(`${U}/rest/v1/rpc/painel_vendas`, "POST")).toBe(false);
    expect(pedidoGrava(`${U}/rest/v1/rpc/minha_sessao_viva`, "POST")).toBe(false);
    expect(pedidoGrava(`${U}/storage/v1/object/sign/produtos-fotos/a.jpg`, "POST")).toBe(false);
    expect(pedidoGrava(`${U}/storage/v1/object/list/produtos-fotos`, "POST")).toBe(false);
    expect(pedidoGrava(`${U}/auth/v1/token?grant_type=refresh_token`, "POST")).toBe(false);
  });

  it("gravação em tabela, função que grava, Edge Function e envio de arquivo ficam travados", () => {
    expect(pedidoGrava(`${U}/rest/v1/clientes`, "POST")).toBe(true);
    expect(pedidoGrava(`${U}/rest/v1/clientes?id=eq.1`, "PATCH")).toBe(true);
    expect(pedidoGrava(`${U}/rest/v1/clientes?id=eq.1`, "DELETE")).toBe(true);
    expect(pedidoGrava(`${U}/rest/v1/rpc/aprovar_pedido`, "POST")).toBe(true);
    expect(pedidoGrava(`${U}/rest/v1/rpc/lancar_do_extrato`, "POST")).toBe(true);
    expect(pedidoGrava(`${U}/rest/v1/rpc/derrubar_sessoes`, "POST")).toBe(true);
    expect(pedidoGrava(`${U}/functions/v1/nfe-emitir`, "POST")).toBe(true);
    expect(pedidoGrava(`${U}/storage/v1/object/produtos-fotos/a.jpg`, "POST")).toBe(true);
  });
});
