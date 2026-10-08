// Cliente mínimo da API Focus NFe (emissão de NF-e e NF-e recebidas/MDe).
// Secrets: FOCUS_NFE_TOKEN, FOCUS_NFE_ENV ("homologacao" | "producao")
import { HttpError } from "./supabase.ts";

export const focusProducao = () => Deno.env.get("FOCUS_NFE_ENV")?.trim().toLowerCase() === "producao";

export const focusBaseUrl = () =>
  focusProducao() ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";

/** Token sem espaços ou quebras de linha que às vezes vêm junto ao colar no painel do Supabase. */
export const focusToken = () => Deno.env.get("FOCUS_NFE_TOKEN")?.replace(/\s+/g, "") || null;

export async function focus(path: string, init: RequestInit = {}): Promise<Response> {
  const token = focusToken();
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
  if (res.status === 401 || res.status === 403) {
    const msg = String(body?.mensagem || "A Focus recusou o token").replace(/\.+$/, "");
    const dica = /cnpj/i.test(msg)
      ? "O token é de outra empresa cadastrada na Focus: use o token da empresa com o CNPJ desta unidade"
      : `Confira se o FOCUS_NFE_TOKEN no Supabase é o Token ${focusProducao() ? "de Produção" : "de Homologação"} da Focus`;
    throw new HttpError(502, `${msg}. ${dica}.`);
  }
  if (!res.ok && res.status !== 422) {
    throw new HttpError(502, body?.mensagem || `Focus NFe HTTP ${res.status}`);
  }
  return body as T;
}

/** Os caminhos de XML/DANFE vêm relativos; transforma em URL absoluta. */
export const focusUrl = (path?: string | null) =>
  path ? (path.startsWith("http") ? path : focusBaseUrl() + path) : null;
