// Configuração e testes dos avisos.
// POST { acao: "telegram_status" }            (admin) -> robô, webhook e pessoas conectadas
// POST { acao: "telegram_configurar" }        (admin) -> lê o @ do robô e registra o webhook
// POST { acao: "telegram_teste" }             (qualquer usuário) -> mensagem de teste no próprio Telegram
// POST { acao: "email_teste", para, tipo? }   (admin) -> e-mail de exemplo para o endereço informado
// POST { acao: "enviar_agora" }               (admin) -> entrega a fila sem esperar o agendamento
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { telegram, enviarTelegram } from "../_shared/telegram.ts";
import { enviarEmail, envioConfigurado } from "../_shared/email.ts";
import { EXEMPLOS, htmlEmail, mensagemCliente, textoEmail, textoTelegram } from "../_shared/avisos-modelos.ts";
import { empresaDoErp, entregarFila, logoEmail } from "../_shared/avisos.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { acao, para, tipo } = await req.json();
    const db = adminClient();

    if (acao === "telegram_teste") {
      const { userId } = await requireErpUser(req);
      const { data: u } = await db.from("usuarios_erp").select("nome, telegram_chat_id").eq("user_id", userId).single();
      if (!u?.telegram_chat_id) throw new HttpError(400, "conecte o seu Telegram primeiro");
      await enviarTelegram(u.telegram_chat_id, textoTelegram("teste", {}, { nome: u.nome }));
      return json({ ok: true });
    }

    await requireErpUser(req, []);

    if (acao === "telegram_status") {
      const { count } = await db.from("usuarios_erp").select("user_id", { count: "exact", head: true }).not("telegram_chat_id", "is", null);
      let robo: string | null = null, webhook = false, erro: string | null = null;
      try {
        robo = (await telegram<{ username: string }>("getMe")).username;
        const info = await telegram<{ url: string; last_error_message?: string }>("getWebhookInfo");
        webhook = info.url === urlWebhook();
        erro = info.last_error_message ?? null;
      } catch (e) {
        erro = (e as Error).message;
      }
      return json({ ok: true, robo, webhook, conectados: count ?? 0, erro, email: await envioConfigurado() });
    }

    if (acao === "telegram_configurar") {
      const segredo = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
      if (!segredo) throw new HttpError(500, "defina o secret TELEGRAM_WEBHOOK_SECRET no Supabase");
      const robo = (await telegram<{ username: string }>("getMe")).username;
      await telegram("setWebhook", { url: urlWebhook(), secret_token: segredo, allowed_updates: ["message"], drop_pending_updates: true });
      await telegram("setMyCommands", { commands: [{ command: "sair", description: "Parar de receber avisos" }] });
      await db.from("configuracoes").update({ telegram_bot: robo }).eq("id", 1);
      return json({ ok: true, robo });
    }

    if (acao === "email_teste") {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(para ?? ""))) throw new HttpError(400, "informe um e-mail válido");
      const t = typeof tipo === "string" && EXEMPLOS[tipo] && tipo.startsWith("cli_") ? tipo : "cli_os_pronta";
      const empresa = await empresaDoErp(db);
      const m = mensagemCliente(t, EXEMPLOS[t], empresa);
      await enviarEmail({
        para, assunto: `[TESTE] ${m.assunto}`, html: htmlEmail(m, empresa, undefined, logoEmail(empresa)),
        texto: textoEmail(m, empresa), responderPara: empresa.responder,
      });
      return json({ ok: true });
    }

    if (acao === "enviar_agora") return json({ ok: true, ...(await entregarFila(db)) });

    throw new HttpError(400, "ação inválida");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});

const urlWebhook = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-webhook`;
