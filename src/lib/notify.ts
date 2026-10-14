import { ehErroDeVersao, MSG_VERSAO } from "./versao";

export type Aviso = { id: number; texto: string; tipo: "ok" | "erro" };

export function notify(texto: string, tipo: Aviso["tipo"] = "ok") {
  window.dispatchEvent(new CustomEvent<Aviso>("erp-aviso", { detail: { id: Date.now() + Math.random(), texto, tipo } }));
}

const ultimoAviso = new Map<string, number>();

/** Falha de rede (sem internet, servidor fora do ar) e não erro de regra. */
export function ehErroDeRede(e: unknown) {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e ?? "");
  return /Failed to fetch|NetworkError|Load failed|network request failed|fetch failed|ERR_INTERNET|ERR_NETWORK|timeout|timed out/i.test(msg);
}

/**
 * Dados que não carregaram: avisa (uma vez a cada 20 s por mensagem) em vez de mostrar a lista vazia como se não
 * houvesse nada (ex.: alguém achar que não tem conta a pagar porque a internet caiu).
 */
export function notifyLeitura(e: unknown) {
  if (ehErroDeVersao(e)) return notifyError(e);
  const texto = ehErroDeRede(e)
    ? "Sem conexão com o servidor: alguns dados não carregaram e a tela pode estar incompleta. Confira a internet e abra a tela de novo."
    : `Alguns dados não carregaram: ${e instanceof Error ? e.message : (e as any)?.message ?? String(e)}`;
  const agora = Date.now();
  if (agora - (ultimoAviso.get(texto) ?? 0) < 20_000) return;
  ultimoAviso.set(texto, agora);
  notify(texto, "erro");
}

export const notifyError = (e: unknown) => {
  // arquivo de uma versão que já saiu do servidor (aba aberta antes da atualização)
  if (ehErroDeVersao(e)) {
    window.dispatchEvent(new Event("erp-versao-nova"));
    return notify(MSG_VERSAO, "erro");
  }
  notify(e instanceof Error ? e.message : (e as any)?.message ?? String(e), "erro");
};
