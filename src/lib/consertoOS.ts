// Notas da máquina que vem para conserto (OS de oficina): a nota de entrada (o cliente com IE emite a remessa 5915/6915;
// sem IE, a MF emite a entrada 1915/2915) e a nota de volta (retorno de conserto 5916/6916, citando a entrada).
// Aqui fica só a regra: que nota a OS já tem, o que falta e o que saiu errado (ex.: a volta emitida como venda).
// O valor do conserto é cobrado à parte: serviço na NFS-e (aba Nota de serviço) e peça vendida na NF-e de venda.

export type NotaMF = {
  id: string; numero: string | null; chave: string | null; status: string; tipo_operacao: string | null; created_at: string;
  valor_total: number | string; payload?: { items?: { cfop?: string | null; codigo_produto?: string | null; descricao?: string | null }[] } | null;
  itens?: { produto_id?: string | null }[] | null;
};
export type NotaRecebida = { id: string; chave: string | null; data_emissao: string | null; valor_total: number | string; itens?: { cfop?: string | null }[] | null };

export type ClienteFiscal = { tipo_pessoa?: string | null; contribuinte_icms?: number | string | null; inscricao_estadual?: string | null; uf?: string | null };

const dig = (v?: string | null) => String(v ?? "").replace(/\D/g, "");
const cfops = (n: NotaMF) => (n.payload?.items ?? []).map((i) => dig(i.cfop));
const fim = (c: string, sufixo: string) => c.length === 4 && c.endsWith(sufixo);
/** A partir de uns dias antes da entrada na OS (a nota de ida pode ser emitida antes de a máquina chegar). */
const desde = (dataEntrada: string) => {
  const d = new Date(`${dataEntrada.slice(0, 10)}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 15); return d.toISOString().slice(0, 10);
};

/** Cliente com inscrição estadual ativa: ele mesmo emite a nota de remessa para conserto. */
export const clienteEmiteNota = (c: ClienteFiscal) =>
  c.tipo_pessoa === "PJ" && Number(c.contribuinte_icms) === 1 && !!dig(c.inscricao_estadual);

export function notasDoConserto(opts: { dataEntrada: string; cliente: ClienteFiscal; produtoId?: string | null; emitidas: NotaMF[]; recebidas: NotaRecebida[] }) {
  const inicio = desde(opts.dataEntrada);
  const validas = opts.emitidas.filter((n) => ["autorizada", "processando", "contingencia"].includes(n.status) && n.created_at.slice(0, 10) >= inicio);
  // entrada: a remessa que o cliente emitiu (chega em NF-e recebidas) ou a entrada que a MF emitiu por ele
  const remessaCliente = opts.recebidas.filter((r) => (r.data_emissao ?? "").slice(0, 10) >= inicio && (r.itens ?? []).some((i) => fim(dig(i.cfop), "915")));
  const entradaMF = validas.filter((n) => n.tipo_operacao === "entrada" && cfops(n).some((c) => /^[12]915$/.test(c)));
  const retorno = validas.filter((n) => n.tipo_operacao !== "entrada" && cfops(n).some((c) => /^[56]916$/.test(c)));
  // volta emitida como venda: nota de saída de venda (x101/x102) da mesma máquina, depois da entrada
  const comoVenda = validas.filter((n) => n.tipo_operacao !== "entrada" && !retorno.includes(n)
    && cfops(n).some((c) => /^[56]10[12]$/.test(c))
    && (!!opts.produtoId && (n.itens ?? []).some((i) => i.produto_id === opts.produtoId)));
  const entradas = [
    ...remessaCliente.map((r) => ({ chave: dig(r.chave), rotulo: `Remessa do cliente de ${(r.data_emissao ?? "").slice(0, 10)}`, valor: Number(r.valor_total) })),
    ...entradaMF.map((n) => ({ chave: dig(n.chave), rotulo: `Entrada da MF nº ${n.numero ?? "—"}`, valor: Number(n.valor_total) })),
  ].filter((e) => e.chave.length === 44);
  const emiteCliente = clienteEmiteNota(opts.cliente);
  const passo = retorno.length ? "pronto"
    : entradas.length ? "emitir_retorno"
    : emiteCliente ? "pedir_remessa_cliente" : "emitir_entrada";
  return { entradas, retorno, comoVenda, emiteCliente, passo } as const;
}
