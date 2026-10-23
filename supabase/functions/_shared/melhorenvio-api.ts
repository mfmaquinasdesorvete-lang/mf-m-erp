// Melhor Envio: chamadas à API. Usado pela função melhorenvio e pela frete-cotar. O token vem do secret
// MELHORENVIO_TOKEN (MELHORENVIO_CONTATO = e-mail para o User-Agent; MELHORENVIO_SANDBOX = 1 para o sandbox).
import { HttpError } from "./supabase.ts";
import { BASE_ME, corpoCalculoMe, lerCalculoMe, mensagemMe, type EnvioMe } from "./melhorenvio.ts";

export const temAcessoMe = () => !!Deno.env.get("MELHORENVIO_TOKEN");
export const sandboxMe = () => Deno.env.get("MELHORENVIO_SANDBOX") === "1";

export async function chamarMe(caminho: string, init: RequestInit = {}) {
  const token = Deno.env.get("MELHORENVIO_TOKEN");
  if (!token) throw new HttpError(400, "Falta o secret MELHORENVIO_TOKEN no Supabase (Edge Functions → Secrets). Gere o token no painel do Melhor Envio: Integrações → Permissões de acesso.");
  const contato = Deno.env.get("MELHORENVIO_CONTATO") ?? "sem e-mail";
  const r = await fetch(`${sandboxMe() ? BASE_ME.sandbox : BASE_ME.producao}${caminho}`, {
    ...init, signal: AbortSignal.timeout(25_000),
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}`, "User-Agent": `ERP Line (${contato})` },
  });
  const texto = await r.text();
  let corpo: unknown = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = { message: texto.slice(0, 200) }; }
  if (r.status === 401) throw new HttpError(401, "O Melhor Envio recusou o token. Gere um novo no painel (Integrações → Permissões de acesso) e troque o secret MELHORENVIO_TOKEN.");
  if (r.status >= 400) throw new HttpError(502, `Melhor Envio: ${mensagemMe(corpo) ?? `HTTP ${r.status}`}`);
  return corpo;
}

/** Serviços com preço para os volumes (do mais barato ao mais caro) e os que não atendem. */
export async function cotarMe(dados: EnvioMe) {
  const r = lerCalculoMe(await chamarMe("/api/v2/me/shipment/calculate", { method: "POST", body: JSON.stringify(corpoCalculoMe(dados)) }));
  if ("erro" in r) throw new HttpError(502, `Melhor Envio: ${r.erro}`);
  return r;
}
