// Pluggy (Open Finance): chaves, chamadas à API e conversão dos lançamentos para o extrato do ERP.
// As chaves vêm dos secrets PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET ou do cofre (gravadas pela tela do ERP).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";

export const API_PLUGGY = "https://api.pluggy.ai";

export type Chaves = { clientId: string; clientSecret: string; origem: "secret" | "cofre" };
export type ItemPluggy = {
  id: string; status: string; executionStatus?: string; lastUpdatedAt?: string | null; consentExpiresAt?: string | null;
  connector?: { id: number; name: string } | null; error?: { code?: string; message?: string } | null;
};
export type ContaPluggy = {
  id: string; type: string; subtype?: string; name?: string; marketingName?: string | null; number?: string | null; balance?: number | null;
};
export type TransacaoPluggy = {
  id: string; description?: string | null; descriptionRaw?: string | null; amount: number; date: string;
  type?: "CREDIT" | "DEBIT"; status?: "POSTED" | "PENDING";
  paymentData?: { payer?: { name?: string | null } | null; receiver?: { name?: string | null } | null; referenceNumber?: string | null } | null;
};

export async function chavesPluggy(db: SupabaseClient): Promise<Chaves | null> {
  const id = Deno.env.get("PLUGGY_CLIENT_ID")?.trim(), sec = Deno.env.get("PLUGGY_CLIENT_SECRET")?.trim();
  if (id && sec) return { clientId: id, clientSecret: sec, origem: "secret" };
  const { data } = await db.rpc("openfinance_chaves");
  if (data?.client_id && data?.client_secret) return { clientId: data.client_id, clientSecret: data.client_secret, origem: "cofre" };
  return null;
}

let sessao: { clientId: string; key: string; ate: number } | null = null;

/** Chave de acesso da Pluggy (vale 2 horas; guardada enquanto a função está de pé). */
export async function entrarPluggy(ch: Pick<Chaves, "clientId" | "clientSecret">, novo = false): Promise<string> {
  if (!novo && sessao && sessao.clientId === ch.clientId && sessao.ate > Date.now()) return sessao.key;
  const r = await fetch(`${API_PLUGGY}/auth`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: ch.clientId, clientSecret: ch.clientSecret }), signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || typeof j?.apiKey !== "string") {
    throw new Error(r.status === 400 || r.status === 401 || r.status === 403
      ? "A Pluggy recusou as chaves (Client ID / Client Secret). Confira em dashboard.pluggy.ai → Aplicações."
      : `Pluggy fora do ar ou sem resposta (${r.status}). Tente de novo em alguns minutos.`);
  }
  sessao = { clientId: ch.clientId, key: j.apiKey, ate: Date.now() + 100 * 60_000 };
  return j.apiKey;
}

export async function pluggy<T>(ch: Chaves, metodo: "GET" | "POST" | "PATCH" | "DELETE", caminho: string, corpo?: unknown): Promise<T> {
  const chamar = async (key: string) => fetch(`${API_PLUGGY}${caminho}`, {
    method: metodo, headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo), signal: AbortSignal.timeout(30000),
  });
  let r = await chamar(await entrarPluggy(ch));
  if (r.status === 401 || r.status === 403) r = await chamar(await entrarPluggy(ch, true)); // chave vencida
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Pluggy (${r.status})${j?.message ? `: ${j.message}` : ""}`);
  return j as T;
}

/** Data do lançamento no fuso de Brasília (a Pluggy manda em UTC). */
export function dataLocal(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/** Lançamento da Pluggy no formato do extrato do ERP (entrada positiva, saída negativa). */
export function linhaDoExtrato(t: TransacaoPluggy) {
  const bruto = Number(t.amount) || 0;
  const valor = t.type === "DEBIT" ? -Math.abs(bruto) : t.type === "CREDIT" ? Math.abs(bruto) : bruto;
  const desc = (t.description || t.descriptionRaw || "").trim();
  const outro = (valor > 0 ? t.paymentData?.payer?.name : t.paymentData?.receiver?.name)?.trim();
  return {
    data: dataLocal(t.date),
    valor: Math.round(valor * 100) / 100,
    descricao: [desc, outro && !desc.toLowerCase().includes(outro.toLowerCase()) ? outro : null].filter(Boolean).join(" · ") || null,
    documento: t.paymentData?.referenceNumber?.trim() || null,
    identificador: `pluggy:${t.id}`,
  };
}

/** Nome da conta como o banco mostra: "Conta corrente 12345-6". */
export const nomeConta = (a: ContaPluggy) => [a.marketingName || a.name || (a.type === "CREDIT" ? "Cartão" : "Conta"), a.number].filter(Boolean).join(" ");

/** Situação da conexão em português; null = tudo certo. */
export function avisoDoItem(item: ItemPluggy): { erro: boolean; texto: string } | null {
  if (item.consentExpiresAt && new Date(item.consentExpiresAt).getTime() < Date.now()) {
    return { erro: true, texto: "O consentimento do Open Finance venceu: clique em Reconectar e autorize de novo no banco." };
  }
  if (item.status === "LOGIN_ERROR" || item.status === "WAITING_USER_INPUT") {
    return { erro: true, texto: "O banco pediu nova autorização: clique em Reconectar." };
  }
  if (item.status === "OUTDATED") {
    return { erro: false, texto: `O banco não respondeu na última atualização${item.error?.message ? ` (${item.error.message})` : ""}. O ERP tenta de novo sozinho.` };
  }
  return null;
}
