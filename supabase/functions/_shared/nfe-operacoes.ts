// Tipos de operação da NF-e direta (sem pedido): natureza da operação e CFOP de cada uma.
// O CFOP vira 6xxx (saída) ou 2xxx (entrada) sozinho quando a outra parte é de outro estado. Os impostos de cada CFOP seguem as
// Regras de tributação (ex.: remessa para conserto 5915 → ICMS suspenso); sem regra, a saída leva ICMS e IPI como na venda e PIS/COFINS sem valor (CST 49),
// e a entrada leva os CST padrão da operação, sem valores; regras de "Venda" não entram.
// Arquivo puro: usado pela função nfe-emitir e pela tela.

export type OperacaoNota = {
  id: string; rotulo: string; natureza: string | null; cfop: string | null;
  /** sugere lançar conta a receber (venda) e baixar estoque */
  financeiro: boolean; estoque: boolean; ajuda: string;
  /** NF-e de entrada emitida pela MF (tipo 0): a outra parte não emite nota (pessoa física, MEI ou empresa sem IE). */
  entrada?: boolean;
  /** CST padrão da entrada (sem regra de tributação): ICMS e PIS/COFINS, sem valores. Confirmar com o contador. */
  icms_cst?: string; pis_cofins_cst?: string;
  /** IBS/CBS padrão da entrada (sem regra): operação não onerosa = 410 / 410999. Vazio = o da unidade. */
  ibs_cbs_cst?: string; ibs_cbs_class_trib?: string;
  /** Retorno: a nota precisa citar a NF de remessa (chave), que liga o retorno à saída e encerra a suspensão/não incidência. */
  exige_referencia?: boolean;
};

export const OPERACOES_NOTA: OperacaoNota[] = [
  { id: "venda", rotulo: "Venda de mercadoria", natureza: null, cfop: null, financeiro: true, estoque: true,
    ajuda: "CFOP e impostos como na venda pelo pedido (máquina fabricada 5101, revenda 5102, ou o do produto)." },
  { id: "remessa_conserto", rotulo: "Remessa para conserto", natureza: "Remessa para conserto", cfop: "5915", financeiro: false, estoque: true,
    ajuda: "Envio de máquina ou peça para conserto. Confira a regra do CFOP 5915/6915 (ICMS normalmente suspenso)." },
  { id: "retorno_conserto", rotulo: "Retorno de conserto", natureza: "Retorno de mercadoria recebida para conserto", cfop: "5916", financeiro: false, estoque: false,
    ajuda: "Devolve ao cliente a máquina que veio para conserto (não sai do estoque da MF)." },
  { id: "garantia", rotulo: "Remessa em garantia", natureza: "Remessa de peça em garantia", cfop: "5949", financeiro: false, estoque: true,
    ajuda: "Peça enviada sem cobrança, dentro da garantia." },
  { id: "bonificacao", rotulo: "Bonificação / brinde", natureza: "Remessa em bonificação, doação ou brinde", cfop: "5910", financeiro: false, estoque: true,
    ajuda: "Mercadoria dada sem cobrança." },
  { id: "demonstracao", rotulo: "Remessa para demonstração", natureza: "Remessa para demonstração", cfop: "5912", financeiro: false, estoque: true,
    ajuda: "Máquina que vai para teste ou feira e volta." },
  { id: "outras", rotulo: "Outras saídas", natureza: "Outra saída de mercadoria", cfop: "5949", financeiro: false, estoque: true,
    ajuda: "Qualquer outra saída que não é venda. Combine o CFOP e os impostos com o contador." },

  // Entradas: a MF emite a nota quando quem manda não emite (pessoa física, MEI ou empresa sem inscrição estadual).
  // Lucro Real: PIS/COFINS de entrada com crédito só na compra de pessoa jurídica de bem sujeito às contribuições
  // (CST 50–56; Leis 10.637/2002 e 10.833/2003, art. 3º). Nas demais, sem crédito: 70 (aquisição sem crédito) ou 98
  // (outras entradas). Devolução de venda (com crédito) sai pelo botão Devolução da nota de venda (finalidade 4).
  { id: "entrada_conserto", rotulo: "Entrada para conserto ou garantia", natureza: "Entrada de bem recebido para conserto", cfop: "1915",
    financeiro: false, estoque: false, entrada: true, icms_cst: "50", pis_cofins_cst: "98", ibs_cbs_cst: "410", ibs_cbs_class_trib: "410999",
    ajuda: "Máquina ou peça do cliente que vem para conserto ou garantia e volta para ele. Não entra no estoque da MF. Na volta: Retorno de conserto (5916). ICMS suspenso (CST 50; em SC pede o cBenef na regra do CFOP): confirme com o contador." },
  { id: "entrada_retorno_conserto", rotulo: "Retorno de conserto (bem da MF)", natureza: "Retorno de mercadoria remetida para conserto", cfop: "1916",
    financeiro: false, estoque: true, entrada: true, icms_cst: "50", pis_cofins_cst: "98", ibs_cbs_cst: "410", ibs_cbs_class_trib: "410999", exige_referencia: true,
    ajuda: "Máquina ou peça da MF que foi consertar fora (Remessa para conserto 5915) e volta de quem não emite nota. Entra no estoque. Cite a NF de remessa. ICMS suspenso como na remessa (CST 50; em SC pede o cBenef na regra do CFOP): confirme com o contador." },
  { id: "compra_usado", rotulo: "Compra de máquina ou peça usada (para revender)", natureza: "Compra de mercadoria usada", cfop: "1102",
    financeiro: false, estoque: true, entrada: true, icms_cst: "90", pis_cofins_cst: "70",
    ajuda: "A MF compra a máquina usada (ou pega como parte do pagamento de uma nova) de pessoa física ou de quem não emite nota, para revender como está. Entra no estoque. Sem destaque de ICMS. PIS/COFINS sem crédito (CST 70): pessoa física não gera crédito e o cliente que vende o próprio equipamento (ativo) não paga PIS/COFINS sobre ele (Lei 10.833/2003, art. 3º, § 2º, II e § 3º, I). Confirme com o contador." },
  { id: "compra_usado_industrializacao", rotulo: "Compra de máquina usada para recondicionar", natureza: "Compra de mercadoria usada para industrialização", cfop: "1101",
    financeiro: false, estoque: true, entrada: true, icms_cst: "90", pis_cofins_cst: "70",
    ajuda: "Máquina usada comprada para recondicionar ou desmontar e aproveitar as peças: é compra para industrialização (recondicionar é industrializar, RIPI art. 4º, V). Mesmos impostos da compra de usado. A revenda da recondicionada pode ter IPI: confirme com o contador." },
  { id: "retorno_comodato", rotulo: "Retorno de comodato", natureza: "Retorno de bem remetido em comodato", cfop: "1909",
    financeiro: false, estoque: true, entrada: true, icms_cst: "41", pis_cofins_cst: "98", ibs_cbs_cst: "410", ibs_cbs_class_trib: "410999", exige_referencia: true,
    ajuda: "Máquina da MF que estava emprestada (comodato) e volta. Entra no estoque. Cite a NF de remessa em comodato. Comodato não tem ICMS (CST 41; STF, Súmula 573; em SC pede o cBenef na regra do CFOP)." },
  { id: "retorno_demonstracao", rotulo: "Retorno de demonstração", natureza: "Retorno de mercadoria remetida para demonstração", cfop: "1913",
    financeiro: false, estoque: true, entrada: true, icms_cst: "41", pis_cofins_cst: "98", ibs_cbs_cst: "410", ibs_cbs_class_trib: "410999", exige_referencia: true,
    ajuda: "Máquina que foi para teste ou feira e volta. Entra no estoque. Cite a NF de remessa para demonstração. Use o mesmo tratamento do ICMS da remessa (41 ou 50, com o cBenef em SC): confirme com o contador." },
  { id: "outras_entradas", rotulo: "Outras entradas", natureza: "Outra entrada de mercadoria", cfop: "1949",
    financeiro: false, estoque: true, entrada: true, icms_cst: "90", pis_cofins_cst: "98",
    ajuda: "Qualquer outra entrada (ex.: brinde ou doação recebida). Sem crédito de ICMS e de PIS/COFINS. Combine o CFOP e os impostos com o contador." },
];

export const operacaoNota = (id: string) => OPERACOES_NOTA.find((o) => o.id === id) ?? null;

/** CFOP da operação para a outra parte: 5→6 (saída) e 1→2 (entrada) quando é de outro estado. */
export function cfopDaOperacao(cfop: string, interestadual: boolean) {
  if (!interestadual) return cfop;
  if (cfop.startsWith("5")) return "6" + cfop.slice(1);
  if (cfop.startsWith("1")) return "2" + cfop.slice(1);
  return cfop;
}

/** Só os dígitos da chave de acesso; vazio se não tem 44 dígitos ou o dígito verificador não confere. */
export function chaveValida(chave: string | null | undefined) {
  const d = String(chave ?? "").replace(/\D/g, "");
  if (d.length !== 44) return "";
  let soma = 0, peso = 2;
  for (let i = 42; i >= 0; i--) { soma += Number(d[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(d[43]) ? d : "";
}
