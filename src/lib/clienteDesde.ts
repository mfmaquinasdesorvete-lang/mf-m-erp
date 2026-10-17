// "Cliente desde": a data real em que a pessoa virou cliente, não a data em que o cadastro entrou no ERP.
// Vem da view public.clientes_desde: o mais antigo entre o cadastro no Tiny, compra da máquina, 1ª venda, 1ª NF-e, proposta,
// notas da My Frost, máquina vendida, OS e NFS-e; sem nada disso, a data do cadastro no ERP ("importado" quando veio de
// importação: aí não é data real e o cliente não conta como novo).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";

export const FONTE_DESDE: Record<string, string> = {
  tiny: "cadastro no Tiny", importado: "importação para o ERP (sem a data do Tiny)", compra_maquina: "compra da máquina", venda: "1ª venda", nfe: "1ª NF-e", proposta: "1ª proposta", my_frost: "compra na My Frost",
  maquina: "máquina vendida", os: "1ª ordem de serviço", nfse: "1ª NFS-e", cadastro: "cadastro no ERP",
};

export type ClienteDesde = { cliente_id: string; desde: string; fonte: string };
/** Data que vale para "cliente novo": a importação não é a data em que a pessoa virou cliente. */
export const desdeReal = (d: Pick<ClienteDesde, "fonte"> | null | undefined) => !!d && d.fonte !== "importado";

/** Data real e de onde ela veio; sem a view (ou erro), fica nulo e a tela usa a data do cadastro. */
export function useClienteDesde(id: string | null | undefined) {
  return useQuery({
    queryKey: ["clientes_desde", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes_desde").select("cliente_id, desde, fonte").eq("cliente_id", id!).maybeSingle();
      return error ? null : ((data as ClienteDesde | null) ?? null);
    },
  });
}
