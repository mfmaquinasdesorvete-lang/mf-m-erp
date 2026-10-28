// Ajustes da tela "Conferir a NF-e" (itens, valores, desconto, frete e texto) antes de emitir a nota do pedido.
// Sem dependências do Supabase: testado em src/lib/__tests__/nfeAjustes.test.ts.

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Ajustes feitos na tela "Conferir a NF-e" antes de emitir (o pedido não muda; vale só para esta nota). */
export type AjustesNfe = {
  /** cfop: só quando quem emite troca o do cálculo (ex.: remessa, bonificação); vazio = o da regra de tributação */
  itens?: { id: string; descricao?: string; quantidade?: number; valor_unitario?: number; cfop?: string }[];
  desconto?: number; frete?: number; informacoes?: string;
  /** natureza da operação desta nota (vazio = a da unidade) */
  natureza_operacao?: string;
  /** volumes transportados (quantidade, espécie, pesos em kg) */
  volumes?: VolumesNfe | null;
  /** outro cliente do cadastro como destinatário (o pedido e o financeiro não mudam) */
  cliente_id?: string | null;
  /** endereço de entrega diferente do cadastro: vai nas informações complementares da nota */
  entrega?: EntregaNfe | null;
  /** transportadora e modalidade do frete da nota (escolhidas na tela Conferir a NF-e; null = sem transportadora) */
  transportadora_id?: string | null; modalidade_frete?: number;
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

export type VolumesNfe = { quantidade?: number | null; especie?: string | null; peso_bruto?: number | null; peso_liquido?: number | null };
export type EntregaNfe = { logradouro?: string; numero?: string; complemento?: string; bairro?: string; municipio?: string; uf?: string; cep?: string };

/** Bloco de volumes da NF-e (Focus: volumes[]); vazio quando nada foi preenchido. Recusa número negativo. */
export function volumesNfe(v?: VolumesNfe | null): Record<string, unknown> {
  if (!v) return {};
  const n = (x: unknown) => (x == null || x === "" ? null : Number(x));
  const qtd = n(v.quantidade), bruto = n(v.peso_bruto), liquido = n(v.peso_liquido);
  for (const [nome, x] of [["quantidade de volumes", qtd], ["peso bruto", bruto], ["peso líquido", liquido]] as const) {
    if (x != null && !(x >= 0)) throw new Error(`${nome} inválido`);
  }
  if (bruto != null && liquido != null && liquido > bruto + 0.0005) throw new Error("o peso líquido não pode passar do peso bruto");
  const especie = String(v.especie ?? "").trim().slice(0, 60);
  const vol: Record<string, unknown> = {
    ...(qtd != null ? { quantidade: Math.round(qtd) } : {}), ...(especie ? { especie } : {}),
    ...(bruto != null ? { peso_bruto: Math.round(bruto * 1000) / 1000 } : {}), ...(liquido != null ? { peso_liquido: Math.round(liquido * 1000) / 1000 } : {}),
  };
  return Object.keys(vol).length ? { volumes: [vol] } : {};
}

/**
 * Troca o CFOP calculado pelo que quem emite escolheu, item a item (na mesma ordem dos itens do pedido).
 * Confere o formato e o primeiro dígito: 5 dentro do estado, 6 para outro estado (exterior não sai por aqui).
 */
export function aplicarCfops(items: Record<string, unknown>[], escolhidos: (string | undefined | null)[], interestadual: boolean) {
  return items.map((it, k) => {
    const c = String(escolhidos[k] ?? "").replace(/\D/g, "");
    if (!c) return it;
    if (!/^[56]\d{3}$/.test(c)) throw new Error(`CFOP ${escolhidos[k]} inválido: use 4 números começando com 5 (no estado) ou 6 (outro estado)`);
    if (c[0] !== (interestadual ? "6" : "5")) throw new Error(`CFOP ${c}: a nota é ${interestadual ? "para outro estado (começa com 6)" : "dentro do estado (começa com 5)"}`);
    return { ...it, cfop: c };
  });
}

/** Endereço de entrega diferente do cadastro, em uma linha para as informações complementares; null se vazio. */
export function textoEntrega(e?: EntregaNfe | null) {
  if (!e) return null;
  const t = (x?: string) => String(x ?? "").trim();
  if (!t(e.logradouro) && !t(e.municipio)) return null;
  const rua = [t(e.logradouro), t(e.numero)].filter(Boolean).join(", ");
  const cidade = [t(e.municipio), t(e.uf).toUpperCase()].filter(Boolean).join("/");
  const cep = t(e.cep).replace(/\D/g, "");
  return `Local de entrega: ${[rua, t(e.complemento), t(e.bairro), cidade, cep.length === 8 ? `CEP ${cep.slice(0, 5)}-${cep.slice(5)}` : ""].filter(Boolean).join(" - ")}`;
}
