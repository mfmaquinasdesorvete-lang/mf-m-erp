// Transferência entre a matriz (SC) e a filial (SP): opções do ICMS, CFOP de saída e de entrada, conferência antes
// de emitir e o resumo da entrada no destino (livro de entradas). Arquivo puro: usado pela tela e pelas funções.
//
// Base legal (resumo; a escolha é da empresa com o contador):
//  * ICMS: STF, ADC 49 (sem ICMS entre estabelecimentos do mesmo dono); LC 87/1996, art. 12, §§ 4º e 5º (LC 204/2023):
//    sem ICMS, com o crédito assegurado, ou, por opção, a transferência equiparada a operação tributada;
//    Convênio ICMS 178/2023 (transferência do crédito). Base: LC 87/1996, art. 13, § 4º (I: entrada mais recente;
//    II: custo da produção = matéria-prima, material secundário, mão de obra e acondicionamento).
//  * IPI: RIPI (Decreto 7.212/2010), art. 9º, III (filial que revende o que outra unidade fabricou é equiparada a
//    industrial, salvo se só vende no varejo) e art. 195, I (valor tributável mínimo na transferência).
//  * PIS/COFINS: transferência não é receita nem compra (Leis 10.637/2002 e 10.833/2003): sem débito e sem crédito.
//  * CFOP: tabela do Convênio s/nº de 1970 (Ajuste SINIEF 07/2001).
import { produzidoNaUnidade } from "./nfe-impostos.ts";
import { type Pendencia, pendenciaCbenef } from "./nfe-conferencia.ts";

export { produzidoNaUnidade };

const so = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Opções do ICMS na transferência (Configurações da NF-e → Transferência). */
export const OPCOES_ICMS_TRANSFERENCIA: { cst: string; rotulo: string; ajuda: string }[] = [
  { cst: "41", rotulo: "41 · Sem ICMS (não tributada)",
    ajuda: "A nota sai sem ICMS (STF, ADC 49; LC 87/1996, art. 12, § 4º, com a LC 204/2023). Em SC exige o código de benefício (cBenef) abaixo." },
  { cst: "00", rotulo: "00 · Com ICMS destacado (leva o crédito)",
    ajuda: "Destaca o ICMS sobre o custo (12%, ou 4% no importado; dentro do estado, a alíquota interna). SC lança o débito e SP usa o crédito (LC 87/1996, art. 12, § 5º; Convênio ICMS 178/2023). Não leva cBenef." },
  { cst: "90", rotulo: "90 · Outras (sem destaque)",
    ajuda: "Sem ICMS e sem cBenef em SC. Use só se o contador indicar este enquadramento." },
];

/** CST do ICMS que a transferência aceita. */
export const CST_TRANSFERENCIA = ["00", "40", "41", "50", "90"];

/** CFOP da transferência (saída): 5151/6151 produção da unidade; 5152/6152 mercadoria comprada. */
export function cfopTransferencia(produzido: boolean, interestadual: boolean) {
  return `${interestadual ? "6" : "5"}${produzido ? "151" : "152"}`;
}

/**
 * CFOP de entrada da transferência no destino. Vale o uso no destino, não o CFOP de saída:
 * x152 para comercializar (a filial que revende: 6151 e 6152 entram como 2152) e x151 para industrializar
 * (insumo que vai para a fábrica). Ativo (x552), uso e consumo (x557) e ST (x408/x409) seguem o próprio grupo.
 * A mesma regra está no banco (cfop_entrada_transferencia).
 */
export function cfopEntradaTransferencia(cfopSaida: string | null | undefined, destino: { fabrica?: boolean | null }, tipoProduto?: string | null) {
  const c = so(cfopSaida);
  if (c.length !== 4) return "";
  const prefixo = c[0] === "6" ? "2" : c[0] === "7" ? "3" : "1";
  const fim = c.slice(1);
  const industrializa = !!destino.fabrica && tipoProduto === "insumo";
  if (["552", "557", "153"].includes(fim)) return prefixo + fim;
  if (["408", "409"].includes(fim)) return prefixo + (industrializa ? "408" : "409");
  if (["151", "152", "155", "156"].includes(fim)) return prefixo + (industrializa ? "151" : "152");
  return prefixo + "949";
}

type ItemNota = Record<string, any>;
type Origem = { nome?: string | null; uf?: string | null; transf_icms_cst?: string | null };

/**
 * Conferência da transferência antes de emitir (a tela mostra; o servidor bloqueia os erros).
 * `itens` = itens já montados (itensTransferencia); `custos` = custo unitário de cada item, na mesma ordem.
 */
export function pendenciasTransferencia(a: { origem: Origem; itens: ItemNota[]; custos: { descricao: string; custo: number }[] }): Pendencia[] {
  const r: Pendencia[] = [];
  const nome = a.origem.nome || `unidade ${String(a.origem.uf ?? "").toUpperCase()}`;
  const cb = pendenciaCbenef(a.origem.uf, a.itens,
    `Configure o código de benefício da transferência em Notas fiscais → Configurações da NF-e → Transferência (${nome}), ou escolha destacar o ICMS (CST 00). Confirme com o contador.`);
  if (cb) r.push(cb);
  // CST de cada item (a regra de tributação pode trocar o da unidade); sem itens, o da unidade
  const csts = a.itens.length ? a.itens.map((i) => String(i.icms_situacao_tributaria ?? "")) : [String(a.origem.transf_icms_cst ?? "")];
  const foraDaLista = [...new Set(csts.filter((c) => c && !CST_TRANSFERENCIA.includes(c)))];
  if (foraDaLista.length) {
    r.push({ nivel: "erro", texto: `O ICMS da transferência está com CST ${foraDaLista.join(", ")}, que não serve para transferência. Escolha 41 (sem ICMS), 00 (com destaque) ou 90 em Configurações da NF-e → Transferência (${nome}) ou corrija a regra de tributação de transferência.` });
  }
  const semCusto = a.custos.filter((c) => !(Number(c.custo) > 0));
  if (semCusto.length) {
    r.push({ nivel: "erro", texto: `Sem custo: ${semCusto.map((c) => c.descricao).join(", ")}. A transferência vai pelo custo (LC 87/1996, art. 13, § 4º): informe o custo unitário do item.` });
  }
  return r;
}

/** O que a entrada da transferência registra no destino: CFOP de entrada por item, ICMS destacado (crédito) e IPI. */
export function resumoEntradaTransferencia(itensSaida: ItemNota[], destino: { fabrica?: boolean | null }, tipos: (string | null | undefined)[] = []) {
  const itens = itensSaida.map((i, k) => ({
    numero: Number(i.numero_item ?? k + 1), descricao: String(i.descricao ?? ""), cfop: so(i.cfop),
    cfop_entrada: cfopEntradaTransferencia(i.cfop, destino, tipos[k]),
    valor: Number(i.valor_bruto ?? 0), icms: Number(i.icms_valor ?? 0), ipi: Number(i.ipi_valor ?? 0),
  }));
  return {
    itens,
    cfops: [...new Set(itens.map((i) => i.cfop_entrada).filter(Boolean))].join(", "),
    icms_credito: r2(itens.reduce((s, i) => s + i.icms, 0)),
    ipi_destacado: r2(itens.reduce((s, i) => s + i.ipi, 0)),
    valor: r2(itens.reduce((s, i) => s + i.valor, 0)),
  };
}
