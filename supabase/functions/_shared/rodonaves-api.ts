// Rodonaves (RTE): chamadas à API (token, cidade pelo CEP e simulação). Usado pela função rodonaves e pela
// frete-cotar. O usuário e a senha vêm dos secrets RODONAVES_USUARIO e RODONAVES_SENHA; o token não sai daqui.
import { HttpError, onlyDigits } from "./supabase.ts";
import { corpoSimulacao, corpoToken, lerCidade, lerSimulacao, mensagemRte, SERVIDORES_RTE, type EnvioRte } from "./rodonaves.ts";

type Servidor = (typeof SERVIDORES_RTE)[number];
export type Conexao = { servidor: Servidor; token: string };

export function acessoRte() {
  const usuario = Deno.env.get("RODONAVES_USUARIO"), senha = Deno.env.get("RODONAVES_SENHA");
  if (!usuario || !senha) throw new HttpError(400, "Faltam os secrets RODONAVES_USUARIO e RODONAVES_SENHA no Supabase (Edge Functions → Secrets).");
  return { usuario, senha };
}
export const temAcessoRte = () => !!(Deno.env.get("RODONAVES_USUARIO") && Deno.env.get("RODONAVES_SENHA"));

async function chamar(url: string, init: RequestInit) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const texto = await r.text();
  let corpo: unknown = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = { Message: texto.slice(0, 200) }; }
  return { status: r.status, corpo };
}

/** Pega o token no primeiro servidor que aceitar o usuário e a senha. */
export async function conectar(usuario: string, senha: string, pular: string[] = []): Promise<Conexao & { tentativas: string[] }> {
  const tentativas: string[] = [];
  for (const s of SERVIDORES_RTE) {
    if (pular.includes(s.nome)) continue;
    try {
      const r = await chamar(s.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: corpoToken(usuario, senha) });
      const token = (r.corpo as Record<string, unknown> | null)?.access_token;
      if (r.status < 300 && typeof token === "string" && token) return { servidor: s, token, tentativas };
      tentativas.push(`${s.nome}: ${mensagemRte(r.corpo) ?? `HTTP ${r.status}`}`);
    } catch (e) {
      tentativas.push(`${s.nome}: ${(e as Error).message}`);
    }
  }
  throw new HttpError(502, `A Rodonaves não aceitou o acesso (${tentativas.join("; ")}). Confira o usuário e a senha da API nos secrets RODONAVES_USUARIO e RODONAVES_SENHA.`);
}

export async function cidade(c: Conexao, cep: string | null | undefined) {
  const r = await chamar(`${c.servidor.api}/api/v1/busca-por-cep?zipCode=${onlyDigits(cep)}`, { headers: { Accept: "application/json", Authorization: `Bearer ${c.token}` } });
  if (r.status === 401) throw new HttpError(401, "token recusado");
  if (r.status === 404) throw new HttpError(404, "serviço não encontrado neste servidor");
  return lerCidade(r.corpo);
}

async function cotar(c: Conexao, envio: EnvioRte, cnpj: string) {
  const o = await cidade(c, envio.cep_origem);
  if ("erro" in o) throw new HttpError(400, `Origem (CEP ${envio.cep_origem}): ${o.erro}`);
  const d = await cidade(c, envio.cep_destino);
  if ("erro" in d) throw new HttpError(400, `Destino (CEP ${envio.cep_destino}): ${d.erro}`);
  const corpo = corpoSimulacao(envio, cnpj, o.id, d.id);
  const r = await chamar(`${c.servidor.api}/api/v1/simula-cotacao`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${c.token}` }, body: JSON.stringify(corpo),
  });
  if (r.status === 404) throw new HttpError(404, "serviço não encontrado neste servidor");
  const s = lerSimulacao(r.corpo);
  if ("erro" in s) throw new HttpError(400, `Rodonaves: ${s.erro}`);
  return { ...s, origem: `${o.nome}/${o.uf}`, destino: `${d.nome}/${d.uf}`, servidor: c.servidor.nome };
}

/** Cota tentando os servidores: o que aceita o acesso mas não tem a cotação é pulado. */
export async function cotarRte(dados: EnvioRte, cnpj: string) {
  const { usuario, senha } = acessoRte();
  const pular: string[] = [];
  for (;;) {
    let c: Conexao;
    try { c = await conectar(usuario, senha, pular); } catch (e) {
      if (!pular.length) throw e;
      throw new HttpError(502, `A Rodonaves aceitou o acesso (${pular.join(", ")}), mas o serviço de cotação não respondeu. Fale com o suporte da API da RTE.`);
    }
    try {
      return await cotar(c, dados, cnpj);
    } catch (e) {
      if ((e as HttpError).status !== 404 && (e as HttpError).status !== 401) throw e;
      pular.push(c.servidor.nome);
    }
  }
}
