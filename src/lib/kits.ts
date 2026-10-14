// Kits: composição padrão, escolha de opcionais/alternativas e estoque disponível do kit.
// Kit pode levar outro kit (ex.: Mecânica Dupla leva 2 Mecânicas Q 050): o estoque sai pelas peças de dentro,
// a mesma regra do banco (public.kit_composicao).
import type { EscolhaKit, KitComponente } from "./types";

const LIMITE = 10;

/** Componentes do 1º nível do kit: o que o vendedor vê e escolhe no pedido. */
export function composicao(kitId: string, comps: KitComponente[], escolha?: EscolhaKit | null): EscolhaKit {
  const doKit = comps.filter((c) => c.kit_id === kitId);
  if (escolha?.length) return escolha.filter((e) => doKit.some((c) => c.componente_id === e.componente_id) && e.quantidade > 0);
  return doKit.filter((c) => c.padrao).map((c) => ({ componente_id: c.componente_id, quantidade: Number(c.quantidade) }));
}

/** Um kit "aberto" tem componentes padrão; sem eles, sai do estoque como peça. */
export const ehKitAberto = (id: string, comps: KitComponente[]) => comps.some((c) => c.kit_id === id && c.padrao);

/** O que sai do estoque para 1 kit: abre os kits que estão dentro dele, até as peças. */
export function pecasDoKit(kitId: string, comps: KitComponente[], escolha?: EscolhaKit | null): EscolhaKit {
  const total = new Map<string, number>();
  const descer = (lista: EscolhaKit, mult: number, caminho: string[]) => {
    for (const c of lista) {
      const q = mult * c.quantidade;
      if (ehKitAberto(c.componente_id, comps) && !caminho.includes(c.componente_id) && caminho.length < LIMITE) {
        descer(composicao(c.componente_id, comps), q, [...caminho, c.componente_id]);
      } else if (!ehKitAberto(c.componente_id, comps)) {
        total.set(c.componente_id, (total.get(c.componente_id) ?? 0) + q);
      }
    }
  };
  descer(composicao(kitId, comps, escolha), 1, [kitId]);
  return [...total].map(([componente_id, quantidade]) => ({ componente_id, quantidade: Math.round(quantidade * 1000) / 1000 }));
}

/** Quantos kits dá para montar com o estoque das peças. */
export function estoqueKit(kitId: string, comps: KitComponente[], saldo: (produtoId: string) => number, escolha?: EscolhaKit | null) {
  const lista = pecasDoKit(kitId, comps, escolha);
  if (!lista.length) return 0;
  // folga pequena: 0,3 ÷ 0,1 dá 2,9999999… na conta do computador e precisa virar 3 kits
  return Math.max(0, Math.min(...lista.map((c) => Math.floor(saldo(c.componente_id) / c.quantidade + 1e-9))));
}

/** Custo de 1 kit pela soma das peças (kit dentro de kit entra pelas peças dele). */
export function custoKit(kitId: string, comps: KitComponente[], custo: (produtoId: string) => number, escolha?: EscolhaKit | null) {
  return pecasDoKit(kitId, comps, escolha).reduce((s, c) => s + c.quantidade * custo(c.componente_id), 0);
}
