// Notas excluídas (feitas erradas): ficam guardadas com quem excluiu, quando e por quê, e podem ser restauradas.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore } from "lucide-react";
import { Button, Table } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { brl, dataBR } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import type { TabelaNota } from "./Marcadores";

type Excluida = { id: string; numero: string | null; chave: string | null; nome: string | null; valor: number; status: string; emissao: string; excluida_em: string; excluida_motivo: string; excluida_por: string | null };

export function useExcluidas(tabela: TabelaNota, ativo = true) {
  return useQuery({
    queryKey: [tabela, "excluidas"],
    enabled: ativo,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("notas_excluidas", { p_tabela: tabela });
      if (error) throw error;
      return (data ?? []) as Excluida[];
    },
  });
}

export function Excluidas({ tabela }: { tabela: TabelaNota }) {
  const { data = [], isLoading } = useExcluidas(tabela);
  const qc = useQueryClient();

  async function restaurar(id: string) {
    const { error } = await supabase.rpc("restaurar_nota", { p_tabela: tabela, p_id: id });
    if (error) return notifyError(error);
    notify("Nota restaurada");
    qc.invalidateQueries({ queryKey: [tabela] });
  }

  return (
    <>
      <p className="mb-3 text-sm text-slate-500">Notas excluídas não aparecem nas listas, no contador nem nos relatórios. Ficam aqui com o motivo.</p>
      <Table empty={!isLoading && !data.length}
        head={<><th className="th">Nº</th><th className="th">Emissão</th><th className="th">{tabela === "nfe_recebidas" ? "Fornecedor" : "Destinatário"}</th><th className="th text-right">Valor</th><th className="th">Excluída</th><th className="th" /></>}>
        {data.map((n) => (
          <tr key={n.id}>
            <td className="td">{n.numero ?? "—"}</td>
            <td className="td">{dataBR(n.emissao)}</td>
            <td className="td">{n.nome ?? "—"}<div className="text-xs text-slate-500">{n.status}</div></td>
            <td className="td text-right">{brl(n.valor)}</td>
            <td className="td text-sm">{dataBR(n.excluida_em)} · {n.excluida_por ?? "—"}<div className="text-xs text-amber-700">{n.excluida_motivo}</div></td>
            <td className="td text-right"><Button type="button" variant="ghost" onClick={() => restaurar(n.id)}><ArchiveRestore size={15} /> Restaurar</Button></td>
          </tr>
        ))}
      </Table>
    </>
  );
}
