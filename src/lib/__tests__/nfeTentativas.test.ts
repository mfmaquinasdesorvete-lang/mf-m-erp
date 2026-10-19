import { describe, expect, it } from "vitest";
import { juntarTentativas } from "../../pages/NotasFiscais";
import { problemaIeDestinatario } from "../../../supabase/functions/_shared/nfe-ajustes";

const n = (id: string, status: string, pedido_id: string | null, created_at: string) => ({ id, status, pedido_id, created_at });

describe("juntarTentativas", () => {
  it("recusas do mesmo pedido viram uma linha com o número de tentativas", () => {
    const r = juntarTentativas([n("a", "erro", "p1", "2026-10-19T10:00"), n("b", "erro", "p1", "2026-10-19T11:00"), n("c", "autorizada", "p2", "2026-10-19T09:00")]);
    expect(r.map((x) => x.id)).toEqual(["b", "c"]);
    expect(r[0]._tentativas).toBe(2);
  });
  it("recusas antigas somem quando o pedido já tem nota autorizada depois", () => {
    const r = juntarTentativas([n("a", "erro", "p1", "2026-10-19T10:00"), n("b", "autorizada", "p1", "2026-10-19T11:00")]);
    expect(r.map((x) => x.id)).toEqual(["b"]);
  });
});

describe("problemaIeDestinatario", () => {
  it("IE igual ao CNPJ é recusada antes de enviar", () => {
    expect(problemaIeDestinatario("50.981.467/0001-38", "50981467000138", true)).toMatch(/próprio CNPJ/);
  });
  it("contribuinte sem IE é avisado", () => {
    expect(problemaIeDestinatario("50981467000138", "", true)).toMatch(/sem inscrição estadual/);
  });
  it("CPF e IE normal passam", () => {
    expect(problemaIeDestinatario("12345678901", "", false)).toBeNull();
    expect(problemaIeDestinatario("50981467000138", "0012345670089", true)).toBeNull();
  });
});
