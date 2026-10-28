import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Carregando, ErroLista } from "@/components/ui";
import { ler, useInvalidate } from "@/lib/data";
import { brl, hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";

type Rodada = { id: string; iniciada_em: string; terminada_em: string | null; total: number | null; novos: number | null; principal: string | null; erro: string | null };
type Achado = { chave: string; gravidade: "alta" | "media" | "baixa"; titulo: string; valor: number | null };
const GRAVIDADE = { alta: "Alta", media: "Média", baixa: "Baixa" } as const;
const COR = { alta: "bg-red-500", media: "bg-amber-500", baixa: "bg-slate-400" } as const;
const quando = (s: string) => new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const diaBrasilia = (s: string) => new Date(s).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/** Cartão do topo da Auditoria: a rodada diária do auditor (07:03, sozinha) e os achados novos do dia dela
 * (rodar de novo no mesmo dia não esconde o que apareceu de manhã). */
export function RodadaDiaria({ verAchado }: { verAchado: (chave: string) => void }) {
  const invalidate = useInvalidate();
  // rodar na hora é do financeiro (o contador só vê)
  const { tem } = usePerfil();
  const [rodando, setRodando] = useState(false);
  const q = useQuery({
    queryKey: ["auditor_rodadas", "ultima"],
    queryFn: async () => {
      const r = (await ler(supabase.from("auditor_rodadas").select("id, iniciada_em, terminada_em, total, novos, principal, erro")
        .order("iniciada_em", { ascending: false }).limit(1))) as Rodada[] | null;
      const rodada = r?.[0] ?? null;
      const achados = rodada ? ((await ler(supabase.from("auditor_achados").select("chave, gravidade, titulo, valor")
        .gte("primeira_vez", `${diaBrasilia(rodada.iniciada_em)}T00:00:00-03:00`).eq("ativo", true).limit(200))) as Achado[] | null) ?? [] : [];
      const peso = { alta: 0, media: 1, baixa: 2 };
      return { rodada, novos: achados.sort((a, b) => peso[a.gravidade] - peso[b.gravidade]) };
    },
  });

  async function rodarAgora() {
    setRodando(true);
    try {
      const { data, error } = await supabase.functions.invoke("auditor-diario", { body: {} });
      if (error) throw error;
      notify(`Rodada feita: ${data.novos} ${pl(data.novos, "achado novo", "achados novos")}`);
      invalidate("auditor_rodadas", "auditor_achados");
    } catch (e) { notifyError(e); } finally { setRodando(false); }
  }

  if (q.isLoading) return <Carregando linhas={1} className="mb-4" />;
  if (q.error) return <ErroLista erro={q.error} onTentar={() => q.refetch()} className="mb-4" />;
  const { rodada, novos } = q.data!;
  const deHoje = rodada && diaBrasilia(rodada.iniciada_em) === hoje();
  return (
    <Card className="mb-4 p-cartao">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-fg">
            {!rodada ? "O auditor ainda não rodou" : rodada.erro ? "A última rodada não terminou"
              : `${deHoje ? "Rodada de hoje" : "Última rodada"}: ${novos.length} ${pl(novos.length, "achado novo", "achados novos")}`}
          </h2>
          <p className="text-sm text-slate-500">
            {rodada ? `${quando(rodada.iniciada_em)} · ${rodada.total ?? 0} ${pl(rodada.total ?? 0, "achado", "achados")} no total` : "Ele roda sozinho todo dia às 07:03, só lendo os dados."}
            {rodada?.erro && <span className="block text-red-600">{rodada.erro}</span>}
          </p>
        </div>
        {tem("financeiro") && <Button variant="secondary" carregando={rodando} onClick={rodarAgora}>Rodar agora</Button>}
      </div>
      {novos.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {novos.slice(0, 5).map((a) => (
            <li key={a.chave}>
              <button type="button" className="linha-clicavel flex w-full items-center gap-2 py-2 text-left text-sm" onClick={() => verAchado(a.chave)}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${COR[a.gravidade]}`} aria-hidden />
                <span className="w-12 shrink-0 text-xs text-slate-500">{GRAVIDADE[a.gravidade]}</span>
                <span className="min-w-0 flex-1 truncate text-fg">{a.titulo}</span>
                {a.valor != null && <span className="shrink-0 text-slate-500">{brl(Number(a.valor))}</span>}
              </button>
            </li>
          ))}
          {novos.length > 5 && <li className="py-2 text-xs text-slate-500">e mais {novos.length - 5} na aba Exceções.</li>}
        </ul>
      )}
    </Card>
  );
}
