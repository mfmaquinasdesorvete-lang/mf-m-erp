// Mercado Pago: link de pagamento no cartão pelo Checkout (Checkout Pro, "preferência") e conferência do pagamento.
// Secrets: MERCADOPAGO_ACCESS_TOKEN_<código da unidade> (ex.: _SP) e, se ele não existir, MERCADOPAGO_ACCESS_TOKEN
// (o da matriz). É o "Access Token" de produção do Mercado Pago (Suas integrações → Credenciais de produção);
// fica só nos secrets do Supabase, nunca no ERP. Funções puras + as chamadas à API.

export const API_MP = "https://api.mercadopago.com";

export type ClienteMP = { nome?: string | null; email?: string | null };

/** Sem espaços ou quebras de linha que às vezes vêm junto ao colar no painel do Supabase. */
const limpo = (v: string | undefined) => v?.replace(/\s+/g, "") || null;

/** Nomes dos secrets, do mais específico (a unidade) ao geral. */
export const secretsMP = (codigo?: string | null) =>
  [codigo?.trim() && `MERCADOPAGO_ACCESS_TOKEN_${codigo.trim().toUpperCase()}`, "MERCADOPAGO_ACCESS_TOKEN"].filter(Boolean) as string[];

/** Token da unidade (pelo código, ex.: "SP") ou o geral; null quando não há nenhum. `env` lê os secrets (Deno.env.get). */
export function tokenMP(codigo: string | null | undefined, env: (n: string) => string | undefined) {
  for (const n of secretsMP(codigo)) { const v = limpo(env(n)); if (v) return { token: v, secret: n }; }
  return null;
}

const emailValido = (e?: string | null) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/**
 * Corpo da preferência (Checkout Pro): só cartão (o Pix fica com a InfinitePay), até 12x, com o id do link do ERP
 * em external_reference e o aviso de pagamento apontando para a função com ?mp=<id>.
 */
export function preferenciaMP(p: { id: string; descricao: string; valor: number; cliente?: ClienteMP | null; avisoUrl: string; parcelas?: number }) {
  const payer: Record<string, string> = {};
  if (p.cliente?.nome?.trim()) payer.name = p.cliente.nome.trim().slice(0, 100);
  if (emailValido(p.cliente?.email)) payer.email = p.cliente!.email!.trim();
  return {
    items: [{ id: p.id, title: (p.descricao.trim() || "Cobrança MF Máquinas").slice(0, 120), quantity: 1, currency_id: "BRL", unit_price: Math.round(p.valor * 100) / 100 }],
    external_reference: p.id,
    notification_url: `${p.avisoUrl}?mp=${p.id}`,
    statement_descriptor: "MF MAQUINAS",
    payment_methods: {
      excluded_payment_types: [{ id: "ticket" }, { id: "bank_transfer" }, { id: "atm" }],
      installments: Math.min(12, Math.max(1, p.parcelas ?? 12)),
    },
    ...(Object.keys(payer).length ? { payer } : {}),
  };
}

/** Mensagem em português para os erros conhecidos da API. */
export function erroMP(status: number, corpo: { message?: string; error?: string } | null): string {
  if (status === 401 || status === 403) return "O Mercado Pago recusou a chave (Access Token). Confira o secret no Supabase: tem que ser o de produção da conta certa.";
  return `O Mercado Pago recusou o pedido (${status}${corpo?.error ? `: ${corpo.error}` : ""})${corpo?.message ? `: ${corpo.message}` : ""}`;
}

async function chamar<T>(token: string, caminho: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API_MP}${caminho}`, {
    ...init, signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(erroMP(r.status, j));
  return j as T;
}

/** Cria a preferência e devolve o link de pagamento (init_point) e o id dela. */
export async function criarLinkMP(token: string, corpo: ReturnType<typeof preferenciaMP>, chave: string) {
  const j = await chamar<{ id?: string; init_point?: string }>(token, "/checkout/preferences", {
    method: "POST", body: JSON.stringify(corpo), headers: { "X-Idempotency-Key": chave },
  });
  if (!j.init_point || !j.id) throw new Error("O Mercado Pago não devolveu o link de pagamento.");
  return { url: j.init_point, preferencia: j.id };
}

/** Conta do Mercado Pago ligada à chave (para conferir em Configurações sem mostrar a chave). */
export const contaMP = (token: string) => chamar<{ id: number; nickname?: string; email?: string }>(token, "/users/me");

/** Número do pagamento no aviso: no corpo ({ type: "payment", data: { id } }) ou na URL (?data.id= / ?id=&topic=payment). */
export function pagamentoDoAviso(url: URL, corpo: Record<string, unknown> | null): string | null {
  const tipo = String(corpo?.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "");
  if (tipo && tipo !== "payment") return null;
  const dados = corpo?.data as { id?: unknown } | undefined;
  const id = String(dados?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "").trim();
  return /^\d{4,20}$/.test(id) ? id : null;
}

export type PagamentoMP = {
  id: number | string; status?: string; external_reference?: string | null; currency_id?: string; transaction_amount?: number;
  installments?: number; payment_type_id?: string; payment_method_id?: string;
  fee_details?: { type?: string; amount?: number; fee_payer?: string }[];
};

export const buscarPagamentoMP = (token: string, id: string) => chamar<PagamentoMP>(token, `/v1/payments/${encodeURIComponent(id)}`);

/**
 * O pagamento vale para o link? Aprovado, do link certo, em reais e com valor igual ou maior. A taxa é só a paga
 * pela MF (fee_payer "collector"): se o cliente pagou os juros do parcelamento, eles não entram.
 */
export function conferirPagamentoMP(p: PagamentoMP, linkId: string, valorLink: number) {
  const valor = Number(p.transaction_amount ?? 0);
  const taxa = Math.round((p.fee_details ?? []).filter((f) => (f.fee_payer ?? "collector") === "collector")
    .reduce((t, f) => t + Number(f.amount ?? 0), 0) * 100) / 100;
  const base = {
    nsu: String(p.id), metodo: p.payment_type_id ?? null, parcelas: p.installments ?? null, valor, taxa,
  };
  if (p.external_reference !== linkId) return { ...base, ok: false as const, motivo: "pagamento de outro link" };
  if (p.status !== "approved") return { ...base, ok: false as const, motivo: `pagamento ${p.status ?? "sem situação"} no Mercado Pago` };
  if ((p.currency_id ?? "BRL") !== "BRL") return { ...base, ok: false as const, motivo: "moeda diferente de real" };
  if (Math.round(valor * 100) < Math.round(valorLink * 100)) return { ...base, ok: false as const, motivo: "O Mercado Pago confirmou um valor menor que o do link: confira antes de dar baixa." };
  return { ...base, ok: true as const, motivo: null };
}
