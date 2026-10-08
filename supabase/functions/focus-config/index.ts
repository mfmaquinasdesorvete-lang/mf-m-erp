// Configura os gatilhos (webhooks) da Focus NFe apontando para a função focus-webhook.
// POST { acao: "status" }     -> lista os gatilhos cadastrados, por unidade
// POST { acao: "registrar" }  -> cadastra os gatilhos "nfe" e "nfe_recebida" (se faltarem) em cada unidade;
//                               a unidade que a Focus recusar volta em "falhas" sem impedir as outras
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, onlyDigits, requireErpUser } from "../_shared/supabase.ts";
import { focusJson, focusProducao } from "../_shared/focusnfe.ts";

const EVENTOS = ["nfe", "nfe_recebida"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    await requireErpUser(req, []);
    const { acao } = await req.json();
    const db = adminClient();
    const { data: unidades } = await db.from("unidades").select("nome, codigo, cnpj").eq("ativo", true);
    const lista = (unidades ?? [])
      .map((u: any) => ({ nome: u.nome as string, codigo: u.codigo as string, cnpj: onlyDigits(u.cnpj) }))
      .filter((u) => u.cnpj.length === 14);
    if (!lista.length) throw new HttpError(400, "preencha o CNPJ das unidades em Configurações → Unidades");

    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/focus-webhook`;
    /** Gatilhos de uma unidade, consultados com o token dela (cada CNPJ tem o seu na Focus). */
    const gatilhos = async (u: (typeof lista)[number]) => {
      const hooks = await focusJson<any[]>(`/v2/hooks`, {}, u.codigo);
      return (Array.isArray(hooks) ? hooks : []).filter((h) => onlyDigits(h.cnpj) === u.cnpj && h.url === url);
    };
    // Cada unidade separada: uma filial ainda sem token não impede a matriz
    const situacao = async () => {
      const porUnidade = await Promise.all(lista.map(async (u) => {
        try {
          const hooks = await gatilhos(u);
          return { nome: u.nome, cnpj: u.cnpj, eventos: EVENTOS.filter((e) => hooks.some((h) => h.event === e)) };
        } catch (e) {
          return { nome: u.nome, cnpj: u.cnpj, eventos: [] as string[], erro: (e as Error).message };
        }
      }));
      if (porUnidade.every((u) => u.erro)) throw new HttpError(502, porUnidade.map((u) => `${u.nome}: ${u.erro}`).join(" | "));
      return {
        ok: true,
        ambiente: focusProducao() ? "producao" : "homologacao",
        // um evento só conta como ativo se estiver registrado para todas as unidades
        eventos: EVENTOS.filter((e) => porUnidade.every((u) => u.eventos.includes(e))),
        unidades: porUnidade,
      };
    };

    if (acao === "status") return json(await situacao());

    if (acao === "registrar") {
      const token = Deno.env.get("FOCUS_WEBHOOK_TOKEN")?.trim();
      if (!token) throw new HttpError(500, "defina o secret FOCUS_WEBHOOK_TOKEN no Supabase");
      const criados: string[] = [];
      const falhas: { nome: string; cnpj: string; mensagem: string }[] = [];
      for (const u of lista) {
        try {
          const existentes = await gatilhos(u);
          for (const event of EVENTOS.filter((e) => !existentes.some((h) => h.event === e))) {
            const r = await focusJson(`/v2/hooks`, {
              method: "POST",
              body: JSON.stringify({ cnpj: u.cnpj, event, url, authorization: token }),
            }, u.codigo);
            if (r?.erros || r?.codigo) throw new HttpError(422, r.mensagem || `falha ao criar o gatilho ${event}`);
            criados.push(`${event}:${u.cnpj}`);
          }
        } catch (e) {
          falhas.push({ nome: u.nome, cnpj: u.cnpj, mensagem: (e as Error).message });
        }
      }
      if (falhas.length === lista.length) throw new HttpError(502, falhas.map((f) => `${f.nome}: ${f.mensagem}`).join(" | "));
      return json({ ...(await situacao()), criados, falhas });
    }

    throw new HttpError(400, "ação inválida");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
