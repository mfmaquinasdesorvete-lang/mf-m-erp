// Tipos de operação da NF-e direta (sem pedido): natureza da operação e CFOP de cada uma.
// O CFOP vira 6xxx sozinho quando o destino é outro estado. Os impostos de cada CFOP seguem as
// Regras de tributação (ex.: remessa para conserto 5915 → ICMS suspenso); sem regra, valem os da unidade.
// Arquivo puro: usado pela função nfe-emitir e pela tela.

export type OperacaoNota = {
  id: string; rotulo: string; natureza: string | null; cfop: string | null;
  /** sugere lançar conta a receber (venda) e baixar estoque */
  financeiro: boolean; estoque: boolean; ajuda: string;
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
];

export const operacaoNota = (id: string) => OPERACOES_NOTA.find((o) => o.id === id) ?? null;
