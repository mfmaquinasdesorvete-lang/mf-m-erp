// Entregas de cada chat do Claude (Sobre → Chats → Central dos chats): na hora de montar o site, o vite.config.ts lê
// no git as mudanças que têm a linha "Claude-Session: …/session_…" e grava em __ERP_ENTREGAS_CHATS__.
export type EntregaChat = { hash: string; quando: string; assunto: string; sessao: string };

export const FORMATO_GIT_CHATS = "%h%x1f%cI%x1f%s%x1f%(trailers:key=Claude-Session,valueonly,separator=%x20)%x1e";

/** Saída do `git log --format=FORMATO_GIT_CHATS` → entregas com o chat (session_…) de onde vieram. */
export function lerEntregasChats(saida: string): EntregaChat[] {
  return saida.split("\x1e").map((b) => b.trim()).filter(Boolean).flatMap((b) => {
    const [hash, quando, assunto, trailer] = b.split("\x1f");
    const sessao = trailer?.match(/session_[A-Za-z0-9]+/)?.[0];
    return hash && quando && sessao ? [{ hash, quando, assunto: assunto ?? "", sessao }] : [];
  });
}
