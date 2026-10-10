import { ehErroDeVersao, MSG_VERSAO } from "./versao";

export type Aviso = { id: number; texto: string; tipo: "ok" | "erro" };

export function notify(texto: string, tipo: Aviso["tipo"] = "ok") {
  window.dispatchEvent(new CustomEvent<Aviso>("erp-aviso", { detail: { id: Date.now() + Math.random(), texto, tipo } }));
}

export const notifyError = (e: unknown) => {
  // arquivo de uma versão que já saiu do servidor (aba aberta antes da atualização)
  if (ehErroDeVersao(e)) {
    window.dispatchEvent(new Event("erp-versao-nova"));
    return notify(MSG_VERSAO, "erro");
  }
  notify(e instanceof Error ? e.message : (e as any)?.message ?? String(e), "erro");
};
