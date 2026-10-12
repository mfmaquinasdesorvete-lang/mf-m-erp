// Estrutura de produto em vários níveis (mesma regra das funções estrutura_consumo e custo_estrutura do banco).
// Subconjunto = item da ficha que tem a própria ficha. "Montado junto" (padrão): a produção usa as peças dele;
// "com estoque próprio" (subconjunto_estocado): a produção consome o subconjunto pronto, que tem OP própria.

export type LinhaFicha = { produto_id: string; componente_id: string; quantidade: number };
type ProdutoEstrutura = { id: string; preco_custo?: number | null; subconjunto_estocado?: boolean | null };

const LIMITE = 15;

export const filhos = (fichas: LinhaFicha[], id: string) => fichas.filter((f) => f.produto_id === id);
export const temFicha = (fichas: LinhaFicha[], id: string) => fichas.some((f) => f.produto_id === id);

/** O que a produção de `qtd` unidades consome: peças compradas e subconjuntos com estoque próprio. */
export function consumoEstrutura(fichas: LinhaFicha[], produtos: ProdutoEstrutura[], produtoId: string, qtd: number) {
  const out = new Map<string, number>();
  const estocado = (id: string) => !!produtos.find((p) => p.id === id)?.subconjunto_estocado;
  const descer = (id: string, mult: number, caminho: string[]) => {
    for (const f of filhos(fichas, id)) {
      if (caminho.includes(f.componente_id) || caminho.length > LIMITE) continue;
      const q = mult * Number(f.quantidade);
      if (temFicha(fichas, f.componente_id) && !estocado(f.componente_id)) descer(f.componente_id, q, [...caminho, f.componente_id]);
      else out.set(f.componente_id, (out.get(f.componente_id) ?? 0) + q);
    }
  };
  descer(produtoId, qtd, [produtoId]);
  return out;
}

/** Custo de uma unidade somando as peças de todos os níveis (subconjunto entra pelo custo das peças dele). */
export function custoEstrutura(fichas: LinhaFicha[], produtos: ProdutoEstrutura[], produtoId: string, caminho: string[] = []): number {
  if (caminho.includes(produtoId) || caminho.length > LIMITE) return 0;
  const lista = filhos(fichas, produtoId);
  if (!lista.length) return Number(produtos.find((p) => p.id === produtoId)?.preco_custo ?? 0);
  return lista.reduce((s, f) => s + Number(f.quantidade) * custoEstrutura(fichas, produtos, f.componente_id, [...caminho, produtoId]), 0);
}

/** `alvo` aparece em algum nível da estrutura de `raiz` (ou é a própria raiz). Evita ficha que dá volta. */
export function contemNaEstrutura(fichas: LinhaFicha[], raiz: string, alvo: string, caminho: string[] = []): boolean {
  if (raiz === alvo) return true;
  if (caminho.includes(raiz) || caminho.length > LIMITE) return false;
  return filhos(fichas, raiz).some((f) => contemNaEstrutura(fichas, f.componente_id, alvo, [...caminho, raiz]));
}

/** Quantos níveis a estrutura tem (1 = só peças). */
export function niveis(fichas: LinhaFicha[], id: string, caminho: string[] = []): number {
  if (caminho.includes(id) || caminho.length > LIMITE) return 0;
  const lista = filhos(fichas, id);
  if (!lista.length) return 0;
  return 1 + Math.max(...lista.map((f) => niveis(fichas, f.componente_id, [...caminho, id])));
}
