import { describe, expect, it } from "vitest";
import { montarListaDocs, normalizarBuscaDocs } from "../../../supabase/functions/_shared/ia-busca-docs";

const docs = [
  { id: "a", nome: "contrato.pdf", entidade: "cliente", onde: "Cliente Sorveteria Paulínia", created_at: "2026-10-01T10:00:00Z", resumo: { tipo_documento: "Contrato", resumo: "Licença de marca" } },
  { id: "b", nome: "atestado.pdf", entidade: "funcionario", created_at: "2026-10-02T10:00:00Z" },
  { id: "c", nome: "manual A200.pdf", entidade: "geral", created_at: "2026-10-03T10:00:00Z" },
];

describe("IA da busca nos documentos", () => {
  it("documento de funcionário não entra nem pelo nome", () => {
    const { texto, codigos } = montarListaDocs(docs);
    expect(texto).not.toContain("atestado");
    expect(texto.split("\n")[0]).toBe("D1 · contrato.pdf · Cliente Sorveteria Paulínia · 2026-10-01 · - · Contrato: Licença de marca");
    expect(codigos.get("D2")?.id).toBe("c");
  });
  it("só códigos da lista, sem repetir", () => {
    const { codigos } = montarListaDocs(docs);
    expect(normalizarBuscaDocs({ achados: [{ codigo: "d2", motivo: "manual" }, { codigo: "D2", motivo: "x" }, { codigo: "D9", motivo: "y" }] }, codigos))
      .toEqual([{ id: "c", motivo: "manual" }]);
  });
});
