import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

/** Lista registros de uma tabela (com select opcional de relacionamentos). */
export function useRows<T = any>(
  table: string,
  opts: { select?: string; order?: string; ascending?: boolean; key?: unknown[]; filtro?: Filtro } = {},
) {
  const { select = "*", order = "created_at", ascending = false, key = [], filtro } = opts;
  return useQuery({
    queryKey: [table, select, order, ascending, ...key],
    // O Supabase devolve no máximo 1000 linhas por consulta: lista maior vem em páginas (a 1ª já é a página 1)
    queryFn: async () => (await todasAsPaginas(table, select, order, ascending, filtro)) as T[],
  });
}

/** Filtro feito no servidor (ex.: só um mês, só algumas tabelas): a tela baixa só o que usa. Use junto uma `key`. */
type Filtro = (q: any) => any;
const aplicar = (q: any, filtro?: Filtro) => (filtro ? filtro(q) : q);

const PAGINA = 1000;

/** Resultado de uma consulta do Supabase; se deu erro, lança (a tela mostra o aviso em vez de "lista vazia"). */
export async function ler<T>(consulta: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  const { data, error } = await consulta;
  if (error) throw error;
  return data;
}

/** Lê a tabela inteira de 1000 em 1000 (desempate pelo id para nenhuma linha repetir ou faltar entre as páginas). */
async function todasAsPaginas(table: string, select: string, order: string, ascending: boolean, filtro?: Filtro) {
  const todas: unknown[] = [];
  let desempate = true;
  for (let de = 0; ; de += PAGINA) {
    let q = aplicar(supabase.from(table).select(select), filtro).order(order, { ascending });
    if (desempate) q = q.order("id", { ascending: true });
    const { data, error } = await q.range(de, de + PAGINA - 1);
    if (error && desempate && de === 0) { desempate = false; de -= PAGINA; continue; } // tabela sem coluna id
    if (error) throw error;
    todas.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGINA) return todas;
  }
}

/** Insere (sem id) ou atualiza (com id) um registro e invalida o cache da tabela. */
export function useSave(table: string, invalidate: string[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Record<string, any>) => {
      const { id, ...rest } = row;
      const q = id
        ? supabase.from(table).update(rest).eq("id", id).select().single()
        : supabase.from(table).insert(rest).select().single();
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    onSuccess: () => [table, ...invalidate].forEach((t) => qc.invalidateQueries({ queryKey: [t] })),
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...tables: string[]) => tables.forEach((t) => qc.invalidateQueries({ queryKey: [t] }));
}

/** Converte strings vazias em null antes de gravar. */
export const limpar = <T extends Record<string, any>>(row: T): T =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === "" ? null : v])) as T;

/** Tira os cadastros repetidos já unificados (fornecedores e transportadoras arquivados). Mesma lista → mesmo resultado. */
const cacheSemUnificados = new WeakMap<object, unknown[]>();
export function semUnificados<T>(lista: T[]): T[] {
  const unificado = (x: T) => !!(x as { unificado_em?: string | null }).unificado_em;
  let r = cacheSemUnificados.get(lista) as T[] | undefined;
  if (!r) { r = lista.some(unificado) ? lista.filter((x) => !unificado(x)) : lista; cacheSemUnificados.set(lista, r); }
  return r;
}
