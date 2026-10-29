// Troca de contribuinte na correção da NF-e recusada: o DIFAL sai ou a nota é refeita pelo pedido. Dados inventados.
import { describe, expect, it } from "vitest";
import { semDifalNosItens, trocaDeContribuinte } from "../../../supabase/functions/_shared/nfe-contribuinte";

const comDifal = { indicador_inscricao_estadual_destinatario: 9, consumidor_final: 1, local_destino: 2,
  items: [{ numero_item: 1, valor_bruto: 300, icms_base_calculo_uf_destino: 300, icms_valor_uf_destino: 27.38, fcp_valor_uf_destino: 0, icms_aliquota_interestadual: 7 }] };

describe("troca de contribuinte na correção", () => {
  it("não contribuinte → contribuinte ou isento: o DIFAL sai", () => {
    expect(trocaDeContribuinte(comDifal, 1)).toEqual({ tirarDifal: true, reemitir: false });
    expect(trocaDeContribuinte({ ...comDifal, indicador_inscricao_estadual_destinatario: 2 }, 2)).toEqual({ tirarDifal: true, reemitir: false });
    const itens = semDifalNosItens(structuredClone(comDifal.items));
    expect(itens[0]).toEqual({ numero_item: 1, valor_bruto: 300 });
  });

  it("isento com DIFAL → não contribuinte: a nota já estava pronta, só troca o indicador", () => {
    expect(trocaDeContribuinte({ ...comDifal, indicador_inscricao_estadual_destinatario: 2 }, 9)).toEqual({ tirarDifal: false, reemitir: false });
  });

  it("contribuinte → não contribuinte: precisa emitir de novo pelo pedido", () => {
    const contrib = { indicador_inscricao_estadual_destinatario: 1, consumidor_final: 0, local_destino: 2, items: [{ numero_item: 1 }] };
    expect(trocaDeContribuinte(contrib, 9)).toEqual({ tirarDifal: false, reemitir: true });
    expect(trocaDeContribuinte({ ...contrib, local_destino: 1, consumidor_final: 1 }, 9)).toEqual({ tirarDifal: false, reemitir: false });
  });
});
