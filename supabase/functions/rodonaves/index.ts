// Rodonaves (RTE): cotação de frete pela API. O usuário e a senha ficam só nos secrets do Supabase
// (RODONAVES_USUARIO e RODONAVES_SENHA); o token não sai da função.
// POST { acao: "testar" }            -> confere o acesso (pega o token) e diz qual servidor respondeu
// POST { acao: "cotar", envio_id }   -> simula a cotação com os dados do envio: valor e prazo (dias úteis)
// POST { acao: "cep", cep }          -> cidade da Rodonaves para o CEP (para conferir quando a cotação falha)
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, onlyDigits, requireErpUser } from "../_shared/supabase.ts";
import { corpoSimulacao, corpoToken, faltaParaCotarRte, lerCidade, lerSimulacao, mensagemRte, SERVIDORES_RTE } from "../_shared/rodonaves.ts";

type Servidor = (typeof SERVIDORES_RTE)[number];
type Conexao = { servidor: Servidor; token: string };

async function chamar(url: string, init: RequestInit) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const texto = await r.text();
  let corpo: unknown = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = { Message: texto.slice(0, 200) }; }
  return { status: r.status, corpo };
}

/** Pega o token no primeiro servidor que aceitar o usuário e a senha. */
async function conectar(usuario: string, senha: string, pular: string[] = []): Promise<Conexao & { tentativas: string[] }> {
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

async function cidade(c: Conexao, cep: string) {
  const r = await chamar(`${c.servidor.api}/api/v1/busca-por-cep?zipCode=${onlyDigits(cep)}`, { headers: { Accept: "application/json", Authorization: `Bearer ${c.token}` } });
  if (r.status === 401) throw new HttpError(401, "token recusado");
  if (r.status === 404) throw new HttpError(404, "serviço não encontrado neste servidor");
  return lerCidade(r.corpo);
}

async function cotar(c: Conexao, envio: Record<string, any>, cnpj: string) {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireErpUser(req, ["vendas", "financeiro", "expedicao"]);
    const body = await req.json().catch(() => ({}));
    const usuario = Deno.env.get("RODONAVES_USUARIO"), senha = Deno.env.get("RODONAVES_SENHA");
    if (!usuario || !senha) throw new HttpError(400, "Faltam os secrets RODONAVES_USUARIO e RODONAVES_SENHA no Supabase (Edge Functions → Secrets).");

    if (body.acao === "testar") {
      const c = await conectar(usuario, senha);
      return json({ ok: true, servidor: c.servidor.nome, tentativas: c.tentativas });
    }

    if (body.acao === "cep") {
      const c = await conectar(usuario, senha);
      return json({ ok: true, cidade: await cidade(c, String(body.cep ?? "")), servidor: c.servidor.nome });
    }

    if (body.acao === "cotar") {
      const db = adminClient();
      const { data: envio } = await db.from("envios")
        .select("id, numero, unidade_id, cep_origem, cep_destino, valor_mercadoria, peso_total_kg, volumes").eq("id", body.envio_id).maybeSingle();
      if (!envio) throw new HttpError(404, "envio não encontrado");
      const { data: un } = await db.from("unidades").select("cnpj, cep").eq("id", envio.unidade_id).maybeSingle();
      const dados = { ...envio, cep_origem: envio.cep_origem || un?.cep };
      const falta = faltaParaCotarRte(dados, un?.cnpj);
      if (falta.length) throw new HttpError(400, `Para cotar na Rodonaves falta: ${falta.join(", ")}. Complete e salve o envio.`);
      // servidor que não tem o serviço de cotação: tenta o próximo
      const pular: string[] = [];
      for (;;) {
        let c: Conexao;
        try { c = await conectar(usuario, senha, pular); } catch (e) {
          if (!pular.length) throw e;
          throw new HttpError(502, `A Rodonaves aceitou o acesso (${pular.join(", ")}), mas o serviço de cotação não respondeu. Fale com o suporte da API da RTE.`);
        }
        try {
          return json({ ok: true, ...(await cotar(c, dados, un!.cnpj)) });
        } catch (e) {
          if ((e as HttpError).status !== 404 && (e as HttpError).status !== 401) throw e;
          pular.push(c.servidor.nome);
        }
      }
    }

    throw new HttpError(400, "ação desconhecida");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
