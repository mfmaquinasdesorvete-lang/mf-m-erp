// Troca de contribuinte na correção de uma NF-e recusada (Corrigir e reenviar): o que muda além do indicador da IE.
// Sem dependência do Deno: o site (tela da correção) e o servidor (nfe-correcao.ts) usam a mesma regra.
//
// Regras da SEFAZ (NT 2015.003): o grupo de ICMS para a UF de destino (DIFAL na nota) só vale para não contribuinte
// (indIEDest 9), consumidor final, em operação interestadual: com indicador 1 ou 2 a nota é recusada (695); com 9
// interestadual sem o grupo, também (694); não contribuinte tem de ser consumidor final (696).

/** Campos do grupo ICMSUFDest de cada item (Focus NFe). */
export const CAMPOS_DIFAL_ITEM = [
  "icms_base_calculo_uf_destino", "fcp_base_calculo_uf_destino", "fcp_percentual_uf_destino", "icms_aliquota_interna_uf_destino",
  "icms_aliquota_interestadual", "icms_percentual_partilha", "fcp_valor_uf_destino", "icms_valor_uf_destino", "icms_valor_uf_remetente",
];

const temDifal = (items: any[]) => (items ?? []).some((i) => i?.icms_base_calculo_uf_destino != null || i?.icms_valor_uf_destino != null);

/**
 * O que a troca do indicador da IE pede na nota já montada:
 * - `tirarDifal`: passou a contribuinte ou isento e a nota tem o grupo do DIFAL (sai sem mudar o total);
 * - `reemitir`: passou a não contribuinte e a nota não estava pronta para isso (sem consumidor final ou, entre estados,
 *   sem o DIFAL): os impostos precisam ser refeitos, então a nota sai de novo pelo pedido.
 */
export function trocaDeContribuinte(payload: any, novoIndicador: number) {
  const antes = Number(payload?.indicador_inscricao_estadual_destinatario ?? 9);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const tirarDifal = novoIndicador !== 9 && temDifal(items);
  const reemitir = novoIndicador === 9 && antes !== 9
    && (Number(payload?.consumidor_final ?? 0) !== 1 || (Number(payload?.local_destino ?? 1) === 2 && !temDifal(items)));
  return { tirarDifal, reemitir };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Tira o grupo do DIFAL dos itens (o total da nota não muda). A base do IBS/CBS, que descontava o DIFAL
 *  (NT 2025.002), volta a ter esse valor e os valores do IBS/CBS são refeitos com as alíquotas do item. */
export function semDifalNosItens(items: any[]) {
  for (const it of items ?? []) {
    const difal = Number(it.icms_valor_uf_destino ?? 0) + Number(it.fcp_valor_uf_destino ?? 0);
    for (const k of CAMPOS_DIFAL_ITEM) delete it[k];
    if (difal > 0 && it.ibs_cbs_base_calculo != null) {
      const b = r2(Number(it.ibs_cbs_base_calculo) + difal);
      it.ibs_cbs_base_calculo = b;
      if (it.ibs_uf_aliquota != null) it.ibs_uf_valor = r2(b * Number(it.ibs_uf_aliquota) / 100);
      if (it.ibs_mun_aliquota != null) it.ibs_mun_valor = r2(b * Number(it.ibs_mun_aliquota) / 100);
      if (it.ibs_uf_valor != null || it.ibs_mun_valor != null) it.ibs_valor = r2(Number(it.ibs_uf_valor ?? 0) + Number(it.ibs_mun_valor ?? 0));
      if (it.cbs_aliquota != null) it.cbs_valor = r2(b * Number(it.cbs_aliquota) / 100);
    }
  }
  return items;
}
