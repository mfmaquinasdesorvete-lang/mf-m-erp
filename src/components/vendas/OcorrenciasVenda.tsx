// Ocorrências do pedido de venda (como no Tiny): anotações com data, hora e quem escreveu — combinado com o cliente,
// pedido de troca, atraso, ligação feita… Excluir só quando Configurações → Pedidos permitir (fica na auditoria).
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquareText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { ler } from "@/lib/data";
import { dataHoraBR } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { confirmar } from "@/components/Dialogos";

type Ocorrencia = { id: string; pedido_id: string; texto: string; autor: string | null; autor_nome: string | null; created_at: string };

export function OcorrenciasVenda({ pedidoId, podeExcluir }: { pedidoId: string; podeExcluir: boolean }) {
  const { tem } = usePerfil();
  const escreve = tem("vendas", "financeiro", "expedicao");
  const exclui = podeExcluir && tem("vendas", "financeiro");
  const [texto, setTexto] = useState("");
  const [gravando, setGravando] = useState(false);
  const { data: lista = [], refetch } = useQuery({
    queryKey: ["pedido_ocorrencias", pedidoId],
    queryFn: async () => ((await ler(supabase.from("pedido_ocorrencias").select("*").eq("pedido_id", pedidoId).order("created_at", { ascending: false }))) ?? []) as Ocorrencia[],
  });

  async function incluir(e: FormEvent) {
    e.preventDefault();
    if (texto.trim().length < 2) return;
    setGravando(true);
    const { error } = await supabase.from("pedido_ocorrencias").insert({ pedido_id: pedidoId, texto: texto.trim() });
    setGravando(false);
    if (error) return notifyError(error);
    setTexto("");
    refetch();
  }

  async function excluir(o: Ocorrencia) {
    if (!(await confirmar(`Excluir a ocorrência de ${dataHoraBR(o.created_at)}? Ela fica no histórico da auditoria.`))) return;
    const { error } = await supabase.from("pedido_ocorrencias").delete().eq("id", o.id);
    if (error) return notifyError(error);
    notify("Ocorrência excluída");
    refetch();
  }

  return (
    <section className="rounded-xl border border-slate-200 p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <MessageSquareText size={16} className="text-modulo" aria-hidden />
        <h3 className="font-bold text-fg">Ocorrências do pedido</h3>
        {lista.length > 0 && <span className="text-xs text-slate-500">{lista.length}</span>}
      </div>
      {escreve && (
        <form onSubmit={incluir} className="mb-2 flex gap-2">
          <input className="input" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000} placeholder="Ex.: cliente pediu para entregar à tarde" aria-label="Nova ocorrência" />
          <Button disabled={gravando || texto.trim().length < 2}>Incluir</Button>
        </form>
      )}
      {lista.length ? (
        <ul className="space-y-1.5">
          {lista.map((o) => (
            <li key={o.id} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2">
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-slate-500"><b className="num text-slate-700">{dataHoraBR(o.created_at)}</b>{o.autor_nome ? ` · ${o.autor_nome}` : ""}</span>
                <span className="block whitespace-pre-wrap break-words text-slate-800">{o.texto}</span>
              </span>
              {exclui && (
                <button type="button" onClick={() => excluir(o)} className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700" title="Excluir ocorrência" aria-label="Excluir ocorrência">
                  <Trash2 size={15} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="text-slate-500">Nenhuma ocorrência ainda.</p>}
    </section>
  );
}
