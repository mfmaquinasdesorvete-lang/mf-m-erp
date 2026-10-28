import { useRows } from "@/lib/data";

const NENHUM: never[] = [];

const SITUACAO: Record<string, string> = { indicio: "Em análise", confirmado: "Erro confirmado", resolvido: "Resolvido", descartado: "Descartado" };

/** Quem mudou a situação da exceção, quando e com qual evidência (vem do histórico do banco, que ninguém edita). */
export function HistoricoTratativa({ id }: { id: string }) {
  const { data: linhas = NENHUM } = useRows<any>("auditoria", {
    select: "id, acao, usuario_nome, antes, depois, created_at", filtro: (q) => q.eq("tabela", "auditoria_excecoes").eq("registro_id", id), key: ["tratativa", id],
  });
  if (!linhas.length) return null;
  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      <div className="mb-2 text-xs font-semibold text-slate-500">Histórico da tratativa</div>
      <ul className="space-y-1 text-xs text-slate-600">
        {linhas.map((l: any) => (
          <li key={l.id}>
            <b>{new Date(l.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</b> · {l.usuario_nome ?? "usuário"} ·{" "}
            {/* na alteração o histórico guarda só os campos que mudaram */}
            {l.acao === "insert" ? `abriu como ${SITUACAO[l.depois?.situacao] ?? "—"}`
              : l.depois?.situacao ? `mudou para ${SITUACAO[l.depois.situacao] ?? l.depois.situacao}${l.antes?.situacao ? ` (era ${SITUACAO[l.antes.situacao] ?? l.antes.situacao})` : ""}` : "atualizou"}
            {l.depois?.observacao ? ` · "${l.depois.observacao}"` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
