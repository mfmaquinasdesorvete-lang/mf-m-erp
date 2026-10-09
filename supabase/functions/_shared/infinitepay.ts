// InfinitePay: link de pagamento (checkout) e conferência do pagamento. Funções puras + as duas chamadas à API.
// A conta é identificada só pela InfiniteTag ("handle"), sem chave. Valores em centavos.
// Conferido na API (out/2026): o cliente aceita name, email e phone_number (+55...); CPF/CNPJ é ignorado.

export const API_INFINITEPAY = "https://api.infinitepay.io/invoices/public/checkout";

export type ClienteLink = { nome?: string | null; email?: string | null; whatsapp?: string | null; telefone?: string | null };

export const centavos = (valor: number) => Math.round(Number(valor) * 100);

/** Telefone no formato que a InfinitePay aceita (+55DDNNNNNNNNN); fora disso, não manda. */
export function telefoneInternacional(...numeros: (string | null | undefined)[]): string | null {
  for (const n of numeros) {
    const d = (n ?? "").replace(/\D/g, "");
    if (d.length === 10 || d.length === 11) return "+55" + d;
    if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return "+" + d;
  }
  return null;
}

const emailValido = (e?: string | null) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/** Corpo do pedido de criação do link. */
export function pedidoLink(p: { handle: string; id: string; descricao: string; valor: number; cliente?: ClienteLink | null; avisoUrl: string }) {
  const customer: Record<string, string> = {};
  if (p.cliente?.nome?.trim()) customer.name = p.cliente.nome.trim().slice(0, 100);
  if (emailValido(p.cliente?.email)) customer.email = p.cliente!.email!.trim();
  const fone = telefoneInternacional(p.cliente?.whatsapp, p.cliente?.telefone);
  if (fone) customer.phone_number = fone;
  return {
    handle: p.handle,
    order_nsu: p.id,
    webhook_url: p.avisoUrl,
    items: [{ quantity: 1, price: centavos(p.valor), description: (p.descricao.trim() || "Cobrança MF Máquinas").slice(0, 100) }],
    ...(Object.keys(customer).length ? { customer } : {}),
  };
}

/** Mensagem em português para os erros conhecidos da API. */
export function erroInfinitePay(status: number, corpo: { error?: string; message?: string } | null): string {
  const cod = corpo?.error ?? "";
  if (cod === "external_checkout_not_enabled") {
    return "Na InfinitePay, esta conta não está com o checkout externo ligado (ou a InfiniteTag está errada). Confira a tag em Configurações → Unidades e ligue em app.infinitepay.io → Checkout externo → Configurações.";
  }
  return `A InfinitePay recusou o pedido (${status}${cod ? `: ${cod}` : ""})${corpo?.message ? `: ${corpo.message}` : ""}`;
}

/** Aviso de pagamento da InfinitePay: só o que importa, com tipos conferidos. */
export function lerAviso(b: Record<string, unknown> | null) {
  if (!b) return null;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() && !isNaN(Number(v)) ? Number(v) : null);
  const id = s(b.order_nsu);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return {
    id, nsu: s(b.transaction_nsu), slug: s(b.invoice_slug) ?? s(b.slug), metodo: s(b.capture_method),
    parcelas: n(b.installments), valor: n(b.amount), pago: n(b.paid_amount), recibo: s(b.receipt_url),
  };
}

export async function criarLinkInfinitePay(corpo: ReturnType<typeof pedidoLink>): Promise<string> {
  const r = await fetch(`${API_INFINITEPAY}/links`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => null);
  const url = j?.url ?? j?.payment_url;
  if (!r.ok || typeof url !== "string") throw new Error(erroInfinitePay(r.status, j));
  return url;
}

/** Pergunta à InfinitePay se o pagamento foi mesmo aprovado (o aviso não vem assinado). */
export async function conferirPagamento(p: { handle: string; id: string; nsu: string; slug: string }) {
  const r = await fetch(`${API_INFINITEPAY}/payment_check`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle: p.handle, order_nsu: p.id, transaction_nsu: p.nsu, slug: p.slug }), signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error(`conferência falhou (${r.status})`);
  return {
    pago: j.paid === true,
    valor: typeof j.amount === "number" ? j.amount : null,
    pagoValor: typeof j.paid_amount === "number" ? j.paid_amount : null,
    parcelas: typeof j.installments === "number" ? j.installments : null,
    metodo: typeof j.capture_method === "string" ? j.capture_method : null,
  };
}
