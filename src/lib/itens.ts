// Gravação dos itens de um documento (OS, pedido de compra, ficha técnica, transferência) sem "apagar tudo e gravar de novo":
// primeiro atualiza o que continua e grava o que entrou, só no fim tira o que saiu. Se a internet cair no meio,
// nenhum item some (no pior caso sobra um item que a pessoa tira de novo) e a quantidade já recebida não é perdida.
import { supabase } from "./supabase";

type Linha = Record<string, unknown>;

export type SincronizarOpcoes = {
  /** Coluna que identifica o item quando ele não tem id (ex.: componente_id na ficha técnica, que é única por produto). */
  chaveNatural?: string;
  /** Colunas que não podem ser sobrescritas ao atualizar um item que já existe (ex.: quantidade_recebida). */
  preservar?: string[];
};

/**
 * Deixa os itens do documento iguais à lista da tela.
 * @param tabela tabela dos itens (ex.: "os_itens")
 * @param chave coluna que liga o item ao documento (ex.: "os_id")
 * @param paiId id do documento
 * @param itens lista da tela (itens já gravados têm id)
 * @param linha monta a linha a gravar a partir do item da tela
 * @returns os ids dos itens na mesma ordem da lista (para a tela guardar e não duplicar ao salvar de novo)
 */
export async function sincronizarItens<T extends { id?: string | null }>(
  tabela: string, chave: string, paiId: string, itens: T[], linha: (i: T) => Linha, opcoes: SincronizarOpcoes = {},
): Promise<string[]> {
  const { chaveNatural, preservar = [] } = opcoes;
  const colunas = ["id", ...(chaveNatural ? [chaveNatural] : [])].join(", ");
  const { data: atuais, error: erroLer } = await supabase.from(tabela).select(colunas).eq(chave, paiId);
  if (erroLer) throw erroLer;
  const existentes = (atuais ?? []) as unknown as Linha[];
  const usados = new Set<string>();
  const alvo = itens.map((i) => {
    // item da tela que corresponde a uma linha que já está gravada
    let atual = i.id ? existentes.find((x) => x.id === i.id && !usados.has(String(x.id))) : undefined;
    if (!atual && chaveNatural) {
      const valor = linha(i)[chaveNatural];
      atual = existentes.find((x) => x[chaveNatural] === valor && !usados.has(String(x.id)));
    }
    if (atual) usados.add(String(atual.id));
    return { item: i, id: atual ? String(atual.id) : null };
  });

  const ids: (string | null)[] = alvo.map((a) => a.id);
  // 1) o que continua: atualiza (sem mexer nas colunas preservadas)
  for (const a of alvo.filter((x) => x.id)) {
    const dados = { ...linha(a.item), [chave]: paiId };
    for (const c of preservar) delete dados[c];
    const { error } = await supabase.from(tabela).update(dados).eq("id", a.id!);
    if (error) throw error;
  }
  // 2) o que entrou: grava de uma vez
  const novos = alvo.map((a, k) => ({ a, k })).filter((x) => !x.a.id);
  if (novos.length) {
    const { data: criados, error } = await supabase.from(tabela).insert(novos.map((x) => ({ ...linha(x.a.item), [chave]: paiId }))).select("id");
    if (error) throw error;
    novos.forEach((x, j) => { ids[x.k] = (criados?.[j] as { id?: string } | undefined)?.id ?? null; });
  }
  // 3) só agora tira o que saiu
  const remover = existentes.map((x) => String(x.id)).filter((id) => !usados.has(id));
  if (remover.length) {
    const { error } = await supabase.from(tabela).delete().in("id", remover);
    if (error) throw error;
  }
  return ids.map((id) => id ?? "");
}

/**
 * Cria um documento novo com os itens. Se os itens não gravarem, o cabeçalho que acabou de nascer é desfeito
 * (para não ficar documento vazio na lista) e o erro original aparece para a pessoa.
 */
export async function criarComItens<P extends Linha>(
  tabelaPai: string, dadosPai: P, tabelaItens: string, chave: string, itens: Linha[],
  desfazer?: (id: string, motivo: string) => PromiseLike<unknown>,
): Promise<{ id: string; numero?: number | string | null }> {
  const { data: pai, error } = await supabase.from(tabelaPai).insert(dadosPai).select("id, numero").single();
  if (error) throw error;
  const doc = pai as { id: string; numero?: number | string | null };
  if (!itens.length) return doc;
  const { error: erroItens } = await supabase.from(tabelaItens).insert(itens.map((i) => ({ ...i, [chave]: doc.id })));
  if (!erroItens) return doc;
  const motivo = `Itens não foram gravados (${erroItens.message})`;
  const { error: erroApagar } = await supabase.from(tabelaPai).delete().eq("id", doc.id);
  if (erroApagar && desfazer) await Promise.resolve(desfazer(doc.id, motivo)).catch(() => undefined);
  throw erroItens;
}

/** Pedido de compra que nasceu sem itens: quem não pode apagar tira da lista como "excluída", com o motivo. */
export const desfazerCompra = async (id: string, motivo: string) =>
  await supabase.rpc("excluir_documento", { p_tabela: "pedidos_compra", p_id: id, p_motivo: motivo });
