import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

/** Lista registros de uma tabela (com select opcional de relacionamentos). */
export function useRows<T = any>(
  table: string,
  opts: { select?: string; order?: string; ascending?: boolean; key?: unknown[] } = {},
) {
  const { select = "*", order = "created_at", ascending = false, key = [] } = opts;
  return useQuery({
    queryKey: [table, select, order, ascending, ...key],
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select(select).order(order, { ascending });
      if (error) throw error;
      // O Supabase devolve no máximo 1000 linhas por consulta: lista maior vem em páginas
      if ((data?.length ?? 0) < PAGINA) return data as T[];
      return (await todasAsPaginas(table, select, order, ascending)) as T[];
    },
  });
}

const PAGINA = 1000;

/** Lê a tabela inteira de 1000 em 1000 (desempate pelo id para nenhuma linha repetir ou faltar entre as páginas). */
async function todasAsPaginas(table: string, select: string, order: string, ascending: boolean) {
  const todas: unknown[] = [];
  let desempate = true;
  for (let de = 0; ; de += PAGINA) {
    let q = supabase.from(table).select(select).order(order, { ascending });
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
