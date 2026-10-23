// Braspress: chamadas à API (Basic com usuário e senha). Usado pela função braspress e pela frete-cotar. O acesso vem
// dos secrets BRASPRESS_USUARIO e BRASPRESS_SENHA (BRASPRESS_HOMOLOGACAO = 1 para o ambiente de teste).
import { HttpError } from "./supabase.ts";
import { BASE_BRASPRESS, basicBraspress, corpoCotacaoBp, lerCotacaoBp, type EnvioBp } from "./braspress.ts";

export const temAcessoBp = () => !!(Deno.env.get("BRASPRESS_USUARIO") && Deno.env.get("BRASPRESS_SENHA"));
export const homologacaoBp = () => Deno.env.get("BRASPRESS_HOMOLOGACAO") === "1";

function acesso() {
  const usuario = Deno.env.get("BRASPRESS_USUARIO"), senha = Deno.env.get("BRASPRESS_SENHA");
  if (!usuario || !senha) throw new HttpError(400, "Faltam os secrets BRASPRESS_USUARIO e BRASPRESS_SENHA no Supabase (Edge Functions → Secrets). O acesso à API é pedido ao comercial da Braspress.");
  return basicBraspress(usuario, senha);
}

export async function chamarBp(caminho: string, init: RequestInit = {}) {
  const r = await fetch(`${homologacaoBp() ? BASE_BRASPRESS.homologacao : BASE_BRASPRESS.producao}${caminho}`, {
    ...init, signal: AbortSignal.timeout(25_000),
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: acesso() },
  });
  const texto = await r.text();
  let corpo: unknown = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = { message: texto.slice(0, 200) }; }
  if (r.status === 401 || r.status === 403) throw new HttpError(401, "A Braspress recusou o usuário e a senha da API. Confira os secrets BRASPRESS_USUARIO e BRASPRESS_SENHA.");
  return { status: r.status, corpo };
}

/** Valor e prazo da Braspress para os volumes (CNPJ da unidade e CPF/CNPJ do cliente). */
export async function cotarBp(dados: EnvioBp, cnpj: string, doc: string) {
  const r = await chamarBp("/v1/cotacao/calcular/json", { method: "POST", body: JSON.stringify(corpoCotacaoBp(dados, cnpj, doc)) });
  const c = lerCotacaoBp(r.corpo);
  if ("erro" in c) throw new HttpError(400, `Braspress: ${c.erro}`);
  return c;
}
