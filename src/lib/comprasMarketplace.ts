// Notas de fornecedor compradas em marketplace (lidas do XML no banco: public.compras_marketplace).
// Usado na tela Compras em marketplaces e nos filtros das notas recebidas e dos fornecedores.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useRows } from "./data";
import { digitos } from "./format";
import { marketplaceDaNota, type Marketplace } from "./marketplaces";

export type NotaIntermediada = { nota_id: string; intermediador_cnpj: string | null; loja_usuario: string | null; pedido: string | null; citado: string | null };

export function useComprasMarketplace(ativo = true) {
  const q = useQuery({
    queryKey: ["compras_marketplace"],
    enabled: ativo,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("compras_marketplace");
      if (error) throw error;
      return (data ?? []) as NotaIntermediada[];
    },
  });
  const porNota = useMemo(() => new Map((q.data ?? []).map((r) => [r.nota_id, marketplaceDaNota(r) ?? "outro"] as const)), [q.data]);
  return { linhas: q.data ?? [], porNota, erro: q.error as Error | null };
}

/** CNPJs dos fornecedores que venderam para a MF por marketplace, com o marketplace de cada um. */
export function useLojasDeMarketplace() {
  const { porNota } = useComprasMarketplace();
  const { data: notas = [] } = useRows<{ id: string; emitente_cnpj: string | null }>("nfe_recebidas", { select: "id, emitente_cnpj", order: "data_emissao", key: ["lojas-marketplace"] });
  return useMemo(() => {
    const m = new Map<string, Marketplace>();
    for (const n of notas) {
      const mk = porNota.get(n.id);
      if (mk && n.emitente_cnpj) m.set(digitos(n.emitente_cnpj), mk);
    }
    return m;
  }, [notas, porNota]);
}
