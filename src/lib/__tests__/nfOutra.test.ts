import { describe, expect, it } from "vitest";
import { dadosDaChave, rotuloNfOutra } from "../nfOutra";

describe("NF de outra empresa", () => {
  it("lê CNPJ, série, número e mês da chave de acesso", () => {
    expect(dadosDaChave("42 2607 11222333000181 55 001 000000123 1 00000123 0")).toEqual({ cnpj: "11222333000181", serie: "1", numero: "123", mes: "2026-07" });
    expect(dadosDaChave("123")).toBeNull();
    expect(dadosDaChave(null)).toBeNull();
  });
  it("monta o rótulo curto", () => {
    expect(rotuloNfOutra({ nf_outra_numero: "123", nf_outra_empresa: "Empresa Teste Ltda" })).toBe("NF 123 · Empresa");
    expect(rotuloNfOutra({ nf_outra_numero: null })).toBeNull();
  });
});
