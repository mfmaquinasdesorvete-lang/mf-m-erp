// Nome curto do CFOP para mostrar ao lado do código (telas do contador, notas, relatórios).
// 1º dígito: 1/2/3 = entrada (no estado / outro estado / exterior); 5/6/7 = saída. Os 3 últimos dizem a operação.

const SAIDA: Record<string, string> = {
  "101": "Venda de produção própria", "102": "Venda de mercadoria de terceiros", "103": "Venda de produção (fora do estabelecimento)",
  "104": "Venda de mercadoria (fora do estabelecimento)", "105": "Venda de produção (entrega por terceiro)", "106": "Venda de mercadoria (entrega por terceiro)",
  "107": "Venda de produção a não contribuinte", "108": "Venda de mercadoria a não contribuinte", "109": "Venda de produção à Zona Franca",
  "116": "Venda de produção (entrega futura)", "117": "Venda de mercadoria (entrega futura)", "118": "Produção entregue (venda à ordem)",
  "119": "Mercadoria entregue (venda à ordem)", "122": "Venda de produção remetida para industrialização", "124": "Industrialização para terceiros",
  "125": "Industrialização para terceiros (insumo do encomendante)", "151": "Transferência de produção própria", "152": "Transferência de mercadoria",
  "201": "Devolução de compra para industrialização", "202": "Devolução de compra para revenda", "209": "Devolução de transferência",
  "401": "Venda de produção com ST", "403": "Venda de mercadoria com ST (substituto)", "405": "Venda de mercadoria com ST (substituído)",
  "404": "Venda de mercadoria com ST já retido", "409": "Transferência com ST", "411": "Devolução de compra com ST",
  "551": "Venda de ativo imobilizado", "552": "Transferência de ativo imobilizado", "553": "Devolução de compra de ativo",
  "556": "Devolução de compra de uso e consumo", "557": "Transferência de material de uso e consumo",
  "656": "Venda de combustível (consumidor final)", "667": "Venda de combustível a consumidor de outro estado",
  "901": "Remessa para industrialização", "902": "Retorno de industrialização", "903": "Retorno de mercadoria não usada na industrialização",
  "908": "Remessa em comodato", "909": "Retorno de comodato", "910": "Remessa em bonificação ou brinde", "911": "Remessa de amostra grátis",
  "912": "Remessa para demonstração", "913": "Retorno de demonstração", "915": "Remessa para conserto", "916": "Retorno de conserto",
  "917": "Remessa em consignação", "920": "Remessa de vasilhame", "921": "Devolução de vasilhame", "923": "Remessa por conta e ordem",
  "929": "Venda já registrada em cupom fiscal", "933": "Serviço (ISS)", "949": "Outra saída",
};

const ENTRADA: Record<string, string> = {
  "101": "Compra para industrialização", "102": "Compra para revenda", "111": "Compra para industrialização (consignação)",
  "116": "Compra para industrialização (entrega futura)", "117": "Compra para revenda (entrega futura)", "124": "Industrialização por terceiros",
  "151": "Transferência de produção", "152": "Transferência de mercadoria", "201": "Devolução de venda de produção",
  "202": "Devolução de venda de mercadoria", "203": "Devolução de venda à Zona Franca", "209": "Devolução de transferência",
  "401": "Compra para industrialização com ST", "403": "Compra para revenda com ST", "407": "Compra de uso e consumo com ST",
  "409": "Transferência com ST", "410": "Devolução de venda com ST", "411": "Devolução de venda com ST",
  "551": "Compra de ativo imobilizado", "552": "Transferência de ativo imobilizado", "556": "Compra de uso e consumo",
  "557": "Transferência de material de uso e consumo", "901": "Entrada para industrialização", "902": "Retorno de industrialização",
  "908": "Entrada em comodato", "909": "Retorno de comodato", "910": "Entrada de bonificação ou brinde", "911": "Entrada de amostra grátis",
  "912": "Entrada para demonstração", "913": "Retorno de demonstração", "915": "Entrada para conserto", "916": "Retorno de conserto",
  "933": "Serviço (ISS)", "949": "Outra entrada",
};

/** "6101" → "Venda de produção própria (outro estado)". Vazio quando o código não é conhecido. */
export function nomeCfop(cfop: string | number | null | undefined): string {
  const c = String(cfop ?? "").replace(/\D/g, "");
  if (c.length !== 4) return "";
  const tipo = c[0], op = c.slice(1);
  const nome = ("123".includes(tipo) ? ENTRADA : "567".includes(tipo) ? SAIDA : {})[op];
  if (!nome) return "";
  return tipo === "2" || tipo === "6" ? `${nome} (outro estado)` : tipo === "3" || tipo === "7" ? `${nome} (exterior)` : nome;
}
