import { describe, expect, it } from "vitest";
import { atrasada, etapaDaPeca, ocorrenciaEntregue, previsaoDaPeca, type NotaCompra, type PecaCompra } from "../acompanhamentoCompras";

const peca = (p: Partial<PecaCompra> = {}): PecaCompra => ({
  item_id: "i", descricao: "Inversor", sku: null, produto_id: null, quantidade: 4, recebida: 0, valor: null,
  oc_id: "o", oc_numero: 248, oc_status: "enviado", oc_data: "2026-10-23", enviado_em: null, recebido_em: null,
  previsao: "2026-10-26", fornecedor: "F", unidade_id: null, op_numero: null, transportadora: null, notas_soltas: 0, notas: [], ...p,
});
const nota = (n: Partial<NotaCompra> = {}): NotaCompra => ({
  id: "n", numero: "10", emissao: "2026-10-24", chegou_em: null, chegou_como: null, processamento: "concluido", conferencia: null,
  ocorrencia: null, ocorrencia_em: null, prev_entrega: null, cte: null, cte_transportadora: null, ...n,
});

describe("acompanhamento de compras", () => {
  it("segue as etapas da peça", () => {
    expect(etapaDaPeca(peca({ oc_status: "cotacao" }))).toBe("cotacao");
    expect(etapaDaPeca(peca())).toBe("pedida");
    expect(etapaDaPeca(peca({ notas: [nota()] }))).toBe("nota");
    expect(etapaDaPeca(peca({ notas: [nota({ processamento: "a_caminho" })] }))).toBe("transporte");
    expect(etapaDaPeca(peca({ notas: [nota({ cte: "55", ocorrencia: "Em trânsito" })] }))).toBe("transporte");
    expect(etapaDaPeca(peca({ notas: [nota({ chegou_em: "2026-10-25" })] }))).toBe("chegou");
    expect(etapaDaPeca(peca({ recebida: 4 }))).toBe("chegou");
    expect(etapaDaPeca(peca({ oc_status: "cancelado" }))).toBe("cancelada");
  });

  it("usa a previsão do CT-e antes da combinada na OC e marca o atraso", () => {
    expect(previsaoDaPeca(peca({ notas: [nota({ prev_entrega: "2026-10-30" })] }))).toBe("2026-10-30");
    expect(atrasada(peca(), "2026-10-27")).toBe(true);
    expect(atrasada(peca({ notas: [nota({ prev_entrega: "2026-10-30" })] }), "2026-10-27")).toBe(false);
    expect(atrasada(peca({ recebida: 4 }), "2026-11-10")).toBe(false);
  });

  it("lê a ocorrência de entrega do CT-e", () => {
    expect(ocorrenciaEntregue("ENTREGUE")).toBe(true);
    expect(ocorrenciaEntregue("Saiu para entrega")).toBe(false);
    expect(ocorrenciaEntregue("Entrega não realizada")).toBe(false);
  });
});
