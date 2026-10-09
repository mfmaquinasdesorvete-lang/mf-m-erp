// Cliente mínimo da API Focus NFe (emissão de NF-e e NF-e recebidas/MDe).
// Secrets: FOCUS_NFE_TOKEN, FOCUS_NFE_ENV ("homologacao" | "producao")
// Cada CNPJ tem o seu token na Focus: a unidade usa FOCUS_NFE_TOKEN_<código> (ex.: FOCUS_NFE_TOKEN_SP)
// e, se ele não existir, o FOCUS_NFE_TOKEN geral (o da matriz).
// NF-e recebidas de fornecedores só existem em produção (a homologação da SEFAZ não tem notas reais):
// enquanto a emissão está em homologação, elas usam FOCUS_NFE_TOKEN_PRODUCAO(_<código>).
// Em produção, o FOCUS_NFE_TOKEN_PRODUCAO(_<código>) também vale para a emissão e tem preferência sobre o
// FOCUS_NFE_TOKEN(_<código>), que costuma ficar com o token de homologação.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { HttpError } from "./supabase.ts";

/**
 * Valor de FOCUS_NFE_ENV como o ERP entende: sem acento, sem aspas, sem espaços, minúsculo, sem pontuação no fim
 * e sem o nome do secret colado junto ("FOCUS_NFE_ENV=producao" vale como "producao").
 */
export const ambienteLido = () =>
  (Deno.env.get("FOCUS_NFE_ENV") ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/["'`\s]/g, "").toLowerCase()
    .replace(/^focus_?nfe_?env[=:]/, "").replace(/[.;,]+$/, "");

/** FOCUS_NFE_ENV = "producao" (aceita também "produção", "PRODUCAO", "production", "prod", com ou sem aspas). */
export const focusProducao = () => ["producao", "production", "prod", "prd"].includes(ambienteLido());

const NOMES_AMBIENTE = ["producao", "production", "prod", "prd", "homologacao", "homologation", "homolog", "teste", "test", "sandbox"];
/** Como mostrar o FOCUS_NFE_ENV numa mensagem sem nunca expor um token colado nele por engano. */
export function ambienteParaMensagem() {
  const bruto = Deno.env.get("FOCUS_NFE_ENV");
  if (bruto === undefined) return "não cadastrado";
  if (!bruto.trim()) return "vazio";
  if (NOMES_AMBIENTE.includes(ambienteLido())) return JSON.stringify(bruto.trim());
  return `um texto de ${bruto.trim().length} caracteres que não é o nome de um ambiente (parece um token colado no lugar errado)`;
}

export const focusBaseUrl = () =>
  focusProducao() ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";

/** Sem espaços ou quebras de linha que às vezes vêm junto ao colar no painel do Supabase. */
const limpo = (v: string | undefined) => v?.replace(/\s+/g, "") || null;

/** Ordem dos secrets do token da unidade: o da própria unidade antes do geral e, em produção, o
 * FOCUS_NFE_TOKEN_PRODUCAO(_SP) antes do FOCUS_NFE_TOKEN(_SP) (é o token de produção cadastrado para as notas recebidas). */
function ordemSecrets(codigo?: string | null, producao = focusProducao()) {
  const cod = codigo?.trim().toUpperCase();
  return [
    producao && cod && `FOCUS_NFE_TOKEN_PRODUCAO_${cod}`, cod && `FOCUS_NFE_TOKEN_${cod}`,
    producao && "FOCUS_NFE_TOKEN_PRODUCAO", "FOCUS_NFE_TOKEN",
  ].filter(Boolean) as string[];
}

/** Token da unidade (pelo código, ex.: "SP") ou o geral. */
export const focusToken = (codigo?: string | null) =>
  ordemSecrets(codigo).map((n) => limpo(Deno.env.get(n))).find(Boolean) ?? null;

/** Nome do secret que fornece o token (para as mensagens e o diagnóstico; nunca o valor). */
export function secretDoToken(codigo?: string | null, op: OpcoesFocus = {}) {
  const cod = codigo?.trim().toUpperCase();
  const ordem = op.recebidas && !focusProducao()
    ? [cod && `FOCUS_NFE_TOKEN_PRODUCAO_${cod}`, "FOCUS_NFE_TOKEN_PRODUCAO"].filter(Boolean) as string[]
    : ordemSecrets(codigo);
  return ordem.find((n) => !!limpo(Deno.env.get(n))) ?? null;
}

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

/** Token de produção da unidade para as notas recebidas (ou null se não houver). */
const tokenProducao = (codigo?: string | null) =>
  (codigo ? limpo(Deno.env.get(`FOCUS_NFE_TOKEN_PRODUCAO_${codigo.trim().toUpperCase()}`)) : null)
  ?? limpo(Deno.env.get("FOCUS_NFE_TOKEN_PRODUCAO"))
  ?? (focusProducao() ? focusToken(codigo) : null);

/** As notas recebidas podem ser buscadas (produção ligada ou token de produção cadastrado). */
export const recebidasDisponiveis = () => focusProducao() || !!limpo(Deno.env.get("FOCUS_NFE_TOKEN_PRODUCAO"));

export type OpcoesFocus = { /** chamada de NF-e recebidas (sempre em produção) */ recebidas?: boolean };

function conexao(codigo?: string | null, op: OpcoesFocus = {}) {
  const cod = codigo?.trim().toUpperCase();
  if (op.recebidas && !focusProducao()) {
    const especifico = cod && limpo(Deno.env.get(`FOCUS_NFE_TOKEN_PRODUCAO_${cod}`)) ? `FOCUS_NFE_TOKEN_PRODUCAO_${cod}` : "FOCUS_NFE_TOKEN_PRODUCAO";
    return { base: "https://api.focusnfe.com.br", token: tokenProducao(codigo), secret: especifico, producao: true };
  }
  const especifico = secretDoToken(codigo) ?? (cod ? `FOCUS_NFE_TOKEN_${cod}` : "FOCUS_NFE_TOKEN");
  return { base: focusBaseUrl(), token: focusToken(codigo), secret: especifico, producao: focusProducao() };
}

export async function focus(path: string, init: RequestInit = {}, codigo?: string | null, op: OpcoesFocus = {}): Promise<Response> {
  const { base, token, secret } = conexao(codigo, op);
  if (!token) throw new HttpError(500, `${secret} não configurado no Supabase`);

  return fetch(base + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa(`${token}:`),
      ...(init.headers ?? {}),
    },
  });
}

export async function focusJson<T = any>(path: string, init: RequestInit = {}, codigo?: string | null, op: OpcoesFocus = {}): Promise<T> {
  const res = await focus(path, init, codigo, op);
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw erroDeToken(body, codigo, op);
  if (!res.ok && res.status !== 422) {
    throw new HttpError(502, body?.mensagem || `Focus NFe HTTP ${res.status}`);
  }
  return body as T;
}

/** Token recusado pela Focus: diz qual secret conferir. */
export function erroDeToken(body: any, codigo?: string | null, op: OpcoesFocus = {}) {
  const { secret, producao } = conexao(codigo, op);
  const cod = codigo?.trim().toUpperCase();
  const msg = String(body?.mensagem || "A Focus recusou o token").replace(/\.+$/, "");
  const dica = /cnpj/i.test(msg)
    ? `O token é de outra empresa cadastrada na Focus: cadastre no Supabase o token desta unidade${cod ? ` como ${op.recebidas && !focusProducao() ? `FOCUS_NFE_TOKEN_PRODUCAO_${cod}` : `FOCUS_NFE_TOKEN_${cod}`}` : ""}`
    : `Confira se o ${secret} no Supabase é o Token ${producao ? "de Produção" : "de Homologação"} da Focus`;
  // em homologação por engano: o token de produção é recusado no servidor de teste
  const lido = ambienteParaMensagem();
  const motivo = lido === "não cadastrado" ? "o secret FOCUS_NFE_ENV não existe" : lido === "vazio" ? "o FOCUS_NFE_ENV está vazio"
    : lido.startsWith("um texto") ? `o FOCUS_NFE_ENV tem ${lido}` : `o FOCUS_NFE_ENV está ${lido}`;
  const ambiente = producao ? "" : ` O ERP está em HOMOLOGAÇÃO (teste) porque ${motivo}. ` +
    "Para emitir de verdade, deixe no Supabase o secret FOCUS_NFE_ENV com só a palavra producao e o token de produção de cada empresa em FOCUS_NFE_TOKEN_PRODUCAO (SC) e FOCUS_NFE_TOKEN_PRODUCAO_SP (SP).";
  return new HttpError(502, `${msg}. ${dica}.${ambiente}`);
}

/** Os caminhos de XML/DANFE vêm relativos; transforma em URL absoluta. */
export const focusUrl = (path?: string | null) =>
  path ? (path.startsWith("http") ? path : focusBaseUrl() + path) : null;
