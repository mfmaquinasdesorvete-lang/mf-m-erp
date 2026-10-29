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

/** Tira o grupo do DIFAL dos itens (não muda valores nem o total da nota). */
export function semDifalNosItens(items: any[]) {
  for (const it of items ?? []) for (const k of CAMPOS_DIFAL_ITEM) delete it[k];
  return items;
}
