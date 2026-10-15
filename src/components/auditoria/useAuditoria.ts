// Leituras da auditoria usadas pelo painel e pela busca do histórico (só leitura, nada é gravado).
import { useMemo } from "react";
import { useRows } from "@/lib/data";
import type { LinhaAuditoria } from "@/components/Historico";
import {
  chaveNome, inicioDoDia, mapaNomes, somarDiasData,
  type ConsultaHistorico, type FiltrosExcecoes, type FiltrosHistorico, type FontesNomes,
} from "@/lib/auditoriaBusca";

const NENHUM: never[] = [];

/** Para onde o painel leva: a aba e os filtros já escolhidos. */
export type Destino =
  | { aba: "painel" | "checklist" }
  | { aba: "excecoes"; filtros?: Partial<FiltrosExcecoes> }
  | { aba: "historico"; filtros?: Partial<FiltrosHistorico> };

/**
 * Linhas do histórico do período. O painel e a busca usam a mesma chave para os últimos 30 dias:
 * abrir a lista pelo painel não baixa tudo de novo.
 */
export function useHistorico(c: ConsultaHistorico) {
  const r = useRows<LinhaAuditoria>("auditoria", {
    key: ["historico", c.de, c.ate, c.acoes?.join(",") ?? "todas"],
    filtro: (q) => {
      let x = q;
      if (c.de) x = x.gte("created_at", inicioDoDia(c.de));
      if (c.ate) x = x.lt("created_at", inicioDoDia(somarDiasData(c.ate, 1)));
      if (c.acoes) x = x.in("acao", c.acoes);
      return x;
    },
  });
  return { ...r, linhas: r.data ?? (NENHUM as LinhaAuditoria[]) };
}

/**
 * Nome atual de cada registro, porque a alteração só guarda os campos que mudaram (sem a descrição).
 * Contas, pedidos, produtos, fornecedores, usuários e bancos já vêm das exceções; os clientes são lidos aqui.
 */
export function useNomesRegistros(fontes: Omit<FontesNomes, "clientes">) {
  const { data: clientes = NENHUM } = useRows<{ id: string; nome: string; nome_fantasia: string | null }>("clientes", {
    select: "id, nome, nome_fantasia", order: "nome", ascending: true, key: ["auditoria-nomes"],
  });
  return useMemo(() => {
    const m = mapaNomes({ ...fontes, clientes });
    return (tabela: string, id: string | null) => m.get(chaveNome(tabela, id));
  }, [fontes, clientes]);
}
