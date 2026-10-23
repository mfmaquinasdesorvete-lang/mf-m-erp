// Ordem do que pede atenção na tela inicial (mapa de atenção de 23/10): primeiro o urgente (dinheiro vencido, entrega
// atrasada, produção parada), depois o que é só para acompanhar. Mostra poucos de cada vez para não competirem entre si.

export type NivelAtencao = "urgente" | "acompanhar";
export type ItemAtencao = { nivel: NivelAtencao; texto: string };

/** Quantos itens a tela inicial mostra antes do "Ver mais". */
export const ATENCAO_VISIVEIS = 4;

/** Urgentes primeiro, mantendo a ordem de cada grupo; separa os que aparecem dos que ficam no "Ver mais". */
export function ordenarAtencao<T extends ItemAtencao>(itens: T[], visiveis = ATENCAO_VISIVEIS) {
  const ordem = [...itens.filter((i) => i.nivel === "urgente"), ...itens.filter((i) => i.nivel !== "urgente")];
  return {
    ordem,
    visiveis: ordem.slice(0, visiveis),
    escondidos: ordem.slice(visiveis),
    urgentes: ordem.filter((i) => i.nivel === "urgente").length,
  };
}
