// Itens da NF-e de entrada emitida pela MF (tipo 0): máquina usada comprada de pessoa física, entrada para conserto
// ou garantia, retorno de comodato ou de demonstração e outras entradas. A MF emite porque quem manda não emite nota
// (pessoa física, MEI ou empresa sem inscrição estadual).
//
// Sem regra de tributação para o CFOP, vão os CST padrão da operação, sem valores (sem destaque de ICMS e sem crédito
// de PIS/COFINS). Com regra (Notas fiscais → Regras de tributação, operação "Qualquer" e o CFOP 1xxx/2xxx), valem o que
// ela define: CST, alíquota, redução, cBenef, IBS/CBS e a observação. Só entram regras com o CFOP da entrada: as demais
// foram feitas para as saídas. Confirmar os CST com o contador.
// Arquivo puro (testável).
import {
  aliquotaInterestadual, camposProduto, type ConfigIbsCbs, grupoIbsCbs, IPI_NAO_TRIBUTADO, type ItemBase, type RegraTributaria, regraAplicavel,
} from "./nfe-impostos.ts";
import { cfopDaOperacao, type OperacaoNota } from "./nfe-operacoes.ts";

export type OpcoesEntrada = {
  /** UF da MF (quem emite e recebe) e da outra parte (quem manda). */
  ufEmitente: string; ufRemetente: string; contribuinte: boolean;
  /** Alíquota interna de ICMS da unidade (só usada se a regra pedir ICMS com valor). */
  aliquotaInterna: number; ipiEnquadramento?: string;
  regras?: RegraTributaria[]; unidade_id?: string | null; usadas?: Set<RegraTributaria>;
  ibsCbs?: ConfigIbsCbs | null; ibsCbsUnidade?: { cst?: string | null; class_trib?: string | null };
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const vazio = (v: unknown) => v === null || v === undefined || v === "";
const so = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** CST do ICMS que levam base, alíquota e valor (o 90 só quando a regra der a alíquota). */
const ICMS_COM_VALOR = ["00", "10", "20", "70"];
/** CST de PIS/COFINS sem grupo de valores (PISNT). */
const PC_NAO_TRIBUTADO = ["04", "05", "06", "07", "08", "09"];
/** CST de entrada com direito a crédito (calculam o valor quando há alíquota). */
const PC_COM_CREDITO = ["50", "51", "52", "53", "54", "55", "56", "60", "61", "62", "63", "64", "65", "66", "67"];

/** PIS ou COFINS da entrada: CST com base, alíquota e valor (zero quando não há crédito). */
function pisCofins(prefixo: "pis" | "cofins", cst: string, base: number, aliquota: number) {
  if (PC_NAO_TRIBUTADO.includes(cst)) return { [`${prefixo}_situacao_tributaria`]: cst };
  const comValor = (PC_COM_CREDITO.includes(cst) || ["01", "02"].includes(cst)) && aliquota > 0;
  return {
    [`${prefixo}_situacao_tributaria`]: cst,
    [`${prefixo}_base_calculo`]: comValor ? r2(base) : 0,
    [`${prefixo}_aliquota_porcentual`]: comValor ? aliquota : 0,
    [`${prefixo}_valor`]: comValor ? r2(base * aliquota / 100) : 0,
  };
}

/** Itens da nota de entrada no formato da Focus. */
export function itensEntrada(op: OperacaoNota, itens: ItemBase[], o: OpcoesEntrada) {
  if (!op.entrada || !op.cfop) throw new Error("operação não é de entrada");
  const inter = o.ufRemetente.toUpperCase() !== o.ufEmitente.toUpperCase();
  const cfopPadrao = cfopDaOperacao(op.cfop, inter);
  // só regras com o CFOP desta entrada (as outras são das saídas)
  const regras = (o.regras ?? []).filter((r) => so(r.cfop) === cfopPadrao && (vazio(r.operacao) || r.operacao === "entrada"));
  return itens.map((i, idx) => {
    const bruto = r2(i.quantidade * i.valor_unitario);
    const liquido = r2(bruto - (i.desconto ?? 0) + (i.frete ?? 0));
    const regra = regraAplicavel(regras, { operacao: "entrada", interestadual: inter, contribuinte: o.contribuinte, tipo: i.tipo, ncm: i.ncm, origem: i.origem, cfop: cfopPadrao, unidade_id: o.unidade_id, uf_destino: o.ufRemetente.toUpperCase() });
    if (regra) o.usadas?.add(regra);
    const cfop = regra?.cfop_saida ? so(regra.cfop_saida) : cfopPadrao;

    // ICMS: o CST da regra ou o da operação; valores só quando o CST pede ou a regra dá a alíquota
    const cst = !vazio(regra?.icms_cst) ? String(regra!.icms_cst) : op.icms_cst ?? "90";
    const aliqRegra = !vazio(regra?.icms_aliquota) ? Number(regra!.icms_aliquota) : null;
    const comValor = ICMS_COM_VALOR.includes(cst) || (cst === "90" && (aliqRegra ?? 0) > 0);
    const aliq = aliqRegra ?? (inter ? aliquotaInterestadual(o.ufRemetente.toUpperCase(), o.ufEmitente.toUpperCase(), i.origem) : Number(o.aliquotaInterna));
    const reducao = ["20", "70", "90"].includes(cst) ? Number(regra?.icms_reducao_base ?? 0) || 0 : 0;
    const icmsBase = comValor ? r2(liquido * (1 - reducao / 100)) : 0;
    const icmsValor = comValor ? r2(icmsBase * aliq / 100) : 0;
    const icms = {
      ...(comValor
        ? { icms_situacao_tributaria: cst, icms_modalidade_base_calculo: 3, icms_base_calculo: icmsBase, icms_aliquota: aliq, icms_valor: icmsValor, ...(reducao > 0 ? { icms_reducao_base_calculo: reducao } : {}) }
        : { icms_situacao_tributaria: cst }),
      ...(regra?.codigo_beneficio && cst !== "00" ? { codigo_beneficio_fiscal: String(regra.codigo_beneficio).trim().toUpperCase() } : {}),
    };

    // IPI: só se a regra pedir (entrada de quem não é contribuinte do IPI não leva o grupo)
    const ipiCst = regra?.ipi_destacar === false ? "" : String(regra?.ipi_cst ?? "");
    const ipiAliq = Number(regra?.ipi_aliquota ?? 0) || 0;
    const ipi = !ipiCst ? {} : IPI_NAO_TRIBUTADO.includes(ipiCst)
      ? { ipi_situacao_tributaria: ipiCst, ipi_codigo_enquadramento_legal: regra?.ipi_enquadramento || o.ipiEnquadramento || "999" }
      : { ipi_situacao_tributaria: ipiCst, ipi_codigo_enquadramento_legal: regra?.ipi_enquadramento || o.ipiEnquadramento || "999",
          ipi_base_calculo: ipiAliq > 0 ? liquido : 0, ipi_aliquota: ipiAliq, ipi_valor: ipiAliq > 0 ? r2(liquido * ipiAliq / 100) : 0 };

    // PIS/COFINS: sem crédito por padrão; com a alíquota da regra quando o CST dá crédito
    const pcPadrao = op.pis_cofins_cst ?? "98";
    const pisCst = String(regra?.pis_cst || pcPadrao), cofinsCst = String(regra?.cofins_cst || regra?.pis_cst || pcPadrao);
    const pcBase = r2(liquido - icmsValor);
    const pis = pisCofins("pis", pisCst, pcBase, Number(regra?.pis_aliquota ?? 0) || 0);
    const cofins = pisCofins("cofins", cofinsCst, pcBase, Number(regra?.cofins_aliquota ?? 0) || 0);

    // IBS/CBS: o da regra, senão o padrão da operação (410 nas entradas sem valor), senão o da unidade
    const ibsCst = regra?.ibs_cbs_cst || op.ibs_cbs_cst || o.ibsCbsUnidade?.cst || undefined;
    const ibsClass = regra?.ibs_cbs_class_trib || (regra?.ibs_cbs_cst ? undefined : op.ibs_cbs_cst ? op.ibs_cbs_class_trib : o.ibsCbsUnidade?.class_trib) || undefined;
    const ibsCbs = grupoIbsCbs(ibsCst, ibsClass, liquido - icmsValor - Number((pis as any).pis_valor ?? 0) - Number((cofins as any).cofins_valor ?? 0), o.ibsCbs);

    return { ...camposProduto({ ...i, cfop }, idx + 1, cfop), ...icms, ...ipi, ...pis, ...cofins, ...ibsCbs };
  });
}
