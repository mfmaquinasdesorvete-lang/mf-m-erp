import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { Config } from "./types";

/** Configurações da empresa (dados para PDFs, garantia, comissão). */
export function useConfig() {
  return useQuery({
    queryKey: ["configuracoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("configuracoes").select("*").eq("id", 1).single();
      if (error) throw error;
      return data as Config & Record<string, any>;
    },
  });
}
