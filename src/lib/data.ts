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
      return data as T[];
    },
  });
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
