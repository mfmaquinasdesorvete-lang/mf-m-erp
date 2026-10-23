import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { usarLogoEmpresa } from "./marca";
import { aplicarAparencia } from "./aparencia";
import type { Config } from "./types";

/** Configurações da empresa (dados para PDFs, garantia, comissão). */
export function useConfig() {
  const q = useQuery({
    queryKey: ["configuracoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("configuracoes").select("*").eq("id", 1).single();
      if (error) throw error;
      return data as Config & Record<string, any>;
    },
  });
  // logo dos PDFs e ícone da aba: os que a empresa enviou em Configurações → Empresa
  useEffect(() => { if (q.data) usarLogoEmpresa(q.data.logo_url ?? null, q.data.icone_url ?? null); }, [q.data?.logo_url, q.data?.icone_url]); // eslint-disable-line react-hooks/exhaustive-deps
  // cores, fontes e imagens da empresa (Sobre → Design): antes da coluna existir no banco, fica a aparência padrão
  const aparencia = JSON.stringify(q.data?.aparencia ?? null);
  useEffect(() => { if (q.data && "aparencia" in q.data) aplicarAparencia(q.data.aparencia); }, [aparencia]); // eslint-disable-line react-hooks/exhaustive-deps
  return q;
}
