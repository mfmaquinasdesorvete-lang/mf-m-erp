export type Aviso = { id: number; texto: string; tipo: "ok" | "erro" };

export function notify(texto: string, tipo: Aviso["tipo"] = "ok") {
  window.dispatchEvent(new CustomEvent<Aviso>("erp-aviso", { detail: { id: Date.now() + Math.random(), texto, tipo } }));
}

export const notifyError = (e: unknown) =>
  notify(e instanceof Error ? e.message : (e as any)?.message ?? String(e), "erro");
