// Excluir ordem de compra, de produção ou de serviço feita errada (ou de teste): pede o motivo, tira da lista e guarda
// (dá para restaurar). OC com mercadoria recebida, OP concluída e OS com NFS-e emitida ou valor recebido o banco não deixa.
import { useEffect, useState, type ReactNode } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button, Modal } from "./ui";
import { ExcluirComLigados } from "./ExcluirComLigados";
import { supabase } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";

export type TabelaExcluivel = "pedidos_compra" | "ordens_producao" | "ordens_servico";
const NOME: Record<TabelaExcluivel, string> = { pedidos_compra: "ordem de compra", ordens_producao: "ordem de produção", ordens_servico: "ordem de serviço" };
const SIGLA: Record<TabelaExcluivel, string> = { pedidos_compra: "OC", ordens_producao: "OP", ordens_servico: "OS" };
// o que mais acontece ao excluir (além de sair da lista)
const EFEITO: Record<TabelaExcluivel, ReactNode> = {
  pedidos_compra: null,
  ordens_producao: <p className="mt-2">As ordens de compra desta OP que ainda estão em cotação saem junto (e voltam junto se a OP for restaurada).</p>,
  ordens_servico: <p className="mt-2">As peças que a OS tirou do estoque voltam e a conta a receber em aberto é cancelada. Se for restaurada, a OS volta em aberto (e o pedido que saiu junto volta para a lista).</p>,
};
const RECARREGAR: Record<TabelaExcluivel, string[]> = {
  pedidos_compra: ["pedidos_compra", "pedido_compra_itens"],
  ordens_producao: ["ordens_producao", "necessidade_producao", "pedidos_compra"],
  ordens_servico: ["ordens_servico", "contas_receber", "produtos", "estoque_movimentos"],
};

export function ExcluirDocumento({ tabela, id, numero, onFeito }: { tabela: TabelaExcluivel; id: string; numero?: number | string | null; onFeito?: () => void }) {
  const [aberto, setAberto] = useState(false);
  const invalidar = useInvalidate();
  return (
    <>
      <Button type="button" variant="ghost" className="!px-2 !text-red-600" title={`Excluir a ${NOME[tabela]}`} aria-label={`Excluir a ${SIGLA[tabela]} ${numero ?? ""}`}
        onClick={(e) => { e.stopPropagation(); setAberto(true); }}>
        <Trash2 size={16} aria-hidden />
      </Button>
      {aberto && (
        <ExcluirComLigados tabela={tabela} ids={[id]} titulo={`Excluir a ${SIGLA[tabela]} #${numero ?? ""}`} onClose={() => setAberto(false)}
          onFeito={(r) => {
            notify(`${SIGLA[tabela]} #${numero ?? ""} excluída${r?.ligados ? ` com ${r.ligados} ${r.ligados === 1 ? "documento ligado" : "documentos ligados"}` : ""} (fica guardada em "Excluídas")`);
            invalidar(...RECARREGAR[tabela], "pedidos", "contas_receber", "nfe_recebidas", "envios", "expedicoes");
            onFeito?.();
          }}>
          <p>A {NOME[tabela]} sai da lista e de todas as contas do ERP. Fica guardada com quem excluiu, quando e o motivo, e pode ser restaurada.</p>
          {EFEITO[tabela]}
        </ExcluirComLigados>
      )}
    </>
  );
}

type Excluido = { tabela: TabelaExcluivel; id: string; numero: string; descricao: string; excluida_em: string; excluida_motivo: string | null; excluida_por: string };

/** Lista das OC/OP excluídas, com o motivo e o botão de restaurar. */
export function DocumentosExcluidos({ tabela, onClose }: { tabela: TabelaExcluivel; onClose: () => void }) {
  const [lista, setLista] = useState<Excluido[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const invalidar = useInvalidate();
  const carregar = () => supabase.rpc("documentos_excluidos").then(({ data, error }) => {
    if (error) { notifyError(error); setLista([]); return; }
    setLista(((data ?? []) as Excluido[]).filter((d) => d.tabela === tabela));
  });
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function restaurar(d: Excluido) {
    setOcupado(d.id);
    const { error } = await supabase.rpc("restaurar_documento", { p_tabela: tabela, p_id: d.id });
    setOcupado(null);
    if (error) return notifyError(error);
    notify(`${SIGLA[tabela]} #${d.numero} restaurada`);
    invalidar(...RECARREGAR[tabela]);
    carregar();
  }

  return (
    <Modal open onClose={onClose} title={`${SIGLA[tabela]} excluídas`}>
      {lista === null ? <p className="text-sm text-slate-500">Carregando…</p> : !lista.length ? <p className="text-sm text-slate-500">Nenhuma {NOME[tabela]} excluída.</p> : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {lista.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm [overflow-wrap:anywhere]">
              <b>#{d.numero}</b> <span className="min-w-0 flex-1">{d.descricao}</span>
              <Button type="button" variant="secondary" disabled={ocupado === d.id} onClick={() => restaurar(d)}><RotateCcw size={15} aria-hidden /> Restaurar</Button>
              <span className="w-full text-xs text-slate-500">
                {new Date(d.excluida_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{d.excluida_por ? ` · ${d.excluida_por}` : ""} · motivo: {d.excluida_motivo ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end"><Button type="button" onClick={onClose}>Fechar</Button></div>
    </Modal>
  );
}
