// Ajustes da tela "Conferir a NF-e" (itens, valores, desconto, frete e texto) antes de emitir a nota do pedido.
// Sem dependências do Supabase: testado em src/lib/__tests__/nfeAjustes.test.ts.

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Ajustes feitos na tela "Conferir a NF-e" antes de emitir (o pedido não muda; vale só para esta nota). */
export type AjustesNfe = {
  itens?: { id: string; descricao?: string; quantidade?: number; valor_unitario?: number }[];
  desconto?: number; frete?: number; informacoes?: string;
  /** obrigatório quando a nota fica menor que o pedido (só os casos que a lei permite) */
  motivo?: string;
};

/**
 * Por que a nota pode sair menor que o pedido. A NF-e tem de mostrar o valor real da operação
 * (Lei 8.137/1990, art. 1º): nota abaixo do valor da venda só nestes casos, e o motivo fica registrado no pedido.
 */
export const MOTIVOS_NOTA_MENOR: Record<string, string> = {
  entrega_parcial: "Entrega parcial: o restante sai em outra NF-e deste pedido",
  servico_nfse: "Parte do valor é serviço (instalação, assistência): vai em NFS-e",
  desconto_real: "Desconto dado de verdade ao cliente (corrigir também o pedido e as parcelas)",
  erro_pedido: "O pedido estava com valor errado (corrigir o pedido)",
};

/** Recusa nota menor que o pedido sem um dos motivos aceitos; devolve o texto do motivo (ou null). */
export function conferirMotivo(valorNota: number, valorPedido: number, motivo?: string | null) {
  if (valorNota >= r2(valorPedido) - 0.009) return null;
  const texto = motivo ? MOTIVOS_NOTA_MENOR[motivo] : undefined;
  if (!texto) throw new Error("a NF-e ficou menor que o pedido: escolha o motivo (entrega parcial, serviço em NFS-e, desconto real ou pedido errado)");
  return texto;
}

type NotaDoPedido = { status: string; ambiente?: string | null; valor_total?: number | string | null };

/**
 * Quanto do pedido já tem NF-e de produção (autorizada) e quanto falta: depois de uma entrega parcial o restante sai
 * em outra NF-e do mesmo pedido. Nota em processamento trava uma nova até a SEFAZ responder.
 */
export function faturamentoDoPedido(valorPedido: number, notas: NotaDoPedido[]) {
  const validas = notas.filter((n) => n.ambiente !== "homologacao");
  const emAndamento = validas.some((n) => ["processando", "contingencia"].includes(n.status));
  const jaEmitido = r2(validas.filter((n) => n.status === "autorizada").reduce((t, n) => t + Number(n.valor_total ?? 0), 0));
  return { jaEmitido, restante: r2(Math.max(0, valorPedido - jaEmitido)), emAndamento };
}

/** Aplica os ajustes nos itens do pedido; recusa item de outro pedido e números inválidos. */
export function aplicarAjustes(itens: any[], ajustes?: AjustesNfe | null) {
  if (!ajustes?.itens?.length) return itens;
  const porId = new Map(ajustes.itens.map((a) => [a.id, a]));
  for (const id of porId.keys()) if (!itens.some((i) => i.id === id)) throw new Error("item ajustado não é deste pedido");
  return itens.map((i) => {
    const a = porId.get(i.id);
    if (!a) return i;
    const quantidade = a.quantidade ?? Number(i.quantidade);
    const valor_unitario = a.valor_unitario ?? Number(i.valor_unitario);
    if (!(quantidade > 0)) throw new Error(`quantidade inválida em ${i.descricao}`);
    if (!(valor_unitario >= 0)) throw new Error(`valor inválido em ${i.descricao}`);
    const descricao = (a.descricao ?? i.descricao ?? "").trim() || i.descricao;
    return { ...i, descricao, quantidade, valor_unitario, valor_total: r2(quantidade * valor_unitario) };
  });
}

/**
 * Confere a inscrição estadual do cliente antes de mandar a nota (cada envio recusado pela SEFAZ vira uma tentativa
 * a mais). Devolve o problema em português ou null. `contribuinte` = indicador 1 no cadastro.
 */
export function problemaIeDestinatario(doc: string | null | undefined, ie: string | null | undefined, contribuinte: boolean) {
  const d = String(doc ?? "").replace(/\D/g, "");
  const i = String(ie ?? "").replace(/\D/g, "");
  if (d.length !== 14) return null; // CPF: vai como não contribuinte
  if (i && i === d) return "a inscrição estadual do cliente está com o próprio CNPJ. Toque em Buscar IE no cadastro do cliente (ou consulte o SINTEGRA do estado) e emita de novo";
  if (contribuinte && !i) return "o cliente está como contribuinte do ICMS, mas sem inscrição estadual. Toque em Buscar IE no cadastro do cliente";
  if (i && (i.length < 8 || i.length > 14)) return "a inscrição estadual do cliente parece incompleta. Confira no cadastro do cliente (Buscar IE)";
  return null;
}
