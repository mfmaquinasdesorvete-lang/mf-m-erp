import { describe, expect, it } from "vitest";
import { encontroDeContas, type EmpresaLigada } from "@/lib/encontroContas";
import { CARDS_PRONTOS, cardsDasRegras, classificar, type RegraPessoal } from "@/lib/pessoalCards";
import type { LancPessoal } from "@/lib/pessoal";

const empresas: EmpresaLigada[] = [
  { id: "mf", nome: "Empresa Alfa", e: { nomes: ["EMPRESA ALFA MAQUINAS LTDA"], documentos: [] } },
  { id: "b", nome: "Beta Gelados", e: { nomes: ["BETA GELADOS LTDA"], documentos: [] } },
];
const regras: RegraPessoal[] = [{ id: "r1", texto: "fornecedor xis", card: "pagou_mf", rotulo: null, sentido: "saida", da_empresa: true, observacao: null, meta_total: null, parcelas: null, ativa: true, ordem: 0 }];
const l = (id: string, descricao: string, valor: number, extra: Partial<LancPessoal> = {}): LancPessoal =>
  ({ id, conta_id: "c", data: "2026-10-10", descricao, valor, categoria: null, situacao: "realizado", anulado: false, ...extra });
const lancs = [
  l("1", "PIX ENVIADO EMPRESA ALFA MAQUINAS", -1000, { comprovante: "x.pdf" }),
  l("2", "PIX RECEBIDO EMPRESA ALFA MAQUINAS", 300),
  l("3", "PIX RECEBIDO EMPRESA ALFA MAQUINAS", 500, { categoria: "Salário e pró-labore" }),
  l("4", "PAGTO FORNECEDOR XIS", -200),
  l("5", "PIX ENVIADO BETA GELADOS", -50),
  l("6", "IFOOD", -40),
  l("7", "PIX ENVIADO BETA GELADOS", -999, { anulado: true }),
];
const todas = { nomes: empresas.flatMap((x) => x.e.nomes), documentos: [] };
const classe = new Map(lancs.map((x) => [x.id, classificar(x, { empresas: todas, regras })]));

describe("encontroDeContas", () => {
  it("soma por empresa e deixa o pró-labore à parte", () => {
    const r = encontroDeContas(lancs, { de: "2026-10-01", ate: "2026-10-31" }, empresas, classe, [...CARDS_PRONTOS, ...cardsDasRegras(regras)], "Salário e pró-labore");
    const alfa = r.find((s) => s.id === "mf")!;
    expect(alfa).toMatchObject({ enviou: 1000, pagou: 200, recebeu: 300, prolabore: 500, saldo: 900, semComprovante: 2 });
    expect(r.find((s) => s.id === "b")).toMatchObject({ enviou: 50, saldo: 50 });
    expect(r.flatMap((s) => s.itens).some((i) => i.lanc.id === "6" || i.lanc.id === "7")).toBe(false);
  });
});
