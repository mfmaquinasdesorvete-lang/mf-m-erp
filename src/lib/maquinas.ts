// Contas e textos das máquinas: link da máquina do cliente (manuais, dicas, garantia), peças trocadas em garantia
// e custo médio das compras pelas notas.

export const linkMaquina = (token: string) => `${typeof window === "undefined" ? "" : window.location.origin}/maquina/${token}`;

/** Mensagem pronta com o link da máquina (manuais, dicas, garantia e o botão da assistência). */
export function mensagemMaquina(cliente: string | null | undefined, maquina: string, token: string) {
  const nome = String(cliente ?? "").trim().split(/\s+/)[0];
  return `Olá${nome ? `, ${nome}` : ""}! Aqui estão os manuais, as dicas de manutenção e a garantia da sua ${maquina}: ${linkMaquina(token)}`;
}

type OsComItens = { em_garantia: boolean; itens?: { descricao: string; quantidade: number; produto?: { preco_custo: number | null } | null }[] | null };

/** Peças trocadas nas OS em garantia: quantas e quanto custaram (pelo custo do cadastro), da mais cara para a mais barata. */
export function pecasEmGarantia(oss: OsComItens[]) {
  const porPeca = new Map<string, { descricao: string; quantidade: number; custo: number }>();
  for (const o of oss.filter((x) => x.em_garantia)) {
    for (const i of o.itens ?? []) {
      const atual = porPeca.get(i.descricao) ?? { descricao: i.descricao, quantidade: 0, custo: 0 };
      atual.quantidade += Number(i.quantidade || 0);
      atual.custo += Number(i.quantidade || 0) * Number(i.produto?.preco_custo ?? 0);
      porPeca.set(i.descricao, atual);
    }
  }
  const pecas = [...porPeca.values()].sort((a, b) => b.custo - a.custo || b.quantidade - a.quantidade);
  return { pecas, quantidade: pecas.reduce((s, x) => s + x.quantidade, 0), custo: Math.round(pecas.reduce((s, x) => s + x.custo, 0) * 100) / 100 };
}

/** Custo médio ponderado das compras (pelas notas); `desde` limita o período (ex.: último ano). */
export function custoMedioCompras(linhas: { evento: string; data: string; quantidade: number | null; valor_unitario: number | null }[], desde?: string) {
  const compras = linhas.filter((l) => l.evento === "compra" && Number(l.quantidade) > 0 && Number(l.valor_unitario) > 0 && (!desde || String(l.data).slice(0, 10) >= desde));
  const qtd = compras.reduce((s, l) => s + Number(l.quantidade), 0);
  if (!qtd) return null;
  return {
    medio: compras.reduce((s, l) => s + Number(l.quantidade) * Number(l.valor_unitario), 0) / qtd, compras: compras.length, quantidade: qtd,
    menor: Math.min(...compras.map((l) => Number(l.valor_unitario))), maior: Math.max(...compras.map((l) => Number(l.valor_unitario))),
  };
}
