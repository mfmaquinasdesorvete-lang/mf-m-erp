// Robô do Telegram (Bot API). Token no secret TELEGRAM_BOT_TOKEN (criado no @BotFather).
export class TelegramError extends Error {
  constructor(public codigo: number, message: string) {
    super(message);
  }
}

export async function telegram<T = any>(metodo: string, corpo: Record<string, unknown> = {}): Promise<T> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) throw new TelegramError(0, "defina o secret TELEGRAM_BOT_TOKEN no Supabase");
  const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new TelegramError(j.error_code ?? r.status, `Telegram: ${j.description ?? r.statusText}`);
  return j.result as T;
}

export const enviarTelegram = (chatId: string | number, texto: string) =>
  telegram("sendMessage", { chat_id: chatId, text: texto, parse_mode: "HTML", link_preview_options: { is_disabled: true } });

/** 403 = a pessoa bloqueou o robô ou apagou a conversa: não adianta tentar de novo. */
export const chatPerdido = (e: unknown) => e instanceof TelegramError && (e.codigo === 403 || /chat not found/i.test(e.message));
