import { describe, expect, it } from "vitest";
import { normalizarResumo, podeResumir } from "../../../supabase/functions/_shared/ia-resumo";

describe("IA do resumo de documentos", () => {
  it("documento de funcionário ou pessoal nunca vai para a IA; só PDF e foto", () => {
    expect(podeResumir({ entidade: "funcionario", tipo: "application/pdf" })).toBe(false);
    expect(podeResumir({ entidade: "pessoal", tipo: "application/pdf" })).toBe(false);
    expect(podeResumir({ entidade: "cliente", tipo: "application/pdf", tamanho: 1000 })).toBe(true);
    expect(podeResumir({ entidade: "cliente", tipo: "application/vnd.ms-excel" })).toBe(false);
    expect(podeResumir({ entidade: "cliente", tipo: "image/png", tamanho: 30 * 1024 * 1024 })).toBe(false);
  });
  it("limpa a resposta e tira par sem campo", () => {
    const r = normalizarResumo({ resumo: "  Contrato  de licença ", pontos: ["a", "", 3], datas: [{ data: "10/11/2026", o_que: "vence" }, { data: "", o_que: "x" }] });
    expect(r.tipo_documento).toBe("Documento");
    expect(r.resumo).toBe("Contrato de licença");
    expect(r.pontos).toEqual(["a"]);
    expect(r.datas).toEqual([{ data: "10/11/2026", o_que: "vence" }]);
    expect(r.valores).toEqual([]);
  });
});
