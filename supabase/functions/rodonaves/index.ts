// Rodonaves (RTE): cotação de frete pela API. O usuário e a senha ficam só nos secrets do Supabase
// (RODONAVES_USUARIO e RODONAVES_SENHA); o token não sai da função.
// POST { acao: "testar" }            -> confere o acesso (pega o token) e diz qual servidor respondeu
// POST { acao: "cotar", envio_id }   -> simula a cotação com os dados do envio: valor e prazo (dias úteis)
// POST { acao: "cep", cep }          -> cidade da Rodonaves para o CEP (para conferir quando a cotação falha)
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { faltaParaCotarRte } from "../_shared/rodonaves.ts";
import { acessoRte, cidade, conectar, cotarRte } from "../_shared/rodonaves-api.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireErpUser(req, ["vendas", "financeiro", "expedicao"]);
    const body = await req.json().catch(() => ({}));
    const { usuario, senha } = acessoRte();

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
      return json({ ok: true, ...(await cotarRte(dados, un!.cnpj)) });
    }

    throw new HttpError(400, "ação desconhecida");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
