// Previsão dos impostos na venda de um produto (cadastro da máquina e Máquinas → Impostos): a mesma conta da NF-e
// (itensVenda, com as regras de tributação da unidade) para alguns destinos típicos, menos o crédito estimado das
// compras e o IRPJ/CSLL sobre o lucro (Lucro Real). É previsão para decidir preço; a apuração oficial é do contador.
import {
  itemDoCadastro, itensVenda, type AliquotasUf, type RegraTributaria, type UnidadeFiscal,
} from "../../supabase/functions/_shared/nfe-impostos";

export type Cenario = { id: string; rotulo: string; uf: string; contribuinte: boolean; dica: string };

/** Destinos típicos a partir da UF da unidade: no estado, Sul/Sudeste (12%) e Norte/Nordeste/Centro-Oeste/ES (7%). */
export function cenariosDe(ufUnidade: string): Cenario[] {
  const uf = ufUnidade.toUpperCase();
  const sulSudeste = uf === "SP" ? "SC" : "SP";
  return [
    { id: "dentro_empresa", rotulo: `${uf} · empresa com IE`, uf, contribuinte: true, dica: "venda no estado para quem revende ou usa na empresa" },
    { id: "dentro_consumidor", rotulo: `${uf} · consumidor`, uf, contribuinte: false, dica: "pessoa física ou empresa sem IE no estado" },
    { id: "sul_empresa", rotulo: `${sulSudeste} · empresa com IE`, uf: sulSudeste, contribuinte: true, dica: "outro estado do Sul/Sudeste (ICMS 12%)" },
    { id: "sul_consumidor", rotulo: `${sulSudeste} · consumidor`, uf: sulSudeste, contribuinte: false, dica: "outro estado sem IE: a MF paga o DIFAL" },
    { id: "ne_empresa", rotulo: "BA · empresa com IE", uf: "BA", contribuinte: true, dica: "Norte, Nordeste, Centro-Oeste e ES (ICMS 7%)" },
    { id: "ne_consumidor", rotulo: "BA · consumidor", uf: "BA", contribuinte: false, dica: "Norte/Nordeste sem IE: a MF paga o DIFAL" },
  ];
}

/** Estimativas do Lucro Real (editáveis na tela). */
export const ESTIMATIVA_PADRAO = {
  /** ICMS médio pago nas compras (crédito), % do custo */
  credito_icms: 12,
  /** PIS 1,65% + COFINS 7,6% de crédito sobre o custo de material */
  credito_pis_cofins: 9.25,
  /** IRPJ 15% + CSLL 9% sobre o lucro (o adicional de 10% acima de R$ 20 mil por mês não entra) */
  ir_csll: 24,
};
export type Estimativa = typeof ESTIMATIVA_PADRAO;

export type LinhaImposto = {
  cenario: Cenario; preco: number;
  icms: number; difal: number; pis: number; cofins: number; ipi: number;
  /** ICMS + DIFAL + PIS + COFINS: o que sai do preço (o IPI é cobrado à parte do cliente) */
  impostosVenda: number; credito: number; impostoLiquido: number;
  lucroAntesIr: number; irCsll: number; sobra: number; sobraPct: number | null; cargaPct: number | null;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;

type Entrada = {
  produto: Record<string, any>; preco: number; custo: number;
  unidade: UnidadeFiscal & { id: string }; ufs: AliquotasUf; regras: RegraTributaria[]; estimativa?: Estimativa;
};

/** Uma linha por destino: impostos da nota, crédito das compras, IRPJ/CSLL e quanto sobra da venda. */
export function previsaoImpostos({ produto, preco, custo, unidade, ufs, regras, estimativa = ESTIMATIVA_PADRAO }: Entrada): LinhaImposto[] {
  if (!(preco > 0) || !unidade?.uf) return [];
  const daUnidade = regras.filter((r) => r.ativo !== false && (!r.unidade_id || r.unidade_id === unidade.id));
  const item = itemDoCadastro(produto, String(produto.descricao ?? ""), 1, preco);
  const credito = r2(Math.max(0, custo) * (estimativa.credito_icms + estimativa.credito_pis_cofins) / 100);
  return cenariosDe(unidade.uf).map((cenario) => {
    let it: Record<string, unknown> = {};
    try {
      it = itensVenda(unidade, { uf: cenario.uf, contribuinte: cenario.contribuinte }, [item], ufs, { regras: daUnidade, unidade_id: unidade.id, operacao: "venda" })[0] ?? {};
    } catch { /* sem NCM ou cadastro incompleto: fica zerado */ }
    const icms = num(it.icms_valor), difal = r2(num(it.icms_valor_uf_destino) + num(it.fcp_valor_uf_destino));
    const pis = num(it.pis_valor), cofins = num(it.cofins_valor), ipi = num(it.ipi_valor);
    const impostosVenda = r2(icms + difal + pis + cofins);
    const impostoLiquido = r2(impostosVenda - credito);
    const lucroAntesIr = r2(preco - custo - impostoLiquido);
    const irCsll = r2(Math.max(0, lucroAntesIr) * estimativa.ir_csll / 100);
    const sobra = r2(lucroAntesIr - irCsll);
    return {
      cenario, preco, icms, difal, pis, cofins, ipi, impostosVenda, credito, impostoLiquido, lucroAntesIr, irCsll, sobra,
      sobraPct: r2((sobra / preco) * 100), cargaPct: r2(((impostoLiquido + irCsll) / preco) * 100),
    };
  });
}
