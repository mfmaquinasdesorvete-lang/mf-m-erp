// Excluir documento levando junto os ligados (pedido de 24/10): antes de excluir, mostra o que nasceu dele ou o gerou
// (OS ↔ pedido de venda, pedido → separações, envios e contas em aberto, OP → OC em cotação, OC → notas de entrada),
// cada um com uma caixinha já marcada, e exclui tudo com o mesmo motivo (excluir_com_ligados, tudo ou nada).
// O que está travado (nota autorizada, valor recebido, estoque lançado) aparece sem caixinha, com o porquê.
import { useEffect, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { MotivoAcao } from "./MotivoAcao";
import { supabase } from "@/lib/supabase";

export type Ligado = { tabela: string; id: string; rotulo: string; detalhe?: string | null; bloqueio?: string | null; automatico?: boolean };
export type ResultadoExclusao = { ligados: number; pedidos: { excluidos: number; pulados: { numero: number; motivo: string }[] } | null };

export function ExcluirComLigados({ tabela, ids, titulo, children, onClose, onFeito }: {
  tabela: "pedidos" | "ordens_servico" | "ordens_producao" | "pedidos_compra"; ids: string[]; titulo: string; children?: ReactNode;
  onClose: () => void; onFeito: (r: ResultadoExclusao) => void;
}) {
  const [ligados, setLigados] = useState<Ligado[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const chave = (l: Ligado) => `${l.tabela}:${l.id}`;

  useEffect(() => {
    supabase.rpc("documentos_ligados", { p_tabela: tabela, p_ids: ids }).then(({ data, error }) => {
      // sem a função no banco (ou sem acesso): exclui só o documento, como antes
      const lista = error ? [] : ((data ?? []) as Ligado[]);
      setLigados(lista);
      setMarcados(new Set(lista.filter((l) => !l.bloqueio).map(chave)));
    });
  }, [tabela, ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const alternar = (l: Ligado) => setMarcados((s) => { const n = new Set(s); if (n.has(chave(l))) n.delete(chave(l)); else n.add(chave(l)); return n; });

  return (
    <MotivoAcao titulo={titulo} rotulo={marcados.size ? `Excluir (+${marcados.size} ${marcados.size === 1 ? "ligado" : "ligados"})` : "Excluir"} perigo onClose={onClose}
      onConfirmar={async (motivo) => {
        const escolhidos = (ligados ?? []).filter((l) => marcados.has(chave(l)) && !l.automatico).map((l) => ({ tabela: l.tabela, id: l.id }));
        const { data, error } = await supabase.rpc("excluir_com_ligados", { p_tabela: tabela, p_ids: ids, p_motivo: motivo, p_ligados: escolhidos });
        if (error) throw error;
        onFeito(data as ResultadoExclusao);
      }}>
      {children}
      {ligados === null ? <p className="text-xs text-slate-500">Procurando os documentos ligados…</p> : ligados.length > 0 && (
        <div className="rounded-lg border border-slate-200 p-2.5">
          <p className="mb-1.5 text-xs font-semibold text-slate-700">Sai junto (mesmo motivo; desmarque o que deve ficar):</p>
          <ul className="space-y-1">
            {ligados.map((l) => (
              <li key={chave(l)} className="flex items-start gap-2 text-sm">
                {l.bloqueio ? <Lock size={15} className="mt-0.5 shrink-0 text-slate-400" aria-hidden />
                  : <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={marcados.has(chave(l))} disabled={l.automatico}
                      onChange={() => alternar(l)} aria-label={`Excluir junto: ${l.rotulo}`} />}
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span className={l.bloqueio ? "text-slate-500" : "text-fg"}>{l.rotulo}</span>
                  {l.detalhe && <span className="text-xs text-slate-500"> · {l.detalhe}</span>}
                  {l.bloqueio && <span className="block text-xs text-amber-700">fica: {l.bloqueio}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </MotivoAcao>
  );
}
