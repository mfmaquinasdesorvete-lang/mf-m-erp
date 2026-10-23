// Mercado Livre: chamadas da API (login da conta, vendas, dados de faturamento, envio e custos) e a conversão de uma
// venda no formato que o banco importa (ml_importar_pedido). Sem Deno.env aqui: as chaves chegam por parâmetro, e a
// conversão (normalizarPedido) é pura, com testes no ERP.

export const API_ML = "https://api.mercadolibre.com";
export const AUTORIZAR_ML = "https://auth.mercadolivre.com.br/authorization";

export type CausaML = { type?: string; code?: string; message?: string; references?: string[] };

export class ErroML extends Error {
  /** `causas`: a lista "cause" da resposta, como veio (erros e avisos) */
  constructor(public status: number, message: string, public codigo?: string, public causas: CausaML[] = []) {
    super(message);
  }
}

/** GET/POST na API do Mercado Livre com limite de tempo; erro vira ErroML com a mensagem deles. */
export async function chamarML<T = any>(caminho: string, token: string | null, init: RequestInit & { cabecalhos?: Record<string, string> } = {}): Promise<T> {
  const { cabecalhos, ...resto } = init;
  const r = await fetch(caminho.startsWith("http") ? caminho : `${API_ML}${caminho}`, {
    ...resto,
    headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cabecalhos ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const texto = await r.text();
  let corpo: any = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = { message: texto.slice(0, 300) }; }
  if (!r.ok) {
    let msg = String(corpo?.message || corpo?.error_description || corpo?.error || `Mercado Livre respondeu ${r.status}`);
    // "body.invalid_fields" vem com o campo só em "error" ("The fields [title] are invalid…")
    const extra = String(corpo?.error ?? "").trim();
    if (extra && extra !== msg && extra.length > 12 && !msg.includes(extra)) msg = `${msg}: ${extra}`;
    // erro de validação (ex.: ao mudar preço ou estoque): o motivo vem em "cause"
    // (sem mensagem, vale o código e os campos citados: "item.title.invalid [title]")
    const todas: any[] = Array.isArray(corpo?.cause) ? corpo.cause : [];
    const erros = todas.filter((c: any) => !c?.type || c.type === "error");
    const causas = (erros.length ? erros : todas)
      .map((c: any) => {
        const t = String(c?.message ?? "").trim() || String(c?.code ?? "").trim();
        const refs = Array.isArray(c?.references) && c.references.length ? ` [${c.references.join(", ")}]` : "";
        return t ? `${t}${refs}` : "";
      }).filter(Boolean).join("; ");
    throw new ErroML(r.status, causas && !msg.includes(causas) ? `${msg}: ${causas}` : msg, corpo?.error, todas);
  }
  return corpo as T;
}

export type Tokens = { access_token: string; refresh_token: string; expires_in: number; user_id: number };

/** Troca o código do "Conectar" (ou o refresh token) por um token novo. O refresh token só vale uma vez. */
export function pedirToken(p: { client_id: string; client_secret: string } & ({ code: string; redirect_uri: string; code_verifier?: string } | { refresh_token: string })) {
  const form = new URLSearchParams({ client_id: p.client_id, client_secret: p.client_secret });
  if ("code" in p) {
    form.set("grant_type", "authorization_code"); form.set("code", p.code); form.set("redirect_uri", p.redirect_uri);
    // PKCE: o segredo de uso único criado no "Conectar" (o app com PKCE ligado recusa a troca sem ele)
    if (p.code_verifier) form.set("code_verifier", p.code_verifier);
  }
  else { form.set("grant_type", "refresh_token"); form.set("refresh_token", p.refresh_token); }
  return chamarML<Tokens>("/oauth/token", null, {
    method: "POST", body: form, cabecalhos: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}

export function linkAutorizacao(clientId: string, redirectUri: string, estado: string, desafio?: string) {
  const u = new URL(AUTORIZAR_ML);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", estado);
  if (desafio) { u.searchParams.set("code_challenge", desafio); u.searchParams.set("code_challenge_method", "S256"); }
  return u.toString();
}

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** PKCE: segredo de uso único (fica no servidor) e o desafio que vai no link (SHA-256 do segredo, em base64url). */
export async function parPkce(): Promise<{ verificador: string; desafio: string }> {
  const verificador = base64url(crypto.getRandomValues(new Uint8Array(48)));
  return { verificador, desafio: await desafioPkce(verificador) };
}
export async function desafioPkce(verificador: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador))));
}

/** Tudo o que a importação precisa de uma venda (o que não vier fica de fora sem travar a venda). */
export async function buscarVenda(token: string, orderId: string | number) {
  const order = await chamarML(`/orders/${orderId}`, token);
  const [billing, envio] = await Promise.all([
    chamarML(`/orders/${orderId}/billing_info`, token, { cabecalhos: { "x-version": "2" } }).catch(() => null),
    order?.shipping?.id ? chamarML(`/shipments/${order.shipping.id}`, token, { cabecalhos: { "x-format-new": "true" } }).catch(() => null) : null,
  ]);
  const custos = order?.shipping?.id ? await chamarML(`/shipments/${order.shipping.id}/costs`, token).catch(() => null) : null;
  // data em que o Mercado Pago libera o dinheiro (pagamento aprovado)
  const pagamento = (order?.payments ?? []).find((p: any) => p?.status === "approved") ?? null;
  const mp = pagamento?.id
    ? await chamarML(`https://api.mercadopago.com/v1/payments/${pagamento.id}`, token).catch(() => null)
    : null;
  return { order, billing, envio, custos, pagamento: mp };
}

// ---------------------------------------------------------------------
// Conversão (pura)
// ---------------------------------------------------------------------
export type VendaImportar = {
  order_id: number; pack_id: number | null; status: string; data: string | null;
  total: number; tarifa: number; frete_vendedor: number; liberacao: string | null; shipment_id: number | null; logistica: string | null;
  comprador: {
    apelido: string | null; nome: string | null; doc: string | null; email: string | null; telefone: string | null;
    cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null;
    municipio: string | null; uf: string | null;
  };
  itens: { item_id: string; variation_id: string; sku: string | null; titulo: string; quantidade: number; valor_unitario: number }[];
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const texto = (v: unknown) => { const s = String(v ?? "").trim(); return s ? s : null; };
const dia = (v: unknown) => { const s = texto(v); return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };
const centavos = (v: number) => Math.round(v * 100) / 100;
const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** "BR-SP", "SP" ou "São Paulo" → "SP". */
export function siglaUF(v: unknown): string | null {
  const s = texto(v);
  if (!s) return null;
  const m = s.toUpperCase().match(/(?:^|-)([A-Z]{2})$/);
  if (m) return m[1];
  const nomes: Record<string, string> = {
    acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF", "espirito santo": "ES",
    goias: "GO", maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA", paraiba: "PB",
    parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS",
    rondonia: "RO", roraima: "RR", "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
  };
  return nomes[s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()] ?? null;
}

/** Documento, nome e endereço do comprador: dados de faturamento (versão 2 ou antiga) e, na falta, o endereço de entrega. */
function comprador(order: any, billing: any, envio: any): VendaImportar["comprador"] {
  const b2 = billing?.buyer?.billing_info ?? null;                 // x-version: 2
  const b1 = billing?.billing_info ?? null;                        // formato antigo
  const extra = (tipo: string) => texto((b1?.additional_info ?? []).find((a: any) => a?.type === tipo)?.value);
  const doc = texto(b2?.identification?.number) ?? texto(b1?.doc_number);
  const nomeB2 = [texto(b2?.name), texto(b2?.last_name)].filter(Boolean).join(" ");
  const nomeB1 = extra("BUSINESS_NAME") ?? [extra("FIRST_NAME"), extra("LAST_NAME")].filter(Boolean).join(" ");
  const nomeBuyer = [texto(order?.buyer?.first_name), texto(order?.buyer?.last_name)].filter(Boolean).join(" ");
  const end = b2?.address ?? null;
  // endereço de entrega: formato novo (destination.shipping_address) ou antigo (receiver_address)
  const destino = envio?.destination ?? null;
  const dest = destino?.shipping_address ?? envio?.receiver_address ?? null;
  return {
    apelido: texto(order?.buyer?.nickname),
    nome: texto(nomeB2) ?? texto(nomeB1) ?? texto(nomeBuyer) ?? texto(destino?.receiver_name) ?? texto(dest?.receiver_name),
    doc: doc ? doc.replace(/\D/g, "") : null,
    email: texto(order?.buyer?.email),
    telefone: texto(destino?.receiver_phone) ?? texto(dest?.receiver_phone) ?? texto(order?.buyer?.phone?.number),
    cep: (texto(end?.zip_code) ?? extra("ZIP_CODE") ?? texto(dest?.zip_code))?.replace(/\D/g, "") || null,
    logradouro: texto(end?.street_name) ?? extra("STREET_NAME") ?? texto(dest?.street_name),
    numero: texto(end?.street_number) ?? extra("STREET_NUMBER") ?? texto(dest?.street_number),
    complemento: texto(end?.comment) ?? texto(dest?.comment),
    bairro: texto(end?.neighborhood) ?? extra("NEIGHBORHOOD") ?? texto(dest?.neighborhood?.name),
    municipio: texto(end?.city_name) ?? extra("CITY_NAME") ?? texto(dest?.city?.name),
    uf: siglaUF(end?.state?.code ?? end?.state?.name) ?? siglaUF(extra("STATE_NAME")) ?? siglaUF(dest?.state?.id ?? dest?.state?.name),
  };
}

/** Uma venda do Mercado Livre no formato do banco (ml_importar_pedido), com tarifa, frete pago pela MF e liberação. */
export function normalizarPedido(order: any, extras: { billing?: any; envio?: any; custos?: any; pagamento?: any; vendedorId?: number | null } = {}): VendaImportar {
  const { billing, envio, custos, pagamento, vendedorId } = extras;
  const itens = (order?.order_items ?? []).map((oi: any) => ({
    item_id: String(oi?.item?.id ?? ""),
    variation_id: oi?.item?.variation_id ? String(oi.item.variation_id) : "",
    sku: texto(oi?.item?.seller_sku) ?? texto(oi?.item?.seller_custom_field),
    titulo: String(oi?.item?.title ?? "Anúncio do Mercado Livre").slice(0, 300),
    quantidade: num(oi?.quantity) || 1,
    valor_unitario: centavos(num(oi?.unit_price)),
  }));
  const somaItens = itens.reduce((s: number, i: { quantidade: number; valor_unitario: number }) => s + i.quantidade * i.valor_unitario, 0);
  // tarifa de venda: a que o pagamento registrou; sem ela, a de cada item (por unidade × quantidade)
  const pagos = (order?.payments ?? []).filter((p: any) => p?.status === "approved");
  const tarifaPagamentos = pagos.reduce((s: number, p: any) => s + num(p?.marketplace_fee), 0);
  const tarifaItens = (order?.order_items ?? []).reduce((s: number, oi: any) => s + num(oi?.sale_fee) * (num(oi?.quantity) || 1), 0);
  // frete pago pela MF: o custo do envio que cabe ao vendedor
  const remetentes: any[] = custos?.senders ?? [];
  const meu = remetentes.find((s) => vendedorId && Number(s?.user_id) === Number(vendedorId)) ?? remetentes[0];
  const frete = num(meu?.cost);
  const logistica = texto(envio?.logistic?.type) ?? texto(envio?.logistic_type) ?? texto(order?.shipping?.logistic_type);
  const aprovado = dia(pagos[0]?.date_approved) ?? dia(order?.date_closed) ?? dia(order?.date_created);
  return {
    order_id: Number(order?.id),
    pack_id: order?.pack_id ? Number(order.pack_id) : null,
    status: String(order?.status ?? ""),
    data: texto(order?.date_closed) ?? texto(order?.date_created),
    total: centavos(num(order?.total_amount) || somaItens),
    tarifa: centavos(tarifaPagamentos || tarifaItens),
    frete_vendedor: centavos(frete),
    // quando o Mercado Pago libera; sem a data, 30 dias depois da aprovação (o ERP atualiza na próxima conferência)
    liberacao: dia(pagamento?.money_release_date) ?? (aprovado ? somarDias(aprovado, 30) : null),
    shipment_id: order?.shipping?.id ? Number(order.shipping.id) : null,
    logistica,
    comprador: comprador(order, billing, envio),
    itens,
  };
}

/** "/orders/2000001234" → 2000001234 (aviso do Mercado Livre). */
export function idDoRecurso(resource: unknown, prefixo: "orders" | "shipments"): string | null {
  const m = String(resource ?? "").match(new RegExp(`/${prefixo}/(\\d+)`));
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------
// Depois da venda (fase A): situação do envio, NF-e e rastreio
// ---------------------------------------------------------------------
export type SituacaoEnvio = { status: string | null; substatus: string | null; modo: string | null; rastreio: string | null };

/** Situação do envio (formato novo ou antigo de /shipments/{id}): status, substatus, modo (me2, me1, custom…) e rastreio. */
export function situacaoEnvio(envio: any): SituacaoEnvio {
  return {
    status: texto(envio?.status),
    substatus: texto(envio?.substatus),
    modo: texto(envio?.logistic?.mode) ?? texto(envio?.mode),
    rastreio: texto(envio?.tracking_number),
  };
}

/** Pacote da venda: a NF-e vai para /packs/{pack_id}; venda sem pacote usa o número da venda. */
export const caminhoNotaML = (orderId: number | string, packId?: number | string | null) => `/packs/${packId || orderId}/fiscal_documents`;

/**
 * XML da NF-e pronto para o Mercado Livre: precisa ser a nota autorizada (nfeProc), começar pela declaração XML e ter
 * até 1 MB. Quando não serve, devolve o motivo (vai para o erro da fila).
 */
export function prepararXmlNfe(xml: string | null | undefined): { xml: string } | { erro: string } {
  let s = String(xml ?? "").replace(/^﻿/, "").trim();
  if (!s) return { erro: "XML da NF-e não encontrado" };
  if (!/<nfeProc[\s>]/.test(s)) return { erro: "o XML não é de NF-e autorizada (sem nfeProc)" };
  if (!s.startsWith("<?xml")) s = `<?xml version="1.0" encoding="UTF-8"?>${s}`;
  if (new TextEncoder().encode(s).length > 1_000_000) return { erro: "o XML passa de 1 MB" };
  return { xml: s };
}
