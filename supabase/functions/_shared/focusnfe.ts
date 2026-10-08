// Cliente mínimo da API Focus NFe (emissão de NF-e e NF-e recebidas/MDe).
// Secrets: FOCUS_NFE_TOKEN, FOCUS_NFE_ENV ("homologacao" | "producao")
import { HttpError } from "./supabase.ts";

export const focusBaseUrl = () =>
  Deno.env.get("FOCUS_NFE_ENV") === "producao"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";

export async function focus(path: string, init: RequestInit = {}): Promise<Response> {
  const token = Deno.env.get("FOCUS_NFE_TOKEN");
  if (!token) throw new HttpError(500, "FOCUS_NFE_TOKEN não configurado");

  return fetch(focusBaseUrl() + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa(`${token}:`),
      ...(init.headers ?? {}),
    },
  });
}

export async function focusJson<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await focus(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 422) {
    throw new HttpError(502, body?.mensagem || `Focus NFe HTTP ${res.status}`);
  }
  return body as T;
}

/** Os caminhos de XML/DANFE vêm relativos; transforma em URL absoluta. */
export const focusUrl = (path?: string | null) =>
  path ? (path.startsWith("http") ? path : focusBaseUrl() + path) : null;
