// Recebe as mensagens enviadas ao robô do Telegram.
//   /start <código>  -> conecta a conta do Telegram ao usuário do ERP (código gerado em "Meus avisos")
//   /sair            -> para de receber avisos
// Protegida pelo header X-Telegram-Bot-Api-Secret-Token (= TELEGRAM_WEBHOOK_SECRET),
// registrado automaticamente por avisos-config. Deploy com --no-verify-jwt.
import { json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { enviarTelegram } from "../_shared/telegram.ts";
import { esc } from "../_shared/avisos-modelos.ts";

Deno.serve(async (req) => {
  const segredo = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (!segredo || req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== segredo) return json({ error: "não autorizado" }, 401);

  const update = await req.json().catch(() => ({}));
  const msg = update.message;
  const chatId = msg?.chat?.id;
  const texto: string = (msg?.text ?? "").trim();
  if (!chatId || msg.chat.type !== "private") return json({ ok: true });

  const db = adminClient();
  const responder = (t: string) => enviarTelegram(chatId, t).catch(() => null);

  const [comando, arg] = texto.split(/\s+/, 2);
  if (comando === "/start" && arg) {
    const { data: u } = await db.from("usuarios_erp")
      .select("user_id, nome, ativo, telegram_vinculo_expira")
      .eq("telegram_vinculo_token", arg).maybeSingle();
    if (!u || !u.ativo || !u.telegram_vinculo_expira || new Date(u.telegram_vinculo_expira) < new Date()) {
      await responder("Este link expirou. No ERP, abra <b>Meus avisos</b> e toque em <b>Conectar Telegram</b> de novo.");
      return json({ ok: true });
    }
    // um chat só pode estar ligado a uma pessoa
    await db.from("usuarios_erp").update({ telegram_chat_id: null }).eq("telegram_chat_id", chatId);
    await db.from("usuarios_erp").update({ telegram_chat_id: chatId, telegram_vinculo_token: null, telegram_vinculo_expira: null })
      .eq("user_id", u.user_id);
    await responder(`✅ Pronto, <b>${esc(String(u.nome).split(" ")[0])}</b>! Seu Telegram está conectado ao ERP da MF Máquinas.\n\nVocê vai receber aqui os avisos do seu setor. Para escolher quais, abra <b>Meus avisos</b> no ERP. Para parar, mande /sair.`);
    return json({ ok: true });
  }

  if (comando === "/sair" || comando === "/stop") {
    const { data } = await db.from("usuarios_erp").update({ telegram_chat_id: null }).eq("telegram_chat_id", chatId).select("user_id");
    await responder(data?.length ? "Você não vai mais receber avisos aqui. Para voltar, use <b>Meus avisos</b> no ERP." : "Este Telegram não está conectado ao ERP.");
    return json({ ok: true });
  }

  const { data: ligado } = await db.from("usuarios_erp").select("nome").eq("telegram_chat_id", chatId).maybeSingle();
  await responder(ligado
    ? `Oi, ${esc(String(ligado.nome).split(" ")[0])}! Eu só envio avisos do ERP; não leio mensagens. Para parar, mande /sair.`
    : "Olá! Eu sou o robô de avisos do ERP da MF Máquinas.\nPara conectar, abra o ERP → <b>Meus avisos</b> → <b>Conectar Telegram</b>.");
  return json({ ok: true });
});
