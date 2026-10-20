import { describe, expect, it } from "vitest";
import { guiaRejeicao, indicadoresFaturamento, pendenciasFaturar, textoHoras, type PedidoFat } from "../faturamento";

const cliente = { nome: "Sorveteria X", cpf_cnpj: "11.222.333/0001-81", inscricao_estadual: "", contribuinte_icms: 9, tipo_pessoa: "PJ",
  logradouro: "Rua A", numero: "10", bairro: "Centro", municipio: "Franca", uf: "SP", cep: "14400-000" };
const base: PedidoFat = { id: "p1", numero: 1, status: "aprovado", cliente, itens: [{ produto_id: "a", descricao: "Pá", quantidade: 1 }], notas: [] };
const ncm = (id: string) => (id === "a" ? "8418.69.99" : null);

describe("pendenciasFaturar", () => {
  it("pedido completo está pronto", () => expect(pendenciasFaturar(base, ncm)).toEqual([]));
  it("barra o que a SEFAZ recusaria", () => {
    const p = { ...base, status: "orcamento", id_externo: "tiny:9", cliente: { ...cliente, cep: "", contribuinte_icms: 1 },
      itens: [{ produto_id: "b", descricao: "Motor", quantidade: 1 }], notas: [] };
    const f = pendenciasFaturar(p, ncm);
    expect(f).toContain("venda não aprovada");
    expect(f).toContain("veio do Tiny (nota feita lá)");
    expect(f.join()).toMatch(/sem CEP/);
    expect(f).toContain("inscrição estadual do cliente a conferir");
    expect(f.join()).toMatch(/sem NCM: Motor/);
  });
  it("com nota não repete \"já faturado\"", () =>
    expect(pendenciasFaturar({ ...base, status: "faturado", notas: [{ status: "autorizada" }] }, ncm)).toEqual(["já tem NF-e"]));
  it("nota de teste não conta como nota", () => expect(pendenciasFaturar({ ...base, notas: [{ status: "autorizada", ambiente: "homologacao" }] }, ncm)).toEqual([]));
});

describe("guiaRejeicao", () => {
  it("reconhece as mensagens reais", () => {
    expect(guiaRejeicao("Rejeicao: Destinatario nao habilitado a operar na UF")?.titulo).toMatch(/baixada ou suspensa/);
    expect(guiaRejeicao("Rejeicao: IE do destinatario invalida")?.titulo).toMatch(/Inscrição estadual do cliente errada/);
    expect(guiaRejeicao("Rejeicao: CST com beneficio fiscal e nao informado o codigo de beneficio fiscal [nItem:1]")?.titulo).toMatch(/cBenef/);
    expect(guiaRejeicao("Rejeicao: IBS/CBS não informado")?.titulo).toMatch(/Reforma/);
    expect(guiaRejeicao("Rejeição: Duplicidade de NF-e")?.titulo).toMatch(/duplicidade/);
    expect(guiaRejeicao("algo inédito")).toBeNull();
    expect(guiaRejeicao(null)).toBeNull();
  });
});

describe("indicadoresFaturamento", () => {
  it("acerto de primeira, tempo e motivos", () => {
    const r = indicadoresFaturamento([
      { status: "autorizada", tentativas: 2, historico_envios: [{ mensagem: "Rejeicao: IBS/CBS não informado" }], created_at: "2026-10-09T12:00:00Z", pedido_aprovado_em: "2026-10-09T10:00:00Z" },
      { status: "autorizada", tentativas: 1, created_at: "2026-10-10T12:00:00Z", pedido_aprovado_em: "2026-10-10T08:00:00Z" },
      { status: "erro", mensagem: "Rejeicao: IE do destinatario invalida", created_at: "2026-10-10T12:00:00Z" },
      { status: "cancelada", created_at: "2026-10-10T12:00:00Z" },
      { status: "autorizada", ambiente: "homologacao", created_at: "2026-10-10T12:00:00Z" },
      { status: "autorizada", origem: "importada", created_at: "2026-10-10T12:00:00Z" },
    ], 1);
    expect(r.envios).toBe(5);
    expect(r.recusas).toBe(2);
    expect(r.acertoPrimeira).toBe(60);
    expect(r.horasAteNota).toBe(3);
    expect(r.canceladas).toBe(1);
    expect(r.motivos).toHaveLength(2);
    expect(textoHoras(3)).toBe("3 h");
    expect(textoHoras(72)).toBe("3 dias");
  });
});
