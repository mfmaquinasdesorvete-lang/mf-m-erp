// Cliente mínimo da API Focus NFe (emissão de NF-e e NF-e recebidas/MDe).
// Secrets: FOCUS_NFE_TOKEN, FOCUS_NFE_ENV ("homologacao" | "producao")
// Cada CNPJ tem o seu token na Focus: a unidade usa FOCUS_NFE_TOKEN_<código> (ex.: FOCUS_NFE_TOKEN_SP)
// e, se ele não existir, o FOCUS_NFE_TOKEN geral (o da matriz).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { HttpError } from "./supabase.ts";

export const focusProducao = () => Deno.env.get("FOCUS_NFE_ENV")?.trim().toLowerCase() === "producao";

export const focusBaseUrl = () =>
  focusProducao() ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";

/** Sem espaços ou quebras de linha que às vezes vêm junto ao colar no painel do Supabase. */
const limpo = (v: string | undefined) => v?.replace(/\s+/g, "") || null;

/** Token da unidade (pelo código, ex.: "SP") ou o geral. */
export const focusToken = (codigo?: string | null) =>
  (codigo ? limpo(Deno.env.get(`FOCUS_NFE_TOKEN_${codigo.trim().toUpperCase()}`)) : null) ?? limpo(Deno.env.get("FOCUS_NFE_TOKEN"));

const codigos = new Map<string, string | null>();
/** Código da unidade (SC, SP…) para escolher o token. */
export async function codigoUnidade(db: SupabaseClient, unidadeId?: string | null): Promise<string | null> {
  if (!unidadeId) return null;
  if (!codigos.has(unidadeId)) {
    const { data } = await db.from("unidades").select("codigo").eq("id", unidadeId).maybeSingle();
    codigos.set(unidadeId, data?.codigo ?? null);
  }
  return codigos.get(unidadeId) ?? null;
}

export async function focus(path: string, init: RequestInit = {}, codigo?: string | null): Promise<Response> {
  const token = focusToken(codigo);
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

export async function focusJson<T = any>(path: string, init: RequestInit = {}, codigo?: string | null): Promise<T> {
  const res = await focus(path, init, codigo);
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    const msg = String(body?.mensagem || "A Focus recusou o token").replace(/\.+$/, "");
    const secret = codigo && Deno.env.get(`FOCUS_NFE_TOKEN_${codigo.trim().toUpperCase()}`) !== undefined ? `FOCUS_NFE_TOKEN_${codigo.trim().toUpperCase()}` : "FOCUS_NFE_TOKEN";
    const dica = /cnpj/i.test(msg)
      ? `O token é de outra empresa cadastrada na Focus: cadastre no Supabase o token desta unidade${codigo ? ` como FOCUS_NFE_TOKEN_${codigo.trim().toUpperCase()}` : ""}`
      : `Confira se o ${secret} no Supabase é o Token ${focusProducao() ? "de Produção" : "de Homologação"} da Focus`;
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
