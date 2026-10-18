// Scrum → Como usar → BDD: as boas práticas em palavras simples e as regras reais da MF já escritas em cenários
// (Dado / Quando / Então), que vão para o backlog com critério de aceite, cenários e casos de teste.
import { useState } from "react";
import { BookOpenCheck, ChevronDown, ListPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { gerarTestes } from "@/lib/assistenteItem";
import { BOAS_PRATICAS_BDD, REGRAS_MF, type RegraMf } from "@/lib/cenariosMf";
import { useInvalidate } from "@/lib/data";
import { pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { prioridadeNoFim, type ItemScrum, type TimeScrum } from "@/lib/scrum";

export function BddMf({ time, backlog, todos }: { time: TimeScrum; backlog: ItemScrum[]; todos: ItemScrum[] }) {
  const invalidar = useInvalidate();
  const [ocupado, setOcupado] = useState(false);
  const [vendo, setVendo] = useState<string | null>(null);
  // a regra já está em alguma equipe? (não duplica entre equipes)
  const jaTem = (t: string) => todos.some((i) => i.titulo.trim().toLowerCase() === t.toLowerCase());
  const faltam = REGRAS_MF.filter((r) => !jaTem(r.titulo));

  async function por(lista: RegraMf[]) {
    if (!lista.length) return;
    setOcupado(true);
    let prioridade = prioridadeNoFim(backlog);
    const linhas = lista.map((r) => ({
      time_id: time.id, titulo: r.titulo, tipo: r.tipo, pontos: r.pontos, criterio_aceite: r.criterio,
      descricao: `Regra que o ERP já segue (${r.tela}). Teste cada cenário e marque passou ou falhou.`,
      cenarios: r.cenarios, testes: gerarTestes(r.cenarios), prioridade: (prioridade += 10) - 10,
    }));
    const { error } = await supabase.from("scrum_itens").insert(linhas);
    setOcupado(false);
    if (error) return notifyError(error);
    notify(`${lista.length} ${pl(lista.length, "regra foi", "regras foram")} para o backlog de ${time.nome}, com cenários e casos de teste.`);
    invalidar("scrum_itens");
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <section className="min-w-0 rounded-xl border border-slate-200 p-3">
        <p className="flex items-center gap-1.5 text-sm font-bold text-fg"><BookOpenCheck size={16} className="text-modulo-texto" aria-hidden /> Boas práticas de BDD</p>
        <p className="mb-2 text-xs text-slate-500">BDD = escrever a regra como comportamento, com exemplo, antes de fazer. Assim todo mundo entende e dá para testar.</p>
        <ol className="space-y-1.5 text-sm">
          {BOAS_PRATICAS_BDD.map((p, k) => (
            <li key={p.titulo}>
              <b className="text-fg">{k + 1}. {p.titulo}.</b> <span className="text-slate-600">{p.texto}</span>
              {p.exemplo && <span className="block text-xs text-slate-500">Exemplo: {p.exemplo}</span>}
            </li>
          ))}
        </ol>
      </section>
      <section className="min-w-0 rounded-xl border border-dashed border-slate-300 p-3">
        <p className="text-sm font-bold text-fg">Regras da MF em cenários (prontas para testar)</p>
        <p className="mb-2 text-xs text-slate-500">Cada regra vai para o backlog com critério de aceite, cenários e casos de teste.</p>
        <ul className="space-y-1.5">
          {REGRAS_MF.map((r) => (
            <li key={r.titulo} className="text-sm">
              <div className="flex items-start gap-2">
                <button type="button" onClick={() => setVendo(vendo === r.titulo ? null : r.titulo)} aria-expanded={vendo === r.titulo}
                  className="flex min-w-0 flex-1 items-start gap-1 text-left">
                  <ChevronDown size={15} className={`mt-0.5 shrink-0 text-slate-500 transition ${vendo === r.titulo ? "rotate-180" : ""}`} aria-hidden />
                  <span className="min-w-0">
                    <span className="text-fg">{r.titulo}</span>
                    <span className="block text-xs text-slate-500">{r.tela} · {(r.cenarios.match(/Cenário:/g) ?? []).length} cenários · {r.pontos} pontos</span>
                  </span>
                </button>
                {jaTem(r.titulo)
                  ? <span className="shrink-0 text-xs font-semibold text-emerald-700">no Scrum</span>
                  : <Button type="button" variant="secondary" className="!min-h-0 shrink-0 !px-2 !py-1 text-xs" disabled={ocupado} onClick={() => por([r])}><Plus size={13} aria-hidden /> Pôr</Button>}
              </div>
              {vendo === r.titulo && (
                <pre className="mt-1 overflow-x-auto whitespace-pre rounded-lg bg-slate-50 p-2 font-mono text-2xs leading-relaxed text-slate-700">{r.cenarios}</pre>
              )}
            </li>
          ))}
        </ul>
        {faltam.length > 0 && (
          <Button type="button" className="mt-3 w-full" disabled={ocupado} onClick={() => por(faltam)}>
            <ListPlus size={16} aria-hidden /> Pôr {faltam.length === REGRAS_MF.length ? "todas" : `as ${faltam.length} que faltam`} no backlog
          </Button>
        )}
      </section>
    </div>
  );
}
