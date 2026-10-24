// Boletos pagos ou agendados no Banco Inter (API Banking: GET /banking/v2/pagamento?dataInicio&dataFim, escopo
// pagamento-boleto.read) casados com as contas a pagar em aberto. A API do Inter não traz o DDA (boletos a pagar
// emitidos contra o CNPJ): só os pagamentos feitos ou agendados pela conta. Sem Deno nem rede: os testes usam direto.

export const ESCOPO_PAGAMENTO_BOLETO = "pagamento-boleto.read";

export type PagamentoInter = {
  codigo: string; barras: string; valor: number; valor_nominal: number; vencimento: string | null; pago_em: string | null;
  situacao: "pago" | "agendado" | "outro"; situacao_inter: string; beneficiario: string; documento: string;
};
export type ContaAberta = {
  id: string; descricao: string; valor: number; vencimento: string; linha_digitavel: string | null; documento_fornecedor: string | null;
};
export type Casamento = { pagamento: PagamentoInter; conta: ContaAberta | null; por: "codigo" | "valor" | null; ambiguo?: boolean };

const so = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const txt = (v: unknown) => (v == null ? "" : String(v).trim());
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0);
const data = (v: unknown) => (/^\d{4}-\d{2}-\d{2}/.test(txt(v)) ? txt(v).slice(0, 10) : null);

/** Linha digitável (47 ou 48 dígitos) ou código de barras (44) → código de barras de 44 dígitos. */
export function codigoDeBarras(v: string | null | undefined): string {
  const d = so(v);
  if (d.length === 44) return d;
  if (d.length === 47) return d.slice(0, 4) + d.slice(32, 33) + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
  if (d.length === 48) return d.slice(0, 11) + d.slice(12, 23) + d.slice(24, 35) + d.slice(36, 47);
  return "";
}

/** Um item da lista do Inter, com os nomes de campo que a API usa (lidos com folga). */
export function lerPagamento(p: Record<string, unknown>): PagamentoInter {
  const s = txt(p.statusPagamento ?? p.status ?? p.situacao).toUpperCase();
  const situacao = /PAGO|REALIZADO|EFETIVADO|LIQUIDADO|CONCLUIDO/.test(s) ? "pago" : /AGENDADO|AGUARDANDO|PENDENTE|APROVACAO/.test(s) ? "agendado" : "outro";
  return {
    codigo: txt(p.codigoTransacao ?? p.codigoSolicitacao ?? p.codigo),
    barras: codigoDeBarras(txt(p.codigoBarra ?? p.codigoBarras ?? p.linhaDigitavel)),
    valor: num(p.valorPago ?? p.valor ?? p.valorNominal),
    valor_nominal: num(p.valorNominal ?? p.valor ?? p.valorPago),
    vencimento: data(p.dataVencimentoTitulo ?? p.dataVencimento ?? p.dataVencimentoDigitada),
    pago_em: data(p.dataPagamento ?? p.dataEfetivacao ?? p.dataAgendamento ?? p.dataInclusao),
    situacao, situacao_inter: s,
    beneficiario: txt(p.nomeBeneficiario ?? p.beneficiario ?? p.nomeFavorecido),
    documento: so(p.cpfCnpjBeneficiario ?? p.documentoBeneficiario),
  };
}

const dias = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 864e5);

/** Casa cada pagamento com uma conta em aberto: pelo código de barras; sem ele, pelo valor e o vencimento (até 3 dias,
 *  e o mesmo CNPJ quando os dois têm). Só casa quando há uma conta só; a mesma conta não casa duas vezes. */
export function casarPagamentos(pagamentos: PagamentoInter[], contas: ContaAberta[]): Casamento[] {
  const usadas = new Set<string>();
  const porCodigo = new Map(contas.filter((c) => codigoDeBarras(c.linha_digitavel)).map((c) => [codigoDeBarras(c.linha_digitavel), c]));
  return pagamentos.map((p) => {
    const c = p.barras ? porCodigo.get(p.barras) : undefined;
    if (c && !usadas.has(c.id)) { usadas.add(c.id); return { pagamento: p, conta: c, por: "codigo" as const }; }
    const ref = p.vencimento ?? p.pago_em;
    const candidatas = contas.filter((x) => !usadas.has(x.id)
      && [p.valor_nominal, p.valor].some((v) => v > 0 && Math.abs(num(x.valor) - v) <= 0.01)
      && (!ref || dias(x.vencimento, ref) <= 3)
      && (!p.documento || !so(x.documento_fornecedor) || so(x.documento_fornecedor) === p.documento));
    if (candidatas.length === 1) { usadas.add(candidatas[0].id); return { pagamento: p, conta: candidatas[0], por: "valor" as const }; }
    return { pagamento: p, conta: null, por: null, ambiguo: candidatas.length > 1 };
  });
}
