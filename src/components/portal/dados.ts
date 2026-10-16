// Leitura e gravação do portal do representante: tudo pelas funções portal_* do banco (o representante não lê tabelas).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { erroPortal } from "@/lib/portal";

/** Chama uma função do portal; erro vira mensagem em português. */
export async function rpcPortal<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(erroPortal(error.message));
  return data as T;
}

/** Leitura do portal com cache (a chave começa por "portal" para atualizar tudo junto). */
export function usePortal<T>(fn: string, args?: Record<string, unknown>, enabled = true) {
  return useQuery({
    queryKey: ["portal", fn, args ?? null],
    queryFn: () => rpcPortal<T>(fn, args),
    enabled,
    staleTime: 60_000,
  });
}

/** Depois de gravar: lê tudo do portal de novo. */
export function useAtualizarPortal() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["portal"] });
}
