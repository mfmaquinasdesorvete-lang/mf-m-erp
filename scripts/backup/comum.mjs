// Funções comuns dos scripts de backup (Node 20+, sem dependências).
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export const REF = process.env.PROJECT_REF;
export const URL_PROJETO = `https://${REF}.supabase.co`;

/** Chave de serviço do projeto, pedida à API do Supabase com o token de acesso (fica mascarada no log). */
export async function chaveServico() {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
  });
  if (!r.ok) throw new Error(`não consegui a chave do projeto (HTTP ${r.status})`);
  const lista = await r.json();
  const k = lista.find((x) => x.name === "service_role" && x.api_key)?.api_key
    ?? lista.find((x) => x.type === "secret" && x.api_key && !x.api_key.includes("·"))?.api_key;
  if (!k) throw new Error("o projeto não devolveu a chave de serviço");
  console.log(`::add-mask::${k}`);
  return k;
}

/** Cabeçalhos para o Storage/REST com a chave de serviço (chave nova sb_secret_ vai só no apikey). */
export const cabecalhos = (k) => (k.startsWith("sb_secret_") ? { apikey: k } : { apikey: k, Authorization: `Bearer ${k}` });

export function sha256Arquivo(caminho) {
  return new Promise((ok, falha) => {
    const h = createHash("sha256");
    createReadStream(caminho).on("data", (d) => h.update(d)).on("end", () => ok(h.digest("hex"))).on("error", falha);
  });
}

/** Linhas de cada tabela no data.sql (blocos COPY ... FROM stdin; ... \.). */
export function contarLinhasDump(texto) {
  const contagem = {};
  let atual = null;
  for (const linha of texto.split("\n")) {
    if (atual) {
      if (linha === "\\.") atual = null;
      else contagem[atual]++;
      continue;
    }
    const m = /^COPY ("?[\w$]+"?\."?[\w$]+"?) .* FROM stdin;$/.exec(linha);
    if (m) { atual = m[1].replace(/"/g, ""); contagem[atual] = 0; }
  }
  return contagem;
}

export const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
