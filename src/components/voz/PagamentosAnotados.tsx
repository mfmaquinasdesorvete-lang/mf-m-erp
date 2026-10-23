// Bancos e conciliação: os pagamentos que a equipe anotou por voz ("a cliente tal pagou a vídeo chamada") e ainda não
// foram conferidos, com as entradas do extrato que podem ser esse pagamento (mesmo valor, até 3 dias antes da fala).
// "É este" marca a anotação como conferida com a entrada do banco; a baixa da conta segue na conciliação da linha.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Mic } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { brl, dataBR, dataHoraBR } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import type { AnotacaoVoz } from "@/lib/anotacoesVoz";

type Entrada = { id: string; data: string; valor: number; descricao: string | null };
const dia = (iso: string, menos: number) => new Date(new Date(iso).getTime() - menos * 864e5).toISOString().slice(0, 10);

export function PagamentosAnotados() {
  const qc = useQueryClient();
  const { data: anotados = [] } = useQuery({
    queryKey: ["anotacoes_voz", "pagamentos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("anotacoes_voz").select("*").eq("tipo", "pagamento_video").eq("situacao", "pendente")
        .order("criado_em", { ascending: false }).limit(20);
      if (error) throw error;
      return data as AnotacaoVoz[];
    },
  });
  const valores = [...new Set(anotados.map((a) => Number(a.valor)).filter((v) => v > 0))];
  const desde = anotados.length ? dia(anotados[anotados.length - 1].criado_em, 3) : null;
  const { data: entradas = [] } = useQuery({
    queryKey: ["extrato_lancamentos", "anotados", valores.join(","), desde],
    enabled: valores.length > 0 && !!desde,
    queryFn: async () => {
      const { data, error } = await supabase.from("extrato_lancamentos").select("id, data, valor, descricao")
        .eq("status", "pendente").in("valor", valores).gte("data", desde!).order("data").limit(100);
      if (error) throw error;
      return data as Entrada[];
    },
  });
  if (!anotados.length) return null;

  async function conferir(a: AnotacaoVoz, e?: Entrada) {
    const resposta = e ? `Entrada do banco de ${brl(e.valor)} em ${dataBR(e.data)}${e.descricao ? ` (${e.descricao})` : ""}` : null;
    const { error } = await supabase.rpc("conferir_anotacao_voz", { p_id: a.id, p_situacao: "conferido", p_resposta: resposta });
    if (error) { notifyError(error); return; }
    qc.invalidateQueries({ queryKey: ["anotacoes_voz"] });
    notify("Pagamento conferido: agora dê a baixa na linha do extrato");
  }

  return (
    <Card className="mb-5 p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
        <Mic className="h-4 w-4 text-brand" /> Pagamentos anotados por voz, para conferir no banco ({anotados.length})
        <Link to="/anotacoes" className="ml-auto text-xs font-semibold text-slate-500 hover:underline">Ver todas</Link>
      </p>
      <ul className="divide-y divide-slate-100 text-sm">
        {anotados.map((a) => {
          const possiveis = a.valor ? entradas.filter((e) => Number(e.valor) === Number(a.valor) && e.data >= dia(a.criado_em, 3)) : [];
          return (
            <li key={a.id} className="py-2">
              <p className="font-semibold text-fg">{a.resumo}{a.valor ? ` · ${brl(a.valor)}` : ""}</p>
              <p className="text-xs text-slate-500">🎤 {a.criado_por_nome ?? "—"} · {dataHoraBR(a.criado_em)}{a.ref_rotulo ? ` · ${a.ref_rotulo}` : ""}</p>
              {possiveis.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {possiveis.slice(0, 4).map((e) => (
                    <button key={e.id} type="button" onClick={() => conferir(a, e)}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">
                      <Check className="h-3.5 w-3.5" /> É este: {dataBR(e.data)} · {brl(e.valor)}{e.descricao ? ` · ${e.descricao.slice(0, 40)}` : ""}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-xs text-slate-500">{a.valor ? "Nenhuma entrada pendente com esse valor ainda." : "Sem valor falado: procure no extrato abaixo."}</p>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
