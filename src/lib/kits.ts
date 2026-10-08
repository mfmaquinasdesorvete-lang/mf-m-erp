// Kits: composição padrão, escolha de opcionais/alternativas e estoque disponível do kit.
import type { EscolhaKit, KitComponente } from "./types";

/** Componentes que saem do estoque para 1 kit (o que o banco faz na aprovação). */
export function composicao(kitId: string, comps: KitComponente[], escolha?: EscolhaKit | null): EscolhaKit {
  const doKit = comps.filter((c) => c.kit_id === kitId);
  if (escolha?.length) return escolha.filter((e) => doKit.some((c) => c.componente_id === e.componente_id) && e.quantidade > 0);
  return doKit.filter((c) => c.padrao).map((c) => ({ componente_id: c.componente_id, quantidade: Number(c.quantidade) }));
}

/** Quantos kits dá para montar com o estoque dos componentes. */
export function estoqueKit(kitId: string, comps: KitComponente[], saldo: (produtoId: string) => number, escolha?: EscolhaKit | null) {
  const lista = composicao(kitId, comps, escolha);
  if (!lista.length) return 0;
  return Math.max(0, Math.min(...lista.map((c) => Math.floor(saldo(c.componente_id) / c.quantidade))));
}
